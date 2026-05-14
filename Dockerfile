FROM node:18-slim

# 安装系统依赖：better-sqlite3编译 + Python音频分析
RUN apt-get update && apt-get install -y \
    python3 python3-pip python3-venv \
    build-essential make g++ \
    libsndfile1 ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# 创建Python虚拟环境并安装依赖
RUN python3 -m venv /opt/venv

WORKDIR /app

# 先安装Python依赖（利用Docker缓存）
COPY audio-service/requirements.txt /tmp/audio-requirements.txt
RUN /opt/venv/bin/pip install --no-cache-dir -r /tmp/audio-requirements.txt && rm /tmp/audio-requirements.txt

# 安装Node依赖
COPY package*.json ./
RUN npm install --production

# 复制所有代码
COPY . .

# 创建必要目录
RUN mkdir -p db data uploads/audio

# 启动脚本
RUN chmod +x /app/start.sh

EXPOSE 3000
ENV HOST=0.0.0.0
ENV PORT=3000
ENV AUDIO_SERVICE_URL=http://127.0.0.1:8000/analyze

CMD ["/bin/bash", "/app/start.sh"]
