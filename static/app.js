// 全局变量
let audioContext = null;
let mediaStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let waveformChart = null;
let isRecording = false;
let isSettingReference = false;
let referenceData = null;
let results = [];
let config = {};

// API 基础路径
// 如果是 file:// 协议或本地开发，使用 Flask 服务器地址（包含 /api 前缀）
// 如果是 Netlify 部署，使用 /api（会被 redirect 到函数）
const API_BASE = (window.location.protocol === 'file:' || 
                  window.location.hostname === 'localhost' || 
                  window.location.hostname === '127.0.0.1')
  ? 'http://127.0.0.1:5000/api'
  : '/api';

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    initChart();
    loadConfig();
    setupEventListeners();
    requestMicrophoneAccess();
});

// 初始化图表
function initChart() {
    const ctx = document.getElementById('waveformChart').getContext('2d');
    waveformChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: '音频波形',
                data: [],
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    min: -1,
                    max: 1,
                    title: {
                        display: true,
                        text: '振幅'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: '时间 (秒)'
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

// 加载配置
async function loadConfig() {
    try {
        const url = `${API_BASE}/config`;
        log(`正在加载配置: ${url}`, 'info');
        const response = await fetch(url);
        
        // 检查响应类型
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            log(`配置加载失败: 返回的不是 JSON，而是 ${contentType}`, 'error');
            log(`响应内容前100字符: ${text.substring(0, 100)}`, 'error');
            log(`完整 URL: ${url}`, 'error');
            log(`状态码: ${response.status}`, 'error');
            return;
        }
        
        config = await response.json();
        updateCheckboxes();
        log('配置加载成功', 'pass');
    } catch (error) {
        log(`配置加载失败: ${error.message}`, 'error');
        console.error('配置加载错误详情:', error);
    }
}

// 更新复选框状态
function updateCheckboxes() {
    document.getElementById('enableThd').checked = config.enable_thd_check || false;
    document.getElementById('enablePeak').checked = config.enable_peak_check !== false;
    document.getElementById('enableSnr').checked = config.enable_snr_check !== false;
    document.getElementById('enableSensitivity').checked = config.enable_sensitivity_check !== false;
    document.getElementById('enableLoopback').checked = config.enable_loopback_check !== false;
    document.getElementById('enableMav').checked = config.enable_mav_check !== false;
    document.getElementById('enableCrestFactor').checked = config.enable_crest_factor_check !== false;
}

// 设置事件监听器
function setupEventListeners() {
    document.getElementById('startTest').addEventListener('click', startTest);
    document.getElementById('playAudio').addEventListener('click', playAudio);
    document.getElementById('refreshDevices').addEventListener('click', requestMicrophoneAccess);
    document.getElementById('setReference').addEventListener('click', toggleReferenceMode);
    document.getElementById('exportReport').addEventListener('click', exportReport);
    document.getElementById('clearResults').addEventListener('click', clearResults);
    document.getElementById('micIdMinus').addEventListener('click', () => {
        const input = document.getElementById('micId');
        input.value = Math.max(1, parseInt(input.value) - 1);
    });
    document.getElementById('micIdPlus').addEventListener('click', () => {
        const input = document.getElementById('micId');
        input.value = parseInt(input.value) + 1;
    });
    
    // 复选框变化时更新配置
    document.querySelectorAll('.check-option').forEach(cb => {
        cb.addEventListener('change', updateConfigFromUI);
    });
}

// 从UI更新配置
async function updateConfigFromUI() {
    config.enable_thd_check = document.getElementById('enableThd').checked;
    config.enable_peak_check = document.getElementById('enablePeak').checked;
    config.enable_snr_check = document.getElementById('enableSnr').checked;
    config.enable_sensitivity_check = document.getElementById('enableSensitivity').checked;
    config.enable_loopback_check = document.getElementById('enableLoopback').checked;
    config.enable_mav_check = document.getElementById('enableMav').checked;
    config.enable_crest_factor_check = document.getElementById('enableCrestFactor').checked;
    
    try {
        await fetch(`${API_BASE}/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
    } catch (error) {
        log(`配置更新失败: ${error.message}`, 'error');
    }
}

// 请求麦克风访问
async function requestMicrophoneAccess() {
    try {
        // 先请求麦克风权限，这样才能获取完整的设备信息
        try {
            const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            // 获取权限后立即停止临时流
            tempStream.getTracks().forEach(track => track.stop());
        } catch (permError) {
            log(`需要麦克风权限才能枚举设备: ${permError.message}`, 'error');
            const select = document.getElementById('deviceSelect');
            select.innerHTML = '<option value=\"\">请允许麦克风权限</option>';
            return;
        }
        
        // 现在可以枚举设备了
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(device => device.kind === 'audioinput');
        
        const select = document.getElementById('deviceSelect');
        select.innerHTML = '';
        
        if (audioInputs.length === 0) {
            select.innerHTML = '<option value=\"\">未找到音频输入设备</option>';
            log('未找到音频输入设备', 'error');
            return;
        }
        
        audioInputs.forEach((device, index) => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label || `麦克风 ${index + 1}`;
            select.appendChild(option);
        });
        
        log(`✅ 找到 ${audioInputs.length} 个音频输入设备`);
    } catch (error) {
        log(`设备枚举失败: ${error.message}`, 'error');
        const select = document.getElementById('deviceSelect');
        select.innerHTML = '<option value=\"\">设备枚举失败</option>';
    }
}

// 开始测试
async function startTest() {
    if (isRecording) {
        alert('正在测试中，请稍候...');
        return;
    }
    
    const micId = parseInt(document.getElementById('micId').value);
    const deviceId = document.getElementById('deviceSelect').value;
    
    if (!deviceId) {
        alert('请先选择麦克风设备');
        return;
    }
    
    isRecording = true;
    const startBtn = document.getElementById('startTest');
    startBtn.disabled = true;
    startBtn.textContent = '⏳ 测试中...';
    updateStatus('🎤 正在录音...');
    
    try {
        // 请求麦克风权限
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                deviceId: deviceId ? { exact: deviceId } : undefined,
                sampleRate: config.sample_rate || 44100,
                channelCount: 1,
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            }
        });
        
        mediaStream = stream;
        audioContext = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: config.sample_rate || 44100
        });
        
        const source = audioContext.createMediaStreamSource(stream);
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        
        const audioData = [];
        const duration = config.duration || 3;
        const sampleRate = audioContext.sampleRate;
        const totalSamples = duration * sampleRate;
        
        // 实时波形更新
        let sampleCount = 0;
        let isRecordingComplete = false;
        
        processor.onaudioprocess = (e) => {
            if (isRecordingComplete) return;
            
            const inputData = e.inputBuffer.getChannelData(0);
            const chunk = Array.from(inputData);
            audioData.push(...chunk);
            sampleCount += chunk.length;
            
            // 更新波形（降采样显示）
            if (sampleCount % 100 === 0) {
                updateWaveformRealtime(audioData);
            }
            
            // 检查是否录制完成
            if (sampleCount >= totalSamples && !isRecordingComplete) {
                isRecordingComplete = true;
                
                // 延迟一点确保数据完整
                setTimeout(() => {
                    processor.disconnect();
                    source.disconnect();
                    stream.getTracks().forEach(track => track.stop());
                    
                    // 确保数据完整
                    if (audioData.length > 0) {
                        analyzeAudio(audioData, micId, sampleRate);
                    } else {
                        log('录音失败: 未录制到数据', 'error');
                        resetTestState();
                    }
                }, 100);
            }
        };
        
        source.connect(processor);
        processor.connect(audioContext.destination);
        
        // 设置安全超时（防止无限录制）
        setTimeout(() => {
            if (!isRecordingComplete) {
                isRecordingComplete = true;
                processor.disconnect();
                source.disconnect();
                stream.getTracks().forEach(track => track.stop());
                
                if (audioData.length > 0) {
                    analyzeAudio(audioData, micId, sampleRate);
                } else {
                    log('录音超时', 'error');
                    resetTestState();
                }
            }
        }, (duration + 1) * 1000);
        
        log(`━━━ 开始测试麦克风 #${micId} ━━━`);
        log(`🔴 录音 ${duration} 秒...`);
        
        // 倒计时
        let remaining = duration;
        const countdown = setInterval(() => {
            remaining--;
            updateStatus(`🎤 录音中... ${remaining}秒`);
            if (remaining <= 0) {
                clearInterval(countdown);
            }
        }, 1000);
        
    } catch (error) {
        log(`录音失败: ${error.message}`, 'error');
        alert(`录音失败: ${error.message}\n\n请确保已授予麦克风权限`);
        resetTestState();
    }
}

// 实时更新波形
function updateWaveformRealtime(audioData) {
    if (!waveformChart) return;
    
    const sampleRate = audioContext.sampleRate;
    const duration = audioData.length / sampleRate;
    const step = Math.max(1, Math.floor(audioData.length / 1000)); // 最多显示1000个点
    
    const labels = [];
    const data = [];
    
    for (let i = 0; i < audioData.length; i += step) {
        labels.push((i / sampleRate).toFixed(2));
        data.push(audioData[i]);
    }
    
    waveformChart.data.labels = labels;
    waveformChart.data.datasets[0].data = data;
    waveformChart.update('none');
}

// 分析音频
async function analyzeAudio(audioData, micId, sampleRate) {
    try {
        updateStatus('⚙️ 分析数据中...');
        log('⚙️ 分析音频数据...');
        
        const url = `${API_BASE}/analyze`;
        log(`请求 URL: ${url}`, 'info');
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                audio_data: audioData,
                mic_id: micId,
                sample_rate: sampleRate,
                is_setting_reference: isSettingReference
            })
        });
        
        // 检查响应类型
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            log(`分析失败: 返回的不是 JSON，而是 ${contentType}`, 'error');
            log(`响应内容前200字符: ${text.substring(0, 200)}`, 'error');
            log(`完整 URL: ${url}`, 'error');
            log(`状态码: ${response.status}`, 'error');
            throw new Error(`服务器返回了非 JSON 响应: ${contentType}`);
        }
        
        const result = await response.json();
        
        if (result.status === 'success') {
            displayResult(result.result);
            updateStatistics();
            
            // 如果是设置标准麦克风
            if (isSettingReference) {
                referenceData = result.reference_data;
                isSettingReference = false;
                document.getElementById('setReference').textContent = '📌 设置标准麦克风模式';
                updateReferenceInfo();
                log(`📌 麦克风 #${micId} 测试完成 - 标准麦克风`, 'reference');
                log('   此测试结果已设为标准麦克风参考', 'reference');
            } else {
                const statusColor = result.result.is_pass ? 'pass' : 'fail';
                const statusEmoji = result.result.is_pass ? '✅' : '❌';
                const statusText = result.result.is_pass ? '合格' : '不合格';
                log(`${statusEmoji} 麦克风 #${micId} 测试完成 - ${statusText}`, statusColor);
                
                if (result.result.is_pass) {
                    log('   判定原因: 正常（所有指标在阈值范围内）', 'pass');
                } else {
                    log(`   判定原因: ${result.result.issues}`, 'fail');
                }
            }
            
            // 自动增加编号
            document.getElementById('micId').value = micId + 1;
            
            // 更新最终波形
            updateFinalWaveform(audioData, sampleRate);
            
            // 保存音频数据用于播放
            window.lastAudioData = audioData;
            window.lastSampleRate = sampleRate;
            document.getElementById('playAudio').disabled = false;
            
        } else {
            const errorMsg = result.message || '分析失败';
            const errorTrace = result.trace || '';
            log(`❌ 分析失败: ${errorMsg}`, 'error');
            if (errorTrace) {
                console.error('服务器错误详情:', errorTrace);
            }
            throw new Error(errorMsg);
        }
        
    } catch (error) {
        log(`分析错误: ${error.message}`, 'error');
        alert(`分析失败: ${error.message}`);
    } finally {
        resetTestState();
    }
}

