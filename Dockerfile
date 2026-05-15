FROM node:18-alpine

# 添加community仓库 + 安装编译工具和ffmpeg
RUN echo "http://dl-cdn.alpinelinux.org/alpine/edge/community" >> /etc/apk/repositories && \
    apk add --no-cache python3 make g++ ffmpeg

WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
RUN mkdir -p db data uploads/audio tmp
EXPOSE 3000
ENV HOST=0.0.0.0
ENV PORT=3000
CMD ["node", "server.js"]
