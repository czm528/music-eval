FROM node:18-alpine

# 安装 better-sqlite3 编译工具
RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
RUN mkdir -p db data uploads/audio
EXPOSE 3000
ENV HOST=0.0.0.0
ENV PORT=3000
CMD ["node", "server.js"]
