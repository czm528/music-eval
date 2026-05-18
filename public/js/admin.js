/**
 * 管理员页面逻辑
 */

// 页面初始化
document.addEventListener('DOMContentLoaded', () => {
  if (!checkAuth()) return;
  
  const user = getUser();
  document.getElementById('user-name').textContent = user.nickname || user.username;
  
  // 加载导航
  loadNavigation();
  
  // 加载初始数据
  loadDashboard();
  loadTeachers();
  loadClasses();
  loadStudents();
  loadConfig();
});

// 导航切换
function loadNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const section = item.dataset.section;
      
      // 更新导航状态
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      
      // 更新内容显示
      document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
      document.getElementById(`section-${section}`).classList.add('active');
      
      // 更新页面标题
      const titles = {
        dashboard: '数据总览',
        teachers: '教师管理',
        classes: '班级管理',
        students: '学生管理',
        config: '系统配置'
      };
      document.querySelector('.page-header h1').textContent = titles[section] || section;
      
      // 刷新对应数据
      switch (section) {
        case 'dashboard':
          loadDashboard();
          break;
        case 'teachers':
          loadTeachers();
          break;
        case 'classes':
          loadClasses();
          break;
        case 'students':
          loadStudents();
          break;
        case 'config':
          loadConfig();
          break;
      }
    });
  });
}

// ============ 数据总览 ============
let radarChart = null;
let overviewChart = null;

async function loadDashboard() {
  const res = await apiRequest('/api/admin/stats');
  
  if (!res.success) {
    showToast('加载数据失败');
    return;
  }
  
  const data = res.data;
  
  // 更新统计卡片
  animateNumber(document.getElementById('stat-teachers'), data.teacherCount);
  animateNumber(document.getElementById('stat-classes'), data.classCount);
  animateNumber(document.getElementById('stat-students'), data.studentCount);
  animateNumber(document.getElementById('stat-answers'), data.answerCount);
  
  // 渲染雷达图
  renderRadarChart(data.dimensionAvgs);
  
  // 渲染概览图
  renderOverviewChart(data);
  
  // 渲染最近活动
  renderRecentActivity(data.recentAnswers);
}

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
        label: '平均得分',
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

function renderOverviewChart(data) {
  const ctx = document.getElementById('overview-chart');
  if (!ctx) return;
  
  if (overviewChart) {
    overviewChart.destroy();
  }
  
  overviewChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['教师', '班级', '学生', '回答'],
      datasets: [{
        data: [data.teacherCount, data.classCount, data.studentCount, data.answerCount],
        backgroundColor: ['#6366f1', '#f59e0b', '#22c55e', '#0d9488']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: false
        }
      }
    }
  });
}

function renderRecentActivity(answers) {
  const container = document.getElementById('activity-list');
  
  if (!answers || answers.length === 0) {
    container.innerHTML = '<p class="empty-state">暂无数据</p>';
    return;
  }
  
  container.innerHTML = answers.map(a => `
    <div class="activity-item">
      <div class="activity-avatar">👨‍🎓</div>
      <div class="activity-content">
        <div class="activity-text">
          <strong>${a.student_name}</strong> 回答了问题
        </div>
        <div class="activity-time">${formatDate(a.evaluated_at)}</div>
      </div>
      <div class="activity-score">
        <span class="score-badge">${a.total_score || 0}分</span>
      </div>
    </div>
  `).join('');
}

// ============ 教师管理 ============
async function loadTeachers() {
  const res = await apiRequest('/api/admin/teachers');
  
  if (!res.success) {
    showToast('加载教师列表失败');
    return;
  }
  
  const tbody = document.querySelector('#teachers-table tbody');
  
  if (res.data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">暂无教师</td></tr>';
    return;
  }
  
  tbody.innerHTML = res.data.map(t => `
    <tr>
      <td>${t.id}</td>
      <td>${t.username}</td>
      <td>${t.nickname}</td>
      <td>${t.email || '-'}</td>
      <td>${formatDate(t.created_at)}</td>
      <td class="actions">
        <button class="btn btn-sm btn-secondary" onclick="editTeacher(${t.id})">编辑</button>
        <button class="btn btn-sm btn-danger" onclick="deleteTeacher(${t.id})">删除</button>
      </td>
    </tr>
  `).join('');
}

