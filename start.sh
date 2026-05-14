#!/bin/bash

# 启动Python音准分析服务（后台）
cd /app/audio-service
/opt/venv/bin/python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 &
echo "Python音准分析服务启动中..."

# 等待Python服务就绪
sleep 3

# 启动Node主服务（前台，保持容器存活）
cd /app
exec node server.js
