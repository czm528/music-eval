/**
 * 课堂看板页面逻辑
 */

// 全局变量
let classroomId = null;
let classroomData = null;
let radarChart = null;
let scoreChart = null;

// 从URL获取课堂ID
function getClassroomIdFromUrl() {
  const path = window.location.pathname;
  const match = path.match(/\/classroom\/(\d+)/);
  return match ? match[1] : null;
}

// 页面初始化
document.addEventListener('DOMContentLoaded', () => {
  classroomId = getClassroomIdFromUrl();
  
  if (!classroomId) {
    showToast('无效的课堂ID');
    return;
  }
  
  // 加载课堂数据
  loadClassroomData();
  
  // 初始化Socket
  initSocket({
    onConnect: () => {
      const user = getUser();
      if (user) {
        joinClassroom({
          classroomId: classroomId,
          userId: user.id,
          userName: user.nickname,
          role: 'teacher'
        });
      }
    },
    onUserJoined: (data) => {
      handleUserJoined(data);
    },
    onUserLeft: (data) => {
      handleUserLeft(data);
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

// 加载课堂数据
async function loadClassroomData() {
  try {
    const res = await apiRequest(`/api/teacher/classrooms/${classroomId}`);
    
    if (!res.success) {
      showToast('加载课堂失败');
      return;
    }
    
    classroomData = res.data;
    
    // 更新页面标题
    document.getElementById('classroom-title').textContent = classroomData.name;
    
    // 更新状态徽章
    const statusBadge = document.getElementById('classroom-status');
    statusBadge.textContent = classroomData.status === 'active' ? '进行中' : '已结束';
    statusBadge.className = `status-badge ${classroomData.status}`;
    
    // 更新实时数据
    updateRealtimeStats();
    
    // 渲染学生列表
    renderStudentList();
    
    // 更新当前问题
    updateCurrentQuestion();
    
    // 渲染图表
    loadStats();
    
    // 存储二维码数据
    window.qrCodeData = {
      qrCode: classroomData.qrCode,
      joinUrl: classroomData.joinUrl
    };
    
  } catch (error) {
    console.error('加载课堂数据错误:', error);
    showToast('网络错误');
  }
}

// 更新实时统计
function updateRealtimeStats() {
  if (!classroomData) return;
  
  animateNumber(document.getElementById('rt-students'), classroomData.student_count || 0);
}

// 渲染学生列表
function renderStudentList() {
  const container = document.getElementById('student-list');
  const students = classroomData?.students || [];
  
  if (students.length === 0) {
    container.innerHTML = '<p class="empty-state">暂无学生加入</p>';
    return;
  }
  
  container.innerHTML = students.map(s => `
    <span class="student-tag" id="student-${s.id}">${s.name}</span>
  `).join('');
}

// 更新当前问题
function updateCurrentQuestion() {
  const container = document.getElementById('current-question-display');
  const questions = classroomData?.questions || [];
  const currentQ = questions.find(q => !q.ended_at);
  
  if (!currentQ) {
    container.innerHTML = '<p class="empty-state">暂无进行中的问题</p>';
    document.getElementById('rt-answered').textContent = '0';
    document.getElementById('rt-avg-score').textContent = '0';
    return;
  }
  
  container.innerHTML = `
    <div class="question-text">${currentQ.content}</div>
    <div class="question-meta">
      <span>${currentQ.answer_count || 0} 人已回答</span>
      <span class="separator">|</span>
      <span>平均 ${currentQ.avg_score ? currentQ.avg_score.toFixed(1) : 0} 分</span>
    </div>
  `;
  
  animateNumber(document.getElementById('rt-answered'), currentQ.answer_count || 0);
  animateNumber(document.getElementById('rt-avg-score'), currentQ.avg_score ? Math.round(currentQ.avg_score) : 0);
}

// 加载统计数据
async function loadStats() {
  try {
    const res = await apiRequest(`/api/teacher/classrooms/${classroomId}/stats`);
    
    if (!res.success) return;
    
    const data = res.data;
    
    // 渲染雷达图
    renderRadarChart(data.dimensionAvgs);
    
    // 渲染得分分布
    renderScoreChart(data.questions);
    
    // 更新回答列表
    loadAnswerList();
    
  } catch (error) {
    console.error('加载统计数据错误:', error);
  }
}

// 渲染雷达图
function renderRadarChart(dimensionAvgs) {
  const ctx = document.getElementById('radar-chart');
  if (!ctx) return;
  
  const labels = Object.values(dimensionNames);
  const values = Object.values(dimensionAvgs).map(v => v || 0);
  
  if (radarChart) {
    radarChart.data.labels = labels;
    radarChart.data.datasets[0].data = values;
    radarChart.update();
    return;
  }
  
  radarChart = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: labels,
      datasets: [{
        label: '素养维度',
        data: values,
        backgroundColor: 'rgba(13, 148, 136, 0.2)',
        borderColor: '#0d9488',
        borderWidth: 2,
        pointBackgroundColor: '#0d9488'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        r: {
          beginAtZero: true,
          max: 10,
          ticks: {
            stepSize: 2
          }
        }
      }
    }
  });
}

// 渲染得分分布图
function renderScoreChart(questions) {
  const ctx = document.getElementById('score-chart');
  if (!ctx) return;
  
  if (scoreChart) {
    scoreChart.destroy();
  }
  
  // 计算各分数段人数
  const distribution = [0, 0, 0, 0, 0]; // 0-2, 2-4, 4-6, 6-8, 8-10
  
  questions.forEach(q => {
    const score = q.avg_score || 0;
    if (score < 2) distribution[0]++;
    else if (score < 4) distribution[1]++;
    else if (score < 6) distribution[2]++;
    else if (score < 8) distribution[3]++;
    else distribution[4]++;
  });
  
  scoreChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['0-2分', '2-4分', '4-6分', '6-8分', '8-10分'],
      datasets: [{
        label: '问题数',
        data: distribution,
        backgroundColor: ['#ef4444', '#f59e0b', '#eab308', '#22c55e', '#0d9488']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1
          }
        }
      }
    }
  });
}