function showTeacherModal(id = null) {
  const modal = document.getElementById('teacher-modal');
  const title = document.getElementById('teacher-modal-title');
  const passwordHint = document.getElementById('password-hint');
  
  if (id) {
    title.textContent = '编辑教师';
    passwordHint.textContent = '（不修改请留空）';
    // 加载教师数据
    loadTeacherData(id);
  } else {
    title.textContent = '添加教师';
    passwordHint.textContent = '*';
    document.getElementById('teacher-id').value = '';
    document.getElementById('teacher-username').value = '';
    document.getElementById('teacher-nickname').value = '';
    document.getElementById('teacher-email').value = '';
    document.getElementById('teacher-password').value = '';
    document.getElementById('teacher-username').disabled = false;
  }
  
  modal.classList.add('show');
}

function closeTeacherModal() {
  document.getElementById('teacher-modal').classList.remove('show');
}

async function loadTeacherData(id) {
  const teachers = await apiRequest('/api/admin/teachers');
  const teacher = teachers.data.find(t => t.id === id);
  
  if (teacher) {
    document.getElementById('teacher-id').value = teacher.id;
    document.getElementById('teacher-username').value = teacher.username;
    document.getElementById('teacher-username').disabled = true;
    document.getElementById('teacher-nickname').value = teacher.nickname;
    document.getElementById('teacher-email').value = teacher.email || '';
    document.getElementById('teacher-password').value = '';
  }
}

async function saveTeacher() {
  const id = document.getElementById('teacher-id').value;
  const username = document.getElementById('teacher-username').value;
  const nickname = document.getElementById('teacher-nickname').value;
  const email = document.getElementById('teacher-email').value;
  const password = document.getElementById('teacher-password').value;
  
  if (!nickname) {
    showToast('请填写姓名');
    return;
  }
  
  if (!id && !password) {
    showToast('请填写密码');
    return;
  }
  
  const data = { nickname, email };
  if (password) data.password = password;
  
  const url = id ? `/api/admin/teachers/${id}` : '/api/admin/teachers';
  const method = id ? 'PUT' : 'POST';
  
  if (!id) {
    data.username = username;
  }
  
  const res = await apiRequest(url, {
    method,
    body: data
  });
  
  if (res.success) {
    showToast(id ? '更新成功' : '创建成功');
    closeTeacherModal();
    loadTeachers();
  } else {
    showToast(res.message || '操作失败');
  }
}

async function editTeacher(id) {
  showTeacherModal(id);
}

async function deleteTeacher(id) {
  if (!confirm('确定要删除该教师吗？')) return;
  
  const res = await apiRequest(`/api/admin/teachers/${id}`, {
    method: 'DELETE'
  });
  
  if (res.success) {
    showToast('删除成功');
    loadTeachers();
  } else {
    showToast(res.message || '删除失败');
  }
}

// ============ 班级管理 ============
let allTeachers = [];

async function loadClasses() {
  const [classRes, teacherRes] = await Promise.all([
    apiRequest('/api/admin/classes'),
    apiRequest('/api/admin/teachers')
  ]);
  
  allTeachers = teacherRes.data || [];
  
  if (!classRes.success) {
    showToast('加载班级列表失败');
    return;
  }
  
  const tbody = document.querySelector('#classes-table tbody');
  
  if (classRes.data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">暂无班级</td></tr>';
    return;
  }
  
  tbody.innerHTML = classRes.data.map(c => `
    <tr>
      <td>${c.id}</td>
      <td>${c.name}</td>
      <td>${c.grade || '-'}</td>
      <td>${c.teacher_name || '-'}</td>
      <td>${c.student_count}</td>
      <td class="actions">
        <button class="btn btn-sm btn-secondary" onclick="editClass(${c.id})">编辑</button>
        <button class="btn btn-sm btn-danger" onclick="deleteClass(${c.id})">删除</button>
      </td>
    </tr>
  `).join('');
}

