# Netlify 部署检查清单

## 当前问题
- `/.netlify/functions/test` 返回 404
- `/api/config` 返回 404
- 说明 Functions 没有部署

## 必须检查的事项

### 1. 确认站点连接的仓库

在 Netlify Dashboard 中：
1. 进入站点 `glistening-chaja-1f1f34`
2. 点击 **Site settings** → **Build & deploy** → **Build settings**
3. **告诉我**：
   - **Repository** 是什么？（应该连接到你的 GitHub 仓库）
   - **Base directory** 是什么？（应该是空的，或者指向 `MicTester_Netlify_Web`）
   - **Build command** 是什么？
   - **Publish directory** 是什么？

### 2. 确认文件在仓库中

在 GitHub 上检查你的仓库：
1. 打开仓库页面
2. 确认能看到 `functions/` 目录
3. 确认 `functions/api.py` 和 `functions/test.py` 存在
4. 确认 `netlify.toml` 存在且内容是：
   ```toml
   functions = "functions"
   ```

### 3. 检查最新部署

在 Netlify Dashboard 中：
1. 进入 **Deploys** 标签
2. 查看最新的部署日志
3. **告诉我**：
   - 是否看到 "Installing functions" 或类似消息？
   - 是否看到 "No Functions were found"？
   - 是否有任何 Python 相关的错误？

### 4. 手动触发重新部署

1. 在 Netlify Dashboard → **Deploys**
2. 点击 **"Trigger deploy"** → **"Deploy site"**
3. 或者点击 **"Clear cache and deploy site"**

### 5. 检查 Functions 列表

部署完成后：
1. 进入 **Functions** 标签
2. **告诉我**：是否能看到 `api` 和 `test` 函数？

## 可能的问题

### 问题 A：仓库连接错误
- **症状**：站点连接的仓库不是 `MicTester_Netlify_Web`
- **解决**：在 Netlify 中重新连接正确的仓库

### 问题 B：Base directory 设置错误
- **症状**：如果设置了 Base directory，Netlify 会在子目录中查找
- **解决**：确保 Base directory 为空，或者正确指向 `MicTester_Netlify_Web`

### 问题 C：文件未提交
- **症状**：本地有文件，但 GitHub 上没有
- **解决**：确保所有文件都已 `git add` 和 `git push`

### 问题 D：构建缓存问题
- **症状**：旧配置被缓存
- **解决**：使用 "Clear cache and deploy site"

## 快速验证

在终端运行（确认你在正确的仓库中）：
```bash
cd MicTester_Netlify_Web
git log --oneline -5    # 查看最近的提交
git ls-files functions/ # 确认文件在 Git 中
```

## 请提供的信息

1. **站点设置**：Repository、Base directory、Build command
2. **最新部署日志**：是否有 Functions 相关消息
3. **Functions 列表**：是否能看到函数

有了这些信息，我就能准确判断问题！

