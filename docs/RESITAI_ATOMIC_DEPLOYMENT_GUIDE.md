# ResitAI 零基础系统部署手册

这份文档是给“没有部署经验的人”使用的。请不要跳步骤。每做完一步，都按“验收”检查一次。

ResitAI 的部署结构很简单：

```text
用户浏览器
  ↓
Cloudflare Pages 静态前端
  ↓
Supabase
  ├─ Auth 登录
  ├─ Postgres 数据库
  ├─ Storage 发票图片
  └─ Edge Function parse-receipt 调用 OCR / AI
```

系统不需要传统服务器，不需要购买 VPS，不需要自己维护后台管理服务器。

---

## 0. 先看懂要部署哪些东西

你需要部署 2 个部分：

| 部分 | 用什么部署 | 作用 |
| --- | --- | --- |
| 前端页面 | Cloudflare Pages | 用户打开的网站 |
| 后端能力 | Supabase | 登录、数据库、图片存储、OCR/AI 函数 |

你需要准备 5 类账号或密钥：

| 名称 | 是否必须 | 用途 |
| --- | --- | --- |
| GitHub 账号 | 必须 | 存代码，Cloudflare 从这里拉代码部署 |
| Cloudflare 账号 | 必须 | 部署前端 |
| Supabase 账号 | 必须 | 部署数据库、登录、Storage、Edge Function |
| Tencent Cloud OCR 密钥 | 必须 | 基础 OCR 识别 |
| DashScope / Qwen API Key | 必须 | 智能视觉解析 |
| DeepSeek API Key | 建议必须 | OCR 文本结构修复、金额校验修复 |

不要把 OCR / AI 密钥放到前端。前端只能放：

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

---

## 1. 部署信息记录表

部署过程中会拿到很多 URL 和 key。请先复制这个表，边部署边填写。

```text
GitHub 仓库地址：
部署分支：

Supabase Project Name：
Supabase Project Ref：
Supabase Project URL：
Supabase anon public key：

Cloudflare Pages 项目名：
Cloudflare Pages 预览地址：
Cloudflare Pages 正式地址：
自定义域名：

Tencent Secret ID：
Tencent Secret Key：

DashScope API Key：
Qwen 模型名：

DeepSeek API Key：
DeepSeek 模型名：

部署日期：
部署人：
Git commit：
```

注意：

```text
这张表如果要发给别人，不要包含 Secret Key / API Key 明文。
```

---

## 2. 在电脑上准备工具

以下步骤默认你使用 Windows + PowerShell。

### 2.1 打开 PowerShell

操作：

1. 按 Windows 键。
2. 搜索 `PowerShell`。
3. 点击打开。

验收：

```powershell
pwd
```

预期：能看到当前目录。

---

### 2.2 安装 Git

Git 用来下载代码、切换分支、提交代码。

检查是否已经安装：

```powershell
git --version
```

如果显示类似下面内容，说明已安装：

```text
git version 2.x.x
```

如果提示找不到命令：

1. 打开浏览器。
2. 搜索 `Git for Windows`。
3. 下载并安装。
4. 安装完成后关闭 PowerShell。
5. 重新打开 PowerShell。
6. 再执行：

```powershell
git --version
```

---

### 2.3 安装 Node.js

Node.js 用来构建前端。

检查是否已经安装：

```powershell
node -v
npm -v
```

预期：

```text
node 建议是 v20 或 v22
npm 能正常输出版本号
```

如果没有安装：

1. 打开浏览器。
2. 搜索 `Node.js LTS download`。
3. 下载 LTS 版本。
4. 安装时一路默认即可。
5. 安装完成后重新打开 PowerShell。
6. 再执行：

```powershell
node -v
npm -v
```

---

### 2.4 安装 Supabase CLI

Supabase CLI 用来部署 Edge Function 和管理 Supabase 项目。

检查是否已安装：

```powershell
supabase --version
```

如果显示版本号，说明已安装。

如果没有安装，可以用官方方式安装。安装完成后重新打开 PowerShell，再检查：

```powershell
supabase --version
```

验收：

```text
能看到 Supabase CLI 版本号
```

---

## 3. 下载 ResitAI 代码

