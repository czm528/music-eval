/**
 * 教师页面逻辑
 */

// 全局变量
let currentClassroom = null;
let classroomList = [];
let radarChart = null;
let distributionChart = null;
let qrCodeData = null;

// 页面初始化
document.addEventListener('DOMContentLoaded', () => {
  if (!checkAuth()) return;
  
  const user = getUser();
  document.getElementById('user-name').textContent = user.nickname || user.username;
  
  // 加载课堂列表
  loadClassrooms();
  
  // 初始化Socket
  initSocket({
    onConnect: () => {
      console.log('Socket已连接');
      // 如果已选择课堂，重新加入
      if (currentClassroom) {
        joinClassroom({
          classroomId: currentClassroom.id,
          userId: user.id,
          userName: user.nickname,
          role: 'teacher'
        });
      }
    },
    onEvalResult: (data) => {
      handleEvalResult(data);
    },
    onClassroomStats: (data) => {
      handleClassroomStats(data);
    },
    onUserJoined: (data) => {
      handleUserJoined(data);
    },
    onUserLeft: (data) => {
      handleUserLeft(data);
    }
  });
  
  startPing();
});

// 加载课堂列表
async function loadClassrooms() {
  try {
    const res = await apiRequest('/api/teacher/classrooms');
    
    if (!res.success) {
      showToast('加载课堂列表失败');
      return;
    }
    
    classroomList = res.data || [];
    renderClassroomList();
  } catch (error) {
    console.error('加载课堂列表错误:', error);
    showToast('网络错误');
  }
}

function renderClassroomList() {
  const container = document.getElementById('classroom-list');
  
  if (classroomList.length === 0) {
    container.innerHTML = '<p class="empty-state">暂无课堂，点击上方「新建」创建</p>';
    return;
  }
  
  container.innerHTML = classroomList.map(c => `
    <div class="classroom-item ${currentClassroom && currentClassroom.id === c.id ? 'active' : ''}" 
         onclick="selectClassroom(${c.id})">
      <h4>${c.name}</h4>
      <p>${c.description || '无描述'}</p>
      <div class="meta">
        <span>👥 ${c.student_count || 0}人</span>
        <span>📝 ${c.question_count || 0}题</span>
        <span class="status ${c.status}">${c.status === 'active' ? '进行中' : '已结束'}</span>
      </div>
    </div>
  `).join('');
}

// 选择课堂
async function selectClassroom(id) {
  try {
    const res = await apiRequest(`/api/teacher/classrooms/${id}`);
    
    if (!res.success) {
      showToast('加载课堂详情失败');
      return;
    }
    
    currentClassroom = res.data;
    qrCodeData = {
      qrCode: res.data.qrCode,
      joinUrl: res.data.joinUrl
    };
    
    // 更新UI
    document.getElementById('no-classroom').classList.add('hidden');
    document.getElementById('classroom-view').classList.remove('hidden');
    
    // 更新课堂信息
    document.getElementById('classroom-name').textContent = currentClassroom.name;
    document.getElementById('classroom-desc').textContent = currentClassroom.description || '无描述';
    
    // 更新统计
    updateStats();
    
    // 更新问题列表
    renderQuestions();
    
    // 加载图表
    loadClassroomStats();
    
    // 加入Socket房间
    const user = getUser();
    joinClassroom({
      classroomId: currentClassroom.id,
      userId: user.id,
      userName: user.nickname,
      role: 'teacher'
    });
    
    // 更新列表选中状态
    renderClassroomList();
    
  } catch (error) {
    console.error('选择课堂错误:', error);
    showToast('网络错误');
  }
}

function updateStats() {
  if (!currentClassroom) return;
  
  animateNumber(document.getElementById('stat-students'), currentClassroom.student_count || 0);
  animateNumber(document.getElementById('stat-questions'), currentClassroom.questions?.length || 0);
  
  const totalAnswers = currentClassroom.questions?.reduce((sum, q) => sum + (q.answer_count || 0), 0) || 0;
  animateNumber(document.getElementById('stat-answers'), totalAnswers);
  
  const avgScore = currentClassroom.questions?.reduce((sum, q) => sum + (q.avg_score || 0), 0) / (currentClassroom.questions?.filter(q => q.avg_score).length || 1) || 0;
  document.getElementById('stat-avg').textContent = avgScore.toFixed(1);
}

