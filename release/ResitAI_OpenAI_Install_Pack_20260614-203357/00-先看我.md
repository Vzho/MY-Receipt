# ResitAI 客户安装资料包 - 先看我

这个资料包用于安装 ResitAI OpenAI-only 版本。

## 资料包内容

| 文件 | 用途 |
| --- | --- |
| `00-先看我.md` | 客户收到资料包后先打开这个文件。 |
| `01-OpenAI-only客户安装部署手册.md` | 完整安装步骤，按顺序执行。 |
| `02-客户安装信息表.md` | 安装前需要准备/复制的信息。 |
| `03-常见问题.md` | 安装失败时先查这里。 |
| `scripts/check-openai-only-prerequisites.ps1` | 安装前检查电脑缺什么工具。 |
| `scripts/install-openai-only.ps1` | OpenAI-only 一键安装脚本。 |

## 客户需要准备的账号

- GitHub：https://github.com/signup
- Supabase：https://supabase.com/dashboard
- OpenAI Platform：https://platform.openai.com/
- Cloudflare：https://dash.cloudflare.com/

## 客户需要准备的本机工具

- Node.js LTS：https://nodejs.org/en/download
- Supabase CLI：https://supabase.com/docs/reference/cli/introduction
- Git for Windows：https://git-scm.com/install/windows

Git 是可选项。  
如果客户使用源码 ZIP 包，不需要安装 Git。

## 最短安装路径

1. 注册/登录账号。
2. 打开 `01-OpenAI-only客户安装部署手册.md`。
3. 按文档复制 Supabase Project ref、Project URL、Publishable key。
4. 创建 OpenAI API Key。
5. 在 ResitAI 项目根目录运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check-openai-only-prerequisites.ps1
npm run install:openai-only
```

## 不要让客户写进文档或发到群里的内容

- OpenAI API Key
- Supabase Secret key
- Supabase service_role key
- Cloudflare API Token
- GitHub Token
- `.env.local`

这些只在安装时现场输入，或只保存在对应平台的 Secret/环境变量中。