### 3.1 选择项目目录

建议把项目放到桌面：

```powershell
cd C:\Users\VZ\Desktop
```

如果你的用户名不是 `VZ`，路径要换成自己的用户名。

---

### 3.2 克隆 GitHub 仓库

把 `<your-github-repo-url>` 换成真实 GitHub 仓库地址。

```powershell
git clone <your-github-repo-url> malaixiya
cd malaixiya
```

验收：

```powershell
dir
```

预期能看到：

```text
package.json
src
docs
supabase
```

---

### 3.3 切换部署分支

如果部署分支是 `codex-receipt-smart-parse-flow`：

```powershell
git checkout codex-receipt-smart-parse-flow
```

如果部署分支是 `main`：

```powershell
git checkout main
```

验收：

```powershell
git branch --show-current
```

预期：输出你要部署的分支名。

---

### 3.4 检查代码是否干净

```powershell
git status --short
```

预期：

```text
没有输出
```

如果有输出，说明本地有未提交改动。部署前要确认这些改动是否要一起部署。

---

## 4. 安装项目依赖并本地构建

### 4.1 安装依赖

在项目根目录执行：

```powershell
npm ci
```

如果 `npm ci` 报错，可以尝试：

```powershell
npm install
```

验收：

```powershell
Test-Path node_modules
```

预期：

```text
True
```

---

### 4.2 运行 TypeScript 检查

```powershell
npm run lint
```

预期：

```text
没有 TypeScript 报错
```

---

### 4.3 运行测试

```powershell
npm test -- --run
```

预期：

```text
所有测试通过
```

---

### 4.4 构建前端

```powershell
npm run build
```

验收：

```powershell
Test-Path dist
```

预期：

```text
True
```

如果 `dist` 存在，说明前端可以构建。

---

## 5. 创建 Supabase 项目

### 5.1 创建项目

操作：

1. 打开 Supabase Dashboard。
2. 点击 `New project`。
3. 填写项目名称，例如 `resitai-production`。
4. 设置数据库密码。
5. 选择区域，建议选择距离用户近的区域。
6. 点击创建。
7. 等待项目创建完成。

记录：

```text
Supabase Project Name：
Supabase Project Ref：
```

Project Ref 通常是一串小写字母，例如：

```text
ashivkbfutnodyglaqgj
```

---

### 5.2 找到 Supabase URL 和 anon key

操作：

1. 打开 Supabase 项目。
2. 进入 `Project Settings`。
3. 找到 `API`。
4. 复制 `Project URL`。
5. 复制 `anon public` key。

记录：

```text
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-public-key>
```

注意：

```text
anon key 可以放前端。
service_role key 不可以放前端。
```

---

### 5.3 本地登录 Supabase

在 PowerShell 中执行：

```powershell
supabase login
```

它会打开浏览器让你登录 Supabase。

验收：

```text
命令行显示登录成功
```

---

### 5.4 关联本地项目到 Supabase

把 `<project-ref>` 换成你自己的 Supabase Project Ref。

```powershell
supabase link --project-ref <project-ref>
```

验收：

```powershell
Get-Content .\supabase\.temp\project-ref
```

预期：输出你的 Project Ref。

---

## 6. 配置 Supabase Auth 登录

ResitAI 支持：

- 匿名试用。
- 邮箱 Magic Link 登录。

### 6.1 启用匿名登录

操作：

1. 打开 Supabase 项目。
2. 进入 `Authentication`。
3. 找到 `Providers`。
4. 找到 `Anonymous`。
5. 打开 Anonymous sign-ins。
6. 保存。

验收：

```text
前端点击“匿名试用”时可以进入系统
```

---

### 6.2 启用邮箱登录

操作：

1. 进入 `Authentication`。
2. 找到 `Providers`。
3. 找到 `Email`。
4. 确认 Email provider 已启用。
5. 确认 Magic Link / OTP 可以使用。
6. 保存。

验收：

```text
输入邮箱后可以收到登录链接
```

---

### 6.3 配置登录回跳地址

如果不配置，邮箱登录后可能跳到错误页面。

操作：

1. 进入 `Authentication`。
2. 找到 `URL Configuration`。
3. Site URL 填生产地址，例如：

