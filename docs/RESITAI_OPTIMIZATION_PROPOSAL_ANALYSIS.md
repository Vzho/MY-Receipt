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

继续补齐的 P0/P1 基础能力：

- Edge Function 保存 Tencent OCR 文本块坐标到 `raw_ai.ocr_meta.ocr_detections`，前端字段聚焦时可在原图上高亮匹配区域。
- Edge Function prompt 支持 `field_confidence`，前端输入框显示字段级置信度，低置信字段生成 `low_confidence_field` warning。
- 审核 Drawer 支持快捷键：Tab/Shift+Tab 按业务字段顺序跳转、Space 切换原图/识别图、左右键切换单据、S 同步、E 导出、Ctrl/Cmd+Enter 同步并跳到下一张。
- OCR 乱码比例过高时可自动 fallback 到 Qwen VL，并生成 `poor_ocr_text` warning。
- 上传队列增加“全部智能解析”，支持批量启动后台智能解析。
- E-invoice 审核页增加 LHDN 必填字段进度条，缺失 supplier/buyer TIN、UUID、验证链接或税额时禁止同步。
- QR payload 支持解析 MyInvois URL、JSON 和 key-value 格式，预填 `extra_fields` 中的 TIN/UUID/tax 等字段。
- 商品明细支持从 Excel 粘贴多行追加，降低大量明细人工补录成本。
- Excel 导出增加预览确认弹窗，下载前展示 Receipts/Items 行数、列和样例数据。

仍需作为后续重点开发的能力：

- 字段高亮目前是基于 OCR 文本匹配和现有图片尺寸，后续可升级为模型返回的精确 field source map。
- PDF 跨页同一发票合并仍未完成。
- 审计日志、自动确认规则、税率拆分和正式 `currency` schema 仍未完成。

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
| 2.1 | 原图与输入框缺乏高亮联动 | 存在 | 部分实现。Tencent OCR 坐标已保存到 `raw_ai.ocr_meta.ocr_detections`，Drawer 字段聚焦时可按文本匹配高亮图片区域。 | 后续升级为 Edge Function 明确输出 `field_sources`，减少同名文本匹配误差。 |
| 2.2 | 缺少快捷键驱动校对模式 | 存在 | 部分实现。已支持 Tab/Shift+Tab、Space、左右键、S、E、Ctrl/Cmd+Enter，并显示快捷键提示。 | 下一阶段补 Enter 在商品行同列下移，以及可关闭/可配置的快捷键提示。 |
| 2.3 | 置信度缺乏字段级可视化 | 存在 | 部分实现。已支持 `field_confidence` 读取、字段级指示器、低置信字段输入框高亮和 warning。 | 后续提升 Edge Function 对每个字段 confidence 的真实性，并为 item 行做逐行 confidence。 |
| 2.4 | 商品明细大量编辑疲劳 | 存在 | 部分实现。已有明细增删、逐行编辑，并支持从 Excel/表格多行粘贴追加明细。 | 后续加入批量删除/分类、快捷新增行、历史 item autocomplete；拖拽排序后置。 |
| 2.5 | 上传链路过长，批量操作不足 | 存在 | 部分实现。已有批量上传、队列分页、PDF 分页和上传队列“全部智能解析”。 | 裁剪弹窗增加默认跳过选项；列表页增加批量摘要与批量确认入口。 |
| 2.6 | E-invoice 字段独立性不足 | 存在 | 部分实现。已有 E-invoice 专属字段块、LHDN 必填字段进度条和必填字段 sync gate；普通 receipt 隐藏 E-invoice 块。 | 后续增加 E-invoice 专用编辑布局和 QR/OCR 交叉校验 warning。 |
| 3.1 | 非发票文件/模糊图片降级不足 | 存在 | 本轮已部分修复。低置信且缺少关键字段时自动标记 failed，并生成 `not_receipt` warning；已有 blurry warning。 | 下一阶段增加上传前轻量预检和裁剪弹窗模糊 banner。 |
| 3.2 | OCR 乱码与跨页截断防呆不足 | 存在 | 部分实现。PDF 已能拆页上传；外部请求有 30 秒超时；OCR 乱码比例过高时可 fallback 到 Qwen VL。 | 继续补动态 LanguageType 和同一 PDF 多页 OCR 文本合并。 |
| 3.3 | Excel 字段错位/类型不匹配 | 部分存在 | 本轮已部分修复。金额列写入 number，并设置 `#,##0.00`；Currency 明示；导出前有预览弹窗展示 Sheet 行数、列和样例。 | 后续增加列顺序拖拽、异常行跳过日志。 |
| 3.4 | 网络/配额/API 故障降级不足 | 存在 | 本轮已部分修复。外部 OCR/AI 请求有 30 秒超时；已有 Processing Panel。 | 前端按阶段超时提示、retry 2 次指数退避、配额耗尽弹窗和手动录入路径。 |
| 4.1 | 智能批处理与自动确认 | 存在 | 未实现。 | 增加用户可配置自动确认规则，符合条件时 `auto_synced=true`，保留审计标记。 |
| 4.2 | 审计追踪与变更日志 | 存在 | 未实现。 | 新增 `receipt_field_changes` 表；所有 save/delete/restore/sync 写操作记录字段级 old/new value；Drawer 增加变更历史折叠区。 |
| 4.3 | LHDN MyInvois 直接对账 | 存在但剔除 | 不做外部联网验证。 | 只保留 `validation_link`、QR payload 和内部字段完整性校验，不调用外部税局 API。 |
| 4.4 | 数据仪表盘与 OCR 配额看板 | 部分存在 | 本轮实现 OCR 配额进度条；完整 Dashboard 暂不做。 | 后续如需要，再做独立 Dashboard；当前只显示配额使用率。 |
| 4.5 | QR 码深度利用 | 存在 | 部分实现。保存 `qr_payload`，并可解析 MyInvois URL、JSON、key-value payload，预填 supplier/buyer TIN、UUID、validation link、tax amount 等 E-invoice 字段。 | 后续将 QR 金额与 OCR/AI 金额交叉校验，生成专门 warning。 |
| 4.6 | 批量导入接口与 Webhook | 存在 | 未实现。 | 后置为集成阶段：REST import、Webhook、AutoCount/SQL Accounting 导出模板。 |

## 推荐实施顺序

1. **当前批次：基础健壮性与本地化**
   - 已完成：SSM/SST 校验、语言提示、OCR 配额条、Excel 数值格式、外部请求超时、非发票后验失败。

2. **P0：人工校对效率**
   - 已完成基础版：OCR bounding boxes 存储与图片高亮联动、字段级 confidence map、快捷键矩阵与提示面板、OCR 乱码自动 fallback。
   - 待增强：精确 field source map、商品行 Enter 同列下移、PDF 跨页合并。

3. **P1：数据结构与财务准确性**
   - `currency`、`tax_breakdown`、`field_confidence`、`receipt_field_changes` schema。
   - 已完成基础版：E-invoice 合规进度和 sync gate、QR payload 深度解析预填。
   - 待完成：QR/OCR 交叉校验 warning、税率拆分、审计日志。

4. **P1/P2：批量与集成**
   - 已完成基础版：明细多行粘贴、上传队列一键智能解析、导出预览。
   - 自动确认规则。
   - Webhook 和财务软件导出模板。
