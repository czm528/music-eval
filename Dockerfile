FROM node:18-slim

# 安装编译工具 + ffmpeg
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ ffmpeg && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
RUN mkdir -p db data uploads/audio tmp
EXPOSE 3000
ENV HOST=0.0.0.0
ENV PORT=3000
CMD ["node", "server.js"]