```text
https://your-project.pages.dev
```

4. Redirect URLs 添加这些地址：

```text
http://127.0.0.1:5173
http://localhost:5173
https://your-project.pages.dev
https://your-custom-domain.com
```

验收：

```text
Magic Link 登录后能回到 ResitAI 页面
```

---

## 7. 初始化数据库和 Storage

这里分两种情况：

- 新 Supabase 项目：执行完整 schema。
- 已有旧 Supabase 项目：按增量 SQL 升级。

如果你不确定，按“新 Supabase 项目”处理。

---

### 7.1 新项目：执行完整 Schema

目标：一次性创建所有表、索引、RLS、Storage bucket、Storage policy、RPC。

文件：

```text
docs/SUPABASE_SCHEMA.sql
```

操作：

1. 打开 Supabase Dashboard。
2. 进入 `SQL Editor`。
3. 点击 `New query`。
4. 回到本地项目，打开 `docs/SUPABASE_SCHEMA.sql`。
5. 复制全部内容。
6. 粘贴到 Supabase SQL Editor。
7. 点击 `Run`。
8. 等待执行完成。

如果 SQL Editor 提示成功，继续下一步。

验收 SQL：

```sql
select to_regclass('public.receipts') as receipts;
select to_regclass('public.receipt_items') as receipt_items;
select to_regclass('public.ocr_usage_monthly') as ocr_usage_monthly;
select to_regclass('public.custom_document_types') as custom_document_types;
select to_regclass('public.user_field_preferences') as user_field_preferences;
select to_regclass('public.receipt_field_changes') as receipt_field_changes;
select id, public from storage.buckets where id = 'receipts';
```

预期：

```text
表都不是 null
bucket id = receipts
public = false
```

---

### 7.2 旧项目：执行增量 SQL

如果数据库不是空的，不要直接覆盖。按顺序执行以下文件。

执行顺序：

```text
1. docs/ADD_IMAGE_PREPROCESSING.sql
2. docs/ADD_TENCENT_OCR_QUOTA.sql
3. docs/ADD_RESITAI_V0_3_FIELDS.sql
4. docs/ADD_RESITAI_PHASE4_DATA_AUDIT.sql
5. docs/ADD_RESITAI_PHASE5_AUTOMATION_INTEGRATION.sql
6. docs/ADD_OCR_USAGE_MONTHLY_LIMIT.sql
7. docs/REMOVE_RESITAI_WEBHOOK_INTEGRATION.sql
```

每个文件执行方法一样：

1. 打开本地文件。
2. 复制全部 SQL。
3. 粘贴到 Supabase SQL Editor。
4. 点击 `Run`。
5. 成功后再执行下一个。

验收 SQL：

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'receipts'
  and column_name in (
    'processed_file_path',
    'image_processing',
    'deleted_at',
    'deleted_reason',
    'deleted_note',
    'duplicate_of',
    'duplicate_score',
    'warnings',
    'processing_stage',
    'custom_doc_type',
    'file_hash',
    'extra_fields',
    'parser_profile',
    'currency',
    'tax_breakdown',
    'address_structured',
    'auto_synced',
    'auto_sync_rule_name'
  )
order by column_name;
```

预期：能看到这些列。

---

## 8. 检查数据库权限

这一步很重要。ResitAI 用 anon key 在前端访问 Supabase，所以必须依赖 RLS 保护数据。

### 8.1 检查 RLS 是否开启

在 SQL Editor 执行：

```sql
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'receipts',
    'receipt_items',
    'ocr_usage_monthly',
    'custom_document_types',
    'user_field_preferences',
    'receipt_field_changes'
  )
