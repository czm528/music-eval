/**
 * 管理员路由
 * 处理管理员相关的操作：用户管理、班级管理、系统配置、数据统计、答案导入
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { getDatabase } = require('../db/init');
const keywordEval = require('../services/keyword-eval');
const { updateCompetencyRecord, getClassroomStats } = require('../services/student-helper');

// 中间件：检查管理员权限（支持session和token两种认证方式）
function requireAdmin(req, res, next) {
  if (req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.substring(7);
      const decoded = Buffer.from(token, 'base64').toString();
      const [role] = decoded.split(':');
      if (role === 'admin') {
        return next();
      }
    } catch (e) {}
  }
  
  return res.status(401).json({ success: false, message: '无权限访问' });
}

router.use(requireAdmin);

// ============ 教师管理 ============

// 获取教师列表
router.get('/teachers', (req, res) => {
  const db = getDatabase();
  try {
    const teachers = db.prepare('SELECT id, username, nickname, email, phone, created_at FROM teachers ORDER BY created_at DESC').all();
    res.json({ success: true, data: teachers });
  } catch (error) {
    console.error('获取教师列表错误:', error);
    res.json({ success: false, message: '获取失败' });
  }
});

// 创建教师
router.post('/teachers', (req, res) => {
  const { username, password, nickname, email, phone } = req.body;
  
  if (!username || !password || !nickname) {
    return res.json({ success: false, message: '请填写必填信息' });
  }
  
  const db = getDatabase();
  
  try {
    // 检查用户名是否已存在
    const existing = db.prepare('SELECT id FROM teachers WHERE username = ?').get(username);
    if (existing) {
      return res.json({ success: false, message: '用户名已存在' });
    }
    
    const hashedPassword = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO teachers (username, password, nickname, email, phone) VALUES (?, ?, ?, ?, ?)').run(
      username, hashedPassword, nickname, email || null, phone || null
    );
    
    res.json({ success: true, message: '创建成功', data: { id: result.lastInsertRowid } });
  } catch (error) {
    console.error('创建教师错误:', error);
    res.json({ success: false, message: '创建失败' });
  }
});

// 更新教师
router.put('/teachers/:id', (req, res) => {
  const { id } = req.params;
  const { nickname, email, phone, password } = req.body;
  
  const db = getDatabase();
  
  try {
    let sql = 'UPDATE teachers SET nickname = ?, email = ?, phone = ?, updated_at = CURRENT_TIMESTAMP';
    let params = [nickname, email, phone];
    
    if (password) {
      sql += ', password = ?';
      params.push(bcrypt.hashSync(password, 10));
    }
    
    sql += ' WHERE id = ?';
    params.push(id);
    
    db.prepare(sql).run(...params);
    res.json({ success: true, message: '更新成功' });
  } catch (error) {
    console.error('更新教师错误:', error);
    res.json({ success: false, message: '更新失败' });
  }
});

// 删除教师
router.delete('/teachers/:id', (req, res) => {
  const { id } = req.params;
  const db = getDatabase();
  
  try {
    // 删除关联的班级和学生（先删除学生）
    const classes = db.prepare('SELECT id FROM classes WHERE teacher_id = ?').all(id);
    for (const cls of classes) {
      db.prepare('DELETE FROM students WHERE class_id = ?').run(cls.id);
    }
    db.prepare('DELETE FROM classes WHERE teacher_id = ?').run(id);
    db.prepare('DELETE FROM teachers WHERE id = ?').run(id);
    
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    console.error('删除教师错误:', error);
    res.json({ success: false, message: '删除失败' });
  }
});

// ============ 班级管理 ============

// 获取班级列表
router.get('/classes', (req, res) => {
  const db = getDatabase();
  try {
    const classes = db.prepare(`
      SELECT c.*, t.nickname as teacher_name, 
             (SELECT COUNT(*) FROM students WHERE class_id = c.id) as student_count
      FROM classes c
      LEFT JOIN teachers t ON c.teacher_id = t.id
      ORDER BY c.created_at DESC
    `).all();
    res.json({ success: true, data: classes });
  } catch (error) {
    console.error('获取班级列表错误:', error);
    res.json({ success: false, message: '获取失败' });
  }
});

// 创建班级
router.post('/classes', (req, res) => {
  const { name, grade, description, teacherId } = req.body;
  
  if (!name) {
    return res.json({ success: false, message: '请填写班级名称' });
  }
  
  const db = getDatabase();
  
  try {
    const result = db.prepare('INSERT INTO classes (name, grade, description, teacher_id) VALUES (?, ?, ?, ?)').run(
      name, grade || null, description || null, teacherId || null
    );
    res.json({ success: true, message: '创建成功', data: { id: result.lastInsertRowid } });
  } catch (error) {
    console.error('创建班级错误:', error);
    res.json({ success: false, message: '创建失败' });
  }
});

// 更新班级
router.put('/classes/:id', (req, res) => {
  const { id } = req.params;
  const { name, grade, description, teacherId } = req.body;
  
  const db = getDatabase();
  
  try {
    db.prepare('UPDATE classes SET name = ?, grade = ?, description = ?, teacher_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
      name, grade, description, teacherId, id
    );
    res.json({ success: true, message: '更新成功' });
  } catch (error) {
    console.error('更新班级错误:', error);
    res.json({ success: false, message: '更新失败' });
  }
});

// 删除班级
router.delete('/classes/:id', (req, res) => {
  const { id } = req.params;
  const db = getDatabase();
  
  try {
    db.prepare('DELETE FROM students WHERE class_id = ?').run(id);
    db.prepare('DELETE FROM classes WHERE id = ?').run(id);
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    console.error('删除班级错误:', error);
    res.json({ success: false, message: '删除失败' });
  }
});

// ============ 学生管理 ============

// 获取学生列表
router.get('/students', (req, res) => {
  const { classId } = req.query;
  const db = getDatabase();
  
  try {
    let sql = `
      SELECT s.*, c.name as class_name,
             (SELECT COUNT(*) FROM answers WHERE student_id = s.id) as answer_count,
             (SELECT AVG(total_score) FROM answers WHERE student_id = s.id) as avg_score
      FROM students s
      LEFT JOIN classes c ON s.class_id = c.id
    `;
    
    if (classId) {
      sql += ' WHERE s.class_id = ?';
      sql += ' ORDER BY s.created_at DESC';
      const students = db.prepare(sql).all(classId);
      return res.json({ success: true, data: students });
    }
    
    sql += ' ORDER BY s.created_at DESC LIMIT 100';
    const students = db.prepare(sql).all();
    res.json({ success: true, data: students });
  } catch (error) {
    console.error('获取学生列表错误:', error);
    res.json({ success: false, message: '获取失败' });
  }
});

// 创建学生
router.post('/students', (req, res) => {
  const { studentNumber, name, classId } = req.body;
  
  if (!studentNumber || !name) {
    return res.json({ success: false, message: '请填写学号和姓名' });
  }
  
  const db = getDatabase();
  
  try {
    const existing = db.prepare('SELECT id FROM students WHERE student_number = ?').get(studentNumber);
    if (existing) {
      return res.json({ success: false, message: '学号已存在' });
    }
    
    const result = db.prepare('INSERT INTO students (student_number, name, class_id) VALUES (?, ?, ?)').run(
      studentNumber, name, classId || null
    );
    res.json({ success: true, message: '创建成功', data: { id: result.lastInsertRowid } });
  } catch (error) {
    console.error('创建学生错误:', error);
    res.json({ success: false, message: '创建失败' });
  }
});

// 删除学生
router.delete('/students/:id', (req, res) => {
  const { id } = req.params;
  const db = getDatabase();
  
  try {
    db.prepare('DELETE FROM answers WHERE student_id = ?').run(id);
    db.prepare('DELETE FROM classroom_students WHERE student_id = ?').run(id);
    db.prepare('DELETE FROM students WHERE id = ?').run(id);
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    console.error('删除学生错误:', error);
    res.json({ success: false, message: '删除失败' });
  }
});

// ============ 系统配置 ============

// 获取系统配置
router.get('/config', (req, res) => {
  const db = getDatabase();
  
  try {
    const configs = db.prepare('SELECT * FROM system_config').all();
    const configMap = {};
    configs.forEach(c => {
      configMap[c.key] = c.value;
    });
    res.json({ success: true, data: configMap });
  } catch (error) {
    console.error('获取配置错误:', error);
    res.json({ success: false, message: '获取失败' });
  }
});

// 更新系统配置
router.put('/config', (req, res) => {
  const { key, value, description } = req.body;
  
  if (!key) {
    return res.json({ success: false, message: '配置键不能为空' });
  }
  
  const db = getDatabase();
  
  try {
    db.prepare('INSERT OR REPLACE INTO system_config (key, value, description, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)').run(
      key, value, description || null
    );
    res.json({ success: true, message: '配置已更新' });
  } catch (error) {
    console.error('更新配置错误:', error);
    res.json({ success: false, message: '更新失败' });
  }
});

// ============ 数据统计 ============

// 获取全局统计数据
router.get('/stats', (req, res) => {
  const db = getDatabase();
  
  try {
    // 教师数量
    const teacherCount = db.prepare('SELECT COUNT(*) as count FROM teachers').get().count;
    
    // 班级数量
    const classCount = db.prepare('SELECT COUNT(*) as count FROM classes').get().count;
    
    // 学生数量
    const studentCount = db.prepare('SELECT COUNT(*) as count FROM students').get().count;
    
    // 课堂数量
    const classroomCount = db.prepare('SELECT COUNT(*) as count FROM classrooms').get().count;
    
    // 回答数量
    const answerCount = db.prepare('SELECT COUNT(*) as count FROM answers').get().count;
    
    // 平均分
    const avgScore = db.prepare('SELECT AVG(total_score) as avg FROM answers').get().avg || 0;
    
    // 各维度平均分
    const answers = db.prepare('SELECT dimensions FROM answers WHERE dimensions IS NOT NULL').all();
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
    if (dimensionCount > 0) {
      for (const key in dimensionTotals) {
        dimensionAvgs[key] = Math.round((dimensionTotals[key] / dimensionCount) * 10) / 10;
      }
    }
    
    // 最近活动
    const recentAnswers = db.prepare(`
      SELECT a.*, s.name as student_name, q.content as question_content
      FROM answers a
      JOIN students s ON a.student_id = s.id
      JOIN questions q ON a.question_id = q.id
      ORDER BY a.evaluated_at DESC
      LIMIT 10
    `).all();
    
    res.json({
      success: true,
      data: {
        teacherCount,
        classCount,
        studentCount,
        classroomCount,
        answerCount,
        avgScore: Math.round(avgScore * 10) / 10,
        dimensionAvgs,
        recentAnswers
      }
    });
  } catch (error) {
    console.error('获取统计错误:', error);
    res.json({ success: false, message: '获取失败' });
  }
});

// ============ 课堂管理 ============

// 获取所有课堂（含模块信息）
router.get('/classrooms', (req, res) => {
  const db = getDatabase();
  
  try {
    const classrooms = db.prepare(`
      SELECT c.*, t.nickname as teacher_name, m.name as module_name,
             (SELECT COUNT(*) FROM questions WHERE classroom_id = c.id) as question_count,
             (SELECT COUNT(*) FROM classroom_students WHERE classroom_id = c.id) as student_count
      FROM classrooms c
      LEFT JOIN teachers t ON c.teacher_id = t.id
      LEFT JOIN modules m ON c.module_id = m.id
      ORDER BY c.created_at DESC
    `).all();
    
    res.json({ success: true, data: classrooms });
  } catch (error) {
    console.error('获取课堂列表错误:', error);
    res.json({ success: false, message: '获取失败' });
  }
});

// 获取指定课堂的所有问题
router.get('/classrooms/:id/questions', (req, res) => {
  const { id } = req.params;
  const db = getDatabase();
  
  try {
    const questions = db.prepare(`
      SELECT q.*, 
             (SELECT COUNT(*) FROM answers WHERE question_id = q.id) as answer_count,
             c.name as classroom_name
      FROM questions q
      LEFT JOIN classrooms c ON q.classroom_id = c.id
      WHERE q.classroom_id = ?
      ORDER BY q.created_at DESC
    `).all(id);
    
    // 解析维度数据
    questions.forEach(q => {
      if (q.dimensions) {
        try {
          q.dimensions = JSON.parse(q.dimensions);
        } catch (e) {}
      }
    });
    
    res.json({ success: true, data: questions });
  } catch (error) {
    console.error('获取问题列表错误:', error);
    res.json({ success: false, message: '获取失败' });
  }
});

// ============ 问题答案管理 ============

// 获取指定问题的所有学生回答
router.get('/questions/:id/answers', (req, res) => {
  const { id } = req.params;
  const { sortBy = 'created_at', order = 'DESC' } = req.query;
  const db = getDatabase();
  
  try {
    // 验证排序字段，防止SQL注入
    const allowedSortFields = ['created_at', 'total_score', 'student_name', 'student_number'];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
    const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    
    const answers = db.prepare(`
      SELECT a.*, s.name as student_name, s.student_number
      FROM answers a
      JOIN students s ON a.student_id = s.id
      WHERE a.question_id = ?
      ORDER BY ${sortField} ${sortOrder}
    `).all(id);
    
    // 解析数据
    answers.forEach(a => {
      if (a.evaluation) {
        try {
          a.evaluation = JSON.parse(a.evaluation);
        } catch (e) {}
      }
      if (a.dimensions) {
        try {
          a.dimensions = JSON.parse(a.dimensions);
        } catch (e) {}
      }
    });
    
    // 获取问题信息
    const question = db.prepare(`
      SELECT q.*, c.name as classroom_name
      FROM questions q
      LEFT JOIN classrooms c ON q.classroom_id = c.id
      WHERE q.id = ?
    `).get(id);
    
    if (question && question.dimensions) {
      try {
        question.dimensions = JSON.parse(question.dimensions);
      } catch (e) {}
    }
    
    res.json({ 
      success: true, 
      data: { 
        answers,
        question
      }
    });
  } catch (error) {
    console.error('获取回答列表错误:', error);
    res.json({ success: false, message: '获取失败' });
  }
});

// 批量导入答案
router.post('/questions/:id/answers/import', async (req, res) => {
  const { id } = req.params;
  const { answers } = req.body;
  const db = getDatabase();
  
  if (!answers || !Array.isArray(answers) || answers.length === 0) {
    return res.json({ success: false, message: '请提供要导入的答案数据' });
  }
  
  try {
    // 获取问题信息
    const question = db.prepare(`
      SELECT q.*, c.id as cr_id
      FROM questions q
      LEFT JOIN classrooms c ON q.classroom_id = c.id
      WHERE q.id = ?
    `).get(id);
    
    if (!question) {
      return res.json({ success: false, message: '问题不存在' });
    }
    
    // 获取问题的维度设置
    let selectedDimensions = ['perception', 'emotion', 'culture', 'aesthetic', 'expression'];
    if (question.dimensions) {
      try {
        selectedDimensions = JSON.parse(question.dimensions);
      } catch (e) {}
    }
    
    const results = {
      success: 0,
      failed: 0,
      errors: []
    };
    
    for (let i = 0; i < answers.length; i++) {
      const item = answers[i];
      
      if (!item.studentNumber || !item.content) {
        results.failed++;
        results.errors.push(`第${i + 1}行：学号和回答内容不能为空`);
        continue;
      }
      
      try {
        // 查找或创建学生
        let student = db.prepare('SELECT * FROM students WHERE student_number = ?').get(item.studentNumber);
        
        if (!student) {
          // 创建新学生
          const insertResult = db.prepare('INSERT INTO students (student_number, name) VALUES (?, ?)').run(
            item.studentNumber,
            item.studentName || `学生${item.studentNumber}`
          );
          student = { id: insertResult.lastInsertRowid };
        } else if (item.studentName && student.name !== item.studentName) {
          // 更新学生姓名（如果提供了且不同）
          db.prepare('UPDATE students SET name = ? WHERE id = ?').run(item.studentName, student.id);
          student.name = item.studentName;
        }
        
        // 评价答案
        let evaluation;
        
        if (question.question_type === 'audio') {
          // 音标题：使用手动评分或默认值
          const score = item.score !== undefined ? item.score : 0;
          evaluation = {
            dimensions: { pitch: score },
            totalScore: score,
            comment: score > 0 ? `手动评分：${score}分` : '待教师评价',
            method: item.score !== undefined ? 'manual' : 'pending'
          };
        } else {
          // 文字题：使用关键词评价
          evaluation = keywordEval.evaluate(question.content, item.content, selectedDimensions);
        }
        
        // 检查是否已存在回答
        const existingAnswer = db.prepare('SELECT * FROM answers WHERE question_id = ? AND student_id = ?').get(
          id, student.id
        );
        
        let answerId;
        
        if (existingAnswer) {
          // 更新已有回答
          db.prepare(`
            UPDATE answers SET content = ?, evaluation = ?, dimensions = ?, total_score = ?, 
              comment = ?, eval_method = ?, evaluated_at = CURRENT_TIMESTAMP
            WHERE question_id = ? AND student_id = ?
          `).run(
            item.content,
            JSON.stringify(evaluation),
            JSON.stringify(evaluation.dimensions),
            evaluation.totalScore,
            evaluation.comment,
            evaluation.method,
            id, student.id
          );
          answerId = existingAnswer.id;
        } else {
          // 插入新回答
          const insertResult = db.prepare(`
            INSERT INTO answers (question_id, student_id, content, evaluation, dimensions, total_score, comment, eval_method)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            id,
            student.id,
            item.content,
            JSON.stringify(evaluation),
            JSON.stringify(evaluation.dimensions),
            evaluation.totalScore,
            evaluation.comment,
            evaluation.method
          );
          answerId = insertResult.lastInsertRowid;
        }
        
        // 更新学生素养记录
        updateCompetencyRecord(db, student.id, evaluation.dimensions, selectedDimensions);
        
        results.success++;
      } catch (err) {
        results.failed++;
        results.errors.push(`第${i + 1}行（学号${item.studentNumber}）：${err.message}`);
      }
    }
    
    // 通过Socket.io广播更新
    const io = req.app.get('io');
    if (io && results.success > 0) {
      io.to(`classroom:${question.cr_id}`).emit('answer-imported', {
        questionId: id,
        importedCount: results.success
      });
      
      // 广播课堂统计更新
      const stats = getClassroomStats(db, question.cr_id);
      io.to(`classroom:${question.cr_id}`).emit('classroom-stats', stats);
    }
    
    res.json({
      success: true,
      message: `导入完成：成功${results.success}条，失败${results.failed}条`,
      data: results
    });
  } catch (error) {
    console.error('批量导入答案错误:', error);
    res.json({ success: false, message: '导入失败：' + error.message });
  }
});

// 单条录入答案
router.post('/questions/:id/answers/single', async (req, res) => {
  const { id } = req.params;
  const { studentName, studentNumber, content, score } = req.body;
  const db = getDatabase();
  
  if (!studentNumber || !content) {
    return res.json({ success: false, message: '学号和回答内容不能为空' });
  }
  
  try {
    // 获取问题信息
    const question = db.prepare(`
      SELECT q.*, c.id as cr_id
      FROM questions q
      LEFT JOIN classrooms c ON q.classroom_id = c.id
      WHERE q.id = ?
    `).get(id);
    
    if (!question) {
      return res.json({ success: false, message: '问题不存在' });
    }
    
    // 获取问题的维度设置
    let selectedDimensions = ['perception', 'emotion', 'culture', 'aesthetic', 'expression'];
    if (question.dimensions) {
      try {
        selectedDimensions = JSON.parse(question.dimensions);
      } catch (e) {}
    }
    
    // 查找或创建学生
    let student = db.prepare('SELECT * FROM students WHERE student_number = ?').get(studentNumber);
    
    if (!student) {
      const insertResult = db.prepare('INSERT INTO students (student_number, name) VALUES (?, ?)').run(
        studentNumber,
        studentName || `学生${studentNumber}`
      );
      student = { id: insertResult.lastInsertRowid, name: studentName || `学生${studentNumber}` };
    } else if (studentName && student.name !== studentName) {
      db.prepare('UPDATE students SET name = ? WHERE id = ?').run(studentName, student.id);
      student.name = studentName;
    }
    
    // 评价答案
    let evaluation;
    
    if (question.question_type === 'audio') {
      const pitchScore = score !== undefined ? score : 0;
      evaluation = {
        dimensions: { pitch: pitchScore },
        totalScore: pitchScore,
        comment: pitchScore > 0 ? `手动评分：${pitchScore}分` : '待教师评价',
        method: score !== undefined ? 'manual' : 'pending'
      };
    } else {
      evaluation = keywordEval.evaluate(question.content, content, selectedDimensions);
    }
    
    // 检查是否已存在回答
    const existingAnswer = db.prepare('SELECT * FROM answers WHERE question_id = ? AND student_id = ?').get(
      id, student.id
    );
    
    let answerId;
    
    if (existingAnswer) {
      db.prepare(`
        UPDATE answers SET content = ?, evaluation = ?, dimensions = ?, total_score = ?, 
          comment = ?, eval_method = ?, evaluated_at = CURRENT_TIMESTAMP
        WHERE question_id = ? AND student_id = ?
      `).run(
        content,
        JSON.stringify(evaluation),
        JSON.stringify(evaluation.dimensions),
        evaluation.totalScore,
        evaluation.comment,
        evaluation.method,
        id, student.id
      );
      answerId = existingAnswer.id;
    } else {
      const insertResult = db.prepare(`
        INSERT INTO answers (question_id, student_id, content, evaluation, dimensions, total_score, comment, eval_method)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        student.id,
        content,
        JSON.stringify(evaluation),
        JSON.stringify(evaluation.dimensions),
        evaluation.totalScore,
        evaluation.comment,
        evaluation.method
      );
      answerId = insertResult.lastInsertRowid;
    }
    
    // 更新学生素养记录
    updateCompetencyRecord(db, student.id, evaluation.dimensions, selectedDimensions);
    
    // Socket广播
    const io = req.app.get('io');
    if (io) {
      io.to(`classroom:${question.cr_id}`).emit('answer-added', {
        questionId: id,
        studentId: student.id,
        studentName: student.name,
        totalScore: evaluation.totalScore
      });
      
      const stats = getClassroomStats(db, question.cr_id);
      io.to(`classroom:${question.cr_id}`).emit('classroom-stats', stats);
    }
    
    res.json({
      success: true,
      message: '录入成功',
      data: {
        answerId,
        studentId: student.id,
        studentName: student.name,
        totalScore: evaluation.totalScore,
        comment: evaluation.comment
      }
    });
  } catch (error) {
    console.error('录入答案错误:', error);
    res.json({ success: false, message: '录入失败：' + error.message });
  }
});

// 删除回答
router.delete('/answers/:id', (req, res) => {
  const { id } = req.params;
  const db = getDatabase();
  
  try {
    // 获取回答信息（用于广播）
    const answer = db.prepare(`
      SELECT a.*, q.classroom_id
      FROM answers a
      JOIN questions q ON a.question_id = q.id
      WHERE a.id = ?
    `).get(id);
    
    if (!answer) {
      return res.json({ success: false, message: '回答不存在' });
    }
    
    // 删除回答
    db.prepare('DELETE FROM answers WHERE id = ?').run(id);
    
    // 通过Socket广播
    const io = req.app.get('io');
    if (io) {
      io.to(`classroom:${answer.classroom_id}`).emit('answer-deleted', {
        answerId: id,
        questionId: answer.question_id
      });
      
      const stats = getClassroomStats(db, answer.classroom_id);
      io.to(`classroom:${answer.classroom_id}`).emit('classroom-stats', stats);
    }
    
    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    console.error('删除回答错误:', error);
    res.json({ success: false, message: '删除失败' });
  }
});

// 下载导入模板
router.get('/template/download', (req, res) => {
  // 返回CSV格式的模板
  const template = `序号,学生姓名,学号,回答内容,评分(可选)
1,张三,2024001,请在此输入回答内容,
2,李四,2024002,请在此输入回答内容,`;
  
  res.setHeader('Content-Type', 'text/csv;charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=answer_import_template.csv');
  res.send('\ufeff' + template); // \ufeff 是BOM，用于Excel正确识别UTF-8
});

module.exports = router;