function showClassModal(id = null) {
  const modal = document.getElementById('class-modal');
  const title = document.getElementById('class-modal-title');
  const select = document.getElementById('class-teacher');
  
  // 填充教师下拉框
  select.innerHTML = '<option value="">无</option>' + allTeachers.map(t => 
    `<option value="${t.id}">${t.nickname}</option>`
  ).join('');
  
  if (id) {
    title.textContent = '编辑班级';
    loadClassData(id);
  } else {
    title.textContent = '添加班级';
    document.getElementById('class-id').value = '';
    document.getElementById('class-name').value = '';
    document.getElementById('class-grade').value = '';
    document.getElementById('class-teacher').value = '';
    document.getElementById('class-desc').value = '';
  }
  
  modal.classList.add('show');
}

function closeClassModal() {
  document.getElementById('class-modal').classList.remove('show');
}

async function loadClassData(id) {
  const classes = await apiRequest('/api/admin/classes');
  const cls = classes.data.find(c => c.id === id);
  
  if (cls) {
    document.getElementById('class-id').value = cls.id;
    document.getElementById('class-name').value = cls.name;
    document.getElementById('class-grade').value = cls.grade || '';
    document.getElementById('class-teacher').value = cls.teacher_id || '';
    document.getElementById('class-desc').value = cls.description || '';
  }
}

async function saveClass() {
  const id = document.getElementById('class-id').value;
  const name = document.getElementById('class-name').value;
  const grade = document.getElementById('class-grade').value;
  const teacherId = document.getElementById('class-teacher').value;
  const description = document.getElementById('class-desc').value;
  
  if (!name) {
    showToast('请填写班级名称');
    return;
  }
  
  const data = { name, grade, teacherId: teacherId || null, description };
  
  const url = id ? `/api/admin/classes/${id}` : '/api/admin/classes';
  const method = id ? 'PUT' : 'POST';
  
  const res = await apiRequest(url, {
    method,
    body: data
  });
  
  if (res.success) {
    showToast(id ? '更新成功' : '创建成功');
    closeClassModal();
    loadClasses();
  } else {
    showToast(res.message || '操作失败');
  }
}

async function editClass(id) {
  showClassModal(id);
}

async function deleteClass(id) {
  if (!confirm('确定要删除该班级吗？')) return;
  
  const res = await apiRequest(`/api/admin/classes/${id}`, {
    method: 'DELETE'
  });
  
  if (res.success) {
    showToast('删除成功');
    loadClasses();
  } else {
    showToast(res.message || '删除失败');
  }
}

// ============ 学生管理 ============
async function loadStudents() {
  const classId = document.getElementById('filter-class').value;
  
  const [studentRes, classRes] = await Promise.all([
    apiRequest(`/api/admin/students${classId ? '?classId=' + classId : ''}`),
    apiRequest('/api/admin/classes')
  ]);
  
  // 填充班级筛选下拉框
  const filterSelect = document.getElementById('filter-class');
  if (filterSelect.options.length <= 1) {
    filterSelect.innerHTML = '<option value="">全部班级</option>' + 
      (classRes.data || []).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    if (classId) filterSelect.value = classId;
  }
  
  // 填充添加学生弹窗的班级下拉
  const addSelect = document.getElementById('student-class');
  if (addSelect.options.length <= 1) {
    addSelect.innerHTML = '<option value="">无</option>' + 
      (classRes.data || []).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  }
  
  if (!studentRes.success) {
    showToast('加载学生列表失败');
    return;
  }
  
  const tbody = document.querySelector('#students-table tbody');
  
  if (studentRes.data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">暂无学生</td></tr>';
    return;
  }
  
  tbody.innerHTML = studentRes.data.map(s => `
    <tr>
      <td>${s.student_number}</td>
      <td>${s.name}</td>
      <td>${s.class_name || '-'}</td>
      <td>${s.answer_count || 0}</td>
      <td>${s.avg_score ? s.avg_score.toFixed(1) : '-'}</td>
      <td class="actions">
        <button class="btn btn-sm btn-danger" onclick="deleteStudent(${s.id})">删除</button>
      </td>
    </tr>
  `).join('');
}

