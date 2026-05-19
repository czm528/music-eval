/**
 * 学生路由
 * 处理学生相关的操作：查看问题、提交回答、查看评价
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const { getDatabase } = require('../db/init');
const { evaluateWithAI } = require('../services/ai-eval');
const keywordEval = require('../services/keyword-eval');
const { analyzePitch } = require('../services/pitchAnalyzer');
const { evaluateMelody } = require('../services/melody-eval');
const { evaluateColor } = require('../services/color-eval');

// 中间件：检查学生权限（支持session和token两种认证方式）
function requireStudent(req, res, next) {
  if (req.session.user && req.session.user.role === 'student') {
    return next();
  }
  
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.substring(7);
      const decoded = Buffer.from(token, 'base64').toString();
      const [role] = decoded.split(':');
      if (role === 'student') {
        const parts = decoded.split(':');
        req.sessionUser = { role: parts[0], id: parseInt(parts[1]) };
        return next();
      }
    } catch (e) {}
  }
  
  return res.status(401).json({ success: false, message: '无权限访问' });
}

router.use(requireStudent);

// ============ 课堂互动 ============

// 获取当前课堂信息
router.get('/classroom', (req, res) => {
  const user = req.sessionUser || req.session.user;
  const db = getDatabase();
  
  try {
    // 获取学生所在的活跃课堂
    const classroomStudent = db.prepare(`
      SELECT cs.*, c.*, t.nickname as teacher_name
      FROM classroom_students cs
      JOIN classrooms c ON cs.classroom_id = c.id
      JOIN teachers t ON c.teacher_id = t.id
      WHERE cs.student_id = ? AND c.status = 'active'
      ORDER BY cs.join_time DESC
      LIMIT 1
    `).get(user.id);
    
    if (!classroomStudent) {
      return res.json({ success: false, message: '未加入任何课堂' });
    }
    
    // 获取当前问题（未结束的问题）
    const currentQuestion = db.prepare(`
      SELECT * FROM questions 
      WHERE classroom_id = ? AND ended_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `).get(classroomStudent.id);
    
    // 检查是否已回答当前问题
    let hasAnswered = false;
    let myAnswer = null;
    
    if (currentQuestion) {
      myAnswer = db.prepare('SELECT * FROM answers WHERE question_id = ? AND student_id = ?').get(
        currentQuestion.id, user.id
      );
      hasAnswered = !!myAnswer;
    }
    
    // 获取该课堂的问题历史
    const questionHistory = db.prepare(`
      SELECT q.*, 
             (SELECT COUNT(*) FROM answers WHERE question_id = q.id) as answer_count
      FROM questions q
      WHERE q.classroom_id = ?
      ORDER BY q.created_at DESC
      LIMIT 10
    `).all(classroomStudent.id);
    
    res.json({
      success: true,
      data: {
        classroom: {
          id: classroomStudent.id,
          name: classroomStudent.name,
          teacherName: classroomStudent.teacher_name,
          sessionId: classroomStudent.session_id
        },
        currentQuestion,
        hasAnswered,
        myAnswer: myAnswer ? {
          content: myAnswer.content,
          totalScore: myAnswer.total_score,
          comment: myAnswer.comment,
          dimensions: myAnswer.dimensions ? JSON.parse(myAnswer.dimensions) : {}
        } : null,
        questionHistory
      }
    });
  } catch (error) {
    console.error('获取课堂信息错误:', error);
    res.json({ success: false, message: '获取失败' });
  }
});

// 通过sessionId获取课堂信息
router.get('/classroom/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const user = req.sessionUser || req.session.user;
  const db = getDatabase();
  
  try {
    const classroom = db.prepare(`
      SELECT c.*, t.nickname as teacher_name
      FROM classrooms c
      JOIN teachers t ON c.teacher_id = t.id
      WHERE c.session_id = ? AND c.status = 'active'
    `).get(sessionId);
    
    if (!classroom) {
      return res.json({ success: false, message: '课堂不存在或已结束' });
    }
    
    // 检查学生是否已加入
    const isJoined = db.prepare('SELECT * FROM classroom_students WHERE classroom_id = ? AND student_id = ?').get(
      classroom.id, user.id
    );
    
    if (!isJoined) {
      // 自动加入
      db.prepare('INSERT INTO classroom_students (classroom_id, student_id) VALUES (?, ?)').run(
        classroom.id, user.id
      );
    }
    
    // 获取当前问题
    const currentQuestion = db.prepare(`
      SELECT * FROM questions 
      WHERE classroom_id = ? AND ended_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `).get(classroom.id);
    
    // 检查是否已回答
    let myAnswer = null;
    if (currentQuestion) {
      myAnswer = db.prepare('SELECT * FROM answers WHERE question_id = ? AND student_id = ?').get(
        currentQuestion.id, user.id
      );
    }
    
    res.json({
      success: true,
      data: {
        classroom: {
          id: classroom.id,
          name: classroom.name,
          description: classroom.description,
          teacherName: classroom.teacher_name
        },
        currentQuestion,
        hasAnswered: !!myAnswer,
        myAnswer: myAnswer ? {
          content: myAnswer.content,
          totalScore: myAnswer.total_score,
          comment: myAnswer.comment,
          dimensions: myAnswer.dimensions ? JSON.parse(myAnswer.dimensions) : {}
        } : null
      }
    });
  } catch (error) {
    console.error('获取课堂信息错误:', error);
    res.json({ success: false, message: '获取失败' });
  }
});

// ============ 提交回答 ============

// 提交回答（支持文字题、旋律线题、配色题）
router.post('/answers', async (req, res) => {
  const { questionId, content } = req.body;
  const user = req.sessionUser || req.session.user;
  const db = getDatabase();
  
  if (!questionId || !content) {
    return res.json({ success: false, message: '请填写回答内容' });
  }
  
  try {
    // 获取问题信息
    const question = db.prepare(`
      SELECT q.*, c.name as classroom_name
      FROM questions q
      JOIN classrooms c ON q.classroom_id = c.id
      WHERE q.id = ?
    `).get(questionId);
    
    if (!question) {
      return res.json({ success: false, message: '问题不存在' });
    }
    
    if (question.ended_at) {
      return res.json({ success: false, message: '问题已结束' });
    }
    
    // 检查是否已回答 - 允许重新提交
    const existingAnswer = db.prepare('SELECT * FROM answers WHERE question_id = ? AND student_id = ?').get(
      questionId, user.id
    );
    
    // 获取学生信息
    const student = db.prepare('SELECT * FROM students WHERE id = ?').get(user.id);
    
    // 获取问题的维度设置
    let selectedDimensions = ['perception', 'emotion', 'culture', 'aesthetic', 'expression']; // 默认全部
    if (question.dimensions) {
      try {
        selectedDimensions = JSON.parse(question.dimensions);
      } catch (e) {}
    }
    
    // 进行评价
    let evaluation = null;
    const questionType = question.question_type || 'text';
    
    // 根据题目类型处理评价
    if (questionType === 'melody') {
      // 旋律线题评价
      try {
        const studentPoints = typeof content === 'string' ? JSON.parse(content) : content;
        const refCurve = question.ref_curve ? JSON.parse(question.ref_curve) : null;
        evaluation = evaluateMelody(studentPoints, refCurve);
        evaluation.dimensions = { melody: evaluation.score };
        evaluation.method = 'melody-comparison';
      } catch (e) {
        console.error('旋律线评分失败:', e);
        evaluation = {
          dimensions: { melody: 0 },
          totalScore: 0,
          comment: '评分失败，请重新提交',
          method: 'error'
        };
      }
    } else if (questionType === 'color') {
      // 配色题评价
      try {
        const studentSelections = typeof content === 'string' ? JSON.parse(content) : content;
        const refConfig = question.ref_config ? JSON.parse(question.ref_config) : null;
        evaluation = evaluateColor(studentSelections, refConfig);
        evaluation.dimensions = { emotion: evaluation.score };
        evaluation.method = 'color-matching';
      } catch (e) {
        console.error('配色评分失败:', e);
        evaluation = {
          dimensions: { emotion: 0 },
          totalScore: 0,
          comment: '评分失败，请重新提交',
          method: 'error'
        };
      }
    } else {
      // 文字题和音频题使用原有逻辑
      // 优先尝试AI评价
      try {
        evaluation = await evaluateWithAI(question.content, content, student.name, selectedDimensions);
      } catch (e) {
        console.log('AI评价失败，使用关键词评价:', e.message);
      }
      
      // 如果AI评价失败，使用关键词评价
      if (!evaluation) {
        evaluation = keywordEval.evaluate(question.content, content, selectedDimensions);
      }
    }
    
    // 保存回答（如已有则更新）
    let answerId;
    if (existingAnswer) {
      db.prepare(`
        UPDATE answers SET content = ?, evaluation = ?, dimensions = ?, total_score = ?, 
          comment = ?, eval_method = ?, evaluated_at = CURRENT_TIMESTAMP
        WHERE question_id = ? AND student_id = ?
      `).run(
        typeof content === 'object' ? JSON.stringify(content) : content,
        JSON.stringify(evaluation),
        JSON.stringify(evaluation.dimensions),
        evaluation.totalScore,
        evaluation.comment,
        evaluation.method,
        questionId, user.id
      );
      answerId = existingAnswer.id;
    } else {
      const insertResult = db.prepare(`
        INSERT INTO answers (question_id, student_id, content, evaluation, dimensions, total_score, comment, eval_method)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        questionId,
        user.id,
        typeof content === 'object' ? JSON.stringify(content) : content,
        JSON.stringify(evaluation),
        JSON.stringify(evaluation.dimensions),
        evaluation.totalScore,
        evaluation.comment,
        evaluation.method
      );
      answerId = insertResult.lastInsertRowid;
    }
    
    // 更新学生素养记录 - 只更新选中的维度
    updateCompetencyRecord(db, user.id, evaluation.dimensions, selectedDimensions);
    
    // 通过Socket.io广播评价结果
    const io = req.app.get('io');
    if (io) {
      io.to(`classroom:${question.classroom_id}`).emit('eval-result', {
        questionId,
        studentId: user.id,
        studentName: student.name,
        totalScore: evaluation.totalScore,
        dimensions: evaluation.dimensions,
        selectedDimensions
      });
      
      // 广播课堂统计更新
      const stats = getClassroomStats(db, question.classroom_id);
      io.to(`classroom:${question.classroom_id}`).emit('classroom-stats', stats);
    }
    
    res.json({
      success: true,
      message: '回答已提交',
      data: {
        answerId,
        totalScore: evaluation.totalScore,
        dimensions: evaluation.dimensions,
        dimensionDetails: evaluation.dimensionDetails,
        comment: evaluation.comment,
        highlights: evaluation.highlights,
        suggestions: evaluation.suggestions,
        questionType
      }
    });
  } catch (error) {
    console.error('提交回答错误:', error);
    res.json({ success: false, message: '提交失败' });
  }
});

// 提交音频回答
router.post('/answers/audio', (req, res) => {
  const audioUpload = req.app.get('audioUpload');
  
  audioUpload.single('student_audio')(req, res, async (err) => {
    if (err) {
      return res.json({ success: false, message: '录音上传失败: ' + err.message });
    }
    
    const { questionId } = req.body;
    const user = req.sessionUser || req.session.user;
    const db = getDatabase();
    
    if (!questionId || !req.file) {
      return res.json({ success: false, message: '缺少参数' });
    }
    
    try {
      const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(questionId);
      if (!question) {
        return res.json({ success: false, message: '问题不存在' });
      }
      
      // 检查是否已回答 - 允许重新提交，更新旧答案
      const existing = db.prepare('SELECT * FROM answers WHERE question_id = ? AND student_id = ?').get(questionId, user.id);
      
      const audioPath = `/uploads/audio/${req.file.filename}`;
      let pitchScore = null;
      let pitchDeviation = null;
      let pitchCurve = null;
      let content = '🎤 音频回答';
      
      // 如果是音频题且有参考音频，调用Node.js音准分析
      if (question.question_type === 'audio' && question.reference_audio) {
        try {
          const dataDir = req.app.get('dataDir') || path.join(__dirname, '..');
          const refPath = path.join(dataDir, question.reference_audio.replace(/^\//, ''));
          const result = await analyzePitch(req.file.path, refPath);
          
          if (result) {
            pitchScore = result.score;
            pitchDeviation = result.avg_deviation_cents;
            pitchCurve = (result.ref_curve && result.stu_curve) ? JSON.stringify({ ref: result.ref_curve, stu: result.stu_curve }) : null;
            content = `🎤 音准得分: ${pitchScore}分 (偏差${pitchDeviation}音分)`;
          }
        } catch (e) {
          console.error('音准分析失败:', e.message);
        }
      }
      
      // 构建评价结果
      const evaluation = {
        dimensions: { pitch: pitchScore || 0 },
        totalScore: pitchScore || 0,
        comment: pitchScore !== null 
          ? `音准得分${pitchScore}分。${pitchScore >= 90 ? '音准很棒，旋律掌握得很好！' : pitchScore >= 75 ? '音准不错，能听出旋律走向，继续加油！' : pitchScore >= 60 ? '基本完成了演唱，多听几遍参考旋律会有帮助。' : '勇敢地唱出来了！建议多听参考旋律，跟着哼唱练习。'}`
          : '音频已收到，待教师评价。',
        method: pitchScore !== null ? 'pitch-analysis' : 'pending'
      };
      
      const student = db.prepare('SELECT * FROM students WHERE id = ?').get(user.id);
      
      // 保存回答（如已有则更新）
      let answerId;
      if (existing) {
        db.prepare(`
          UPDATE answers SET content = ?, evaluation = ?, dimensions = ?, total_score = ?, 
            comment = ?, eval_method = ?, audio_file = ?, pitch_score = ?, pitch_deviation = ?, pitch_curve = ?, evaluated_at = CURRENT_TIMESTAMP
          WHERE question_id = ? AND student_id = ?
        `).run(
          content,
          JSON.stringify(evaluation),
          JSON.stringify(evaluation.dimensions),
          evaluation.totalScore,
          evaluation.comment,
          evaluation.method,
          audioPath,
          pitchScore,
          pitchDeviation,
          pitchCurve,
          questionId, user.id
        );
        answerId = existing.id;
      } else {
        const insertResult = db.prepare(`
          INSERT INTO answers (question_id, student_id, content, evaluation, dimensions, total_score, comment, eval_method, audio_file, pitch_score, pitch_deviation, pitch_curve)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          questionId, user.id, content,
          JSON.stringify(evaluation),
          JSON.stringify(evaluation.dimensions),
          evaluation.totalScore,
          evaluation.comment,
          evaluation.method,
          audioPath,
          pitchScore,
          pitchDeviation,
          pitchCurve
        );
        answerId = insertResult.lastInsertRowid;
      }
      
      // Socket广播
      const io = req.app.get('io');
      if (io) {
        io.to(`classroom:${question.classroom_id}`).emit('eval-result', {
          questionId,
          studentId: user.id,
          studentName: student.name,
          totalScore: evaluation.totalScore,
          dimensions: evaluation.dimensions
        });
      }
      
      res.json({
        success: true,
        message: '回答已提交',
        data: {
          answerId,
          score: evaluation.totalScore,
          dimensions: evaluation.dimensions,
          comment: evaluation.comment,
          pitchScore,
          pitchDeviation,
          pitchCurve: pitchCurve ? JSON.parse(pitchCurve) : null
        }
      });
    } catch (error) {
      console.error('提交音频回答错误:', error);
      res.json({ success: false, message: '提交失败: ' + (error.message || '未知错误') });
    }
  });
});

// ============ 个人中心 ============

// 获取个人信息
router.get('/profile', (req, res) => {
  const user = req.sessionUser || req.session.user;
  const db = getDatabase();
  
  try {
    const student = db.prepare(`
      SELECT s.*, c.name as class_name
      FROM students s
      LEFT JOIN classes c ON s.class_id = c.id
      WHERE s.id = ?
    `).get(user.id);
    
    if (!student) {
      return res.json({ success: false, message: '学生不存在' });
    }
    
    // 获取回答统计
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total_answers,
        AVG(total_score) as avg_score,
        MAX(total_score) as max_score,
        MIN(total_score) as min_score
      FROM answers
      WHERE student_id = ?
    `).get(user.id);
    
    res.json({
      success: true,
      data: {
        student,
        stats: {
          totalAnswers: stats.total_answers || 0,
          avgScore: stats.avg_score ? Math.round(stats.avg_score * 10) / 10 : 0,
          maxScore: stats.max_score || 0,
          minScore: stats.min_score || 0
        }
      }
    });
  } catch (error) {
    console.error('获取个人信息错误:', error);
    res.json({ success: false, message: '获取失败' });
  }
});

// 获取素养画像
router.get('/competency', (req, res) => {
  const user = req.sessionUser || req.session.user;
  const db = getDatabase();
  
  try {
    // 获取所有回答的维度数据
    const answers = db.prepare('SELECT dimensions FROM answers WHERE student_id = ?').all(user.id);
    
    const dimensionTotals = { perception: 0, emotion: 0, culture: 0, aesthetic: 0, expression: 0 };
    let dimensionCount = 0;
    
    answers.forEach(a => {
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
    const dimensionNames = {
      perception: '音乐感知力',
      emotion: '情感理解力',
      culture: '文化认知',
      aesthetic: '审美判断',
      expression: '表达规范'
    };
    
    if (dimensionCount > 0) {
      for (const key in dimensionTotals) {
        dimensionAvgs[key] = {
          name: dimensionNames[key],
          score: Math.round((dimensionTotals[key] / dimensionCount) * 10) / 10
        };
      }
    } else {
      for (const key in dimensionNames) {
        dimensionAvgs[key] = {
          name: dimensionNames[key],
          score: 0
        };
      }
    }
    
    // 获取最近的回答
    const recentAnswers = db.prepare(`
      SELECT a.*, q.content as question_content
      FROM answers a
      JOIN questions q ON a.question_id = q.id
      WHERE a.student_id = ?
      ORDER BY a.evaluated_at DESC
      LIMIT 10
    `).all(user.id);
    
    // 解析维度数据
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
        dimensionAvgs,
        recentAnswers,
        totalAnswers: answers.length
      }
    });
  } catch (error) {
    console.error('获取素养画像错误:', error);
    res.json({ success: false, message: '获取失败' });
  }
});

// 获取历史回答
router.get('/history', (req, res) => {
  const user = req.sessionUser || req.session.user;
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  
  const db = getDatabase();
  
  try {
    const answers = db.prepare(`
      SELECT a.*, q.content as question_content, c.name as classroom_name
      FROM answers a
      JOIN questions q ON a.question_id = q.id
      JOIN classrooms c ON q.classroom_id = c.id
      WHERE a.student_id = ?
      ORDER BY a.evaluated_at DESC
      LIMIT ? OFFSET ?
    `).all(user.id, limit, offset);
    
    const total = db.prepare('SELECT COUNT(*) as count FROM answers WHERE student_id = ?').get(user.id).count;
    
    // 解析维度数据
    answers.forEach(a => {
      if (a.dimensions) {
        try {
          a.dimensions = JSON.parse(a.dimensions);
        } catch (e) {}
      }
    });
    
    res.json({
      success: true,
      data: {
        answers,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('获取历史记录错误:', error);
    res.json({ success: false, message: '获取失败' });
  }
});

// 获取问题的回答详情
router.get('/answers/:questionId', (req, res) => {
  const user = req.sessionUser || req.session.user;
  const { questionId } = req.params;
  const db = getDatabase();
  
  try {
    const answer = db.prepare(`
      SELECT a.*, q.content as question_content
      FROM answers a
      JOIN questions q ON a.question_id = q.id
      WHERE a.question_id = ? AND a.student_id = ?
    `).get(questionId, user.id);
    
    if (!answer) {
      return res.json({ success: false, message: '回答不存在' });
    }
    
    // 解析维度数据
    if (answer.dimensions) {
      try {
        answer.dimensions = JSON.parse(answer.dimensions);
      } catch (e) {}
    }
    
    // 解析评价数据
    if (answer.evaluation) {
      try {
        answer.evaluation = JSON.parse(answer.evaluation);
      } catch (e) {}
    }
    
    // 解析音高曲线
    if (answer.pitch_curve) {
      try {
        answer.pitchCurve = JSON.parse(answer.pitch_curve);
      } catch (e) {}
    }
    
    res.json({
      success: true,
      data: answer
    });
  } catch (error) {
    console.error('获取回答详情错误:', error);
    res.json({ success: false, message: '获取失败' });
  }
});

// ============ 辅助函数 ============

// 更新学生素养记录
function updateCompetencyRecord(db, studentId, dimensions, selectedDimensions = null) {
  const targetDimensions = selectedDimensions || Object.keys(dimensions);
  
  for (const [dimension, score] of Object.entries(dimensions)) {
    // 只更新选中的维度
    if (!targetDimensions.includes(dimension)) {
      continue;
    }
    
    const existing = db.prepare('SELECT * FROM competency_records WHERE student_id = ? AND dimension = ?').get(
      studentId, dimension
    );
    
    if (existing) {
      // 更新记录（计算新的平均值）
      const newCount = existing.answer_count + 1;
      const newTotal = existing.total_score * existing.answer_count + score;
      const newAvg = newTotal / newCount;
      
      db.prepare(`
        UPDATE competency_records 
        SET total_score = ?, answer_count = ?, avg_score = ?, updated_at = CURRENT_TIMESTAMP
        WHERE student_id = ? AND dimension = ?
      `).run(newTotal, newCount, newAvg, studentId, dimension);
    } else {
      // 创建新记录
      db.prepare(`
        INSERT INTO competency_records (student_id, dimension, total_score, answer_count, avg_score)
        VALUES (?, ?, ?, 1, ?)
      `).run(studentId, dimension, score, score);
    }
  }
}

// 获取课堂统计
function getClassroomStats(db, classroomId) {
  const studentCount = db.prepare('SELECT COUNT(*) as count FROM classroom_students WHERE classroom_id = ?').get(classroomId).count;
  
  const questions = db.prepare(`
    SELECT id, (SELECT COUNT(*) FROM answers WHERE question_id = q.id) as answer_count
    FROM questions q
    WHERE q.classroom_id = ? AND ended_at IS NULL
  `).all(classroomId);
  
  const currentQuestion = questions[0] || null;
  const totalAnswers = questions.reduce((sum, q) => sum + q.answer_count, 0);
  
  return {
    studentCount,
    currentQuestionAnswerCount: currentQuestion ? currentQuestion.answer_count : 0,
    totalAnswers
  };
}

module.exports = router;
