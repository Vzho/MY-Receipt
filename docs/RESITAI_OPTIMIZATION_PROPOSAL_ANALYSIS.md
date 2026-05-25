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

后续计划已继续推进并补齐的 P0/P1/P2 基础能力：

- Edge Function 保存 Tencent OCR 文本块坐标到 `raw_ai.ocr_meta.ocr_detections`，前端字段聚焦时可在原图上高亮匹配区域。
- Edge Function prompt 支持 `field_confidence`，前端输入框显示字段级置信度，低置信字段生成 `low_confidence_field` warning。
- 审核 Drawer 支持快捷键：Tab/Shift+Tab 按业务字段顺序跳转、Space 切换原图/识别图、左右键切换单据、S 同步、E 导出、Ctrl/Cmd+Enter 同步并跳到下一张。
- OCR 乱码比例过高时可自动 fallback 到 Qwen VL，并生成 `poor_ocr_text` warning。
- 上传队列增加“全部智能解析”，支持批量启动后台智能解析。
- E-invoice 审核页增加 LHDN 必填字段进度条，缺失 supplier/buyer TIN、UUID、验证链接或税额时禁止同步。
- QR payload 支持解析 MyInvois URL、JSON 和 key-value 格式，预填 `extra_fields` 中的 TIN/UUID/tax 等字段，并对 QR 总额/税额与 OCR 总额/税额做交叉校验 warning。
- 商品明细支持从 Excel 粘贴多行追加，降低大量明细人工补录成本。
- Excel 导出增加预览确认弹窗，下载前展示 Receipts/Items 行数、列和样例数据。
- 商品明细编辑时按 Enter/Shift+Enter 可在同一列上下移动，减少大量明细校对时的鼠标操作。
- 明细行低置信度高亮、批量选择/删除、快捷新增行、merchant/item 历史 autocomplete。
- PDF 多页可选择按页分别识别或合并为一张发票统一 OCR。
- `currency`、`tax_breakdown`、`address_structured`、`receipt_field_changes` 和 `auto_synced` 已进入 schema/API。
- 自动确认规则和字段级审计日志已完成基础版。
- Supabase RLS 已补充匿名登录用户隔离，advisors 当前无 ERROR；唯一剩余 WARN 为 Pro 计划才可开启的 leaked password protection。

仍需作为后续增强的能力：

- 使用更多真实 MyInvois QR / 多语言 / 多页 PDF 样本扩充回归测试。
- 明细拖拽排序、字段列顺序拖拽、异常导出行日志仍可后续增强。
- 外部 LHDN/MyInvois 联网验证继续剔除；完整 Dashboard 暂不做。

## 范围边界

- 外部税局联网验证继续剔除，不接入 LHDN/MyInvois 在线校验 API。
- 完整 Dashboard 暂不做；只保留 OCR 配额进度条。
- 不新增传统服务器；继续使用静态前端 + Supabase Auth/Storage/Postgres/Edge Functions。

## 逐项分析