order by tablename;
```

预期：

```text
rowsecurity 全部是 true
```

如果有 false，说明 RLS 没开，不能上线。

---

### 8.2 检查 Storage bucket

在 SQL Editor 执行：

```sql
select id, name, public
from storage.buckets
where id = 'receipts';
```

预期：

```text
id = receipts
public = false
```

如果没有结果，说明 bucket 没创建成功。

如果 `public = true`，说明 bucket 是公开的，不符合要求。

---

### 8.3 检查 Storage Policy

在 SQL Editor 执行：

```sql
select policyname, cmd
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname ilike '%receipt%';
```

预期至少能看到：

```text
Users can read own receipt files
Users can upload own receipt files
Users can update own receipt files
Users can delete own receipt files
```

---

## 9. 配置 Supabase Edge Function 密钥

所有 OCR / AI 密钥必须放到 Supabase Secrets，不能放到 Cloudflare，不能放到 `.env.local`。

---

### 9.1 配置腾讯云 OCR

用途：基础 OCR 识别。

在 PowerShell 中执行：

```powershell
supabase secrets set OCR_PROVIDER=tencent
supabase secrets set TENCENT_SECRET_ID="<your-tencent-secret-id>"
supabase secrets set TENCENT_SECRET_KEY="<your-tencent-secret-key>"
supabase secrets set TENCENT_OCR_REGION=ap-guangzhou
supabase secrets set TENCENT_OCR_ACTION=GeneralBasicOCR
supabase secrets set TENCENT_OCR_LANGUAGE=may
supabase secrets set OCR_FREE_MONTHLY_LIMIT=900
```

说明：

```text
TENCENT_SECRET_ID 和 TENCENT_SECRET_KEY 从腾讯云控制台获取。
OCR_FREE_MONTHLY_LIMIT=900 表示系统内部每用户每月最多扣 900 次。
```

验收：

```powershell
supabase secrets list
```

预期：

```text
能看到 OCR_PROVIDER、TENCENT_SECRET_ID、TENCENT_SECRET_KEY 等名称。
不会显示密钥明文。
```

---

### 9.2 配置 DeepSeek

用途：修复 OCR 文本结构、辅助金额校验。

```powershell
supabase secrets set AI_REPAIR_PROVIDER=deepseek
supabase secrets set VISION_REPAIR_PROVIDER=deepseek
supabase secrets set DEEPSEEK_API_KEY="<your-deepseek-api-key>"
supabase secrets set DEEPSEEK_BASE_URL=https://api.deepseek.com
supabase secrets set DEEPSEEK_MODEL=deepseek-v4-flash
supabase secrets set DEEPSEEK_MONTHLY_LIMIT=500
```

说明：

```text
DeepSeek 不直接接收图片。
它主要接收 OCR 文本和结构化 JSON，做修复和校验。
```

---

### 9.3 配置 Qwen Vision

用途：智能解析、视觉重解析。

```powershell
supabase secrets set VISION_PROVIDER=qwen
supabase secrets set DASHSCOPE_API_KEY="<your-dashscope-api-key>"
supabase secrets set QWEN_BASE_URL=https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
supabase secrets set QWEN_VL_MODEL=qwen3.6-plus
supabase secrets set VISION_MONTHLY_LIMIT=100
supabase secrets set VISION_FETCH_TIMEOUT_MS=90000
supabase secrets set QWEN_FETCH_RETRIES=0
```

说明：

```text
VISION_FETCH_TIMEOUT_MS=90000 表示视觉模型最多等 90 秒。
QWEN_FETCH_RETRIES=0 表示超时后不自动重复调用，避免重复消耗。
```

---

### 9.4 配置 CORS

本地调试阶段：

```powershell
supabase secrets set CORS_ORIGIN="http://127.0.0.1:5173"
```

生产上线阶段：

```powershell
supabase secrets set CORS_ORIGIN="https://<your-cloudflare-pages-domain>"
```

如果你有自定义域名：

```powershell
supabase secrets set CORS_ORIGIN="https://<your-custom-domain.com>"
```

注意：

```text
CORS_ORIGIN 改完后要重新部署 parse-receipt。
```

---

### 9.5 不要手动配置这些东西

不要设置：

```text
SUPABASE_SERVICE_ROLE_KEY
```

原因：

```text
Supabase Edge Runtime 会自动提供 service role key。
手动创建 SUPABASE_ 前缀 secret 容易引起混淆。
```

---

## 10. 部署 Edge Function

### 10.1 部署 parse-receipt

在项目根目录执行：

```powershell
supabase functions deploy parse-receipt
```

验收：

```powershell
supabase functions list
```

预期能看到：

```text
parse-receipt
```

---

### 10.2 不要部署这些函数

当前系统不需要部署：

```text
dispatch-webhook
import-receipts
```

原因：

```text
Webhook / 企业集成 / 失败重放 当前已从业务范围中移除。
部署它们会让 Supabase Dashboard 出现不必要的函数。
```

---

### 10.3 查看函数日志

如果 OCR 或智能解析失败，先看日志。

操作：

1. 打开 Supabase Dashboard。
2. 进入 `Edge Functions`。
3. 点击 `parse-receipt`。
4. 查看 Logs。

常见日志：

```text
External OCR/AI request timed out
Tencent OCR quota exceeded
Receipt not found
Unauthorized
```

---

## 11. 本地前端配置和测试

### 11.1 创建 `.env.local`

在项目根目录执行：

```powershell
Copy-Item .env.example .env.local
```

打开 `.env.local`，只填写这两个：

```text
VITE_SUPABASE_URL="https://<project-ref>.supabase.co"
VITE_SUPABASE_ANON_KEY="<your-anon-key>"
```

删除或保留注释都可以，但不要填 OCR / AI 密钥。

---

### 11.2 检查 `.env.local` 是否安全

执行：

```powershell
Select-String -Path .env.local -Pattern "TENCENT|DASHSCOPE|DEEPSEEK|OPENAI|SERVICE_ROLE"
```

预期：

```text
没有输出
```

如果有输出，说明你把后端密钥放进前端环境了。必须删除。

---

### 11.3 启动本地前端

```powershell
npm run dev
```

预期输出类似：

```text
Local: http://127.0.0.1:5173/
```

如果 5173 被占用，Vite 会自动换端口，例如：

```text
http://127.0.0.1:5174/
http://127.0.0.1:5175/
```

浏览器打开实际输出的地址。

---

### 11.4 处理“缺少 Supabase 配置”

如果页面显示：

```text
缺少 Supabase 配置
```

检查：

```powershell
Get-Content .env.local
```

确认存在：

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

修改 `.env.local` 后需要停止 dev server，再重新运行：

```powershell
npm run dev
```

---

## 12. 本地完整 Smoke Test

按顺序做，不要跳。

### 12.1 登录测试

步骤：

1. 打开本地 URL。
2. 点击 `匿名试用`。
3. 等待进入系统。

成功标准：

```text
进入审核队列页面
没有“缺少 Supabase 配置”
浏览器控制台没有 auth 报错
```

---

### 12.2 JPG / PNG 上传测试

步骤：

1. 准备一张清晰收据图片。
2. 拖入上传区域，或点击上传。
3. 等待队列出现。
4. 等待列表出现新单据。

成功标准：

```text
列表出现新记录
状态不应该一直停在失败
Supabase Storage 里能看到文件
```

Storage 路径应类似：

```text
receipts/{user_id}/{receipt_id}/original.ext
```

---

### 12.3 PDF 上传测试

步骤：

1. 上传一个 PDF 发票。
2. 如果弹出处理方式，选择：
   - 按页分别识别，或
   - 合并为一张发票。
3. 等待队列更新。

成功标准：

```text
PDF 被渲染成图片
列表出现对应记录
```

---

### 12.4 Ctrl+V 图片粘贴上传测试

步骤：

1. 用截图工具截一张发票。
2. 复制到剪贴板。
3. 回到 ResitAI 页面。
4. 按 Ctrl+V。

成功标准：

```text
图片进入上传队列
没有打开新的标签页
没有把 txt / doc / 非图片文件当成上传内容
```

---

### 12.5 OCR 自动识别测试

步骤：

1. 上传一张清晰图片。
2. 等待 OCR 阶段。
3. 打开详情页。

成功标准：

```text
能看到 OCR 原文或解析说明
商户名、金额、日期等字段有提取结果或明确失败原因
```

---

### 12.6 智能解析测试

步骤：

1. 打开一张单据详情。
2. 点击智能解析。
3. 如果弹出裁剪窗口，确认裁剪。
4. 等待 Qwen / DeepSeek 处理。

成功标准：

```text
详情页不会自动关闭
解析完成后当前页面字段更新
如果失败，会显示明确失败原因
```

---

### 12.7 Rejected 测试

步骤：

1. 删除一张测试单据。
2. 选择删除原因。
3. 进入 Rejected。
4. 恢复这张单据。

成功标准：

```text
删除后主列表消失
Rejected 里可见
恢复后回到主列表
```

---

### 12.8 Excel 导出测试

步骤：

1. 准备至少一张已解析单据。
2. 点击导出 Excel。
3. 确认导出预览。
4. 下载 XLSX。

成功标准：

```text
Receipts sheet：一张发票一行
Items sheet：一条明细一行
金额列可求和
```

---

## 13. 部署到 Cloudflare Pages

### 13.1 确认代码已推送到 GitHub

在本地执行：

```powershell
git status --short
git log --oneline -1
```

如果有未提交改动，需要先提交：

```powershell
git add .
git commit -m "deploy: prepare ResitAI release"
git push origin <deploy-branch>
```

如果没有改动，只要确认远程有这个分支。

---

### 13.2 创建 Cloudflare Pages 项目

操作：

1. 打开 Cloudflare Dashboard。
2. 进入 `Workers & Pages`。
3. 点击 `Create application`。
4. 选择 `Pages`。
5. 选择 `Connect to Git`。
6. 连接 GitHub。
7. 选择 ResitAI 仓库。
8. 选择部署分支。

---

### 13.3 设置构建参数

Cloudflare Pages 中填写：

| 配置项 | 填写 |
| --- | --- |
| Framework preset | Vite |
| Build command | `npm ci && npm run build` |
| Build output directory | `dist` |
| Root directory | 留空 |

如果 Cloudflare 需要 Node 版本，设置环境变量：

```text
NODE_VERSION=22
```

如果 Node 22 构建有问题，可以改成：

```text
NODE_VERSION=20
```

---

### 13.4 设置 Cloudflare 前端环境变量

在 Cloudflare Pages 的 Environment variables 中添加：

```text
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

