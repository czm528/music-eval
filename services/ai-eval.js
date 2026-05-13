/**
 * AI评价服务
 * 调用外部AI API对学生的音乐鉴赏回答进行评分
 */

const config = require('../config');
const { musicKeywords } = require('../db/music-keywords');

/**
 * 使用AI API进行评价
 * @param {string} question - 问题内容
 * @param {string} answer - 学生回答
 * @param {string} studentName - 学生姓名
 * @returns {Promise<Object>} 评价结果
 */
async function evaluateWithAI(question, answer, studentName) {
  // 检查是否启用AI
  if (!config.ai.enabled || !config.ai.apiKey) {
    console.log('AI评价未启用或未配置API Key');
    return null;
  }

  // 构建Prompt
  const prompt = buildEvaluationPrompt(question, answer, studentName);
  
  try {
    const response = await fetch(config.ai.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.ai.apiKey}`
      },
      body: JSON.stringify({
        model: config.ai.model,
        messages: [
          {
            role: 'system',
            content: `你是一位专业的音乐教育评价专家。请根据学生的回答给出公正、专业的评价。
            
评价维度及权重：
1. 音乐感知力（能否准确描述音乐的基本要素）- 权重1.0
2. 情感理解力（能否理解音乐表达的情感和意境）- 权重1.2
3. 文化认知（能否关联音乐的文化背景、时代特征）- 权重1.0
4. 审美判断（能否对音乐做出有理有据的审美评价）- 权重1.1
5. 表达规范（语言表达的准确性和完整性）- 权重0.8

请严格按照以下JSON格式返回评价结果，不要添加任何额外的解释或文字：
{
  "dimensions": {
    "perception": 分数(0-10),
    "emotion": 分数(0-10),
    "culture": 分数(0-10),
    "aesthetic": 分数(0-10),
    "expression": 分数(0-10)
  },
  "totalScore": 总分(0-50),
  "comment": "综合评语，30-100字左右",
  "highlights": ["亮点1", "亮点2"],
  "suggestions": ["建议1", "建议2"]
}`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 800
      }),
      signal: AbortSignal.timeout(config.ai.timeout)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API请求失败:', response.status, errorText);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      console.error('AI API返回内容为空');
      return null;
    }

    // 解析JSON响应
    const evaluation = parseAIResponse(content);
    if (evaluation) {
      evaluation.method = 'ai';
      return evaluation;
    }
    
    return null;
  } catch (error) {
    console.error('AI评价请求异常:', error.message);
    return null;
  }
}

/**
 * 构建评价Prompt
 */
function buildEvaluationPrompt(question, answer, studentName) {
  // 构建关键词提示
  let keywordHints = '\n音乐鉴赏常用关键词参考：\n';
  
  for (const [dimension, config] of Object.entries(musicKeywords)) {
    const displayName = config.name;
    const keywords = config.keywords.slice(0, 15).join('、');
    keywordHints += `- ${displayName}：${keywords}...\n`;
  }
  
  return `学生姓名：${studentName}

问题：${question}

学生回答：
${answer}

${keywordHints}

请对以上回答进行评价。`;
}

/**
 * 解析AI响应
 */
function parseAIResponse(content) {
  try {
    // 尝试提取JSON（处理可能的markdown代码块）
    let jsonStr = content;
    
    // 移除markdown代码块标记
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }
    
    // 尝试找到JSON对象
    const startIdx = jsonStr.indexOf('{');
    const endIdx = jsonStr.lastIndexOf('}');
    
    if (startIdx === -1 || endIdx === -1) {
      console.error('未找到JSON对象');
      return null;
    }
    
    jsonStr = jsonStr.substring(startIdx, endIdx + 1);
    
    // 解析JSON
    const result = JSON.parse(jsonStr);
    
    // 验证必需字段
    if (!result.dimensions || typeof result.totalScore !== 'number') {
      console.error('AI响应格式不完整');
      return null;
    }
    
    // 确保各维度分数在有效范围内
    const dimensions = {};
    for (const [key, value] of Object.entries(result.dimensions)) {
      dimensions[key] = Math.max(0, Math.min(10, Number(value) || 0));
    }
    
    // 确保总分在有效范围内
    const totalScore = Math.max(0, Math.min(50, Number(result.totalScore) || 0));
    
    return {
      dimensions,
      dimensionDetails: {}, // AI评价不返回详细关键词
      lengthBonus: 0,
      structureBonus: 0,
      totalScore,
      comment: result.comment || '评价已完成',
      highlights: result.highlights || [],
      suggestions: result.suggestions || [],
      method: 'ai'
    };
  } catch (error) {
    console.error('解析AI响应失败:', error.message);
    return null;
  }
}

module.exports = {
  evaluateWithAI
};
