/**
 * 认证路由
 * 处理登录、登出等认证相关请求
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { getDatabase } = require('../db/init');

// 登录接口
router.post('/login', (req, res) => {
  const { username, password, role } = req.body;
  
  if (!username || !password || !role) {
    return res.json({ success: false, message: '请填写完整的登录信息' });
  }
  
  const db = getDatabase();
  
  try {
    let user = null;
    let userType = '';
    
    if (role === 'admin') {
      user = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
      userType = 'admin';
    } else if (role === 'teacher') {
      user = db.prepare('SELECT * FROM teachers WHERE username = ?').get(username);
      userType = 'teacher';
    } else {
      return res.json({ success: false, message: '无效的角色类型' });
    }
    
    if (!user) {
      return res.json({ success: false, message: '用户名不存在' });
    }
    
    // 验证密码
    const isValid = bcrypt.compareSync(password, user.password);
    if (!isValid) {
      return res.json({ success: false, message: '密码错误' });
    }
    
    // 生成简单的会话标识
    const sessionToken = Buffer.from(`${userType}:${user.id}:${Date.now()}`).toString('base64');
    
    // 存储会话
    req.session.user = {
      id: user.id,
      username: user.username,
      nickname: user.nickname || user.username,
      role: userType
    };
    req.session.token = sessionToken;
    
    res.json({
      success: true,
      message: '登录成功',
      data: {
        token: sessionToken,
        user: {
          id: user.id,
          username: user.username,
          nickname: user.nickname || user.username,
          role: userType
        },
        redirectUrl: userType === 'admin' ? '/admin' : '/teacher'
      }
    });
  } catch (error) {
    console.error('登录错误:', error);
    res.json({ success: false, message: '登录失败，请稍后再试' });
  }
});

// 学生扫码加入
router.post('/join', (req, res) => {
  const { sessionId, studentName, studentNumber } = req.body;
  
  if (!sessionId || !studentName) {
    return res.json({ success: false, message: '请提供课堂ID和学生姓名' });
  }
  
  const db = getDatabase();
  
  try {
    // 查找课堂
    const classroom = db.prepare(`
      SELECT c.*, t.nickname as teacher_name 
      FROM classrooms c 
      JOIN teachers t ON c.teacher_id = t.id 
      WHERE c.session_id = ? AND c.status = 'active'
    `).get(sessionId);
    
    if (!classroom) {
      return res.json({ success: false, message: '课堂不存在或已结束' });
    }
    
    // 查找或创建学生
    let student = null;
    
    if (studentNumber) {
      student = db.prepare('SELECT * FROM students WHERE student_number = ?').get(studentNumber);
    }
    
    if (!student) {
      // 使用临时姓名创建学生（未绑定学号）
      const result = db.prepare('INSERT INTO students (student_number, name, class_id) VALUES (?, ?, ?)').run(
        studentNumber || `temp_${Date.now()}`,
        studentName,
        classroom.class_id
      );
      student = { id: result.lastInsertRowid, name: studentName };
    }
    
    // 加入课堂
    try {
      db.prepare('INSERT INTO classroom_students (classroom_id, student_id) VALUES (?, ?)').run(
        classroom.id,
        student.id
      );
    } catch (e) {
      // 已加入课堂，忽略重复加入错误
    }
    
    // 生成学生会话
    const sessionToken = Buffer.from(`student:${student.id}:${Date.now()}`).toString('base64');
    
    req.session.user = {
      id: student.id,
      name: student.name,
      role: 'student',
      classroomId: classroom.id,
      sessionId: sessionId
    };
    req.session.token = sessionToken;
    
    res.json({
      success: true,
      message: '加入成功',
      data: {
        token: sessionToken,
        user: {
          id: student.id,
          name: student.name,
          role: 'student'
        },
        classroom: {
          id: classroom.id,
          name: classroom.name,
          teacherName: classroom.teacher_name
        },
        redirectUrl: `/answer/${sessionId}`
      }
    });
  } catch (error) {
    console.error('加入课堂错误:', error);
    res.json({ success: false, message: '加入失败，请稍后再试' });
  }
});

// 获取当前登录用户信息
router.get('/current', (req, res) => {
  if (req.session.user) {
    res.json({
      success: true,
      data: {
        user: req.session.user
      }
    });
  } else {
    res.json({
      success: false,
      message: '未登录'
    });
  }
});

// 登出
router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true, message: '已退出登录' });
});

// 修改密码（管理员）
router.post('/change-password', (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const user = req.session.user;
  
  if (!user || user.role !== 'admin') {
    return res.json({ success: false, message: '无权限' });
  }
  
  if (!oldPassword || !newPassword) {
    return res.json({ success: false, message: '请填写完整信息' });
  }
  
  if (newPassword.length < 6) {
    return res.json({ success: false, message: '新密码至少6位' });
  }
  
  const db = getDatabase();
  
  try {
    const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(user.id);
    
    if (!bcrypt.compareSync(oldPassword, admin.password)) {
      return res.json({ success: false, message: '原密码错误' });
    }
    
    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE admins SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
      hashedPassword,
      user.id
    );
    
    res.json({ success: true, message: '密码修改成功' });
  } catch (error) {
    console.error('修改密码错误:', error);
    res.json({ success: false, message: '修改失败' });
  }
});

module.exports = router;