只添加这两个。

不要添加：

```text
TENCENT_SECRET_ID
TENCENT_SECRET_KEY
DASHSCOPE_API_KEY
DEEPSEEK_API_KEY
OPENAI_API_KEY
SUPABASE_SERVICE_ROLE_KEY
```

---

### 13.5 触发第一次部署

操作：

1. 点击 `Save and Deploy`。
2. 等待构建完成。
3. 打开 Cloudflare 给你的 Pages URL。

成功标准：

```text
页面能打开
不会显示“缺少 Supabase 配置”
能看到登录页
```

---

## 14. 上线后回填配置

### 14.1 回填 Supabase Auth URL

拿到 Cloudflare Pages URL 后，回到 Supabase。

操作：

1. Supabase Dashboard。
2. Authentication。
3. URL Configuration。
4. Site URL 改为 Cloudflare Pages 生产 URL。
5. Redirect URLs 添加 Cloudflare Pages URL。
6. 如果有自定义域名，也添加自定义域名。

示例：

```text
https://resitai.pages.dev
https://app.your-domain.com
```

---

### 14.2 回填 Edge Function CORS

把 CORS 改成生产 URL。

```powershell
supabase secrets set CORS_ORIGIN="https://<your-cloudflare-pages-domain>"
supabase functions deploy parse-receipt
```

