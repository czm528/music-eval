/**
 * 教师页面逻辑 - 模块化改造版
 */

// 全局变量
let currentClassroom = null;
let classroomList = []; // { modules: [...], uncategorized: [...] }
let moduleList = []; // 用于创建任务时选择模块
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
// 展开状态
let expandedModules = new Set();

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

// 加载课堂列表（按模块分组）
async function loadClassrooms() {
  try {
    const res = await apiRequest('/api/teacher/classrooms');
    
    if (!res.success) {
      showToast('加载列表失败');
      return;
    }
    
    classroomList = res.data || { modules: [], uncategorized: [] };
    moduleList = classroomList.modules || [];
    renderClassroomList();
    
    // 更新创建任务弹窗中的模块选择
    updateModuleSelect();
  } catch (error) {
    console.error('加载列表错误:', error);
    showToast('网络错误');
  }
}

function renderClassroomList() {
  const container = document.getElementById('classroom-list');
  const modules = classroomList.modules || [];
  const uncategorized = classroomList.uncategorized || [];
  const quickCreate = document.getElementById('quick-create-task');
  
  let html = '';
  
  // 渲染模块
  if (modules.length === 0 && uncategorized.length === 0) {
    container.innerHTML = '<p class="empty-state">暂无模块和任务</p>';
    quickCreate.style.display = 'block';
    return;
  }
  
  quickCreate.style.display = modules.length === 0 ? 'block' : 'none';
  
  // 渲染模块
  modules.forEach(module => {
    const isExpanded = expandedModules.has(module.id);
    const taskCount = module.tasks ? module.tasks.length : 0;
    
    html += `
      <div class="module-item" data-module-id="${module.id}">
        <div class="module-header" onclick="toggleModule(${module.id})">
          <span class="module-arrow ${isExpanded ? 'expanded' : ''}">▶</span>
          <span class="module-icon">📂</span>
          <span class="module-name">${escapeHtml(module.name)}</span>
          <span class="module-count">(${taskCount})</span>
          <div class="module-actions" onclick="event.stopPropagation()">
            <button class="btn-icon" onclick="showCreateTask(${module.id})" title="添加任务">➕</button>
            <button class="btn-icon" onclick="showEditModule(${module.id}, '${escapeHtml(module.name)}', '${escapeHtml(module.description || '')}')" title="编辑">✏️</button>
            <button class="btn-icon btn-danger-icon" onclick="deleteModule(${module.id})" title="删除">🗑️</button>
          </div>
        </div>
        <div class="module-tasks ${isExpanded ? 'expanded' : ''}">
    `;
    
    // 渲染模块下的任务
    if (module.tasks && module.tasks.length > 0) {
      module.tasks.forEach(task => {
        const isActive = currentClassroom && currentClassroom.id === task.id;
        html += `
          <div class="task-item ${isActive ? 'active' : ''}" onclick="selectClassroom(${task.id})">
            <span class="task-name">${escapeHtml(task.name)}</span>
            <div class="task-meta">
              <span>👥 ${task.student_count || 0}</span>
              <span class="status ${task.status}">${task.status === 'active' ? '进行中' : '已结束'}</span>
              <button class="btn-icon" onclick="event.stopPropagation();showMoveTask(${task.id},'${escapeHtml(task.name)}')" title="移动到模块">📦</button>
            </div>
          </div>
        `;
      });
    } else {
      html += `<div class="task-empty">暂无任务，点击➕添加</div>`;
    }
    
    html += `</div></div>`;
  });
  
  // 渲染未归类任务
  if (uncategorized.length > 0) {
    html += `
      <div class="module-item uncategorized">
        <div class="module-header" onclick="toggleModule('uncategorized')">
          <span class="module-arrow ${expandedModules.has('uncategorized') ? 'expanded' : ''}">▶</span>
          <span class="module-icon">📋</span>
          <span class="module-name">未归类任务</span>
          <span class="module-count">(${uncategorized.length})</span>
        </div>
        <div class="module-tasks ${expandedModules.has('uncategorized') ? 'expanded' : ''}">
    `;
    
    uncategorized.forEach(task => {
      const isActive = currentClassroom && currentClassroom.id === task.id;
      html += `
        <div class="task-item ${isActive ? 'active' : ''}" onclick="selectClassroom(${task.id})">
          <span class="task-name">${escapeHtml(task.name)}</span>
          <div class="task-meta">
            <span>👥 ${task.student_count || 0}</span>
            <span class="status ${task.status}">${task.status === 'active' ? '进行中' : '已结束'}</span>
            <button class="btn-icon" onclick="event.stopPropagation();showMoveTask(${task.id},'${escapeHtml(task.name)}')" title="移动到模块">📦</button>
          </div>
        </div>
      `;
    });
    
    html += `</div></div>`;
  }
  
  container.innerHTML = html;
}

