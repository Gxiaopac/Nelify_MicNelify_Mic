#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
麦克风批量测试工具 - Netlify Web版本
Flask 后端服务器（用于 Netlify Functions）
"""

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import numpy as np
from scipy import signal
from datetime import datetime
import pandas as pd
import os
import json
from pathlib import Path
import base64
import io

app = Flask(__name__)
CORS(app)

# 全局变量
results = []
reference_data = None
reference_mic_id = None

# 加载配置
def load_config():
    """加载配置"""
    config_file = 'config.json'
    if os.path.exists(config_file):
        with open(config_file, 'r', encoding='utf-8') as f:
            config = json.load(f)
    else:
        # 默认配置
        config = {
            'sample_rate': 44100,
            'duration': 3,
            'test_frequency': 1000,
            'min_rms': 0.01,
            'max_rms': 0.9,
            'snr_threshold': 20,
            'sensitivity_tolerance': 0.3,
            'enable_thd_check': False,
            'enable_peak_check': True,
            'enable_snr_check': True,
            'enable_sensitivity_check': True,
            'enable_loopback_check': True,
            'enable_mav_check': True,
            'enable_crest_factor_check': True,
            'peak_threshold': 0.98,
            'thd_threshold': 0.1,
            'mav_min': 0.01,
            'mav_max': 0.9,
            'crest_factor_min': 1.2,
            'crest_factor_max': 5.0,
        }
        # 在 Netlify Functions 中，可能无法写入文件，所以只返回配置
        # with open(config_file, 'w', encoding='utf-8') as f:
        #     json.dump(config, f, indent=4, ensure_ascii=False)
    return config

config = load_config()

def convert_to_native_types(obj):
    """将 NumPy 类型转换为 Python 原生类型，确保 JSON 可序列化"""
    if isinstance(obj, np.integer):
        return int(obj)
    elif isinstance(obj, np.floating):
        return float(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, dict):
        return {key: convert_to_native_types(value) for key, value in obj.items()}
    elif isinstance(obj, list):
        return [convert_to_native_types(item) for item in obj]
    else:
        return obj

def preprocess_audio(audio_data, sample_rate, pre_roll=0.3):
    """预处理音频数据"""
    if audio_data is None or len(audio_data) == 0:
        return audio_data
    
    audio = np.asarray(audio_data, dtype=np.float32)
    
    # 去掉前 pre_roll 秒
    pre_samples = int(pre_roll * sample_rate)
    if len(audio) > pre_samples:
        audio = audio[pre_samples:]
    
    # 清理 NaN / inf
    invalid_mask = ~np.isfinite(audio)
    if np.any(invalid_mask):
        audio[invalid_mask] = 0.0
    
    # 清理极端异常值
    extreme_mask = np.abs(audio) > 10
    if np.any(extreme_mask):
        audio[extreme_mask] = 0.0
    
    # 归一化
    max_abs = np.max(np.abs(audio)) if len(audio) > 0 else 0.0
    if max_abs > 1.0:
        audio = (audio / max_abs).astype(np.float32)
    
    return audio

def calculate_thd(audio_data, sample_rate, test_frequency):
    """计算总谐波失真 - 使用测试频率作为基频"""
    try:
        fft_data = np.fft.fft(audio_data)
        fft_freq = np.fft.fftfreq(len(audio_data), 1/sample_rate)
        
        positive_freq_idx = fft_freq > 0
        fft_data = np.abs(fft_data[positive_freq_idx])
        fft_freq = fft_freq[positive_freq_idx]
        
        # 使用测试频率作为基频（而不是找最大峰值）
        fundamental_idx = np.argmin(np.abs(fft_freq - test_frequency))
        fundamental_power = fft_data[fundamental_idx]**2
        
        # 计算谐波功率（2-5次谐波）
        harmonic_power = 0
        for n in range(2, 6):
            harmonic_freq = test_frequency * n
            harmonic_idx = np.argmin(np.abs(fft_freq - harmonic_freq))
            if harmonic_idx < len(fft_data):
                harmonic_power += fft_data[harmonic_idx]**2
        
        if fundamental_power > 0:
            thd = np.sqrt(harmonic_power / fundamental_power)
        else:
            thd = 0
        
        return thd
    except Exception as e:
        print(f"THD计算错误: {e}")
        return 0

def judge_quality(rms, peak, snr, thd, mav, crest_factor, is_setting_reference=False):
    """判断质量"""
    global reference_data
    
    issues = []
    
    if is_setting_reference:
        return True, ['标准麦克风（不进行合格判定）'], None
    
    # 声卡回放通道检测
    if config.get('enable_loopback_check', True):
        try:
            if 0.65 <= rms <= 0.75 and peak >= 0.98 and snr > 40 and thd < 0.02:
                issues.append('疑似声卡回放通道（非物理麦克风），请更换为实际麦克风设备')
                return False, issues, None
        except:
            pass
    
    # RMS范围检测（必须）
    if rms < config.get('min_rms', 0.01):
        issues.append(f'音量过小(RMS={rms:.4f})')
    
    # THD失真度检测
    if config.get('enable_thd_check', False):
        if thd > config.get('thd_threshold', 0.1):
            issues.append(f'失真过大(THD={thd*100:.1f}%)')
    
    # Peak削波检测
    if config.get('enable_peak_check', True):
        if peak > config.get('peak_threshold', 0.98):
            issues.append(f'信号削波(Peak={peak:.4f})')
    
    # SNR信噪比检测
    if config.get('enable_snr_check', True):
        if snr < config.get('snr_threshold', 20) and snr != float('inf'):
            issues.append(f'信噪比过低(SNR={snr:.1f}dB)')
    
    # RMS偏差检测
    rms_deviation = None
    if config.get('enable_sensitivity_check', True) and reference_data is not None:
        ref_rms = reference_data['rms']
        rms_deviation = (rms - ref_rms) / ref_rms * 100
        
        if rms < ref_rms:
            rms_diff_ratio = (ref_rms - rms) / ref_rms
            if rms_diff_ratio > config.get('sensitivity_tolerance', 0.3):
                issues.append(f'RMS偏小({abs(rms_deviation):.1f}%)，灵敏度低于标准麦克风')
    
    # MAV检测
    if config.get('enable_mav_check', True) and mav is not None:
        if mav < config.get('mav_min', 0.01):
            issues.append(f'MAV过小({mav:.4f})')
        elif mav > config.get('mav_max', 0.9):
            issues.append(f'MAV过大({mav:.4f})')
    
    # 峰值因数检测
    if config.get('enable_crest_factor_check', True) and crest_factor is not None:
        if crest_factor < config.get('crest_factor_min', 1.2):
            issues.append(f'峰值因数过小({crest_factor:.2f})')
        elif crest_factor > config.get('crest_factor_max', 5.0):
            issues.append(f'峰值因数过大({crest_factor:.2f})')
    
    is_pass = len(issues) == 0
    return is_pass, issues, rms_deviation

@app.route('/test')
def test():
    """测试路由"""
    return jsonify({'status': 'ok', 'message': '服务器运行正常'})

@app.route('/favicon.ico')
def favicon():
    """返回空 favicon 避免 404"""
    return '', 204

@app.route('/api/config', methods=['GET'])
def get_config():
    """获取配置"""
    return jsonify(config)

@app.route('/api/config', methods=['POST'])
def update_config():
    """更新配置"""
    global config
    new_config = request.json
    config.update(new_config)
    
    # 在 Netlify Functions 中，可能无法写入文件，所以只更新内存中的配置
    # with open('config.json', 'w', encoding='utf-8') as f:
    #     json.dump(config, f, indent=4, ensure_ascii=False)
    
    return jsonify({'status': 'success'})

@app.route('/api/analyze', methods=['POST'])
def analyze_audio():
    """分析音频"""
    global results, reference_data, reference_mic_id
    
    try:
        data = request.json
        if not data or 'audio_data' not in data:
            return jsonify({'status': 'error', 'message': '缺少音频数据'}), 400
        
        audio_data_list = data['audio_data']
        if not audio_data_list or len(audio_data_list) == 0:
            return jsonify({'status': 'error', 'message': '音频数据为空'}), 400
        
        print(f"收到音频数据: {len(audio_data_list)} 个采样点")
        audio_data = np.array(audio_data_list, dtype=np.float32)
        mic_id = int(data['mic_id'])
        sample_rate = int(data.get('sample_rate', config['sample_rate']))
        is_setting_reference = data.get('is_setting_reference', False)
        
        print(f"麦克风 ID: {mic_id}, 采样率: {sample_rate}, 数据长度: {len(audio_data)}")
        
        # 预处理音频
        audio_data = preprocess_audio(audio_data, sample_rate)
        
        # 计算基本指标
        rms = np.sqrt(np.mean(audio_data**2))
        peak = np.max(np.abs(audio_data))
        mav = np.mean(np.abs(audio_data))
        crest_factor = peak / rms if rms > 0 else 0
        
        # 频谱分析
        frequencies, psd = signal.welch(audio_data, sample_rate, nperseg=1024)
        dominant_freq_idx = np.argmax(psd)
        dominant_freq = frequencies[dominant_freq_idx]
        
        # 计算SNR
        freq_range = 100
        freq_mask = (frequencies >= config['test_frequency'] - freq_range) & \
                    (frequencies <= config['test_frequency'] + freq_range)
        signal_power = np.mean(psd[freq_mask])
        noise_power = np.mean(psd[~freq_mask])
        
        if noise_power > 0:
            snr = 10 * np.log10(signal_power / noise_power)
        else:
            snr = float('inf')
        
        # 计算THD
        thd = calculate_thd(audio_data, sample_rate, config['test_frequency'])
        
        # 判断质量
        is_pass, issues, rms_deviation = judge_quality(
            rms, peak, snr, thd, mav, crest_factor, is_setting_reference
        )
        
        result = {
            'mic_id': int(mic_id),
            'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'rms': float(round(rms, 4)),
            'rms_deviation': float(round(rms_deviation, 1)) if rms_deviation is not None else None,
            'peak': float(round(peak, 4)),
            'mav': float(round(mav, 4)),
            'crest_factor': float(round(crest_factor, 2)),
            'dominant_freq': float(round(dominant_freq, 2)),
            'snr_db': float(round(snr, 2)) if snr != float('inf') else 999.0,
            'thd_percent': float(round(thd * 100, 2)),
            'is_pass': bool(is_pass),
            'issues': '; '.join(issues) if issues else '正常',
            'sample_rate': int(sample_rate)
        }
        
        # 如果是设置标准麦克风
        if is_setting_reference:
            reference_data = result.copy()
            reference_mic_id = mic_id
            result['issues'] = '标准麦克风（不进行合格判定）'
        
        results.append(result)
        
        # 确保所有数据都是可序列化的
        response_data = {
            'status': 'success',
            'result': convert_to_native_types(result),
            'reference_data': convert_to_native_types(reference_data) if reference_data else None
        }
        return jsonify(response_data)
    
    except Exception as e:
        import traceback
        error_msg = str(e)
        error_trace = traceback.format_exc()
        print(f"分析错误: {error_msg}")
        print(f"错误详情: {error_trace}")
        return jsonify({
            'status': 'error', 
            'message': error_msg,
            'trace': error_trace
        }), 500

@app.route('/api/reference', methods=['POST'])
def set_reference():
    """设置标准麦克风"""
    global reference_data, reference_mic_id
    
    data = request.json
    mic_id = int(data.get('mic_id'))
    
    # 从结果中查找
    for result in reversed(results):
        if result['mic_id'] == mic_id:
            reference_data = result.copy()
            reference_mic_id = mic_id
            return jsonify({'status': 'success', 'reference_data': reference_data})
    
    return jsonify({'status': 'error', 'message': '未找到测试结果'}), 404

@app.route('/api/reference', methods=['GET'])
def get_reference():
    """获取标准麦克风信息"""
    global reference_data
    
    if reference_data:
        # 计算RMS范围
        ref_rms = reference_data['rms']
        tolerance = config.get('sensitivity_tolerance', 0.3)
        rms_min = ref_rms * (1 - tolerance)
        rms_max = ref_rms * (1 + tolerance)
        
        ref_info = reference_data.copy()
        ref_info['rms_range'] = {
            'min': round(rms_min, 4),
            'max': round(rms_max, 4)
        }
        return jsonify({'status': 'success', 'reference_data': ref_info})
    
    return jsonify({'status': 'not_set'})

@app.route('/api/results', methods=['GET'])
def get_results():
    """获取所有测试结果"""
    return jsonify({'results': results})

@app.route('/api/results', methods=['DELETE'])
def clear_results():
    """清空测试结果"""
    global results, reference_data, reference_mic_id
    results = []
    reference_data = None
    reference_mic_id = None
    return jsonify({'status': 'success'})

@app.route('/api/export', methods=['GET'])
def export_report():
    """导出Excel报告（在内存中生成文件并返回给前端下载）"""
    try:
        if not results:
            return jsonify({'status': 'error', 'message': '没有测试结果'}), 400

        # 创建DataFrame
        df_data = []
        for r in results:
            df_data.append({
                '麦克风编号': r['mic_id'],
                '测试时间': r['timestamp'],
                'RMS': r['rms'],
                'RMS偏差(%)': r.get('rms_deviation', ''),
                'Peak': r['peak'],
                '主频率(Hz)': r['dominant_freq'],
                'SNR(dB)': r['snr_db'] if r['snr_db'] < 999 else '∞',
                'THD(%)': r['thd_percent'],
                'MAV': r['mav'],
                '峰值因数': r['crest_factor'],
                '判定结果': '合格' if r['is_pass'] else '不合格',
                '问题诊断': r['issues'],
                '采样率(Hz)': r['sample_rate']
            })

        df = pd.DataFrame(df_data)

        # 统计信息
        total = len(results)
        passed = sum(1 for r in results if r['is_pass'])
        failed = total - passed
        pass_rate = (passed / total * 100) if total > 0 else 0

        # 在内存中生成 Excel 文件
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, sheet_name='测试结果', index=False)

            # 统计表
            stats_df = pd.DataFrame({
                '统计项': ['总测试数', '合格数', '不合格数', '合格率'],
                '数值': [total, passed, failed, f'{pass_rate:.1f}%']
            })
            stats_df.to_excel(writer, sheet_name='统计信息', index=False)

        output.seek(0)
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f'mic_test_report_{timestamp}.xlsx'

        # 直接以文件形式返回，供前端以 blob 下载
        return send_file(
            output,
            as_attachment=True,
            download_name=filename,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

