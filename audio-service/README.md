# 音准分析微服务

基于 FastAPI 的音准分析服务，用于分析学生演唱与标准参考音频的音准偏差。

## 功能特性

- 🎵 **音高提取**：使用 librosa.pyin 算法提取音频音高曲线
- 📊 **智能对齐**：采用 DTW（动态时间规整）对齐两条音高曲线
- 📈 **偏差计算**：计算平均音分偏差、最大偏差、匹配率
- 🎯 **自动评分**：根据宽松版评分标准输出100分制得分

## 技术栈

- **FastAPI**: Web 框架
- **librosa**: 音频分析库
- **dtw**: 动态时间规整算法
- **numpy**: 数值计算

## 评分标准（宽松版）

| 平均偏差 | 分数范围 | 等级 |
|---------|---------|------|
| ≤30音分 | 90-100分 | 优秀 |
| ≤50音分 | 75-90分 | 良好 |
| ≤80音分 | 60-75分 | 中等 |
| ≤120音分 | 40-60分 | 及格 |
| >120音分 | 0-40分 | 需加强 |

## 快速开始

### 本地运行

```bash
# 安装依赖
pip install -r requirements.txt

# 启动服务
uvicorn main:app --reload

# 服务运行在 http://localhost:8000
```

### Docker 部署

```bash
# 构建镜像
docker build -t audio-service .

# 运行容器
docker run -p 8000:8000 audio-service
```

## API 文档

启动服务后访问：
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

### 接口说明

#### GET /health
健康检查

**响应示例：**
```json
{
  "status": "ok",
  "service": "audio-pitch-analyzer"
}
```

#### POST /analyze
分析音准偏差

**请求：**
- `student_audio`: 学生演唱音频文件（multipart/form-data）
- `reference_audio`: 标准参考音频文件（multipart/form-data）

**响应示例：**
```json
{
  "success": true,
  "data": {
    "score": 85.5,
    "avg_deviation_cents": 45.2,
    "max_deviation_cents": 120.3,
    "pitch_match_rate": 68.5,
    "details": {
      "ref_notes_count": 156,
      "stu_notes_count": 162,
      "description": "良好"
    }
  }
}
```

### 使用 curl 测试

```bash
curl -X POST "http://localhost:8000/analyze" \
  -F "student_audio=@student.wav" \
  -F "reference_audio=@reference.wav"
```

## 项目结构

```
audio-service/
├── main.py          # FastAPI 入口
├── analyzer.py      # 音准分析核心逻辑
├── requirements.txt # Python 依赖
├── Dockerfile       # 容器配置
└── README.md        # 本文档
```

## 算法说明

1. **音频加载**：使用 librosa 以 22050Hz 采样率加载音频
2. **音高提取**：pyin 算法，适合人声，频率范围 C2-C7
3. **音分转换**：以参考音频中值音高为基准，转换为音分（cents）
4. **DTW对齐**：使用 symmetric2 步态模式对齐两条曲线
5. **偏差计算**：计算对齐后各点的绝对偏差
6. **评分映射**：根据偏差区间线性插值计算得分

## 注意事项

- 支持的音频格式：WAV, MP3, FLAC, OGG, M4A
- 音频应包含清晰的人声，否则可能无法提取音高
- 临时文件处理后自动删除
- 返回的所有数值为 Python 原生 float 类型
