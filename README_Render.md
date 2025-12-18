# Render 部署说明

## 问题背景

Netlify 免费计划有使用限制，站点可能被暂停。Render 是更适合 Flask 应用的替代方案。

## 快速部署步骤

### 1. 准备代码

确保以下文件存在：
- ✅ `Procfile` - 已创建
- ✅ `requirements.txt` - 已存在
- ✅ `runtime.txt` - 已存在（可选）
- ✅ `app.py` - 已修改为支持 Render

### 2. 在 Render 上部署

1. **注册 Render**：访问 https://render.com
2. **连接 GitHub**：授权 Render 访问你的仓库
3. **创建 Web Service**：
   - 点击 "New" → "Web Service"
   - 选择你的仓库（`MicTester_Netlify_Web`）
   - 配置如下：
     - **Name**: `mic-tester-web`（或你喜欢的名字）
     - **Environment**: `Python 3`
     - **Build Command**: `pip install -r requirements.txt`
     - **Start Command**: `python app.py`
     - **Plan**: `Free`（免费计划）
4. **点击 "Create Web Service"**

### 3. 等待部署

Render 会自动：
- 克隆代码
- 安装依赖
- 启动应用

### 4. 访问网站

部署完成后，Render 会提供一个 URL，例如：
```
https://mic-tester-web.onrender.com
```

## 优势

✅ **更适合 Flask**：不需要 Functions 包装  
✅ **更简单**：直接运行 `python app.py`  
✅ **免费可用**：免费计划适合测试  
✅ **自动部署**：Git push 后自动部署  

## 注意事项

⚠️ **免费计划限制**：
- 15 分钟无活动后会休眠
- 首次访问需要几秒唤醒时间
- 每月有使用时间限制

💡 **如果需要 24/7 运行**：需要升级到付费计划（$7/月起）

## 修改说明

已对代码进行以下修改以支持 Render：

1. **添加了 `Procfile`**：告诉 Render 如何启动应用
2. **修改了 `app.py`**：
   - 添加了 `/` 路由返回 `index.html`
   - 添加了启动代码，支持环境变量 `PORT`
3. **更新了 `requirements.txt`**：注释了 `serverless-wsgi`（Render 不需要）

## 前端 API 调用

Render 部署后，前端代码会自动使用正确的 API 路径（因为 `API_BASE` 会根据 hostname 自动判断）。

## 如果 Netlify 恢复

如果 Netlify 账户恢复，代码仍然可以在 Netlify 上工作（通过 Functions），也可以继续使用 Render。

