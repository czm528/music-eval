/**
 * 学生回答页面逻辑
 */

// 全局变量
let sessionId = null;
let currentQuestion = null;
let hasAnswered = false;
let pollingInterval = null;

// 从URL获取sessionId
function getSessionIdFromUrl() {
  const path = window.location.pathname;
  const match = path.match(/\/answer\/([^/]+)/);
  return match ? match[1] : null;
}

// 页面初始化
document.addEventListener('DOMContentLoaded', () => {
  sessionId = getSessionIdFromUrl();
  
  if (!sessionId) {
    showToast('无效的课堂链接');
    return;
  }
  
  // 检查是否已登录
  const user = getUser();
  
  if (user && user.role === 'student') {
    // 已登录，显示答题区域
    document.getElementById('join-form').classList.add('hidden');
    document.getElementById('answer-section').classList.remove('hidden');
    document.getElementById('user-name').textContent = user.name;
    
    // 加入Socket房间
    if (user.classroomId) {
      joinClassroom({
        classroomId: user.classroomId,
        userId: user.id,
        userName: user.name,
        role: 'student'
      });
    }
    
    loadClassroomData();
  } else {
    // 未登录，显示加入表单
    document.getElementById('join-form').classList.remove('hidden');
    document.getElementById('answer-section').classList.add('hidden');
  }
  
  // 初始化Socket
  initSocket({
    onConnect: () => {
      const user = getUser();
      if (user && user.role === 'student' && user.classroomId) {
        joinClassroom({
          classroomId: user.classroomId,
          userId: user.id,
          userName: user.name,
          role: 'student'
        });
      }
    },
    onNewQuestion: (data) => {
      handleNewQuestion(data);
    },
    onEvalResult: (data) => {
      handleEvalResult(data);
    },
    onClassroomStats: (data) => {
      handleClassroomStats(data);
    }
  });
  
  startPing();
});

// 加入课堂
async function joinClassroom(event) {
  if (event) event.preventDefault();
  
  const name = document.getElementById('student-name-input').value.trim();
  
  if (!name) {
    showToast('请输入姓名');
    return;
  }
  
  try {
    const res = await apiRequest('/api/auth/join', {
      method: 'POST',
      body: {
        sessionId: sessionId,
        studentName: name
      }
    });
    
    if (res.success) {
      // 保存用户信息
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      
      // 更新UI
      document.getElementById('join-form').classList.add('hidden');
      document.getElementById('answer-section').classList.remove('hidden');
      document.getElementById('user-name').textContent = name;
      
      showToast('加入成功');
      
      // 加载课堂数据
      loadClassroomData();
      
      // 加入Socket房间
      joinClassroom({
        classroomId: res.data.classroom.id,
        userId: res.data.user.id,
        userName: name,
        role: 'student'
      });
    } else {
      showToast(res.message || '加入失败');
    }
  } catch (error) {
    console.error('加入课堂错误:', error);
    showToast('网络错误，请重试');
  }
}

// 加载课堂数据
async function loadClassroomData() {
  const user = getUser();
  if (!user) return;
  
  try {
    // 使用 /api/student/classroom/:sessionId 获取课堂信息
    const res = await apiRequest(`/api/student/classroom/${sessionId}`);
    
    if (!res.success) {
      // 如果是未加入状态，提示用户
      if (res.message === '无权限访问' || res.message === '未加入任何课堂') {
        showToast('请先加入课堂');
        document.getElementById('join-form').classList.remove('hidden');
        document.getElementById('answer-section').classList.add('hidden');
      } else {
        showToast(res.message || '加载课堂失败');
      }
      return;
    }
    
    const data = res.data;
    
    // 更新课堂信息
    document.getElementById('classroom-name').textContent = data.classroom.name;
    document.getElementById('teacher-name').textContent = data.classroom.teacherName;
    
    // 更新当前问题
    if (data.currentQuestion) {
      currentQuestion = data.currentQuestion;
      document.getElementById('current-question').textContent = data.currentQuestion.content;
      
      // 检查是否已回答
      if (data.hasAnswered && data.myAnswer) {
        hasAnswered = true;
        showAnswerResult(data.myAnswer);
      } else {
        hasAnswered = false;
        showAnswerForm();
      }
    } else {
      currentQuestion = null;
      document.getElementById('current-question').textContent = '暂无进行中的问题，请等待老师发布';
      showWaitingState();
    }
    
    // 更新问题历史
    renderQuestionHistory(data.questionHistory || []);
    
  } catch (error) {
    console.error('加载课堂数据错误:', error);
    showToast('网络错误');
  }
}

