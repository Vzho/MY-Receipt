# ResitAI OpenAI-only 客户安装部署手册

这份文档给零基础客户使用。按顺序做即可。

目标：

- 客户只使用 OpenAI API。
- 不需要腾讯云 OCR。
- 不需要 Qwen / DashScope。
- 不需要 DeepSeek。
- 不需要传统服务器。
- 前端部署到 Cloudflare Pages。
- 后端使用 Supabase。

## 0. 最简单的理解

ResitAI 由三部分组成：

| 部分 | 用来做什么 | 客户需要做什么 |
| --- | --- | --- |
| Cloudflare Pages | 放网页 | 注册/登录 Cloudflare |
| Supabase | 登录、数据库、文件、后台函数 | 注册/登录 Supabase |
| OpenAI API | 发票图片识别 | 创建 OpenAI API Key |

ChatGPT Plus 账号不等于 OpenAI API Key。  
即使客户有 ChatGPT Plus，也仍然需要 OpenAI Platform 的 API Key。

## 1. 先准备账号

请先打开下面网址注册或登录。

| 平台 | 用途 | 网址 |
| --- | --- | --- |
| GitHub | 保存/下载代码 | https://github.com/signup |
| GitHub 登录 | 已有账号直接登录 | https://github.com/login |
| Supabase | 数据库、Storage、Edge Function | https://supabase.com/dashboard |
| OpenAI Platform | 创建 API Key | https://platform.openai.com/ |
| OpenAI API Key 页面 | 创建/管理 API Key | https://platform.openai.com/api-keys |
| Cloudflare | 部署网页 | https://dash.cloudflare.com/ |
| Cloudflare Pages | Pages 产品介绍 | https://pages.cloudflare.com/ |

## 2. 检查客户电脑有没有安装工具

打开 Windows PowerShell。

复制下面命令，按 Enter：

```powershell
git --version
node --version
npm --version
supabase --version
```

### 2.1 如果都能显示版本号

说明工具已经安装，可以继续下一步。

示例：

```text
git version 2.xx.x
v24.xx.x
10.xx.x
2.xx.x
```

### 2.2 如果提示 `not recognized`

说明对应工具没安装。

按下面命令安装。

```powershell
winget install Git.Git
winget install OpenJS.NodeJS.LTS
winget install Supabase.CLI
```

安装完成后：

1. 关闭 PowerShell。
2. 重新打开 PowerShell。
3. 再执行：

```powershell
git --version
node --version
npm --version
supabase --version
```

### 2.3 如果客户不想安装 Git

可以不安装 Git。

前提是客户拿到源码 ZIP 包，然后解压到电脑。

Git 只用于从 GitHub 拉代码。  
如果已经有 ZIP 源码，安装脚本不强制要求 Git。

### 2.4 官方下载链接

如果 `winget` 不可用，可以手动下载安装：

| 工具 | 下载地址 |
| --- | --- |
| Git for Windows | https://git-scm.com/install/windows |
| Node.js LTS | https://nodejs.org/en/download |
| Supabase CLI 文档 | https://supabase.com/docs/reference/cli/introduction |

## 3. 获取 ResitAI 源码

有两种方式，选一种即可。

### 方式 A：客户电脑已安装 Git

在 PowerShell 执行：

```powershell
cd C:\Users\Public
git clone <这里填写 ResitAI GitHub 仓库地址> resitai
cd C:\Users\Public\resitai
git checkout codex-receipt-smart-parse-flow
git pull
```

注意：

- `<这里填写 ResitAI GitHub 仓库地址>` 需要替换成真实仓库地址。
- 如果客户正式部署使用 `main` 分支，就把 `codex-receipt-smart-parse-flow` 改成 `main`。

### 方式 B：客户电脑没有 Git

1. 打开 GitHub 仓库页面。
2. 点击绿色 `Code` 按钮。
3. 点击 `Download ZIP`。
4. 解压 ZIP。
5. 进入解压后的项目目录。

例如解压到：