function showStudentModal() {
  document.getElementById('student-modal-title').textContent = '添加学生';
  document.getElementById('student-number').value = '';
  document.getElementById('student-name').value = '';
  document.getElementById('student-class').value = '';
  document.getElementById('student-modal').classList.add('show');
}

function closeStudentModal() {
  document.getElementById('student-modal').classList.remove('show');
}

async function saveStudent() {
  const studentNumber = document.getElementById('student-number').value;
  const name = document.getElementById('student-name').value;
  const classId = document.getElementById('student-class').value;
  
  if (!studentNumber || !name) {
    showToast('请填写学号和姓名');
    return;
  }
  
  const res = await apiRequest('/api/admin/students', {
    method: 'POST',
    body: {
      studentNumber,
      name,
      classId: classId || null
    }
  });
  
  if (res.success) {
    showToast('创建成功');
    closeStudentModal();
    loadStudents();
  } else {
    showToast(res.message || '操作失败');
  }
}

async function deleteStudent(id) {
  if (!confirm('确定要删除该学生吗？')) return;
  
  const res = await apiRequest(`/api/admin/students/${id}`, {
    method: 'DELETE'
  });
  
  if (res.success) {
    showToast('删除成功');
    loadStudents();
  } else {
    showToast(res.message || '删除失败');
  }
}

// ============ 系统配置 ============
async function loadConfig() {
  const res = await apiRequest('/api/admin/config');
  
  if (!res.success) return;
  
  const config = res.data;
  
  document.getElementById('ai-enabled').checked = config.ai_enabled === 'true';
  document.getElementById('ai-api-url').value = config.ai_api_url || '';
  document.getElementById('ai-api-key').value = config.ai_api_key || '';
  document.getElementById('ai-model').value = config.ai_model || 'gpt-3.5-turbo';
}

async function saveConfig() {
  const enabled = document.getElementById('ai-enabled').checked;
  const apiUrl = document.getElementById('ai-api-url').value;
  const apiKey = document.getElementById('ai-api-key').value;
  const model = document.getElementById('ai-model').value;
  
  await Promise.all([
    apiRequest('/api/admin/config', {
      method: 'PUT',
      body: { key: 'ai_enabled', value: enabled.toString() }
    }),
    apiRequest('/api/admin/config', {
      method: 'PUT',
      body: { key: 'ai_api_url', value: apiUrl }
    }),
    apiRequest('/api/admin/config', {
      method: 'PUT',
      body: { key: 'ai_api_key', value: apiKey }
    }),
    apiRequest('/api/admin/config', {
      method: 'PUT',
      body: { key: 'ai_model', value: model }
    })
  ]);
  
  showToast('配置已保存');
}

async function changePassword() {
  const oldPassword = document.getElementById('old-password').value;
  const newPassword = document.getElementById('new-password').value;
  
  if (!oldPassword || !newPassword) {
    showToast('请填写完整信息');
    return;
  }
  
  if (newPassword.length < 6) {
    showToast('新密码至少6位');
    return;
  }
  
  const res = await apiRequest('/api/auth/change-password', {
    method: 'POST',
    body: { oldPassword, newPassword }
  });
  
  if (res.success) {
    showToast('密码修改成功');
    document.getElementById('old-password').value = '';
    document.getElementById('new-password').value = '';
  } else {
    showToast(res.message || '修改失败');
  }
}

