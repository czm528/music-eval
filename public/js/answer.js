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

// 检查当前问题类型，切换UI
function checkQuestionType(question) {
  const textArea = document.getElementById('text-answer-area');
  const audioArea = document.getElementById('audio-answer-area');
  const refSection = document.getElementById('reference-audio-section');
  
  // 文字题默认显示
  if (question.question_type === 'audio') {
    textArea.style.display = 'none';
    audioArea.style.display = '';
    
    if (question.reference_audio) {
      refSection.style.display = '';
      document.getElementById('reference-audio-player').src = question.reference_audio;
    }
  } else {
    textArea.style.display = '';
    audioArea.style.display = 'none';
  }
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
  
  // 如果是音频题，重置录音状态
  removeAudio();
  
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
