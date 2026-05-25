# API 文档

本系统当前提供两种 API 形式：

1. **Supabase Edge Function** — 服务端 OCR/AI 处理接口
2. **Supabase 客户端 SDK** — 前端通过 SDK 直接操作数据库（受 RLS 保护）

---

## 1. Edge Function: `parse-receipt`

### 基本信息

| 属性 | 值 |
|------|-----|
| **端点** | `POST /functions/v1/parse-receipt` |
| **运行时** | Deno (Supabase Edge Function) |
| **鉴权** | Supabase JWT（Authorization Bearer Token） |
| **Content-Type** | `application/json` |

### 请求格式

```json
{
  "receipt_id": "uuid-string",
  "mode": "ocr"
}
```

**参数说明**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `receipt_id` | string | ✅ | — | 数据库中 `receipts` 表的记录 UUID |
| `mode` | string | ❌ | `"ocr"` | 管线模式，可选值见下表 |

**mode 可选值**：

| 值 | 行为 |
|----|------|
| `"ocr"` | 根据环境变量 `OCR_PROVIDER` 选择（`tencent` / 规则解析） |
| `"vision"` | 使用 `VISION_PROVIDER`（当前仅支持 `qwen`）直接解析图片 |
| `"smart"` | Qwen VL + DeepSeek 双重校验 |
| `"repair"` | 基于已有 `raw_ocr` 文本 + DeepSeek 修复 |

### 成功响应 (200)

```json
{
  "receipt": {
    "id": "uuid",
    "status": "pending_review",
    "merchant_name": "APPLE LEAF ENTERPRISE (SHELL)",
    "company_reg_no": "PG0187462-K",
    "invoice_no": "IRFI5ONDW",
    "date": "2026-04-14",
    "time": "15:27",
    "category": "Fuel",
    "doc_type": "Receipt",
    "processing_stage": "ready_for_review",
    "warnings": [],
    "duplicate_of": null,
    "duplicate_score": null,
    "extra_fields": null,
    "subtotal": 138.01,
    "grand_total": 138.01,
    "payment_method": "Card",
    "subsidy_details": {
      "program": "BUDI MADANI",
      "government_subsidy": 34.20,
      "payable_total": 103.81
    },
    "items": [
      {
        "name": "FuelSave 95",
        "qty": 32.32,
        "unit": "L",
        "unit_price": 4.27,
        "line_total": 138.01
      }
    ],
    "receipt_items": [ ... ]
  }
}
```

### 错误响应

| HTTP 状态 | 说明 |
|-----------|------|
| 400 | 缺少必填参数 `receipt_id` |
| 401 | 缺少 Authorization 头 或 用户会话无效 |
| 404 | 未找到指定 receipt 或不属于当前用户 |
| 500 | OCR/AI 处理失败，`error_message` 包含详情 |

```json
// 401 Unauthorized
{ "error": "Missing Authorization header" }

// 400 Bad Request
{ "error": "receipt_id is required" }

// 404 Not Found
{ "error": "Receipt not found" }

// 500 Internal Server Error
{ "error": "Tencent OCR failed with HTTP 403" }
```

### 调用示例 (前端)

```ts
// 使用 Supabase JS SDK（推荐）
const { data, error } = await supabase.functions.invoke('parse-receipt', {
  body: { receipt_id: 'abc-123', mode: 'smart' },
})

// 或使用 fetch
const { data, error } = await fetch(
  'https://<project>.supabase.co/functions/v1/parse-receipt',
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ receipt_id: 'abc-123' }),
  }
).then(res => res.json())
```

---

## 2. Supabase 数据库 API

前端通过 `@supabase/supabase-js` SDK 直接操作数据库。所有请求受 **RLS (Row Level Security)** 保护，用户只能访问自己的数据。

### receipts

| 方法 | 描述 |
|------|------|
| `supabase.from('receipts').select('*, receipt_items(*)')` | 查询列表（含明细） |
| `supabase.from('receipts').insert({...})` | 创建记录 |
| `supabase.from('receipts').update({...}).eq('id', id)` | 更新记录 |
| `supabase.from('receipts').update({ deleted_at, deleted_reason }).eq('id', id)` | 默认软删除，进入 rejected receipts |
| `supabase.from('receipts').delete().eq('id', id)` | 仅永久删除时使用 |

v0.3 新增字段：

| 字段 | 说明 |
| --- | --- |
| `processing_stage` | `uploaded` / `ocr_scanning` / `ai_extracting` / `generating_preview` / `ready_for_review` / `ocr_failed` |
| `warnings` | `{ code, severity, message, field?, details? }[]` |
| `deleted_at`, `deleted_reason`, `deleted_note` | Rejected receipts / 删除库 |
| `file_hash`, `duplicate_of`, `duplicate_score` | 文件 hash 与业务去重 |
| `custom_doc_type` | 用户自定义单据类型 |
| `extra_fields` | E-invoice 专属字段 |
| `currency` | 单据币种：`RM` / `SGD` / `USD` / `CNY`，旧数据默认 `RM` |
| `tax_breakdown` | 多税率明细：`{ tax_type, tax_rate, taxable_amount, tax_amount }[]` |
| `address_structured` | 地址结构化字段：`street / city / state / postcode / country` |
| `auto_synced`, `auto_sync_rule_name` | 自动确认标记与触发规则名称 |

### receipt_field_changes