// ============ 答案管理 ============

// 当前选中的问题和课堂
let currentClassroomId = null;
let currentQuestionId = null;
let currentQuestion = null;
let classroomsCache = [];

// 初始化答案管理
async function initAnswerManagement() {
  await loadClassrooms();
}

// 加载所有课堂
async function loadClassrooms() {
  const res = await apiRequest('/api/admin/classrooms');
  
  if (!res.success) {
    showToast('加载课堂列表失败');
    return;
  }
  
  classroomsCache = res.data || [];
  const select = document.getElementById('select-classroom');
  select.innerHTML = '<option value="">-- 请选择课堂 --</option>' + 
    classroomsCache.map(c => {
      const status = c.status === 'active' ? '（进行中）' : '（已结束）';
      return `<option value="${c.id}">${c.name} ${status} - ${c.teacher_name || '未分配'}</option>`;
    }).join('');
}

// 课堂选择变更
async function onClassroomChange() {
  const classroomId = document.getElementById('select-classroom').value;
  currentClassroomId = classroomId;
  currentQuestionId = null;
  currentQuestion = null;
  
  const questionSelect = document.getElementById('select-question');
  const questionInfo = document.getElementById('question-info');
  
  if (!classroomId) {
    questionSelect.innerHTML = '<option value="">-- 请先选择课堂 --</option>';
    questionSelect.disabled = true;
    questionInfo.classList.add('hidden');
    document.getElementById('answers-tbody').innerHTML = '<tr><td colspan="7" class="empty-state">请先选择课堂</td></tr>';
    return;
  }
  
  // 加载该课堂的问题
  const res = await apiRequest(`/api/admin/classrooms/${classroomId}/questions`);
  
  if (!res.success) {
    showToast('加载问题列表失败');
    return;
  }
  
  const questions = res.data || [];
  questionSelect.innerHTML = '<option value="">-- 请选择问题 --</option>' + 
    questions.map((q, i) => {
      const content = q.content.length > 50 ? q.content.substring(0, 50) + '...' : q.content;
      const typeName = q.question_type === 'audio' ? '🎤音标题' : '📝文字题';
      return `<option value="${q.id}">${typeName} ${content}</option>`;
    }).join('');
  questionSelect.disabled = false;
  questionInfo.classList.add('hidden');
  document.getElementById('answers-tbody').innerHTML = '<tr><td colspan="7" class="empty-state">请选择问题</td></tr>';
}

// 问题选择变更
async function onQuestionChange() {
  const questionId = document.getElementById('select-question').value;
  currentQuestionId = questionId;
  currentQuestion = null;
  
  const questionInfo = document.getElementById('question-info');
  
  if (!questionId) {
    questionInfo.classList.add('hidden');
    document.getElementById('answers-tbody').innerHTML = '<tr><td colspan="7" class="empty-state">请选择问题</td></tr>';
    return;
  }
  
  // 显示问题信息
  const questionSelect = document.getElementById('select-question');
  const selectedOption = questionSelect.options[questionSelect.selectedIndex];
  
  // 获取完整问题信息
  const res = await apiRequest(`/api/admin/questions/${questionId}/answers`);
  
  if (!res.success) {
    showToast('加载问题详情失败');
    return;
  }
  
  currentQuestion = res.data.question;
  
  // 显示问题信息
  document.getElementById('question-content').textContent = currentQuestion.content;
  document.getElementById('question-type').textContent = currentQuestion.question_type === 'audio' ? '🎤 音标题' : '📝 文字题';
  questionInfo.classList.remove('hidden');
  
  // 显示/隐藏评分输入框（仅音标题）
  const scoreInputGroup = document.getElementById('score-input-group');
  scoreInputGroup.style.display = currentQuestion.question_type === 'audio' ? 'block' : 'none';
  
  // 清空表单
  document.getElementById('single-answer-form').reset();
  
  // 加载回答列表
  await loadQuestionAnswers();
}