function showAnswerForm() {
  document.getElementById('answer-form-section').classList.remove('hidden');
  document.getElementById('answer-result-section').classList.add('hidden');
  document.getElementById('answer-input').value = '';
  
  // 根据问题类型切换UI
  if (currentQuestion) {
    checkQuestionType(currentQuestion);
  }
}

function showAnswerResult(answer) {
  document.getElementById('answer-form-section').classList.add('hidden');
  document.getElementById('answer-result-section').classList.remove('hidden');
  
  // 停止轮询
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  
  // 显示分数
  document.getElementById('my-score').textContent = answer.totalScore;
  
  // 显示维度得分
  const dimensionsContainer = document.getElementById('dimensions-display');
  const dims = answer.dimensions || {};
  
  dimensionsContainer.innerHTML = Object.entries(dims).map(([key, score]) => `
    <div class="dim-item">
      <div class="dim-name">${getDimensionName(key)}</div>
      <div class="dim-score">${score}</div>
    </div>
  `).join('');
  
  // 显示评语
  document.getElementById('my-comment').textContent = answer.comment || '评价完成';
}

function showWaitingState() {
  document.getElementById('answer-form-section').classList.add('hidden');
  document.getElementById('answer-result-section').classList.add('hidden');
}

function renderQuestionHistory(questions) {
  const container = document.getElementById('history-list');
  
  if (!questions || questions.length === 0) {
    container.innerHTML = '<p class="empty-state">暂无历史问题</p>';
    return;
  }
  
  container.innerHTML = questions.map(q => `
    <div class="history-item">
      <div class="history-content">${q.content}</div>
      <div class="history-meta">
        <span>${q.answer_count || 0}人回答</span>
        <span>${formatDate(q.created_at)}</span>
      </div>
    </div>
  `).join('');
}

// 提交回答
async function submitAnswer() {
  if (!currentQuestion) {
    showToast('暂无问题');
    return;
  }
  
  const content = document.getElementById('answer-input').value.trim();
  
  if (!content) {
    showToast('请输入回答内容');
    return;
  }
  
  const submitBtn = document.querySelector('#answer-form-section .btn');
  submitBtn.disabled = true;
  submitBtn.textContent = '提交中...';
  
  try {
    const res = await apiRequest('/api/student/answers', {
      method: 'POST',
      body: {
        questionId: currentQuestion.id,
        content: content
      }
    });
    
    submitBtn.disabled = false;
    submitBtn.textContent = '提交回答';
    
    if (res.success) {
      hasAnswered = true;
      showToast('提交成功');
      
      // 显示评价结果
      const result = res.data;
      
      // 如果立即返回了评价结果
      if (result.totalScore !== undefined) {
        showResultWithAnimation(result);
      } else {
        // 否则开始轮询获取评价结果
        showToast('正在分析回答，请稍候...');
        startPollingResult(currentQuestion.id);
      }
    } else {
      showToast(res.message || '提交失败');
    }
  } catch (error) {
    console.error('提交回答错误:', error);
    submitBtn.disabled = false;
    submitBtn.textContent = '提交回答';
    showToast('网络错误，请重试');
  }
}

