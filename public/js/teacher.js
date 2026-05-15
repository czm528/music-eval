/**
 * 教师页面逻辑
 */

// 全局变量
let currentClassroom = null;
let classroomList = [];
let radarChart = null;
let distributionChart = null;
let studentScoresChart = null;
let qrCodeData = null;
let echartsInstances = []; // 管理ECharts实例，切换时销毁
let isLoadingClassroom = false; // 防止重复点击
// 分页相关全局变量
let allStudentTotalScores = [];
let totalScoresCurrentPage = 1;
const totalScoresPageSize = 10;
// 音频题相关变量
let selectedQuestionType = 'text';
let selectedAudioFile = null;

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
  // 防止重复点击
  if (isLoadingClassroom) return;
  isLoadingClassroom = true;
  
  try {
    // 先销毁旧的图表实例
    if (studentScoresChart) { studentScoresChart.destroy(); studentScoresChart = null; }
    if (radarChart) { radarChart.destroy(); radarChart = null; }
    if (distributionChart) { distributionChart.destroy(); distributionChart = null; }
    // 销毁ECharts实例
    echartsInstances.forEach(c => { try { c.dispose(); } catch(e) {} });
    echartsInstances = [];
    
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
    showToast('加载课堂失败');
  } finally {
    isLoadingClassroom = false;
  }
}

function updateStats() {
  if (!currentClassroom) return;
  
  animateNumber(document.getElementById('stat-students'), currentClassroom.student_count || 0);
  animateNumber(document.getElementById('stat-questions'), currentClassroom.questions?.length || 0);
  
  const totalAnswers = currentClassroom.questions?.reduce((sum, q) => sum + (q.answer_count || 0), 0) || 0;
  animateNumber(document.getElementById('stat-answers'), totalAnswers);
  
  const avgScore = currentClassroom.questions?.reduce((sum, q) => sum + (q.normalized_avg_score || 0), 0) / (currentClassroom.questions?.filter(q => q.avg_score).length || 1) || 0;
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
    currentAvg.textContent = currentQ.normalized_avg_score ? currentQ.normalized_avg_score.toFixed(1) : '0';
    // 给当前问题加删除按钮
    let delBtn = document.getElementById('delete-current-question-btn');
    if (!delBtn) {
      delBtn = document.createElement('button');
      delBtn.id = 'delete-current-question-btn';
      delBtn.className = 'btn btn-sm btn-danger';
      delBtn.style.cssText = 'margin-left:12px;font-size:12px;padding:4px 10px;';
      delBtn.textContent = '删除';
      delBtn.onclick = () => deleteQuestion(currentQ.id, currentQ.content);
      currentAvg.parentNode.appendChild(delBtn);
    } else {
      delBtn.onclick = () => deleteQuestion(currentQ.id, currentQ.content);
      delBtn.style.display = '';
    }
  } else {
    currentSection.style.display = 'none';
    const delBtn = document.getElementById('delete-current-question-btn');
    if (delBtn) delBtn.style.display = 'none';
  }
  
  // 历史问题
  const historyQuestions = questions.filter(q => q.ended_at);
  
  if (historyQuestions.length === 0) {
    historyContainer.innerHTML = '<p class="empty-state">暂无问题记录</p>';
    return;
  }
  
  historyContainer.innerHTML = historyQuestions.map(q => {
    // 解析维度信息
    let dimsText = '全部维度';
    try {
      if (q.dimensions) {
        const dims = typeof q.dimensions === 'string' ? JSON.parse(q.dimensions) : q.dimensions;
        if (Array.isArray(dims) && dims.length > 0) {
          dimsText = dims.map(d => dimensionNames[d] || d).join('、');
        }
      }
    } catch (e) {}
    
    return `
    <div class="question-card">
      <div class="question-content">${q.content}</div>
      <div class="question-meta">
        <span class="dimension-tag">${dimsText}</span>
        <span class="separator">|</span>
        <span>${q.answer_count || 0} 人回答</span>
        <span class="separator">|</span>
        <span>平均 ${q.normalized_avg_score ? q.normalized_avg_score.toFixed(1) : 0} 分</span>
        <button class="btn btn-sm btn-danger" style="float:right;font-size:12px;padding:2px 8px;" onclick="deleteQuestion(${q.id}, '${q.content.replace(/'/g, "\\'")}')">删除</button>
      </div>
    </div>
  `}).join('');
}