// 加载问题回答列表
async function loadQuestionAnswers() {
  if (!currentQuestionId) return;
  
  const sortBy = document.getElementById('sort-answers').value;
  const order = document.getElementById('sort-order').value;
  
  const res = await apiRequest(`/api/admin/questions/${currentQuestionId}/answers?sortBy=${sortBy}&order=${order}`);
  
  if (!res.success) {
    showToast('加载回答列表失败');
    return;
  }
  
  const { answers } = res.data;
  const tbody = document.getElementById('answers-tbody');
  
  if (!answers || answers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">暂无回答数据</td></tr>';
    return;
  }
  
  tbody.innerHTML = answers.map((a, i) => {
    const content = a.content.length > 30 ? a.content.substring(0, 30) + '...' : a.content;
    const comment = a.comment ? (a.comment.length > 20 ? a.comment.substring(0, 20) + '...' : a.comment) : '-';
    
    return `
      <tr>
        <td>${i + 1}</td>
        <td>${a.student_name || '-'}</td>
        <td>${a.student_number || '-'}</td>
        <td title="${a.content}">${content}</td>
        <td><span class="score-badge">${a.total_score || 0}分</span></td>
        <td title="${a.comment || ''}">${comment}</td>
        <td class="actions">
          <button class="btn btn-sm btn-secondary" onclick="showAnswerDetail(${a.id})">查看</button>
          <button class="btn btn-sm btn-danger" onclick="deleteAnswer(${a.id})">删除</button>
        </td>
      </tr>
    `;
  }).join('');
}

// 显示答案详情
async function showAnswerDetail(answerId) {
  // 从当前列表中查找
  const sortBy = document.getElementById('sort-answers').value;
  const order = document.getElementById('sort-order').value;
  
  const res = await apiRequest(`/api/admin/questions/${currentQuestionId}/answers?sortBy=${sortBy}&order=${order}`);
  
  if (!res.success) {
    showToast('加载详情失败');
    return;
  }
  
  const answer = res.data.answers.find(a => a.id === answerId);
  
  if (!answer) {
    showToast('未找到回答');
    return;
  }
  
  // 填充详情
  document.getElementById('detail-student-name').textContent = answer.student_name || '-';
  document.getElementById('detail-student-number').textContent = answer.student_number || '-';
  document.getElementById('detail-created-at').textContent = formatDate(answer.evaluated_at || answer.created_at);
  document.getElementById('detail-content').textContent = answer.content;
  document.getElementById('detail-comment').textContent = answer.comment || '暂无评语';
  
  // 渲染评价
  let evalHtml = '';
  if (answer.evaluation && answer.evaluation.dimensions) {
    const dims = answer.evaluation.dimensions;
    evalHtml = '<div class="dimension-scores">';
    for (const [key, value] of Object.entries(dims)) {
      const names = {
        perception: '音乐感知力',
        emotion: '情感理解力',
        culture: '文化认知',
        aesthetic: '审美判断',
        expression: '表达规范',
        pitch: '音准评分'
      };
      evalHtml += `<span class="dim-tag">${names[key] || key}: ${value}分</span>`;
    }
    evalHtml += `</div><p>总分：${answer.total_score || 0}分</p>`;
  } else {
    evalHtml = '<p>暂无评价数据</p>';
  }
  document.getElementById('detail-evaluation').innerHTML = evalHtml;
  
  // 显示弹窗
  document.getElementById('answer-detail-modal').classList.add('show');
}

function closeAnswerDetailModal() {
  document.getElementById('answer-detail-modal').classList.remove('show');
}

// 删除回答
async function deleteAnswer(answerId) {
  if (!confirm('确定要删除该回答吗？')) return;
  
  const res = await apiRequest(`/api/admin/answers/${answerId}`, {
    method: 'DELETE'
  });
  
  if (res.success) {
    showToast('删除成功');
    loadQuestionAnswers();
  } else {
    showToast(res.message || '删除失败');
  }
}

