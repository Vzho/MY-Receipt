# Supabase Edge Functions

上传后解析函数放在此目录。

推荐函数：

```text
parse-receipt/
  index.ts
```

职责：

1. 校验 Supabase Auth JWT。
2. 根据 `receipt_id` 查询并确认记录属于当前用户。
3. 从 Storage 读取识别用图片：优先 `processed_file_path`，没有裁剪图时回退 `file_path` 原图。
4. 推荐配置 `OCR_PROVIDER=openai` + `VISION_PROVIDER=openai`，普通解析和智能解析都通过 OpenAI Vision 完成。
5. OpenAI Vision 调用前会通过 `consume_ocr_quota` 扣减月度额度，默认每用户每月 300 次。
6. 旧客户仍可配置 `OCR_PROVIDER=tencent`，先调用腾讯云 `GeneralBasicOCR`，再可选用 DeepSeek 修复 OCR 文本结构化结果。
7. 旧高精度链路仍可配置 `VISION_PROVIDER=qwen`，审核页点击“智能解析”时用 Qwen VL 读取图片，并可选 DeepSeek 校验结构和金额。
8. OpenAI-only 模式不需要腾讯云、DashScope/Qwen 或 DeepSeek。
9. 规范化结果并写入 `receipts`、`receipt_items`。
10. 返回解析结果。

前端先快速上传原图，进入编辑页点击“智能解析”时再裁剪；裁剪后会保留两份图片：

```text
{user_id}/{receipt_id}/original.ext
{user_id}/{receipt_id}/processed-{timestamp}.ext
```

`processed-{timestamp}.ext` 是用户在解析前裁剪/旋转后的识别输入；每次智能解析保留独立路径，原图用于人工核对和审计。

推荐 OpenAI-only 模式需要：

```text
OCR_PROVIDER=openai
USE_OPENAI_VISION=true
VISION_PROVIDER=openai
OPENAI_API_KEY
OPENAI_MODEL=gpt-4o-mini
OPENAI_VISION_MONTHLY_LIMIT=300
VISION_FETCH_TIMEOUT_MS=90000
VISION_FETCH_RETRIES=0
```

旧腾讯云 OCR 模式需要：

```text
OCR_PROVIDER=tencent
TENCENT_SECRET_ID
TENCENT_SECRET_KEY
OCR_FREE_MONTHLY_LIMIT=900
AI_REPAIR_PROVIDER=deepseek
DEEPSEEK_API_KEY
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_MONTHLY_LIMIT=500
DASHSCOPE_API_KEY
VISION_PROVIDER=qwen
QWEN_VL_MODEL=qwen3.6-plus
VISION_MONTHLY_LIMIT=100
```

DeepSeek V4 只接收腾讯 OCR 文本和初始 JSON，不上传图片；默认每用户每月最多 500 次。
Qwen VL 不会在 OpenAI-only 模式中使用；旧模式下只有审核页点击“智能解析”才会触发。

`SUPABASE_SERVICE_ROLE_KEY` 由 Supabase Edge Runtime 内置提供，不需要在 Dashboard 手动添加。

