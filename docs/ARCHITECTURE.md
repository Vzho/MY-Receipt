# 系统架构

> 本文件取代旧 `docs/ARCHITECTURE.md`（在大小写敏感文件系统上）。链接请使用小写文件名 `docs/architecture.md`。

---

## 1. 部署拓扑

```text
                ┌──────────────────────────────────────────────────┐
                │ 浏览器（React 19 + Vite）                         │
                │  - Supabase JS SDK                               │
                │  - VITE_SUPABASE_URL                             │
                │  - VITE_SUPABASE_ANON_KEY                        │
                └─────────┬───────────────────────────┬────────────┘
                          │ HTTPS                     │ HTTPS
                          ▼                           ▼
       ┌──────────────────────────────┐    ┌──────────────────────────────┐
       │ Supabase Auth                │    │ Supabase Storage (private)   │
       │ - magic link / anonymous     │    │ bucket: receipts             │
       └──────────────────────────────┘    │ path: {user_id}/{rid}/...    │
                          │                └──────────────────────────────┘
                          ▼
       ┌──────────────────────────────┐
       │ Supabase Postgres            │
       │ - receipts / receipt_items   │
       │ - custom_document_types      │
       │ - user_field_preferences     │
       │ - ocr_usage_monthly          │
       │ - RPC consume_ocr_quota      │
       │ - RLS by auth.uid()          │
       └──────────────────────────────┘
                          ▲
                          │ service_role + JWT
                          │
       ┌──────────────────┴───────────────────────────────────────────┐
       │ Supabase Edge Function: parse-receipt (Deno)                 │
       │ ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐ │
       │ │ Tencent OCR  │  │ Qwen VL      │  │ DeepSeek V4         │ │
       │ │ + 规则引擎    │  │ (DashScope)  │  │ (text / vision)     │ │
       │ └──────────────┘  └──────────────┘  └─────────────────────┘ │
       │                 ↑ optional: OpenAI Vision                   │
       │ Secrets:                                                    │
       │ TENCENT_*, DEEPSEEK_*, DASHSCOPE_*, OPENAI_*, SERVICE_ROLE  │
       └─────────────────────────────────────────────────────────────┘
```

前端是纯静态资源，可托管在 Vercel / Netlify / Cloudflare Pages / Supabase Hosting；不需要自建 Node 服务。所有需要密钥保护的工作都在 Edge Function 内完成。

---

## 2. 职责划分

| 层 | 职责 | 允许持有的密钥 |
|---|---|---|
| 静态前端 | 上传、裁剪 / 旋转、列表、详情校对、标签、筛选、Excel 导出、应用内消息中心 | `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY` |
| Supabase Auth | 登录会话、`auth.uid()` | — |
| Supabase Storage | 私有 bucket `receipts`，保存原图与每次裁剪图 | — |
| Edge Function `parse-receipt` | OCR / AI 调用、配额扣减、字段抽取、服务端校验、写库 | `TENCENT_*`、`DASHSCOPE_API_KEY`、`DEEPSEEK_*`、可选 `OPENAI_*`、内置 `SUPABASE_SERVICE_ROLE_KEY` |
| Postgres | 结构化结果、明细、标签、状态、配额计数 | — |

---

## 3. 上传 → 解析 → 审核 → 导出 全流程

1. 用户登录前端（magic link 或匿名）。
2. 拖入文件，前端：
   - 计算 `SHA-256` 文件哈希 + 图像感知 hash（图片）。
   - 调用 `findDuplicateCandidates` 检测可能重复，命中则弹 `DuplicateDialog`。
   - 对 PDF 调用 `renderPdfPagesToReceiptImages` 按页渲染为 JPEG。
3. 上传原图到 `receipts/{user_id}/{receipt_id}/original.ext`，在 `receipts` 表创建记录，状态 `uploaded`。
4. 用户进入审核页点击 “智能解析”：
   - 弹 `ReceiptCropModal`，可裁剪 / 旋转 / 重置 / 跳过。
   - 裁剪后上传 `processed-{timestamp}.ext`，记录 `processed_file_path` 与 `image_processing`。