// 删除问题
async function deleteQuestion(questionId, questionContent) {
  if (!confirm(`确定删除问题「${questionContent}」吗？\n删除后该问题的所有回答也会被清除。`)) return;
  
  try {
    const token = getToken();
    const res = await fetch(`/api/teacher/questions/${questionId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    
    if (data.success) {
      showToast('问题已删除');
      selectClassroom(currentClassroom.id);
    } else {
      showToast(data.message || '删除失败');
    }
  } catch (error) {
    showToast('删除失败');
  }
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
  
  // 获取选中的维度
  const dimensionCheckboxes = document.querySelectorAll('input[name="dimensions"]:checked');
  const dimensions = Array.from(dimensionCheckboxes).map(cb => cb.value);
  
  if (!content) {
    showToast('请输入问题内容');
    return;
  }
  
  if (dimensions.length === 0) {
    showToast('请至少选择一个评分维度');
    return;
  }
  
  if (selectedQuestionType === 'audio' && !selectedAudioFile) {
    showToast('音准题需要上传参考旋律');
    return;
  }
  
  const publishBtn = document.querySelector('.question-panel .btn-primary');
  publishBtn.disabled = true;
  publishBtn.textContent = '转码中...';
  
  try {
    const formData = new FormData();
    formData.append('classroomId', currentClassroom.id);
    formData.append('content', content);
    formData.append('dimensions', JSON.stringify(dimensions));
    formData.append('questionType', selectedQuestionType);
    
    if (selectedAudioFile) {
      // 浏览器端转码为WAV，服务端只需要处理WAV格式
      try {
        const wavBlob = await convertToWav(selectedAudioFile);
        formData.append('reference_audio', wavBlob, 'reference.wav');
      } catch (e) {
        publishBtn.disabled = false;
        publishBtn.textContent = '发布问题';
        showToast('音频转码失败，请尝试较短的音频文件');
        return;
      }
    }
    
    const token = getToken();
    publishBtn.textContent = '上传中...';
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000); // 60秒超时
    
    const res = await fetch('/api/teacher/questions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    
    const data = await res.json();
    
    publishBtn.disabled = false;
    publishBtn.textContent = '发布问题';
    
    if (data.success) {
      showToast('问题已发布');
      document.getElementById('question-content').value = '';
      removeAudio();
      // 重置复选框为全选
      document.querySelectorAll('input[name="dimensions"]').forEach(cb => cb.checked = true);
      // 重置题目类型
      switchQuestionType('text');
      
      // 刷新课堂数据
      selectClassroom(currentClassroom.id);
    } else {
      showToast(data.message || '发布失败');
    }
  } catch (error) {
    console.error('发布问题错误:', error);
    publishBtn.disabled = false;
    publishBtn.textContent = '发布问题';
    if (error.name === 'AbortError') {
      showToast('上传超时，请尝试较短的音频文件');
    } else {
      showToast('网络错误');
    }
  }
}

// 切换题目类型
function switchQuestionType(type) {
  selectedQuestionType = type;
  const audioGroup = document.getElementById('audio-upload-group');
  const textArea = document.getElementById('question-content');
  
  if (type === 'audio') {
    audioGroup.style.display = '';
    textArea.placeholder = '请描述演唱要求（如：请演唱《欢乐颂》主题旋律）';
  } else {
    audioGroup.style.display = 'none';
    textArea.placeholder = '请输入音乐鉴赏问题，例如：\n请描述这段音乐的速度、力度和情感特点';
  }
}

// 处理音频上传
function handleAudioUpload(input) {
  const file = input.files[0];
  if (!file) return;
  
  selectedAudioFile = file;
  document.getElementById('upload-hint').style.display = 'none';
  document.getElementById('upload-preview').style.display = '';
  document.getElementById('audio-filename').textContent = file.name;
  document.getElementById('audio-preview-player').src = URL.createObjectURL(file);
}

// 移除音频
function removeAudio() {
  selectedAudioFile = null;
  document.getElementById('reference-audio-input').value = '';
  document.getElementById('upload-hint').style.display = '';
  document.getElementById('upload-preview').style.display = 'none';
}

// 加载课堂统计数据
async function loadClassroomStats() {
  if (!currentClassroom) return;
  
  try {
    const res = await apiRequest(`/api/teacher/classrooms/${currentClassroom.id}/stats`);
    
    if (!res.success) return;
    
    const data = res.data;
    
    // 渲染学生成绩横向柱状图
    renderStudentScoresChart(data.studentTotalScores);
    
    // 渲染雷达图
    renderRadarChart(data.dimensionAvgs);
    
    // 渲染得分分布
    renderDistributionChart(data.questions);
    
    // 渲染学生课堂总评列表
    renderStudentTotalScores(data.studentTotalScores);
    
    // 加载词云数据
    loadWordcloudData();
    
    // 更新回答详情
    loadAnswerList();
    
  } catch (error) {
    console.error('加载统计数据错误:', error);
  }
}

// 渲染学生成绩竖向柱状图（参考线：优秀/良好/中等/及格）
function renderStudentScoresChart(studentTotalScores) {
  const container = document.getElementById('stats-overview-section');
  if (!container || !studentTotalScores || studentTotalScores.length === 0) {
    if (container) container.style.display = 'none';
    return;
  }
  
  container.style.display = 'block';
  
  const ctx = document.getElementById('student-scores-chart');
  if (!ctx) return;
  
  // 按总评得分降序排列
  const sorted = [...studentTotalScores].sort((a, b) => b.totalScore - a.totalScore);
  // 姓名只取姓+名的第一个字，避免X轴标签重叠
  const studentNames = sorted.map(s => s.studentName.length > 2 ? s.studentName.substring(0, 2) : s.studentName);
  const scores = sorted.map(s => Math.round(s.totalScore * 10) / 10);
  
  if (studentScoresChart) {
    studentScoresChart.destroy();
  }
  
  // 50个学生时柱状图需要足够宽，设置canvas的宽度
  const minWidth = Math.max(600, studentNames.length * 40);
  const canvas = document.getElementById('student-scores-chart');
  const barContainer = container.querySelector('.bar-chart-container');
  
  // 动态计算canvas高度：每个学生至少28px，保证50人都能显示
  const chartHeight = Math.max(400, studentNames.length * 28);
  if (barContainer) {
    barContainer.style.height = chartHeight + 'px';
  }
  
  // 参考线插件
  const referenceLinePlugin = {
    id: 'referenceLines',
    afterDraw(chart) {
      const { ctx: c, chartArea, scales } = chart;
      const yAxis = scales.y;
      
      const lines = [
        { value: 90, label: '优秀(90)', color: '#eab308', dash: [] },
        { value: 80, label: '良好(80)', color: '#a16207', dash: [] },
        { value: 70, label: '中等(70)', color: '#84cc16', dash: [] },
        { value: 60, label: '及格(60)', color: '#ef4444', dash: [6, 4] }
      ];
      
      lines.forEach(line => {
        const yPos = yAxis.getPixelForValue(line.value);
        if (yPos < chartArea.top || yPos > chartArea.bottom) return;
        
        c.save();
        c.strokeStyle = line.color;
        c.lineWidth = 1.5;
        c.globalAlpha = 0.7;
        c.setLineDash(line.dash);
        c.beginPath();
        c.moveTo(chartArea.left, yPos);
        c.lineTo(chartArea.right, yPos);
        c.stroke();
        
        // 标签
        c.globalAlpha = 0.9;
        c.fillStyle = line.color;
        c.font = '11px sans-serif';
        c.textAlign = 'right';
        c.fillText(line.label, chartArea.right - 4, yPos - 4);
        c.restore();
      });
    }
  };
  
  // 柱体颜色：统一青蓝色
  const barColor = 'rgba(56, 189, 198, 0.85)';
  const barBorderColor = 'rgba(56, 189, 198, 1)';
  
  studentScoresChart = new Chart(ctx, {
    type: 'bar',
    plugins: [referenceLinePlugin],
    data: {
      labels: studentNames,
      datasets: [{
        label: '课堂总评得分',
        data: scores,
        backgroundColor: barColor,
        borderColor: barBorderColor,
        borderWidth: 1,
        borderRadius: 3,
        barPercentage: 0.8,
        categoryPercentage: 0.9
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: { top: 20, right: 20 }
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            title: function(items) {
              // 显示完整姓名
              const idx = items[0].dataIndex;
              return sorted[idx].studentName;
            },
            label: function(context) {
              const score = context.raw;
              let level = '不及格';
              if (score >= 90) level = '优秀';
              else if (score >= 80) level = '良好';
              else if (score >= 70) level = '中等';
              else if (score >= 60) level = '及格';
              return `${score}分 (${level})`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          grid: {
            color: '#f1f5f9'
          },
          ticks: {
            stepSize: 10
          }
        },
        x: {
          grid: {
            display: false
          },
          ticks: {
            maxRotation: 90,
            minRotation: 45,
            font: {
              size: 10
            },
            autoSkip: false
          }
        }
      }
    },
    plugins: [{
      // 在柱顶显示分数
      afterDatasetsDraw(chart) {
        const { ctx: c } = chart;
        chart.data.datasets.forEach((dataset, i) => {
          const meta = chart.getDatasetMeta(i);
          meta.data.forEach((bar, index) => {
            const value = dataset.data[index];
            c.save();
            c.fillStyle = '#334155';
            c.font = 'bold 10px sans-serif';
            c.textAlign = 'center';
            c.fillText(value, bar.x, bar.y - 4);
            c.restore();
          });
        });
      }
    }]
  });
}

// 加载词云数据
async function loadWordcloudData() {
  if (!currentClassroom) return;
  
  const questions = currentClassroom.questions || [];
  // 使用所有有回答的问题（不仅限于已结束的）
  const questionsWithAnswers = questions.filter(q => q.answer_count > 0);
  
  if (questionsWithAnswers.length === 0) {
    document.getElementById('wordcloud-section').style.display = 'none';
    return;
  }
  
  document.getElementById('wordcloud-section').style.display = 'block';
  
  // 渲染问题标签
  const tabsContainer = document.getElementById('wordcloud-tabs');
  tabsContainer.innerHTML = questionsWithAnswers.map((q, idx) => `
    <button class="wordcloud-tab ${idx === 0 ? 'active' : ''}" onclick="switchWordcloud(${q.id}, this)">
      题目${idx + 1}
    </button>
  `).join('');
  
  // 默认加载第一题的词云
  loadQuestionWordcloud(questionsWithAnswers[0].id);
}

// 切换词云
function switchWordcloud(questionId, btn) {
  // 更新标签样式
  document.querySelectorAll('.wordcloud-tab').forEach(tab => tab.classList.remove('active'));
  btn.classList.add('active');
  
  // 加载词云
  loadQuestionWordcloud(questionId);
}

// 加载单个问题的词云
async function loadQuestionWordcloud(questionId) {
  const container = document.getElementById('wordcloud-container');
  
  try {
    const res = await apiRequest(`/api/teacher/questions/${questionId}/wordcloud`);
    
    if (!res.success) {
      container.innerHTML = '<p class="empty-state">加载词云失败</p>';
      return;
    }
    
    const data = res.data || {};
    const strengths = data.strengths || [];
    const weaknesses = data.weaknesses || [];
    const dimensionOverview = data.dimensionOverview || [];
    
    // 如果两类都没有数据，显示提示
    if (strengths.length === 0 && weaknesses.length === 0) {
      container.innerHTML = '<p class="empty-state">暂无足够的评价数据生成词云</p>';
      return;
    }
    
    // 使用 ECharts 渲染双词云
    renderDualWordcloud(container, strengths, weaknesses, dimensionOverview);
    
  } catch (error) {
    console.error('加载词云数据错误:', error);
    container.innerHTML = '<p class="empty-state">加载词云失败</p>';
  }
}

// 渲染双词云（优势 + 不足）
function renderDualWordcloud(container, strengths, weaknesses, dimensionOverview) {
  const timestamp = Date.now();
  const strengthsId = 'wordcloud-strengths-' + timestamp;
  const weaknessesId = 'wordcloud-weaknesses-' + timestamp;
  
  // 构建HTML结构
  let html = `
    <div class="wordcloud-grid">
      <div class="wordcloud-half">
        <div class="wordcloud-label strengths-label">✅ 优势方面</div>
        <p class="wordcloud-desc">学生表现较好的关键词</p>
        <div class="wordcloud-chart" id="${strengthsId}">
          <p class="wordcloud-empty">暂无数据</p>
        </div>
      </div>
      <div class="wordcloud-half">
        <div class="wordcloud-label weaknesses-label">⚠️ 不足方面</div>
        <p class="wordcloud-desc">学生需要加强的关键词</p>
        <div class="wordcloud-chart" id="${weaknessesId}">
          <p class="wordcloud-empty">暂无数据</p>
        </div>
      </div>
    </div>
  `;
  
  // 添加维度概览条
  if (dimensionOverview && dimensionOverview.length > 0) {
    html += `
      <div class="dimension-overview">
        <div class="dimension-overview-title">📊 各维度平均得分</div>
        <div class="dimension-overview-bars">
          ${dimensionOverview.map(dim => {
            const statusIcon = dim.status === 'strength' ? '✅' : (dim.status === 'weakness' ? '⚠️' : '➖');
            const statusClass = dim.status === 'strength' ? 'status-good' : (dim.status === 'weakness' ? 'status-warning' : 'status-neutral');
            const barWidth = Math.min(dim.average * 10, 100);
            const barColor = dim.status === 'strength' ? '#22c55e' : (dim.status === 'weakness' ? '#ef4444' : '#f59e0b');
            
            return `
              <div class="dimension-item">
                <div class="dimension-info">
                  <span class="dimension-name">${dim.name}</span>
                  <span class="dimension-score ${statusClass}">${dim.average} ${statusIcon}</span>
                </div>
                <div class="dimension-bar-bg">
                  <div class="dimension-bar-fill" style="width: ${barWidth}%; background: ${barColor}"></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }
  
  container.innerHTML = html;
  
  // 渲染优势词云
  if (strengths.length > 0) {
    const strengthsContainer = document.getElementById(strengthsId);
    renderSingleWordcloud(strengthsContainer, strengths, 'strengths');
  }
  
  // 渲染不足词云
  if (weaknesses.length > 0) {
    const weaknessesContainer = document.getElementById(weaknessesId);
    renderSingleWordcloud(weaknessesContainer, weaknesses, 'weaknesses');
  }
}

// 渲染单个词云
function renderSingleWordcloud(container, words, type) {
  // 绿色系配色 - 优势
  const strengthColors = ['#22c55e', '#10b981', '#059669', '#34d399', '#6ee7b7', '#a7f3d0'];
  // 橙红色系配色 - 不足
  const weaknessColors = ['#f59e0b', '#ef4444', '#f97316', '#dc2626', '#fb923c', '#fca5a5'];
  
  const colors = type === 'strengths' ? strengthColors : weaknessColors;
  
  const chartId = 'wordcloud-chart-' + type + '-' + Date.now();
  container.innerHTML = `<div id="${chartId}" style="width: 100%; height: 350px;"></div>`;
  
  const chart = echarts.init(document.getElementById(chartId));
  echartsInstances.push(chart); // 跟踪实例，切换课堂时销毁
  
  // 格式化数据
  const wordCloudData = words.map((item, idx) => ({
    name: item.name,
    value: item.value,
    itemStyle: {
      color: colors[idx % colors.length]
    }
  }));
  
  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      show: true,
      formatter: function(params) {
        return `${params.name}: ${params.value}次`;
      }
    },
    series: [{
      type: 'wordCloud',
      shape: 'circle',
      left: 'center',
      top: 'center',
      width: '90%',
      height: '90%',
      sizeRange: [12, 48],
      rotationRange: [-30, 30],
      rotationStep: 15,
      gridSize: 8,
      drawOutOfBound: false,
      textStyle: {
        fontFamily: 'sans-serif',
        fontWeight: 'bold',
        color: function() {
          return colors[Math.floor(Math.random() * colors.length)];
        }
      },
      emphasis: {
        textStyle: {
          shadowBlur: 10,
          shadowColor: '#333'
        }
      },
      data: wordCloudData
    }]
  };
  
  chart.setOption(option);
}

// 使用 ECharts 渲染词云
function renderEChartsWordcloud(container, words) {
  // 生成唯一ID
  const chartId = 'wordcloud-chart-' + Date.now();
  container.innerHTML = `<div id="${chartId}" style="width: 100%; height: 400px;"></div>`;
  
  const chart = echarts.init(document.getElementById(chartId));
  echartsInstances.push(chart); // 跟踪实例，切换课堂时销毁
  
  // 词云颜色配置
  const colors = [
    '#0d9488', '#3b82f6', '#8b5cf6', '#ec4899', 
    '#f59e0b', '#10b981', '#6366f1', '#14b8a6'
  ];
  
  // 格式化数据
  const wordCloudData = words.map((item, idx) => ({
    name: item.name,
    value: item.value,
    itemStyle: {
      color: colors[idx % colors.length]
    }
  }));
  
  const option = {
    backgroundColor: '#ffffff',
    tooltip: {
      show: true,
      formatter: function(params) {
        return `${params.name}: ${params.value}次`;
      }
    },
    series: [{
      type: 'wordCloud',
      shape: 'circle',
      left: 'center',
      top: 'center',
      width: '90%',
      height: '90%',
      sizeRange: [14, 60],
      rotationRange: [-45, 45],
      rotationStep: 15,
      gridSize: 8,
      drawOutOfBound: false,
      textStyle: {
        fontFamily: 'sans-serif',
        fontWeight: 'bold',
        color: function() {
          return colors[Math.floor(Math.random() * colors.length)];
        }
      },
      emphasis: {
        textStyle: {
          shadowBlur: 10,
          shadowColor: '#333'
        }
      },
      data: wordCloudData
    }]
  };
  
  chart.setOption(option);
  
  // 响应窗口大小变化
  window.addEventListener('resize', function() {
    chart.resize();
  });
}

// 渲染学生课堂总评列表（带分页）
function renderStudentTotalScores(studentTotalScores) {
  const container = document.getElementById('student-total-scores');
  if (!container) return;
  
  if (!studentTotalScores || studentTotalScores.length === 0) {
    container.style.display = 'none';
    return;
  }
  
  container.style.display = '';
  // 存储完整数据并按总分降序排列
  allStudentTotalScores = [...studentTotalScores].sort((a, b) => b.totalScore - a.totalScore);
  totalScoresCurrentPage = 1;
  renderTotalScoresPage(1);
}

// 渲染指定页的数据
function renderTotalScoresPage(page) {
  const tbody = document.getElementById('total-scores-tbody');
  if (!tbody) return;
  
  const totalPages = Math.ceil(allStudentTotalScores.length / totalScoresPageSize);
  page = Math.max(1, Math.min(page, totalPages));
  totalScoresCurrentPage = page;
  
  const start = (page - 1) * totalScoresPageSize;
  const end = start + totalScoresPageSize;
  const pageData = allStudentTotalScores.slice(start, end);
  
  tbody.innerHTML = pageData.map(s => {
    const scoreColor = getScoreColor(s.totalScore / 10);
    const scoreLevel = getScoreLevel(s.totalScore / 10);
    return `
      <tr>
        <td>${s.studentNumber || '-'}</td>
        <td>${s.studentName}</td>
        <td><span class="score-badge ${scoreLevel}" style="background-color: ${scoreColor}">${s.totalScore}</span></td>
        <td>${s.questionCount} 题</td>
      </tr>
    `;
  }).join('');
  
  // 更新分页信息
  const pageInfo = document.getElementById('total-scores-page-info');
  if (pageInfo) pageInfo.textContent = `第 ${page}/${totalPages} 页`;
  
  // 更新按钮状态
  const prevBtn = document.querySelector('#total-scores-pagination .page-btn:first-child');
  const nextBtn = document.querySelector('#total-scores-pagination .page-btn:last-child');
  if (prevBtn) prevBtn.disabled = page <= 1;
  if (nextBtn) nextBtn.disabled = page >= totalPages;
}

// 翻页处理
function changeTotalScoresPage(delta) {
  renderTotalScoresPage(totalScoresCurrentPage + delta);
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
  
  // 计算各分数段人数（使用归一化后的100分制）
  const distribution = [0, 0, 0, 0, 0]; // 0-20, 20-40, 40-60, 60-80, 80-100
  
  questions.forEach(q => {
    const score = q.normalized_avg_score || 0;
    if (score < 20) distribution[0]++;
    else if (score < 40) distribution[1]++;
    else if (score < 60) distribution[2]++;
    else if (score < 80) distribution[3]++;
    else distribution[4]++;
  });
  
  distributionChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['0-20分', '20-40分', '40-60分', '60-80分', '80-100分'],
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