// 更新最终波形
function updateFinalWaveform(audioData, sampleRate) {
    if (!waveformChart) return;
    
    const duration = audioData.length / sampleRate;
    const step = Math.max(1, Math.floor(audioData.length / 2000)); // 最多显示2000个点
    
    const labels = [];
    const data = [];
    
    for (let i = 0; i < audioData.length; i += step) {
        labels.push((i / sampleRate).toFixed(2));
        data.push(audioData[i]);
    }
    
    waveformChart.data.labels = labels;
    waveformChart.data.datasets[0].data = data;
    waveformChart.data.datasets[0].borderColor = '#28a745';
    waveformChart.update();
}

// 显示结果
function displayResult(result) {
    const resultDiv = document.getElementById('testResult');
    
    let statusClass = 'status-pass';
    let statusText = '✅ 合格';
    if (!result.is_pass) {
        statusClass = 'status-fail';
        statusText = '❌ 不合格';
    }
    if (result.issues.includes('标准麦克风')) {
        statusClass = 'status-reference';
        statusText = '📌 标准麦克风';
    }
    
    let html = `
        <h4>状态: <span class="${statusClass}">${statusText}</span></h4>
        <div class="result-item">
            <span class="result-label">麦克风编号:</span>
            <span class="result-value">${result.mic_id}</span>
        </div>
        <div class="result-item">
            <span class="result-label">测试时间:</span>
            <span class="result-value">${result.timestamp}</span>
        </div>
        <div class="result-item">
            <span class="result-label">音量(RMS):</span>
            <span class="result-value">${result.rms}</span>
        </div>
        ${result.rms_deviation !== null ? `
        <div class="result-item">
            <span class="result-label">RMS偏差:</span>
            <span class="result-value">${result.rms_deviation > 0 ? '+' : ''}${result.rms_deviation}%</span>
        </div>
        ` : ''}
        <div class="result-item">
            <span class="result-label">峰值(Peak):</span>
            <span class="result-value">${result.peak}</span>
        </div>
        <div class="result-item">
            <span class="result-label">主频率:</span>
            <span class="result-value">${result.dominant_freq} Hz</span>
        </div>
        <div class="result-item">
            <span class="result-label">信噪比(SNR):</span>
            <span class="result-value">${result.snr_db < 999 ? result.snr_db + ' dB' : '∞'}</span>
        </div>
        <div class="result-item">
            <span class="result-label">失真度(THD):</span>
            <span class="result-value">${result.thd_percent}%</span>
        </div>
        <div class="result-item">
            <span class="result-label">平均绝对值(MAV):</span>
            <span class="result-value">${result.mav}</span>
        </div>
        <div class="result-item">
            <span class="result-label">峰值因数(CF):</span>
            <span class="result-value">${result.crest_factor}</span>
        </div>
        <div class="result-item">
            <span class="result-label">问题诊断:</span>
            <span class="result-value">${result.issues}</span>
        </div>
    `;
    
    resultDiv.innerHTML = html;
}

