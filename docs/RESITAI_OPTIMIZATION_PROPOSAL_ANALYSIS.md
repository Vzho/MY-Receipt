# ResitAI 系统优化提案逐项分析

更新时间：2026-05-25

本文对照当前 `codex-receipt-smart-parse-flow` 分支，逐条分析用户提供的优化提案，标记问题是否存在、当前实现状态和后续处理方案。

## 结论

当前系统的 OCR/AI 解析链路、上传队列、Processing Panel、Warning Panel、Rejected 库、重复检测、E-invoice 基础字段和双 Sheet Excel 导出已经具备 v0.3 主体能力。

本轮已优先落地低风险基础优化：

- SSM 注册号和 SST No 的前端实时校验、SST 自动格式化。
- Edge Function 增强 SSM/SST 提取、马来文关键词过滤、中文/马来文/英文混排保留提示。
- OCR/API 外部请求 30 秒超时保护。
- 非发票/无效文件的后验失败标记与 `not_receipt` warning。
- Excel 导出显式增加 Currency 列，并给金额列设置 Excel 数值格式。
- 首页增加 OCR 配额进度条，先替代完整 Dashboard。

仍需作为后续重点开发的 P0 能力：

- 字段与原图 OCR bounding box 高亮联动。
- 全键盘高效校对模式。
- 字段级置信度可视化。
- OCR 乱码检测后的自动 vision fallback、PDF 跨页合并。

## 范围边界

- 外部税局联网验证继续剔除，不接入 LHDN/MyInvois 在线校验 API。
- 完整 Dashboard 暂不做；只保留 OCR 配额进度条。
- 不新增传统服务器；继续使用静态前端 + Supabase Auth/Storage/Postgres/Edge Functions。

## 逐项分析