如果有自定义域名：

```powershell
supabase secrets set CORS_ORIGIN="https://<your-custom-domain.com>"
supabase functions deploy parse-receipt
```

---

## 15. 生产环境 Smoke Test

用 Cloudflare Pages URL 做一遍完整测试。

### 15.1 登录

```text
打开生产 URL
点击匿名试用
确认进入系统
```

### 15.2 上传图片

```text
上传 JPG / PNG
确认队列出现
确认列表出现
```

### 15.3 上传 PDF

```text
上传 PDF
确认按页或合并逻辑出现
确认列表出现
```

### 15.4 智能解析

```text
打开详情页
点击智能解析
等待结果
确认页面不自动关闭
```

### 15.5 删除和恢复

```text
删除测试单据
进入 Rejected
恢复测试单据
```

### 15.6 Excel 导出

```text
点击导出
下载 XLSX
打开检查 Receipts / Items sheet
```

---

## 16. 检查 Supabase Advisors

上线后检查 Supabase 提示。

操作：

1. 打开 Supabase Dashboard。
2. 进入 Database。
3. 找到 Advisors。
4. 查看 Security 和 Performance。

也可以用 CLI：

```powershell
supabase db lint --linked
```

重点关注：

```text
RLS 是否开启
Storage policy 是否合理
Function search_path 是否固定
是否有高危 security 提示
```

