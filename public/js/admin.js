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
