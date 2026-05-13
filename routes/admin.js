/**
 * 管理员路由
 * 处理管理员相关的操作：用户管理、班级管理、系统配置、数据统计
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { getDatabase } = require('../db/init');

// 中间件：检查管理员权限
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(401).json({ success: false, message: '无权限访问' });
  }
  next();
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

module.exports = router;