// 播放录音
function playAudio() {
    if (!window.lastAudioData || !window.lastSampleRate) {
        alert('没有可播放的录音');
        return;
    }
    
    const audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: window.lastSampleRate
    });
    const buffer = audioContext.createBuffer(1, window.lastAudioData.length, window.lastSampleRate);
    buffer.getChannelData(0).set(window.lastAudioData);
    
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    
    log('🔊 开始播放录制的音频...');
    updateStatus('🔊 播放录音中...');
    
    source.onended = () => {
        log('✓ 播放完成');
        updateStatus('就绪');
    };
    
    source.start();
}

// 切换标准麦克风模式
function toggleReferenceMode() {
    isSettingReference = !isSettingReference;
    const btn = document.getElementById('setReference');
    
    if (isSettingReference) {
        btn.textContent = '📌 标准麦克风模式已激活';
        btn.style.background = '#28a745';
        log('📌 标准麦克风模式已激活，下次测试将设为标准麦克风', 'reference');
    } else {
        btn.textContent = '📌 设置标准麦克风模式';
        btn.style.background = '#17a2b8';
        log('已取消标准麦克风模式');
    }
}

// 更新标准麦克风信息
async function updateReferenceInfo() {
    try {
        const response = await fetch(`${API_BASE}/reference`);
        const data = await response.json();
        
        const infoDiv = document.getElementById('referenceInfo');
        
        if (data.status === 'success' && data.reference_data) {
            const ref = data.reference_data;
            const rmsRange = ref.rms_range || {};
            
            infoDiv.innerHTML = `
                <p><strong>标准麦克风 #${ref.mic_id}</strong></p>
                <p>RMS: ${ref.rms}</p>
                <p>Peak: ${ref.peak}</p>
                <p>SNR: ${ref.snr_db < 999 ? ref.snr_db + ' dB' : '∞'}</p>
                <p>THD: ${ref.thd_percent}%</p>
                <p>MAV: ${ref.mav}</p>
                <p>峰值因数: ${ref.crest_factor}</p>
                <p>允许RMS范围: ${rmsRange.min || ''} ~ ${rmsRange.max || ''}</p>
            `;
        } else {
            infoDiv.innerHTML = '<p class="text-muted">未设置标准麦克风</p>';
        }
    } catch (error) {
        console.error('更新标准麦克风信息失败:', error);
    }
}

