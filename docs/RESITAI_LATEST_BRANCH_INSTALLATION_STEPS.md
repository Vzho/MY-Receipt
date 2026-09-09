# ResitAI 最新分支安装原子操作文档

本文用于指导客户安装 / 部署当前最新可用分支。

当前部署源：

```text
Git branch: codex-receipt-smart-parse-flow
Remote branch: origin/codex-receipt-smart-parse-flow
当前确认 commit: 19ca748
```

重要说明：

```text
客户安装必须从 GitHub 远程分支拉取。
不要直接使用开发者本机工作区里的未提交文件。
当前本机可能存在 UI demo、文档草稿、样例图片等未提交内容，不属于客户安装源。
```

---

## 0. 安装目标

最终客户应获得：

```text
1. 一个可访问的 ResitAI 网页地址
2. 一个客户自己的 Supabase 项目
3. 一个可用的 parse-receipt Edge Function
4. 可上传 JPG / PNG / PDF 发票
5. 可 OCR 识别
6. 可智能解析
7. 可进入 Rejected 库
8. 可导出 Excel
```

系统架构：

```text
Cloudflare Pages 前端
  ↓
Supabase Auth / Database / Storage / Edge Function
  ↓
Tencent OCR / Qwen VL / DeepSeek
```

不需要安装传统服务器。

---

## 1. 客户需要准备的账号和密钥

让客户先准备这些东西。

| 项目 | 必须 | 给谁用 |
| --- | --- | --- |
| GitHub 账号 | 是 | 存代码 |
| Cloudflare 账号 | 是 | 部署前端 |
| Supabase 账号 | 是 | 登录、数据库、Storage、Edge Function |
| Tencent Cloud OCR Secret ID | 是 | Supabase Edge Function |
| Tencent Cloud OCR Secret Key | 是 | Supabase Edge Function |
| DashScope API Key | 是 | Qwen 视觉解析 |
| DeepSeek API Key | 建议是 | OCR 文本修复和金额校验 |

客户不需要准备：

```text
VPS
宝塔面板
Nginx
PM2
传统后台服务器
```

---

## 2. 安装前填写信息表

安装人员先复制这张表，边部署边填写。

```text
客户名称：
部署日期：
部署人员：

GitHub 仓库 URL：
部署分支：codex-receipt-smart-parse-flow
部署 commit：19ca748

Supabase Project Name：
Supabase Project Ref：
Supabase Project URL：
Supabase anon public key：

Cloudflare Pages Project：
Cloudflare Pages URL：
正式访问域名：

Tencent Secret ID：
Tencent Secret Key：
DashScope API Key：
DeepSeek API Key：

本地 smoke test：通过 / 不通过
生产 smoke test：通过 / 不通过
备注：
```

注意：

```text
如果这张表要发给客户，不要包含 Secret Key 和 API Key 明文。
```

---

## 3. 安装人员电脑准备

以下命令在 Windows PowerShell 执行。

### 3.1 检查 Git

```powershell
git --version
```

成功标准：

```text
能输出 git version
```

失败处理：

```text
安装 Git for Windows
安装后重新打开 PowerShell
```

---

### 3.2 检查 Node.js

```powershell
node -v
npm -v
```

成功标准：

```text
node 建议 v20 或 v22
npm 能输出版本号
```

失败处理：

```text
安装 Node.js LTS
安装后重新打开 PowerShell
```

---

### 3.3 检查 Supabase CLI

```powershell
supabase --version
```

成功标准：

```text
能输出 Supabase CLI 版本
```

失败处理：

```text
安装 Supabase CLI
安装后重新打开 PowerShell
```

---

## 4. 从最新分支拉取代码

### 4.1 进入安装目录

示例安装到桌面：

```powershell
cd C:\Users\VZ\Desktop
```

如果不是这台电脑，改成实际目录。

---

### 4.2 克隆仓库

把 `<github-repo-url>` 替换成真实仓库地址。

```powershell
git clone <github-repo-url> resitai-client-install
cd resitai-client-install
```

