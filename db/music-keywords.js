/**
 * 音乐素养关键词库
 * 包含音乐感知力、理解力、文化认知、审美判断等维度的关键词
 */

const musicKeywords = {
  // 音乐感知力：描述音乐基本要素的词汇
  perception: {
    name: '音乐感知力',
    description: '能否准确描述音乐的基本要素（节奏、旋律、和声、音色、力度等）',
    weight: 1.0,
    keywords: [
      // 节奏相关
      '节奏', '节拍', '韵律', '拍子', '快板', '慢板', '中板', '急板', '缓板',
      '切分音', '附点', '三连音', '四连音', '强弱', '重音', '弱音', '循环',
      // 旋律相关
      '旋律', '音高', '音调', '音阶', '音域', '上行', '下行', '级进', '跳进',
      '模进', '反复', '乐句', '动机', '主题', '装饰音', '倚音', '回旋',
      // 和声相关
      '和声', '和弦', '和声进行', '终止式', '转调', '离调', '属七', '减七',
      '大三和弦', '小三和弦', '增和弦', '减和弦', '主和弦', '下属和弦', '属和弦',
      // 音色相关
      '音色', '音质', '音品', '明亮', '暗淡', '浑厚', '清脆', '柔和', '尖锐',
      '木管', '铜管', '弦乐', '打击乐', '键盘', '人声', '混音', '合成',
      // 力度速度
      '力度', '强度', '音量', '渐强', '渐弱', '突强', '突弱', '倍强', '倍弱',
      '速度', '加速', '减速', '渐快', '渐慢', '原速', '自由速度', 'rubato',
      // 调式调性
      '调性', '调式', '大调', '小调', '自然小调', '和声小调', '旋律小调',
      '五声调式', '民族调式', '宫调式', '商调式', '角调式', '徵调式', '羽调式',
      '中古调式', '教会调式', '利底亚', '混合利底亚', '洛克里亚'
    ]
  },

  // 情感理解力：理解音乐表达的情感和意境
  emotion: {
    name: '情感理解力',
    description: '能否理解音乐表达的情感和意境',
    weight: 1.2,
    keywords: [
      // 基本情感
      '欢快', '快乐', '愉悦', '高兴', '喜悦', '兴奋', '激动', '热情', '热烈',
      '悲伤', '忧郁', '忧伤', '哀伤', '凄凉', '哀怨', '痛苦', '悲怆', '悲壮',
      '平静', '宁静', '安详', '平和', '舒缓', '放松', '安静', '静谧',
      // 复杂情感
      '激昂', '慷慨', '豪迈', '英勇', '庄严', '肃穆', '崇高', '神圣', '敬畏',
      '浪漫', '温馨', '甜蜜', '温柔', '温情', '柔情', '缠绵', '眷恋', '怀念',
      '神秘', '诡异', '阴森', '恐怖', '不安', '紧张', '焦虑', '恐惧',
      '诙谐', '幽默', '俏皮', '活泼', '轻快', '灵动', '跳跃', '流畅',
      // 意境描述
      '意境', '画面', '景象', '场景', '氛围', '格调', '情趣', '韵味', '诗意',
      '如歌', '如诉', '如泣', '如梦', '如画', '如潮', '如风', '如火',
      '日出', '月落', '花开', '叶落', '流水', '行云', '飞鸟', '走兽'
    ]
  },

  // 文化认知：关联音乐的文化背景、时代特征
  culture: {
    name: '文化认知',
    description: '能否关联音乐的文化背景、时代特征',
    weight: 1.0,
    keywords: [
      // 时期风格
      '古典主义', '古典时期', '维也纳古典', '海顿', '莫扎特', '贝多芬',
      '浪漫主义', '浪漫时期', '肖邦', '李斯特', '舒曼', '门德尔松', '勃拉姆斯',
      '巴洛克', '巴洛克时期', '巴赫', '亨德尔', '维瓦尔第', '帕赫贝尔',
      '印象主义', '德彪西', '拉威尔',
      '现代主义', '现代音乐', '20世纪音乐', '序列音乐', '表现主义',
      '民族主义', '民族乐派', '俄罗斯民族', '捷克民族', '西班牙民族',
      // 地域风格
      '爵士', '爵士乐', '蓝调', '布鲁斯', 'R&B', '摇滚', '流行', '电子',
      '古典音乐', '艺术音乐', '严肃音乐',
      '戏曲', '京剧', '昆曲', '川剧', '豫剧', '粤剧', '越剧', '黄梅戏',
      '民间音乐', '民歌', '山歌', '小调', '劳动号子', '花儿', '信天游',
      '民乐', '民族乐器', '国乐', '丝竹', '竹笛', '二胡', '琵琶', '古筝',
      '京韵大鼓', '评弹', '快书', '相声', '说唱',
      // 中国音乐
      '中国传统', '中华文化', '中国古代', '宫廷音乐', '文人音乐', '宗教音乐',
      '雅乐', '燕乐', '俗乐', '新音乐', '学堂乐歌', '救亡歌咏', '革命音乐'
    ]
  },

  // 审美判断：对音乐做出有理有据的审美评价
  aesthetic: {
    name: '审美判断',
    description: '能否对音乐做出有理有据的审美评价',
    weight: 1.1,
    keywords: [
      // 审美特征
      '优美', '美好', '典雅', '雅致', '精致', '精美', '华丽', '高贵', '典雅',
      '雄壮', '宏伟', '壮观', '磅礴', '大气', '恢宏', '壮丽', '威武',
      '细腻', '细腻', '微妙', '精致', '考究', '细腻', '婉转', '柔美',
      '粗犷', '豪放', '奔放', '洒脱', '不羁', '自由', '奔放', '粗犷',
      '和谐', '协调', '统一', '均衡', '平衡', '完美', '融洽',
      '对比', '变化', '差异', '冲突', '矛盾', '统一', '对立', '张力',
      '层次', '立体', '丰富', '多元', '复杂', '交织', '交织',
      // 艺术评价
      '意境', '神韵', '气韵', '风骨', '品格', '境界', '格调', '品位',
      '独到', '创新', '新颖', '独特', '别具一格', '匠心', '巧思',
      '自然', '浑然天成', '天籁', '质朴', '纯真', '朴实', '清新',
      '戏剧性', '叙事性', '抒情性', '史诗性', '悲剧性', '喜剧性',
      // 技法评价
      '技法', '技巧', '手法', '作曲', '编曲', '配器', '和声进行', '对位',
      '复调', '主调', '织体', '音色编配', '配器法', '曲式', '结构',
      '发展', '变奏', '展开', '再现', '再现', '尾声', '高潮',
      '主题动机', '核心音调', '音乐语言', '音乐思维'
    ]
  },

  // 表达规范：语言表达的准确性和完整性
  expression: {
    name: '表达规范',
    description: '语言表达的准确性和完整性',
    weight: 0.8,
    keywords: [
      // 结构完整
      '首先', '其次', '然后', '最后', '综上所述', '总之', '因此', '所以',
      '因为', '由于', '虽然', '但是', '然而', '不过', '而且', '并且',
      '一方面', '另一方面', '同时', '此外', '另外', '除此之外',
      // 音乐术语
      '音乐', '作品', '乐曲', '曲子', '乐章', '段落', '部分', '主题',
      '呈示', '展开', '再现', '尾声', '引子', '间奏', '过门', '结尾',
      '高潮', '顶点', '转折', '过渡', '连接',
      // 评价用语
      '我觉得', '我认为', '在我看来', '个人感觉', '整体印象',
      '总体来说', '从整体来看', '就...而言', '根据...判断',
      '表现出', '体现出', '展现出', '传达出', '呈现出',
      '运用了', '采用了', '结合了', '融入了', '包含了'
    ]
  }
};

