/**
 * 教师路由
 * 处理教师相关的操作：课堂管理、问题发布、评价查看、数据看板
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const router = express.Router();
const { getDatabase } = require('../db/init');
const config = require('../config');

// 中间件：检查教师权限（支持session和token两种认证方式）
function requireTeacher(req, res, next) {
  // 优先检查session
  if (req.session.user && req.session.user.role === 'teacher') {
    return next();
  }
  
  // 其次检查Authorization header中的token
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.substring(7);
      const decoded = Buffer.from(token, 'base64').toString();
      // token格式: role:id:timestamp
      const [role] = decoded.split(':');
      if (role === 'teacher') {
        // 从token解析出用户信息，附加到req上
        const parts = decoded.split(':');
        req.sessionUser = { role: parts[0], id: parseInt(parts[1]) };
        return next();
      }
    } catch (e) {
      // token解析失败，忽略
    }
  }
  
  return res.status(401).json({ success: false, message: '无权限访问' });
}

router.use(requireTeacher);

// ============ 模块管理 ============

// 获取当前教师的所有模块（含每个模块下的任务列表）
router.get('/modules', (req, res) => {
  const user = req.sessionUser || req.session.user;
  const db = getDatabase();
  
  try {
    // 获取所有模块
    const modules = db.prepare(`
      SELECT * FROM modules
      WHERE teacher_id = ?
      ORDER BY sort_order ASC, created_at ASC
    `).all(user.id);
    
    // 获取每个模块下的任务（课堂）
    const modulesWithTasks = modules.map(module => {
      const tasks = db.prepare(`
        SELECT c.*, 
               (SELECT COUNT(DISTINCT a.student_id) FROM answers a JOIN questions q ON a.question_id = q.id WHERE q.classroom_id = c.id) as student_count,
               (SELECT COUNT(*) FROM questions WHERE classroom_id = c.id) as question_count
        FROM classrooms c
        WHERE c.module_id = ?
        ORDER BY c.created_at DESC
      `).all(module.id);
      
      return {
        ...module,
        tasks: tasks
      };
    });
    
    res.json({ success: true, data: modulesWithTasks });
  } catch (error) {
    console.error('获取模块列表错误:', error);
    res.json({ success: false, message: '获取失败' });
  }
});

// 创建模块
router.post('/modules', (req, res) => {
  const user = req.sessionUser || req.session.user;
  const { name, description } = req.body;
  
  if (!name) {
    return res.json({ success: false, message: '请填写模块名称' });
  }
  
  const db = getDatabase();
  
  try {
    // 获取当前最大排序值
    const maxOrder = db.prepare('SELECT MAX(sort_order) as maxOrder FROM modules WHERE teacher_id = ?').get(user.id);
    const sortOrder = (maxOrder?.maxOrder ?? -1) + 1;
    
    const result = db.prepare(`
      INSERT INTO modules (teacher_id, name, description, sort_order)
      VALUES (?, ?, ?, ?)
    `).run(user.id, name, description || null, sortOrder);
    
    res.json({ 
      success: true, 
      message: '模块创建成功', 
      data: { 
        id: result.lastInsertRowid, 
        name, 
        description, 
        sort_order: sortOrder,
        tasks: []
      } 
    });
  } catch (error) {
    console.error('创建模块错误:', error);
    res.json({ success: false, message: '创建失败' });
  }
});

// 更新模块
router.put('/modules/:id', (req, res) => {
  const { id } = req.params;
  const user = req.sessionUser || req.session.user;
  const { name, description } = req.body;
  
  if (!name) {
    return res.json({ success: false, message: '请填写模块名称' });
  }
  
  const db = getDatabase();
  
  try {
    // 验证模块归属
    const module = db.prepare('SELECT * FROM modules WHERE id = ? AND teacher_id = ?').get(id, user.id);
    if (!module) {
      return res.json({ success: false, message: '模块不存在' });
    }
    
    db.prepare(`
      UPDATE modules SET name = ?, description = ? WHERE id = ? AND teacher_id = ?
    `).run(name, description || null, id, user.id);
    
    res.json({ success: true, message: '模块更新成功' });
  } catch (error) {
    console.error('更新模块错误:', error);
    res.json({ success: false, message: '更新失败' });
  }
});

// 删除模块
router.delete('/modules/:id', (req, res) => {
  const { id } = req.params;
  const user = req.sessionUser || req.session.user;
  const db = getDatabase();
  
  try {
    // 验证模块归属
    const module = db.prepare('SELECT * FROM modules WHERE id = ? AND teacher_id = ?').get(id, user.id);
    if (!module) {
      return res.json({ success: false, message: '模块不存在' });
    }
    
    // 检查模块下是否有任务
    const taskCount = db.prepare('SELECT COUNT(*) as count FROM classrooms WHERE module_id = ?').get(id);
    if (taskCount.count > 0) {
      return res.json({ 
        success: false, 
        message: `该模块下有 ${taskCount.count} 个任务，请先删除或移动任务后再删除模块`,
        taskCount: taskCount.count
      });
    }
    
    db.prepare('DELETE FROM modules WHERE id = ? AND teacher_id = ?').run(id, user.id);
    
    res.json({ success: true, message: '模块删除成功' });
  } catch (error) {
    console.error('删除模块错误:', error);
    res.json({ success: false, message: '删除失败' });
  }
});

// 调整模块排序
router.patch('/modules/:id/order', (req, res) => {
  const { id } = req.params;
  const user = req.sessionUser || req.session.user;
  const { sortOrder } = req.body;
  
  if (sortOrder === undefined || sortOrder === null) {
    return res.json({ success: false, message: '请提供排序值' });
  }
  
  const db = getDatabase();
  
  try {
    // 验证模块归属
    const module = db.prepare('SELECT * FROM modules WHERE id = ? AND teacher_id = ?').get(id, user.id);
    if (!module) {
      return res.json({ success: false, message: '模块不存在' });
    }
    
    db.prepare('UPDATE modules SET sort_order = ? WHERE id = ?').run(sortOrder, id);
    
    res.json({ success: true, message: '排序更新成功' });
  } catch (error) {
    console.error('更新模块排序错误:', error);
    res.json({ success: false, message: '更新失败' });
  }
});

// ============ 课堂管理 ============

// 获取教师的课堂列表（按模块分组）
router.get('/classrooms', (req, res) => {
  const user = req.sessionUser || req.session.user;
  const db = getDatabase();
  
  try {
    // 获取所有模块
    const modules = db.prepare(`
      SELECT * FROM modules
      WHERE teacher_id = ?
      ORDER BY sort_order ASC, created_at ASC
    `).all(user.id);
    
    // 获取未归类的课堂（module_id为NULL）
    const uncategorizedClassrooms = db.prepare(`
      SELECT c.*, 
             (SELECT COUNT(DISTINCT a.student_id) FROM answers a JOIN questions q ON a.question_id = q.id WHERE q.classroom_id = c.id) as student_count,
             (SELECT COUNT(*) FROM questions WHERE classroom_id = c.id) as question_count
      FROM classrooms c
      WHERE c.teacher_id = ? AND c.module_id IS NULL
      ORDER BY c.created_at DESC
    `).all(user.id);
    
    // 获取每个模块下的课堂
    const result = modules.map(module => {
      const tasks = db.prepare(`
        SELECT c.*, 
               (SELECT COUNT(DISTINCT a.student_id) FROM answers a JOIN questions q ON a.question_id = q.id WHERE q.classroom_id = c.id) as student_count,
               (SELECT COUNT(*) FROM questions WHERE classroom_id = c.id) as question_count
        FROM classrooms c
        WHERE c.module_id = ?
        ORDER BY c.created_at DESC
      `).all(module.id);
      
      return {
        ...module,
        tasks: tasks
      };
    });
    
    res.json({ 
      success: true, 
      data: {
        modules: result,
        uncategorized: uncategorizedClassrooms
      }
    });
  } catch (error) {
    console.error('获取课堂列表错误:', error);
    res.json({ success: false, message: '获取失败' });
  }
});

// 创建课堂（任务）
router.post('/classrooms', (req, res) => {
  const user = req.sessionUser || req.session.user;
  const { name, description, classId, moduleId } = req.body;
  
  if (!name) {
    return res.json({ success: false, message: '请填写课堂名称' });
  }
  
  const db = getDatabase();
  
  try {
    // 如果提供了moduleId，验证模块归属
    if (moduleId) {
      const module = db.prepare('SELECT * FROM modules WHERE id = ? AND teacher_id = ?').get(moduleId, user.id);
      if (!module) {
        return res.json({ success: false, message: '模块不存在' });
      }
    }
    
    const sessionId = uuidv4().replace(/-/g, '').substring(0, 12);
    
    const result = db.prepare(`
      INSERT INTO classrooms (session_id, name, description, teacher_id, class_id, module_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(sessionId, name, description || null, user.id, classId || null, moduleId || null);
    
    // 生成二维码
    const joinUrl = `${config.frontend.baseUrl}/answer/${sessionId}`;
    
    QRCode.toDataURL(joinUrl, { width: 300, margin: 2 }, (err, qrCode) => {
      if (err) {
        return res.json({ success: true, message: '创建成功', data: { id: result.lastInsertRowid, sessionId, qrCode: null, joinUrl } });
      }
      res.json({ success: true, message: '创建成功', data: { id: result.lastInsertRowid, sessionId, qrCode, joinUrl } });
    });
  } catch (error) {
    console.error('创建课堂错误:', error);
    res.json({ success: false, message: '创建失败' });
  }
});

// 移动课堂到指定模块
router.patch('/classrooms/:id/module', (req, res) => {
  const { id } = req.params;
  const user = req.sessionUser || req.session.user;
  const { moduleId } = req.body;
  
  const db = getDatabase();
  
  try {
    // 验证课堂归属
    const classroom = db.prepare('SELECT * FROM classrooms WHERE id = ? AND teacher_id = ?').get(id, user.id);
    if (!classroom) {
      return res.json({ success: false, message: '课堂不存在' });
    }
    
    // 如果提供了moduleId，验证模块归属
    if (moduleId) {
      const module = db.prepare('SELECT * FROM modules WHERE id = ? AND teacher_id = ?').get(moduleId, user.id);
      if (!module) {
        return res.json({ success: false, message: '模块不存在' });
      }
    }
    
    db.prepare('UPDATE classrooms SET module_id = ? WHERE id = ?').run(moduleId || null, id);
    
    res.json({ success: true, message: '移动成功' });
  } catch (error) {
    console.error('移动课堂错误:', error);
    res.json({ success: false, message: '移动失败' });
  }
});

// 获取课堂详情
router.get('/classrooms/:id', (req, res) => {
  const { id } = req.params;
  const user = req.sessionUser || req.session.user;
  const db = getDatabase();
  
  try {
    const classroom = db.prepare(`
      SELECT c.*, t.nickname as teacher_name
      FROM classrooms c
      JOIN teachers t ON c.teacher_id = t.id
      WHERE c.id = ? AND c.teacher_id = ?
    `).get(id, user.id);
    
    if (!classroom) {
      return res.json({ success: false, message: '课堂不存在' });
    }
    
    // 获取已加入的学生（从实际回答过问题的学生中获取，不依赖classroom_students）
    const students = db.prepare(`
      SELECT DISTINCT s.id, s.name, s.student_number, s.class_id, 
             MIN(a.evaluated_at) as join_time
      FROM students s
      JOIN answers a ON a.student_id = s.id
      JOIN questions q ON a.question_id = q.id
      WHERE q.classroom_id = ?
      GROUP BY s.id
    `).all(id);
    
    // 获取问题列表
    const questions = db.prepare(`
      SELECT q.*,
             (SELECT COUNT(*) FROM answers WHERE question_id = q.id) as answer_count,
             (SELECT AVG(total_score) FROM answers WHERE question_id = q.id) as avg_score
      FROM questions q
      WHERE q.classroom_id = ?
      ORDER BY q.created_at DESC
    `).all(id);
    
    // 对问题avg_score做归一化（100分制）
    questions.forEach(q => {
      const dims = q.dimensions ? JSON.parse(q.dimensions) : ['perception', 'emotion', 'culture', 'aesthetic', 'expression'];
      const maxScore = dims.length * 10;
      q.normalized_avg_score = (q.avg_score !== null && maxScore > 0) 
        ? Math.round((q.avg_score / maxScore) * 100 * 10) / 10 
        : 0;
    });
    
    // 获取二维码（重新生成）
    const joinUrl = `${config.frontend.baseUrl}/answer/${classroom.session_id}`;
    QRCode.toDataURL(joinUrl, { width: 300, margin: 2 }, (err, qrCode) => {
      res.json({
        success: true,
        data: {
          ...classroom,
          student_count: students.length,
          qrCode: qrCode || null,
          joinUrl,
          students,
          questions
        }
      });
    });
  } catch (error) {
    console.error('获取课堂详情错误:', error);
    res.json({ success: false, message: '获取失败' });
  }
});

// 结束课堂
router.post('/classrooms/:id/end', (req, res) => {
  const { id } = req.params;
  const user = req.sessionUser || req.session.user;
  const db = getDatabase();
  
  try {
    db.prepare(`
      UPDATE classrooms 
      SET status = 'ended', ended_at = CURRENT_TIMESTAMP 
      WHERE id = ? AND teacher_id = ?
    `).run(id, user.id);
    
    res.json({ success: true, message: '课堂已结束' });
  } catch (error) {
    console.error('结束课堂错误:', error);
    res.json({ success: false, message: '操作失败' });
  }
});

// 删除课堂
router.delete('/classrooms/:id', (req, res) => {
  const { id } = req.params;
  const user = req.sessionUser || req.session.user;
  const db = getDatabase();
  
  try {
    // 先删除关联数据
    const questions = db.prepare('SELECT id FROM questions WHERE classroom_id = ?').all(id);
    for (const q of questions) {
      db.prepare('DELETE FROM answers WHERE question_id = ?').run(q.id);
    }
    db.prepare('DELETE FROM questions WHERE classroom_id = ?').run(id);
    db.prepare('DELETE FROM classroom_students WHERE classroom_id = ?').run(id);
    db.prepare('DELETE FROM classrooms WHERE id = ? AND teacher_id = ?').run(id, user.id);
    
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    console.error('删除课堂错误:', error);
    res.json({ success: false, message: '删除失败' });
  }
});

// ============ 问题管理 ============

// 发布新问题（支持音频题）
router.post('/questions', (req, res) => {
  const audioUpload = req.app.get('audioUpload');
  
  audioUpload.single('reference_audio')(req, res, (err) => {
    if (err) {
      console.error('音频上传错误:', err.message);
      return res.json({ success: false, message: '文件上传失败: ' + err.message });
    }
    
    const { classroomId, content, dimensions, questionType } = req.body;
    const user = req.sessionUser || req.session.user;
    
    if (!user) {
      return res.json({ success: false, message: '请先登录' });
    }
    
    const db = getDatabase();
    
    try {
      // 验证课堂归属
      const classroom = db.prepare('SELECT * FROM classrooms WHERE id = ? AND teacher_id = ?').get(classroomId, user.id);
      if (!classroom) {
        return res.json({ success: false, message: '课堂不存在' });
      }
      
      if (classroom.status !== 'active') {
        return res.json({ success: false, message: '课堂已结束，无法发布问题' });
      }
      
      // 至少选择一个维度
      if (!dimensions || dimensions.length === 0) {
        return res.json({ success: false, message: '请至少选择一个评分维度' });
      }
      
      const type = questionType || 'text';
      const refAudio = req.file ? `/uploads/audio/${req.file.filename}` : null;
      
      const result = db.prepare(
        'INSERT INTO questions (classroom_id, content, dimensions, question_type, reference_audio) VALUES (?, ?, ?, ?, ?)'
      ).run(classroomId, content, JSON.stringify(dimensions), type, refAudio);
      
      // 通过Socket.io广播新问题
      const io = req.app.get('io');
      if (io) {
        io.to(`classroom:${classroomId}`).emit('new-question', {
          questionId: result.lastInsertRowid,
          content,
          dimensions,
          questionType: type,
          referenceAudio: refAudio,
          createdAt: new Date().toISOString()
        });
      }
      
      res.json({
        success: true,
        message: '问题已发布',
        data: { id: result.lastInsertRowid, questionType: type, referenceAudio: refAudio }
      });
    } catch (error) {
      console.error('发布问题错误:', error);
      res.json({ success: false, message: '发布失败' });
    }
  });
});

// 结束当前问题
router.post('/questions/:id/end', (req, res) => {
  const { id } = req.params;
  const db = getDatabase();
  
  try {
    db.prepare('UPDATE questions SET ended_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
    res.json({ success: true, message: '问题已结束' });
  } catch (error) {
    console.error('结束问题错误:', error);
    res.json({ success: false, message: '操作失败' });
  }
});

// 删除问题（及其所有回答）
router.delete('/questions/:id', (req, res) => {
  const { id } = req.params;
  const user = req.sessionUser || req.session.user;
  const db = getDatabase();
  
  try {
    // 验证问题归属当前教师
    const question = db.prepare(`
      SELECT q.* FROM questions q
      JOIN classrooms c ON q.classroom_id = c.id
      WHERE q.id = ? AND c.teacher_id = ?
    `).get(id, user.id);
    
    if (!question) {
      return res.json({ success: false, message: '问题不存在或无权限' });
    }
    
    // 删除该问题的所有回答
    db.prepare('DELETE FROM answers WHERE question_id = ?').run(id);
    // 删除问题
    db.prepare('DELETE FROM questions WHERE id = ?').run(id);
    
    res.json({ success: true, message: '问题已删除' });
  } catch (error) {
    console.error('删除问题错误:', error);
    res.json({ success: false, message: '删除失败' });
  }
});

// ============ 评价查看 ============

// 获取问题的回答列表
router.get('/questions/:id/answers', (req, res) => {
  const { id } = req.params;
  const db = getDatabase();
  
  try {
    const answers = db.prepare(`
      SELECT a.*, s.name as student_name, s.student_number
      FROM answers a
      JOIN students s ON a.student_id = s.id
      WHERE a.question_id = ?
      ORDER BY a.total_score DESC, a.evaluated_at ASC
    `).all(id);
    
    // 解析JSON字段
    answers.forEach(a => {
      if (a.dimensions) {
        try {
          a.dimensions = JSON.parse(a.dimensions);
        } catch (e) {}
      }
    });
    
    res.json({ success: true, data: answers });
  } catch (error) {
    console.error('获取回答列表错误:', error);
    res.json({ success: false, message: '获取失败' });
  }
});

// 获取课堂统计数据
router.get('/classrooms/:id/stats', (req, res) => {
  const { id } = req.params;
  const user = req.sessionUser || req.session.user;
  const db = getDatabase();
  
  try {
    // 验证课堂归属
    const classroom = db.prepare('SELECT * FROM classrooms WHERE id = ? AND teacher_id = ?').get(id, user.id);
    if (!classroom) {
      return res.json({ success: false, message: '课堂不存在' });
    }
    
    // 获取学生数量 - 从实际回答过问题的学生中统计，不依赖classroom_students
    const studentCount = db.prepare(`
      SELECT COUNT(DISTINCT a.student_id) as count 
      FROM answers a 
      JOIN questions q ON a.question_id = q.id 
      WHERE q.classroom_id = ?
    `).get(id).count;
    
    // 获取问题列表（带回答统计）
    const questions = db.prepare(`
      SELECT q.*,
             (SELECT COUNT(*) FROM answers WHERE question_id = q.id) as answer_count,
             (SELECT AVG(total_score) FROM answers WHERE question_id = q.id) as avg_score,
             (SELECT MAX(total_score) FROM answers WHERE question_id = q.id) as max_score,
             (SELECT MIN(total_score) FROM answers WHERE question_id = q.id) as min_score
      FROM questions q
      WHERE q.classroom_id = ?
      ORDER BY q.created_at DESC
    `).all(id);
    
    // 对问题的avg_score/max_score/min_score做归一化（按维度满分计算百分制）
    questions.forEach(q => {
      const dims = q.dimensions ? JSON.parse(q.dimensions) : ['perception', 'emotion', 'culture', 'aesthetic', 'expression'];
      const dimCount = dims.length;
      const maxScore = dimCount * 10; // 该题满分
      if (dimCount > 0 && q.avg_score !== null) {
        q.normalized_avg_score = Math.round((q.avg_score / maxScore) * 100 * 10) / 10;
        q.normalized_max_score = Math.round((q.max_score / maxScore) * 100 * 10) / 10;
        q.normalized_min_score = Math.round((q.min_score / maxScore) * 100 * 10) / 10;
      } else {
        q.normalized_avg_score = 0;
        q.normalized_max_score = 0;
        q.normalized_min_score = 0;
      }
    });
    
    // 获取维度平均分（只计算选中维度的得分）
    const allAnswers = db.prepare(`
      SELECT a.dimensions, a.total_score, q.dimensions as question_dimensions
      FROM answers a
      JOIN questions q ON a.question_id = q.id
      WHERE q.classroom_id = ?
    `).all(id);
    
    const dimensionTotals = { perception: 0, emotion: 0, culture: 0, aesthetic: 0, expression: 0 };
    const dimensionCounts = { perception: 0, emotion: 0, culture: 0, aesthetic: 0, expression: 0 };
    
    allAnswers.forEach(a => {
      try {
        const dims = JSON.parse(a.dimensions);
        const questionDims = a.question_dimensions ? JSON.parse(a.question_dimensions) : ['perception', 'emotion', 'culture', 'aesthetic', 'expression'];
        for (const key of questionDims) {
          if (dims[key] !== undefined) {
            dimensionTotals[key] += dims[key];
            dimensionCounts[key]++;
          }
        }
      } catch (e) {}
    });
    
    const dimensionAvgs = {};
    for (const key in dimensionTotals) {
      if (dimensionCounts[key] > 0) {
        dimensionAvgs[key] = Math.round((dimensionTotals[key] / dimensionCounts[key]) * 10) / 10;
      } else {
        dimensionAvgs[key] = 0;
      }
    }
    
    // 计算每个学生的课堂总评（100分制）
    // 获取所有有回答的学生（不依赖classroom_students）
    const students = db.prepare(`
      SELECT DISTINCT s.* FROM students s
      JOIN answers a ON a.student_id = s.id
      JOIN questions q ON a.question_id = q.id
      WHERE q.classroom_id = ?
    `).all(id);
    
    const studentTotalScores = [];
    const questionCount = questions.length;
    
    if (questionCount > 0) {
      // 获取每个学生的所有回答
      const studentAnswers = db.prepare(`
        SELECT a.*, q.dimensions as question_dimensions
        FROM answers a
        JOIN questions q ON a.question_id = q.id
        WHERE q.classroom_id = ?
        ORDER BY a.student_id, a.question_id
      `).all(id);
      
      // 按学生分组，计算每个学生的每题得分率
      const answersByStudent = {};
      studentAnswers.forEach(a => {
        if (!answersByStudent[a.student_id]) {
          answersByStudent[a.student_id] = [];
        }
        answersByStudent[a.student_id].push(a);
      });
      
      // 先计算每道题的维度满分（用于归一化）
      // 每个维度满分10分，每题满分 = 维度数 * 10
      const questionMaxScores = {};
      questions.forEach(q => {
        const dims = q.dimensions ? JSON.parse(q.dimensions) : ['perception', 'emotion', 'culture', 'aesthetic', 'expression'];
        questionMaxScores[q.id] = dims.length * 10;
      });
      
      // 每题权重：100分 / 题目数
      const questionWeight = 100 / questionCount;
      
      // 计算每个学生的课堂总评
      for (const student of students) {
        const answers = answersByStudent[student.id] || [];
        if (answers.length === 0) {
          studentTotalScores.push({
            studentId: student.id,
            studentName: student.name,
            studentNumber: student.student_number,
            totalScore: 0,
            questionCount: 0
          });
          continue;
        }
        
        // 每道题的得分率 × 题目权重，求和得到总评
        let totalScore = 0;
        let validAnswerCount = 0;
        
        for (const answer of answers) {
          try {
            const dims = JSON.parse(answer.dimensions);
            const questionDims = answer.question_dimensions ? JSON.parse(answer.question_dimensions) : ['perception', 'emotion', 'culture', 'aesthetic', 'expression'];
            const maxScore = questionMaxScores[answer.question_id] || 50;
            
            // 计算该题选中维度的得分之和
            let dimSum = 0;
            for (const dim of questionDims) {
              if (dims[dim] !== undefined) {
                dimSum += dims[dim];
              }
            }
            
            // 得分率 = 实际分 / 该题满分
            const scoreRate = dimSum / maxScore;
            // 该题贡献 = 得分率 × 题目权重
            totalScore += scoreRate * questionWeight;
            validAnswerCount++;
          } catch (e) {}
        }
        
        // 如果学生没回答所有题目，按实际回答数按比例计算
        const finalScore = validAnswerCount > 0 
          ? Math.round((totalScore / validAnswerCount * questionCount) * 10) / 10
          : 0;
        
        studentTotalScores.push({
          studentId: student.id,
          studentName: student.name,
          studentNumber: student.student_number,
          totalScore: finalScore,
          questionCount: validAnswerCount
        });
      }
    } else {
      // 没有问题时，课堂总评为0
      students.forEach(student => {
        studentTotalScores.push({
          studentId: student.id,
          studentName: student.name,
          studentNumber: student.student_number,
          totalScore: 0,
          questionCount: 0
        });
      });
    }
    
    // 获取所有回答（用于生成词云）
    const allAnswerTexts = db.prepare(`
      SELECT a.content FROM answers a
      JOIN questions q ON a.question_id = q.id
      WHERE q.classroom_id = ?
    `).all(id);
    
    res.json({
      success: true,
      data: {
        studentCount,
        questions,
        dimensionAvgs,
        answerTexts: allAnswerTexts.map(a => a.content),
        studentTotalScores // 每个学生的课堂总评（100分制）
      }
    });
  } catch (error) {
    console.error('获取统计数据错误:', error);
    res.json({ success: false, message: '获取失败' });
  }
});

// ============ 词云分析 ============

// 维度名称映射
const DIMENSION_NAMES = {
  perception: '音乐感知力',
  emotion: '情感理解力',
  culture: '文化认知',
  aesthetic: '审美判断',
  expression: '表达规范'
};

// 中文停用词列表
const STOP_WORDS = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去',
  '你', '会', '着', '没有', '看', '好', '自己', '这', '他', '她', '它', '们', '那', '些', '什么', '怎么', '这个', '那个',
  '可以', '因为', '所以', '但是', '而且', '或者', '如果', '虽然', '已经', '就是', '只是', '还是', '这样', '那样',
  '觉得', '认为', '感觉', '知道', '可能', '应该', '能够', '需要', '通过', '进行', '使用', '以及', '其中', '关于',
  '对于', '作为', '之间', '与', '为', '以', '而', '把', '被', '让', '给', '向', '从', '由', '对', '将', '把', '还',
  '更', '最', '非常', '特别', '十分', '比较', '相当', '极', '之', '其', '此', '每', '各', '某', '所', '等等', '等',
  '一下', '一点', '一些', '一边', '一面', '一会儿', '起来', '出来', '过来', '下来', '上去', '进去', '回来', '过去',
  '开始', '进行', '完成', '成为', '发生', '出现', '存在', '具有', '形成', '表现', '体现', '展现', '呈现', '展示'
]);

// 简单中文分词 - 基于2-4字的n-gram提取
function extractKeywords(texts, topN = 50) {
  const wordCount = {};
  
  texts.forEach(text => {
    if (!text) return;
    
    // 清理文本
    const cleaned = text.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ').trim();
    const chars = cleaned.replace(/\s+/g, '');
    
    // 提取2-4字的词
    for (let len = 2; len <= 4; len++) {
      for (let i = 0; i <= chars.length - len; i++) {
        const word = chars.substring(i, i + len);
        
        // 跳过包含停用词的词（但保留完整匹配的音乐关键词）
        if (STOP_WORDS.has(word) && word.length === 2) continue;
        
        // 如果词包含停用词作为开头或结尾，跳过
        if (len === 2 && STOP_WORDS.has(word)) continue;
        
        wordCount[word] = (wordCount[word] || 0) + 1;
      }
    }
  });
  
  // 过滤掉频次太低的词
  const filtered = Object.entries(wordCount)
    .filter(([word, count]) => count >= 2 && word.length >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN);
  
  return filtered.map(([name, value]) => ({ name, value }));
}

// 获取问题的词云数据 - 区分优势与不足
router.get('/questions/:id/wordcloud', (req, res) => {
  const { id } = req.params;
  const db = getDatabase();
  
  try {
    // 获取该问题的所有回答
    const answers = db.prepare(`
      SELECT content, evaluation FROM answers
      WHERE question_id = ?
    `).all(id);
    
    if (!answers || answers.length === 0) {
      return res.json({ 
        success: true, 
        data: { 
          strengths: [], 
          weaknesses: [],
          dimensionOverview: []
        } 
      });
    }
    
    // 统计AI评价关键词频次（基于维度评价结论，而非学生回答内容）
    const strengthWords = {};
    const weaknessWords = {};
    
    // 维度得分收集（用于概览）
    const dimensionScores = {};
    
    // 维度评价描述映射
    const DIM_EVAL_TERMS = {
      perception: {
        name: '音乐感知力',
        strengthTerms: ['节奏感知准确', '旋律辨识清晰', '音色辨别敏锐', '力度变化感知', '音乐要素把握'],
        weaknessTerms: ['节奏感知不足', '旋律辨识模糊', '音色辨别弱', '力度变化忽略', '音乐要素缺失']
      },
      emotion: {
        name: '情感理解力',
        strengthTerms: ['情感表达准确', '意境理解深入', '情绪体验丰富', '情感共鸣强烈', '音乐情感把握'],
        weaknessTerms: ['情感表达欠缺', '意境理解肤浅', '情绪体验单一', '情感共鸣不足', '音乐情感缺失']
      },
      culture: {
        name: '文化认知',
        strengthTerms: ['文化背景了解', '时代特征把握', '风格辨识准确', '历史关联清晰', '跨文化理解'],
        weaknessTerms: ['文化背景薄弱', '时代特征模糊', '风格辨识困难', '历史关联缺失', '文化理解不足']
      },
      aesthetic: {
        name: '审美判断',
        strengthTerms: ['审美评价到位', '美感能力突出', '审美视角独特', '审美标准清晰', '审美表达准确'],
        weaknessTerms: ['审美评价空泛', '美感能力不足', '审美视角单一', '审美标准模糊', '审美表达欠缺']
      },
      expression: {
        name: '表达规范',
        strengthTerms: ['语言表达准确', '结构清晰完整', '用词专业规范', '论述逻辑严密', '表达流畅连贯'],
        weaknessTerms: ['语言表达模糊', '结构松散混乱', '用词不够专业', '论述缺乏逻辑', '表达不够流畅']
      }
    };
    
    // 解析每条回答的 evaluation
    answers.forEach(answer => {
      try {
        if (answer.evaluation) {
          const evaluation = typeof answer.evaluation === 'string' 
            ? JSON.parse(answer.evaluation) 
            : answer.evaluation;
          
          // 修正：evaluation可能直接就是对象
          const evalObj = evaluation;
          
          if (evalObj && evalObj.dimensionDetails) {
            Object.entries(evalObj.dimensionDetails).forEach(([dimKey, dimData]) => {
              const score = dimData.dimensionScore || 0;
              const dimInfo = DIM_EVAL_TERMS[dimKey];
              
              // 收集维度得分
              if (!dimensionScores[dimKey]) dimensionScores[dimKey] = [];
              dimensionScores[dimKey].push(score);
              
              if (dimInfo) {
                // 维度名称作为核心关键词（频次=学生数）
                const dimName = dimInfo.name;
                
                if (score >= 6) {
                  // 优势：维度名称 + 随机选1-2个优势评价词
                  strengthWords[dimName] = (strengthWords[dimName] || 0) + 1;
                  // 根据得分高低选不同数量的评价词
                  const termCount = score >= 8 ? 3 : (score >= 7 ? 2 : 1);
                  const selectedTerms = dimInfo.strengthTerms.slice(0, termCount);
                  selectedTerms.forEach(term => {
                    strengthWords[term] = (strengthWords[term] || 0) + 1;
                  });
                } else if (score < 4) {
                  // 不足：维度名称 + 随机选1-2个不足评价词
                  weaknessWords[dimName] = (weaknessWords[dimName] || 0) + 1;
                  const termCount = score < 2 ? 3 : (score < 3 ? 2 : 1);
                  const selectedTerms = dimInfo.weaknessTerms.slice(0, termCount);
                  selectedTerms.forEach(term => {
                    weaknessWords[term] = (weaknessWords[term] || 0) + 1;
                  });
                }
              }
            });
          }
          
          // 也从评语(comment)中提取评价性关键词
          const comment = evalObj.comment || answer.comment || '';
          if (comment) {
            // 从评语中提取被评价的维度名称（作为补充频次）
            Object.values(DIM_EVAL_TERMS).forEach(dimInfo => {
              if (comment.includes(dimInfo.name)) {
                // 判断评语对该维度是正面还是负面
                const isPositive = /表现较好|较好|优秀|突出|到位/.test(comment);
                const isNegative = /建议加强|加强|不足|欠缺|薄弱|关注/.test(comment);
                
                if (isPositive) {
                  strengthWords[dimInfo.name] = (strengthWords[dimInfo.name] || 0) + 1;
                }
                if (isNegative) {
                  weaknessWords[dimInfo.name] = (weaknessWords[dimInfo.name] || 0) + 1;
                }
              }
            });
          }
        }
      } catch (e) {
        // 解析 evaluation 失败，忽略该条
      }
    });
    
    // 计算维度平均分
    const dimensionOverview = Object.entries(dimensionScores)
      .filter(([key, scores]) => scores && scores.length > 0)
      .map(([key, scores]) => {
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        return {
          key,
          name: DIMENSION_NAMES[key] || key,
          average: Math.round(avg * 10) / 10,
          status: avg >= 6 ? 'strength' : (avg < 4 ? 'weakness' : 'neutral')
        };
      });
    
    // 转换为词云数据格式
    const strengths = Object.entries(strengthWords)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([name, value]) => ({ name, value }));
    
    const weaknesses = Object.entries(weaknessWords)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([name, value]) => ({ name, value }));
    
    // 如果两类都没有数据，fallback 到从回答内容提取关键词
    if (strengths.length === 0 && weaknesses.length === 0) {
      const texts = answers.map(a => a.content);
      const keywords = extractKeywords(texts, 50);
      
      // 将提取的关键词按分数高低分配
      return res.json({ 
        success: true, 
        data: { 
          strengths: keywords.slice(0, 25),
          weaknesses: [],
          dimensionOverview
        } 
      });
    }
    
    res.json({ 
      success: true, 
      data: { 
        strengths, 
        weaknesses,
        dimensionOverview
      } 
    });
  } catch (error) {
    console.error('获取词云数据错误:', error);
    res.json({ success: false, message: '获取失败' });
  }
});

// ============ 学生画像 ============

// 获取单个学生的素养画像
router.get('/students/:id/profile', (req, res) => {
  const { id } = req.params;
  const user = req.sessionUser || req.session.user;
  const db = getDatabase();
  
  try {
    const student = db.prepare(`
      SELECT s.*, c.name as class_name
      FROM students s
      LEFT JOIN classes c ON s.class_id = c.id
      WHERE s.id = ?
    `).get(id);
    
    if (!student) {
      return res.json({ success: false, message: '学生不存在' });
    }
    
    // 获取最近的回答
    const recentAnswers = db.prepare(`
      SELECT a.*, q.content as question_content
      FROM answers a
      JOIN questions q ON a.question_id = q.id
      WHERE a.student_id = ?
      ORDER BY a.evaluated_at DESC
      LIMIT 20
    `).all(id);
    
    // 计算各维度平均分
    const allAnswers = db.prepare('SELECT dimensions FROM answers WHERE student_id = ?').all(id);
    
    const dimensionTotals = { perception: 0, emotion: 0, culture: 0, aesthetic: 0, expression: 0 };
    let dimensionCount = 0;
    
    allAnswers.forEach(a => {
      try {
        const dims = JSON.parse(a.dimensions);
        for (const key in dimensionTotals) {
          if (dims[key] !== undefined) {
            dimensionTotals[key] += dims[key];
          }
        }
        dimensionCount++;
      } catch (e) {}
    });
    
    const dimensionAvgs = {};
    if (dimensionCount > 0) {
      for (const key in dimensionTotals) {
        dimensionAvgs[key] = Math.round((dimensionTotals[key] / dimensionCount) * 10) / 10;
      }
    }
    
    // 解析回答中的维度数据
    recentAnswers.forEach(a => {
      if (a.dimensions) {
        try {
          a.dimensions = JSON.parse(a.dimensions);
        } catch (e) {}
      }
    });
    
    res.json({
      success: true,
      data: {
        student,
        dimensionAvgs,
        recentAnswers,
        totalAnswers: allAnswers.length
      }
    });
  } catch (error) {
    console.error('获取学生画像错误:', error);
    res.json({ success: false, message: '获取失败' });
  }
});

// ============ 班级管理 ============

// 获取教师管理的班级列表
router.get('/my-classes', (req, res) => {
  const user = req.sessionUser || req.session.user;
  const db = getDatabase();
  
  try {
    const classes = db.prepare(`
      SELECT c.*, 
             (SELECT COUNT(*) FROM students WHERE class_id = c.id) as student_count
      FROM classes c
      WHERE c.teacher_id = ?
      ORDER BY c.created_at DESC
    `).all(user.id);
    
    res.json({ success: true, data: classes });
  } catch (error) {
    console.error('获取班级列表错误:', error);
    res.json({ success: false, message: '获取失败' });
  }
});

// 获取班级的学生列表
router.get('/classes/:id/students', (req, res) => {
  const { id } = req.params;
  const db = getDatabase();
  
  try {
    const students = db.prepare(`
      SELECT s.*,
             (SELECT COUNT(*) FROM answers WHERE student_id = s.id) as answer_count,
             (SELECT AVG(total_score) FROM answers WHERE student_id = s.id) as avg_score
      FROM students s
      WHERE s.class_id = ?
      ORDER BY s.name
    `).all(id);
    
    res.json({ success: true, data: students });
  } catch (error) {
    console.error('获取学生列表错误:', error);
    res.json({ success: false, message: '获取失败' });
  }
});

module.exports = router;
