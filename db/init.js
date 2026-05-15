/**
 * 数据库初始化脚本
 * 创建所有必要的表并插入示例数据
 * 
 * 【重要】Render免费版文件系统说明：
 * Render的免费版使用临时文件系统，服务重启后数据会丢失。
 * 如果需要持久化存储，请考虑：
 *   1. 升级到Render付费版（支持持久化磁盘）
 *   2. 使用外部数据库服务如Render的PostgreSQL
 *   3. 本地开发不受影响
 */

const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const config = require('../config');
const { musicKeywords } = require('./music-keywords');
const path = require('path');
const fs = require('fs');

// 数据库路径 - 优先使用环境变量DATA_DIR（持久化硬盘挂载目录）
// 如果设置了DATA_DIR，数据库文件存到持久化目录；否则存到当前目录
const dataDir = process.env.DATA_DIR || __dirname;
const dbPath = path.join(dataDir, 'music-eval.db');

// 确保数据库目录存在
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

// 启用外键约束
db.pragma('foreign_keys = ON');

/**
 * 初始化数据库
 */
function initDatabase() {
  console.log('正在初始化数据库...');
  
  // 创建管理员表
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      nickname TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // 创建教师表
  db.exec(`
    CREATE TABLE IF NOT EXISTS teachers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      nickname TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // 创建班级表
  db.exec(`
    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      grade TEXT,
      description TEXT,
      teacher_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (teacher_id) REFERENCES teachers(id)
    )
  `);
  
  // 创建学生表
  db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_number TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      class_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (class_id) REFERENCES classes(id)
    )
  `);
  
  // 创建课堂表
  db.exec(`
    CREATE TABLE IF NOT EXISTS classrooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      teacher_id INTEGER NOT NULL,
      class_id INTEGER,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME,
      FOREIGN KEY (teacher_id) REFERENCES teachers(id),
      FOREIGN KEY (class_id) REFERENCES classes(id)
    )
  `);
  
  // 创建课堂学生关联表
  db.exec(`
    CREATE TABLE IF NOT EXISTS classroom_students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      classroom_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      join_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(classroom_id, student_id),
      FOREIGN KEY (classroom_id) REFERENCES classrooms(id),
      FOREIGN KEY (student_id) REFERENCES students(id)
    )
  `);
  
  // 创建问题表
  db.exec(`
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      classroom_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      dimensions TEXT,
      question_type TEXT DEFAULT 'text',
      reference_audio TEXT DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME,
      FOREIGN KEY (classroom_id) REFERENCES classrooms(id)
    )
  `);
  
  // 创建回答表
  db.exec(`
    CREATE TABLE IF NOT EXISTS answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      evaluation TEXT,
      dimensions TEXT,
      total_score REAL,
      comment TEXT,
      eval_method TEXT,
      evaluated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (question_id) REFERENCES questions(id),
      FOREIGN KEY (student_id) REFERENCES students(id)
    )
  `);
  
  // 创建素养记录表（学生历史评价汇总）
  db.exec(`
    CREATE TABLE IF NOT EXISTS competency_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      dimension TEXT NOT NULL,
      total_score REAL DEFAULT 0,
      answer_count INTEGER DEFAULT 0,
      avg_score REAL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_id, dimension),
      FOREIGN KEY (student_id) REFERENCES students(id)
    )
  `);
  
  // 创建系统配置表
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_config (
      key TEXT PRIMARY KEY,
      value TEXT,
      description TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // 创建关键词库表
  db.exec(`
    CREATE TABLE IF NOT EXISTS keyword_library (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dimension TEXT NOT NULL,
      keyword TEXT NOT NULL,
      weight REAL DEFAULT 1.0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(dimension, keyword)
    )
  `);
  
  console.log('数据库表创建完成');
  
  // 执行数据库迁移
  migrateDatabase();
}

/**
 * 数据库迁移 - 处理字段变更
 */