// 切换模块展开/折叠
function toggleModule(moduleId) {
  if (expandedModules.has(moduleId)) {
    expandedModules.delete(moduleId);
  } else {
    expandedModules.add(moduleId);
  }
  renderClassroomList();
}

// 显示创建模块弹窗
function showCreateModule() {
  document.getElementById('create-module-modal').classList.add('show');
  document.getElementById('module-name-input').value = '';
  document.getElementById('module-desc-input').value = '';
}

// 关闭创建模块弹窗
function closeCreateModuleModal() {
  document.getElementById('create-module-modal').classList.remove('show');
}

// 创建模块
async function createModule() {
  const name = document.getElementById('module-name-input').value.trim();
  const description = document.getElementById('module-desc-input').value.trim();
  
  if (!name) {
    showToast('请输入模块名称');
    return;
  }
  
  const btn = document.querySelector('#create-module-modal .btn-primary');
  btn.disabled = true;
  btn.textContent = '创建中...';
  
  try {
    const res = await apiRequest('/api/teacher/modules', {
      method: 'POST',
      body: { name, description }
    });
    
    btn.disabled = false;
    btn.textContent = '创建';
    
    if (res.success) {
      showToast('模块创建成功');
      closeCreateModuleModal();
      await loadClassrooms();
      // 展开新创建的模块
      if (res.data.id) {
        expandedModules.add(res.data.id);
        renderClassroomList();
      }
    } else {
      showToast(res.message || '创建失败');
    }
  } catch (error) {
    console.error('创建模块错误:', error);
    btn.disabled = false;
    btn.textContent = '创建';
    showToast('网络错误');
  }
}

// 显示编辑模块弹窗
function showEditModule(moduleId, name, description) {
  document.getElementById('edit-module-id').value = moduleId;
  document.getElementById('edit-module-name-input').value = name;
  document.getElementById('edit-module-desc-input').value = description;
  document.getElementById('edit-module-modal').classList.add('show');
}

// 关闭编辑模块弹窗
function closeEditModuleModal() {
  document.getElementById('edit-module-modal').classList.remove('show');
}

// 更新模块
async function updateModule() {
  const moduleId = document.getElementById('edit-module-id').value;
  const name = document.getElementById('edit-module-name-input').value.trim();
  const description = document.getElementById('edit-module-desc-input').value.trim();
  
  if (!name) {
    showToast('请输入模块名称');
    return;
  }
  
  const btn = document.querySelector('#edit-module-modal .btn-primary');
  btn.disabled = true;
  btn.textContent = '保存中...';
  
  try {
    const res = await apiRequest(`/api/teacher/modules/${moduleId}`, {
      method: 'PUT',
      body: { name, description }
    });
    
    btn.disabled = false;
    btn.textContent = '保存';
    
    if (res.success) {
      showToast('模块更新成功');
      closeEditModuleModal();
      await loadClassrooms();
    } else {
      showToast(res.message || '更新失败');
    }
  } catch (error) {
    console.error('更新模块错误:', error);
    btn.disabled = false;
    btn.textContent = '保存';
    showToast('网络错误');
  }
}

// 删除模块
async function deleteModule(moduleId) {
  if (!confirm('确定要删除这个模块吗？模块下的任务不会被删除，只会变为未归类状态。')) {
    return;
  }
  
  try {
    const res = await apiRequest(`/api/teacher/modules/${moduleId}`, {
      method: 'DELETE'
    });
    
    if (res.success) {
      showToast('模块删除成功');
      expandedModules.delete(moduleId);
      await loadClassrooms();
    } else {
      showToast(res.message || '删除失败');
    }
  } catch (error) {
    console.error('删除模块错误:', error);
    showToast('网络错误');
  }
}

// ============ 移动任务到模块 ============
let movingTaskId = null;

function showMoveTask(taskId, taskName) {
  movingTaskId = taskId;
  document.getElementById('move-task-name').textContent = taskName;
  
  // 填充模块选项
  const select = document.getElementById('move-module-select');
  const modules = classroomList.modules || [];
  select.innerHTML = '<option value="">未归类</option>';
  modules.forEach(m => {
    select.innerHTML += `<option value="${m.id}">${escapeHtml(m.name)}</option>`;
  });
  
  document.getElementById('move-task-modal').classList.add('show');
}