function renderQuestions() {
  if (!currentClassroom) return;
  
  const questions = currentClassroom.questions || [];
  const historyContainer = document.getElementById('question-history');
  const currentSection = document.getElementById('current-question-section');
  const currentText = document.getElementById('current-question-text');
  const currentAnswers = document.getElementById('current-question-answers');
  const currentAvg = document.getElementById('current-question-avg');
  
  // 查找当前进行中的问题
  const currentQ = questions.find(q => !q.ended_at);
  
  if (currentQ) {
    currentSection.style.display = 'block';
    currentText.textContent = currentQ.content;
    currentAnswers.textContent = currentQ.answer_count || 0;
    currentAvg.textContent = currentQ.avg_score ? currentQ.avg_score.toFixed(1) : '0';
  } else {
    currentSection.style.display = 'none';
  }
  
  // 历史问题
  const historyQuestions = questions.filter(q => q.ended_at);
  
  if (historyQuestions.length === 0) {
    historyContainer.innerHTML = '<p class="empty-state">暂无问题记录</p>';
    return;
  }
  
  historyContainer.innerHTML = historyQuestions.map(q => `
    <div class="question-card">
      <div class="question-content">${q.content}</div>
      <div class="question-meta">
        <span>${q.answer_count || 0} 人回答</span>
        <span class="separator">|</span>
        <span>平均 ${q.avg_score ? q.avg_score.toFixed(1) : 0} 分</span>
      </div>
    </div>
  `).join('');
}

// 发布问题
async function publishQuestion() {
  if (!currentClassroom) {
    showToast('请先选择课堂');
    return;
  }
  
  if (currentClassroom.status !== 'active') {
    showToast('课堂已结束，无法发布问题');
    return;
  }
  
  const content = document.getElementById('question-content').value.trim();
  const dimension = document.getElementById('question-dimension').value;
  
  if (!content) {
    showToast('请输入问题内容');
    return;
  }
  
  const publishBtn = document.querySelector('.question-panel .btn-primary');
  publishBtn.disabled = true;
  publishBtn.textContent = '发布中...';
  
  try {
    const res = await apiRequest('/api/teacher/questions', {
      method: 'POST',
      body: {
        classroomId: currentClassroom.id,
        content: content,
        dimension: dimension || null
      }
    });
    
    publishBtn.disabled = false;
    publishBtn.textContent = '发布问题';
    
    if (res.success) {
      showToast('问题已发布');
      document.getElementById('question-content').value = '';
      document.getElementById('question-dimension').value = '';
      
      // 刷新课堂数据
      selectClassroom(currentClassroom.id);
    } else {
      showToast(res.message || '发布失败');
    }
  } catch (error) {
    console.error('发布问题错误:', error);
    publishBtn.disabled = false;
    publishBtn.textContent = '发布问题';
    showToast('网络错误');
  }
}

