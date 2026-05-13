/**
 * 关键词评价服务（兜底方案）
 * 当AI API不可用时，使用关键词匹配进行评分
 */

const { evaluateWithKeywords } = require('../db/music-keywords');

/**
 * 评价回答
 * @param {string} question - 问题内容
 * @param {string} answer - 学生回答
 * @returns {Object} 评价结果
 */
function evaluate(question, answer) {
  // 直接使用关键词库进行评分
  const result = evaluateWithKeywords(answer, { content: question });
  
  // 确保结果格式与AI评价一致
  result.highlights = [];
  result.suggestions = [];
  
  // 根据得分添加建议
  if (result.totalScore < 10) {
    result.suggestions.push('建议多使用音乐专业术语来描述作品');
    result.suggestions.push('可以尝试从情感和文化角度深入分析');
  } else if (result.totalScore < 20) {
    result.suggestions.push('回答较为基础，建议增加对音乐要素的描述');
    result.suggestions.push('可以尝试联系音乐的历史文化背景');
  } else if (result.totalScore < 35) {
    result.suggestions.push('表现不错，可以进一步完善回答结构');
    result.suggestions.push('尝试加入更多音乐鉴赏的专业表达');
  } else {
    result.suggestions.push('回答非常出色，继续保持！');
  }
  
  // 找出亮点
  for (const [dimension, score] of Object.entries(result.dimensions)) {
    if (score >= 6) {
      const dimensionNames = {
        perception: '音乐感知力',
        emotion: '情感理解力',
        culture: '文化认知',
        aesthetic: '审美判断',
        expression: '表达规范'
      };
      result.highlights.push(`${dimensionNames[dimension]}表现突出`);
    }
  }
  
  return result;
}

module.exports = {
  evaluate
};