```text
C:\Users\Public\resitai
```

后面所有命令都要在这个项目根目录运行。

项目根目录应该能看到这些文件：

```text
package.json
vite.config.ts
src
docs
supabase
scripts
```

## 4. 登录 Supabase

在项目根目录打开 PowerShell，执行：

```powershell
supabase login
```

浏览器会打开 Supabase 登录页面。

完成登录后，回到 PowerShell。

## 5. 创建 Supabase 项目

1. 打开 https://supabase.com/dashboard
2. 点击 `New project`。
3. 填写项目名称，例如：

```text
resitai
```

4. 选择地区。
5. 设置数据库密码。
6. 点击创建。
7. 等项目创建完成。

## 6. 复制 Supabase 三个信息

进入 Supabase 项目后，打开：

```text
Project Settings -> API Keys
```

需要复制 3 个信息。

### 6.1 Project ref

如果项目 URL 是：

```text
https://wkopucjwjwpcrsqzenic.supabase.co
```

那么 Project ref 是：

```text
wkopucjwjwpcrsqzenic
```

也就是 `.supabase.co` 前面的那一段。

### 6.2 Project URL

正确格式：

```text
https://wkopucjwjwpcrsqzenic.supabase.co
```

不要复制成：

```text
https://wkopucjwjwpcrsqzenic.supabase.co/rest/v1/
```

如果复制错了，脚本会提示错误。

### 6.3 Publishable key

在 `API Keys` 页面复制：

```text
Publishable key
```

或者旧版页面里的：

```text
anon public key
```

不要复制：

```text
Secret key
service_role key
```

## 7. 创建 OpenAI API Key

1. 打开 https://platform.openai.com/
2. 登录。
3. 打开 https://platform.openai.com/api-keys
4. 点击创建 API Key。
5. 复制 key。

格式通常类似：

```text
sk-...
```

注意：

- API Key 只会在安装脚本里输入一次。
- 不要发到微信群、邮件正文或截图里。
- 如果忘记保存，只能重新创建一个新的 key。

## 8. 安装前一键检查

在项目根目录执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check-openai-only-prerequisites.ps1
```

如果看到：

```text
All required local tools are available.
```

就可以继续。

如果提示缺少工具，按提示安装后重新打开 PowerShell 再检查。

## 9. 一键安装 ResitAI

在项目根目录执行：

```powershell
npm run install:openai-only
```

如果 npm 命令不可用，也可以执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-openai-only.ps1
```

脚本会依次要求输入：

```text
Supabase project ref
Supabase Project URL
Supabase publishable/anon public key
OpenAI API key
```

脚本会自动完成：

1. 安装 npm 依赖。
2. 创建 `.env.local`。
3. 连接 Supabase 项目。
4. 初始化数据库表。
5. 创建私有 `receipts` Storage bucket。
6. 创建 Supabase RLS 权限。
7. 写入 OpenAI-only 后端密钥。
8. 部署 Supabase Edge Function `parse-receipt`。
9. 运行 `npm run lint`。
10. 运行 `npm test -- --run`。
11. 运行 `npm run build`。

## 10. 本地试运行

安装完成后，在项目根目录执行：

```powershell
npm run dev
```

看到类似：

```text
Local: http://127.0.0.1:5173/
```

打开这个地址。

如果 `5173` 被占用，Vite 可能会自动换成 `5174`、`5175`。  
以 PowerShell 里显示的 `Local:` 地址为准。

## 11. 部署到 Cloudflare Pages

有两种方式。

### 方式 A：脚本直接上传

先登录 Cloudflare Wrangler：

```powershell
npm exec -- wrangler login
```

浏览器打开后完成登录。