// 更新统计
async function updateStatistics() {
    try {
        const response = await fetch(`${API_BASE}/results`);
        const data = await response.json();
        results = data.results || [];
        
        const total = results.length;
        const passed = results.filter(r => r.is_pass).length;
        const failed = total - passed;
        const rate = total > 0 ? ((passed / total) * 100).toFixed(1) : 0;
        
        document.getElementById('statTotal').textContent = total;
        document.getElementById('statPassed').textContent = passed;
        document.getElementById('statFailed').textContent = failed;
        document.getElementById('statRate').textContent = rate + '%';
    } catch (error) {
        console.error('更新统计失败:', error);
    }
}

// 导出报告
async function exportReport() {
    try {
        const response = await fetch(`${API_BASE}/export`);
        if (response.ok) {
            // 检查 Content-Type 判断返回格式
            const contentType = response.headers.get('content-type');
            let blob;
            let filename = `mic_test_report_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.xlsx`;
            
            if (contentType && contentType.includes('application/json')) {
                // Netlify Functions 返回 JSON（包含 base64 数据）
                const data = await response.json();
                if (data.status === 'success' && data.data) {
                    // 解码 base64
                    const binaryString = atob(data.data);
                    const bytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                    filename = data.filename || filename;
                } else {
                    throw new Error(data.message || '导出失败');
                }
            } else {
                // 本地开发或直接返回 blob
                blob = await response.blob();
            }
            
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            log('✓ 报告导出成功');
        } else {
            const error = await response.json();
            throw new Error(error.message || '导出失败');
        }
    } catch (error) {
        log(`导出失败: ${error.message}`, 'error');
        alert(`导出失败: ${error.message}`);
    }
}

