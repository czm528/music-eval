/**
 * Socket.io 客户端封装
 * 负责与服务器的实时通信
 */

// 创建Socket连接
let socket = null;
let currentRoom = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 10;
let pingInterval = null;

function initSocket(options = {}) {
  if (socket && socket.connected) {
    return socket;
  }
  
  // 使用相对路径连接到当前服务器
  const serverUrl = window.location.origin;
  
  socket = io(serverUrl, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: maxReconnectAttempts,
    timeout: 20000
  });
  
  // 连接成功
  socket.on('connect', () => {
    console.log('✅ Socket连接成功:', socket.id);
    reconnectAttempts = 0;
    
    // 如果之前加入了房间，重新加入
    if (currentRoom) {
      const roomData = currentRoom;
      currentRoom = null;
      joinClassroom(roomData);
    }
    
    // 调用回调
    if (options.onConnect) {
      options.onConnect();
    }
  });
  
  // 连接断开
  socket.on('disconnect', (reason) => {
    console.log('❌ Socket连接断开:', reason);
    
    // 停止心跳
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }
    
    if (options.onDisconnect) {
      options.onDisconnect(reason);
    }
    
    // 如果是非正常断开，尝试重连
    if (reason !== 'io client disconnect') {
      showToast('连接断开，正在重连...');
    }
  });
  
  // 连接错误
  socket.on('connect_error', (error) => {
    console.error('❌ Socket连接错误:', error.message);
    reconnectAttempts++;
    
    if (options.onError) {
      options.onError(error, reconnectAttempts);
    }
    
    if (reconnectAttempts >= maxReconnectAttempts) {
      showToast('连接失败，请刷新页面重试');
    }
  });
  
  // 重连尝试
  socket.on('reconnect_attempt', (attemptNumber) => {
    console.log(`正在尝试第 ${attemptNumber} 次重连...`);
  });
  
  // 重连成功
  socket.on('reconnect', (attemptNumber) => {
    console.log(`✅ 重连成功 (第 ${attemptNumber} 次尝试)`);
    showToast('已重新连接');
  });
  
  // 重连错误
  socket.on('reconnect_error', (error) => {
    console.error('重连错误:', error.message);
  });
  
  // ============ 课堂相关事件 ============
  
  // 用户加入课堂
  socket.on('user-joined', (data) => {
    console.log('👤 用户加入:', data);
    if (options.onUserJoined) {
      options.onUserJoined(data);
    }
  });
  
  // 用户离开课堂
  socket.on('user-left', (data) => {
    console.log('👤 用户离开:', data);
    if (options.onUserLeft) {
      options.onUserLeft(data);
    }
  });
  
  // ============ 问题相关事件 ============
  
  // 新问题发布
  socket.on('new-question', (data) => {
    console.log('❓ 新问题:', data);
    if (options.onNewQuestion) {
      options.onNewQuestion(data);
    }
  });
  
  // ============ 评价相关事件 ============
  
  // 评价结果
  socket.on('eval-result', (data) => {
    console.log('📊 评价结果:', data);
    if (options.onEvalResult) {
      options.onEvalResult(data);
    }
  });
  
  // ============ 统计相关事件 ============
  
  // 课堂统计更新
  socket.on('classroom-stats', (data) => {
    console.log('📈 课堂统计:', data);
    if (options.onClassroomStats) {
      options.onClassroomStats(data);
    }
  });
  
  // ============ 心跳相关 ============
  
  socket.on('pong', (data) => {
    // 心跳响应
    console.log('💓 心跳响应:', data.timestamp);
  });
  
  return socket;
}

// 加入课堂房间
function joinClassroom(data) {
  if (!socket || !socket.connected) {
    console.log('Socket未连接，保存房间信息等待重连');
    currentRoom = data;
    return;
  }
  
  const roomName = `classroom:${data.classroomId}`;
  socket.emit('join-classroom', {
    classroomId: data.classroomId,
    userId: data.userId,
    userName: data.userName,
    role: data.role
  });
  
  currentRoom = {
    classroomId: data.classroomId,
    userId: data.userId,
    userName: data.userName,
    role: data.role
  };
  
  console.log(`已加入课堂房间: ${roomName}`);
}

// 离开课堂房间
function leaveClassroom(data) {
  if (!socket || !socket.connected) return;
  
  socket.emit('leave-classroom', {
    classroomId: data.classroomId,
    userId: data.userId,
    userName: data.userName
  });
  
  currentRoom = null;
  console.log('已离开课堂房间');
}

// 开始心跳检测
function startPing() {
  if (pingInterval) {
    clearInterval(pingInterval);
  }
  
  pingInterval = setInterval(() => {
    if (socket && socket.connected) {
      socket.emit('ping');
    }
  }, 30000); // 每30秒发送一次心跳
}

// 获取当前Socket实例
function getSocket() {
  return socket;
}

// 检查是否已连接
function isConnected() {
  return socket && socket.connected;
}

// 断开连接
function disconnect() {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
  
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  
  currentRoom = null;
}