// 显示带动画的评价结果
function showResultWithAnimation(result) {
  // 兼容两种格式：直接返回的(totalScore) vs 数据库查的(total_score)
  const totalScore = result.totalScore ?? result.total_score ?? 0;
  const dims = result.dimensions || {};
  const comment = result.comment || '评价完成';
  const pitchCurve = result.pitchCurve || null;
  
  // 显示分数（带动画）
  const scoreEl = document.getElementById('my-score');
  animateNumber(scoreEl, totalScore);
  
  // 显示维度得分
  const dimensionsContainer = document.getElementById('dimensions-display');
  
  dimensionsContainer.innerHTML = Object.entries(dims).map(([key, score]) => `
    <div class="dim-item">
      <div class="dim-name">${getDimensionName(key)}</div>
      <div class="dim-score">${score}</div>
    </div>
  `).join('');
  
  // 显示评语
  const commentEl = document.getElementById('my-comment');
  commentEl.textContent = comment;
  
  // 显示建议
  const tipsSection = document.getElementById('tips-section');
  const tipsList = document.getElementById('my-tips');
  
  if (result.suggestions && result.suggestions.length > 0) {
    tipsSection.style.display = 'block';
    tipsList.innerHTML = result.suggestions.map(s => `<li>${s}</li>`).join('');
  } else {
    tipsSection.style.display = 'none';
  }
  
  // 显示音高对比图
  renderPitchChart(pitchCurve);
  
  // 显示结果区域
  document.getElementById('answer-form-section').classList.add('hidden');
  document.getElementById('answer-result-section').classList.remove('hidden');
}

// 轮询获取评价结果
function startPollingResult(questionId) {
  let pollCount = 0;
  const maxPolls = 20; // 最多轮询20次
  
  pollingInterval = setInterval(async () => {
    pollCount++;
    
    try {
      // 获取回答详情
      const res = await apiRequest(`/api/student/answers/${questionId}`);
      
      if (res.success && res.data && res.data.evaluated_at) {
        clearInterval(pollingInterval);
        pollingInterval = null;
        showResultWithAnimation(res.data);
      } else if (pollCount >= maxPolls) {
        clearInterval(pollingInterval);
        pollingInterval = null;
        showToast('评价超时，请刷新重试');
      }
    } catch (error) {
      console.error('轮询错误:', error);
    }
  }, 2000); // 每2秒轮询一次
}

// 刷新问题
function refreshQuestion() {
  loadClassroomData();
}

// ============ 音频题录音功能 ============

// 录音相关变量
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let recordingTimer = null;
let recordingSeconds = 0;
let recordedBlob = null;

// 旋律线相关变量
let melodyPoints = [];
let melodyCanvas = null;
let melodyCtx = null;
let isDrawingMelody = false;
let melodyLabels = [];
let melodyIsLyrics = false;

// 配色相关变量
let colorSelections = {};

// 检查当前问题类型，切换UI
function checkQuestionType(question) {
  const textArea = document.getElementById('text-answer-area');
  const audioArea = document.getElementById('audio-answer-area');
  const melodyArea = document.getElementById('melody-answer-area');
  const colorArea = document.getElementById('color-answer-area');
  const refSection = document.getElementById('reference-audio-section');
  
  // 先隐藏所有答题区域
  textArea.style.display = 'none';
  audioArea.style.display = 'none';
  melodyArea.style.display = 'none';
  colorArea.style.display = 'none';
  refSection.style.display = 'none';
  
  const qType = question.question_type || 'text';
  
  if (qType === 'audio') {
    audioArea.style.display = '';
    if (question.reference_audio) {
      refSection.style.display = '';
      document.getElementById('reference-audio-player').src = question.reference_audio;
    }
  } else if (qType === 'melody') {
    melodyArea.style.display = '';
    // 初始化旋律线画布
    initMelodyCanvas(question);
    // 显示参考音频（如果有）
    if (question.reference_audio) {
      document.getElementById('melody-reference-audio-section').style.display = '';
      document.getElementById('melody-reference-audio-player').src = question.reference_audio;
    }
  } else if (qType === 'color') {
    colorArea.style.display = '';
    // 初始化配色答题区域
    initColorSegments(question);
  } else {
    textArea.style.display = '';
  }
}

// ============ 旋律线题功能 ============