function migrateDatabase() {
  // 检查questions表是否有旧的dimension字段
  const tableInfo = db.prepare("PRAGMA table_info(questions)").all();
  const columnNames = tableInfo.map(col => col.name);
  
  // 如果有旧的dimension字段，需要迁移到dimensions
  if (columnNames.includes('dimension') && !columnNames.includes('dimensions')) {
    console.log('正在迁移questions表：dimension -> dimensions...');
    
    // 添加新的dimensions列（如果不存在）
    try {
      db.exec("ALTER TABLE questions ADD COLUMN dimensions TEXT");
    } catch (e) {
      // 列可能已存在，忽略错误
    }
    
    // 迁移数据：将旧的dimension值转换为新的dimensions JSON数组格式
    const questionsWithDimension = db.prepare("SELECT id, dimension FROM questions WHERE dimension IS NOT NULL AND dimension != '' AND dimensions IS NULL").all();
    
    for (const q of questionsWithDimension) {
      // 旧的dimension是单个值，需要转换为数组
      const newDimensions = JSON.stringify([q.dimension]);
      db.prepare("UPDATE questions SET dimensions = ? WHERE id = ?").run(newDimensions, q.id);
    }
    
    // 将没有维度的问题设置为默认全部维度
    const questionsWithoutDimension = db.prepare("SELECT id FROM questions WHERE dimensions IS NULL").all();
    const defaultDimensions = JSON.stringify(['perception', 'emotion', 'culture', 'aesthetic', 'expression']);
    
    for (const q of questionsWithoutDimension) {
      db.prepare("UPDATE questions SET dimensions = ? WHERE id = ?").run(defaultDimensions, q.id);
    }
    
    console.log(`迁移完成，共处理 ${questionsWithDimension.length + questionsWithoutDimension.length} 条问题`);
  } else if (!columnNames.includes('dimensions')) {
    // 全新添加dimensions列
    try {
      db.exec("ALTER TABLE questions ADD COLUMN dimensions TEXT");
      // 设置默认值
      const defaultDimensions = JSON.stringify(['perception', 'emotion', 'culture', 'aesthetic', 'expression']);
      db.prepare("UPDATE questions SET dimensions = ? WHERE dimensions IS NULL").run(defaultDimensions);
    } catch (e) {
      console.log('dimensions列已存在或无需迁移');
    }
  }
  
  // 迁移：添加音频相关字段
  const questionsColumns = db.prepare("PRAGMA table_info(questions)").all().map(c => c.name);
  const answersColumns = db.prepare("PRAGMA table_info(answers)").all().map(c => c.name);
  
  const migrations = [
    { table: 'questions', column: 'question_type', checkCols: questionsColumns, type: 'TEXT DEFAULT "text"' },
    { table: 'questions', column: 'reference_audio', checkCols: questionsColumns, type: 'TEXT DEFAULT NULL' },
    { table: 'answers', column: 'audio_file', checkCols: answersColumns, type: 'TEXT DEFAULT NULL' },
    { table: 'answers', column: 'pitch_score', checkCols: answersColumns, type: 'REAL DEFAULT NULL' },
    { table: 'answers', column: 'pitch_deviation', checkCols: answersColumns, type: 'REAL DEFAULT NULL' },
    { table: 'answers', column: 'pitch_curve', checkCols: answersColumns, type: 'TEXT DEFAULT NULL' },
  ];
  
  for (const m of migrations) {
    if (!m.checkCols.includes(m.column)) {
      try {
        db.exec(`ALTER TABLE ${m.table} ADD COLUMN ${m.column} ${m.type}`);
        console.log(`数据库迁移：${m.table} 表添加了 ${m.column} 字段`);
      } catch (e) {
        // 列已存在，忽略
      }
    }
  }
  
  console.log('数据库迁移检查完成');
}

/**
 * 插入示例数据
 */