说明：

```text
auth_leaked_password_protection 是 Auth 安全建议。
不影响系统主流程运行，但生产项目建议后续开启。
```

---

## 17. 常见问题排查

### 17.1 页面显示“缺少 Supabase 配置”

原因：

```text
没有配置 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
或者变量名写错
或者 Cloudflare 改变量后没有重新部署
```

处理：

1. 检查 Cloudflare Pages 环境变量。
2. 确认变量名以 `VITE_` 开头。
3. 重新部署 Cloudflare Pages。

---

### 17.2 匿名试用失败

原因：

```text
Supabase 没启用 Anonymous sign-ins
```

处理：

```text
Supabase Dashboard -> Authentication -> Providers -> Anonymous -> Enable
```

---

### 17.3 邮箱登录后跳错页面

原因：

```text
Supabase Auth URL Configuration 没添加当前域名
```

处理：

```text
把 Cloudflare Pages URL 添加到 Site URL 和 Redirect URLs
```

---

### 17.4 上传失败

可能原因：

```text
Storage bucket receipts 不存在
bucket 是 public
Storage policy 没创建
用户没有登录
文件类型不是 JPEG / PNG / PDF
```

检查：

```sql
select id, public from storage.buckets where id = 'receipts';
```

---

### 17.5 拖入 txt 文件后浏览器打开 txt

原因：

```text
浏览器默认行为没有被前端阻止，或者部署版本不是最新修复版本。
```

处理：

```text
确认部署 commit 包含 prevent unsupported file drop navigation 修复。
重新部署前端。
```

---

### 17.6 OCR 失败

可能原因：

```text
parse-receipt 没部署
Tencent secret 没设置
OCR quota 超限
Edge Function CORS 不对
Storage 文件读不到
```

检查：

```powershell
supabase functions list
supabase secrets list
```

再看 Supabase Dashboard 的 Edge Function Logs。

---

### 17.7 Qwen 智能解析超时

原因：

```text
视觉大模型处理时间超过默认 timeout。
```

处理：

```powershell
supabase secrets set VISION_FETCH_TIMEOUT_MS=90000
supabase secrets set QWEN_FETCH_RETRIES=0
supabase functions deploy parse-receipt
```

---

### 17.8 OCR 用量显示不准

可能原因：

```text
ocr_usage_monthly.monthly_limit 没迁移
consume_ocr_quota 还是旧版本
```

处理：

```text
执行 docs/ADD_OCR_USAGE_MONTHLY_LIMIT.sql
重新部署 parse-receipt
```

---

### 17.9 Excel 导出没有数据

可能原因：

```text
当前筛选条件下没有单据
字段配置把导出列取消了
单据还在 Rejected
```

处理：

```text
清空筛选条件
检查字段配置
恢复 Rejected 单据后再导出
```

---

## 18. 回滚方法

### 18.1 回滚前端

适用情况：

```text
页面显示异常
上传按钮坏了
列表显示错误
但数据库和函数没问题
```

操作：

1. 打开 Cloudflare Pages。
2. 进入 Deployments。
3. 找到上一个稳定部署。
4. 点击 Promote to production。

成功标准：

```text
生产 URL 回到旧版本
```

---

### 18.2 回滚 Edge Function

适用情况：

```text
OCR / AI 解析突然大面积失败
前端没有改动
```

操作：

```powershell
git checkout <stable-commit> -- supabase/functions/parse-receipt
supabase functions deploy parse-receipt
git checkout <deploy-branch> -- supabase/functions/parse-receipt
```

成功标准：

```text
重新上传测试收据，解析恢复
```

---

### 18.3 数据库不要轻易回滚

原则：

```text
不要随便 drop 表
不要随便 drop 字段
不要直接清空生产数据
```

优先顺序：

```text
先回滚前端
再回滚 Edge Function
最后才考虑数据库回滚
```

