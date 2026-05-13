/**
 * AI评价服务
 * 调用外部AI API对学生的音乐鉴赏回答进行评分
 */

const config = require('../config');
const { musicKeywords } = require('../db/music-keywords');

// 维度名称映射
const dimensionNames = {
  perception: '音乐感知力',
  emotion: '情感理解力',
  culture: '文化认知',
  aesthetic: '审美判断',
  expression: '表达规范'
};

// 维度权重映射
const dimensionWeights = {
  perception: 1.0,
  emotion: 1.2,
  culture: 1.0,
  aesthetic: 1.1,
  expression: 0.8
};

/**
 * 使用AI API进行评价
 * @param {string} question - 问题内容
 * @param {string} answer - 学生回答
 * @param {string} studentName - 学生姓名
 * @param {Array} dimensions - 选中的维度数组，如 ['perception', 'emotion']
 * @returns {Promise<Object>} 评价结果
 */
async function evaluateWithAI(question, answer, studentName, dimensions = null) {
  // 检查是否启用AI
  if (!config.ai.enabled || !config.ai.apiKey) {
    console.log('AI评价未启用或未配置API Key');
    return null;
  }

  // 如果没有指定维度，默认全部
  const selectedDimensions = dimensions && dimensions.length > 0 
    ? dimensions 
    : Object.keys(dimensionNames);

  // 构建Prompt
  const prompt = buildEvaluationPrompt(question, answer, studentName, selectedDimensions);
  
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
            content: buildSystemPrompt(selectedDimensions)
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
    const evaluation = parseAIResponse(content, selectedDimensions);
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
 * 构建系统Prompt - 动态生成
 */
function buildSystemPrompt(dimensions) {
  // 构建动态维度描述
  const dimensionDescs = dimensions.map((dim, index) => {
    const weight = dimensionWeights[dim] || 1.0;
    return `${index + 1}. ${dimensionNames[dim]}（权重${weight.toFixed(1)}）`;
  }).join('\n');
  
  // 计算总分：每个维度10分
  const totalScore = dimensions.length * 10;
  
  // 构建动态dimensions JSON模板
  const dimensionsJsonParts = dimensions.map(dim => `"${dim}": 分数(0-10)`);
  const dimensionsJson = dimensionsJsonParts.join(',\n    ');
  
  return `你是一位专业的音乐教育评价专家。请根据学生的回答给出公正、专业的评价。

本次评价维度（共${dimensions.length}个，每个维度10分制）：
${dimensionDescs}

请严格按照以下JSON格式返回评价结果，不要添加任何额外的解释或文字：
{
  "dimensions": {
    ${dimensionsJson}
  },
  "totalScore": 总分(0-${totalScore}),
  "comment": "综合评语，30-100字左右",
  "highlights": ["亮点1", "亮点2"],
  "suggestions": ["建议1", "建议2"]
}`;
}

/**
 * 构建评价Prompt
 */
function buildEvaluationPrompt(question, answer, studentName, dimensions) {
  // 构建关键词提示 - 只包含选中的维度
  let keywordHints = '\n音乐鉴赏常用关键词参考：\n';
  
  for (const dim of dimensions) {
    if (musicKeywords[dim]) {
      const displayName = musicKeywords[dim].name;
      const keywords = musicKeywords[dim].keywords.slice(0, 15).join('、');
      keywordHints += `- ${displayName}：${keywords}...\n`;
    }
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
function parseAIResponse(content, dimensions) {
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
    
    // 确保各维度分数在有效范围内 - 只处理选中的维度
    const dimensionScores = {};
    const allDimensionKeys = ['perception', 'emotion', 'culture', 'aesthetic', 'expression'];
    
    for (const key of allDimensionKeys) {
      if (dimensions.includes(key) && result.dimensions[key] !== undefined) {
        dimensionScores[key] = Math.max(0, Math.min(10, Number(result.dimensions[key]) || 0));
      } else {
        dimensionScores[key] = 0; // 未选中的维度设为0
      }
    }
    
    // 确保总分在有效范围内
    const maxScore = dimensions.length * 10;
    const totalScore = Math.max(0, Math.min(maxScore, Number(result.totalScore) || 0));
    
    return {
      dimensions: dimensionScores,
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
