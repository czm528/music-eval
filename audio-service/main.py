"""
FastAPI 音准分析服务入口
提供 REST API 接收学生演唱音频和标准参考音频，返回音准评分
"""

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import tempfile
import os

from analyzer import analyze_pitch, get_score_description

app = FastAPI(
    title="音准分析服务",
    description="分析学生演唱与标准参考音频的音准偏差，返回评分",
    version="1.0.0"
)

# 允许跨域访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalysisDetail(BaseModel):
    """分析详情"""
    ref_notes_count: int
    stu_notes_count: int
    description: str


class AnalysisData(BaseModel):
    """分析结果数据"""
    score: float
    avg_deviation_cents: float
    max_deviation_cents: float
    pitch_match_rate: float
    details: AnalysisDetail


class AnalysisResponse(BaseModel):
    """分析响应"""
    success: bool
    data: AnalysisData


@app.get("/health")
async def health_check():
    """
    健康检查端点
    """
    return {"status": "ok", "service": "audio-pitch-analyzer"}


@app.post("/analyze", response_model=AnalysisResponse)
async def analyze_audio(
    student_audio: UploadFile = File(..., description="学生演唱音频文件"),
    reference_audio: UploadFile = File(..., description="标准参考音频文件")
):
    """
    分析音准偏差
    
    - **student_audio**: 学生演唱的音频文件（WAV/MP3等）
    - **reference_audio**: 标准参考音频文件
    
    返回分析结果，包含：
    - **score**: 100分制评分
    - **avg_deviation_cents**: 平均音分偏差
    - **max_deviation_cents**: 最大音分偏差
    - **pitch_match_rate**: 音高匹配率（%）
    """
    # 验证文件格式（宽松验证，只检查是否为音频）
    # 不再严格校验扩展名，因为浏览器录音可能上传webm等格式
    for audio_file in [student_audio, reference_audio]:
        if not audio_file.filename:
            raise HTTPException(status_code=400, detail="缺少音频文件")
    
    # 保存上传的文件到临时目录
    stu_path = None
    ref_path = None
    
    try:
        # 保存学生音频
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as stu_file:
            content = await student_audio.read()
            if len(content) == 0:
                raise HTTPException(status_code=400, detail="学生音频文件为空")
            stu_file.write(content)
            stu_path = stu_file.name
        
        # 保存参考音频
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as ref_file:
            content = await reference_audio.read()
            if len(content) == 0:
                raise HTTPException(status_code=400, detail="参考音频文件为空")
            ref_file.write(content)
            ref_path = ref_file.name
        
        # 执行分析
        result = analyze_pitch(stu_path, ref_path)
        
        if result is None:
            raise HTTPException(
                status_code=400,
                detail="无法分析音频，请确保音频包含清晰的人声"
            )
        
        # 构建响应
        return AnalysisResponse(
            success=True,
            data=AnalysisData(
                score=result['score'],
                avg_deviation_cents=result['avg_deviation_cents'],
                max_deviation_cents=result['max_deviation_cents'],
                pitch_match_rate=result['pitch_match_rate'],
                details=AnalysisDetail(
                    ref_notes_count=result['ref_notes_count'],
                    stu_notes_count=result['stu_notes_count'],
                    description=get_score_description(result['score'])
                )
            )
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"分析失败: {str(e)}")
    
    finally:
        # 清理临时文件
        if stu_path and os.path.exists(stu_path):
            os.unlink(stu_path)
        if ref_path and os.path.exists(ref_path):
            os.unlink(ref_path)


@app.get("/")
async def root():
    """服务根路径"""
    return {
        "service": "audio-pitch-analyzer",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health"
    }
