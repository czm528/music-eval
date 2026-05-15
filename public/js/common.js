/**
 * 公共工具函数
 */

// API请求封装
async function apiRequest(url, options = {}) {
  const token = localStorage.getItem('token');
  
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    },
    credentials: 'include', // 跨域+HTTPS环境发送cookie
    ...options
  };
  
  if (defaultOptions.body && typeof defaultOptions.body === 'object') {
    defaultOptions.body = JSON.stringify(defaultOptions.body);
  }
  
  try {
    const response = await fetch(url, defaultOptions);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('API请求失败:', error);
    return { success: false, message: '网络请求失败，请检查网络连接' };
  }
}

// 获取认证token
function getToken() {
  return localStorage.getItem('token') || '';
}

// 获取用户信息
function getUser() {
  try {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  } catch (e) {
    console.error('解析用户信息失败:', e);
    return null;
  }
}

// 检查登录状态
function checkAuth(redirectTo = '/login') {
  const user = getUser();
  if (!user) {
    window.location.href = redirectTo;
    return false;
  }
  return true;
}

// 登出
function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/login';
}

// Toast提示
function showToast(message, duration = 3000) {
  // 移除现有toast
  const existingToast = document.querySelector('.toast.show');
  if (existingToast) {
    existingToast.remove();
  }
  
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  
  // 触发动画
  setTimeout(() => toast.classList.add('show'), 10);
  
  // 自动移除
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// 格式化日期
function formatDate(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;
  
  // 1分钟内
  if (diff < 60000) {
    return '刚刚';
  }
  // 1小时内
  if (diff < 3600000) {
    return Math.floor(diff / 60000) + '分钟前';
  }
  // 24小时内
  if (diff < 86400000) {
    return Math.floor(diff / 3600000) + '小时前';
  }
  // 超过24小时显示日期
  return date.toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// 格式化完整日期时间
function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// 生成UUID
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// 防抖函数
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// 节流函数
function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// 复制文本到剪贴板
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('复制成功');
    return true;
  } catch (err) {
    // 降级方案
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      showToast('复制成功');
      return true;
    } catch (e) {
      showToast('复制失败，请手动复制');
      return false;
    } finally {
      document.body.removeChild(textarea);
    }
  }
}

// 维度名称映射
const dimensionNames = {
  perception: '音乐感知力',
  emotion: '情感理解力',
  culture: '文化认知',
  aesthetic: '审美判断',
  expression: '表达规范'
};

// 获取维度名称
function getDimensionName(key) {
  return dimensionNames[key] || key;
}

// 评分颜色
function getScoreColor(score) {
  if (score >= 8) return '#22c55e'; // 绿色
  if (score >= 6) return '#0d9488'; // 青色
  if (score >= 4) return '#f59e0b'; // 黄色
  return '#ef4444'; // 红色
}

// 获取分数等级
function getScoreLevel(score) {
  if (score >= 8) return 'high';
  if (score >= 4) return 'medium';
  return 'low';
}

// 数字动画
function animateNumber(element, targetValue, duration = 500) {
  if (!element) return;
  
  const startValue = parseInt(element.textContent) || 0;
  const startTime = performance.now();
  const diff = targetValue - startValue;
  
  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // 使用easeOutQuad缓动
    const easeProgress = 1 - (1 - progress) * (1 - progress);
    const currentValue = Math.round(startValue + diff * easeProgress);
    
    element.textContent = currentValue;
    
    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      element.textContent = targetValue;
    }
  }
  
  requestAnimationFrame(update);
}

// 格式化数字（添加千位分隔符）
function formatNumber(num) {
  if (typeof num !== 'number') return num;
  return num.toLocaleString('zh-CN');
}

// 获取URL参数
function getUrlParam(name) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(name);
}

// 滚动到元素
function scrollToElement(elementId) {
  const element = document.getElementById(elementId);
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// 本地存储封装
const storage = {
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('存储失败:', e);
      return false;
    }
  },
  
  get(key, defaultValue = null) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : defaultValue;
    } catch (e) {
      console.error('读取失败:', e);
      return defaultValue;
    }
  },
  
  remove(key) {
    localStorage.removeItem(key);
  },
  
  clear() {
    localStorage.clear();
  }
};

// 检测是否是移动设备
function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// 检测是否支持触摸
function isTouchDevice() {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

// 浏览器端将音频文件转码为WAV格式（服务端不需要ffmpeg）
async function convertToWav(blob) {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const arrayBuffer = await blob.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  
  const numChannels = 1;
  const sampleRate = 44100;
  
  const offlineCtx = new OfflineAudioContext(numChannels, audioBuffer.duration * sampleRate, sampleRate);
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineCtx.destination);
  source.start();
  const renderedBuffer = await offlineCtx.startRendering();
  
  const channelData = renderedBuffer.getChannelData(0);
  const dataLength = channelData.length * 2;
  const headerLength = 44;
  const totalLength = headerLength + dataLength;
  
  const wavBuffer = new ArrayBuffer(totalLength);
  const view = new DataView(wavBuffer);
  
  function writeStr(offset, str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }
  
  writeStr(0, 'RIFF');
  view.setUint32(4, totalLength - 8, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataLength, true);
  
  let offset = 44;
  for (let i = 0; i < channelData.length; i++) {
    const s = Math.max(-1, Math.min(1, channelData[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }
  
  audioContext.close();
  return new Blob([wavBuffer], { type: 'audio/wav' });
}