然后执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-openai-only.ps1 -DeployCloudflare -CloudflareProjectName resitai
```

脚本会构建并上传 `dist`。

### 方式 B：Cloudflare 网页后台部署

1. 打开 https://dash.cloudflare.com/
2. 进入 `Workers & Pages`。
3. 点击 `Create application`。
4. 选择 `Pages`。
5. 选择 `Connect to Git`。
6. 选择 ResitAI GitHub 仓库。
7. Build command 填：

```text
npm run build
```

8. Build output directory 填：

```text
dist
```

9. Environment variables 添加：

```text
VITE_SUPABASE_URL=https://客户项目.supabase.co
VITE_SUPABASE_ANON_KEY=客户 publishable key
```

10. 点击 Deploy。

## 12. 正式上线后收紧 CORS

安装阶段默认：

```text
CORS_ORIGIN=*
```

正式部署后建议改成 Cloudflare Pages 域名。

例如：

```powershell
supabase secrets set CORS_ORIGIN=https://resitai.pages.dev
supabase functions deploy parse-receipt
```

把 `https://resitai.pages.dev` 换成客户实际域名。

## 13. 安装完成后验收

打开部署后的 ResitAI 页面，检查：

1. 页面能打开。
2. 可以登录。
3. 可以上传 JPEG。
4. 可以上传 PNG。
5. 可以上传 PDF。
6. 上传后进入处理队列。
7. 普通解析可以生成待审核记录。
8. 点击智能解析可以继续使用 OpenAI Vision。
9. 本月处理用量里能看到 `OpenAI Vision`。
10. 审核详情页可以编辑字段。
11. 可以同步到云端。
12. 可以导出 Excel。
13. 删除后可以进入 Rejected 区域。

## 14. 常见问题

### 14.1 `supabase is not recognized`

说明 Supabase CLI 没装好，执行：

```powershell
winget install Supabase.CLI
```

然后关闭 PowerShell，重新打开。

### 14.2 `node is not recognized` 或 `npm is not recognized`

说明 Node.js 没装好。

执行：

```powershell
winget install OpenJS.NodeJS.LTS
```

然后关闭 PowerShell，重新打开。

### 14.3 `git is not recognized`

如果客户用 ZIP 源码，可以忽略。

如果要从 GitHub 拉代码，执行：

```powershell
winget install Git.Git
```

然后关闭 PowerShell，重新打开。

### 14.4 `Missing OPENAI_API_KEY`

说明 Supabase Edge Function Secrets 没写成功。

重新执行：

```powershell
supabase secrets set OPENAI_API_KEY=你的OpenAIKey
supabase functions deploy parse-receipt
```

### 14.5 OpenAI 超时

把超时时间调高：

```powershell
supabase secrets set VISION_FETCH_TIMEOUT_MS=120000
supabase functions deploy parse-receipt
```

### 14.6 页面提示缺少 Supabase 配置

检查 Cloudflare Pages 环境变量：

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

这两个变量必须配置在 Cloudflare Pages。

### 14.7 数据库表不存在

在项目根目录执行：

```powershell
supabase db query --linked --file docs/SUPABASE_SCHEMA.sql
```

### 14.8 上传失败

按顺序检查：

1. Supabase Storage 是否有 `receipts` bucket。
2. 用户是否已登录。
3. `.env.local` 是否有正确的 `VITE_SUPABASE_URL`。
4. `.env.local` 是否有正确的 `VITE_SUPABASE_ANON_KEY`。
5. Supabase Edge Function 是否已部署：

```powershell
supabase functions list
```

### 14.9 客户不想部署，只想直接使用

建议走托管 SaaS 模式：

- 服务商维护 Cloudflare、Supabase 和 OpenAI API Key。
- 客户只拿账号登录。
- 客户不接触命令行。
- 客户不接触 Supabase。
- 客户不接触 Cloudflare。

这是商业化交付最省心的方式。

## 15. 客户需要填写的信息表

交付前可以让客户填写：

```text
GitHub 账号邮箱：
Supabase 账号邮箱：
Cloudflare 账号邮箱：
OpenAI Platform 账号邮箱：

Supabase Project ref：
Supabase Project URL：
Supabase Publishable key：

Cloudflare Pages 项目名：
Cloudflare Pages 部署地址：

OpenAI API Key：不要写在文档里，安装时现场输入。
```