如果必须改数据库：

```text
先备份
先确认没有线上代码依赖
再执行 SQL
```

---

## 19. 最终上线检查清单

上线前逐项打勾。

### 19.1 本地检查

- [ ] `git status --short` 已确认。
- [ ] `npm ci` 成功。
- [ ] `npm run lint` 成功。
- [ ] `npm test -- --run` 成功。
- [ ] `npm run build` 成功。
- [ ] `.env.local` 只包含 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`。

### 19.2 Supabase 检查

- [ ] Supabase 项目已创建。
- [ ] 已记录 Project Ref。
- [ ] 已记录 Project URL。
- [ ] 已记录 anon public key。
- [ ] Anonymous sign-ins 已开启。
- [ ] Email Magic Link 已开启。
- [ ] Redirect URLs 已包含本地和生产域名。
- [ ] 完整 Schema 或增量 SQL 已执行。
- [ ] RLS 已开启。
- [ ] `receipts` bucket 存在。
- [ ] `receipts` bucket 是 private。
- [ ] Storage policy 已创建。
- [ ] `consume_ocr_quota` RPC 已创建。
- [ ] `ocr_usage_monthly.monthly_limit` 已存在。

### 19.3 Edge Function 检查

- [ ] Tencent OCR secrets 已设置。
- [ ] DeepSeek secrets 已设置。
- [ ] Qwen / DashScope secrets 已设置。
- [ ] `CORS_ORIGIN` 已设置。
- [ ] `parse-receipt` 已部署。
- [ ] `dispatch-webhook` 未部署，除非明确需要。
- [ ] `import-receipts` 未部署，除非明确需要。

### 19.4 Cloudflare 检查

- [ ] GitHub 仓库已连接。
- [ ] 部署分支正确。
- [ ] Build command 是 `npm ci && npm run build`。
- [ ] Output directory 是 `dist`。
- [ ] `VITE_SUPABASE_URL` 已设置。
- [ ] `VITE_SUPABASE_ANON_KEY` 已设置。
- [ ] 没有设置 OCR / AI / service role 密钥。
- [ ] 部署成功。

### 19.5 生产功能检查

- [ ] 生产 URL 可打开。
- [ ] 匿名试用可进入。
- [ ] Magic Link 可回跳。
- [ ] JPG / PNG 上传可用。
- [ ] PDF 上传可用。
- [ ] Ctrl+V 粘贴图片可用。
- [ ] OCR 识别可用。
- [ ] 智能解析可用。
- [ ] 详情页智能解析后不会自动关闭。
- [ ] Rejected 删除库可用。
- [ ] Excel 导出可用。
- [ ] Supabase Advisors 无高危安全问题。

---

## 20. 部署完成记录

部署完成后填写：

```text
部署日期：
部署人：
Git commit：
Git branch：

Supabase Project Ref：
Supabase URL：
Storage bucket：
Edge Function：

Cloudflare Pages URL：
自定义域名：

数据库部署方式：完整 Schema / 增量 SQL
本地测试结果：
生产测试结果：
Supabase Advisors 结果：

已知问题：
回滚 commit：
备注：
```

---

## 21. 给完全新手的执行顺序

如果你还是不知道从哪里开始，就按这个顺序做：

```text
1. 安装 Git
2. 安装 Node.js
3. 安装 Supabase CLI
4. 下载代码
5. npm ci
6. npm run lint
7. npm test -- --run
8. npm run build
9. 创建 Supabase 项目
10. 复制 Supabase URL 和 anon key
11. 开启 Anonymous 登录
12. 开启 Email 登录
13. 执行 docs/SUPABASE_SCHEMA.sql
14. 设置 Supabase secrets
15. 部署 parse-receipt
16. 创建 .env.local
17. 本地 npm run dev 测试
18. 推送代码到 GitHub
19. Cloudflare Pages 连接 GitHub
20. Cloudflare 设置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY
21. Cloudflare 部署
22. Supabase 回填生产 URL
23. 重新设置 CORS_ORIGIN 为生产 URL
24. 重新部署 parse-receipt
25. 做生产 Smoke Test
```

做到第 25 步，并且每个验收都通过，才算部署完成。