function insertSampleData() {
  console.log('正在插入示例数据...');
  
  // 检查是否已有管理员
  const existingAdmin = db.prepare('SELECT COUNT(*) as count FROM admins').get();
  if (existingAdmin.count > 0) {
    console.log('管理员已存在，跳过创建');
  } else {
    // 创建默认管理员
    const hashedPassword = bcrypt.hashSync(config.defaultAdmin.password, 10);
    db.prepare('INSERT INTO admins (username, password, nickname) VALUES (?, ?, ?)').run(
      config.defaultAdmin.username,
      hashedPassword,
      '系统管理员'
    );
    console.log('默认管理员已创建: admin / admin123');
  }
  
  // 检查是否已有教师
  const existingTeacher = db.prepare('SELECT COUNT(*) as count FROM teachers').get();
  if (existingTeacher.count > 0) {
    console.log('教师数据已存在，跳过创建');
  } else {
    // 创建示例教师
    const teacherPassword = bcrypt.hashSync('teacher123', 10);
    const teacherResult = db.prepare('INSERT INTO teachers (username, password, nickname, email) VALUES (?, ?, ?, ?)').run(
      'teacher01',
      teacherPassword,
      '张老师',
      'zhang@music.edu'
    );
    const teacherId = teacherResult.lastInsertRowid;
    console.log('示例教师已创建: teacher01 / teacher123');
    
    // 创建示例班级
    const classResult = db.prepare('INSERT INTO classes (name, grade, description, teacher_id) VALUES (?, ?, ?, ?)').run(
      '音乐鉴赏一班',
      '高一',
      '高一音乐鉴赏必修课程班级',
      teacherId
    );
    const classId = classResult.lastInsertRowid;
    console.log('示例班级已创建');
    
    // 创建示例学生
    const students = [
      { number: '2024001', name: '王小明' },
      { number: '2024002', name: '李小红' },
      { number: '2024003', name: '张小华' },
      { number: '2024004', name: '刘大力' },
      { number: '2024005', name: '陈思思' },
      { number: '2024006', name: '杨乐乐' },
      { number: '2024007', name: '赵晓敏' },
      { number: '2024008', name: '周天天' },
      { number: '2024009', name: '吴俊杰' },
      { number: '2024010', name: '郑雅文' }
    ];
    
    const insertStudent = db.prepare('INSERT INTO students (student_number, name, class_id) VALUES (?, ?, ?)');
    for (const student of students) {
      insertStudent.run(student.number, student.name, classId);
    }
    console.log(`${students.length}名示例学生已创建`);
  }
  
  // 插入关键词库到数据库
  const existingKeywords = db.prepare('SELECT COUNT(*) as count FROM keyword_library').get();
  if (existingKeywords.count === 0) {
    console.log('正在导入关键词库...');
    const insertKeyword = db.prepare('INSERT OR IGNORE INTO keyword_library (dimension, keyword, weight) VALUES (?, ?, ?)');
    
    // 使用事务批量插入，大幅提升性能
    const insertKeywordsTransaction = db.transaction(() => {
      for (const [dimension, kwConfig] of Object.entries(musicKeywords)) {
        for (const keyword of kwConfig.keywords) {
          insertKeyword.run(dimension, keyword, kwConfig.weight);
        }
      }
    });
    insertKeywordsTransaction();
    console.log('关键词库导入完成');
  }
  
  // 插入默认系统配置
  const insertConfig = db.prepare('INSERT OR IGNORE INTO system_config (key, value, description) VALUES (?, ?, ?)');
  insertConfig.run('ai_enabled', 'false', '是否启用AI评价');
  insertConfig.run('ai_api_url', '', 'AI API地址');
  insertConfig.run('ai_api_key', '', 'AI API密钥');
  insertConfig.run('ai_model', 'gpt-3.5-turbo', 'AI模型名称');
  console.log('系统配置初始化完成');
}

/**
 * 获取数据库实例
 */
function getDatabase() {
  return db;
}

/**
 * 关闭数据库连接
 */
function closeDatabase() {
  db.close();
}

module.exports = {
  initDatabase,
  insertSampleData,
  getDatabase,
  closeDatabase
};