// 清空结果
async function clearResults() {
    if (!confirm('确定要清空所有测试结果吗？')) {
        return;
    }
    
    try {
        await fetch(`${API_BASE}/results`, { method: 'DELETE' });
        results = [];
        referenceData = null;
        updateStatistics();
        document.getElementById('testResult').innerHTML = '<p class="text-muted">等待测试...</p>';
        document.getElementById('logArea').innerHTML = '';
        updateReferenceInfo();
        log('✓ 已清空所有测试结果');
    } catch (error) {
        log(`清空失败: ${error.message}`, 'error');
    }
}

// 重置测试状态
function resetTestState() {
    isRecording = false;
    const startBtn = document.getElementById('startTest');
    startBtn.disabled = false;
    startBtn.textContent = '🎤 开始测试';
    updateStatus('就绪');
    
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
    
    if (audioContext && audioContext.state !== 'closed') {
        audioContext.close();
        audioContext = null;
    }
}

// 更新状态栏
function updateStatus(text) {
    document.getElementById('statusBar').textContent = text;
}

// 日志
function log(message, type = 'info') {
    const logArea = document.getElementById('logArea');
    const timestamp = new Date().toLocaleTimeString('zh-CN');
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    entry.textContent = `[${timestamp}] ${message}`;
    logArea.appendChild(entry);
    logArea.scrollTop = logArea.scrollHeight;
}

// 定期更新标准麦克风信息
setInterval(updateReferenceInfo, 5000);
updateReferenceInfo();


