# 增量 Code Review 报告

- **基线分支：** `review/resitai-v0.3`
- **Review 分支：** `codex-receipt-smart-parse-flow`
- **Review 日期：** 2026-05-18
- **Review 方式：** 增量，仅 review 基线后的 12 个 commit

---

## 验证结果

| 项目 | 状态 |
|------|------|
| `npm run lint` (tsc --noEmit) | ✅ 0 errors |
| `npm test` (vitest) | ✅ 26 files / 66 tests passed |
| `npm run build` (vite) | ✅ 4.29MB (3 JS chunks + CSS) |
| `npm audit --audit-level=moderate` | ✅ 0 vulnerabilities |

---

## 基线后的新改动

12 commits 涉及 38 个文件，+2769 / -340 行：

1. `3fc9dd3` fix: keep PDF page labels after refresh
2. `6a2231a` feat: add in-app notification center
3. `73dc67a` fix: keep review drawer open after sync
4. `bfb05f6` feat: add optional notification sound
5. `691c740` feat: limit upload queue display
6. `01a2232` fix: align drawer controls with theme
7. `77c5e5d` feat: configure receipt list pagination
8. `a5d273f` fix: preview crop rotation
9. `01c076d` fix: keep receipt tags visible after editing
10. `e6cad7e` fix: show all receipt classification tags
11. `a57ea67` feat: add receipt list row numbers
12. `d81fbc9` fix: localize audit UI labels

---

## Findings

### P0 — 必须修

| # | 文件 | 行 | 问题 | 影响 | 建议修复 |
|---|------|-----|------|------|----------|
| 1 | `src/components/ReceiptReviewDrawer.tsx` | 373 | `TIN No` 硬编码，未过 `labels` | 中文/马来文用户仍看到 "TIN No" | 改为 `{labels.tinLabel || 'TIN No'}`，且在 I18N 三个语言中添加 `tinLabel` 字段 |
| 2 | `src/components/ReceiptReviewDrawer.tsx` | 377 | `SST ID` 硬编码，未过 `labels` | 中文/马来文用户仍看到 "SST ID" | 改为 `{labels.sstIdLabel || 'SST ID'}`，I18N 中文已有 `sstIdLabel`，但英文/马来文需要确认 |
| 3 | `src/components/ReceiptReviewDrawer.tsx` | 557 | `E-invoice` 区域标题硬编码 | 中文用户看到未翻译的 "E-invoice" | 改为 `{labels.einvoiceSectionLabel || 'E-invoice'}`，添加到 I18N 三个语言 |
| 4 | `src/components/ReceiptList.tsx` | 15 | 空状态 `'没有记录'` 硬编码中文 | 切换 English 后仍显示 "没有记录" | 添加 `labels?: any` prop，改为 `{labels?.noRecords || '没有记录'}` |

### P1 — 建议修（影响体验或后续维护）

| # | 文件 | 行 | 问题 | 影响 | 建议修复 |
|---|------|-----|------|------|----------|
| 5 | `src/components/ReceiptReviewDrawer.tsx` | 201 | `processingTimeLabel` fallback 为英文 `'Processing time'` | 中文语言下若 labels 未传此字段，显示英文字段 | fallback 改为中文 `'处理时间'`，或确保必传 |
| 6 | `src/components/ReceiptReviewDrawer.tsx` | 454 | Item quality warning fallback 为英文长句 | 中文用户看到全英文提示 | fallback 改为中文，或移除 fallback 强制通过 labels 传入 |
| 7 | `src/components/UploadQueue.tsx` | 77, 84-87 | `'Show less'` / `'Show ${count} more'` fallback 英文 | 中文用户看到英文 | 改为中文 fallback：`'收起'` / `'还有 ${count} 个'` |
| 8 | `src/App.tsx` | 2589, 2592-2593, 2630-2631 | 批量操作按钮 labels fallback 为英文 | 中文用户看到英文按钮文字 | 统一 fallback 为中/英/马三语言匹配模式 |
| 9 | `src/App.tsx` | 1344-1360 | Config 变更触发全组件树 re-render | ⚠ **用户反馈：切换主题/模板后约 0.5 秒才响应的根本原因**。每次 `setConfig` → localStorage 同步写 → 消费 `config` 的所有组件重算 className | (a) `React.memo` 包裹 `ReceiptTable`、`Sidebar`、`UploadQueue`、`ReceiptReviewDrawer`；(b) localStorage 写入加 debounce 300ms |
| 10 | `src/components/ReceiptTable.tsx` | 126 | `useMemo` 过滤 Synced 数据，依赖 `[items]` | `items` 随 `history` 变化，大数据量下性能可优化 | 不影响当前功能，建议后续关注 |

### P2 — 优化建议（可发版后迭代）

| # | 文件 | 行 | 问题 | 建议 |
|---|------|-----|------|------|
| 11 | `src/App.tsx` | 147-913 | I18N 字典约 1800 行内联在 App.tsx | 提取到独立文件 `src/i18n.ts`，按语言 lazy-load |
| 12 | `src/App.tsx` | 1359 | localStorage 写入每次 config 变更都执行 | debounce 500ms 或 unmount 时集中写入 |
| 13 | `src/components/ReceiptCropModal.tsx` | 52 | 默认 `description` 为中文，但其他 default props 为英文 | 统一语言风格，或全部走 labels |
| 14 | `src/components/SoftSelect.tsx` | 49, 84 | 无 `optionLabels` 时显示原始英文值 | 当前 App.tsx 已传 `t.optionLabels`，无实际触发路径 |

### P3 — 极小问题

| # | 文件 | 行 | 问题 |
|---|------|-----|------|
| 15 | `src/components/ProcessingPanel.tsx` | 60-64 | Stage icon 使用 emoji（⚠🧠📊✅🔍📄），部分系统渲染不一致 |

---

## v0.3 功能回归检查

| 功能 | 状态 | 说明 |
|------|------|------|
| 自定义单据类型 | ✅ 正常 | `CustomDocTypeInput` 无结构性修改，仅增加 labels 通路 |
| 字段配置显示/导出 | ✅ 正常 | `FieldConfigPanel` 在 SettingsModal 中正常 |
| Rejected 收据库 | ✅ 正常 | `DeletedReceiptList` 新增 labels 通路 |
| Duplicate detection | ✅ 正常 | `DuplicateDialog` 新增 labels 通路 |
| Warning panel | ✅ 正常 | 新增 labels 通路，未改变逻辑 |
| Processing panel | ✅ 正常 | 新增 labels 通路，未改变逻辑 |
| E-invoice | ✅ 正常 | 结构未改动 |
| PDF 按页上传 | ✅ 正常 | 仅增加 `display_filename` / `source_page_label` 显示逻辑 |
| Excel 导出格式 | ✅ 正常 | 未涉及改动 |

---

## 总结

**是否建议继续给用户验收：** ⚠️ **可验收，但建议先修 P0**

- **必须修（4 项）：** P0#1～#4 — 硬编码标签导致 i18n 显示不一致
- **建议先修（6 项）：** P1#5～#10 — 特别是 P1#9（主题/模板切换 0.5s 卡顿），是用户已反馈的问题
- **纯优化（5 项）：** P2#11～#14，P3#15 — 可发版后迭代

**整体结论：** 本次增量代码质量良好。lint/tests/build 全绿，i18n 通路基本覆盖了新组件。关键改进点在于 3 处硬编码标签（TIN No / SST ID / E-invoice）和主题切换的性能优化。
