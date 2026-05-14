# 音乐鉴赏评价系统 - 项目交接文档

> 文档版本：1.0  
> 更新日期：2024-05-14  
> 交接人：czm528  
> 接手人：（待填写）

---

## A. 项目概述

### 项目名称
音乐鉴赏课学生评价系统

### 项目用途
基于 Web 的课堂即时问答与 AI 智能评分系统，专为音乐鉴赏课程设计。支持教师发布问题、学生实时回答、关键词/AI 评分、实时数据看板。

### 技术栈
| 层级 | 技术 |
|------|------|
| 后端 | Node.js + Express |
| 数据库 | SQLite (better-sqlite3) |
| 实时通信 | Socket.IO |
| 前端 | 原生 HTML + CSS + JavaScript（响应式） |
| 图表 | Chart.js + ECharts（词云） |
| 认证 | bcryptjs + express-session |

### 线上地址
- **生产环境**：https://musicclasseval.zeabur.app
- **GitHub 仓库**：https://github.com/czm528/music-eval
- **部署平台**：Zeabur

### 默认账号
| 角色 | 用户名 | 密码 |
|------|--------|------|
| 管理员 | admin | admin123 |
| 教师 | teacher01 | teacher123 |

> ⚠️ 首次登录后请修改管理员密码

---

## B. 项目架构

### 目录结构
```
music-eval/
├── server.js              # Express 主服务入口
├── config.js              # 配置文件（数据库、AI、环境变量）
├── package.json           # 项目依赖配置
├── seed-local.js          # 本地模拟数据填充脚本
│
├── db/
│   ├── init.js            # 数据库初始化（建表、迁移）
│   ├── music-eval.db      # SQLite 数据库文件（运行时生成）
│   └── music-keywords.js  # 音乐素养关键词库 + 关键词评分逻辑
│
├── routes/
│   ├── auth.js            # 认证路由（登录、学生扫码加入）
│   ├── admin.js           # 管理员路由（用户管理、班级管理）
│   ├── teacher.js         # 教师路由（课堂管理、问题发布、数据看板、词云）
│   └── student.js         # 学生路由（查看问题、提交回答）
│
├── services/
│   ├── ai-eval.js         # AI 评价服务（调用 OpenAI 兼容 API）
│   └── keyword-eval.js    # 关键词评价服务（兜底方案）
│
└── public/
    ├── index.html         # 登录页
    ├── admin.html         # 管理员页面
    ├── teacher.html       # 教师端页面
    ├── classroom.html     # 学生加入课堂页
    ├── answer.html        # 学生回答页面
    ├── student.html       # 学生个人中心
    ├── css/
    │   └── style.css      # 全局样式
    └── js/
        ├── app.js         # 公共工具函数
        ├── auth.js        # 认证相关
        ├── admin.js       # 管理员端逻辑
        ├── teacher.js     # 教师端逻辑（重点：数据看板、词云渲染）
        ├── classroom.js   # 课堂互动逻辑
        └── socket.js      # Socket.IO 客户端封装
```

### 数据库表结构

| 表名 | 说明 | 关键字段 |
|------|------|----------|
| `admins` | 管理员表 | id, username, password, nickname |
| `teachers` | 教师表 | id, username, password, nickname, email, phone |
| `classes` | 班级表 | id, name, grade, teacher_id |
| `students` | 学生表 | id, student_number, name, class_id |
| `classrooms` | 课堂表 | id, session_id, name, teacher_id, class_id, status |
| `classroom_students` | 课堂-学生关联 | classroom_id, student_id |
| `questions` | 问题表 | id, classroom_id, content, dimensions |
| `answers` | 回答表 | id, question_id, student_id, content, evaluation, dimensions, total_score, comment |
| `competency_records` | 学生素养记录 | student_id, dimension, total_score, avg_score |
| `keyword_library` | 关键词库 | dimension, keyword, weight |

---

## C. 核心功能说明

### 教师端
1. **创建课堂**：生成 session_id 和二维码，学生扫码加入
2. **发布问题**：选择评分维度（音乐感知力、情感理解力、文化认知、审美判断、表达规范），广播给所有学生
3. **实时监控**：通过 Socket.IO 实时查看学生加入和回答情况
4. **数据看板**：
   - 学生成绩柱状图（100分制，参考线：优秀90/良好80/中等70/及格60）
   - 维度雷达图
   - 得分分布图
   - 学习效果词云（优势词+不足词）
   - 学生素养概览列表