| 编号 | 提案项 | 问题是否存在 | 当前状态 | 解决方案 |
| --- | --- | --- | --- | --- |
| 1.1 | SST 税率字段过于粗糙 | 存在 | 已实现基础版。新增 `tax_breakdown`，prompt/normalize/导出均可保存多税率结构；旧 `tax` 继续作为汇总兼容字段。 | 后续用更多 SST 6%/8%/10% 与 service charge taxable base 样本扩充回归。 |
| 1.2 | SSM 注册号和 SST No 无格式校验 | 存在 | 已实现基础版。新增 SSM/SST 校验工具、SST 格式化、前端输入提示和 Edge Function 提取。 | 后续按真实样本补更多 SSM 老/新格式测试。 |
| 1.3 | 多语言混排覆盖不足 | 存在 | 已实现基础版。补充 Malay 过滤词，prompt 要求保留原文语言和中文行。 | 后续用真实中文/马来文/英文混排样本扩充 OCR 与 parser regression。 |
| 1.4 | 地址解析过于宽泛 | 存在 | 已实现基础版。新增 `address_structured`，prompt/normalize/导出支持 street/city/state/postcode/country。 | 后续可在 UI 增加更细的折叠编辑体验。 |
| 1.5 | 货币符号处理单一 | 存在 | 已实现基础版。`receipts.currency` 已入 schema，OCR/AI 可推断，前端可人工覆盖，Excel 明示币种。 | 后续可按客户账套增加更多币种。 |
| 2.1 | 原图与输入框缺乏高亮联动 | 存在 | 已实现基础版。优先读取 parser `field_sources`，没有时回退 OCR 文本块匹配。 | 后续继续用真实样本提升字段到 OCR box 的精确映射。 |
| 2.2 | 缺少快捷键驱动校对模式 | 存在 | 已实现基础版。支持 Tab/Shift+Tab、商品行 Enter/Shift+Enter、Space、左右键、S、E、Ctrl/Cmd+Enter，并显示快捷键提示。 | 后续可继续细化快捷键自定义。 |
| 2.3 | 置信度缺乏字段级可视化 | 存在 | 已实现基础版。支持 `field_confidence`、字段级指示器、低置信字段高亮、明细行 `item_confidence` 高亮和 warning。 | 后续提升模型返回 confidence 的稳定性。 |
| 2.4 | 商品明细大量编辑疲劳 | 存在 | 已实现基础版。支持多行粘贴、批量选择/删除、快捷新增行、merchant/item 历史 autocomplete。 | 拖拽排序后置。 |
| 2.5 | 上传链路过长，批量操作不足 | 存在 | 已实现基础版。已有批量上传、队列分页、上传前预检、PDF 分页/合并选择和上传队列“全部智能解析”。 | 列表页行内批量编辑可后续再做。 |
| 2.6 | E-invoice 字段独立性不足 | 存在 | 已实现基础版。已有 E-invoice 专属字段块、LHDN 必填字段进度条和必填字段 sync gate；普通 receipt 隐藏 E-invoice 块。 | 后续补更多 QR/OCR 字段交叉校验样本。 |
| 3.1 | 非发票文件/模糊图片降级不足 | 存在 | 已实现基础版。上传前轻量预检、低置信失败标记、`not_receipt` warning、blurry banner 均已接入。 | 后续可引入更强图像质量检测。 |
| 3.2 | OCR 乱码与跨页截断防呆不足 | 存在 | 已实现基础版。PDF 可按页识别或合并识别；外部请求有超时和 retry；OCR 乱码比例过高时可 fallback 到 Qwen VL。 | 动态 LanguageType 仍可结合更多样本微调。 |
| 3.3 | Excel 字段错位/类型不匹配 | 部分存在 | 已实现基础版。金额列写入 number 并设置格式；Currency/tax/address 结构化字段导出；导出前有预览弹窗；财务软件模板已加入。 | 后续增加列顺序拖拽、异常行跳过日志。 |
| 3.4 | 网络/配额/API 故障降级不足 | 存在 | 已实现基础版。外部 OCR/AI 请求 30 秒超时；Supabase invoke retry 2 次指数退避；Processing Panel 有阶段化超时提示；配额耗尽可回退人工录入。 | 后续可把配额耗尽引导做成更完整的业务弹窗。 |
| 4.1 | 智能批处理与自动确认 | 存在 | 已实现基础版。新增自动确认规则，符合条件时 `auto_synced=true` 并记录规则名。 | 后续可做用户可配置规则 UI。 |
| 4.2 | 审计追踪与变更日志 | 存在 | 已实现基础版。新增 `receipt_field_changes` 表，save/delete/restore/sync 等写操作记录字段级 old/new，Drawer 展示变更历史。 | 后续可增加筛选和导出审计日志。 |
| 4.3 | LHDN MyInvois 直接对账 | 存在但剔除 | 不做外部联网验证。 | 只保留 `validation_link`、QR payload 和内部字段完整性校验，不调用外部税局 API。 |
| 4.4 | 数据仪表盘与 OCR 配额看板 | 部分存在 | 已按范围实现 OCR 配额进度条；完整 Dashboard 暂不做。 | 后续如需要，再做独立 Dashboard。 |
| 4.5 | QR 码深度利用 | 存在 | 已实现基础版。保存并解析 MyInvois URL、JSON、key-value payload，预填 TIN/UUID/validation/tax/total 等字段，并生成 QR 总额/税额 mismatch warning。 | 后续继续补更多 MyInvois payload 样本。 |
| 4.6 | 批量导入接口与 Webhook | 暂时剔除 | 已按当前验收范围移除 `dispatch-webhook`、`import-receipts` 和 webhook 投递日志/重放表。 | 后续客户明确需要系统对接时，再单独立项恢复。 |

## 推荐实施顺序

1. **当前批次：基础健壮性与本地化**
   - 已完成：SSM/SST 校验、语言提示、OCR 配额条、Excel 数值格式、外部请求超时、非发票后验失败。

2. **P0：人工校对效率**
   - 已完成基础版：OCR bounding boxes、`field_sources`、图片高亮联动、字段级 confidence、明细行 confidence、快捷键矩阵、OCR 乱码 fallback、PDF 跨页合并。
   - 待增强：更多真实样本下的 field source 精确度、快捷键自定义。

3. **P1：数据结构与财务准确性**
   - 已完成基础版：`currency`、`tax_breakdown`、`address_structured`、`field_confidence`、`receipt_field_changes` schema，E-invoice 合规进度和 sync gate、QR payload 深度解析预填。
   - 待增强：更多 QR 字段交叉校验样本、审计日志筛选导出。

4. **P1/P2：批量与集成**
   - 已完成基础版：明细多行粘贴、批量删除、上传队列一键智能解析、导出预览、自动确认规则。
   - 暂时剔除：批量导入 API、Webhook、失败重放、客户系统专属字段映射。
