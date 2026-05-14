#!/bin/bash

echo "===== 启动音乐鉴赏评价系统 ====="

# 检查Python虚拟环境
if [ -f /opt/venv/bin/python3 ]; then
    echo "Python虚拟环境: OK"
    /opt/venv/bin/python3 --version
else
    echo "警告: Python虚拟环境不存在，音准分析功能不可用"
fi

# 启动Python音准分析服务（后台）
if [ -f /opt/venv/bin/uvicorn ]; then
    cd /app/audio-service
    /opt/venv/bin/python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 &
    echo "Python音准分析服务已启动"
    sleep 2
else
    echo "警告: uvicorn未安装，跳过音准分析服务"
fi

# 启动Node主服务（前台运行，保持容器存活）
cd /app
echo "启动Node主服务..."
exec node server.js
