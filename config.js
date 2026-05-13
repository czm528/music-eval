/**
 * 配置文件
 */
module.exports = {
  // 服务器配置
  server: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || '0.0.0.0'  // Render云部署需要监听所有网络接口
  },
  
  // 数据库配置
  database: {
    path: './db/music-eval.db'
  },
  
  // 默认管理员账号（首次登录后强制修改密码）
  defaultAdmin: {
    username: 'admin',
    password: 'admin123'
  },
  
  // AI API配置（支持OpenAI兼容接口）
  ai: {
    // 是否启用AI评价（false则使用纯关键词评分）
    enabled: process.env.AI_ENABLED === 'true',
    // API地址（OpenAI兼容）
    apiUrl: process.env.AI_API_URL || 'https://api.openai.com/v1/chat/completions',
    // API Key
    apiKey: process.env.AI_API_KEY || '',
    // 模型名称
    model: process.env.AI_MODEL || 'gpt-3.5-turbo',
    // 请求超时时间（毫秒）
    timeout: 30000
  },
  
  // 前端配置
  frontend: {
    // 基础URL（用于生成二维码）
    baseUrl: process.env.BASE_URL || 'http://localhost:3000' // 部署到云服务时必须设置 BASE_URL 环境变量为你的域名，如 https://musicclass.zeabur.app
  }
};
