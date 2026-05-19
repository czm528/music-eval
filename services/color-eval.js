/**
 * 配色题评分服务
 * 比较学生选择的情绪色与教师预设的匹配度
 */

// 情绪相近度矩阵
const EMOTION_PROXIMITY = {
  // 完整矩阵：同色=1.0, 相近情绪=0.7, 中性情绪=0.4, 对立情绪=0.2
  'red-red': 1.0, 'red-orange': 0.7, 'red-yellow': 0.5, 'red-green': 0.2, 'red-blue': 0.2, 'red-purple': 0.3, 'red-white': 0.3, 'red-brown': 0.3,
  'orange-red': 0.7, 'orange-orange': 1.0, 'orange-yellow': 0.7, 'orange-green': 0.3, 'orange-blue': 0.2, 'orange-purple': 0.3, 'orange-white': 0.4, 'orange-brown': 0.5,
  'yellow-red': 0.5, 'yellow-orange': 0.7, 'yellow-yellow': 1.0, 'yellow-green': 0.7, 'yellow-blue': 0.3, 'yellow-purple': 0.4, 'yellow-white': 0.5, 'yellow-brown': 0.4,
  'green-red': 0.2, 'green-orange': 0.3, 'green-yellow': 0.7, 'green-green': 1.0, 'green-blue': 0.7, 'green-purple': 0.5, 'green-white': 0.4, 'green-brown': 0.5,
  'blue-red': 0.2, 'blue-orange': 0.2, 'blue-yellow': 0.3, 'blue-green': 0.7, 'blue-blue': 1.0, 'blue-purple': 0.7, 'blue-white': 0.5, 'blue-brown': 0.3,
  'purple-red': 0.3, 'purple-orange': 0.3, 'purple-yellow': 0.4, 'purple-green': 0.5, 'purple-blue': 0.7, 'purple-purple': 1.0, 'purple-white': 0.5, 'purple-brown': 0.3,
  'white-red': 0.3, 'white-orange': 0.4, 'white-yellow': 0.5, 'white-green': 0.4, 'white-blue': 0.5, 'white-purple': 0.5, 'white-white': 1.0, 'white-brown': 0.3,
  'brown-red': 0.3, 'brown-orange': 0.5, 'brown-yellow': 0.4, 'brown-green': 0.5, 'brown-blue': 0.3, 'brown-purple': 0.3, 'brown-white': 0.3, 'brown-brown': 1.0,
};

// 情绪颜色中文名
const EMOTION_NAMES = {
  red: '激昂',
  orange: '温暖',
  yellow: '欢快',
  green: '宁静',
  blue: '忧伤',
  purple: '神秘',
  white: '空灵',
  brown: '沉稳'
};

// 情绪颜色emoji
const EMOTION_EMOJIS = {
  red: '🔴',
  orange: '🟠',
  yellow: '🟡',
  green: '🟢',
  blue: '🔵',
  purple: '🟣',
  white: '⚪',
  brown: '🟤'
};

/**
 * 评估配色选择
 * @param {Array<{segmentIndex: number, color: string}>} studentSelections - 学生选择
 * @param {Array<{label: string, refColor: string}>} refConfig - 参考配置
 * @returns {{ score: number, matches: Array, detail: object }}
 */
function evaluateColor(studentSelections, refConfig) {
  if (!studentSelections || studentSelections.length === 0) {
    return { score: 0, matches: [], detail: null, comment: '请先选择颜色' };
  }
  
  if (!refConfig || refConfig.length === 0) {
    // 没有参考配置时，只记录选择
    return {
      score: 60,
      matches: studentSelections.map(sel => ({
        segmentIndex: sel.segmentIndex,
        studentColor: sel.color,
        refColor: null,
        proximity: null,
        matched: null
      })),
      detail: null,
      comment: '配色已记录（无参考标准）'
    };
  }
  
  const matches = [];
  let totalScore = 0;
  let matchCount = 0;
  
  // 构建学生选择的映射
  const selectionMap = new Map();
  studentSelections.forEach(sel => {
    selectionMap.set(sel.segmentIndex, sel.color);
  });
  
  // 逐段比较
  for (let i = 0; i < refConfig.length; i++) {
    const ref = refConfig[i];
    const studentColor = selectionMap.get(i) || null;
    
    let proximity = null;
    let matched = null;
    
    if (studentColor) {
      const key = `${studentColor}-${ref.refColor}`;
      const reverseKey = `${ref.refColor}-${studentColor}`;
      proximity = EMOTION_PROXIMITY[key] ?? EMOTION_PROXIMITY[reverseKey] ?? 0.4;
      matched = proximity >= 0.7;
      
      if (matched) matchCount++;
      totalScore += proximity;
    }
    
    matches.push({
      segmentIndex: i,
      label: ref.label,
      studentColor,
      refColor: ref.refColor,
      proximity: proximity !== null ? Math.round(proximity * 100) : null,
      matched
    });
  }
  
  const avgScore = Math.round((totalScore / refConfig.length) * 100 * 10) / 10;
  
  // 生成评语
  let comment = '';
  if (avgScore >= 90) {
    comment = '配色选择非常准确，情感表达很到位！';
  } else if (avgScore >= 75) {
    comment = '配色选择基本正确，很好地表达了音乐情感。';
  } else if (avgScore >= 60) {
    comment = '配色大致符合音乐情感，部分段可以再斟酌。';
  } else if (avgScore >= 40) {
    comment = '配色与音乐情感有些偏差，建议再感受一下音乐。';
  } else {
    comment = '配色与音乐情感差异较大，建议多听多感受。';
  }
  
  return {
    score: avgScore,
    matches,
    detail: {
      totalSegments: refConfig.length,
      matchedSegments: matchCount,
      matchRate: Math.round((matchCount / refConfig.length) * 100)
    },
    comment
  };
}

/**
 * 获取两个颜色之间的相近度
 */
function getProximity(color1, color2) {
  if (color1 === color2) return 1.0;
  const key = `${color1}-${color2}`;
  const reverseKey = `${color2}-${color1}`;
  return EMOTION_PROXIMITY[key] ?? EMOTION_PROXIMITY[reverseKey] ?? 0.4;
}

/**
 * 获取颜色对应的情绪名称
 */
function getEmotionName(color) {
  return EMOTION_NAMES[color] || color;
}

/**
 * 获取颜色对应的emoji
 */
function getEmotionEmoji(color) {
  return EMOTION_EMOJIS[color] || '⬜';
}

/**
 * 预设的8种情绪色卡
 */
const PRESET_COLORS = [
  { id: 'red', name: '激昂', color: '#ef4444', emoji: '🔴' },
  { id: 'orange', name: '温暖', color: '#f97316', emoji: '🟠' },
  { id: 'yellow', name: '欢快', color: '#eab308', emoji: '🟡' },
  { id: 'green', name: '宁静', color: '#22c55e', emoji: '🟢' },
  { id: 'blue', name: '忧伤', color: '#3b82f6', emoji: '🔵' },
  { id: 'purple', name: '神秘', color: '#8b5cf6', emoji: '🟣' },
  { id: 'white', name: '空灵', color: '#d1d5db', emoji: '⚪' },
  { id: 'brown', name: '沉稳', color: '#92400e', emoji: '🟤' },
];

module.exports = {
  evaluateColor,
  getProximity,
  getEmotionName,
  getEmotionEmoji,
  PRESET_COLORS,
  EMOTION_PROXIMITY
};