5. 前端调用 `supabase.functions.invoke('parse-receipt', { body: { receipt_id, mode: 'smart', doc_type, enabled_fields, qr_payload } })`。
6. Edge Function：
   - 验证 `Authorization` JWT，确认 `receipt_id` 归属当前用户。
   - 标记 `status = processing` / `processing_stage = ocr_scanning`。
   - 从 Storage 下载（优先 `processed_file_path`，否则原图）。
   - 按 `mode` 调用对应 provider，每次调用前 `consume_ocr_quota` 扣减。
   - 规范化金额 / 日期 / 枚举 / `extra_fields`。
   - 计算 `warnings`、`duplicate_of` / `duplicate_score`。
   - 写 `receipts` + `receipt_items`，状态 `pending_review` / `processing_stage = ready_for_review`。
7. 前端通过 Supabase Realtime 订阅 + 轮询双保险（`pollReceiptUntilParsed`）拿到结果，更新审核页。
8. 用户编辑后保存（`saveReceipt`），状态变为 `pending_review` 或 `synced`。
9. 删除：默认软删除（`deleted_at` / `deleted_reason`）。永久删除同时清理 Storage 文件。
10. 导出：前端用 `downloadReceiptsXlsx` 通过 ExcelJS 生成 `Receipts` + `Items` 双 sheet。

---

## 4. 模块层（前端）

```text
src/
├── App.tsx                          # 主壳 + I18N（待拆分到 src/i18n/）
├── components/
│   ├── AppShell.tsx                 # 布局：Sidebar + 右侧内容
│   ├── Sidebar.tsx                  # 上传 / 历史 / 已删除 / 设置
│   ├── UploadDropzone.tsx
│   ├── UploadQueue.tsx
│   ├── ReceiptTable.tsx / ReceiptList.tsx
│   ├── ReceiptCropModal.tsx
│   ├── ReceiptReviewDrawer.tsx     # 含 E-invoice 字段块
│   ├── ReceiptDetailPanel.tsx
│   ├── ProcessingPanel.tsx
│   ├── WarningPanel.tsx
│   ├── DeletedReceiptList.tsx
│   ├── DuplicateDialog.tsx
│   ├── FieldConfigPanel.tsx
│   ├── CustomDocTypeInput.tsx
│   ├── TagSelector.tsx
│   ├── ExportToolbar.tsx
│   ├── SettingsModal.tsx
│   ├── NotificationCenter.tsx
│   ├── AuthGate.tsx
│   ├── SoftSelect.tsx / StatusBadge.tsx
├── lib/
│   ├── supabase.ts / supabaseClient.ts   # SDK 单例 + requireSupabase 守卫
│   ├── receiptApi.ts                # 收据 CRUD / Storage / Edge Function 调用
│   ├── receiptMath.ts               # 金额计算公式
│   ├── warningRules.ts              # 异常评估
│   ├── duplicateDetection.ts        # 文件 hash + 业务字段相似度
│   ├── exportExcel.ts               # ExcelJS 导出
│   ├── normalizeReceipt.ts          # 字段规范化
│   ├── fieldConfig.ts               # 字段偏好默认值与合并
│   ├── documentTypes.ts             # 自定义单据类型
│   ├── imagePreprocess.ts           # 图片裁剪 / 旋转 / pHash
│   ├── pdfPreprocess.ts             # PDF 渲染
│   ├── qrPayload.ts                 # QR 解码 + E-invoice 判定
│   ├── subsidyDetails.ts            # 燃油补贴字段
│   ├── appNotifications.ts          # 消息中心持久化
│   ├── notificationSound.ts
│   ├── reuploadTemplate.ts
│   ├── receiptDisplay.ts
│   ├── receiptState.ts
│   └── syncSelection.ts
└── types/
    ├── receipt.ts                   # Receipt / ReceiptItem / EInvoiceExtraFields / ReceiptWarning ...
    ├── warning.ts
    ├── fieldConfig.ts
    ├── documentType.ts
    └── notification.ts
```

---

## 5. 状态机

### 5.1 `status`

