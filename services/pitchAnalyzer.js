/**
 * 音准分析模块
 * 使用 ffmpeg 转码 + pitchfinder(YIN算法) 提取音高曲线
 */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const Pitchfinder = require('pitchfinder');
const WavDecoder = require('wav-decoder');

/**
 * 用ffmpeg将音频转为WAV（单声道16kHz，足够音准检测）
 */
function convertToWavWithFfmpeg(inputPath) {
  return new Promise((resolve, reject) => {
    const outputPath = inputPath + '.conv.wav';
    execFile('ffmpeg', [
      '-y', '-i', inputPath,
      '-ar', '16000',    // 16kHz采样率，文件小且足够音准检测
      '-ac', '1',        // 单声道
      '-sample_fmt', 's16',
      outputPath
    ], { timeout: 30000 }, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve(outputPath);
      }
    });
  });
}

/**
 * 解码音频文件为PCM数据（自动用ffmpeg转码非WAV格式）
 */
async function decodeAudio(filePath) {
  let wavPath = filePath;
  let converted = false;
  
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== '.wav') {
    // 非WAV格式，先用ffmpeg转码
    wavPath = await convertToWavWithFfmpeg(filePath);
    converted = true;
  }
  
  try {
    const buffer = fs.readFileSync(wavPath);
    const decoded = await WavDecoder.decode(buffer);
    return decoded;
  } finally {
    // 清理临时转码文件
    if (converted && fs.existsSync(wavPath)) {
      try { fs.unlinkSync(wavPath); } catch (e) {}
    }
  }
}

/**
 * 分析学生演唱与标准参考的音准偏差
 */
async function analyzePitch(studentPath, referencePath) {
  try {
    const studentDecoded = await decodeAudio(studentPath);
    const referenceDecoded = await decodeAudio(referencePath);
    
    if (!studentDecoded || !referenceDecoded) {
      return null;
    }
    
    // 提取单声道数据
    const studentAudio = studentDecoded.channelData[0];
    const referenceAudio = referenceDecoded.channelData[0];
    const sampleRate = studentDecoded.sampleRate;
    
    // 逐帧检测音高（帧长2048，步长512）
    const frameSize = 2048;
    const hopSize = 512;
    const detectPitch = Pitchfinder.YIN({ sampleRate, threshold: 0.2 });
    
    const refPitches = extractPitches(referenceAudio, detectPitch, frameSize, hopSize);
    const stuPitches = extractPitches(studentAudio, detectPitch, frameSize, hopSize);
    
    // 过滤无效音高
    const refVoiced = refPitches.filter(p => p !== null);
    const stuVoiced = stuPitches.filter(p => p !== null);
    
    if (refVoiced.length === 0 || stuVoiced.length === 0) {
      return null;
    }
    
    // 转换为音分（cents），以参考音频中位数为基准
    const refMedian = median(refVoiced);
    const refCents = refVoiced.map(f => 1200 * Math.log2(f / refMedian));
    const stuCents = stuVoiced.map(f => 1200 * Math.log2(f / refMedian));
    
    // 重采样到相同长度
    const targetLen = Math.max(refCents.length, stuCents.length);
    const refResampled = resample(refCents, targetLen);
    const stuResampled = resample(stuCents, targetLen);
    
    // 计算偏差
    const deviations = stuResampled.map((s, i) => Math.abs(s - refResampled[i]));
    const avgDeviation = mean(deviations);
    const maxDeviation = Math.max(...deviations);
    
    const pitchMatchRate = deviations.filter(d => d < 50).length / deviations.length;
    const score = deviationToScore(avgDeviation);
    
    // 降采样曲线数据（最多200个点，避免数据过大）
    const maxPoints = 200;
    const refCurve = downsample(refResampled, maxPoints);
    const stuCurve = downsample(stuResampled, maxPoints);
    
    return {
      score,
      avg_deviation_cents: Math.round(avgDeviation * 10) / 10,
      max_deviation_cents: Math.round(maxDeviation * 10) / 10,
      pitch_match_rate: Math.round(pitchMatchRate * 1000) / 10,
      ref_notes_count: refVoiced.length,
      stu_notes_count: stuVoiced.length,
      ref_curve: refCurve.map(v => Math.round(v * 10) / 10),
      stu_curve: stuCurve.map(v => Math.round(v * 10) / 10)
    };
    
  } catch (error) {
    console.error('音准分析错误:', error);
    return null;
  }
}

function extractPitches(audioData, detectPitch, frameSize, hopSize) {
  const pitches = [];
  for (let i = 0; i + frameSize <= audioData.length; i += hopSize) {
    const frame = audioData.slice(i, i + frameSize);
    const pitch = detectPitch(frame);
    pitches.push(pitch);
  }
  return pitches;
}

function downsample(arr, maxLen) {
  if (arr.length <= maxLen) return arr.slice();
  const step = arr.length / maxLen;
  const result = [];
  for (let i = 0; i < maxLen; i++) {
    result.push(arr[Math.floor(i * step)]);
  }
  return result;
}

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