// 提交单条答案
async function submitSingleAnswer(event) {
  event.preventDefault();
  
  if (!currentQuestionId) {
    showToast('请先选择问题');
    return;
  }
  
  const studentName = document.getElementById('input-student-name').value;
  const studentNumber = document.getElementById('input-student-number').value;
  const content = document.getElementById('input-answer-content').value;
  const score = document.getElementById('input-score').value;
  
  const data = { studentName, studentNumber, content };
  if (score && currentQuestion.question_type === 'audio') {
    data.score = parseFloat(score);
  }
  
  const res = await apiRequest(`/api/admin/questions/${currentQuestionId}/answers/single`, {
    method: 'POST',
    body: data
  });
  
  if (res.success) {
    showToast('录入成功');
    // 清空表单
    document.getElementById('single-answer-form').reset();
    // 刷新列表
    await loadQuestionAnswers();
  } else {
    showToast(res.message || '录入失败');
  }
}

// 处理文件上传
async function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  if (!currentQuestionId) {
    showToast('请先选择问题');
    event.target.value = '';
    return;
  }
  
  const formData = new FormData();
  formData.append('file', file);
  
  // 显示状态
  const statusEl = document.getElementById('import-status');
  statusEl.innerHTML = '<div class="loading">正在解析文件...</div>';
  
  try {
    // 读取文件内容
    const text = await readFileAsText(file);
    const answers = parseCSVOrExcel(text);
    
    if (!answers || answers.length === 0) {
      statusEl.innerHTML = '<div class="error">未找到有效数据</div>';
      return;
    }
    
    // 显示预览
    const previewEl = document.getElementById('import-preview');
    let previewHtml = `<p>共 ${answers.length} 条数据：</p><ul>`;
    answers.slice(0, 5).forEach(a => {
      previewHtml += `<li>${a.studentName || ''} - ${a.studentNumber} - ${a.content.substring(0, 20)}...</li>`;
    });
    if (answers.length > 5) {
      previewHtml += `<li>...还有 ${answers.length - 5} 条</li>`;
    }
    previewHtml += '</ul><button class="btn btn-primary btn-sm" onclick="confirmImport()">确认导入</button>';
    previewEl.innerHTML = previewHtml;
    previewEl.classList.remove('hidden');
    
    // 保存数据供确认导入使用
    window.pendingImportData = answers;
    statusEl.innerHTML = '<div class="success">文件解析成功，请确认导入</div>';
    
  } catch (err) {
    statusEl.innerHTML = `<div class="error">解析失败：${err.message}</div>`;
  }
  
  // 清空文件输入
  event.target.value = '';
}

// 读取文件文本内容
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = e => reject(new Error('读取文件失败'));
    reader.readAsText(file);
  });
}

// 解析CSV或Excel文本
function parseCSVOrExcel(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) return [];
  
  // 解析表头
  const header = parseCSVLine(lines[0]);
  const headerIndex = {};
  header.forEach((h, i) => {
    const key = h.trim().toLowerCase();
    if (key.includes('姓名')) headerIndex.name = i;
    else if (key.includes('学号')) headerIndex.number = i;
    else if (key.includes('回答') || key.includes('内容')) headerIndex.content = i;
    else if (key.includes('评分') || key.includes('分数')) headerIndex.score = i;
  });
  
  if (headerIndex.number === undefined || headerIndex.content === undefined) {
    throw new Error('表头缺少必要字段（学号、回答内容）');
  }
  
  const answers = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length < 2) continue;
    
    const studentNumber = values[headerIndex.number]?.trim();
    const content = values[headerIndex.content]?.trim();
    
    if (!studentNumber || !content) continue;
    
    answers.push({
      studentName: headerIndex.name !== undefined ? values[headerIndex.name]?.trim() : '',
      studentNumber,
      content,
      score: headerIndex.score !== undefined ? parseFloat(values[headerIndex.score]) || undefined : undefined
    });
  }
  
  return answers;
}