### 学生端
1. **扫码加入**：扫描教师端生成的二维码加入课堂
2. **查看问题**：实时接收教师发布的问题
3. **提交回答**：提交后自动获得评分和评语
4. **查看评价**：查看自己的得分和各维度得分

### 管理员端
1. **用户管理**：增删改查教师账号
2. **班级管理**：创建和管理班级
3. **学生管理**：在班级中添加学生

### 评价系统
1. **关键词评分**（默认）：
   - 匹配学生回答中的音乐专业关键词
   - 根据关键词数量和权重计算各维度得分
   - 支持表达长度加分和结构完整加分

2. **AI 评分**（可选）：
   - 启用需设置 `AI_ENABLED=true` 和 `AI_API_KEY`
   - 调用 OpenAI 兼容 API 进行评价
   - 支持配置代理：`HTTPS_PROXY`

---

## D. 数据看板功能（近期重点修改区域）

### 1. 学生成绩竖向柱状图

**前端文件**：`public/js/teacher.js` 的 `renderStudentScoresChart` 函数

**实现逻辑**：
- 使用 Chart.js 渲染竖向柱状图
- 按课堂总评得分降序排列学生
- X 轴显示学生姓名（只取姓+名第一个字，避免重叠）
- Y 轴范围 0-100 分

**参考线配置**（afterDraw 插件）：
| 分值 | 标签 | 颜色 | 线型 |
|------|------|------|------|
| 90 | 优秀(90) | 黄色 #eab308 | 实线 |
| 80 | 良好(80) | 深黄 #a16207 | 实线 |
| 70 | 中等(70) | 浅绿 #84cc16 | 实线 |
| 60 | 及格(60) | 红色 #ef4444 | 虚线 |

**柱顶标注**：afterDatasetsDraw 插件在每个柱顶显示具体分数

**数据来源**：`/api/teacher/classrooms/:id/stats` 返回的 `studentTotalScores` 数组

---

### 2. 分数计算逻辑（100分制）

**后端文件**：`routes/teacher.js` 的统计接口

**计算公式**：
```
每题满分 = 维度数 × 10
得分率 = 实际维度得分之和 ÷ 每题满分
课堂总评 = Σ(每题得分率 × 题目权重)
题目权重 = 100 ÷ 题目总数
```

**归一化处理**：
- 问题平均分做了百分制转换：`normalized_avg_score = avg_score / maxScore * 100`
- 存储时保留一位小数：`Math.round((avg_score / maxScore) * 100 * 10) / 10`

**示例**：
- 某题选择3个维度，满分 = 30分
- 学生A得分 = 24分，得分率 = 24/30 = 0.8
- 题目权重 = 100/4题 = 25
- 该题贡献 = 0.8 × 25 = 20分

---

### 3. 学习效果词云（双词云）

**后端接口**：`GET /api/teacher/questions/:id/wordcloud`

**数据来源**：从每条回答的 `evaluation.dimensionDetails` 提取

**关键词分类规则**：
| 维度得分 | 分类 | 关键词来源 |
|----------|------|------------|
| ≥ 6 分 | 优势(strengths) | 维度名称 + 随机选 1-3 个优势评价词 |
| < 4 分 | 不足(weaknesses) | 维度名称 + 随机选 1-3 个不足评价词 |
| 4-6 分 | 中性 | 不计入词云 |

**维度评价词映射**（`DIM_EVAL_TERMS`）：
```javascript
const DIM_EVAL_TERMS = {
  perception: {
    name: '音乐感知力',
    strengthTerms: ['节奏感知准确', '旋律辨识清晰', '音色辨别敏锐', ...],
    weaknessTerms: ['节奏感知不足', '旋律辨识模糊', '音色辨别弱', ...]
  },
  emotion: {
    name: '情感理解力',
    strengthTerms: ['情感表达准确', '意境理解深入', ...],
    weaknessTerms: ['情感表达欠缺', '意境理解肤浅', ...]
  },
  // ... 其他维度
};
```