// 加载课堂统计数据
async function loadClassroomStats() {
  if (!currentClassroom) return;
  
  try {
    const res = await apiRequest(`/api/teacher/classrooms/${currentClassroom.id}/stats`);
    
    if (!res.success) return;
    
    const data = res.data;
    
    // 渲染雷达图
    renderRadarChart(data.dimensionAvgs);
    
    // 渲染得分分布
    renderDistributionChart(data.questions);
    
    // 更新回答详情
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
function renderDistributionChart(questions) {
  const ctx = document.getElementById('score-distribution-chart');
  if (!ctx) return;
  
  if (distributionChart) {
    distributionChart.destroy();
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
  
  distributionChart = new Chart(ctx, {
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
  if (!currentClassroom) return;
  
  const questions = currentClassroom.questions || [];
  const currentQ = questions.find(q => !q.ended_at);
  
  if (!currentQ) {
    // 显示历史回答
    const allAnswers = [];
    for (const q of questions) {
      try {
        const res = await apiRequest(`/api/teacher/questions/${q.id}/answers`);
        if (res.success) {
          res.data.forEach(a => {
            allAnswers.push({...a, question: q.content});
          });
        }
      } catch (e) {}
    }
    
    if (allAnswers.length > 0) {
      renderAnswerList(allAnswers.slice(0, 20));
    }
    return;
  }
  
  try {
    const res = await apiRequest(`/api/teacher/questions/${currentQ.id}/answers`);
    
    if (res.success && res.data.length > 0) {
      renderAnswerList(res.data);
    }
  } catch (error) {
    console.error('加载回答列表错误:', error);
  }
}

function renderAnswerList(answers) {
  const container = document.getElementById('answer-list');
  if (!container) return;
  
  if (!answers || answers.length === 0) {
    container.innerHTML = '<p class="empty-state">暂无回答</p>';
    return;
  }
  
  container.innerHTML = answers.map(a => `
    <div class="answer-item">
      <div class="student-name">${a.student_name || '学生'}</div>
      <div class="answer-content">${a.content ? a.content.substring(0, 80) + (a.content.length > 80 ? '...' : '') : ''}</div>
      <div class="answer-score">${a.total_score}分</div>
    </div>
  `).join('');
}

// 显示创建课堂弹窗
function showCreateClassroom() {
  document.getElementById('create-modal').classList.add('show');
  document.getElementById('classroom-name-input').value = '';
  document.getElementById('classroom-desc-input').value = '';
}

// 关闭创建弹窗
function closeCreateModal() {
  document.getElementById('create-modal').classList.remove('show');
}

// 创建课堂
async function createClassroom() {
  const name = document.getElementById('classroom-name-input').value.trim();
  const description = document.getElementById('classroom-desc-input').value.trim();
  
  if (!name) {
    showToast('请输入课堂名称');
    return;
  }
  
  const createBtn = document.querySelector('#create-modal .btn-primary');
  createBtn.disabled = true;
  createBtn.textContent = '创建中...';
  
  try {
    const res = await apiRequest('/api/teacher/classrooms', {
      method: 'POST',
      body: {
        name: name,
        description: description
      }
    });
    
    createBtn.disabled = false;
    createBtn.textContent = '创建';
    
    if (res.success) {
      showToast('课堂创建成功');
      closeCreateModal();
      
      // 刷新课堂列表
      await loadClassrooms();
      
      // 如果返回了二维码，直接打开二维码弹窗
      if (res.data.qrCode) {
        qrCodeData = {
          qrCode: res.data.qrCode,
          joinUrl: res.data.joinUrl
        };
        showQRCode();
      }
      
      // 选择新创建的课堂
      if (res.data.id) {
        selectClassroom(res.data.id);
      }
    } else {
      showToast(res.message || '创建失败');
    }
  } catch (error) {
    console.error('创建课堂错误:', error);
    createBtn.disabled = false;
    createBtn.textContent = '创建';
    showToast('网络错误');
  }
}

// 显示二维码
function showQRCode() {
  if (!currentClassroom) {
    showToast('请先选择课堂');
    return;
  }
  
  // 如果已有二维码数据，直接显示
  if (qrCodeData && qrCodeData.qrCode) {
    document.getElementById('qr-code').src = qrCodeData.qrCode;
    document.getElementById('qr-url').textContent = qrCodeData.joinUrl;
    document.getElementById('qr-modal').classList.add('show');
    return;
  }
  
  // 否则重新获取
  apiRequest(`/api/teacher/classrooms/${currentClassroom.id}`)
    .then(res => {
      if (res.success && res.data.qrCode) {
        qrCodeData = {
          qrCode: res.data.qrCode,
          joinUrl: res.data.joinUrl
        };
        document.getElementById('qr-code').src = res.data.qrCode;
        document.getElementById('qr-url').textContent = res.data.joinUrl;
      } else {
        document.getElementById('qr-url').textContent = `https://musicclass.zeabur.app/answer/${currentClassroom.session_id}`;
      }
      document.getElementById('qr-modal').classList.add('show');
    });
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

// 结束课堂
async function endClassroom() {
  if (!currentClassroom) return;
  
  if (!confirm('确定要结束这个课堂吗？结束后学生将无法继续加入。')) {
    return;
  }
  
  try {
    const res = await apiRequest(`/api/teacher/classrooms/${currentClassroom.id}/end`, {
      method: 'POST'
    });
    
    if (res.success) {
      showToast('课堂已结束');
      currentClassroom.status = 'ended';
      renderClassroomList();
    } else {
      showToast(res.message || '操作失败');
    }
  } catch (error) {
    console.error('结束课堂错误:', error);
    showToast('网络错误');
  }
}

// ============ Socket事件处理 ============

function handleEvalResult(data) {
  // 刷新课堂数据
  if (currentClassroom && data.questionId) {
    // 更新回答计数
    const questions = currentClassroom.questions || [];
    const q = questions.find(q => q.id === data.questionId);
    if (q) {
      q.answer_count = (q.answer_count || 0) + 1;
      updateStats();
      renderQuestions();
      loadAnswerList();
    }
  }
}

function handleClassroomStats(data) {
  if (currentClassroom) {
    currentClassroom.student_count = data.studentCount;
    updateStats();
  }
}

function handleUserJoined(data) {
  if (!currentClassroom) return;
  
  // 更新学生数量
  currentClassroom.student_count = (currentClassroom.student_count || 0) + 1;
  updateStats();
  
  // 如果有学生列表，更新显示
  if (!currentClassroom.students) {
    currentClassroom.students = [];
  }
  
  const exists = currentClassroom.students.find(s => s.id === data.userId);
  if (!exists) {
    currentClassroom.students.push({
      id: data.userId,
      name: data.userName
    });
  }
  
  showToast(`${data.userName} 加入了课堂`);
}

function handleUserLeft(data) {
  if (!currentClassroom) return;
  
  showToast(`${data.userName} 离开了课堂`);
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
