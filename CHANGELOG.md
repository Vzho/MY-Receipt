# 变更日志

本文件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 风格，日期为 `YYYY-MM-DD`。

---

## [Unreleased]

- 待发布的修复与改进。

---

## [v0.3.x] — 2026-05-14 ~ 2026-05-18

ResitAI v0.3 的目标是把系统从 “能识别收据” 推进到 “能高效完成会计审核工作流”。

### 新增

- **审核效率工作流**
  - Processing Panel：把 `processing_stage` 的 5 个阶段（uploaded / ocr_scanning / ai_extracting / generating_preview / ready_for_review / ocr_failed）显式映射到列表与审核页。
  - Warning Panel：`warningRules.ts` 评估缺失字段、低置信度、明细 vs 小计差异、计算总额 vs 票面总额差异、模糊图、可能重复，统一在审核页与列表 badge 展示。
  - Soft Delete 删除库：`deleted_at` / `deleted_reason` / `deleted_note`，支持批量恢复、永久删除（含 Storage 文件清理）。
  - 重复检测：上传前 SHA-256 + 图像感知 hash + 业务字段相似度评分；命中时弹 `DuplicateDialog`，写入 `duplicate_of` / `duplicate_score`。
  - 字段提取与导出配置：`user_field_preferences` 表 + `FieldConfigPanel`，UI 显隐 + Excel 列同步。
  - 自定义单据类型：`custom_document_types` 表 + `CustomDocTypeInput`，`doc_type` 保留标准枚举，自定义值放 `custom_doc_type`。
  - E-invoice 专属字段块：`extra_fields`（supplier / buyer / TIN / SST No / UUID / validation_link / qr_payload / invoice_type / tax_amount）+ 上传时本地解码图片 QR 后透传到 Edge Function。
- **多页 PDF**：上传 PDF 时按页渲染为 JPEG OCR 输入，每页创建独立 receipt，`image_processing.source_page` / `source_page_count` 保留页码来源。
- **批量操作**：批量选择、批量导出、批量删除、批量恢复、批量永久删除、批量标记 synced。
- **应用内消息中心**：Header 入口、本地保留最近 100 条、未读标记、可选音效（仅失败 / 重复 / 批量完成时播放）、点击直达 receipt。
- **列表分页 + Realtime 刷新**：可在设置中配置每页条数和上传队列显示数量；Supabase Realtime 订阅当前用户 receipts 变更。
- **裁剪 / 旋转**：智能解析前可裁剪 + 旋转 + 多重 `processed-{timestamp}.ext` 保留历史。

### 修改

- 解析链路重构：默认 `smart` 模式固定走 Qwen VL 读图 + DeepSeek 校验结构和金额，DeepSeek 不重写商品名以避免 OCR 噪声扩散。
- Excel 导出从 SheetJS 切换到 ExcelJS，输出 `Receipts` + `Items` 双 sheet，列跟随用户字段偏好。
- I18N 字典扩充：所有审核 UI 标签、消息、批量操作、删除原因均覆盖中 / 英 / 马三语。

### 修复

- 重复上传同一文件时阻挡 in-flight 上传，避免并发上传产生重复记录。
- PDF 页面刷新后保留 `source_page` 标签。
- 审核 drawer 在 sync 后保持打开。
- 裁剪框旋转后的预览方向。
- 修复列表分类标签丢失。
- 修复 `discount` 与 `subtotal` 重复扣减导致的 `Calculated total mismatch` 误报。

### 安全 / 性能

- Edge Function 强制 `consume_ocr_quota` 扣减；DeepSeek / Qwen VL / Tencent OCR 三个 provider 各自月度配额（500 / 100 / 900）。
- 删除审核 drawer 内的英文硬编码 fallback，全部统一从 `labels` 取值。
- `config` 写入 localStorage 加 300ms debounce，缓解切换主题 / 模板时的 re-render 卡顿。

### 数据库

- 新增表 / 字段：`receipts.processing_stage` / `warnings` / `deleted_*` / `duplicate_of` / `duplicate_score` / `file_hash` / `custom_doc_type` / `extra_fields` / `processed_file_path` / `image_processing`。
- 新增 RPC `consume_ocr_quota(user_id, period, provider, units, limit)`，月度配额行级合并。
- 新增 `ocr_usage_monthly`、`custom_document_types`、`user_field_preferences` 表。
- 新增 Storage policy：用户只能访问 `{auth.uid()}/...` 路径下的对象。

### 增量迁移脚本

- `docs/ADD_IMAGE_PREPROCESSING.sql`
- `docs/ADD_RESITAI_V0_3_FIELDS.sql`
- `docs/ADD_TENCENT_OCR_QUOTA.sql`

### 文档

- `docs/architecture.md`、`docs/api.md`、`docs/deployment.md`、`docs/local-development.md` 全面对齐 v0.3。
- 新增 `docs/RECEIPT_FIELD_DISPLAY_STRATEGY.md` 与 `docs/RESITAI_V0_3_DEVELOPMENT_PLAN.md`。

---

## [v0.2.0] — 2026-05-14

### 新增

- **Supabase Edge Function `parse-receipt` 核心实现**：
  - JWT 鉴权 + `receipt_id` 归属校验。
  - 从 Storage 下载图片（优先 `processed_file_path`，回退 `file_path`）。
  - 多管线：Tencent `GeneralBasicOCR` + 规则解析、Qwen VL（DashScope）、OpenAI Vision、DeepSeek 文本修复、DeepSeek 视觉润色、Smart（Qwen VL + 强制 DeepSeek）、Repair（基于 `raw_ocr`）。
  - 商品名质量门控：可疑字符占比过高时回退到初始 items 并降低 confidence。
  - 结果标准化：金额、日期、类别、枚举。
- **燃油补贴专项处理**：
  - `subsidy_details` JSON：program / ref_no / pump_price / subsidy_price / subsidised_litre / government_subsidy / previous_balance_litre / remaining_balance_litre / gross_total / payable_total。
  - Shell BUDI MADANI RON95 识别规则。
- **前端**：ExcelJS XLSX 导出实现。

### 变更

- 主线放弃 Cloudflare Worker，OCR / AI 全部迁入 Supabase Edge Function。
- 主存储从 Google Sheets 迁移到 Supabase Postgres。

---

## [v0.1.0] — 2026-05-14

### 初始版本

- React 19 + TypeScript + Vite 6 + Tailwind 4 项目骨架。
- 前端原型：拖拽上传、列表筛选、三栏审校面板、深 / 浅色、三品牌色、中 / 英 / 马三语、CSV 导出。
- Supabase Schema + RLS 设计与架构文档。
- Google Gemini API 原型阶段集成（后续已下线，密钥不进入前端）。

---

## 版本里程碑速查

| 版本 | 日期 | 主要里程碑 |
|---|---|---|
| v0.1.0 | 2026-05-14 | 初始项目搭建、UI 原型 |
| v0.2.0 | 2026-05-14 | Edge Function 多管线 AI 实现、燃油补贴支持 |
| v0.3.x | 2026-05-14 ~ 2026-05-18 | 审核工作流（Processing / Warning / SoftDelete / Duplicate / 字段配置 / 自定义单据类型 / E-invoice / 消息中心 / PDF 多页 / 列表分页） |