成功标准：

```powershell
dir
```

能看到：

```text
package.json
src
docs
supabase
```

---

### 4.3 切换最新部署分支

```powershell
git fetch origin
git checkout codex-receipt-smart-parse-flow
git pull origin codex-receipt-smart-parse-flow
```

成功标准：

```powershell
git branch --show-current
git log --oneline -1
```

预期：

```text
分支 = codex-receipt-smart-parse-flow
最新 commit = 19ca748 或比 19ca748 更新
```

如果 commit 比 `19ca748` 旧：

```text
说明没有拉到最新代码，先检查 GitHub 分支是否推送成功。
```

---

### 4.4 确认工作区干净

```powershell
git status --short
```

成功标准：

```text
没有输出
```

如果有输出：

```text
不要继续安装。
先确认这些改动是不是客户需要部署的内容。
```

---

## 5. 本地构建检查

### 5.1 安装依赖

```powershell
npm ci
```

如果失败，再尝试：

```powershell
npm install
```

成功标准：

```powershell
Test-Path node_modules
```

预期：

```text
True
```

---

### 5.2 类型检查

```powershell
npm run lint
```

成功标准：

```text
没有 TypeScript 报错
```

---

### 5.3 测试

```powershell
npm test -- --run
```

成功标准：

```text
测试全部通过
```

---

### 5.4 构建

```powershell
npm run build
```

成功标准：

```powershell
Test-Path dist
```

预期：

```text
True
```

---

## 6. 创建客户 Supabase 项目

### 6.1 创建项目

操作：

```text
1. 打开 Supabase Dashboard
2. 点击 New project
3. 输入项目名，例如 resitai-client
4. 设置数据库密码
5. 选择区域
6. 点击 Create new project
7. 等待项目创建完成
```

记录：

```text
Project Ref
Project URL
anon public key
```

---

### 6.2 获取 Project URL 和 anon key

操作：

```text
1. 打开 Supabase 项目
2. Project Settings
3. API
4. 复制 Project URL
5. 复制 anon public key
```

格式类似：