function initMelodyCanvas(question) {
  const canvas = document.getElementById('melody-canvas');
  const wrapper = document.getElementById('melody-canvas-wrapper');
  
  // 设置canvas尺寸
  const rect = wrapper.getBoundingClientRect();
  const width = rect.width || 350;
  const height = 200;
  
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  
  melodyCanvas = canvas;
  melodyCtx = canvas.getContext('2d');
  melodyPoints = [];
  
  // 解析歌词分段或设置时间轴
  if (question.lyrics_segments) {
    melodyLabels = question.lyrics_segments.split('|').map(s => s.trim()).filter(s => s);
    melodyIsLyrics = true;
  } else {
    // 时间轴：默认5个点
    melodyLabels = ['0:00', '0:25', '0:50', '1:15', '1:40'];
    melodyIsLyrics = false;
  }
  
  // 绑定事件
  canvas.onclick = handleMelodyClick;
  canvas.onmousedown = (e) => { isDrawingMelody = true; };
  canvas.onmouseup = () => { isDrawingMelody = false; };
  canvas.ontouchstart = (e) => { e.preventDefault(); isDrawingMelody = true; };
  canvas.ontouchend = () => { isDrawingMelody = false; };
  canvas.ontouchmove = (e) => { e.preventDefault(); if (isDrawingMelody) handleMelodyTouch(e); };
  
  // 初始绘制
  drawMelodyCanvas();
}

function handleMelodyClick(e) {
  const rect = melodyCanvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = 1 - (e.clientY - rect.top) / rect.height;
  
  // x坐标从10%开始
  if (x >= 0.08) {
    melodyPoints.push({ x, y: Math.max(0, Math.min(1, y)) });
    drawMelodyCanvas();
  }
}

function handleMelodyTouch(e) {
  if (e.touches.length > 0) {
    const rect = melodyCanvas.getBoundingClientRect();
    const x = (e.touches[0].clientX - rect.left) / rect.width;
    const y = 1 - (e.touches[0].clientY - rect.top) / rect.height;
    
    if (x >= 0.08) {
      melodyPoints.push({ x, y: Math.max(0, Math.min(1, y)) });
      drawMelodyCanvas();
    }
  }
}