| 值 | 含义 |
|---|---|
| `uploaded` | 文件已上传，未进入 OCR |
| `processing` | Edge Function 正在 OCR / AI |
| `pending_review` | AI 抽取完成，等待人工校对 |
| `synced` | 已确认保存，正式台账 |
| `failed` | OCR / AI 失败，可重试 |

### 5.2 `processing_stage`（细分）

| 值 | 含义 |
|---|---|
| `uploaded` | 入库 |
| `ocr_scanning` | OCR / 视觉读取中 |
| `ai_extracting` | AI 结构化字段抽取 |
| `generating_preview` | 整理可审核结果 |
| `ready_for_review` | 可人工审核 |
| `ocr_failed` | OCR / AI 失败 |

---

## 6. 字段约定（v0.3）

| 标准字段 | 说明 |
|---|---|
| `category` | `Grocery / Fuel / F&B / Retail / Service / Other` |
| `doc_type` | `Receipt / Invoice / Credit Note / Expense / E-invoice` |
| `custom_doc_type` | 自定义单据类型字符串 |
| `tax` | 单一 SST 金额（不再使用 `tax_sst` 别名） |
| `subsidy_details` | 政府补贴 JSON（程序、参考号、payable_total 等） |
| `extra_fields` | E-invoice / 其它扩展字段 JSON |
| `warnings` | `{ code, severity, message, field?, details? }[]` |
| `deleted_at / deleted_reason / deleted_note` | 软删除 |
| `file_hash / duplicate_of / duplicate_score` | 去重 |
| `tags` | 用户标签数组 |
| `processed_file_path` | 解析前裁剪图路径 |
| `image_processing` | 裁剪参数 / 输出尺寸 / 图像感知 hash / 来源页码 |

差异化展示规则参见 [RECEIPT_FIELD_DISPLAY_STRATEGY.md](./RECEIPT_FIELD_DISPLAY_STRATEGY.md)。

---

## 7. 关键设计决策

| 决策 | 理由 |
|---|---|
| 把 OCR / AI 全部放进 Supabase Edge Function | 浏览器不能持有 OCR / DeepSeek / Qwen key；同时 service role 不能下沉到前端。 |
| 使用 Supabase Postgres 而非 Google Sheets | RLS、JSON、索引、Realtime、事务、`consume_ocr_quota` RPC 都需要真正的关系数据库。 |
| Smart 模式强制 DeepSeek 校验 | Qwen VL 容易把名词翻译 / 重排；DeepSeek 只校验结构和金额，不重写商品名。 |
| 每次裁剪生成独立 `processed-{ts}.ext` | 保留审计痕迹；与原图共存，便于回看人工裁剪历史。 |
| 软删除而非物理删除 | 会计场景需要可恢复 + 7 年留存合规；永久删除需要显式二次确认。 |
| 文件 hash + 图像感知 hash + 业务字段评分 | 任一单维度（hash / merchant / 日期 / 金额）都不足以判定重复；多信号叠加才稳定。 |
| 月度配额放在 Postgres RPC 而非 Edge Function 内存 | Edge Function 是无状态短生命周期，必须事务化的计数器。 |

---

## 8. 已废弃方案

- Cloudflare Worker 作为 OCR / AI 中间层。
- Google Sheets / Google Vision。
- 前端持有 Gemini / OpenAI / 腾讯 / DeepSeek / service role key。
- AI Studio 初版 `1.html` 与 `index (2).html` mock 页面。

---

## 9. 安全要点

- 所有业务表与 Storage object 都启用 RLS / Policy，按 `auth.uid()` / 路径首段授权。
- Edge Function 必须校验 `Authorization` JWT；`receipt_id` 必须属于当前用户。
- 前端代码、`vite.config.ts`、`.env.example` 不允许出现任何 OCR / AI / service role 密钥。
- `consume_ocr_quota` 在事务内原子扣减，超额返回负数表示拒绝。
- CORS 在生产应限制到部署域名（当前 `supabase/functions/parse-receipt/cors.ts` 还是 `*`，需要在上线前收紧）。

完整部署 / 密钥清单见 [deployment.md](deployment.md)。