// 加载回答列表
async function loadAnswerList() {
  const questions = classroomData?.questions || [];
  const currentQ = questions.find(q => !q.ended_at);
  
  if (!currentQ) {
    document.getElementById('answer-list').innerHTML = '<p class="empty-state">暂无回答</p>';
    return;
  }
  
  try {
    const res = await apiRequest(`/api/teacher/questions/${currentQ.id}/answers`);
    
    if (!res.success || res.data.length === 0) {
      document.getElementById('answer-list').innerHTML = '<p class="empty-state">暂无回答</p>';
      return;
    }
    
    document.getElementById('answer-list').innerHTML = res.data.map(a => `
      <div class="answer-item">
        <div class="student-name">${a.student_name || '学生'}</div>
        <div class="answer-content">${a.content ? a.content.substring(0, 100) + (a.content.length > 100 ? '...' : '') : ''}</div>
        <div class="answer-score">${a.total_score}分</div>
      </div>
    `).join('');
    
  } catch (error) {
    console.error('加载回答列表错误:', error);
    document.getElementById('answer-list').innerHTML = '<p class="empty-state">加载失败</p>';
  }
}

// ============ Socket事件处理 ============

function handleUserJoined(data) {
  if (!classroomData) return;
  
  // 更新学生数量
  const existingStudent = classroomData.students?.find(s => s.id === data.userId);
  if (!existingStudent) {
    classroomData.student_count = (classroomData.student_count || 0) + 1;
    if (!classroomData.students) classroomData.students = [];
    classroomData.students.push({ id: data.userId, name: data.userName });
  }
  
  updateRealtimeStats();
  
  // 添加学生标签
  const container = document.getElementById('student-list');
  const studentTag = document.getElementById(`student-${data.userId}`);
  if (!studentTag) {
    container.innerHTML += `<span class="student-tag" id="student-${data.userId}">${data.userName}</span>`;
  }
  
  showToast(`${data.userName} 加入了课堂`);
}

function handleUserLeft(data) {
  if (!classroomData) return;
  
  // 移除学生标签样式
  const studentTag = document.getElementById(`student-${data.userId}`);
  if (studentTag) {
    studentTag.classList.remove('answered');
  }
  
  showToast(`${data.userName} 离开了课堂`);
}

function handleNewQuestion(data) {
  showToast('收到新问题');
  loadClassroomData();
}

function handleEvalResult(data) {
  if (!classroomData) return;
  
  // 更新当前问题的回答数和平均分
  const questions = classroomData.questions || [];
  const q = questions.find(q => q.id === data.questionId);
  if (q) {
    const prevCount = q.answer_count || 0;
    const prevAvg = q.avg_score || 0;
    q.answer_count = prevCount + 1;
    q.avg_score = ((prevAvg * prevCount) + data.totalScore) / q.answer_count;
    
    // 更新UI
    updateCurrentQuestion();
    loadAnswerList();
    
    // 标记已回答的学生
    const studentTag = document.getElementById(`student-${data.studentId}`);
    if (studentTag) {
      studentTag.classList.add('answered');
    }
  }
  
  // 更新图表
  loadStats();
}

function handleClassroomStats(data) {
  if (classroomData) {
    classroomData.student_count = data.studentCount;
    updateRealtimeStats();
  }
}

// 显示二维码
function showQRModal() {
  if (window.qrCodeData && window.qrCodeData.qrCode) {
    document.getElementById('qr-code').src = window.qrCodeData.qrCode;
    document.getElementById('qr-url').textContent = window.qrCodeData.joinUrl;
  } else {
    // 使用默认值
    const url = `https://musicclass.zeabur.app/answer/${classroomData?.session_id || ''}`;
    document.getElementById('qr-url').textContent = url;
    // 尝试生成二维码
    generateQRCode(url);
  }
  document.getElementById('qr-modal').classList.add('show');
}

// 关闭二维码弹窗
function closeQRModal() {
  document.getElementById('qr-modal').classList.remove('show');
}

// 复制加入链接
async function copyJoinUrl() {
  const url = document.getElementById('qr-url').textContent;
  await copyToClipboard(url);
}

// 生成二维码（使用第三方API）
async function generateQRCode(text) {
  const img = document.getElementById('qr-code');
  img.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(text)}`;
}

// 数字动画
function animateNumber(element, targetValue) {
  if (!element) return;
  
  const current = parseInt(element.textContent) || 0;
  const increment = (targetValue - current) / 15;
  let step = 0;
  
  const timer = setInterval(() => {
    step++;
    const value = Math.round(current + increment * step);
    element.textContent = value;
    
    if (step >= 15) {
      element.textContent = targetValue;
      clearInterval(timer);
    }
  }, 30);
}