/**
 * 关键词评分配置
 */
const scoringConfig = {
  // 每个关键词的基础分值（提高基础分让优秀回答能到6-8分）
  baseScore: 0.8,
  // 每个关键词的最大分值
  maxKeywordScore: 4,
  // 表达长度加分（字数超过50字开始计）
  lengthBonus: {
    threshold: 50,
    bonusPerChars: 0.04, // 每超过10字加0.04分
    maxBonus: 2.0
  },
  // 结构完整加分
  structureBonus: {
    hasStructure: 1.5, // 有清晰结构
    maxBonus: 1.5
  },
  // 每个维度的最高分
  maxDimensionScore: 10,
  // 每道题的总分
  totalScore: 50
};

/**
 * 计算文本中关键词的匹配情况
 * @param {string} text - 学生回答的文本
 * @returns {Object} 各维度的关键词匹配结果
 */
function matchKeywords(text) {
  const normalizedText = text.toLowerCase().replace(/[^\u4e00-\u9fa5a-z]/g, '');
  const results = {};
  
  for (const [dimension, config] of Object.entries(musicKeywords)) {
    let matchedKeywords = [];
    let totalScore = 0;
    
    for (const keyword of config.keywords) {
      if (normalizedText.includes(keyword.toLowerCase())) {
        matchedKeywords.push(keyword);
        totalScore += scoringConfig.baseScore;
      }
    }
    
    // 计算维度得分（使用权重和最高分限制）
    const rawScore = totalScore * config.weight;
    const dimensionScore = Math.min(rawScore, scoringConfig.maxDimensionScore);
    
    results[dimension] = {
      name: config.name,
      description: config.description,
      matchedKeywords,
      matchedCount: matchedKeywords.length,
      rawScore: totalScore,
      dimensionScore: Math.round(dimensionScore * 10) / 10
    };
  }
  
  return results;
}