**返回格式**：
```javascript
{
  success: true,
  data: {
    strengths: [{name: '音乐感知力', value: 35}, {name: '节奏感知准确', value: 12}, ...],
    weaknesses: [{name: '情感理解力', value: 28}, {name: '意境理解肤浅', value: 15}, ...],
    dimensionOverview: [
      {key: 'perception', name: '音乐感知力', average: 7.2, status: 'strength'},
      {key: 'emotion', name: '情感理解力', average: 3.5, status: 'weakness'},
      ...
    ]
  }
}
```

**前端渲染**：
- 使用 ECharts 词云
- 优势词：绿色系 (#22c55e)
- 不足词：橙红色系 (#f59e0b)
- 底部显示维度概览条（绿色/红色/灰色表示状态）

**⚠️ 重要说明**：当前词云展示的是 **AI评价维度词**（如"音乐感知力""情感表达欠缺"），而非学生回答内容的关键词。

---

### 4. 评价分析

**雷达图**（维度分析）：
- 展示 5 个维度的平均得分
- 数据来自 `/api/teacher/classrooms/:id/stats` 的 `dimensionAvgs`

**得分分布图**：
- 展示各题得分分布
- 数据来自问题统计

---

### 5. 学生人数统计

**修改记录**：改为从 `answers` 表关联查询，不依赖 `classroom_students` 表

```sql
SELECT COUNT(DISTINCT a.student_id) as count 
FROM answers a 
JOIN questions q ON a.question_id = q.id 
WHERE q.classroom_id = ?
```

---

## E. 已知问题与待修复项

### 1. 词云显示问题（重要）✅ 已修复

**问题描述**：线上版本词云可能没有正确显示 AI 评价维度词

**根本原因**：
1. `routes/teacher.js` 中 `JSON.parse(evaluation.evaluation || answer.evaluation)` 有变量名冲突 bug
2. 关键词评分参数太严，导致维度得分普遍低于 6 分（几乎无"优势"）

**已修复内容**：
1. ✅ 修复变量名冲突：`JSON.parse(answer.evaluation)` 直接读取 answer 表的 evaluation 字段
2. ✅ 调整评分参数：`baseScore` 从 0.5 提高到 0.8（`db/music-keywords.js`）

**⚠️ 注意事项**：
- 评分参数变更后，需要清理旧模拟课堂数据才能重新生成
- `server.js` 启动时会自动清理名为"贝多芬音乐鉴赏专题"的模拟课堂
- 需确保 `SEED_MOCK_DATA=true` 环境变量设置

---

### 2. Zeabur 部署问题

**问题**：多次出现构建卡住的情况

**解决方案**：
- 如构建卡住，手动取消并重新部署
- 检查 GitHub 仓库是否有最新代码
- 查看 Zeabur 部署日志定位问题

---

### 3. 分数可能仍偏低

**原因**：模拟回答本身质量不够（poor 级别回答太短）

**实际场景**：真实课堂中学生回答通常更长、更丰富，得分可能更高

**建议**：
- 如需更高分数，可调整 `seed-local.js` 中的 ANSWER_TEMPLATES
- 或调整 `scoringConfig.lengthBonus` 参数

---

### 4. seed-local.js 会创建重复课堂

**已处理**：添加了检测逻辑，启动时清理旧模拟课堂

**逻辑位置**：`server.js` 第 22-47 行

```javascript
// 删除所有"贝多芬音乐鉴赏专题"课堂
const mockClassrooms = db.prepare("SELECT id FROM classrooms WHERE name = '贝多芬音乐鉴赏专题'").all();
```

---

## F. 部署说明

### 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `PORT` | 服务端口 | 3000 |
| `HOST` | 服务地址（云部署设为 0.0.0.0） | 0.0.0.0 |
| `BASE_URL` | 前端基础URL（用于生成二维码） | http://localhost:3000 |
| `AI_ENABLED` | 是否启用AI评价 | false |
| `AI_API_URL` | AI API 地址 | https://api.openai.com/v1/chat/completions |
| `AI_API_KEY` | AI API 密钥 | - |
| `AI_MODEL` | AI 模型名称 | gpt-3.5-turbo |
| `SEED_MOCK_DATA` | 启动时自动灌入模拟数据 | false |
| `HTTPS_PROXY` | 代理地址（可选） | - |

### Zeabur 部署流程
1. 将代码 push 到 GitHub 仓库
2. 在 Zeabur 创建新服务，连接 GitHub 仓库
3. Zeabur 自动构建并部署
4. 设置环境变量（`BASE_URL` 必须设置为你的 Zeabur 域名）

### 数据库
- SQLite 数据库文件：`./db/music-eval.db`
- Zeabur 部署后数据会持久化（Zeabur 提供持久化存储）

---

## G. 开发指南

### 本地运行
```bash
# 克隆仓库
git clone https://github.com/czm528/music-eval.git
cd music-eval

# 安装依赖
npm install

# 启动服务（默认不加载模拟数据）
npm start

# 启动服务（加载模拟数据）
SEED_MOCK_DATA=true npm start
```

### 开发调试
- 修改前端代码后直接刷新浏览器
- 修改后端代码需要重启服务
- 查看控制台日志定位问题

### 模拟数据
- 50 个学生，4 个问题，4 个难度级别
- 课堂名称："贝多芬音乐鉴赏专题"
- 问题内容围绕贝多芬《命运交响曲》《月光奏鸣曲》《欢乐颂》

### 代码规范
- 使用 ES6 语法
- 数据库操作使用 `better-sqlite3` 同步 API
- API 返回格式统一：`{ success: true/false, message?: string, data?: any }`

---

## H. 近期修改记录

### 2024-05-14

#### 1. 修复词云变量名冲突 Bug
- **文件**：`routes/teacher.js` 第 632-637 行
- **问题**：`JSON.parse(evaluation.evaluation || answer.evaluation)` 变量名冲突
- **修复**：改为 `JSON.parse(answer.evaluation)` 直接读取 answer 表字段

#### 2. 调整评分参数提高分数
- **文件**：`db/music-keywords.js` 第 138 行
- **修改**：`baseScore: 0.5` → `baseScore: 0.8`
- **目的**：让优秀回答能达到 6-8 分，显示为"优势"

#### 3. 优化学生成绩柱状图
- **文件**：`public/js/teacher.js`
- **修改**：
  - 姓名只取姓+名第一个字，避免 X 轴标签重叠
  - 添加柱顶分数标注
  - 动态计算 canvas 高度适应 50 个学生

#### 4. 修复学生统计依赖问题
- **文件**：`routes/teacher.js`
- **修改**：学生人数统计从 `answers` 表关联查询，不再依赖 `classroom_students` 表

#### 5. 添加模拟课堂自动清理
- **文件**：`server.js` 第 22-47 行
- **功能**：启动时自动清理名为"贝多芬音乐鉴赏专题"的旧模拟课堂

---

### 2024-05-13

#### 1. 实现双词云功能
- **后端**：`routes/teacher.js` 添加 `GET /questions/:id/wordcloud` 接口
- **前端**：`public/js/teacher.js` 添加词云渲染逻辑
- **功能**：区分优势和不足两类词云

#### 2. 实现 100 分制评分
- **修改**：统计接口返回 `normalized_avg_score` 等百分制分数
- **计算**：`得分率 × 题目权重` 的累加

#### 3. 添加维度概览
- **返回**：`dimensionOverview` 数组含各维度平均分和状态
- **状态判断**：≥6 分为 strength，<4 分为 weakness

---

## I. 常用命令

```bash
# 安装依赖
npm install

# 启动服务
npm start

# 启动并加载模拟数据
SEED_MOCK_DATA=true npm start

# 启动并启用 AI 评价
AI_ENABLED=true AI_API_KEY=your-key npm start

# 查看数据库（可选）
sqlite3 db/music-eval.db

# 手动执行模拟数据脚本
node seed-local.js
```

---

## J. 联系方式

- 项目 Owner：czm528
- GitHub：https://github.com/czm528/music-eval
- 线上地址：https://musicclasseval.zeabur.app

---

> 📝 **交接备注**：
> - 本项目近期主要围绕数据看板功能进行优化
> - 词云是核心亮点功能，已完成变量名冲突修复和评分参数调整
> - 如需继续优化，可考虑：1) 增加更多评价维度词 2) 优化词云配色 3) 添加历史课堂对比功能
