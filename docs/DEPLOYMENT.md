# 部署与密钥管理

## 1. 部署目标

项目由两部分组成：

| 部分 | 部署位置 |
| --- | --- |
| 静态前端 | Vercel、Netlify、Cloudflare Pages、Supabase Hosting 或任意静态站点服务 |
| OCR/AI 函数 | Supabase Edge Functions |

不需要购买或维护 VPS。

## 2. 前端环境变量

这些变量会进入浏览器，可以公开，但必须配合 Supabase RLS：

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

不要在前端配置中出现：

```text
OPENAI_API_KEY
USE_OPENAI_VISION
OCR_PROVIDER
TENCENT_SECRET_ID
TENCENT_SECRET_KEY
OCR_FREE_MONTHLY_LIMIT
DASHSCOPE_API_KEY
VISION_PROVIDER
QWEN_VL_MODEL
VISION_MONTHLY_LIMIT
AI_REPAIR_PROVIDER
DEEPSEEK_API_KEY
DEEPSEEK_MODEL
DEEPSEEK_MONTHLY_LIMIT
SUPABASE_SERVICE_ROLE_KEY
DATABASE_URL
```

## 3. Supabase Edge Function Secrets

推荐客户安装使用 OpenAI-only 模式。完整一键脚本说明见：

```text
docs/RESITAI_OPENAI_ONLY_ONE_CLICK_DEPLOY.md
```

当前 OpenAI-only 安装分支：

```text
https://github.com/Vzho/MY-Receipt/tree/codex/openai-only-deploy
```

OpenAI-only 模式下，以下密钥只存入 Supabase Edge Function Secrets：

```text
OCR_PROVIDER=openai
USE_OPENAI_VISION=true
VISION_PROVIDER=openai
OPENAI_API_KEY
OPENAI_MODEL=gpt-4o-mini
OPENAI_VISION_MONTHLY_LIMIT=300
VISION_FETCH_TIMEOUT_MS=90000
VISION_FETCH_RETRIES=0
OCR_AI_FETCH_RETRIES=2
```

一键脚本会自动写入这些 secrets：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-openai-only.ps1
```

旧的腾讯云 OCR 模式仍可保留给已有客户。该模式下，以下密钥只存入 Supabase Edge Function Secrets：

```text
OCR_PROVIDER=tencent
TENCENT_SECRET_ID
TENCENT_SECRET_KEY
OCR_FREE_MONTHLY_LIMIT=900
AI_REPAIR_PROVIDER=deepseek  # 可选：腾讯 OCR 后低成本文本修复
DEEPSEEK_API_KEY             # 可选：DeepSeek V4 文本修复
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_MONTHLY_LIMIT=500
DASHSCOPE_API_KEY          # 仅高精度重解析需要
VISION_PROVIDER=qwen       # 仅高精度重解析需要
QWEN_VL_MODEL=qwen3.6-plus
VISION_MONTHLY_LIMIT=100
```

设置示例：

```bash
supabase secrets set OCR_PROVIDER=tencent
supabase secrets set TENCENT_SECRET_ID=<tencent-secret-id>
supabase secrets set TENCENT_SECRET_KEY=<tencent-secret-key>
supabase secrets set OCR_FREE_MONTHLY_LIMIT=900
supabase secrets set AI_REPAIR_PROVIDER=deepseek
supabase secrets set DEEPSEEK_API_KEY=<deepseek-api-key>
supabase secrets set DEEPSEEK_MODEL=deepseek-v4-flash
supabase secrets set DEEPSEEK_MONTHLY_LIMIT=500
supabase secrets set VISION_PROVIDER=qwen
supabase secrets set VISION_REPAIR_PROVIDER=deepseek
supabase secrets set DASHSCOPE_API_KEY=<dashscope-api-key>
supabase secrets set QWEN_VL_MODEL=qwen3.6-plus
supabase secrets set VISION_MONTHLY_LIMIT=100
```

DeepSeek V4 默认处理腾讯 OCR 文本；当明细为空、金额校验失败或置信度偏低时自动修复一次，并通过 `consume_ocr_quota` 默认限制每用户每月 500 次。高精度重解析不会自动调用，只有用户在审核页点击“Qwen 视觉重解析”时才会使用 Qwen VL，并默认限制每用户每月 100 次；如果设置 `VISION_REPAIR_PROVIDER=deepseek`，Qwen 视觉 JSON 会再交给 DeepSeek 做结构和数学校验，但不会让 DeepSeek 重写商品名。

旧模式迁移到 OpenAI-only 时，不建议只追加几个 OpenAI secret 混跑；请按 `docs/RESITAI_OPENAI_ONLY_ONE_CLICK_DEPLOY.md` 重新设置 `OCR_PROVIDER=openai`、`VISION_PROVIDER=openai` 和 `OPENAI_API_KEY`。

`SUPABASE_SERVICE_ROLE_KEY` 是 Supabase Edge Functions 的内置环境变量，不要在 Supabase Dashboard 手动创建 `SUPABASE_` 前缀的 secret。本地开发可以使用 `.env.local`，但必须加入 `.gitignore`。仓库只保留 `.env.example`。

## 4. Supabase 资源

需要创建：

1. Supabase Auth。
2. Storage bucket：`receipts`。
3. Postgres 表：`receipts`、`receipt_items`。
4. OCR quota 表与 `consume_ocr_quota` RPC。
5. `receipts.processed_file_path` 与 `receipts.image_processing`，用于保存解析前裁剪图和裁剪参数。
6. Edge Function：`parse-receipt`。

数据库和 RLS 参考 [SUPABASE_SCHEMA.sql](./SUPABASE_SCHEMA.sql)。

如果线上库已经执行过旧版 schema，先在 Supabase SQL Editor 执行：

```sql
-- docs/ADD_IMAGE_PREPROCESSING.sql
alter table public.receipts
  add column if not exists processed_file_path text;