| 编号 | 提案项 | 问题是否存在 | 当前状态 | 解决方案 |
| --- | --- | --- | --- | --- |
| 1.1 | SST 税率字段过于粗糙 | 存在 | 部分实现。当前仍以 `tax` 为主，E-invoice 可在 `extra_fields.tax_amount` 保存专属税额。 | 下一阶段增加 `tax_breakdown`/`tax_rate`/`tax_amount` 结构，先存 `extra_fields`，稳定后再迁移为结构化列；计算引擎区分 service charge taxable base。 |
| 1.2 | SSM 注册号和 SST No 无格式校验 | 存在 | 本轮已部分修复。新增 SSM/SST 校验工具、SST 格式化、前端输入提示和 Edge Function 提取。 | 继续补数据库字段约束或保存前校验策略；为不同 SSM 老/新格式补更多样本测试。 |
| 1.3 | 多语言混排覆盖不足 | 存在 | 本轮已部分修复。补充 Malay 过滤词，prompt 要求保留原文语言和中文行。 | 后续用真实中文/马来文/英文混排样本扩充 OCR 与 parser regression。 |
| 1.4 | 地址解析过于宽泛 | 存在 | 部分实现。当前只提取普通地址字符串。 | 增加 `address_structured`：street/city/state/postcode；UI 默认折叠；AI prompt 输出结构化地址。 |
| 1.5 | 货币符号处理单一 | 存在 | 本轮已部分修复。Excel 导出显式带 Currency，前端按设置传入导出币种。 | 后续给 receipts 增加 `currency` 字段，由 OCR/AI 推断并可人工覆盖。 |
| 2.1 | 原图与输入框缺乏高亮联动 | 存在 | 未实现。当前没有保存 OCR bounding boxes，也没有前端 overlay。 | Edge Function 保存 Tencent OCR 坐标到 `raw_ai.ocr_detections` 或新列；建立字段到文本块映射；Drawer 左侧图片增加半透明框选 overlay。 |
| 2.2 | 缺少快捷键驱动校对模式 | 存在 | 部分实现。已有少量快捷操作，但没有业务语义顺序矩阵。 | 新增 `reviewHotkeys.ts`，统一 Tab/Enter/Ctrl+Enter/S/E/左右键/Space；右下角快捷键提示面板可关闭。 |
| 2.3 | 置信度缺乏字段级可视化 | 存在 | 部分实现。当前只有 receipt 全局 confidence 和 warning。 | Edge Function 输出 `field_confidence`；输入框显示绿/黄/红指示器；低置信字段自动高亮并生成 warning。 |
| 2.4 | 商品明细大量编辑疲劳 | 存在 | 部分实现。已有明细增删和逐行编辑。 | 分阶段加入多行粘贴、批量删除/分类、快捷新增行、历史 item autocomplete；拖拽排序后置。 |
| 2.5 | 上传链路过长，批量操作不足 | 存在 | 部分实现。已有批量上传、队列分页、PDF 分页，但仍缺一键全部智能解析和跳过裁剪策略。 | 上传队列新增“全部智能解析”；裁剪弹窗增加默认跳过选项；列表页增加批量摘要与批量确认入口。 |
| 2.6 | E-invoice 字段独立性不足 | 存在 | 部分实现。已有 E-invoice 专属字段块。 | 增加 LHDN 合规字段进度条和必填字段 sync gate；普通 receipt 隐藏 E-invoice 块。 |
| 3.1 | 非发票文件/模糊图片降级不足 | 存在 | 本轮已部分修复。低置信且缺少关键字段时自动标记 failed，并生成 `not_receipt` warning；已有 blurry warning。 | 下一阶段增加上传前轻量预检和裁剪弹窗模糊 banner。 |
| 3.2 | OCR 乱码与跨页截断防呆不足 | 存在 | 部分实现。PDF 已能拆页上传；本轮增加 30 秒外部请求超时。 | 增加乱码率检测、OCR 失败自动 Qwen VL fallback、动态 LanguageType、同一 PDF 多页 OCR 文本合并。 |
| 3.3 | Excel 字段错位/类型不匹配 | 部分存在 | 本轮已部分修复。金额列写入 number，并设置 `#,##0.00`；Currency 明示。 | 下一阶段增加导出预览弹窗、列顺序拖拽、异常行跳过日志。 |
| 3.4 | 网络/配额/API 故障降级不足 | 存在 | 本轮已部分修复。外部 OCR/AI 请求有 30 秒超时；已有 Processing Panel。 | 前端按阶段超时提示、retry 2 次指数退避、配额耗尽弹窗和手动录入路径。 |
| 4.1 | 智能批处理与自动确认 | 存在 | 未实现。 | 增加用户可配置自动确认规则，符合条件时 `auto_synced=true`，保留审计标记。 |
| 4.2 | 审计追踪与变更日志 | 存在 | 未实现。 | 新增 `receipt_field_changes` 表；所有 save/delete/restore/sync 写操作记录字段级 old/new value；Drawer 增加变更历史折叠区。 |
| 4.3 | LHDN MyInvois 直接对账 | 存在但剔除 | 不做外部联网验证。 | 只保留 `validation_link`、QR payload 和内部字段完整性校验，不调用外部税局 API。 |
| 4.4 | 数据仪表盘与 OCR 配额看板 | 部分存在 | 本轮实现 OCR 配额进度条；完整 Dashboard 暂不做。 | 后续如需要，再做独立 Dashboard；当前只显示配额使用率。 |
| 4.5 | QR 码深度利用 | 存在 | 部分实现。当前保存 `qr_payload` 并用于 E-invoice 判断。 | 解析 MyInvois QR payload，预填 TIN/UUID/tax/grand_total，并与 OCR 结果交叉校验生成 warning。 |
| 4.6 | 批量导入接口与 Webhook | 存在 | 未实现。 | 后置为集成阶段：REST import、Webhook、AutoCount/SQL Accounting 导出模板。 |

## 推荐实施顺序

1. **当前批次：基础健壮性与本地化**
   - 已完成：SSM/SST 校验、语言提示、OCR 配额条、Excel 数值格式、外部请求超时、非发票后验失败。

2. **下一批 P0：人工校对效率**
   - OCR bounding boxes 存储与图片高亮联动。
   - 字段级 confidence map。
   - 快捷键矩阵与快捷键提示面板。
   - OCR 乱码自动 fallback。

3. **P1：数据结构与财务准确性**
   - `currency`、`tax_breakdown`、`field_confidence`、`receipt_field_changes` schema。
   - E-invoice 合规进度和 sync gate。
   - QR payload 深度解析和交叉校验。

4. **P1/P2：批量与集成**
   - 明细批量编辑、上传队列一键智能解析、导出预览。
   - 自动确认规则。
   - Webhook 和财务软件导出模板。
