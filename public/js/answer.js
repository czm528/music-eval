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
  
  if (hasAnswered) {
    showToast('您已提交过回答');
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
  // 显示分数（带动画）
  const scoreEl = document.getElementById('my-score');
  animateNumber(scoreEl, result.totalScore);
  
  // 显示维度得分
  const dimensionsContainer = document.getElementById('dimensions-display');
  const dims = result.dimensions || {};
  
  dimensionsContainer.innerHTML = Object.entries(dims).map(([key, score]) => `
    <div class="dim-item">
      <div class="dim-name">${getDimensionName(key)}</div>
      <div class="dim-score">${score}</div>
    </div>
  `).join('');
  
  // 显示评语
  const commentEl = document.getElementById('my-comment');
  commentEl.textContent = result.comment || '评价完成';
  
  // 显示建议
  const tipsSection = document.getElementById('tips-section');
  const tipsList = document.getElementById('my-tips');
  
  if (result.suggestions && result.suggestions.length > 0) {
    tipsSection.style.display = 'block';
    tipsList.innerHTML = result.suggestions.map(s => `<li>${s}</li>`).join('');
  } else {
    tipsSection.style.display = 'none';
  }
  
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