function closeMoveTaskModal() {
  document.getElementById('move-task-modal').classList.remove('show');
  movingTaskId = null;
}

async function confirmMoveTask() {
  if (!movingTaskId) return;
  
  const moduleId = document.getElementById('move-module-select').value;
  
  try {
    const res = await apiRequest(`/api/teacher/classrooms/${movingTaskId}/module`, {
      method: 'PATCH',
      body: { moduleId: moduleId || null }
    });
    
    if (res.success) {
      showToast('移动成功');
      closeMoveTaskModal();
      await loadClassrooms();
    } else {
      showToast(res.message || '移动失败');
    }
  } catch (error) {
    console.error('移动任务错误:', error);
    showToast('移动失败');
  }
}

// 显示创建任务弹窗（指定模块）
function showCreateTask(moduleId) {
  document.getElementById('task-module-select').value = moduleId;
  showCreateTaskModal();
}

// 显示无模块的创建任务弹窗
function showCreateTaskNoModule() {
  document.getElementById('task-module-select').value = '';
  showCreateTaskModal();
}

// 显示创建任务弹窗（通用）
function showCreateTaskModal() {
  // 确保模块选择是最新的
  updateModuleSelect();
  document.getElementById('create-modal').classList.add('show');
  document.getElementById('classroom-name-input').value = '';
  document.getElementById('classroom-desc-input').value = '';
}

// 更新模块选择下拉框
function updateModuleSelect() {
  const select = document.getElementById('task-module-select');
  let html = '<option value="">无模块（独立任务）</option>';
  
  moduleList.forEach(m => {
    html += `<option value="${m.id}">${escapeHtml(m.name)}</option>`;
  });
  
  select.innerHTML = html;
}

// HTML转义
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
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
  
  // 旋律线题也需要音频
  if (selectedQuestionType === 'melody' && !selectedAudioFile) {
    showToast('旋律线题需要上传参考旋律音频');
    return;
  }
  
  // 配色题需要歌词分段
  if (selectedQuestionType === 'color') {
    const colorSegments = document.getElementById('color-segments-input').value.trim();
    if (!colorSegments) {
      showToast('配色题需要输入歌词分段');
      return;
    }
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
      formData.append('reference_audio', selectedAudioFile);
    }
    
    // 添加旋律线题配置
    if (selectedQuestionType === 'melody') {
      const lyricsSegments = document.getElementById('lyrics-segments-input').value.trim();
      if (lyricsSegments) {
        formData.append('lyricsSegments', lyricsSegments);
      }
    }
    
    // 添加配色题配置
    if (selectedQuestionType === 'color') {
      const lyricsSegments = document.getElementById('color-segments-input').value.trim();
      const refConfig = getColorConfig();
      formData.append('lyricsSegments', lyricsSegments);
      if (refConfig) {
        formData.append('refConfig', refConfig);
      }
    }
    
    const token = getToken();
    publishBtn.textContent = '发布中...';
    
    const res = await fetch('/api/teacher/questions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      credentials: 'include',
      body: formData
    });
    
    const data = await res.json();
    
    publishBtn.disabled = false;
    publishBtn.textContent = '发布问题';
    
    if (data.success) {
      showToast('问题已发布');
      document.getElementById('question-content').value = '';
      removeAudio();
      // 清空旋律线配置
      document.getElementById('lyrics-segments-input').value = '';
      // 清空配色配置
      document.getElementById('color-segments-input').value = '';
      // 重置复选框为全选
      document.querySelectorAll('input[name="dimensions"]').forEach(cb => cb.checked = true);
      // 重置题目类型
      switchQuestionType('text');
      
      // 延迟刷新课堂数据，确保数据库已写入
      setTimeout(() => {
        isLoadingClassroom = false; // 重置锁，确保能刷新
        selectClassroom(currentClassroom.id);
      }, 500);
    } else {
      showToast(data.message || '发布失败');
    }
  } catch (error) {
    console.error('发布问题错误:', error);
    publishBtn.disabled = false;
    publishBtn.textContent = '发布问题';
    showToast('网络错误');
  }
}

