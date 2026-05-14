/**
 * 音乐鉴赏课学生评价系统 - 主服务器
 * Express + Socket.io + SQLite
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const path = require('path');

// 加载配置
const config = require('./config');

// 初始化数据库
const { initDatabase, insertSampleData, getDatabase } = require('./db/init');
initDatabase();
insertSampleData();

// 清理重复的模拟课堂（只保留最新的一个）
// 同时在评分参数变更时清理旧数据，让seed重新生成
try {
  const db = getDatabase();
  
  // 删除所有模拟课堂数据（评分参数变了，需要重新生成）
  const mockClassrooms = db.prepare("SELECT id FROM classrooms WHERE name = '贝多芬音乐鉴赏专题'").all();
  
  if (mockClassrooms.length > 0) {
    const deleteAnswers = db.prepare(`DELETE FROM answers WHERE question_id IN (SELECT id FROM questions WHERE classroom_id = ?)`);
    const deleteQuestions = db.prepare('DELETE FROM questions WHERE classroom_id = ?');
    const deleteCS = db.prepare('DELETE FROM classroom_students WHERE classroom_id = ?');
    const deleteOld = db.prepare('DELETE FROM classrooms WHERE id = ?');
    
    db.transaction(() => {
      for (const row of mockClassrooms) {
        deleteAnswers.run(row.id);
        deleteQuestions.run(row.id);
        deleteCS.run(row.id);
        deleteOld.run(row.id);
      }
    })();
    
    console.log(`已清理 ${mockClassrooms.length} 个模拟课堂（评分参数更新，需重新生成）`);
  }
} catch(e) {
  console.error('清理重复课堂失败:', e.message);
}

// 创建Express应用
const app = express();

// 信任反向代理（Zeabur等云平台使用HTTPS代理，Express需信任才能正确设置cookie）
app.set('trust proxy', 1);

const server = http.createServer(app);

// 配置Socket.io
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// 将io实例传递给路由
app.set('io', io);

// 中间件配置
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session配置
app.use(session({
  secret: 'music-eval-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 24小时
    httpOnly: true,
    secure: true,    // HTTPS环境必须
    sameSite: 'none' // 跨域情况必须
  }
}));

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// 路由配置
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const teacherRoutes = require('./routes/teacher');
const studentRoutes = require('./routes/student');

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/teacher', teacherRoutes);
app.use('/api/student', studentRoutes);

// 页面路由
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/teacher', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'teacher.html'));
});

app.get('/classroom/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'classroom.html'));
});

app.get('/answer/:sessionId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'answer.html'));
});

app.get('/student/profile', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'student.html'));
});

// 根路径重定向到登录页
app.get('/', (req, res) => {
  res.redirect('/login');
});

// ============ Socket.io 实时通信 ============

io.on('connection', (socket) => {
  console.log('Socket连接建立:', socket.id);
  
  // 加入课堂
  socket.on('join-classroom', (data) => {
    const { classroomId, userId, userName, role } = data;
    const roomName = `classroom:${classroomId}`;
    
    socket.join(roomName);
    console.log(`${userName}(${role})加入了课堂${classroomId}`);
    
    // 广播用户加入
    socket.to(roomName).emit('user-joined', {
      userId,
      userName,
      role,
      timestamp: new Date().toISOString()
    });
    
    // 发送当前课堂统计
    const db = getDatabase();
    const stats = getClassroomStats(db, classroomId);
    socket.emit('classroom-stats', stats);
  });
  
  // 离开课堂
  socket.on('leave-classroom', (data) => {
    const { classroomId, userId, userName } = data;
    const roomName = `classroom:${classroomId}`;
    
    socket.leave(roomName);
    console.log(`${userName}离开了课堂${classroomId}`);
    
    socket.to(roomName).emit('user-left', {
      userId,
      userName,
      timestamp: new Date().toISOString()
    });
  });
  
  // 心跳检测
  socket.on('ping', () => {
    socket.emit('pong', { timestamp: Date.now() });
  });
  
  socket.on('disconnect', () => {
    console.log('Socket连接断开:', socket.id);
  });
});

// 获取课堂统计的辅助函数
function getClassroomStats(db, classroomId) {
  try {
    const studentCount = db.prepare('SELECT COUNT(*) as count FROM classroom_students WHERE classroom_id = ?').get(classroomId).count;
    
    const questions = db.prepare(`
      SELECT id, (SELECT COUNT(*) FROM answers WHERE question_id = q.id) as answer_count
      FROM questions q
      WHERE q.classroom_id = ? AND ended_at IS NULL
    `).all(classroomId);
    
    const currentQuestion = questions[0] || null;
    
    return {
      studentCount,
      currentQuestionId: currentQuestion ? currentQuestion.id : null,
      currentQuestionAnswerCount: currentQuestion ? currentQuestion.answer_count : 0,
      totalAnswers: questions.reduce((sum, q) => sum + q.answer_count, 0)
    };
  } catch (error) {
    console.error('获取课堂统计错误:', error);
    return {
      studentCount: 0,
      currentQuestionId: null,
      currentQuestionAnswerCount: 0,
      totalAnswers: 0
    };
  }
}

// ============ 错误处理 ============

// 404处理
app.use((req, res) => {
  res.status(404).send('<h1>404 - 页面未找到</h1><p><a href="/login">返回登录</a></p>');
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).send('<h1>500 - 服务器错误</h1><p>请稍后再试</p>');
});

// ============ 启动服务器 ============

const PORT = config.server.port;
const HOST = config.server.host;

server.listen(PORT, HOST, () => {
  console.log('='.repeat(50));
  console.log('🎵 音乐鉴赏课学生评价系统');
  console.log('='.repeat(50));
  console.log(`🚀 服务器已启动: http://${HOST}:${PORT}`);
  console.log(`📱 学生端入口: http://${HOST}:${PORT}/login`);
  console.log('='.repeat(50));
  console.log('默认账号:');
  console.log('  管理员: admin / admin123');
  console.log('  教师: teacher01 / teacher123');
  console.log('='.repeat(50));
  if (config.ai.enabled) {
    console.log('✅ AI评价已启用');
  } else {
    console.log('⚠️  AI评价未启用（将使用关键词评分）');
    console.log('   如需启用AI评价，请配置环境变量:');
    console.log('   AI_ENABLED=true AI_API_KEY=your-key');
  }
  console.log('='.repeat(50));
});

// 服务器启动后，如果设置了 SEED_MOCK_DATA 环境变量，异步灌入模拟数据
// 必须在 listen 之后执行，否则同步的 SQLite 操作会阻塞事件循环导致服务无法响应
if (process.env.SEED_MOCK_DATA === 'true') {
  console.log('🔄 检测到 SEED_MOCK_DATA=true，正在灌入模拟数据...');
  try {
    const { seed } = require('./seed-local');
    const db = getDatabase();
    // 用 setImmediate 让事件循环先处理完当前队列
    setImmediate(() => {
      seed(db).then(() => {
        console.log('✅ 模拟数据灌入完成！');
      }).catch(err => {
        console.error('❌ 模拟数据灌入失败:', err.message);
      });
    });
  } catch (err) {
    console.error('❌ 加载seed-local模块失败:', err.message);
  }
}
