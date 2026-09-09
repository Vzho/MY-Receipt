# ResitAI 客户安装常见问题

## 1. `git is not recognized`

如果客户使用源码 ZIP，可以忽略 Git。

如果需要从 GitHub 拉代码，安装 Git：

```powershell
winget install Git.Git
```

然后关闭 PowerShell，重新打开。

官方下载：

```text
https://git-scm.com/install/windows
```

## 2. `node is not recognized`

安装 Node.js LTS：

```powershell
winget install OpenJS.NodeJS.LTS
```

然后关闭 PowerShell，重新打开。

官方下载：

```text
https://nodejs.org/en/download
```

## 3. `npm is not recognized`

npm 跟 Node.js 一起安装。

先安装 Node.js LTS：

```powershell
winget install OpenJS.NodeJS.LTS
```

然后关闭 PowerShell，重新打开。

## 4. `supabase is not recognized`

安装 Supabase CLI：

```powershell
winget install Supabase.CLI
```

然后关闭 PowerShell，重新打开。

官方文档：

```text
https://supabase.com/docs/reference/cli/introduction
```

## 5. `supabase login` 没有弹浏览器

先确认网络能打开：

```text
https://supabase.com/dashboard
```

然后重新执行：

```powershell
supabase login
```

## 6. `Project URL` 填错

正确：

```text
https://项目ref.supabase.co
```

错误：

```text
https://项目ref.supabase.co/rest/v1/
```

## 7. `Missing OPENAI_API_KEY`

说明 OpenAI API Key 没写进 Supabase Secrets。

重新执行：

```powershell
supabase secrets set OPENAI_API_KEY=你的OpenAIKey
supabase functions deploy parse-receipt
```

## 8. 上传失败

按顺序检查：

```powershell
supabase functions list
supabase secrets list
supabase db query --linked --file docs/SUPABASE_SCHEMA.sql
```

然后重新部署函数：

```powershell
supabase functions deploy parse-receipt
```

## 9. Cloudflare 页面提示缺少 Supabase 配置

在 Cloudflare Pages 项目的环境变量中添加：

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

然后重新部署 Cloudflare Pages。

## 10. OpenAI 解析超时

调高超时时间：

```powershell
supabase secrets set VISION_FETCH_TIMEOUT_MS=120000
supabase functions deploy parse-receipt
```

## 11. npm install 很慢

可以先重试：

```powershell
npm install
```

如果公司网络限制 npm，需要切换网络或代理。

## 12. 客户不想安装任何命令行工具

建议改成托管 SaaS 交付：

- 服务商维护 Cloudflare。
- 服务商维护 Supabase。
- 服务商维护 OpenAI API Key。
- 客户只登录系统使用。
