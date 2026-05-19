/**
 * 旋律线题评分服务
 * 比较学生画的旋律曲线与参考旋律的方向匹配度
 */

/**
 * 评估旋律线
 * @param {Array<{x: number, y: number}>} studentPoints - 学生画的点，归一化到0-1
 * @param {Array<{x: number, y: number}>} refPoints - 参考旋律点，归一化到0-1
 * @returns {{ score: number, directions: { student: string[], ref: string[], matchRate: number } }}
 */
function evaluateMelody(studentPoints, refPoints) {
  if (!studentPoints || studentPoints.length < 2) {
    return { score: 0, directions: null, comment: '请先绘制旋律线' };
  }
  
  // 1. 将学生曲线和参考曲线都重采样到相同点数（如20个点）
  const targetLen = 20;
  const studentResampled = resamplePoints(studentPoints, targetLen);
  const refResampled = refPoints && refPoints.length >= 2 ? resamplePoints(refPoints, targetLen) : null;
  
  // 2. 计算方向序列：上升(+1)、下降(-1)、平稳(0)
  const studentDirections = calculateDirections(studentResampled);
  
  if (!refResampled) {
    // 如果没有参考旋律，只计算学生曲线的方向数（用于提示）
    const upCount = studentDirections.filter(d => d === 1).length;
    const downCount = studentDirections.filter(d => d === -1).length;
    const flatCount = studentDirections.filter(d => d === 0).length;
    
    return {
      score: 60, // 没有参考时给基础分
      directions: {
        student: studentDirections.map(d => directionToString(d)),
        ref: null,
        matchRate: null
      },
      comment: `旋律线已记录（上升${upCount}段，下降${downCount}段，平稳${flatCount}段）`
    };
  }
  
  const refDirections = calculateDirections(refResampled);
  
  // 3. 计算匹配率
  const minLen = Math.min(studentDirections.length, refDirections.length);
  let matchCount = 0;
  
  for (let i = 0; i < minLen; i++) {
    if (studentDirections[i] === refDirections[i]) {
      matchCount++;
    }
  }
  
  const matchRate = matchCount / minLen;
  const score = Math.round(matchRate * 100 * 10) / 10;
  
  // 生成评语
  let comment = '';
  if (score >= 90) {
    comment = '旋律走向非常准确！';
  } else if (score >= 75) {
    comment = '旋律走向基本正确，很棒！';
  } else if (score >= 60) {
    comment = '旋律走向大致正确，可以再听一听原曲。';
  } else if (score >= 40) {
    comment = '旋律走向有一些偏差，建议多听几遍原曲。';
  } else {
    comment = '旋律走向偏差较大，建议跟随原曲练习。';
  }
  
  return {
    score,
    directions: {
      student: studentDirections.map(d => directionToString(d)),
      ref: refDirections.map(d => directionToString(d)),
      matchRate: Math.round(matchRate * 100)
    },
    studentResampled,
    refResampled,
    comment
  };
}

/**
 * 重采样点到目标长度
 */
function resamplePoints(points, targetLen) {
  if (!points || points.length === 0) return [];
  if (points.length === 1) return Array(targetLen).fill(points[0]);
  
  const result = [];
  const totalLen = points.length - 1;
  
  for (let i = 0; i < targetLen; i++) {
    const pos = (i / (targetLen - 1)) * totalLen;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    
    if (idx + 1 < points.length) {
      result.push({
        x: points[idx].x * (1 - frac) + points[idx + 1].x * frac,
        y: points[idx].y * (1 - frac) + points[idx + 1].y * frac
      });
    } else {
      result.push(points[idx]);
    }
  }
  
  return result;
}

/**
 * 计算方向序列
 * @param {Array<{x: number, y: number}>} points - 重采样后的点
 * @param {number} threshold - 平稳阈值（默认0.05）
 * @returns {number[]} 方向数组：+1上升, -1下降, 0平稳
 */
function calculateDirections(points, threshold = 0.05) {
  const directions = [];
  
  for (let i = 0; i < points.length - 1; i++) {
    const dy = points[i + 1].y - points[i].y;
    
    if (dy > threshold) {
      directions.push(1); // 上升
    } else if (dy < -threshold) {
      directions.push(-1); // 下降
    } else {
      directions.push(0); // 平稳
    }
  }
  
  return directions;
}

/**
 * 将方向数字转换为字符串
 */
function directionToString(dir) {
  if (dir === 1) return '↑';
  if (dir === -1) return '↓';
  return '→';
}

/**
 * 从音频提取旋律轮廓（归一化的点序列）
 * @param {Array<number>} pitches - 音高数组（Hz）
 * @param {number} targetLen - 目标点数
 * @returns {Array<{x: number, y: number}>} 归一化的点
 */
function extractMelodyContour(pitches, targetLen = 20) {
  if (!pitches || pitches.length === 0) return null;
  
  // 过滤无效音高
  const validPitches = pitches.filter(p => p !== null && p > 0);
  if (validPitches.length < 2) return null;
  
  // 归一化音高到0-1范围
  const minPitch = Math.min(...validPitches);
  const maxPitch = Math.max(...validPitches);
  const range = maxPitch - minPitch || 1;
  
  const normalized = validPitches.map(p => (p - minPitch) / range);
  
  // 重采样到目标长度
  const result = [];
  for (let i = 0; i < targetLen; i++) {
    const pos = (i / (targetLen - 1)) * (normalized.length - 1);
    const idx = Math.floor(pos);
    const frac = pos - idx;
    
    let value;
    if (idx + 1 < normalized.length) {
      value = normalized[idx] * (1 - frac) + normalized[idx + 1] * frac;
    } else {
      value = normalized[idx];
    }
    
    result.push({
      x: i / (targetLen - 1),
      y: value
    });
  }
  
  return result;
}

module.exports = { evaluateMelody, extractMelodyContour, resamplePoints, calculateDirections };