// 解析CSV行（处理引号）
function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  
  return values;
}

// 确认导入
async function confirmImport() {
  if (!window.pendingImportData || window.pendingImportData.length === 0) {
    showToast('没有待导入的数据');
    return;
  }
  
  const statusEl = document.getElementById('import-status');
  statusEl.innerHTML = '<div class="loading">正在导入...</div>';
  
  const res = await apiRequest(`/api/admin/questions/${currentQuestionId}/answers/import`, {
    method: 'POST',
    body: { answers: window.pendingImportData }
  });
  
  if (res.success) {
    const data = res.data;
    let msg = `导入完成：成功 ${data.success} 条`;
    if (data.failed > 0) {
      msg += `，失败 ${data.failed} 条`;
    }
    showToast(msg);
    
    // 清空预览
    document.getElementById('import-preview').classList.add('hidden');
    document.getElementById('import-preview').innerHTML = '';
    window.pendingImportData = null;
    
    // 刷新列表
    await loadQuestionAnswers();
  } else {
    showToast(res.message || '导入失败');
  }
  
  statusEl.innerHTML = '';
}

// 导航添加answers处理
document.addEventListener('DOMContentLoaded', () => {
  // 原有初始化代码...
});

// 覆盖loadNavigation添加answers支持
const originalLoadNavigation = typeof loadNavigation === 'function' ? loadNavigation : null;
if (originalLoadNavigation) {
  // loadNavigation已在其他地方定义，只需在其后添加初始化
}

// 在页面加载后初始化答案管理
document.addEventListener('DOMContentLoaded', () => {
  // 等待DOMContentLoaded事件触发后再初始化
  setTimeout(() => {
    if (document.getElementById('select-classroom')) {
      initAnswerManagement();
    }
  }, 100);
});

// 修改导航切换逻辑以支持答案管理
const navItems = document.querySelectorAll ? document.querySelectorAll('.nav-item') : [];
document.addEventListener('DOMContentLoaded', () => {
  // 重新绑定导航点击事件
  const bindNavEvents = () => {
    document.querySelectorAll('.nav-item').forEach(item => {
      // 移除旧的事件监听（避免重复）
      item.removeEventListener('click', handleNavClick);
      item.addEventListener('click', handleNavClick);
    });
  };
  
  // 延迟执行确保DOM完全加载
  setTimeout(bindNavEvents, 200);
});

function handleNavClick(e) {
  e.preventDefault();
  const item = e.currentTarget;
  const section = item.dataset.section;
  
  if (!section) return;
  
  // 更新导航状态
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  item.classList.add('active');
  
  // 更新内容显示
  document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
  const targetSection = document.getElementById(`section-${section}`);
  if (targetSection) {
    targetSection.classList.add('active');
  }
  
  // 更新页面标题
  const titles = {
    dashboard: '数据总览',
    teachers: '教师管理',
    classes: '班级管理',
    students: '学生管理',
    answers: '答案管理',
    config: '系统配置'
  };
  document.querySelector('.page-header h1').textContent = titles[section] || section;
  
  // 刷新对应数据
  switch (section) {
    case 'dashboard':
      if (typeof loadDashboard === 'function') loadDashboard();
      break;
    case 'teachers':
      if (typeof loadTeachers === 'function') loadTeachers();
      break;
    case 'classes':
      if (typeof loadClasses === 'function') loadClasses();
      break;
    case 'students':
      if (typeof loadStudents === 'function') loadStudents();
      break;
    case 'answers':
      if (typeof initAnswerManagement === 'function') initAnswerManagement();
      break;
    case 'config':
      if (typeof loadConfig === 'function') loadConfig();
      break;
  }
}
