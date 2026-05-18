/**
 * 学生相关辅助函数
 * 提供跨模块复用的学生评价和统计功能
 */

/**
 * 更新学生素养记录
 * @param {object} db - 数据库实例
 * @param {number} studentId - 学生ID
 * @param {object} dimensions - 维度分数对象 { perception: 8, emotion: 7, ... }
 * @param {Array} selectedDimensions - 选中的维度数组
 */
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

/**
 * 获取课堂统计
 * @param {object} db - 数据库实例
 * @param {number} classroomId - 课堂ID
 */
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

module.exports = {
  updateCompetencyRecord,
  getClassroomStats
};
