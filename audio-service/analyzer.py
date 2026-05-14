"""
音准分析核心模块
使用 librosa.pyin 提取音高曲线，DTW 对齐后计算偏差
"""

import librosa
import numpy as np
from dtw import dtw


def analyze_pitch(student_path: str, reference_path: str):
    """
    分析学生演唱与标准参考的音准偏差
    
    Args:
        student_path: 学生演唱音频文件路径
        reference_path: 标准参考音频文件路径
    
    Returns:
        dict: 包含 score, avg_deviation_cents, max_deviation_cents, pitch_match_rate 等
              如果无法分析则返回 None
    """
    # 1. 加载音频
    y_ref, sr_ref = librosa.load(reference_path, sr=22050)
    y_stu, sr_stu = librosa.load(student_path, sr=22050)
    
    # 2. 提取音高（pyin算法，适合人声）
    # fmin=C2(约65Hz), fmax=C7(约2093Hz)，覆盖人声范围
    f0_ref, voiced_flag_ref, _ = librosa.pyin(
        y_ref,
        fmin=librosa.note_to_hz('C2'),
        fmax=librosa.note_to_hz('C7'),
        sr=22050
    )
    f0_stu, voiced_flag_stu, _ = librosa.pyin(
        y_stu,
        fmin=librosa.note_to_hz('C2'),
        fmax=librosa.note_to_hz('C7'),
        sr=22050
    )
    
    # 3. 过滤无声段
    ref_voiced = f0_ref[~np.isnan(f0_ref)]
    stu_voiced = f0_stu[~np.isnan(f0_stu)]
    
    if len(ref_voiced) == 0 or len(stu_voiced) == 0:
        return None  # 无法分析
    
    # 4. 转换为音分（cents），以参考音频中间音高为基准
    ref_median = np.median(ref_voiced)
    ref_cents = 1200 * np.log2(ref_voiced / ref_median)
    stu_cents = 1200 * np.log2(stu_voiced / ref_median)
    
    # 5. DTW对齐
    # 将两条曲线重采样到相同长度便于比较
    target_len = max(len(ref_cents), len(stu_cents))
    ref_resampled = librosa.util.fix_length(ref_cents, size=target_len)
    stu_resampled = librosa.util.fix_length(stu_cents, size=target_len)
    
    # 用DTW找最优对齐
    alignment = dtw(
        stu_resampled.reshape(-1, 1),
        ref_resampled.reshape(-1, 1),
        dist_method='euclidean',
        step_pattern='symmetric2'
    )
    
    # 6. 计算对齐后的偏差
    aligned_stu = stu_resampled[alignment.index1]
    aligned_ref = ref_resampled[alignment.index2]
    deviations = np.abs(aligned_stu - aligned_ref)
    
    avg_deviation = float(np.mean(deviations))
    max_deviation = float(np.max(deviations))
    
    # 7. 音高匹配率（偏差<50音分的比例）
    pitch_match_rate = float(np.sum(deviations < 50) / len(deviations))
    
    # 8. 偏差映射为分数
    score = deviation_to_score(avg_deviation)
    
    return {
        'score': score,
        'avg_deviation_cents': round(avg_deviation, 1),
        'max_deviation_cents': round(max_deviation, 1),
        'pitch_match_rate': round(pitch_match_rate * 100, 1),
        'ref_notes_count': len(ref_voiced),
        'stu_notes_count': len(stu_voiced)
    }


def deviation_to_score(avg_deviation: float) -> float:
    """
    将平均音分偏差映射为100分制得分（宽松版评分标准）
    
    评分标准：
    - ≤30音分 → 90-100分（优秀）
    - ≤50音分 → 75-90分（良好）
    - ≤80音分 → 60-75分（中等）
    - ≤120音分 → 40-60分（及格）
    - >120音分 → 0-40分（需加强）
    """
    if avg_deviation <= 30:
        # 90-100，线性插值
        return round(90 + (30 - avg_deviation) / 30 * 10, 1)
    elif avg_deviation <= 50:
        # 75-90，线性插值
        return round(75 + (50 - avg_deviation) / 20 * 15, 1)
    elif avg_deviation <= 80:
        # 60-75，线性插值
        return round(60 + (80 - avg_deviation) / 30 * 15, 1)
    elif avg_deviation <= 120:
        # 40-60，线性插值
        return round(40 + (120 - avg_deviation) / 40 * 20, 1)
    else:
        # 0-40，线性插值
        return round(max(0, 40 - (avg_deviation - 120) / 80 * 40), 1)


def get_score_description(score: float) -> str:
    """根据分数返回描述"""
    if score >= 90:
        return "优秀"
    elif score >= 75:
        return "良好"
    elif score >= 60:
        return "中等"
    elif score >= 40:
        return "及格"
    else:
        return "需加强"