| 方法 | 描述 |
|------|------|
| `supabase.from('receipt_field_changes').select('*').eq('receipt_id', id)` | 查询单据字段级变更历史 |
| `supabase.from('receipt_field_changes').insert([...])` | 保存 save / sync / soft_delete / restore / permanent_delete 的字段变更 |

`receipt_field_changes` 只允许用户读取和插入自己的记录；审计写入失败不会阻断单据保存。

### user_webhook_configs

| 方法 | 描述 |
|------|------|
| `supabase.from('user_webhook_configs').select('*')` | 查询当前用户 webhook 配置 |
| `supabase.from('user_webhook_configs').upsert({...})` | 保存回调 URL、secret、启用事件 |

### webhook_delivery_logs

| 方法 | 描述 |
|------|------|
| `supabase.from('webhook_delivery_logs').select('*')` | 查询当前用户 webhook 投递记录，包含成功、失败、跳过和可重放记录 |

关键字段：

| 字段 | 说明 |
| --- | --- |
| `status` | `pending` / `delivered` / `failed` / `skipped` |
| `attempt_count` | 本次投递尝试次数 |
| `http_status` | 客户系统返回的 HTTP 状态码 |
| `error_message` | 投递失败或跳过原因 |
| `next_retry_at` | 建议人工重放时间；系统当前不自动后台重放 |

### Edge Functions

| Function | 描述 |
| --- | --- |
| `POST /functions/v1/import-receipts` | 批量导入 JSON/CSV 收据数据，写入 `receipts`，状态为 `pending_review` |
| `POST /functions/v1/dispatch-webhook` | 手动触发或重放单据 webhook；请求可传 `receipt_id` 或失败记录的 `delivery_id`。解析自动同步时也会按 `user_webhook_configs` 自动回调并写入 `webhook_delivery_logs`。默认 10 秒超时，最多重试 2 次，可用 `WEBHOOK_TIMEOUT_MS`、`WEBHOOK_RETRIES`、`WEBHOOK_RETRY_BASE_DELAY_MS` 调整。 |

### custom_document_types

| 方法 | 描述 |
|------|------|
| `supabase.from('custom_document_types').select('*')` | 查询当前用户自定义类型 |
| `supabase.from('custom_document_types').upsert({...}, { onConflict: 'user_id,name' })` | 保存自定义类型 |

### user_field_preferences

| 方法 | 描述 |
|------|------|
| `supabase.from('user_field_preferences').select('*')` | 查询字段显示/导出配置 |
| `supabase.from('user_field_preferences').upsert([...], { onConflict: 'user_id,field_key' })` | 保存字段配置 |

### receipt_items

| 方法 | 描述 |
|------|------|
| `supabase.from('receipt_items').insert([...])` | 批量插入明细 |
| `supabase.from('receipt_items').delete().eq('receipt_id', id)` | 删除某发票的全部明细（更新前操作） |

### 查询示例

```ts
// 查询当前用户的发票列表（按创建时间倒序）
const { data, error } = await supabase
  .from('receipts')
  .select('*, receipt_items(*)')
  .order('created_at', { ascending: false })

// 按状态筛选
const { data } = await supabase
  .from('receipts')
  .select('*')
  .eq('status', 'pending_review')

// 按日期范围筛选
const { data } = await supabase
  .from('receipts')
  .select('*')
  .gte('date', '2026-01-01')
  .lte('date', '2026-12-31')
```

---

## 3. Supabase Storage API

### 上传发票图片

```ts
const filePath = `${user.id}/${receiptId}/original.${fileExt}`
const { error } = await supabase.storage
  .from('receipts')
  .upload(filePath, file)
```

### 获取签名 URL

```ts
const { data: { signedUrl } } = await supabase.storage
  .from('receipts')
  .createSignedUrl(filePath, 60 * 60)
```

`receipts` bucket 是 private bucket，不使用 `getPublicUrl`。

---

## 4. 错误码参考

| 错误消息 | 可能原因 |
|----------|---------|
| `Missing Authorization header` | 请求未携带 JWT |
| `Invalid user session` | JWT 已过期或无效 |
| `Receipt not found` | `receipt_id` 不存在或不属于当前用户 |
| `Receipt file_path is missing` | 记录未关联 Storage 文件 |
| `Tencent OCR failed` | Tencent API 调用失败（检查密钥/配额） |
| `Qwen vision receipt parsing failed` | DashScope API 调用失败 |
| `OpenAI receipt parsing failed` | OpenAI API 调用失败 |
| `Missing DEEPSEEK_API_KEY` | 修复模式启用但未配置密钥 |
| `OCR free monthly quota reached` | 当月免费 OCR 额度耗尽 |

---

## 5. 环境变量对照

| 环境变量 | 使用位置 | 说明 |
|----------|---------|------|
| `VITE_SUPABASE_URL` | 前端 | Supabase 项目 URL |
| `VITE_SUPABASE_ANON_KEY` | 前端 | 匿名 Key (可公开) |
| `OCR_PROVIDER` | Edge Function | 默认 OCR Provider，当前生产推荐 `tencent` |
| `OPENAI_API_KEY` | Edge Function | 可选 OpenAI Vision Key，默认不启用 |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Function | Supabase 服务角色密钥 |
| `TENCENT_SECRET_ID` | Edge Function | 腾讯云 SecretId |
| `TENCENT_SECRET_KEY` | Edge Function | 腾讯云 SecretKey |
| `DASHSCOPE_API_KEY` | Edge Function | 阿里云 DashScope API Key |
| `DEEPSEEK_API_KEY` | Edge Function | DeepSeek API Key |