/**
 * 使用关键词对回答进行评分
 * @param {string} text - 学生回答的文本
 * @param {Object} question - 问题信息
 * @param {Array} dimensions - 选中的维度数组，如 ['perception', 'emotion']
 * @returns {Object} 评分结果
 */
function evaluateWithKeywords(text, question, dimensions = null) {
  // 如果没有指定维度，默认全部
  const selectedDimensions = dimensions && dimensions.length > 0 
    ? dimensions 
    : ['perception', 'emotion', 'culture', 'aesthetic', 'expression'];
  
  const matched = matchKeywords(text, selectedDimensions);
  
  // 计算各维度得分 - 只计算选中的维度
  let totalScore = 0;
  const dimensionScores = {};
  
  for (const [dimension, result] of Object.entries(matched)) {
    if (selectedDimensions.includes(dimension)) {
      dimensionScores[dimension] = result.dimensionScore;
      totalScore += result.dimensionScore;
    } else {
      dimensionScores[dimension] = 0; // 未选中的维度设为0
    }
  }
  
  // 表达长度加分
  const lengthBonus = text.length > scoringConfig.lengthBonus.threshold 
    ? Math.min((text.length - scoringConfig.lengthBonus.threshold) * scoringConfig.lengthBonus.bonusPerChars, scoringConfig.lengthBonus.maxBonus)
    : 0;
  
  // 结构完整加分（简单检测）
  let structureBonus = 0;
  const hasStructureIndicators = ['首先', '其次', '然后', '最后', '第一', '第二', '第三', '综上所述', '总之'].some(
    indicator => text.includes(indicator)
  );
  if (hasStructureIndicators) {
    structureBonus = scoringConfig.structureBonus.hasStructure;
  }
  
  // 最终得分 = 选中维度得分 + 加分项
  // 每个选中维度最高10分，总分 = 选中维度数 * 10 + 加分项
  const maxScore = selectedDimensions.length * 10;
  const finalScore = Math.min(Math.round((totalScore + lengthBonus + structureBonus) * 10) / 10, maxScore);
  
  // 生成评语
  let comment = '';
  const strongDimensions = [];
  const weakDimensions = [];
  
  for (const [dimension, score] of Object.entries(dimensionScores)) {
    if (selectedDimensions.includes(dimension)) {
      if (score >= 6) {
        strongDimensions.push(matched[dimension].name);
      } else if (score < 3) {
        weakDimensions.push(matched[dimension].name);
      }
    }
  }
  
  if (strongDimensions.length > 0) {
    comment += `在${strongDimensions.join('、')}方面表现较好。`;
  }
  if (weakDimensions.length > 0) {
    comment += `建议加强对${weakDimensions.join('、')}的关注。`;
  }
  if (comment === '') {
    comment = '回答内容较为基础，可尝试从多个维度深入分析音乐作品。';
  }
  
  return {
    dimensions: dimensionScores,
    dimensionDetails: matched,
    lengthBonus: Math.round(lengthBonus * 10) / 10,
    structureBonus: Math.round(structureBonus * 10) / 10,
    totalScore: finalScore,
    comment,
    method: 'keyword'
  };
}

/**
 * 计算文本中关键词的匹配情况（支持维度过滤）
 * @param {string} text - 学生回答的文本
 * @param {Array} dimensions - 要评分的维度数组
 * @returns {Object} 各维度的关键词匹配结果
 */
function matchKeywords(text, dimensions = null) {
  const normalizedText = text.toLowerCase().replace(/[^\u4e00-\u9fa5a-z]/g, '');
  const results = {};
  
  // 如果没有指定维度，评分全部维度
  const targetDimensions = dimensions && dimensions.length > 0 
    ? dimensions 
    : Object.keys(musicKeywords);
  
  for (const [dimension, config] of Object.entries(musicKeywords)) {
    // 如果指定了维度，只处理选中的
    if (!targetDimensions.includes(dimension)) {
      continue;
    }
    
    let matchedKeywords = [];
    let totalScore = 0;
    
    for (const keyword of config.keywords) {
      if (normalizedText.includes(keyword.toLowerCase())) {
        matchedKeywords.push(keyword);
        totalScore += scoringConfig.baseScore;
      }
    }
    
    // 计算维度得分（使用权重和最高分限制）
    const rawScore = totalScore * config.weight;
    const dimensionScore = Math.min(rawScore, scoringConfig.maxDimensionScore);
    
    results[dimension] = {
      name: config.name,
      description: config.description,
      matchedKeywords,
      matchedCount: matchedKeywords.length,
      rawScore: totalScore,
      dimensionScore: Math.round(dimensionScore * 10) / 10
    };
  }
  
  return results;
}

module.exports = {
  musicKeywords,
  scoringConfig,
  matchKeywords,
  evaluateWithKeywords
};