// 切换题目类型
function switchQuestionType(type) {
  selectedQuestionType = type;
  const audioGroup = document.getElementById('audio-upload-group');
  const melodyGroup = document.getElementById('melody-config-group');
  const colorGroup = document.getElementById('color-config-group');
  const textArea = document.getElementById('question-content');
  
  // 隐藏所有特殊配置区域
  audioGroup.style.display = 'none';
  melodyGroup.style.display = 'none';
  colorGroup.style.display = 'none';
  
  if (type === 'audio') {
    audioGroup.style.display = '';
    textArea.placeholder = '请描述演唱要求（如：请演唱《欢乐颂》主题旋律）';
  } else if (type === 'melody') {
    // 旋律线题也需要上传音频
    audioGroup.style.display = '';
    melodyGroup.style.display = '';
    textArea.placeholder = '请描述绘画要求（如：请画出这段音乐的旋律走向）';
  } else if (type === 'color') {
    colorGroup.style.display = '';
    textArea.placeholder = '请描述配色要求（如：请为每句歌词选择合适的情绪颜色）';
    // 初始化配色配置区域
    initColorConfig();
  } else {
    textArea.placeholder = '请输入音乐鉴赏问题，例如：\n请描述这段音乐的速度、力度和情感特点';
  }
}

// 初始化配色题配置区域
function initColorConfig() {
  const segmentsInput = document.getElementById('color-segments-input');
  const configContainer = document.getElementById('color-ref-config');
  
  // 监听歌词分段输入变化
  segmentsInput.oninput = function() {
    updateColorConfigUI();
  };
  
  // 初始渲染
  updateColorConfigUI();
}

// 更新配色配置UI
function updateColorConfigUI() {
  const segmentsText = document.getElementById('color-segments-input').value;
  const configContainer = document.getElementById('color-ref-config');
  
  if (!segmentsText.trim()) {
    configContainer.innerHTML = '<p style="font-size:12px;color:#888;">请先输入歌词分段</p>';
    return;
  }
  
  const segments = segmentsText.split('|').map(s => s.trim()).filter(s => s);
  const header = '<p style="font-size:12px;color:#888;margin-bottom:8px;">为每段歌词选择参考情绪颜色：</p>';
  
  let html = header;
  segments.forEach((seg, i) => {
    html += `
      <div style="margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
        <span style="min-width: 80px; font-size: 13px;">${escapeHtml(seg)}</span>
        <select id="color-ref-${i}" style="flex: 1; padding: 4px 8px; border: 1px solid #e2e8f0; border-radius: 4px;">
          <option value="">不设置参考</option>
          <option value="red">🔴 激昂</option>
          <option value="orange">🟠 温暖</option>
          <option value="yellow">🟡 欢快</option>
          <option value="green">🟢 宁静</option>
          <option value="blue">🔵 忧伤</option>
          <option value="purple">🟣 神秘</option>
          <option value="white">⚪ 空灵</option>
          <option value="brown">🟤 沉稳</option>
        </select>
      </div>
    `;
  });
  
  configContainer.innerHTML = html;
}

// 获取配色题配置
function getColorConfig() {
  const segmentsText = document.getElementById('color-segments-input').value;
  if (!segmentsText.trim()) return null;
  
  const segments = segmentsText.split('|').map(s => s.trim()).filter(s => s);
  const config = [];
  
  segments.forEach((seg, i) => {
    const refColor = document.getElementById(`color-ref-${i}`)?.value || null;
    config.push({
      label: seg,
      refColor: refColor
    });
  });
  
  return config.length > 0 ? JSON.stringify(config) : null;
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

// 显示创建课堂弹窗（兼容旧调用）
function showCreateClassroom() {
  showCreateTaskNoModule();
}

// 关闭创建弹窗
function closeCreateModal() {
  document.getElementById('create-modal').classList.remove('show');
}

// 创建课堂/任务
async function createClassroom() {
  const name = document.getElementById('classroom-name-input').value.trim();
  const description = document.getElementById('classroom-desc-input').value.trim();
  const moduleId = document.getElementById('task-module-select').value;
  
  if (!name) {
    showToast('请输入任务名称');
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
        description: description,
        moduleId: moduleId || null
      }
    });
    
    createBtn.disabled = false;
    createBtn.textContent = '创建';
    
    if (res.success) {
      showToast('任务创建成功');
      closeCreateModal();
      
      // 刷新列表
      await loadClassrooms();
      
      // 如果返回了二维码，直接打开二维码弹窗
      if (res.data.qrCode) {
        qrCodeData = {
          qrCode: res.data.qrCode,
          joinUrl: res.data.joinUrl
        };
        showQRCode();
      }
      
      // 选择新创建的任务
      if (res.data.id) {
        // 确保对应模块展开
        if (moduleId) {
          expandedModules.add(parseInt(moduleId));
        }
        selectClassroom(res.data.id);
      }
    } else {
      showToast(res.message || '创建失败');
    }
  } catch (error) {
    console.error('创建任务错误:', error);
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