```text
VITE_SUPABASE_URL=https://xxxxxxxxxxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

注意：

```text
只复制 anon public key。
不要复制 service_role key 到前端。
```

---

## 7. 配置 Supabase Auth

### 7.1 开启匿名登录

操作：

```text
1. Supabase Dashboard
2. Authentication
3. Providers
4. Anonymous
5. Enable
6. Save
```

成功标准：

```text
前端可以点击“匿名试用”进入系统
```

---

### 7.2 开启邮箱 Magic Link

操作：

```text
1. Authentication
2. Providers
3. Email
4. Enable Email provider
5. 确认 Magic Link / OTP 可用
6. Save
```

成功标准：

```text
输入邮箱后可以收到登录链接
```

---

### 7.3 配置 Redirect URL

先添加本地地址：

```text
http://127.0.0.1:5173
http://localhost:5173
```

等 Cloudflare 部署完成后，再回来添加生产地址：

```text
https://<客户-pages-url>
https://<客户正式域名>
```

操作路径：

```text
Authentication -> URL Configuration
```

---

## 8. 初始化数据库

### 8.1 新项目执行完整 Schema

文件：

```text
docs/SUPABASE_SCHEMA.sql
```

操作：

```text
1. 打开 Supabase Dashboard
2. SQL Editor
3. New query
4. 打开本地 docs/SUPABASE_SCHEMA.sql
5. 复制全部 SQL
6. 粘贴到 SQL Editor
7. 点击 Run
8. 等待成功
```

成功后检查：

```sql
select to_regclass('public.receipts') as receipts;
select to_regclass('public.receipt_items') as receipt_items;
select to_regclass('public.ocr_usage_monthly') as ocr_usage_monthly;
select to_regclass('public.custom_document_types') as custom_document_types;
select to_regclass('public.user_field_preferences') as user_field_preferences;
select to_regclass('public.receipt_field_changes') as receipt_field_changes;
select id, public from storage.buckets where id = 'receipts';
```

成功标准：

```text
所有表存在
receipts bucket 存在
public = false
```

---

### 8.2 如果是旧项目升级

不要执行完整 Schema 覆盖旧库。

按顺序执行：

```text
1. docs/ADD_IMAGE_PREPROCESSING.sql
2. docs/ADD_TENCENT_OCR_QUOTA.sql
3. docs/ADD_RESITAI_V0_3_FIELDS.sql
4. docs/ADD_RESITAI_PHASE4_DATA_AUDIT.sql
5. docs/ADD_RESITAI_PHASE5_AUTOMATION_INTEGRATION.sql
6. docs/ADD_OCR_USAGE_MONTHLY_LIMIT.sql
7. docs/REMOVE_RESITAI_WEBHOOK_INTEGRATION.sql
```

每个文件都在 Supabase SQL Editor 单独执行。

---

## 9. 检查数据库安全

### 9.1 检查 RLS

执行：

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

成功标准：

```text
rowsecurity 全部为 true
```

---

### 9.2 检查 Storage bucket

执行：

```sql
select id, name, public
from storage.buckets
where id = 'receipts';
```

成功标准：

```text
id = receipts
public = false
```

---

## 10. 关联本地 Supabase 项目

### 10.1 登录 Supabase CLI

```powershell
supabase login
```

浏览器会打开登录页面。

成功标准：

```text
命令行显示登录成功
```

---

### 10.2 link 客户项目

把 `<project-ref>` 换成客户 Supabase Project Ref。

```powershell
supabase link --project-ref <project-ref>
```

成功标准：

```powershell
Get-Content .\supabase\.temp\project-ref
```

输出应等于客户 Project Ref。

---

## 11. 配置 Supabase Edge Function Secrets

这些密钥只放 Supabase，不放 Cloudflare，不放 `.env.local`。

### 11.1 Tencent OCR

```powershell
supabase secrets set OCR_PROVIDER=tencent
supabase secrets set TENCENT_SECRET_ID="<客户 Tencent Secret ID>"
supabase secrets set TENCENT_SECRET_KEY="<客户 Tencent Secret Key>"
supabase secrets set TENCENT_OCR_REGION=ap-guangzhou
supabase secrets set TENCENT_OCR_ACTION=GeneralBasicOCR
supabase secrets set TENCENT_OCR_LANGUAGE=may
supabase secrets set OCR_FREE_MONTHLY_LIMIT=900
```

---

### 11.2 DeepSeek

```powershell
supabase secrets set AI_REPAIR_PROVIDER=deepseek
supabase secrets set VISION_REPAIR_PROVIDER=deepseek
supabase secrets set DEEPSEEK_API_KEY="<客户 DeepSeek API Key>"
supabase secrets set DEEPSEEK_BASE_URL=https://api.deepseek.com
supabase secrets set DEEPSEEK_MODEL=deepseek-v4-flash
supabase secrets set DEEPSEEK_MONTHLY_LIMIT=500
```

---

### 11.3 Qwen / DashScope

```powershell
supabase secrets set VISION_PROVIDER=qwen
supabase secrets set DASHSCOPE_API_KEY="<客户 DashScope API Key>"
supabase secrets set QWEN_BASE_URL=https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation
supabase secrets set QWEN_VL_MODEL=qwen3.6-plus
supabase secrets set VISION_MONTHLY_LIMIT=100
supabase secrets set VISION_FETCH_TIMEOUT_MS=90000
supabase secrets set QWEN_FETCH_RETRIES=0
```

---

### 11.4 临时设置本地 CORS

本地测试阶段先设置：

```powershell
supabase secrets set CORS_ORIGIN="http://127.0.0.1:5173"
```

生产部署后会再改成 Cloudflare 域名。

---

### 11.5 检查 secrets

```powershell
supabase secrets list
```

成功标准：

```text
能看到 secret 名称
看不到 secret 明文
```

不要手动设置：

```text
SUPABASE_SERVICE_ROLE_KEY
```

---

## 12. 部署 Supabase 函数

### 12.1 部署 parse-receipt

```powershell
supabase functions deploy parse-receipt
```

成功标准：

```powershell
supabase functions list
```

能看到：

```text
parse-receipt
```

---

### 12.2 不要部署这些函数

当前客户安装不要部署：

```text
dispatch-webhook
import-receipts
```

原因：

```text
Webhook / 企业系统集成 / 失败重放当前不在范围内。
```

---

## 13. 本地连接客户 Supabase 测试

### 13.1 创建 `.env.local`

```powershell
Copy-Item .env.example .env.local
```

编辑 `.env.local`，只填写：

```text
VITE_SUPABASE_URL="https://<客户-project-ref>.supabase.co"
VITE_SUPABASE_ANON_KEY="<客户 anon public key>"
```

---

### 13.2 检查 `.env.local` 没有后端密钥

```powershell
Select-String -Path .env.local -Pattern "TENCENT|DASHSCOPE|DEEPSEEK|OPENAI|SERVICE_ROLE"
```

成功标准：

```text
没有输出
```

---

### 13.3 启动本地系统

```powershell
npm run dev
```

打开实际输出的 URL：

```text
http://127.0.0.1:5173/
```

如果 5173 被占用，Vite 会显示 5174 / 5175，以实际输出为准。

---

## 14. 本地验收

按顺序测试。

### 14.1 登录

```text
点击匿名试用
确认进入系统
```

### 14.2 上传图片

```text
上传 JPG / PNG 发票
确认进入队列
确认列表出现记录
```

### 14.3 PDF 上传

```text
上传 PDF
确认按页识别或合并弹窗正常
```

### 14.4 Ctrl+V 上传

```text
复制一张图片
在页面按 Ctrl+V
确认进入上传队列
```

### 14.5 智能解析

```text
打开单据详情
点击智能解析
确认详情页不会自动关闭
确认解析结果回填
```

### 14.6 Rejected

```text
删除一张测试单据
进入 Rejected
恢复
```

### 14.7 Excel

```text
点击导出 Excel
确认有 Receipts 和 Items sheet
```

只有本地验收通过，才继续部署 Cloudflare。

---

## 15. 推送最新分支到 GitHub

如果本地只是拉取远程最新分支，不需要提交。

确认：

```powershell
git status --short
git log --oneline -1
```

如果有客户安装必须包含的新改动，才提交：

```powershell
git add .
git commit -m "deploy: prepare latest customer install"
git push origin codex-receipt-smart-parse-flow
```

如果没有新改动，只执行：

```powershell
git push origin codex-receipt-smart-parse-flow
```

---

## 16. Cloudflare Pages 部署前端

### 16.1 创建 Pages 项目

操作：

```text
1. 打开 Cloudflare Dashboard
2. Workers & Pages
3. Create application
4. Pages
5. Connect to Git
6. 选择 GitHub 仓库
7. 选择分支 codex-receipt-smart-parse-flow
```

---

### 16.2 设置构建参数

| 项目 | 值 |
| --- | --- |
| Framework preset | Vite |
| Build command | `npm ci && npm run build` |
| Build output directory | `dist` |
| Root directory | 留空 |

如果需要 Node 版本：

```text
NODE_VERSION=22
```

---

### 16.3 设置 Cloudflare 环境变量

只设置：

```text
VITE_SUPABASE_URL=https://<客户-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<客户 anon public key>
```

不要设置：

```text
TENCENT_SECRET_ID
TENCENT_SECRET_KEY
DASHSCOPE_API_KEY
DEEPSEEK_API_KEY
OPENAI_API_KEY
SUPABASE_SERVICE_ROLE_KEY
```

---

### 16.4 部署

操作：

```text
点击 Save and Deploy
等待构建成功
打开 Cloudflare Pages URL
```

成功标准：

```text
页面能打开
不显示“缺少 Supabase 配置”
能看到登录页
```

---

## 17. 回填生产 URL

### 17.1 Supabase Auth 回填

Cloudflare 部署完成后，把 Pages URL 加到 Supabase。

操作路径：

```text
Supabase Dashboard
Authentication
URL Configuration
```

添加：

```text
https://<客户-pages-url>
https://<客户正式域名>
```

---

### 17.2 Edge Function CORS 改成生产域名

```powershell
supabase secrets set CORS_ORIGIN="https://<客户-pages-url>"
supabase functions deploy parse-receipt
```

如果客户有正式域名：

```powershell
supabase secrets set CORS_ORIGIN="https://<客户正式域名>"
supabase functions deploy parse-receipt
```

---

## 18. 生产验收

用 Cloudflare Pages URL 测试。

### 18.1 登录

```text
匿名试用可进入
邮箱 Magic Link 可回跳
```

### 18.2 上传

```text
JPG / PNG 可上传
PDF 可上传
Ctrl+V 图片可上传
txt 拖拽不会打开新标签页
```

### 18.3 解析

```text
OCR 有结果
智能解析有结果
解析失败时有明确错误提示
```

### 18.4 审核

```text
详情页可编辑
智能解析后详情页不自动关闭
同步至云端可用
```

### 18.5 Rejected

```text
删除进入 Rejected
Rejected 可恢复
```

### 18.6 Excel

```text
导出 Excel 成功
Receipts 一张发票一行
Items 一条明细一行
```

---

## 19. 安装完成后交付给客户

交付内容：

```text
1. 系统访问 URL
2. 登录方式说明
3. 支持文件格式：JPG / PNG / PDF
4. 使用流程：上传 -> OCR -> 智能解析 -> 审核 -> 同步 -> 导出
5. Rejected 使用说明
6. Excel 导出说明
7. 管理后台说明：Supabase / Cloudflare
```

不要交付：

```text
Tencent Secret Key
DashScope API Key
DeepSeek API Key
Supabase service role key
Cloudflare token
```

---

## 20. 最终安装检查清单

逐项打勾。

- [ ] 已从 `origin/codex-receipt-smart-parse-flow` 拉取最新代码。
- [ ] 最新 commit 是 `19ca748` 或更新。
- [ ] `npm ci` 成功。
- [ ] `npm run lint` 成功。
- [ ] `npm test -- --run` 成功。
- [ ] `npm run build` 成功。
- [ ] 客户 Supabase 项目已创建。
- [ ] Anonymous 登录已开启。
- [ ] Email Magic Link 已开启。
- [ ] `docs/SUPABASE_SCHEMA.sql` 已执行。
- [ ] `receipts` bucket 存在且 private。
- [ ] RLS 检查通过。
- [ ] Tencent OCR secrets 已设置。
- [ ] DeepSeek secrets 已设置。
- [ ] Qwen / DashScope secrets 已设置。
- [ ] `parse-receipt` 已部署。
- [ ] 本地 `.env.local` 只包含 `VITE_` 变量。
- [ ] 本地 smoke test 通过。
- [ ] Cloudflare Pages 已连接 GitHub。
- [ ] Cloudflare 部署分支是 `codex-receipt-smart-parse-flow`。
- [ ] Cloudflare 只设置了 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`。
- [ ] Cloudflare 部署成功。
- [ ] Supabase Auth 已回填生产 URL。
- [ ] `CORS_ORIGIN` 已改成生产 URL。
- [ ] 生产 smoke test 通过。

---

## 21. 一句话安装顺序

如果只看执行顺序，按这个来：

```text
拉最新分支
-> npm ci
-> lint/test/build
-> 创建 Supabase
-> 执行 SUPABASE_SCHEMA.sql
-> 开启 Auth
-> 设置 Secrets
-> 部署 parse-receipt
-> 本地 .env.local 测试
-> Cloudflare 连接 GitHub
-> 设置 VITE 变量
-> 部署 Cloudflare
-> 回填 Supabase URL / CORS
-> 生产验收
-> 交付客户 URL
```