function drawMelodyCanvas() {
  if (!melodyCtx) return;
  
  const canvas = melodyCanvas;
  const ctx = melodyCtx;
  const w = canvas.width;
  const h = canvas.height;
  const padding = { left: 40, right: 15, top: 15, bottom: 30 };
  
  // 清空画布
  ctx.clearRect(0, 0, w, h);
  
  // 绘制背景
  ctx.fillStyle = '#fafafa';
  ctx.fillRect(0, 0, w, h);
  
  const graphLeft = padding.left;
  const graphRight = w - padding.right;
  const graphTop = padding.top;
  const graphBottom = h - padding.bottom;
  const graphWidth = graphRight - graphLeft;
  const graphHeight = graphBottom - graphTop;
  
  // 绘制网格
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  
  // 横线（5条）
  for (let i = 0; i <= 4; i++) {
    const y = graphTop + (graphHeight / 4) * i;
    ctx.beginPath();
    ctx.moveTo(graphLeft, y);
    ctx.lineTo(graphRight, y);
    ctx.stroke();
  }
  
  // 竖线（根据分段数量）
  const segCount = melodyLabels.length;
  for (let i = 0; i <= segCount; i++) {
    const x = graphLeft + (graphWidth / segCount) * i;
    ctx.beginPath();
    ctx.moveTo(x, graphTop);
    ctx.lineTo(x, graphBottom);
    ctx.stroke();
  }
  
  ctx.setLineDash([]);
  
  // 绘制坐标轴
  ctx.strokeStyle = '#374151';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(graphLeft, graphTop);
  ctx.lineTo(graphLeft, graphBottom);
  ctx.lineTo(graphRight, graphBottom);
  ctx.stroke();
  
  // 绘制纵轴标签
  const yLabels = ['很高', '高', '中', '低', '很低'];
  ctx.fillStyle = '#6b7280';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < yLabels.length; i++) {
    const y = graphTop + (graphHeight / 4) * i;
    ctx.fillText(yLabels[i], graphLeft - 5, y);
  }
  
  // 绘制横轴标签
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const maxLabels = Math.min(segCount, 6); // 最多显示6个标签
  const step = Math.ceil(segCount / maxLabels);
  for (let i = 0; i < segCount; i += step) {
    const x = graphLeft + (graphWidth / segCount) * i + graphWidth / segCount / 2;
    const label = melodyLabels[i] || '';
    // 截断长标签
    const displayLabel = label.length > 4 ? label.substring(0, 4) + '...' : label;
    ctx.fillText(displayLabel, x, graphBottom + 5);
  }
  
  // 绘制起点标记
  ctx.fillStyle = '#0d9488';
  ctx.beginPath();
  ctx.arc(graphLeft, graphBottom - graphHeight * 0.5, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('起', graphLeft, graphBottom - graphHeight * 0.5);
  
  // 绘制旋律线
  if (melodyPoints.length > 0) {
    ctx.strokeStyle = '#0d9488';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    ctx.beginPath();
    const startX = graphLeft;
    const startY = graphBottom - graphHeight * 0.5;
    ctx.moveTo(startX, startY);
    
    melodyPoints.forEach((p, i) => {
      const px = graphLeft + p.x * graphWidth;
      const py = graphBottom - p.y * graphHeight;
      
      if (i === 0) {
        ctx.lineTo(px, py);
      } else {
        // 使用平滑曲线连接
        const prev = melodyPoints[i - 1];
        const prevX = graphLeft + prev.x * graphWidth;
        const prevY = graphBottom - prev.y * graphHeight;
        const cpX = (prevX + px) / 2;
        ctx.quadraticCurveTo(prevX, prevY, cpX, (prevY + py) / 2);
        if (i === melodyPoints.length - 1) {
          ctx.lineTo(px, py);
        }
      }
    });
    
    ctx.stroke();
    
    // 绘制控制点
    ctx.fillStyle = '#0d9488';
    melodyPoints.forEach((p, i) => {
      const px = graphLeft + p.x * graphWidth;
      const py = graphBottom - p.y * graphHeight;
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

function undoMelodyPoint() {
  if (melodyPoints.length > 0) {
    melodyPoints.pop();
    drawMelodyCanvas();
  }
}

function clearMelodyCanvas() {
  melodyPoints = [];
  drawMelodyCanvas();
}

async function submitMelodyAnswer() {
  if (melodyPoints.length < 2) {
    showToast('请绘制至少两个控制点');
    return;
  }
  
  const questionId = currentQuestion?.id;
  if (!questionId) return;
  
  const submitBtn = document.getElementById('submit-melody-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = '提交中...';
  
  try {
    const res = await apiRequest('/api/student/answers', {
      method: 'POST',
      body: {
        questionId,
        content: JSON.stringify(melodyPoints)
      }
    });
    
    submitBtn.disabled = false;
    submitBtn.textContent = '提交旋律线';
    
    if (res.success) {
      hasAnswered = true;
      showToast('提交成功');
      
      const result = res.data;
      showResultWithAnimation({
        totalScore: result.totalScore,
        dimensions: result.dimensions,
        comment: result.comment,
        questionType: 'melody'
      });
    } else {
      showToast(res.message || '提交失败');
    }
  } catch (error) {
    submitBtn.disabled = false;
    submitBtn.textContent = '提交旋律线';
    showToast('提交失败');
  }
}

// ============ 配色题功能 ============

function initColorSegments(question) {
  const container = document.getElementById('color-segments-container');
  colorSelections = {};
  
  let segments = [];
  if (question.lyrics_segments) {
    segments = question.lyrics_segments.split('|').map(s => s.trim()).filter(s => s);
  }
  
  if (segments.length === 0) {
    container.innerHTML = '<p class="empty-state">暂无歌词分段信息</p>';
    return;
  }
  
  const colorMap = {
    red: '#ef4444',
    orange: '#f97316',
    yellow: '#eab308',
    green: '#22c55e',
    blue: '#3b82f6',
    purple: '#8b5cf6',
    white: '#d1d5db',
    brown: '#92400e'
  };
  
  const colorEmoji = {
    red: '🔴', orange: '🟠', yellow: '🟡', green: '🟢',
    blue: '🔵', purple: '🟣', white: '⚪', brown: '🟤'
  };
  
  let html = '';
  segments.forEach((seg, i) => {
    colorSelections[i] = null;
    html += `
      <div class="color-segment-item" data-index="${i}">
        <div class="segment-label">${escapeHtml(seg)}</div>
        <div class="segment-color-slot" id="color-slot-${i}" onclick="clearColorSelection(${i})">
          <span class="placeholder">点击选择</span>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
  
  // 点击色卡时选中
  document.querySelectorAll('.color-option').forEach(opt => {
    opt.onclick = () => selectColor(opt);
  });
}

function selectColor(optElement) {
  const color = optElement.dataset.color;
  const container = document.getElementById('color-segments-container');
  const selectedSlot = container.querySelector('.segment-color-slot.selected');
  
  if (selectedSlot) {
    // 已经有选中的槽，更新颜色
    const index = parseInt(selectedSlot.dataset.index);
    colorSelections[index] = color;
    updateColorSlot(index, color);
  }
  
  // 高亮选中的色卡
  document.querySelectorAll('.color-option').forEach(o => o.classList.remove('active'));
  optElement.classList.add('active');
}

function updateColorSlot(index, color) {
  const slot = document.getElementById(`color-slot-${index}`);
  const colorMap = {
    red: '#ef4444', orange: '#f97316', yellow: '#eab308', green: '#22c55e',
    blue: '#3b82f6', purple: '#8b5cf6', white: '#d1d5db', brown: '#92400e'
  };
  const colorEmoji = {
    red: '🔴', orange: '🟠', yellow: '🟡', green: '🟢',
    blue: '🔵', purple: '🟣', white: '⚪', brown: '🟤'
  };
  const colorNames = {
    red: '激昂', orange: '温暖', yellow: '欢快', green: '宁静',
    blue: '忧伤', purple: '神秘', white: '空灵', brown: '沉稳'
  };
  
  slot.className = 'segment-color-slot selected';
  slot.style.backgroundColor = colorMap[color];
  slot.innerHTML = `<span style="color:${color === 'white' ? '#333' : '#fff'};text-shadow:0 1px 2px rgba(0,0,0,0.3);">${colorEmoji[color]} ${colorNames[color]}</span>`;
}

function clearColorSelection(index) {
  const slot = document.getElementById(`color-slot-${index}`);
  colorSelections[index] = null;
  slot.className = 'segment-color-slot';
  slot.style.backgroundColor = '';
  slot.innerHTML = '<span class="placeholder">点击选择</span>';
}

async function submitColorAnswer() {
  const selections = Object.entries(colorSelections)
    .filter(([_, color]) => color !== null)
    .map(([index, color]) => ({
      segmentIndex: parseInt(index),
      color
    }));
  
  if (selections.length === 0) {
    showToast('请至少选择一个颜色');
    return;
  }
  
  const questionId = currentQuestion?.id;
  if (!questionId) return;
  
  const submitBtn = document.getElementById('submit-color-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = '提交中...';
  
  try {
    const res = await apiRequest('/api/student/answers', {
      method: 'POST',
      body: {
        questionId,
        content: JSON.stringify(selections)
      }
    });
    
    submitBtn.disabled = false;
    submitBtn.textContent = '提交配色';
    
    if (res.success) {
      hasAnswered = true;
      showToast('提交成功');
      
      const result = res.data;
      showResultWithAnimation({
        totalScore: result.totalScore,
        dimensions: result.dimensions,
        comment: result.comment,
        questionType: 'color'
      });
    } else {
      showToast(res.message || '提交失败');
    }
  } catch (error) {
    submitBtn.disabled = false;
    submitBtn.textContent = '提交配色';
    showToast('提交失败');
  }
}

// 简单的HTML转义
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 录音控制
async function toggleRecording() {
  if (isRecording) {
    stopRecording();
  } else {
    await startRecording();
  }
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    audioChunks = [];
    
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };
    
    mediaRecorder.onstop = () => {
      recordedBlob = new Blob(audioChunks, { type: 'audio/webm' });
      const url = URL.createObjectURL(recordedBlob);
      document.getElementById('student-audio-preview').src = url;
      document.getElementById('audio-answer-preview').style.display = '';
      document.getElementById('submit-audio-btn').style.display = '';
      
      // 停止所有轨道
      stream.getTracks().forEach(t => t.stop());
    };
    
    mediaRecorder.start();
    isRecording = true;
    recordingSeconds = 0;
    
    // UI更新
    document.getElementById('recorder-icon').textContent = '⏹';
    document.getElementById('recorder-status').textContent = '录音中...点击停止';
    document.getElementById('recorder-ring').classList.add('recording');
    document.getElementById('recorder-timer').style.display = '';
    
    recordingTimer = setInterval(() => {
      recordingSeconds++;
      const m = String(Math.floor(recordingSeconds / 60)).padStart(2, '0');
      const s = String(recordingSeconds % 60).padStart(2, '0');
      document.getElementById('recorder-timer').textContent = `${m}:${s}`;
      
      if (recordingSeconds >= 60) { // 最长60秒
        stopRecording();
      }
    }, 1000);
    
  } catch (e) {
    showToast('无法访问麦克风，请检查权限设置');
  }
}

function stopRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    isRecording = false;
    
    clearInterval(recordingTimer);
    document.getElementById('recorder-icon').textContent = '🎤';
    document.getElementById('recorder-status').textContent = '录音完成';
    document.getElementById('recorder-ring').classList.remove('recording');
  }
}

function reRecord() {
  recordedBlob = null;
  document.getElementById('audio-answer-preview').style.display = 'none';
  document.getElementById('submit-audio-btn').style.display = 'none';
  document.getElementById('recorder-status').textContent = '点击开始录音';
  document.getElementById('recorder-timer').style.display = 'none';
}

// 提交音频回答
async function submitAudioAnswer() {
  if (!recordedBlob) {
    showToast('请先录音');
    return;
  }
  
  const questionId = currentQuestion?.id;
  if (!questionId) return;
  
  try {
    const token = getToken();
    document.getElementById('submit-audio-btn').textContent = '转码中...';
    document.getElementById('submit-audio-btn').disabled = true;
    
    // 浏览器端将webm转码为wav（服务端不需要ffmpeg）
    const wavBlob = await convertToWav(recordedBlob);
    
    const formData = new FormData();
    formData.append('questionId', questionId);
    formData.append('student_audio', wavBlob, 'recording.wav');
    
    document.getElementById('submit-audio-btn').textContent = '提交中...';
    
    const res = await fetch('/api/student/answers/audio', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      credentials: 'include',
      body: formData
    });
    
    const data = await res.json();
    
    if (data.success) {
      hasAnswered = true;
      showToast('提交成功');
      // 构造结果对象，包含pitchCurve
      const resultData = {
        totalScore: data.data.score,
        dimensions: data.data.dimensions,
        comment: data.data.comment,
        pitchCurve: data.data.pitchCurve
      };
      showResultWithAnimation(resultData);
    } else {
      showToast(data.message || '提交失败');
      document.getElementById('submit-audio-btn').textContent = '提交演唱';
      document.getElementById('submit-audio-btn').disabled = false;
    }
  } catch (error) {
    showToast('提交失败');
    document.getElementById('submit-audio-btn').textContent = '提交演唱';
    document.getElementById('submit-audio-btn').disabled = false;
  }
}

// 渲染音高对比图
function renderPitchChart(pitchCurve) {
  const section = document.getElementById('pitch-chart-section');
  if (!pitchCurve || !pitchCurve.ref || !pitchCurve.stu) {
    section.style.display = 'none';
    return;
  }
  
  section.style.display = 'block';
  
  // 延迟渲染，等DOM可见
  setTimeout(() => {
    const container = document.getElementById('pitch-chart');
    if (!container || typeof echarts === 'undefined') return;
    
    const chart = echarts.init(container);
    const xData = pitchCurve.ref.map((_, i) => i);
    
    chart.setOption({
      grid: { top: 20, right: 15, bottom: 25, left: 45 },
      xAxis: {
        type: 'category',
        data: xData,
        show: false
      },
      yAxis: {
        type: 'value',
        name: '音分',
        nameTextStyle: { fontSize: 11 },
        axisLabel: { fontSize: 10 },
        splitLine: { lineStyle: { type: 'dashed', opacity: 0.3 } }
      },
      series: [
        {
          name: '参考旋律',
          type: 'line',
          data: pitchCurve.ref,
          smooth: true,
          symbol: 'none',
          lineStyle: { color: '#5470c6', width: 2.5 },
          areaStyle: { color: 'rgba(84,112,198,0.08)' }
        },
        {
          name: '你的演唱',
          type: 'line',
          data: pitchCurve.stu,
          smooth: true,
          symbol: 'none',
          lineStyle: { color: '#ee6666', width: 2 },
          areaStyle: { color: 'rgba(238,102,102,0.08)' }
        }
      ],
      tooltip: {
        trigger: 'axis',
        formatter: function(params) {
          return params.map(p => `${p.seriesName}: ${p.value}音分`).join('<br>');
        }
      }
    });
    
    // 自适应宽度
    window.addEventListener('resize', () => chart.resize());
  }, 100);
}

// 重新回答
function retryAnswer() {
  // 重置已回答状态，允许重新提交
  hasAnswered = false;
  
  // 隐藏结果区域，显示答题区域
  document.getElementById('answer-result-section').classList.add('hidden');
  document.getElementById('answer-form-section').classList.remove('hidden');
  
  // 清空之前的输入
  document.getElementById('answer-input').value = '';
  
  // 根据题目类型切换UI
  if (currentQuestion) {
    checkQuestionType(currentQuestion);
  }
  
  // 重置录音状态
  recordedBlob = null;
  const preview = document.getElementById('audio-answer-preview');
  if (preview) preview.style.display = 'none';
  const submitBtn = document.getElementById('submit-audio-btn');
  if (submitBtn) { submitBtn.style.display = 'none'; submitBtn.textContent = '提交演唱'; submitBtn.disabled = false; }
  const recorderStatus = document.getElementById('recorder-status');
  if (recorderStatus) recorderStatus.textContent = '点击开始录音';
  
  // 重置旋律线状态
  melodyPoints = [];
  if (melodyCanvas) {
    drawMelodyCanvas();
  }
  const melodySubmitBtn = document.getElementById('submit-melody-btn');
  if (melodySubmitBtn) { melodySubmitBtn.disabled = false; melodySubmitBtn.textContent = '提交旋律线'; }
  
  // 重置配色状态
  colorSelections = {};
  const colorSubmitBtn = document.getElementById('submit-color-btn');
  if (colorSubmitBtn) { colorSubmitBtn.disabled = false; colorSubmitBtn.textContent = '提交配色'; }
  
  showToast('可以重新回答了');
}

// ============ Socket事件处理 ============

function handleNewQuestion(data) {
  showToast('收到新问题！');
  loadClassroomData();
}

function handleEvalResult(data) {
  // 如果是自己的评价结果，更新显示
  const user = getUser();
  if (user && data.studentId === user.id) {
    // 停止轮询
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
    
    showResultWithAnimation(data);
  }
}

function handleClassroomStats(data) {
  // 更新实时统计
  const user = getUser();
  if (user && user.classroomId === data.classroomId) {
    // 可以更新回答进度等
    console.log('课堂统计更新:', data);
  }
}

// 数字动画
function animateNumber(element, targetValue) {
  if (!element) return;
  
  const current = parseInt(element.textContent) || 0;
  const increment = (targetValue - current) / 20;
  let step = 0;
  
  const timer = setInterval(() => {
    step++;
    const value = Math.round(current + increment * step);
    element.textContent = value;
    
    if (step >= 20) {
      element.textContent = targetValue;
      clearInterval(timer);
    }
  }, 30);
}
