/**
 * 学生个人页面逻辑
 */

// 全局变量
let radarChart = null;
let currentPage = 1;
let hasMoreHistory = false;

// 页面初始化
document.addEventListener('DOMContentLoaded', () => {
  if (!checkAuth()) return;
  
  const user = getUser();
  if (user.role !== 'student') {
    showToast('请使用学生账号访问');
    window.location.href = '/login';
    return;
  }
  
  // 加载个人信息
  loadProfile();
  
  // 加载素养画像
  loadCompetency();
  
  // 加载历史记录
  loadHistory();
});

async function loadProfile() {
  const res = await apiRequest('/api/student/profile');
  
  if (!res.success) {
    showToast('加载信息失败');
    return;
  }
  
  const data = res.data;
  
  // 更新学生信息
  document.getElementById('student-name').textContent = data.student.name;
  document.getElementById('student-class').textContent = data.student.class_name || '未分配班级';
  
  // 更新统计
  document.getElementById('total-answers').textContent = data.stats.totalAnswers;
  document.getElementById('avg-score').textContent = data.stats.avgScore;
}

async function loadCompetency() {
  const res = await apiRequest('/api/student/competency');
  
  if (!res.success) {
    return;
  }
  
  const data = res.data;
  
  // 渲染雷达图
  renderRadarChart(data.dimensionAvgs);
  
  // 渲染维度列表
  renderCompetencyList(data.dimensionAvgs);
}

function renderRadarChart(dimensionAvgs) {
  const ctx = document.getElementById('competency-radar');
  if (!ctx) return;
  
  const labels = Object.values(dimensionNames);
  const values = Object.values(dimensionAvgs).map(v => v.score || 0);
  
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
        label: '素养得分',
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

function renderCompetencyList(dimensionAvgs) {
  const container = document.getElementById('competency-list');
  
  container.innerHTML = Object.entries(dimensionAvgs).map(([key, data]) => `
    <div class="competency-item">
      <div class="comp-name">${data.name}</div>
      <div class="comp-score">${data.score}</div>
    </div>
  `).join('');
}

async function loadHistory(page = 1) {
  const res = await apiRequest(`/api/student/history?page=${page}&limit=10`);
  
  if (!res.success) {
    showToast('加载历史记录失败');
    return;
  }
  
  const data = res.data;
  
  // 渲染历史记录
  renderHistoryList(data.answers, page === 1);
  
  // 更新分页状态
  hasMoreHistory = page < data.pagination.totalPages;
  document.getElementById('load-more').style.display = hasMoreHistory ? 'block' : 'none';
  
  currentPage = page;
}

function renderHistoryList(answers, clear = true) {
  const container = document.getElementById('history-list');
  
  if (!answers || answers.length === 0) {
    container.innerHTML = '<p class="empty-state">暂无答题记录</p>';
    return;
  }
  
  const html = answers.map(a => {
    // 解析维度数据
    let dimensionsHtml = '';
    if (a.dimensions && typeof a.dimensions === 'object') {
      dimensionsHtml = Object.entries(a.dimensions)
        .map(([key, score]) => `<span class="dim-tag">${getDimensionName(key)}: ${score}</span>`)
        .join('');
    }
    
    return `
      <div class="history-item" onclick="showAnswerDetail(${a.id})">
        <div class="history-question">${a.question_content}</div>
        <div class="history-answer">${a.content.substring(0, 80)}${a.content.length > 80 ? '...' : ''}</div>
        <div style="margin-top: 8px;">
          <span class="history-score">${a.total_score}分</span>
          ${dimensionsHtml}
        </div>
        <div class="history-meta">
          <span>${formatDate(a.evaluated_at)}</span>
        </div>
      </div>
    `;
  }).join('');
  
  if (clear) {
    container.innerHTML = html;
  } else {
    container.innerHTML += html;
  }
}

function loadMoreHistory() {
  loadHistory(currentPage + 1);
}

// 显示回答详情
async function showAnswerDetail(answerId, questionId) {
  try {
    // 使用新的API获取回答详情
    const res = await apiRequest(`/api/student/answers/${questionId}`);
    
    if (!res.success) {
      showToast('获取详情失败');
      return;
    }
    
    const answer = res.data;
    
    // 填充弹窗内容
    document.getElementById('detail-question').textContent = answer.question_content || '-';
    document.getElementById('detail-answer').textContent = answer.content || '-';
    document.getElementById('detail-score').textContent = answer.total_score || 0;
    document.getElementById('detail-comment').textContent = answer.comment || '暂无评语';
    
    // 填充维度得分
    const dimensionsContainer = document.getElementById('detail-dimensions');
    let dims = answer.dimensions;
    
    if (typeof dims === 'string') {
      try {
        dims = JSON.parse(dims);
      } catch (e) {
        dims = {};
      }
    }
    
    dimensionsContainer.innerHTML = Object.entries(dims || {}).map(([key, score]) => `
      <div class="detail-dim-item">
        <span class="detail-dim-name">${getDimensionName(key)}</span>
        <span class="detail-dim-score">${score}</span>
      </div>
    `).join('') || '<p>暂无维度数据</p>';
    
    // 显示弹窗
    document.getElementById('answer-modal').classList.add('show');
  } catch (error) {
    console.error('获取回答详情错误:', error);
    showToast('获取详情失败');
  }
}

function closeAnswerModal() {
  document.getElementById('answer-modal').classList.remove('show');
}
