#!/bin/bash
# 同时启动Python音准分析服务和Node主服务

# 启动Python FastAPI服务（后台运行）
cd /app/audio-service
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 &
PYTHON_PID=$!
echo "Python音准分析服务已启动 (PID: $PYTHON_PID)"

# 启动Node主服务
cd /app
node server.js &
NODE_PID=$!
echo "Node主服务已启动 (PID: $NODE_PID)"

# 等待任意一个进程退出
wait -n $PYTHON_PID $NODE_PID

# 如果任一进程退出，杀死另一个
kill $PYTHON_PID $NODE_PID 2>/dev/null
exit 1
