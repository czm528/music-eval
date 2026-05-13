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

// ============ 课堂管理 ============

// 获取教师的课堂列表
router.get('/classrooms', (req, res) => {
  const user = req.sessionUser || req.session.user;
  const db = getDatabase();
  
  try {
    const classrooms = db.prepare(`
      SELECT c.*, 
             (SELECT COUNT(*) FROM classroom_students WHERE classroom_id = c.id) as student_count,
             (SELECT COUNT(*) FROM questions WHERE classroom_id = c.id) as question_count
      FROM classrooms c
      WHERE c.teacher_id = ?
      ORDER BY c.created_at DESC
    `).all(user.id);
    
    res.json({ success: true, data: classrooms });
  } catch (error) {
    console.error('获取课堂列表错误:', error);
    res.json({ success: false, message: '获取失败' });
  }
});

// 创建课堂
router.post('/classrooms', (req, res) => {
  const user = req.sessionUser || req.session.user;
  const { name, description, classId } = req.body;
  
  if (!name) {
    return res.json({ success: false, message: '请填写课堂名称' });
  }
  
  const db = getDatabase();
  
  try {
    const sessionId = uuidv4().replace(/-/g, '').substring(0, 12);
    
    const result = db.prepare(`
      INSERT INTO classrooms (session_id, name, description, teacher_id, class_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(sessionId, name, description || null, user.id, classId || null);
    
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
    
    // 获取已加入的学生
    const students = db.prepare(`
      SELECT s.*, cs.join_time
      FROM students s
      JOIN classroom_students cs ON s.id = cs.student_id
      WHERE cs.classroom_id = ?
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
    
    // 获取二维码（重新生成）
    const joinUrl = `${config.frontend.baseUrl}/answer/${classroom.session_id}`;
    QRCode.toDataURL(joinUrl, { width: 300, margin: 2 }, (err, qrCode) => {
      res.json({
        success: true,
        data: {
          ...classroom,
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

// 发布新问题
router.post('/questions', (req, res) => {
  const { classroomId, content, dimensions } = req.body;
  const user = req.sessionUser || req.session.user;
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
    
    const result = db.prepare('INSERT INTO questions (classroom_id, content, dimensions) VALUES (?, ?, ?)').run(
      classroomId, content, JSON.stringify(dimensions)
    );
    
    // 通过Socket.io广播新问题
    const io = req.app.get('io');
    if (io) {
      io.to(`classroom:${classroomId}`).emit('new-question', {
        questionId: result.lastInsertRowid,
        content,
        dimensions,
        createdAt: new Date().toISOString()
      });
    }
    
    res.json({
      success: true,
      message: '问题已发布',
      data: { id: result.lastInsertRowid }
    });
  } catch (error) {
    console.error('发布问题错误:', error);
    res.json({ success: false, message: '发布失败' });
  }
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
    
    // 获取学生数量
    const studentCount = db.prepare('SELECT COUNT(*) as count FROM classroom_students WHERE classroom_id = ?').get(id).count;
    
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
    // 获取所有学生及其回答
    const students = db.prepare(`
      SELECT s.* FROM students s
      JOIN classroom_students cs ON s.id = cs.student_id
      WHERE cs.classroom_id = ?
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
      
      // 按学生分组
      const answersByStudent = {};
      studentAnswers.forEach(a => {
        if (!answersByStudent[a.student_id]) {
          answersByStudent[a.student_id] = [];
        }
        answersByStudent[a.student_id].push(a);
      });
      
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
        
        // 每道题的归一化得分之和
        let normalizedSum = 0;
        let validAnswerCount = 0;
        
        for (const answer of answers) {
          try {
            const dims = JSON.parse(answer.dimensions);
            const questionDims = answer.question_dimensions ? JSON.parse(answer.question_dimensions) : ['perception', 'emotion', 'culture', 'aesthetic', 'expression'];
            
            // 计算该题选中维度的平均分（10分制）
            let dimSum = 0;
            let dimCount = 0;
            for (const dim of questionDims) {
              if (dims[dim] !== undefined) {
                dimSum += dims[dim];
                dimCount++;
              }
            }
            
            if (dimCount > 0) {
              const normalizedScore = (dimSum / dimCount); // 直接是10分制
              normalizedSum += normalizedScore;
              validAnswerCount++;
            }
          } catch (e) {}
        }
        
        // 课堂总评 = 归一化得分的平均 * 10 = 100分制
        const totalScore = validAnswerCount > 0 
          ? Math.round((normalizedSum / validAnswerCount) * 10) 
          : 0;
        
        studentTotalScores.push({
          studentId: student.id,
          studentName: student.name,
          studentNumber: student.student_number,
          totalScore,
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

// 获取问题的词云数据
router.get('/questions/:id/wordcloud', (req, res) => {
  const { id } = req.params;
  const db = getDatabase();
  
  try {
    // 获取该问题的所有回答
    const answers = db.prepare(`
      SELECT content FROM answers
      WHERE question_id = ?
    `).all(id);
    
    if (!answers || answers.length === 0) {
      return res.json({ success: true, data: [] });
    }
    
    // 提取关键词
    const texts = answers.map(a => a.content);
    const keywords = extractKeywords(texts, 50);
    
    res.json({ success: true, data: keywords });
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