alter table public.receipts
  add column if not exists image_processing jsonb;
```

## 5. 公网安全要求

上线前必须完成：

- 所有业务表启用 RLS。
- Storage bucket 默认不公开。
- Storage policy 限制用户只能访问 `receipts/{auth.uid()}/...`。
- Edge Function 校验 JWT；匿名试用用户也必须持有自己的 Supabase 会话，只能访问自己 `user_id` 下的数据。
- Edge Function 调用前检查 `receipt_id` 所属用户。
- 腾讯云 SecretId/SecretKey、OpenAI key、OpenAI 开关和 Supabase service role key 不进入前端包。
- 腾讯云 OCR 经 `consume_ocr_quota` 硬限制每用户每月最多 900 次，避免超出免费资源包。
- DeepSeek V4 文本修复只处理 OCR 文本，不上传图片，默认每用户每月最多 500 次。
- Qwen VL 高精度重解析只在人工点击时触发，并经 `consume_ocr_quota` 硬限制每用户每月最多 100 次。

## 6. CORS

前端使用 Supabase JS：

```js
await supabase.functions.invoke('parse-receipt', {
  body: { receipt_id }
})
```

优先使用 SDK 调用 Edge Function。若直接使用 `fetch`，Edge Function 需要处理 `OPTIONS` 预检并返回允许的来源。

## 7. 项目部署记录

上线前填写：

```text
Supabase project ref:
Supabase URL:
Frontend deploy URL:
Storage bucket: receipts
Edge Function: parse-receipt
```

## 8. Storage Policy

`docs/SUPABASE_SCHEMA.sql` 会创建私有 `receipts` bucket，并按对象路径第一段限制访问：

```text
{user_id}/{receipt_id}/original.ext
{user_id}/{receipt_id}/processed-{timestamp}.ext
```

前端上传文件时必须使用该路径格式。原图永远保留在 `original.ext`，审核页点击“智能解析”前裁剪/旋转后的识别图保存在唯一 `processed-{timestamp}.ext` 路径，避免覆盖旧裁剪图。Edge Function 使用 service role 优先读取 `processed_file_path`，没有裁剪图时回退读取原图。

## 9. 前端部署步骤

静态前端部署时只配置：

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

构建命令：

```bash
npm install
npm run build
```

输出目录：

```text
dist
```

Supabase Function secrets 单独设置，不要复制到前端托管平台：

```bash
supabase secrets set OCR_PROVIDER=tencent
supabase secrets set TENCENT_SECRET_ID=...
supabase secrets set TENCENT_SECRET_KEY=...
supabase secrets set OCR_FREE_MONTHLY_LIMIT=900
supabase secrets set AI_REPAIR_PROVIDER=deepseek
supabase secrets set DEEPSEEK_API_KEY=...
supabase secrets set DEEPSEEK_MODEL=deepseek-v4-flash
supabase secrets set DEEPSEEK_MONTHLY_LIMIT=500
supabase secrets set VISION_PROVIDER=qwen
supabase secrets set DASHSCOPE_API_KEY=...
supabase secrets set QWEN_VL_MODEL=qwen3.6-plus
supabase secrets set VISION_MONTHLY_LIMIT=100
supabase functions deploy parse-receipt
```

## 10. 上线前检查

- `npm test` 通过。
- `npm run lint` 通过。
- `npm run build` 通过。
- 前端源码、Vite 配置、`.env.example` 不包含腾讯云密钥、DeepSeek key、DashScope key、OpenAI、OpenAI 开关、service role 或 Gemini key。
- `receipts` 和 `receipt_items` 已启用 RLS。
- `receipts` Storage bucket 为 private。
- Storage object path 使用 `{user_id}/{receipt_id}/original.ext`，裁剪图使用 `{user_id}/{receipt_id}/processed-{timestamp}.ext`。
- `parse-receipt` 已部署，并能通过当前用户 JWT 校验 receipt 所有权。
- 上传一张清晰 JPG/PNG/PDF 收据后，先进入列表并显示 `uploaded`；PDF 上传时前端会按页渲染为 JPEG 识别图，每页创建一条独立 receipt，并保留 PDF 原件。打开单据点击“智能解析”后出现裁剪弹窗，应用裁剪后状态能进入 `processing`，最后到 `pending_review`，并写入 `raw_ocr` / `raw_ai`。
- 审核保存能写回 `receipts` 与 `receipt_items`。
- Excel 导出能下载 `.xlsx`。

