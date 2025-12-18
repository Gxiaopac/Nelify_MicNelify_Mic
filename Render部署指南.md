# Render 部署指南（推荐用于 Flask 应用）

## 为什么选择 Render？

1. **更适合 Flask 应用**：Render 原生支持 Python Web 服务
2. **免费计划可用**：提供免费 tier，适合测试
3. **更简单**：不需要 Functions 包装，直接运行 Flask
4. **无使用限制**：免费计划也有合理的配额

## 部署步骤

### 1. 准备部署文件

需要创建以下文件：

#### `Procfile`（告诉 Render 如何启动应用）
```
web: python app.py
```

#### `runtime.txt`（已存在）
```
3.11
```

#### `requirements.txt`（已存在）
```
Flask==3.0.0
flask-cors==4.0.0
numpy>=1.24.0,<1.26.0
scipy==1.10.1
pandas==1.5.3
openpyxl==3.1.2
```

### 2. 修改 app.py（适配 Render）

需要修改 `app.py`，使其在 Render 上正确运行。

### 3. 在 Render 上创建服务

1. 注册 [Render](https://render.com)
2. 连接 GitHub 仓库
3. 选择 "New Web Service"
4. 选择你的仓库
5. 配置：
   - **Name**: `mic-tester-web`
   - **Environment**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `python app.py`
6. 点击 "Create Web Service"

### 4. 环境变量（可选）

如果需要，可以在 Render Dashboard 中设置环境变量。

## 优势

- ✅ 不需要 Functions 包装
- ✅ 直接运行 Flask 应用
- ✅ 更简单的配置
- ✅ 更好的 Python 支持
- ✅ 免费计划可用

## 注意事项

- Render 免费计划在 15 分钟无活动后会休眠
- 首次访问可能需要几秒唤醒时间
- 如果需要 24/7 运行，需要付费计划

