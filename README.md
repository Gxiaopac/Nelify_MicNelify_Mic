# MicTester Netlify Web 版本

## 项目说明

`MicTester_Netlify_Web` 是基于 `MicTester_v2.10_Web` 改造的、适合部署到 **Netlify** 的 Web 版本：

- 前端：纯静态页面 `index.html` + `static/`（`style.css`、`app.js`）
- 后端：使用 Flask 的 API，被 `netlify/functions/api.py` 包装为 Netlify Function
- 配置文件：`netlify.toml`、`runtime.txt`、`requirements.txt`

## 目录结构

```text
MicTester_Netlify_Web/
├── app.py                 # Flask API（被 Netlify Function 调用）
├── index.html             # 单页前端（直接由 Netlify 静态托管）
├── netlify.toml           # Netlify 构建 & Redirect 配置
├── runtime.txt            # Python 运行时版本（3.11）
├── requirements.txt       # Python 依赖
├── netlify/
│   └── functions/
│       └── api.py         # Netlify Functions 包装器（入口：handler）
└── static/
    ├── app.js             # 前端逻辑（录音、调用 API、显示结果、导出）
    └── style.css          # 界面样式
```

## 在 Netlify 上部署

1. 将 `MicTester_Netlify_Web` 作为一个独立仓库推到 Git（例如 GitHub）
2. 在 Netlify 后台：
   - 选择 **Add new site → Import from Git**
   - 选择仓库
   - Build settings：
     - **Build command**: `pip install -r requirements.txt`
     - **Publish directory**: `.`
     - **Functions directory**: `netlify/functions`
3. 保存并触发构建

## 使用方式

部署完成后：

- 访问 Netlify 提供的 URL（例如 `https://xxx.netlify.app`）
- 浏览器端会：
  - 通过 `navigator.mediaDevices` 枚举本地麦克风
  - 录音并将音频数据发送到后端 API：`/api/analyze`
  - 显示测试结果、统计信息，并支持导出 Excel 报告

> 提示：首次使用时，需要在浏览器中允许站点访问麦克风。


