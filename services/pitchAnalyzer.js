/**
 * 纯Node.js音准分析模块
 * 使用 pitchfinder(YIN算法) 提取音高曲线，简单对齐后计算偏差
 */
const fs = require('fs');
const path = require('path');
const Pitchfinder = require('pitchfinder');

/**
 * 分析学生演唱与标准参考的音准偏差
 * @param {string} studentPath - 学生演唱音频文件路径
 * @param {string} referencePath - 标准参考音频文件路径
 * @returns {object|null} 分析结果
 */
async function analyzePitch(studentPath, referencePath) {
  const WavDecoder = require('wav-decoder');
  
  try {
    // 1. 读取并解码音频文件
    let studentDecoded, referenceDecoded;
    
    try {
      const studentBuffer = fs.readFileSync(studentPath);
      studentDecoded = await WavDecoder.decode(studentBuffer);
    } catch (e) {
      // 如果wav-decoder无法解码（如webm格式），尝试用ffmpeg转换
      studentDecoded = await decodeWithFFmpeg(studentPath);
    }
    
    try {
      const referenceBuffer = fs.readFileSync(referencePath);
      referenceDecoded = await WavDecoder.decode(referenceBuffer);
    } catch (e) {
      referenceDecoded = await decodeWithFFmpeg(referencePath);
    }
    
    if (!studentDecoded || !referenceDecoded) {
      return null;
    }
    
    // 2. 提取单声道数据
    const studentAudio = studentDecoded.channelData[0];
    const referenceAudio = referenceDecoded.channelData[0];
    const sampleRate = studentDecoded.sampleRate;
    
    // 3. 逐帧检测音高（帧长2048，步长512）
    const frameSize = 2048;
    const hopSize = 512;
    const detectPitch = Pitchfinder.YIN({ sampleRate, threshold: 0.2 });
    
    const refPitches = extractPitches(referenceAudio, detectPitch, frameSize, hopSize);
    const stuPitches = extractPitches(studentAudio, detectPitch, frameSize, hopSize);
    
    // 4. 过滤无效音高（null值）
    const refVoiced = refPitches.filter(p => p !== null);
    const stuVoiced = stuPitches.filter(p => p !== null);
    
    if (refVoiced.length === 0 || stuVoiced.length === 0) {
      return null;
    }
    
    // 5. 转换为音分（cents），以参考音频中位数为基准
    const refMedian = median(refVoiced);
    const refCents = refVoiced.map(f => 1200 * Math.log2(f / refMedian));
    const stuCents = stuVoiced.map(f => 1200 * Math.log2(f / refMedian));
    
    // 6. 简单对齐：重采样到相同长度
    const targetLen = Math.max(refCents.length, stuCents.length);
    const refResampled = resample(refCents, targetLen);
    const stuResampled = resample(stuCents, targetLen);
    
    // 7. 计算偏差
    const deviations = stuResampled.map((s, i) => Math.abs(s - refResampled[i]));
    const avgDeviation = mean(deviations);
    const maxDeviation = Math.max(...deviations);
    
    // 8. 音高匹配率（偏差<50音分的比例）
    const pitchMatchRate = deviations.filter(d => d < 50).length / deviations.length;
    
    // 9. 偏差映射为分数
    const score = deviationToScore(avgDeviation);
    
    return {
      score,
      avg_deviation_cents: Math.round(avgDeviation * 10) / 10,
      max_deviation_cents: Math.round(maxDeviation * 10) / 10,
      pitch_match_rate: Math.round(pitchMatchRate * 1000) / 10,
      ref_notes_count: refVoiced.length,
      stu_notes_count: stuVoiced.length
    };
    
  } catch (error) {
    console.error('音准分析错误:', error);
    return null;
  }
}

/**
 * 逐帧提取音高
 */
function extractPitches(audioData, detectPitch, frameSize, hopSize) {
  const pitches = [];
  for (let i = 0; i + frameSize <= audioData.length; i += hopSize) {
    const frame = audioData.slice(i, i + frameSize);
    const pitch = detectPitch(frame);
    pitches.push(pitch);
  }
  return pitches;
}

/**
 * 用ffmpeg解码非wav格式的音频
 */
async function decodeWithFFmpeg(filePath) {
  const { execSync } = require('child_process');
  const tmpPath = filePath + '.tmp.wav';
  
  try {
    execSync(`ffmpeg -i "${filePath}" -ar 44100 -ac 1 -f wav "${tmpPath}" -y 2>/dev/null`, {
      timeout: 10000
    });
    
    const WavDecoder = require('wav-decoder');
    const buffer = fs.readFileSync(tmpPath);
    const decoded = await WavDecoder.decode(buffer);
    fs.unlinkSync(tmpPath);
    return decoded;
  } catch (e) {
    try { fs.unlinkSync(tmpPath); } catch(ex) {}
    return null;
  }
}

/**
 * 重采样数组到目标长度（线性插值）
 */
function resample(arr, targetLen) {
  if (arr.length === targetLen) return arr;
  const result = [];
  for (let i = 0; i < targetLen; i++) {
    const pos = (i / (targetLen - 1)) * (arr.length - 1);
    const idx = Math.floor(pos);
    const frac = pos - idx;
    if (idx + 1 < arr.length) {
      result.push(arr[idx] * (1 - frac) + arr[idx + 1] * frac);
    } else {
      result.push(arr[idx]);
    }
  }
  return result;
}

function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(arr) {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

/**
 * 将平均音分偏差映射为100分制得分（宽松版）
 */
function deviationToScore(avgDeviation) {
  if (avgDeviation <= 30) return Math.round((90 + (30 - avgDeviation) / 30 * 10) * 10) / 10;
  if (avgDeviation <= 50) return Math.round((75 + (50 - avgDeviation) / 20 * 15) * 10) / 10;
  if (avgDeviation <= 80) return Math.round((60 + (80 - avgDeviation) / 30 * 15) * 10) / 10;
  if (avgDeviation <= 120) return Math.round((40 + (120 - avgDeviation) / 40 * 20) * 10) / 10;
  return Math.round(Math.max(0, 40 - (avgDeviation - 120) / 80 * 40) * 10) / 10;
}

function getScoreDescription(score) {
  if (score >= 90) return '优秀';
  if (score >= 75) return '良好';
  if (score >= 60) return '中等';
  if (score >= 40) return '及格';
  return '需加强';
}

module.exports = { analyzePitch, deviationToScore, getScoreDescription };
