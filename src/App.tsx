import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Upload, Search, CheckCircle, AlertCircle, X, Trash2,
  ExternalLink, ChevronDown, Info, FileSpreadsheet, LogOut
} from 'lucide-react';
import {
  createReceiptFileSignedUrl,
  createReceiptFromFile,
  findDuplicateCandidates,
  getReceipt,
  listCustomDocumentTypes,
  listDeletedReceipts,
  listFieldPreferences,
  listReceipts,
  permanentlyDeleteReceipt,
  pollReceiptUntilParsed,
  restoreReceipt,
  saveReceipt,
  saveCustomDocumentType,
  saveFieldPreferences,
  softDeleteReceipt,
  smartParseReceipt,
  uploadProcessedReceiptImage,
  validateReceiptFile,
} from './lib/receiptApi';
import { computeFileSha256, computeImageAverageHash } from './lib/duplicateDetection';
import { evaluateReceiptWarnings } from './lib/warningRules';
import { defaultFieldPreferences, isFieldEnabled, mergeFieldPreferences } from './lib/fieldConfig';
import { decodeQrPayloadFromImageFile, looksLikeEInvoiceQrPayload } from './lib/qrPayload';
import { downloadReceiptsXlsx } from './lib/exportExcel';
import { formatSubsidyHeadline } from './lib/subsidyDetails';
import { buildPdfPageFileHash, isPdfReceiptFile, renderPdfPagesToReceiptImages } from './lib/pdfPreprocess';
import { formatReceiptDisplayFilename, getReceiptSourcePageLabel } from './lib/receiptDisplay';
import { constrainSelectionToVisible, filterReceiptQueue, summarizeReceiptQueue } from './lib/receiptFilters';
import { keepSyncedReceiptSelected } from './lib/syncSelection';
import { playNotificationSound } from './lib/notificationSound';
import { applyReceiptDraftToCollection } from './lib/receiptState';
import {
  createAppNotification,
  loadAppNotifications,
  markAppNotificationsRead,
  prependAppNotification,
  saveAppNotifications,
  type AppNotificationInput,
} from './lib/appNotifications';
import { DeletedReceiptList } from './components/DeletedReceiptList';
import { DeleteReceiptDialog, type DeleteDialogSubmitPayload } from './components/DeleteReceiptDialog';
import { DuplicateDialog } from './components/DuplicateDialog';
import { NotificationCenter } from './components/NotificationCenter';
import { ReceiptCropModal } from './components/ReceiptCropModal';
import { ReceiptTable } from './components/ReceiptTable';
import { UploadQueue } from './components/UploadQueue';
import { Sidebar } from './components/Sidebar';
import { AppShell } from './components/AppShell';
import { SettingsModal } from './components/SettingsModal';
import { ReceiptReviewDrawer } from './components/ReceiptReviewDrawer';
import type { ImageProcessingMetadata, ProcessedReceiptImage } from './lib/imagePreprocess';
import type { DuplicateCandidate } from './types/duplicate';
import type { FieldKey, FieldPreference } from './types/fieldConfig';
import { supabase } from './lib/supabaseClient';

const INDUSTRIES = ['Grocery', 'Fuel', 'F&B', 'Retail', 'Service', 'Other', 'Custom (自定义)'];
const DOC_TYPES = ['Receipt', 'Invoice', 'Credit Note', 'Expense', 'E-invoice', 'Custom (自定义)'];
const TAGS_OPTIONS = ['Business', 'Personal', 'Tax Deductible', 'Pending']; 

const THEMES = [
  { name: 'Indigo', color: 'bg-indigo-600', text: 'text-indigo-600', light: 'bg-indigo-50' },
  { name: 'Emerald', color: 'bg-emerald-600', text: 'text-emerald-600', light: 'bg-emerald-50' },
  { name: 'Rose', color: 'bg-rose-600', text: 'text-rose-600', light: 'bg-rose-50' }
];
const LANGUAGES = ['中文', 'English', 'Melayu'];
const CURRENCIES = ['RM', 'SGD', 'USD', '¥'];
const DEFAULT_FONT_SCALE = 1.08;
const FONT_SCALE_OPTIONS = [1, DEFAULT_FONT_SCALE, 1.16];

function normalizeFontScale(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_FONT_SCALE;
  const rounded = Math.round(numeric * 100) / 100;
  return FONT_SCALE_OPTIONS.includes(rounded) ? rounded : DEFAULT_FONT_SCALE;
}

const DISPLAY_STATUS_BY_DB_STATUS: Record<string, string> = {
  uploaded: 'Uploaded',
  processing: 'Processing',
  pending_review: 'Pending',
  synced: 'Synced',
  failed: 'Failed',
};

const DB_STATUS_BY_DISPLAY_STATUS: Record<string, string> = {
  Uploaded: 'uploaded',
  Processing: 'processing',
  Pending: 'pending_review',
  Synced: 'synced',
  Failed: 'failed',
};

type RepairProgress = {
  receiptId: string;
  percent: number;
  label: string;
  mode: 'deepseek' | 'vision' | 'smart';
};

type DeleteDialogState = {
  mode: 'soft' | 'permanent';
  ids: string[];
  defaultReason?: string;
  isSubmitting: boolean;
};

type SmartCropTarget = {
  receipt: any;
  file: File;
};

type DuplicatePromptState = {
  file: File;
  previewUrl: string;
  fileHash: string;
  perceptualHash: string | null;
  candidates: DuplicateCandidate[];
  renderedPdfPages?: ProcessedReceiptImage[];
};

function toDisplayReceipt(receipt: any) {
  const items = receipt.receipt_items || receipt.items || [];
  const category = receipt.category || receipt.industry || 'Other';
  const tax = receipt.tax ?? receipt.tax_sst ?? 0;
  const subsidyInfo = receipt.subsidy_info || formatSubsidyHeadline(receipt.subsidy_details);

  return {
    ...receipt,
    status: DISPLAY_STATUS_BY_DB_STATUS[receipt.status] || receipt.status || 'Pending',
    category,
    industry: category,
    display_filename: formatReceiptDisplayFilename(receipt),
    source_page_label: getReceiptSourcePageLabel(receipt),
    tax,
    tax_sst: tax,
    subsidy_info: subsidyInfo,
    warnings: receipt.warnings || evaluateReceiptWarnings({ ...receipt, receipt_items: items }),
    items: items.map((item: any) => ({
      ...item,
      unit_price: Number(item.unit_price || 0),
      line_total: Number(item.line_total || 0),
    })),
  };
}

function toApiReceipt(receipt: any) {
  return {
    ...receipt,
    filename: receipt.display_filename || receipt.filename,
    status: DB_STATUS_BY_DISPLAY_STATUS[receipt.status] || receipt.status || 'pending_review',
    category: receipt.category || receipt.industry || 'Other',
    tax: receipt.tax ?? receipt.tax_sst ?? 0,
    subsidy_details: receipt.subsidy_details || (receipt.subsidy_info ? { description: receipt.subsidy_info } : null),
    receipt_items: receipt.receipt_items || receipt.items || [],
  };
}

// 深度扩充的 I18N 全局多语言词典
const I18N: any = {
  '中文': {
    workflow: '采集与校验',
    upload: '工作流',
    database: '云端数据库',
    settings: '设置',
    theme: '系统颜色',
    language: '语言选择',
    currency: '货币选择',
    exportAll: '全部导出 Excel',
    exportSelected: '导出已选',
    title: '智能采集与审核队列',
    dbTitle: 'Supabase 云端数据库',
    connected: 'Supabase 已连接',
    dragDrop: '拖拽上传 / 点击选择',
    supportText: '支持 PNG、JPG、PDF。PDF 会按页拆分识别。',
    processing: '云端处理引擎运行中',
    searchUpload: '搜索商户名或发票号...',
    searchDb: '在 Supabase 数据库中搜索...',
    statusAll: '状态: 全部',
    statusUploaded: '待智能解析',
    statusProcessing: '解析中',
    statusPending: '待核对',
    statusFailed: '解析失败',
    typeAll: '单据类型: 全部',
    tagAll: '标签: 全部',
    noPending: '没有待处理记录。',
    noData: '数据库中无记录。',
    colMerchant: '状态/商户',
    colFinance: '财务摘要',
    colTags: '分类与标签',
    colAudit: '人工审计',
    colCloud: '云端数据',
    colTotal: '合计金额',
    colAction: '查看单据与原图',
    modalTitle: '系统偏好与集成',
    storageSettings: '存储引擎',
    pgDesc: '关系型数据与状态同步。',
    storageDesc: '发票原图持久化云端存储。',
    exportSingle: '导出当前单据 (XLSX)',
    originalImg: '单据原图',
    headerInfo: '发票抬头、商户信息与分类标签',
    skuInfo: '商品明细表',
    financeInfo: '财务汇总与数学校验引擎',
    addSku: '添加 SKU 行',
    hold: '保持挂起',
    syncToCloud: '同步至云端',
    sequenceLabel: '序号',
    merchantLabel: '商户名称',
    thumbnailLabel: '发票缩略图',
    dateLabel: '日期',
    invoiceLabel: '发票号',
    regNoLabel: '注册号',
    tinLabel: 'TIN 号',
    sstIdLabel: 'SST 编号',
    phonePaymentLabel: '电话与支付',
    docTypeIndLabel: '单据类型 & 行业',
    quickTagsLabel: '快捷标签',
    customTagPlaceholder: '+ 自定义标签',
    add: '添加',
    noImgLabel: '暂无原图记录',
    zoomIn: '放大原图',
    diffLabel: '差异',
    mathPassed: '数学校验通过',
    ocrTotal: '票面识别总额 (OCR):',
    subsidyInfo: '政府补贴 / 援助金',
    itemName: '商品描述',
    qty: '数量',
    subtotal: '小计（明细）',
    discount: '折扣（-）',
    serviceCharge: '服务费（+）',
    taxSst: '税费/SST（+）',
    rounding: '舍入（+/-）',
    change: '找零',
    grandTotal: '计算总额',
    saveAndApply: '保存并应用',
    languagePref: '语言配置',
    currencyPref: '货币设置',
    themeMode: '主题模式',
    brandColor: '品牌主色调',
    lightMode: '浅色模式',
    darkMode: '深色模式',
    auditQueue: '审核队列',
    archiveLib: '存档库',
    exportExcel: '导出 Excel',
    uploadHint: '拖拽上传新的单据',
    uploadLimit: 'JPEG/PNG/PDF 可多选；PDF 会按页拆分用于 OCR',
    searchPlaceholder: '搜索商户、发票号...',
    financialsLabel: '财务详情',
    tagsLabel: '分类标签',
    auditLabel: '操作',
    retry: '重试',
    loadingRecords: '正在加载云端记录...',
    noRecords: '没有记录',
    totalItems: '条记录',
    noArchive: '存档库为空',
    confidence: '置信度',
    merchantInfo: '商户信息',
    skuItems: '明细列表',
    calculator: '计算引擎',
    calculatedTotal: '计算所得总计',
    keepPending: '保持挂起',
    syncToSheets: '同步至云端',
    systemPref: '系统偏好',
    zoomTip: '详情预览',
    mathFailed: '数学校验差异',
    history: '云端档案'
    ,
    optionLabels: {
      Receipt: '收据',
      Invoice: '发票',
      'Credit Note': '贷项通知单',
      Expense: '费用单',
      'E-invoice': '电子发票',
      'Custom (自定义)': '自定义',
      Grocery: '杂货',
      Fuel: '燃油',
      'F&B': '餐饮',
      Retail: '零售',
      Service: '服务',
      Other: '其他',
      Business: '商务',
      Personal: '个人',
      'Tax Deductible': '可抵税',
      Pending: '待处理',
      Uploaded: '已上传',
      Processing: '处理中',
      Failed: '失败',
      Synced: '已同步',
    },
    processingStageLabels: {
      uploaded: '已上传',
      ocr_scanning: 'OCR 识别中',
      ai_extracting: 'AI 抽取字段中',
      generating_preview: '生成预览中',
      ready_for_review: '待审核',
      ocr_failed: 'OCR 失败',
    },
    warningLabels: {
      total_mismatch: '总额不匹配',
      amount_mismatch: '金额不匹配',
      low_confidence_field: '低置信度字段',
      blurry_image: '图片模糊',
      ocr_failed: 'OCR 失败',
      missing_required_field: '缺少必填字段',
      possible_duplicate: '可能重复',
    },
    warningMessages: {
      'OCR failed': 'OCR 失败',
      'Possible duplicate receipt': '可能是重复单据',
      'Merchant is missing': '缺少商户名称',
      'Invoice No. is missing': '缺少发票号',
      'Date is missing': '缺少日期',
      'Low confidence extraction': '提取置信度较低',
      'Line item total does not match subtotal': '明细合计与小计不一致',
      'Calculated total does not match grand total': '计算总额与票面总额不一致',
      'Image or item OCR quality is low': '图片或明细 OCR 质量较低',
    },
    noWarningsLabel: '暂无提醒',
    warningCountLabel: (count: number) => `${count} 个提醒`,
    statusLabels: {
      'Preparing upload': '准备上传',
      'Checking duplicate file': '检查重复文件',
      'Rendering PDF pages': '渲染 PDF 页面',
      'Preparing PDF pages for OCR': '准备 PDF 页面 OCR',
      'Reading QR and metadata': '读取二维码和元数据',
      'Uploading original receipt': '上传原始单据',
      'OCR parsing in background': '后台 OCR 解析中',
      Failed: '失败',
    },
    formatUploadStatus: (status: string) => {
      const exact: Record<string, string> = {
        'Preparing upload': '准备上传',
        'Checking duplicate file': '检查重复文件',
        'Rendering PDF pages': '渲染 PDF 页面',
        'Preparing PDF pages for OCR': '准备 PDF 页面 OCR',
        'Reading QR and metadata': '读取二维码和元数据',
        'Uploading original receipt': '上传原始单据',
        'OCR parsing in background': '后台 OCR 解析中',
        Failed: '失败',
      };
      const rendered = status.match(/^PDF rendered: (\d+) pages?$/);
      if (rendered) return `PDF 已渲染：${rendered[1]} 页`;
      const uploadingPage = status.match(/^Uploading PDF page (\d+) of (\d+)$/);
      if (uploadingPage) return `正在上传 PDF 第 ${uploadingPage[1]} / ${uploadingPage[2]} 页`;
      return exact[status] || status;
    },
    showMore: (count: number) => `还有 ${count} 个`,
    showLess: '收起',
    totalLabel: '共',
    prevLabel: '上一页',
    nextLabel: '下一页',
    pageLabel: '第',
    pageOfLabel: '页 / 共',
    pageSuffix: '页',
    skuLabel: '项明细',
    noInvoiceLabel: '无发票号',
    openThumbnailLabel: '放大发票图片',
    copyMerchantLabel: '复制商户名',
    copyInvoiceLabel: '复制发票号',
    readyForCropLabel: '可裁剪并智能解析',
    smartParsingBackgroundLabel: '智能解析后台处理中',
    processingReceiptLabel: '单据处理中',
    deleteLabel: '删除',
    rowNumberLabel: '第 {number} 行',
    statusSummaryLabel: '状态',
    mathSummaryLabel: '数学校验',
    warningSummaryLabel: '提醒',
    itemsSummaryLabel: '明细',
    lineItemCountLabel: (count: number) => `${count} 条明细`,
    notificationCenterLabel: '消息中心',
    notificationCountLabel: (count: number) => `${count} 条记录`,
    markAllReadLabel: '全部标记已读',
    clearNotificationsLabel: '清空消息',
    noNotificationsLabel: '暂无消息',
    allNotificationsLabel: '全部',
    unreadNotificationsLabel: '未读',
    attentionNotificationsLabel: '需处理',
    notificationSoundLabel: '消息音效',
    notificationSoundDescription: '仅在失败、重复检测和批量完成等关键消息时播放。',
    fontScaleLabel: '界面字号',
    fontScaleDescription: '调整页面文字、表格和按钮的显示大小。',
    fontScaleCompactLabel: '标准',
    fontScaleComfortableLabel: '较大',
    fontScaleLargeLabel: '特大',
    uploadQueueLimitLabel: '上传队列显示数量',
    uploadQueueLimitDescription: '批量上传时首页默认展示的处理任务数量。',
    receiptListPageSizeLabel: '发票列表每页数量',
    receiptListPageSizeDescription: '首页发票列表每页默认展示的记录数量。',
    queueFilterAllLabel: '全部',
    queueFilterAttentionLabel: '需处理',
    queueFilterReadyLabel: '待审核',
    queueFilterProcessingLabel: '处理中',
    queueFilterFailedLabel: '失败',
    fieldExtractionExportLabel: '字段提取与导出',
    showFieldLabel: '显示',
    exportFieldLabel: '导出',
    requiredFieldLabel: '必需',
    fieldGroupLabels: {
      identity: '身份信息',
      financial: '财务',
      items: '明细',
      tax: '税务',
      einvoice: '电子发票',
    },
    fieldLabels: {
      merchant_name: '商户名称',
      invoice_no: '发票号',
      date: '日期',
      time: '时间',
      payment_method: '付款方式',
      subtotal: '小计',
      discount: '折扣',
      tax: '税费 / SST',
      service_charge: '服务费',
      rounding: '舍入',
      grand_total: '总额',
      change: '找零',
      company_reg_no: '公司注册号',
      tin_no: 'TIN 编号',
      sst_no: 'SST 编号',
      subsidy_details: '补贴明细',
      items: '商品明细',
      supplier_name: '供应商名称',
      buyer_name: '买方名称',
      supplier_tin: '供应商 TIN',
      buyer_tin: '买方 TIN',
      invoice_uuid: '发票 UUID',
      validation_link: '验证链接',
      qr_payload: '二维码内容',
      invoice_type: '发票类型',
      tax_amount: '税额',
    },
    selectedCountLabel: (count: number) => `已选 ${count} 条`,
    markSyncedLabel: '标记为已同步',
    deleteSelectedLabel: '删除已选',
    restoreSelectedLabel: '恢复已选',
    smartParseLabel: '智能解析',
    smartParsingLabel: '智能解析中',
    processingTimeLabel: '处理时间',
    restoreLabel: '恢复',
    deletePermanentlyLabel: '永久删除',
    generatingExcelLabel: '正在生成 Excel...',
    closeDrawerLabel: '关闭编辑页',
    rejectedReasonLabel: '删除原因',
    processedImgLabel: '识别图',
    ocrRawSummaryLabel: 'OCR 原文 / 解析说明',
    phonePlaceholder: '电话',
    paymentPlaceholder: '支付方式',
    customDocTypePlaceholder: '自定义单据类型',
    saveLabel: '保存',
    itemQualityWarningLabel: '商品明细名称质量偏低。请对照左侧图片人工补全，或重新智能解析。',
    unitLabel: '单价',
    lineLabel: '行金额',
    itemNamePlaceholder: '名称',
    noLineItemsLabel: '暂无明细记录，请手动添加。',
    fuelSubsidyLabel: '燃油补贴 / Budi Madani',
    subsidyMathNoteLabel: '票面总额保留在计算总额，客户实际支付金额单独展示，避免把政府补贴误当普通折扣。',
    actualPayableLabel: '实际支付 / OPT',
    einvoiceSectionLabel: '电子发票信息',
    einvoiceSupplierLabel: '供应商',
    einvoiceBuyerLabel: '买方',
    einvoiceSupplierTinLabel: '供应商 TIN',
    einvoiceBuyerTinLabel: '买方 TIN',
    einvoiceSstNoLabel: 'SST 编号',
    einvoiceUuidLabel: '发票 UUID',
    einvoiceValidationLabel: '验证链接',
    einvoiceQrPayloadLabel: '二维码内容',
    einvoiceTypeLabel: '发票类型',
    einvoiceTaxAmountLabel: '税额',
    signOutLabel: '退出登录',
    rejectedReceiptsLabel: '已删除收据',
    cropTitle: '智能解析前裁剪',
    cropDescription: '先框住票据主体，再用 Qwen 视觉读取图片，并由 DeepSeek 校验结构、金额和字段。',
    cropSkipLabel: '直接解析原图',
    cropConfirmLabel: '裁剪并智能解析',
    queuedCountLabel: (count: number) => `${count} 张待处理`,
    cancelCropLabel: '取消本张',
    dragCropLabel: '拖动票据区域',
    cropTargetLabel: '处理目标',
    rotationLabel: (degrees: number) => `照片与输出旋转：${degrees}°`,
    rotateLeftLabel: '左转照片',
    rotateRightLabel: '右转照片',
    resetCropLabel: '重置裁剪框',
    renderingLabel: '正在处理',
    cropFailedLabel: '图片裁剪失败',
    cropPreviewAlt: '发票裁剪预览',
    resizeCropLabel: (mode: string) => `调整裁剪框 ${mode}`,
    duplicateTitle: '可能重复',
    duplicateDescription: (filename: string, score: number) => `${filename} 与已有收据相似。相似度：${(score * 100).toFixed(0)}%。`,
    cancelUploadLabel: '取消上传',
    openExistingLabel: '打开旧记录',
    continueUploadLabel: '继续上传',
    noDeletedReceiptsLabel: '暂无已删除收据',
    noNoteLabel: '无备注',
    copyNoteLabel: '复制重传说明',
    reuploadCopiedLabel: '重传说明已复制',
    copyFailedLabel: '复制失败',
    restoreFailedLabel: '恢复失败',
    permanentDeleteConfirmLabel: '永久删除会移除数据库记录和 Storage 文件，确定继续吗？',
    permanentDeleteSuccessLabel: '收据已永久删除。',
    permanentDeleteFailedLabel: '永久删除失败。',
    noDeletedSelectedLabel: '没有选择已删除收据。',
    batchPermanentDeleteConfirmLabel: (count: number) => `永久删除 ${count} 张收据？`,
    permanentDeleteDialogTitle: '永久删除收据',
    batchPermanentDeleteDialogTitle: (count: number) => `永久删除：${count} 张`,
    permanentDeleteDialogDescription: '永久删除会移除数据库记录和 Storage 文件，无法恢复。',
    batchPermanentDeleteDialogDescription: (count: number) => `${count} 张收据会被永久删除，并移除对应 Storage 文件。`,
    permanentDeleteWarningLabel: '此操作不会进入 Rejected 库，删除后无法恢复。',
    confirmPermanentDeleteLabel: '确认永久删除',
    processingActionLabel: '处理中',
    batchPermanentDeleteSuccessLabel: (count: number) => `${count} 张收据已永久删除。`,
    batchPermanentDeleteFinishedLabel: '批量永久删除完成',
    batchPermanentDeleteFailedLabel: '批量永久删除失败。',
    historySearchPlaceholder: '全局搜索历史商户或发票号...',
    syncedDataLabel: '已同步数据 (Supabase)',
    removeArchiveLabel: '从存档移除',
    zoomedReceiptAlt: '放大的发票图片',
    noImageToParseLabel: '这张收据没有可用于解析的图片。',
    loadOriginalFailedLabel: '加载原始收据图片失败，无法裁剪。',
    prepareSmartParseFailedLabel: '准备智能解析失败。',
    smartParseStartedLabel: '智能解析已在后台开始，完成后会提示。',
    smartParseStartedTitle: '智能解析已开始',
    smartParseSyncLabel: '同步智能解析结果到界面',
    smartParseReturnedErrorLabel: '智能解析返回错误',
    smartParseFinishedLabel: '智能解析完成',
    smartParseFailedLabel: '智能解析失败',
    uploadQueuedMessage: (filename: string) => `${filename} 已上传，OCR 已开始。`,
    uploadQueuedTitle: '收据已加入 OCR 队列',
    uploadFailedLabel: '上传失败。',
    uploadFailedTitle: '收据上传失败',
    duplicateAlreadyUploadingLabel: (filename: string) => `${filename} 正在上传中。`,
    duplicateDetectedTitle: '可能重复',
    duplicateDetectedMessage: (filename: string) => `${filename} 与已有收据相似。`,
    duplicatePrecheckFailedLabel: '重复检测失败。',
    pdfNoPagesLabel: 'PDF 收据没有可识别页面。',
    pdfPageQueuedTitle: 'PDF 页面已加入队列',
    pdfPageQueuedMessage: (filename: string, pageNumber: number, totalPages: number) => `${filename} 第 ${pageNumber} / ${totalPages} 页已加入 OCR 队列。`,
    pdfUploadQueuedMessage: (filename: string, count: number) => `${filename}: ${count} 个 PDF 页面已上传，OCR 已开始。`,
    pdfUploadQueuedTitle: 'PDF 上传已加入队列',
    receiptNotFoundLabel: '收据已不存在。',
    openNotificationReceiptFailedLabel: '无法从消息打开收据。',
    retryingLabel: (id: string) => `正在重试 API：${id}`,
    deletePromptLabel: '删除原因（blurry_image / duplicate / amount_not_clear / not_receipt / missing_required_info / other）',
    batchDeletePromptLabel: '批量删除原因（blurry_image / duplicate / amount_not_clear / not_receipt / missing_required_info / other）',
    deleteDialogTitle: '移入已删除库',
    batchDeleteDialogTitle: (count: number) => `移入已删除库：${count} 张`,
    deleteDialogDescription: (name: string) => `请选择 ${name} 的删除原因，会计可在 Rejected 库查看并复制重传说明。`,
    batchDeleteDialogDescription: (count: number) => `${count} 张收据会从主列表移入 Rejected 库，并保留删除原因。`,
    deleteReasonLabel: '删除原因',
    deleteReasonOptions: {
      blurry_image: '照片模糊',
      duplicate: '重复单据',
      amount_not_clear: '金额不清楚',
      not_receipt: '不是收据',
      missing_required_info: '缺少必要信息',
      other: '其他',
    },
    deleteNoteLabel: '备注',
    deleteNotePlaceholder: '可填写需要客户重新提交的说明，例如照片模糊、金额被遮挡。',
    confirmDeleteLabel: '移入已删除库',
    cancelLabel: '取消',
    deleteFailedLabel: '删除失败。',
    receiptMovedRejectedLabel: '收据已移入已删除库。',
    receiptDeletedTitle: '收据已删除',
    noReceiptsSelectedLabel: '没有选择收据。',
    batchDeleteSuccessLabel: (count: number) => `${count} 张收据已移入已删除库。`,
    batchDeleteFinishedLabel: '批量删除完成',
    batchDeleteFailedLabel: '批量删除失败。',
    batchSyncSuccessLabel: (count: number) => `${count} 张收据已标记为已同步。`,
    batchSyncFinishedLabel: '批量同步完成',
    batchSyncFailedLabel: '批量同步失败。',
    receiptRestoredLabel: '收据已恢复。',
    batchRestoreSuccessLabel: (count: number) => `${count} 张收据已恢复。`,
    batchRestoreFinishedLabel: '批量恢复完成',
    batchRestoreFailedLabel: '批量恢复失败。',
    fieldPreferencesSavedLabel: '字段偏好已保存。',
    fieldPreferencesLocalOnlyLabel: '字段偏好仅保存到本地。',
    customDocumentTypeSavedLabel: '自定义单据类型已保存。',
    customDocumentTypeLocalOnlyLabel: '自定义单据类型仅保存到本地。',
    repairProgressLabels: {
      initial: {
        smart: '准备智能解析',
        vision: '准备 Qwen 视觉重解析',
        deepseek: '准备 DeepSeek 文本修复',
      },
      waiting: {
        smart: '智能解析仍在处理，请稍候',
        vision: '视觉模型仍在处理，请稍候',
        deepseek: 'DeepSeek 仍在处理，请稍候',
      },
      stages: {
        smart: ['上传裁剪图并准备智能解析', 'Qwen 视觉模型正在读取票据图片', '抽取商户、字段、金额和明细', 'DeepSeek 正在校验结构和数学校验', '写回云端并刷新审核页'],
        vision: ['准备裁剪图并调用 Qwen VL', 'Qwen VL 正在读取票据图片', '提取商户、金额和商品明细', 'DeepSeek 校验结构和数学校验', '等待云函数写回视觉结果'],
        deepseek: ['连接 DeepSeek 修复引擎', '发送 OCR 原文和初始结果', '重排商户、日期、金额和明细', '校验小计、舍入和总额', '等待云函数写回结果'],
      },
    },
  },
  'English': {
    workflow: 'Processing',
    upload: 'Workflow',
    database: 'Cloud Database',
    settings: 'Settings',
    theme: 'Theme Color',
    language: 'Language',
    currency: 'Currency',
    exportAll: 'Export All (Excel)',
    exportSelected: 'Export Selected',
    title: 'Smart Extraction & Audit Queue',
    dbTitle: 'Supabase Cloud Database',
    connected: 'Supabase Connected',
    dragDrop: 'Drag & Drop / Click to Upload',
    supportText: 'Supports PNG, JPG, and PDF. PDFs are split page by page for OCR.',
    processing: 'Cloud Engine Running...',
    searchUpload: 'Search merchant or invoice no...',
    searchDb: 'Search in Supabase database...',
    statusAll: 'Status: All',
    statusUploaded: 'Ready to Parse',
    statusProcessing: 'Processing',
    statusPending: 'Pending Sync',
    statusFailed: 'Failed to Parse',
    typeAll: 'Doc Type: All',
    tagAll: 'Tag: All',
    noPending: 'No pending records.',
    noData: 'No records in database.',
    colMerchant: 'Status / Merchant',
    colFinance: 'Financials',
    colTags: 'Tags',
    colAudit: 'Audit',
    colCloud: 'Cloud Data (Database)',
    colTotal: 'Total Amount',
    colAction: 'View Data & Image',
    modalTitle: 'System Preferences',
    storageSettings: 'Storage Engine',
    pgDesc: 'Relational data and state sync.',
    storageDesc: 'Persistent cloud storage for receipt images.',
    exportSingle: 'Export Current (XLSX)',
    originalImg: 'Original Receipt',
    headerInfo: 'Header, Merchant & Classification',
    skuInfo: 'SKU Items List',
    financeInfo: 'Financials & Math Verification',
    addSku: 'Add SKU Line',
    hold: 'Keep Pending',
    syncToCloud: 'Sync to Cloud',
    merchantLabel: 'Merchant Name',
    thumbnailLabel: 'Receipt Image',
    dateLabel: 'Date',
    invoiceLabel: 'Invoice No',
    regNoLabel: 'Registration No',
    tinLabel: 'TIN No',
    sstIdLabel: 'SST ID',
    phonePaymentLabel: 'Phone & Payment',
    docTypeIndLabel: 'Doc Type & Industry',
    quickTagsLabel: 'Quick Tags',
    customTagPlaceholder: '+ Custom Tag',
    add: 'Add',
    noImgLabel: 'No Original Image',
    zoomIn: 'Zoom In',
    diffLabel: 'Diff',
    mathPassed: 'Math Verified',
    ocrTotal: 'OCR Ticket Total:',
    subsidyInfo: 'Subsidy / Aid',
    itemName: 'Item Description',
    qty: 'Qty',
    subtotal: 'Subtotal (Items)',
    discount: 'Discount (-)',
    serviceCharge: 'Service Chg (+)',
    taxSst: 'Tax/SST (+)',
    rounding: 'Rounding (+/-)',
    change: 'Change',
    grandTotal: 'Calculated Grand Total',
    saveAndApply: 'Save and Apply',
    languagePref: 'Language Configuration',
    currencyPref: 'Currency Setting',
    themeMode: 'Theme Mode',
    brandColor: 'Brand Primary Color',
    lightMode: 'Light Mode',
    darkMode: 'Dark Mode',
    auditQueue: 'Audit Queue',
    archiveLib: 'Archive Lib',
    exportExcel: 'Export Excel',
    uploadHint: 'Click or Drag to upload receipts',
    uploadLimit: 'JPEG/PNG/PDF multi-upload; PDFs are split page by page for OCR',
    searchPlaceholder: 'Search merchant, invoice...',
    sequenceLabel: 'No.',
    financialsLabel: 'Financials',
    tagsLabel: 'Tags',
    auditLabel: 'Action',
    retry: 'Retry',
    loadingRecords: 'Loading cloud receipts...',
    noRecords: 'No records found',
    totalItems: 'Items',
    noArchive: 'Archive is empty',
    confidence: 'Confidence',
    merchantInfo: 'Merchant Info',
    skuItems: 'SKU Items',
    calculator: 'Calculator',
    calculatedTotal: 'Calculated Total',
    keepPending: 'Keep Pending',
    syncToSheets: 'Sync to Cloud',
    systemPref: 'System Preference',
    zoomTip: 'Zoom View',
    mathFailed: 'Math Error',
    history: 'Cloud History',
    optionLabels: {
      Receipt: 'Receipt',
      Invoice: 'Invoice',
      'Credit Note': 'Credit Note',
      Expense: 'Expense',
      'E-invoice': 'E-invoice',
      'Custom (自定义)': 'Custom',
      Grocery: 'Grocery',
      Fuel: 'Fuel',
      'F&B': 'F&B',
      Retail: 'Retail',
      Service: 'Service',
      Other: 'Other',
      Business: 'Business',
      Personal: 'Personal',
      'Tax Deductible': 'Tax Deductible',
      Pending: 'Pending',
      Uploaded: 'Uploaded',
      Processing: 'Processing',
      Failed: 'Failed',
      Synced: 'Synced',
    },
    processingStageLabels: {
      uploaded: 'Uploaded',
      ocr_scanning: 'OCR scanning...',
      ai_extracting: 'AI extracting fields...',
      generating_preview: 'Generating preview...',
      ready_for_review: 'Ready for review',
      ocr_failed: 'OCR failed',
    },
    warningLabels: {
      total_mismatch: 'Total mismatch detected',
      amount_mismatch: 'Amount mismatch',
      low_confidence_field: 'Low confidence field',
      blurry_image: 'Blurry image',
      ocr_failed: 'OCR failed',
      missing_required_field: 'Missing required field',
      possible_duplicate: 'Possible duplicate',
    },
    warningMessages: {},
    noWarningsLabel: 'No warnings',
    warningCountLabel: (count: number) => `${count} warning${count > 1 ? 's' : ''}`,
    statusLabels: {},
    formatUploadStatus: (status: string) => {
      const exact: Record<string, string> = {
        'Preparing upload': 'Preparing upload',
        'Checking duplicate file': 'Checking duplicate file',
        'Rendering PDF pages': 'Rendering PDF pages',
        'Preparing PDF pages for OCR': 'Preparing PDF pages for OCR',
        'Reading QR and metadata': 'Reading QR and metadata',
        'Uploading original receipt': 'Uploading original receipt',
        'OCR parsing in background': 'OCR parsing in background',
        Failed: 'Failed',
      };
      const rendered = status.match(/^PDF rendered: (\d+) pages?$/);
      if (rendered) return `PDF rendered: ${rendered[1]} page${Number(rendered[1]) > 1 ? 's' : ''}`;
      const uploadingPage = status.match(/^Uploading PDF page (\d+) of (\d+)$/);
      if (uploadingPage) return `Uploading PDF page ${uploadingPage[1]} of ${uploadingPage[2]}`;
      return exact[status] || status;
    },
    showMore: (count: number) => `Show ${count} more`,
    showLess: 'Show less',
    totalLabel: 'Total',
    prevLabel: 'Prev',
    nextLabel: 'Next',
    pageLabel: 'Page',
    pageOfLabel: 'of',
    pageSuffix: '',
    skuLabel: 'SKUs',
    noInvoiceLabel: 'N/A',
    openThumbnailLabel: 'Open receipt image',
    copyMerchantLabel: 'Copy merchant',
    copyInvoiceLabel: 'Copy invoice no.',
    readyForCropLabel: 'Ready for crop and smart parse',
    smartParsingBackgroundLabel: 'Smart parsing in background',
    processingReceiptLabel: 'Processing receipt',
    deleteLabel: 'Delete',
    rowNumberLabel: 'Receipt row number {number}',
    statusSummaryLabel: 'Status',
    mathSummaryLabel: 'Math check',
    warningSummaryLabel: 'Warnings',
    itemsSummaryLabel: 'Items',
    lineItemCountLabel: (count: number) => `${count} item${count === 1 ? '' : 's'}`,
    notificationCenterLabel: 'Message center',
    notificationCountLabel: (count: number) => `${count} record${count > 1 ? 's' : ''}`,
    markAllReadLabel: 'Mark all as read',
    clearNotificationsLabel: 'Clear messages',
    noNotificationsLabel: 'No messages',
    allNotificationsLabel: 'All',
    unreadNotificationsLabel: 'Unread',
    attentionNotificationsLabel: 'Attention',
    notificationSoundLabel: 'Notification sound',
    notificationSoundDescription: 'Play sound only for key messages such as failures, duplicate checks, and batch completion.',
    fontScaleLabel: 'Interface text size',
    fontScaleDescription: 'Adjust the display size for page text, tables, and buttons.',
    fontScaleCompactLabel: 'Standard',
    fontScaleComfortableLabel: 'Large',
    fontScaleLargeLabel: 'Extra large',
    uploadQueueLimitLabel: 'Upload queue display limit',
    uploadQueueLimitDescription: 'Default number of processing tasks shown on the home page during batch upload.',
    receiptListPageSizeLabel: 'Receipts per page',
    receiptListPageSizeDescription: 'Default number of records shown per receipt list page.',
    queueFilterAllLabel: 'All',
    queueFilterAttentionLabel: 'Attention',
    queueFilterReadyLabel: 'Ready',
    queueFilterProcessingLabel: 'Processing',
    queueFilterFailedLabel: 'Failed',
    fieldExtractionExportLabel: 'Field extraction & export',
    showFieldLabel: 'Show',
    exportFieldLabel: 'Export',
    requiredFieldLabel: 'required',
    fieldGroupLabels: {
      identity: 'identity',
      financial: 'financial',
      items: 'items',
      tax: 'tax',
      einvoice: 'e-invoice',
    },
    fieldLabels: {
      merchant_name: 'Merchant',
      invoice_no: 'Invoice No',
      date: 'Date',
      time: 'Time',
      payment_method: 'Payment Method',
      subtotal: 'Subtotal',
      discount: 'Discount',
      tax: 'Tax / SST',
      service_charge: 'Service Charge',
      rounding: 'Rounding',
      grand_total: 'Grand Total',
      change: 'Change',
      company_reg_no: 'Company Reg No',
      tin_no: 'TIN No',
      sst_no: 'SST No',
      subsidy_details: 'Subsidy Details',
      items: 'Line Items',
      supplier_name: 'Supplier Name',
      buyer_name: 'Buyer Name',
      supplier_tin: 'Supplier TIN',
      buyer_tin: 'Buyer TIN',
      invoice_uuid: 'Invoice UUID',
      validation_link: 'Validation Link',
      qr_payload: 'QR Payload',
      invoice_type: 'Invoice Type',
      tax_amount: 'Tax Amount',
    },
    selectedCountLabel: (count: number) => `${count} selected`,
    markSyncedLabel: 'Mark synced',
    deleteSelectedLabel: 'Delete selected',
    restoreSelectedLabel: 'Restore selected',
    smartParseLabel: 'Smart parse',
    smartParsingLabel: 'Smart parsing',
    processingTimeLabel: 'Processing time',
    restoreLabel: 'Restore',
    deletePermanentlyLabel: 'Delete permanently',
    generatingExcelLabel: 'Generating Excel...',
    closeDrawerLabel: 'Close editor',
    rejectedReasonLabel: 'Rejected reason',
    processedImgLabel: 'Processed image',
    ocrRawSummaryLabel: 'OCR text / parser notes',
    phonePlaceholder: 'Phone',
    paymentPlaceholder: 'Payment',
    customDocTypePlaceholder: 'Custom document type',
    saveLabel: 'Save',
    itemQualityWarningLabel: 'Line item names look unreliable. Please compare with the receipt image and complete them manually, or retry smart parsing.',
    unitLabel: 'Unit',
    lineLabel: 'Line',
    itemNamePlaceholder: 'Name',
    noLineItemsLabel: 'No line items. Add one manually.',
    fuelSubsidyLabel: 'Fuel subsidy / Budi Madani',
    subsidyMathNoteLabel: 'Receipt grand total is preserved; customer payable is shown separately to avoid treating government subsidy as a normal discount.',
    actualPayableLabel: 'Payable / OPT',
    einvoiceSectionLabel: 'E-invoice',
    einvoiceSupplierLabel: 'Supplier',
    einvoiceBuyerLabel: 'Buyer',
    einvoiceSupplierTinLabel: 'Supplier TIN',
    einvoiceBuyerTinLabel: 'Buyer TIN',
    einvoiceSstNoLabel: 'SST No',
    einvoiceUuidLabel: 'Invoice UUID',
    einvoiceValidationLabel: 'Validation link',
    einvoiceQrPayloadLabel: 'QR payload',
    einvoiceTypeLabel: 'Invoice type',
    einvoiceTaxAmountLabel: 'Tax amount',
    signOutLabel: 'Sign out',
    rejectedReceiptsLabel: 'Deleted receipts',
    cropTitle: 'Crop before smart parse',
    cropDescription: 'Frame the receipt body first, then let Qwen read the image and DeepSeek verify structure, totals, and fields.',
    cropSkipLabel: 'Parse original image',
    cropConfirmLabel: 'Crop and smart parse',
    queuedCountLabel: (count: number) => `${count} queued`,
    cancelCropLabel: 'Cancel this file',
    dragCropLabel: 'Drag receipt area',
    cropTargetLabel: 'Processing target',
    rotationLabel: (degrees: number) => `Photo and output rotation: ${degrees}°`,
    rotateLeftLabel: 'Rotate photo left',
    rotateRightLabel: 'Rotate photo right',
    resetCropLabel: 'Reset crop box',
    renderingLabel: 'Processing',
    cropFailedLabel: 'Image crop failed',
    cropPreviewAlt: 'Receipt crop preview',
    resizeCropLabel: (mode: string) => `Resize crop ${mode}`,
    duplicateTitle: 'Possible duplicate',
    duplicateDescription: (filename: string, score: number) => `${filename} looks similar to an existing receipt. Score: ${(score * 100).toFixed(0)}%.`,
    cancelUploadLabel: 'Cancel upload',
    openExistingLabel: 'Open existing',
    continueUploadLabel: 'Continue upload',
    noDeletedReceiptsLabel: 'No deleted receipts',
    noNoteLabel: 'No note',
    copyNoteLabel: 'Copy note',
    reuploadCopiedLabel: 'Reupload request copied.',
    copyFailedLabel: 'Copy failed.',
    restoreFailedLabel: 'Restore failed.',
    permanentDeleteConfirmLabel: 'Permanent delete removes the database row and Storage file. Continue?',
    permanentDeleteSuccessLabel: 'Receipt permanently deleted.',
    permanentDeleteFailedLabel: 'Permanent delete failed.',
    noDeletedSelectedLabel: 'No deleted receipts selected.',
    batchPermanentDeleteConfirmLabel: (count: number) => `Permanently delete ${count} receipts?`,
    permanentDeleteDialogTitle: 'Permanently delete receipt',
    batchPermanentDeleteDialogTitle: (count: number) => `Permanently delete ${count} receipts`,
    permanentDeleteDialogDescription: 'This removes the database row and Storage file. It cannot be restored.',
    batchPermanentDeleteDialogDescription: (count: number) => `${count} receipts will be permanently deleted and their Storage files removed.`,
    permanentDeleteWarningLabel: 'This action bypasses the Rejected library and cannot be undone.',
    confirmPermanentDeleteLabel: 'Permanently delete',
    processingActionLabel: 'Processing',
    batchPermanentDeleteSuccessLabel: (count: number) => `${count} receipts permanently deleted.`,
    batchPermanentDeleteFinishedLabel: 'Batch permanent delete finished',
    batchPermanentDeleteFailedLabel: 'Batch permanent delete failed.',
    historySearchPlaceholder: 'Search synced merchants or invoice numbers...',
    syncedDataLabel: 'Synced Data (Supabase)',
    removeArchiveLabel: 'Remove from archive',
    zoomedReceiptAlt: 'Zoomed receipt',
    noImageToParseLabel: 'This receipt has no image to parse.',
    loadOriginalFailedLabel: 'Failed to load original receipt image for cropping.',
    prepareSmartParseFailedLabel: 'Failed to prepare smart parse.',
    smartParseStartedLabel: 'Smart parsing has started in the background. You will be notified when it finishes.',
    smartParseStartedTitle: 'Smart parse started',
    smartParseSyncLabel: 'Syncing smart parse result to the review page',
    smartParseReturnedErrorLabel: 'Smart parse returned an error',
    smartParseFinishedLabel: 'Smart parse finished',
    smartParseFailedLabel: 'Smart parse failed',
    uploadQueuedMessage: (filename: string) => `${filename} uploaded. OCR started.`,
    uploadQueuedTitle: 'Receipt upload queued',
    uploadFailedLabel: 'Upload failed.',
    uploadFailedTitle: 'Receipt upload failed',
    duplicateAlreadyUploadingLabel: (filename: string) => `${filename} is already uploading.`,
    duplicateDetectedTitle: 'Possible duplicate detected',
    duplicateDetectedMessage: (filename: string) => `${filename} looks similar to an existing receipt.`,
    duplicatePrecheckFailedLabel: 'Duplicate precheck failed.',
    pdfNoPagesLabel: 'PDF receipt has no pages.',
    pdfPageQueuedTitle: 'PDF page queued',
    pdfPageQueuedMessage: (filename: string, pageNumber: number, totalPages: number) => `${filename} page ${pageNumber} of ${totalPages} is queued for OCR.`,
    pdfUploadQueuedMessage: (filename: string, count: number) => `${filename}: ${count} PDF page${count > 1 ? 's' : ''} uploaded. OCR started.`,
    pdfUploadQueuedTitle: 'PDF upload queued',
    receiptNotFoundLabel: 'Receipt no longer exists.',
    openNotificationReceiptFailedLabel: 'Failed to open receipt from message.',
    retryingLabel: (id: string) => `Retrying API for ID: ${id}`,
    deletePromptLabel: 'Delete reason (blurry_image / duplicate / amount_not_clear / not_receipt / missing_required_info / other)',
    batchDeletePromptLabel: 'Batch delete reason (blurry_image / duplicate / amount_not_clear / not_receipt / missing_required_info / other)',
    deleteDialogTitle: 'Move to Deleted',
    batchDeleteDialogTitle: (count: number) => `Move ${count} receipts to Deleted`,
    deleteDialogDescription: (name: string) => `Choose why ${name} is being removed. Accounting can review it in Rejected and copy the reupload request.`,
    batchDeleteDialogDescription: (count: number) => `${count} receipts will leave the main list and keep their delete reason in Rejected.`,
    deleteReasonLabel: 'Delete reason',
    deleteReasonOptions: {
      blurry_image: 'Blurry image',
      duplicate: 'Duplicate receipt',
      amount_not_clear: 'Amount not clear',
      not_receipt: 'Not a receipt',
      missing_required_info: 'Missing required info',
      other: 'Other',
    },
    deleteNoteLabel: 'Note',
    deleteNotePlaceholder: 'Add a customer-facing reason, for example blurry photo or blocked amount.',
    confirmDeleteLabel: 'Move to Deleted',
    cancelLabel: 'Cancel',
    deleteFailedLabel: 'Delete failed.',
    receiptMovedRejectedLabel: 'Receipt moved to deleted receipts.',
    receiptDeletedTitle: 'Receipt deleted',
    noReceiptsSelectedLabel: 'No receipts selected.',
    batchDeleteSuccessLabel: (count: number) => `${count} receipts moved to deleted receipts.`,
    batchDeleteFinishedLabel: 'Batch delete finished',
    batchDeleteFailedLabel: 'Batch delete failed.',
    batchSyncSuccessLabel: (count: number) => `${count} receipts marked as synced.`,
    batchSyncFinishedLabel: 'Batch sync finished',
    batchSyncFailedLabel: 'Batch sync failed.',
    receiptRestoredLabel: 'Receipt restored.',
    batchRestoreSuccessLabel: (count: number) => `${count} receipts restored.`,
    batchRestoreFinishedLabel: 'Batch restore finished',
    batchRestoreFailedLabel: 'Batch restore failed.',
    fieldPreferencesSavedLabel: 'Field preferences saved.',
    fieldPreferencesLocalOnlyLabel: 'Field preferences saved locally only.',
    customDocumentTypeSavedLabel: 'Custom document type saved.',
    customDocumentTypeLocalOnlyLabel: 'Custom document type saved locally only.',
    repairProgressLabels: {
      initial: {
        smart: 'Preparing smart parse',
        vision: 'Preparing Qwen vision re-parse',
        deepseek: 'Preparing DeepSeek text repair',
      },
      waiting: {
        smart: 'Smart parse is still running. Please wait.',
        vision: 'Vision model is still running. Please wait.',
        deepseek: 'DeepSeek is still running. Please wait.',
      },
      stages: {
        smart: ['Uploading cropped image and preparing smart parse', 'Qwen vision is reading the receipt image', 'Extracting merchant, fields, totals, and line items', 'DeepSeek is verifying structure and math', 'Writing back to cloud and refreshing review page'],
        vision: ['Preparing cropped image and calling Qwen VL', 'Qwen VL is reading the receipt image', 'Extracting merchant, totals, and line items', 'DeepSeek is verifying structure and math', 'Waiting for the edge function to write back vision results'],
        deepseek: ['Connecting DeepSeek repair engine', 'Sending OCR text and initial result', 'Reordering merchant, date, totals, and line items', 'Verifying subtotal, rounding, and grand total', 'Waiting for the edge function to write back results'],
      },
    },
  },
  'Melayu': {
    workflow: 'Pemprosesan',
    upload: 'Aliran Kerja',
    database: 'Pangkalan Data',
    settings: 'Tetapan',
    theme: 'Warna Tema',
    language: 'Bahasa',
    currency: 'Mata Wang',
    exportAll: 'Eksport Semua (Excel)',
    exportSelected: 'Eksport Pilihan',
    title: 'Gilir Pengekstrakan Pintar',
    dbTitle: 'Pangkalan Data Awan Supabase',
    connected: 'Supabase Disambung',
    dragDrop: 'Tarik & Lepas / Klik untuk Muat Naik',
    supportText: 'Sokong PNG, JPG, dan PDF. PDF dipisahkan mengikut halaman untuk OCR.',
    processing: 'Enjin Awan Sedang Berjalan...',
    searchUpload: 'Cari saudagar atau no invois...',
    searchDb: 'Cari dalam pangkalan data...',
    statusAll: 'Status: Semua',
    statusUploaded: 'Sedia Dihuraikan',
    statusProcessing: 'Sedang Diproses',
    statusPending: 'Menunggu',
    statusFailed: 'Gagal Diekstrak',
    typeAll: 'Jenis Dokumen: Semua',
    tagAll: 'Tag: Semua',
    noPending: 'Tiada rekod yang menunggu.',
    noData: 'Tiada rekod dalam pangkalan data.',
    colMerchant: 'Status / Saudagar',
    colFinance: 'Kewangan',
    colTags: 'Tag',
    colAudit: 'Audit',
    colCloud: 'Data Awan (Pangkalan Data)',
    colTotal: 'Jumlah',
    colAction: 'Lihat Data & Imej',
    modalTitle: 'Pilihan Sistem',
    storageSettings: 'Enjin Penyimpanan',
    pgDesc: 'Penyegerakan data & status.',
    storageDesc: 'Penyimpanan awan untuk imej resit.',
    exportAllExcel: 'Eksport Semua (Excel)',
    exportSingle: 'Eksport Semasa (XLSX)',
    originalImg: 'Resit Asal',
    headerInfo: 'Pengepala, Saudagar & Klasifikasi',
    skuInfo: 'Senarai Item SKU',
    financeInfo: 'Kewangan & Pengesahan Matematik',
    addSku: 'Tambah Baris SKU',
    hold: 'Kekal Menunggu',
    syncToCloud: 'Segerak ke Awan',
    merchantLabel: 'Nama Saudagar',
    thumbnailLabel: 'Imej Resit',
    dateLabel: 'Tarikh',
    invoiceLabel: 'No Invois',
    regNoLabel: 'No Pendaftaran',
    tinLabel: 'No TIN',
    sstIdLabel: 'ID SST',
    phonePaymentLabel: 'Telefon & Pembayaran',
    docTypeIndLabel: 'Jenis Dok. & Industri',
    quickTagsLabel: 'Tag Pantas',
    customTagPlaceholder: '+ Tag Tersuai',
    add: 'Tambah',
    noImgLabel: 'Tiada Imej Asal',
    zoomIn: 'Besarkan',
    diffLabel: 'Beza',
    mathPassed: 'Matematik Disahkan',
    ocrTotal: 'Jumlah OCR:',
    subsidyInfo: 'Subsidi / Bantuan',
    itemName: 'Deskripsi Item',
    qty: 'Kuantiti',
    subtotal: 'Subjumlah (Item)',
    discount: 'Diskaun (-)',
    serviceCharge: 'Caj Perkhidmatan (+)',
    taxSst: 'Cukai/SST (+)',
    rounding: 'Pembundaran (+/-)',
    change: 'Baki',
    grandTotal: 'Jumlah Besar Dikira',
    saveAndApply: 'Simpan dan Guna',
    languagePref: 'Konfigurasi Bahasa',
    currencyPref: 'Tetapan Mata Wang',
    themeMode: 'Mod Tema',
    brandColor: 'Warna Jenama Utama',
    lightMode: 'Mod Cerah',
    darkMode: 'Mod Gelap',
    auditQueue: 'Gilir Audit',
    archiveLib: 'Arkib',
    exportExcel: 'Eksport Excel',
    uploadHint: 'Klik atau Tarik untuk muat naik resit',
    uploadLimit: 'JPEG/PNG/PDF berbilang fail; PDF dipisahkan mengikut halaman untuk OCR',
    searchPlaceholder: 'Cari saudagar, invois...',
    sequenceLabel: 'No.',
    financialsLabel: 'Kewangan',
    tagsLabel: 'Tag',
    auditLabel: 'Tindakan',
    retry: 'Cuba Lagi',
    loadingRecords: 'Memuatkan rekod awan...',
    noRecords: 'Tiada rekod dijumpai',
    totalItems: 'Item',
    noArchive: 'Arkib kosong',
    confidence: 'Keyakinan',
    merchantInfo: 'Maklumat Saudagar',
    skuItems: 'Item SKU',
    calculator: 'Kalkulator',
    calculatedTotal: 'Jumlah Dikira',
    keepPending: 'Kekal Menunggu',
    syncToSheets: 'Segerak ke Awan',
    systemPref: 'Pilihan Sistem',
    zoomTip: 'Pandangan Besar',
    mathFailed: 'Ralat Matematik',
    history: 'Sejarah Awan',
    optionLabels: {
      Receipt: 'Resit',
      Invoice: 'Invois',
      'Credit Note': 'Nota Kredit',
      Expense: 'Perbelanjaan',
      'E-invoice': 'E-invois',
      'Custom (自定义)': 'Tersuai',
      Grocery: 'Runcit',
      Fuel: 'Minyak',
      'F&B': 'F&B',
      Retail: 'Runcit',
      Service: 'Servis',
      Other: 'Lain-lain',
      Business: 'Bisnes',
      Personal: 'Peribadi',
      'Tax Deductible': 'Boleh Tolak Cukai',
      Pending: 'Menunggu',
      Uploaded: 'Dimuat Naik',
      Processing: 'Diproses',
      Failed: 'Gagal',
      Synced: 'Disegerak',
    },
    processingStageLabels: {
      uploaded: 'Dimuat naik',
      ocr_scanning: 'OCR sedang mengimbas',
      ai_extracting: 'AI mengekstrak medan',
      generating_preview: 'Menjana pratonton',
      ready_for_review: 'Sedia disemak',
      ocr_failed: 'OCR gagal',
    },
    warningLabels: {
      total_mismatch: 'Jumlah tidak padan',
      amount_mismatch: 'Amaun tidak padan',
      low_confidence_field: 'Medan keyakinan rendah',
      blurry_image: 'Imej kabur',
      ocr_failed: 'OCR gagal',
      missing_required_field: 'Medan wajib tiada',
      possible_duplicate: 'Mungkin pendua',
    },
    warningMessages: {},
    noWarningsLabel: 'Tiada amaran',
    warningCountLabel: (count: number) => `${count} amaran`,
    statusLabels: {},
    formatUploadStatus: (status: string) => {
      const exact: Record<string, string> = {
        'Preparing upload': 'Menyediakan muat naik',
        'Checking duplicate file': 'Memeriksa fail pendua',
        'Rendering PDF pages': 'Merender halaman PDF',
        'Preparing PDF pages for OCR': 'Menyediakan halaman PDF untuk OCR',
        'Reading QR and metadata': 'Membaca QR dan metadata',
        'Uploading original receipt': 'Memuat naik resit asal',
        'OCR parsing in background': 'OCR berjalan di latar belakang',
        Failed: 'Gagal',
      };
      const rendered = status.match(/^PDF rendered: (\d+) pages?$/);
      if (rendered) return `PDF dirender: ${rendered[1]} halaman`;
      const uploadingPage = status.match(/^Uploading PDF page (\d+) of (\d+)$/);
      if (uploadingPage) return `Memuat naik PDF halaman ${uploadingPage[1]} / ${uploadingPage[2]}`;
      return exact[status] || status;
    },
    showMore: (count: number) => `Lihat ${count} lagi`,
    showLess: 'Ringkaskan',
    totalLabel: 'Jumlah',
    prevLabel: 'Sebelum',
    nextLabel: 'Seterusnya',
    pageLabel: 'Halaman',
    pageOfLabel: 'daripada',
    pageSuffix: '',
    skuLabel: 'SKU',
    noInvoiceLabel: 'Tiada no invois',
    openThumbnailLabel: 'Buka imej resit',
    copyMerchantLabel: 'Salin saudagar',
    copyInvoiceLabel: 'Salin no invois',
    readyForCropLabel: 'Sedia untuk potong dan huraian pintar',
    smartParsingBackgroundLabel: 'Huraian pintar berjalan di latar belakang',
    processingReceiptLabel: 'Resit sedang diproses',
    deleteLabel: 'Padam',
    rowNumberLabel: 'Nombor baris resit {number}',
    statusSummaryLabel: 'Status',
    mathSummaryLabel: 'Semakan kiraan',
    warningSummaryLabel: 'Amaran',
    itemsSummaryLabel: 'Item',
    lineItemCountLabel: (count: number) => `${count} item`,
    notificationCenterLabel: 'Pusat mesej',
    notificationCountLabel: (count: number) => `${count} rekod`,
    markAllReadLabel: 'Tanda semua dibaca',
    clearNotificationsLabel: 'Kosongkan mesej',
    noNotificationsLabel: 'Tiada mesej',
    allNotificationsLabel: 'Semua',
    unreadNotificationsLabel: 'Belum dibaca',
    attentionNotificationsLabel: 'Perlu tindakan',
    notificationSoundLabel: 'Bunyi notifikasi',
    notificationSoundDescription: 'Mainkan bunyi hanya untuk mesej penting seperti kegagalan, pendua, dan siap kelompok.',
    fontScaleLabel: 'Saiz teks antara muka',
    fontScaleDescription: 'Laraskan saiz paparan teks halaman, jadual, dan butang.',
    fontScaleCompactLabel: 'Standard',
    fontScaleComfortableLabel: 'Besar',
    fontScaleLargeLabel: 'Sangat besar',
    uploadQueueLimitLabel: 'Had paparan giliran muat naik',
    uploadQueueLimitDescription: 'Bilangan tugas pemprosesan yang dipaparkan secara lalai semasa muat naik kelompok.',
    receiptListPageSizeLabel: 'Resit setiap halaman',
    receiptListPageSizeDescription: 'Bilangan rekod yang dipaparkan setiap halaman senarai resit.',
    queueFilterAllLabel: 'Semua',
    queueFilterAttentionLabel: 'Perlu tindakan',
    queueFilterReadyLabel: 'Sedia',
    queueFilterProcessingLabel: 'Diproses',
    queueFilterFailedLabel: 'Gagal',
    fieldExtractionExportLabel: 'Pengekstrakan medan & eksport',
    showFieldLabel: 'Papar',
    exportFieldLabel: 'Eksport',
    requiredFieldLabel: 'wajib',
    fieldGroupLabels: {
      identity: 'identiti',
      financial: 'kewangan',
      items: 'item',
      tax: 'cukai',
      einvoice: 'e-invois',
    },
    fieldLabels: {
      merchant_name: 'Nama Saudagar',
      invoice_no: 'No Invois',
      date: 'Tarikh',
      time: 'Masa',
      payment_method: 'Kaedah Bayaran',
      subtotal: 'Subjumlah',
      discount: 'Diskaun',
      tax: 'Cukai / SST',
      service_charge: 'Caj Perkhidmatan',
      rounding: 'Pembundaran',
      grand_total: 'Jumlah Akhir',
      change: 'Baki',
      company_reg_no: 'No Pendaftaran Syarikat',
      tin_no: 'No TIN',
      sst_no: 'No SST',
      subsidy_details: 'Butiran Subsidi',
      items: 'Item',
      supplier_name: 'Nama Pembekal',
      buyer_name: 'Nama Pembeli',
      supplier_tin: 'TIN Pembekal',
      buyer_tin: 'TIN Pembeli',
      invoice_uuid: 'UUID Invois',
      validation_link: 'Pautan Sah',
      qr_payload: 'Kandungan QR',
      invoice_type: 'Jenis Invois',
      tax_amount: 'Amaun Cukai',
    },
    selectedCountLabel: (count: number) => `${count} dipilih`,
    markSyncedLabel: 'Tanda disegerak',
    deleteSelectedLabel: 'Padam pilihan',
    restoreSelectedLabel: 'Pulihkan pilihan',
    smartParseLabel: 'Huraian pintar',
    smartParsingLabel: 'Huraian pintar berjalan',
    processingTimeLabel: 'Masa proses',
    restoreLabel: 'Pulihkan',
    deletePermanentlyLabel: 'Padam kekal',
    generatingExcelLabel: 'Menjana Excel...',
    closeDrawerLabel: 'Tutup editor',
    rejectedReasonLabel: 'Sebab ditolak',
    processedImgLabel: 'Imej diproses',
    ocrRawSummaryLabel: 'Teks OCR / nota parser',
    phonePlaceholder: 'Telefon',
    paymentPlaceholder: 'Bayaran',
    customDocTypePlaceholder: 'Jenis dokumen tersuai',
    saveLabel: 'Simpan',
    itemQualityWarningLabel: 'Nama item kurang yakin. Semak imej resit dan lengkapkan secara manual, atau cuba huraian pintar semula.',
    unitLabel: 'Unit',
    lineLabel: 'Baris',
    itemNamePlaceholder: 'Nama',
    noLineItemsLabel: 'Tiada item. Tambah secara manual.',
    fuelSubsidyLabel: 'Subsidi minyak / Budi Madani',
    subsidyMathNoteLabel: 'Jumlah resit dikekalkan; bayaran pelanggan dipaparkan berasingan supaya subsidi kerajaan tidak dianggap diskaun biasa.',
    actualPayableLabel: 'Bayaran sebenar / OPT',
    einvoiceSectionLabel: 'Maklumat E-invois',
    einvoiceSupplierLabel: 'Pembekal',
    einvoiceBuyerLabel: 'Pembeli',
    einvoiceSupplierTinLabel: 'TIN pembekal',
    einvoiceBuyerTinLabel: 'TIN pembeli',
    einvoiceSstNoLabel: 'No SST',
    einvoiceUuidLabel: 'UUID invois',
    einvoiceValidationLabel: 'Pautan sah',
    einvoiceQrPayloadLabel: 'Kandungan QR',
    einvoiceTypeLabel: 'Jenis invois',
    einvoiceTaxAmountLabel: 'Amaun cukai',
    signOutLabel: 'Log keluar',
    rejectedReceiptsLabel: 'Resit dipadam',
    cropTitle: 'Potong sebelum huraian pintar',
    cropDescription: 'Bingkaikan badan resit dahulu, kemudian Qwen membaca imej dan DeepSeek menyemak struktur, jumlah, dan medan.',
    cropSkipLabel: 'Huraikan imej asal',
    cropConfirmLabel: 'Potong dan huraikan',
    queuedCountLabel: (count: number) => `${count} menunggu`,
    cancelCropLabel: 'Batal fail ini',
    dragCropLabel: 'Seret kawasan resit',
    cropTargetLabel: 'Sasaran proses',
    rotationLabel: (degrees: number) => `Putaran foto dan output: ${degrees}°`,
    rotateLeftLabel: 'Putar foto kiri',
    rotateRightLabel: 'Putar foto kanan',
    resetCropLabel: 'Tetapkan semula kotak potong',
    renderingLabel: 'Sedang diproses',
    cropFailedLabel: 'Gagal memotong imej',
    cropPreviewAlt: 'Pratonton potong resit',
    resizeCropLabel: (mode: string) => `Ubah saiz potong ${mode}`,
    duplicateTitle: 'Mungkin pendua',
    duplicateDescription: (filename: string, score: number) => `${filename} serupa dengan resit sedia ada. Skor: ${(score * 100).toFixed(0)}%.`,
    cancelUploadLabel: 'Batal muat naik',
    openExistingLabel: 'Buka rekod lama',
    continueUploadLabel: 'Teruskan muat naik',
    noDeletedReceiptsLabel: 'Tiada resit dipadam',
    noNoteLabel: 'Tiada nota',
    copyNoteLabel: 'Salin nota',
    reuploadCopiedLabel: 'Permintaan muat naik semula disalin.',
    copyFailedLabel: 'Salin gagal.',
    restoreFailedLabel: 'Pulih gagal.',
    permanentDeleteConfirmLabel: 'Padam kekal akan membuang rekod pangkalan data dan fail Storage. Teruskan?',
    permanentDeleteSuccessLabel: 'Resit dipadam kekal.',
    permanentDeleteFailedLabel: 'Padam kekal gagal.',
    noDeletedSelectedLabel: 'Tiada resit dipadam dipilih.',
    batchPermanentDeleteConfirmLabel: (count: number) => `Padam kekal ${count} resit?`,
    permanentDeleteDialogTitle: 'Padam resit kekal',
    batchPermanentDeleteDialogTitle: (count: number) => `Padam kekal ${count} resit`,
    permanentDeleteDialogDescription: 'Ini membuang rekod pangkalan data dan fail Storage. Ia tidak boleh dipulihkan.',
    batchPermanentDeleteDialogDescription: (count: number) => `${count} resit akan dipadam kekal dan fail Storage dibuang.`,
    permanentDeleteWarningLabel: 'Tindakan ini tidak masuk ke senarai Rejected dan tidak boleh dibuat asal.',
    confirmPermanentDeleteLabel: 'Padam kekal',
    processingActionLabel: 'Sedang diproses',
    batchPermanentDeleteSuccessLabel: (count: number) => `${count} resit dipadam kekal.`,
    batchPermanentDeleteFinishedLabel: 'Padam kekal kelompok selesai',
    batchPermanentDeleteFailedLabel: 'Padam kekal kelompok gagal.',
    historySearchPlaceholder: 'Cari saudagar atau no invois disegerak...',
    syncedDataLabel: 'Data Disegerak (Supabase)',
    removeArchiveLabel: 'Buang dari arkib',
    zoomedReceiptAlt: 'Resit dibesarkan',
    noImageToParseLabel: 'Resit ini tiada imej untuk dihuraikan.',
    loadOriginalFailedLabel: 'Gagal memuatkan imej resit asal untuk dipotong.',
    prepareSmartParseFailedLabel: 'Gagal menyediakan huraian pintar.',
    smartParseStartedLabel: 'Huraian pintar telah bermula di latar belakang. Anda akan dimaklumkan apabila selesai.',
    smartParseStartedTitle: 'Huraian pintar bermula',
    smartParseSyncLabel: 'Menyegerakkan hasil huraian pintar ke halaman semakan',
    smartParseReturnedErrorLabel: 'Huraian pintar mengembalikan ralat',
    smartParseFinishedLabel: 'Huraian pintar selesai',
    smartParseFailedLabel: 'Huraian pintar gagal',
    uploadQueuedMessage: (filename: string) => `${filename} dimuat naik. OCR bermula.`,
    uploadQueuedTitle: 'Resit dimasukkan ke giliran OCR',
    uploadFailedLabel: 'Muat naik gagal.',
    uploadFailedTitle: 'Muat naik resit gagal',
    duplicateAlreadyUploadingLabel: (filename: string) => `${filename} sedang dimuat naik.`,
    duplicateDetectedTitle: 'Mungkin pendua dikesan',
    duplicateDetectedMessage: (filename: string) => `${filename} serupa dengan resit sedia ada.`,
    duplicatePrecheckFailedLabel: 'Semakan pendua gagal.',
    pdfNoPagesLabel: 'Resit PDF tiada halaman.',
    pdfPageQueuedTitle: 'Halaman PDF dimasukkan ke giliran',
    pdfPageQueuedMessage: (filename: string, pageNumber: number, totalPages: number) => `${filename} halaman ${pageNumber} / ${totalPages} dimasukkan ke giliran OCR.`,
    pdfUploadQueuedMessage: (filename: string, count: number) => `${filename}: ${count} halaman PDF dimuat naik. OCR bermula.`,
    pdfUploadQueuedTitle: 'Muat naik PDF dimasukkan ke giliran',
    receiptNotFoundLabel: 'Resit tidak lagi wujud.',
    openNotificationReceiptFailedLabel: 'Gagal membuka resit daripada mesej.',
    retryingLabel: (id: string) => `Mencuba semula API untuk ID: ${id}`,
    deletePromptLabel: 'Sebab padam (blurry_image / duplicate / amount_not_clear / not_receipt / missing_required_info / other)',
    batchDeletePromptLabel: 'Sebab padam kelompok (blurry_image / duplicate / amount_not_clear / not_receipt / missing_required_info / other)',
    deleteDialogTitle: 'Pindah ke senarai dipadam',
    batchDeleteDialogTitle: (count: number) => `Pindah ${count} resit ke senarai dipadam`,
    deleteDialogDescription: (name: string) => `Pilih sebab ${name} dibuang. Akauntan boleh semak dalam Rejected dan salin permintaan muat naik semula.`,
    batchDeleteDialogDescription: (count: number) => `${count} resit akan dikeluarkan dari senarai utama dan sebab padam disimpan dalam Rejected.`,
    deleteReasonLabel: 'Sebab padam',
    deleteReasonOptions: {
      blurry_image: 'Imej kabur',
      duplicate: 'Resit pendua',
      amount_not_clear: 'Amaun tidak jelas',
      not_receipt: 'Bukan resit',
      missing_required_info: 'Maklumat wajib tiada',
      other: 'Lain-lain',
    },
    deleteNoteLabel: 'Nota',
    deleteNotePlaceholder: 'Tambah sebab untuk pelanggan, contohnya foto kabur atau amaun terlindung.',
    confirmDeleteLabel: 'Pindah ke senarai dipadam',
    cancelLabel: 'Batal',
    deleteFailedLabel: 'Padam gagal.',
    receiptMovedRejectedLabel: 'Resit dipindahkan ke senarai dipadam.',
    receiptDeletedTitle: 'Resit dipadam',
    noReceiptsSelectedLabel: 'Tiada resit dipilih.',
    batchDeleteSuccessLabel: (count: number) => `${count} resit dipindahkan ke senarai dipadam.`,
    batchDeleteFinishedLabel: 'Padam kelompok selesai',
    batchDeleteFailedLabel: 'Padam kelompok gagal.',
    batchSyncSuccessLabel: (count: number) => `${count} resit ditanda disegerak.`,
    batchSyncFinishedLabel: 'Segerak kelompok selesai',
    batchSyncFailedLabel: 'Segerak kelompok gagal.',
    receiptRestoredLabel: 'Resit dipulihkan.',
    batchRestoreSuccessLabel: (count: number) => `${count} resit dipulihkan.`,
    batchRestoreFinishedLabel: 'Pulih kelompok selesai',
    batchRestoreFailedLabel: 'Pulih kelompok gagal.',
    fieldPreferencesSavedLabel: 'Keutamaan medan disimpan.',
    fieldPreferencesLocalOnlyLabel: 'Keutamaan medan hanya disimpan setempat.',
    customDocumentTypeSavedLabel: 'Jenis dokumen tersuai disimpan.',
    customDocumentTypeLocalOnlyLabel: 'Jenis dokumen tersuai hanya disimpan setempat.',
    repairProgressLabels: {
      initial: {
        smart: 'Menyediakan huraian pintar',
        vision: 'Menyediakan huraian semula Qwen vision',
        deepseek: 'Menyediakan pembaikan teks DeepSeek',
      },
      waiting: {
        smart: 'Huraian pintar masih berjalan. Sila tunggu.',
        vision: 'Model vision masih berjalan. Sila tunggu.',
        deepseek: 'DeepSeek masih berjalan. Sila tunggu.',
      },
      stages: {
        smart: ['Memuat naik imej dipotong dan menyediakan huraian pintar', 'Qwen vision membaca imej resit', 'Mengekstrak saudagar, medan, jumlah, dan item', 'DeepSeek menyemak struktur dan matematik', 'Menulis ke awan dan menyegarkan halaman semakan'],
        vision: ['Menyediakan imej dipotong dan memanggil Qwen VL', 'Qwen VL membaca imej resit', 'Mengekstrak saudagar, jumlah, dan item', 'DeepSeek menyemak struktur dan matematik', 'Menunggu edge function menulis hasil vision'],
        deepseek: ['Menyambung enjin pembaikan DeepSeek', 'Menghantar teks OCR dan hasil awal', 'Menyusun saudagar, tarikh, jumlah, dan item', 'Menyemak subjumlah, pembundaran, dan jumlah akhir', 'Menunggu edge function menulis hasil'],
      },
    },
  }
};

async function copyTextToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textArea = document.createElement('textarea');
  textArea.value = value;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  textArea.style.opacity = '0';
  document.body.appendChild(textArea);
  textArea.select();

  try {
    if (!document.execCommand('copy')) {
      throw new Error('Copy command was rejected.');
    }
  } finally {
    document.body.removeChild(textArea);
  }
}

export default function App() {
  const [history, setHistory] = useState<any[]>([]);
  const [isReceiptsLoading, setIsReceiptsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'upload' | 'history' | 'rejected'>('upload');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<any>(null);
  const [deletedReceipts, setDeletedReceipts] = useState<any[]>([]);
  const [fieldPreferences, setFieldPreferences] = useState<FieldPreference[]>(() => defaultFieldPreferences());
  const [customDocumentTypes, setCustomDocumentTypes] = useState<string[]>([]);
  const [duplicatePrompt, setDuplicatePrompt] = useState<DuplicatePromptState | null>(null);
  const [selectedDeletedIds, setSelectedDeletedIds] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [uploadList, setUploadList] = useState<any[]>([]);
  const [notifications, setNotifications] = useState(() => loadAppNotifications());
  const [isNotificationCenterOpen, setIsNotificationCenterOpen] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState | null>(null);
  const [smartCropTarget, setSmartCropTarget] = useState<SmartCropTarget | null>(null);
  const [isCropModalBusy, setIsCropModalBusy] = useState(false);
  const [smartParsingReceiptId, setSmartParsingReceiptId] = useState<string | null>(null);
  const [repairProgress, setRepairProgress] = useState<RepairProgress | null>(null);
  const repairProgressTimerRef = useRef<number | null>(null);
  const configPersistenceTimerRef = useRef<number | null>(null);
  const pollingReceiptIdsRef = useRef<Set<string>>(new Set());
  const pendingUploadHashesRef = useRef<Set<string>>(new Set());
  const pendingRealtimeReceiptIdsRef = useRef<Set<string>>(new Set());
  const pendingRealtimeDeletedIdsRef = useRef<Set<string>>(new Set());
  const pendingRealtimeFullRefreshRef = useRef(false);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [toast, setToast] = useState<{message: string, type: 'info' | 'success' | 'error'} | null>(null);
  const [filters, setFilters] = useState({ search: '', status: 'All', docType: 'All', tag: 'All', attention: false });

  const [config, setConfig] = useState(() => {
    const defaultConfig = {
      theme: THEMES[0],
      language: 'zh',
      currency: 'RM',
      colorMode: 'Light',
      notificationSound: false,
      uploadQueueLimit: 10,
      receiptListPageSize: 10,
      fontScale: DEFAULT_FONT_SCALE,
    };
    const saved = localStorage.getItem('my_receipt_config');
    if (!saved) return defaultConfig;
    try {
      const parsed = JSON.parse(saved);
      return {
        ...defaultConfig,
        ...parsed,
        theme: parsed.theme || THEMES[0],
        fontScale: normalizeFontScale(parsed.fontScale),
      };
    } catch {
      return defaultConfig;
    }
  });
  const latestConfigRef = useRef(config);
  const appFontScale = normalizeFontScale(config.fontScale);

  useEffect(() => {
    document.documentElement.style.setProperty('--app-font-scale', String(appFontScale));
    return () => {
      document.documentElement.style.removeProperty('--app-font-scale');
    };
  }, [appFontScale]);

  useEffect(() => {
    latestConfigRef.current = config;
    if (configPersistenceTimerRef.current) {
      window.clearTimeout(configPersistenceTimerRef.current);
    }
    configPersistenceTimerRef.current = window.setTimeout(() => {
      localStorage.setItem('my_receipt_config', JSON.stringify(latestConfigRef.current));
      configPersistenceTimerRef.current = null;
    }, 300);

    return () => {
      if (configPersistenceTimerRef.current) {
        window.clearTimeout(configPersistenceTimerRef.current);
        configPersistenceTimerRef.current = null;
      }
    };
  }, [config]);

  useEffect(() => () => {
    if (configPersistenceTimerRef.current) {
      window.clearTimeout(configPersistenceTimerRef.current);
      configPersistenceTimerRef.current = null;
    }
    localStorage.setItem('my_receipt_config', JSON.stringify(latestConfigRef.current));
  }, []);

  useEffect(() => {
    saveAppNotifications(notifications);
  }, [notifications]);

  useEffect(() => {
    return () => {
      if (repairProgressTimerRef.current) {
        window.clearInterval(repairProgressTimerRef.current);
      }
    };
  }, []);

  const addNotification = useCallback((input: AppNotificationInput) => {
    setNotifications((current) => prependAppNotification(current, createAppNotification(input)));
    playNotificationSound(Boolean(config.notificationSound), input);
  }, [config.notificationSound]);

  // Toast Function
  const showToast = useCallback((
    message: string,
    type: 'info' | 'success' | 'error' = 'info',
    notification?: { persist?: boolean; title?: string; receiptId?: string },
  ) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
    if (notification?.persist) {
      addNotification({
        type,
        title: notification.title || message,
        message,
        receipt_id: notification.receiptId,
      });
    }
  }, [addNotification]);

  const t = useMemo(() => {
    const langMap: any = { 'zh': '中文', 'en': 'English', 'ms': 'Melayu' };
    const langKey = langMap[config.language] || 'English';
    return I18N[langKey];
  }, [config.language]);
  const receiptTableConfig = useMemo(() => ({
    colorMode: config.colorMode,
    currency: config.currency,
  }), [config.colorMode, config.currency]);

  const documentTypeOptions = useMemo(() => {
    const customOptions = customDocumentTypes.filter((name) => !DOC_TYPES.includes(name));
    return [...DOC_TYPES, ...customOptions];
  }, [customDocumentTypes]);

  const isSelectableForBulk = useCallback((receipt: any) => receipt.status === 'Pending' || receipt.status === 'Failed', []);
  const isAuditFieldVisible = useCallback((fieldKey: FieldKey) => isFieldEnabled(fieldPreferences, fieldKey), [fieldPreferences]);
  const enabledFieldKeys = useMemo(
    () => fieldPreferences.filter((preference) => preference.enabled).map((preference) => preference.field_key),
    [fieldPreferences],
  );

  const handleSelectedReceiptChange = (nextReceipt: any) => {
    setSelectedReceipt(nextReceipt);
    setHistory((current) => applyReceiptDraftToCollection(nextReceipt, current));
    setDeletedReceipts((current) => applyReceiptDraftToCollection(nextReceipt, current));
  };

  const syncToDatabase = async (data: any) => {
    try {
      const saved = await saveReceipt(toApiReceipt(data), data.items || []);
      const displayReceipt = toDisplayReceipt({
        ...saved,
        image_url: data.image_url,
        original_image_url: data.original_image_url,
        processed_image_url: data.processed_image_url,
      });
      setHistory((current) => current.map((item) => item.id === displayReceipt.id ? displayReceipt : item));
      setSelectedReceipt((current: any) => keepSyncedReceiptSelected(current, displayReceipt));
      showToast("Synced to Supabase Successfully!", "success", {
        persist: true,
        title: 'Receipt synced',
        receiptId: displayReceipt.id,
      });
    } catch (err) {
      console.error("Supabase sync error:", err);
      showToast("Supabase sync failed.", "error", {
        persist: true,
        title: 'Receipt sync failed',
        receiptId: data.id,
      });
    }
  };

  const buildDisplayReceipt = async (receipt: any, fallbackImageUrl?: string | null) => {
    const [originalSignedUrl, processedSignedUrl] = await Promise.all([
      createReceiptFileSignedUrl(receipt.file_path),
      createReceiptFileSignedUrl(receipt.processed_file_path || null),
    ]);
    return toDisplayReceipt({
      ...receipt,
      image_url: processedSignedUrl || originalSignedUrl || fallbackImageUrl || null,
      original_image_url: originalSignedUrl,
      processed_image_url: processedSignedUrl,
    });
  };

  const upsertHistoryReceipt = (displayReceipt: any) => {
    setHistory((current) => [displayReceipt, ...current.filter((receipt) => receipt.id !== displayReceipt.id)]);
    setSelectedReceipt((current: any) => current?.id === displayReceipt.id ? displayReceipt : current);
  };

  const removeReceiptSnapshot = (receiptId: string) => {
    setHistory((current) => current.filter((receipt) => receipt.id !== receiptId));
    setDeletedReceipts((current) => current.filter((receipt) => receipt.id !== receiptId));
    setSelectedReceipt((current: any) => current?.id === receiptId ? null : current);
  };

  const refreshReceiptSnapshot = async (receiptId: string) => {
    const receipt = await getReceipt(receiptId);
    if (!receipt) {
      removeReceiptSnapshot(receiptId);
      return;
    }

    const displayReceipt = await buildDisplayReceipt(receipt);
    if (receipt.deleted_at) {
      setHistory((current) => current.filter((item) => item.id !== receiptId));
      setDeletedReceipts((current) => [displayReceipt, ...current.filter((item) => item.id !== receiptId)]);
      setSelectedReceipt((current: any) => current?.id === receiptId ? displayReceipt : current);
      return;
    }

    setDeletedReceipts((current) => current.filter((item) => item.id !== receiptId));
    upsertHistoryReceipt(displayReceipt);
    if (receipt.status === 'processing') {
      startReceiptResultPolling(receipt.id);
    }
  };

  const startReceiptResultPolling = (receiptId: string, fallbackImageUrl?: string | null, uploadId?: string) => {
    if (pollingReceiptIdsRef.current.has(receiptId)) return;
    pollingReceiptIdsRef.current.add(receiptId);

    void (async () => {
      try {
        const finalReceipt = await pollReceiptUntilParsed(receiptId, {
          intervalMs: 1800,
          timeoutMs: 90000,
          onPoll: (receipt) => {
            if (receipt.status === 'processing' || receipt.status === 'uploaded') {
              if (uploadId) {
                setUploadList((old: any[]) => old.map((item) => item.id === uploadId
                  ? { ...item, progress: Math.min(88, Math.max(item.progress || 0, 68)), status: 'OCR parsing in background' }
                  : item));
              }
            }
          },
        });
        const displayReceipt = await buildDisplayReceipt(finalReceipt, fallbackImageUrl);
        upsertHistoryReceipt(displayReceipt);
        if (finalReceipt.status === 'failed') {
          showToast(finalReceipt.error_message || 'OCR parsing failed.', 'error', {
            persist: true,
            title: 'OCR failed',
            receiptId: finalReceipt.id,
          });
        } else {
          showToast(`${displayReceipt.display_filename || finalReceipt.filename || 'Receipt'} OCR finished.`, 'success', {
            persist: true,
            title: 'OCR finished',
            receiptId: finalReceipt.id,
          });
        }
      } catch (error) {
        console.error('Receipt polling failed:', error);
        showToast(error instanceof Error ? error.message : 'OCR parsing is still running.', 'info', {
          persist: true,
          title: 'OCR still running',
          receiptId,
        });
      } finally {
        pollingReceiptIdsRef.current.delete(receiptId);
        if (uploadId) {
          setUploadList((old: any[]) => old.filter((item) => item.id !== uploadId));
        }
        if (fallbackImageUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(fallbackImageUrl);
        }
      }
    })();
  };

  const handleAsyncParseError = useCallback((message: string, receiptId: string) => {
    showToast(message || t.uploadFailedLabel, 'error', {
      persist: true,
      title: t.warningLabels?.ocr_failed || t.uploadFailedTitle,
      receiptId,
    });
    void refreshReceiptSnapshot(receiptId).catch((error) => {
      console.error('Failed to refresh receipt after async parse error:', error);
    });
  }, [showToast, t]);

  useEffect(() => {
    let refreshTimer: number | null = null;
    let realtimeChannel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;
    let isRealtimeEffectActive = true;

    const loadData = async () => {
      try {
        const [data, deletedData, preferences, documentTypes] = await Promise.all([
          listReceipts(),
          listDeletedReceipts(),
          listFieldPreferences().catch(() => defaultFieldPreferences()),
          listCustomDocumentTypes().catch(() => []),
        ]);
        const displayData = await Promise.all(data.map((receipt) => buildDisplayReceipt(receipt)));
        const deletedDisplayData = await Promise.all(deletedData.map((receipt) => buildDisplayReceipt(receipt)));
        setHistory(displayData);
        setDeletedReceipts(deletedDisplayData);
        setFieldPreferences(mergeFieldPreferences(preferences));
        setCustomDocumentTypes(documentTypes.map((item: any) => item.name));
        data
          .filter((receipt) => receipt.status === 'processing')
          .forEach((receipt) => startReceiptResultPolling(receipt.id));
      } catch (error) {
        console.error('Error loading receipts:', error);
        showToast('Failed to load Supabase receipts.', 'error', { persist: true, title: 'Receipt list failed to load' });
      } finally {
        setIsReceiptsLoading(false);
      }
    };
    loadData();

    if (supabase) {
      void supabase.auth.getUser().then(({ data }) => {
        if (!isRealtimeEffectActive || !data.user || !supabase) return;
        const channel = supabase
          .channel(`receipts-${data.user.id}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'receipts', filter: `user_id=eq.${data.user.id}` },
            (payload) => {
              const receiptId = String((payload.new as any)?.id || (payload.old as any)?.id || '');
              if (!receiptId) {
                pendingRealtimeFullRefreshRef.current = true;
              } else if (payload.eventType === 'DELETE') {
                pendingRealtimeDeletedIdsRef.current.add(receiptId);
                pendingRealtimeReceiptIdsRef.current.delete(receiptId);
              } else {
                pendingRealtimeReceiptIdsRef.current.add(receiptId);
              }

              if (refreshTimer) window.clearTimeout(refreshTimer);
              refreshTimer = window.setTimeout(() => {
                const deletedIds = Array.from(pendingRealtimeDeletedIdsRef.current) as string[];
                const receiptIds = (Array.from(pendingRealtimeReceiptIdsRef.current) as string[])
                  .filter((id) => !pendingRealtimeDeletedIdsRef.current.has(id));
                const needsFullRefresh = pendingRealtimeFullRefreshRef.current;
                pendingRealtimeDeletedIdsRef.current.clear();
                pendingRealtimeReceiptIdsRef.current.clear();
                pendingRealtimeFullRefreshRef.current = false;

                deletedIds.forEach(removeReceiptSnapshot);
                if (needsFullRefresh) {
                  void loadData();
                  return;
                }
                if (receiptIds.length === 0) {
                  return;
                }
                void Promise.all(receiptIds.map((id) => refreshReceiptSnapshot(id))).catch((error) => {
                  console.error('Realtime receipt refresh failed:', error);
                  void loadData();
                });
              }, 600);
            },
          );
        realtimeChannel = channel;
        void channel.subscribe();
      });
    }

    return () => {
      isRealtimeEffectActive = false;
      if (refreshTimer) window.clearTimeout(refreshTimer);
      if (supabase && realtimeChannel) {
        void supabase.removeChannel(realtimeChannel);
      }
    };
  }, []);

  const filteredHistory = useMemo(() => filterReceiptQueue(history, filters), [history, filters]);
  const receiptQueueStats = useMemo(() => summarizeReceiptQueue(history), [history]);
  const queueQuickFilters = useMemo(() => [
    { key: 'all', label: t.queueFilterAllLabel, count: receiptQueueStats.active, status: 'All', attention: false },
    { key: 'attention', label: t.queueFilterAttentionLabel, count: receiptQueueStats.attention, status: 'All', attention: true },
    { key: 'ready', label: t.queueFilterReadyLabel, count: receiptQueueStats.ready, status: 'Pending', attention: false },
    { key: 'processing', label: t.queueFilterProcessingLabel, count: receiptQueueStats.processing, status: 'Processing', attention: false },
    { key: 'failed', label: t.queueFilterFailedLabel, count: receiptQueueStats.failed, status: 'Failed', attention: false },
  ], [receiptQueueStats, t]);

  useEffect(() => {
    setSelectedRowIds((current) => constrainSelectionToVisible(current, filteredHistory));
  }, [filteredHistory]);

  const handleToggleSelectAll = useCallback(() => {
    const currentPendingIds = filteredHistory.filter(isSelectableForBulk).map(h => h.id);
    if (selectedRowIds.length === currentPendingIds.length) {
      setSelectedRowIds([]);
    } else {
      setSelectedRowIds(currentPendingIds);
    }
  }, [filteredHistory, isSelectableForBulk, selectedRowIds.length]);

  const handleToggleSelectRow = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const receipt = history.find((item) => item.id === id);
    if (receipt && !isSelectableForBulk(receipt)) return;
    setSelectedRowIds(prev =>
      prev.includes(id) ? prev.filter(rowId => rowId !== id) : [...prev, id]
    );
  }, [history, isSelectableForBulk]);

  const handleExport = async (singleItem: any = null) => {
    if (isExporting) return;
    let dataToExport = [];
    if (singleItem) {
       dataToExport = [singleItem]; 
    } else if (selectedRowIds.length > 0) {
       dataToExport = filteredHistory.filter(h => selectedRowIds.includes(h.id)); 
    } else {
       dataToExport = filteredHistory; 
    }

    if (dataToExport.length === 0) {
       showToast(t.noPending, 'info');
       return;
    }

    setIsExporting(true);
    try {
      await downloadReceiptsXlsx(dataToExport.map(toApiReceipt), undefined, { fieldPreferences });
      showToast(`Successfully Exported ${dataToExport.length} Records!`, 'success', {
        persist: true,
        title: 'Excel export finished',
      });
      setSelectedRowIds([]);
    } catch (error) {
      console.error('Export failed:', error);
      showToast('Export failed.', 'error', { persist: true, title: 'Excel export failed' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyText = useCallback(async (value: string | null | undefined, label: string, event?: React.MouseEvent) => {
    event?.stopPropagation();
    if (!value) {
      showToast(`${label} is empty.`, 'info');
      return;
    }
    try {
      await copyTextToClipboard(value);
      showToast(`${label} copied.`, 'success');
    } catch (error) {
      console.error('Copy failed:', error);
      showToast(`Failed to copy ${label}.`, 'error');
    }
  }, [showToast]);

  const handleSignOut = async () => {
    await supabase?.auth.signOut();
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files).slice(0, 20) as File[];
    e.target.value = '';

    const invalid = files.map(validateReceiptFile).find(Boolean);
    if (invalid) {
      showToast(invalid, 'error');
      return;
    }

    files.forEach((file) => {
      const uploadId = Math.random().toString(36).slice(2, 11);
      const previewUrl = URL.createObjectURL(file);
      setUploadList((prev) => [{
        id: uploadId,
        name: file.name,
        status: 'Preparing upload',
        progress: 8,
        image_url: previewUrl,
        file,
      }, ...prev]);
      void prepareReceiptUpload(file, uploadId, previewUrl);
    });
  };

  const prepareReceiptUpload = async (file: File, uploadId: string, previewUrl: string) => {
    let reservedHash: string | null = null;
    try {
      setUploadList((old: any[]) => old.map((item) => item.id === uploadId
        ? { ...item, progress: 14, status: 'Checking duplicate file' }
        : item));

      const [fileHash, perceptualHash] = await Promise.all([
        computeFileSha256(file),
        computeImageAverageHash(file),
      ]);

      if (pendingUploadHashesRef.current.has(fileHash)) {
        URL.revokeObjectURL(previewUrl);
        setUploadList((old: any[]) => old.filter((item) => item.id !== uploadId));
        showToast(typeof t.duplicateAlreadyUploadingLabel === 'function' ? t.duplicateAlreadyUploadingLabel(file.name) : `${file.name} is already uploading.`, 'info');
        return;
      }

      pendingUploadHashesRef.current.add(fileHash);
      reservedHash = fileHash;

      let renderedPdfPages: ProcessedReceiptImage[] | undefined;
      const duplicateFileHashes = [fileHash];
      if (isPdfReceiptFile(file)) {
        setUploadList((old: any[]) => old.map((item) => item.id === uploadId
          ? { ...item, progress: 18, status: 'Rendering PDF pages' }
          : item));
        renderedPdfPages = await renderPdfPagesToReceiptImages(file);
        if (renderedPdfPages.length === 0) {
          throw new Error(t.pdfNoPagesLabel)
        }
        duplicateFileHashes.push(buildPdfPageFileHash(fileHash, renderedPdfPages[0].metadata.source_page || 1));
      }

      const candidateGroups = await Promise.all(duplicateFileHashes.map((duplicateFileHash) => findDuplicateCandidates({
        fileHash: duplicateFileHash,
        receipt: perceptualHash ? { image_processing: { perceptual_hash: perceptualHash } } : null,
      })));
      const candidates = Array.from(
        new Map(candidateGroups.flat().map((candidate) => [candidate.receipt.id, candidate])).values(),
      ).sort((left, right) => right.score - left.score);
      if (candidates.length > 0) {
        setUploadList((old: any[]) => old.filter((item) => item.id !== uploadId));
        setDuplicatePrompt({ file, previewUrl, fileHash, perceptualHash, candidates, renderedPdfPages });
        addNotification({
          type: 'warning',
          title: t.duplicateDetectedTitle,
          message: typeof t.duplicateDetectedMessage === 'function' ? t.duplicateDetectedMessage(file.name) : `${file.name} looks similar to an existing receipt.`,
          receipt_id: candidates[0]?.receipt.id,
        });
        return;
      }
      setUploadList((old: any[]) => old.map((item) => item.id === uploadId
        ? { ...item, progress: 18, status: isPdfReceiptFile(file) ? 'Preparing PDF pages for OCR' : 'Reading QR and metadata' }
        : item));
      await uploadOriginalReceipt(file, previewUrl, undefined, fileHash, perceptualHash, uploadId, renderedPdfPages);
    } catch (error) {
      if (reservedHash) pendingUploadHashesRef.current.delete(reservedHash);
      URL.revokeObjectURL(previewUrl);
      setUploadList((old: any[]) => old.map((item) => item.id === uploadId ? { ...item, status: 'Failed', progress: 100 } : item));
      console.error('Duplicate precheck failed:', error);
      showToast(error instanceof Error ? error.message : t.duplicatePrecheckFailedLabel, 'error', {
        persist: true,
        title: t.duplicatePrecheckFailedLabel,
      });
    }
  };

  const continueDuplicateUpload = async () => {
    const prompt = duplicatePrompt;
    if (!prompt) return;
    setDuplicatePrompt(null);
    try {
      void uploadOriginalReceipt(prompt.file, prompt.previewUrl, undefined, prompt.fileHash, prompt.perceptualHash, undefined, prompt.renderedPdfPages);
    } catch (error) {
      pendingUploadHashesRef.current.delete(prompt.fileHash);
      URL.revokeObjectURL(prompt.previewUrl);
      console.error('QR decode failed:', error);
      showToast(error instanceof Error ? error.message : t.uploadFailedLabel, 'error');
    }
  };

  const cancelDuplicateUpload = () => {
    if (duplicatePrompt?.previewUrl) URL.revokeObjectURL(duplicatePrompt.previewUrl);
    if (duplicatePrompt?.fileHash) pendingUploadHashesRef.current.delete(duplicatePrompt.fileHash);
    setDuplicatePrompt(null);
  };

  const openDuplicateCandidate = (id: string) => {
    if (duplicatePrompt?.previewUrl) URL.revokeObjectURL(duplicatePrompt.previewUrl);
    if (duplicatePrompt?.fileHash) pendingUploadHashesRef.current.delete(duplicatePrompt.fileHash);
    setDuplicatePrompt(null);
    const existing = history.find((item) => item.id === id) || deletedReceipts.find((item) => item.id === id);
    if (existing) setSelectedReceipt(existing);
  };

  const handleOpenNotificationReceipt = async (receiptId: string) => {
    setNotifications((current) => current.map((notification) => (
      notification.receipt_id === receiptId && !notification.read_at
        ? { ...notification, read_at: new Date().toISOString() }
        : notification
    )));
    setIsNotificationCenterOpen(false);

    const existing = history.find((item) => item.id === receiptId);
    if (existing) {
      setActiveTab('upload');
      setSelectedReceipt(existing);
      return;
    }

    const deleted = deletedReceipts.find((item) => item.id === receiptId);
    if (deleted) {
      setActiveTab('rejected');
      setSelectedReceipt(deleted);
      return;
    }

    try {
      const receipt = await getReceipt(receiptId);
      if (!receipt) {
        showToast(t.receiptNotFoundLabel, 'info');
        return;
      }
      const displayReceipt = await buildDisplayReceipt(receipt);
      if (receipt.deleted_at) {
        setActiveTab('rejected');
        setDeletedReceipts((current) => [displayReceipt, ...current.filter((item) => item.id !== receiptId)]);
      } else {
        setActiveTab('upload');
        upsertHistoryReceipt(displayReceipt);
      }
      setSelectedReceipt(displayReceipt);
    } catch (error) {
      console.error('Failed to open notification receipt:', error);
      showToast(t.openNotificationReceiptFailedLabel, 'error');
    }
  };

  const uploadPdfReceiptPages = async (
    file: File,
    uploadId: string,
    baseFileHash: string | null | undefined,
    renderedPdfPages?: ProcessedReceiptImage[],
  ) => {
    let renderedPages = renderedPdfPages;
    if (!renderedPages) {
      setUploadList((old: any[]) => old.map(u => u.id === uploadId ? { ...u, progress: 28, status: 'Rendering PDF pages' } : u));
      renderedPages = await renderPdfPagesToReceiptImages(file);
    }
    if (renderedPages.length === 0) {
      throw new Error(t.pdfNoPagesLabel);
    }

    const totalPages = renderedPages.length;
    const createdReceipts: string[] = [];
    setUploadList((old: any[]) => old.map(u => u.id === uploadId ? { ...u, progress: 32, status: `PDF rendered: ${totalPages} page${totalPages > 1 ? 's' : ''}` } : u));

    for (let index = 0; index < totalPages; index += 1) {
      const rendered = renderedPages[index];
      const pageNumber = rendered.metadata.source_page || index + 1;
      const progress = Math.min(86, 36 + Math.round(((index + 1) / totalPages) * 40));
      setUploadList((old: any[]) => old.map(u => u.id === uploadId
        ? { ...u, progress, status: `Uploading PDF page ${pageNumber} of ${totalPages}` }
        : u));

      const pagePerceptualHash = await computeImageAverageHash(rendered.file).catch(() => null);
      const effectiveQrPayload = await decodeQrPayloadFromImageFile(rendered.file);
      const imageProcessing = {
        ...rendered.metadata,
        ...(baseFileHash ? { source_file_hash: baseFileHash } : {}),
        ...(pagePerceptualHash ? { perceptual_hash: pagePerceptualHash } : {}),
      };
      const pageHash = baseFileHash ? buildPdfPageFileHash(baseFileHash, pageNumber) : null;
      const result = await createReceiptFromFile(file, {
        processedFile: rendered.file,
        imageProcessing,
        fileHash: pageHash,
        autoParse: true,
        awaitParse: false,
        onAsyncParseError: handleAsyncParseError,
        parseMode: 'ocr',
        enabledFieldKeys,
        docType: looksLikeEInvoiceQrPayload(effectiveQrPayload) ? 'E-invoice' : null,
        qrPayload: effectiveQrPayload,
      });

      createdReceipts.push(result.receipt.id);
      const pagePreviewUrl = URL.createObjectURL(rendered.file);
      const displayReceipt = await buildDisplayReceipt(result.receipt, pagePreviewUrl);
      upsertHistoryReceipt(displayReceipt);
      addNotification({
        type: 'info',
        title: t.pdfPageQueuedTitle,
        message: typeof t.pdfPageQueuedMessage === 'function' ? t.pdfPageQueuedMessage(file.name, pageNumber, totalPages) : `${file.name} page ${pageNumber} of ${totalPages} is queued for OCR.`,
        receipt_id: result.receipt.id,
      });
      startReceiptResultPolling(result.receipt.id, pagePreviewUrl);
    }

    setUploadList((old: any[]) => old.filter((item) => item.id !== uploadId));
    showToast(typeof t.pdfUploadQueuedMessage === 'function' ? t.pdfUploadQueuedMessage(file.name, createdReceipts.length) : `${file.name}: ${createdReceipts.length} PDF page${createdReceipts.length > 1 ? 's' : ''} uploaded. OCR started.`, 'success', {
      persist: true,
      title: t.pdfUploadQueuedTitle,
    });
  };

  const uploadOriginalReceipt = async (
    file: File,
    existingPreviewUrl?: string,
    qrPayload?: string | null,
    fileHash?: string | null,
    perceptualHash?: string | null,
    existingUploadId?: string,
    renderedPdfPages?: ProcessedReceiptImage[],
  ) => {
    const uploadId = existingUploadId || Math.random().toString(36).slice(2, 11);
    const previewUrl = existingPreviewUrl || URL.createObjectURL(file);
    let displayPreviewUrl = previewUrl;
    let processedFile: File | null = null;
    let imageProcessing: (Partial<ImageProcessingMetadata> & Record<string, unknown>) | null = null;
    let originalPreviewUrlToRevoke: string | null = null;
    if (existingUploadId) {
      setUploadList((old: any[]) => old.map((item) => item.id === uploadId
        ? { ...item, status: 'Uploading original receipt', progress: 20 }
        : item));
    } else {
      setUploadList((prev) => [{
        id: uploadId,
        name: file.name,
        status: 'Uploading original receipt',
        progress: 20,
        image_url: previewUrl,
        file,
      }, ...prev]);
    }

    try {
      let ocrSourceFile = file;
      let effectivePerceptualHash = perceptualHash;
      if (isPdfReceiptFile(file)) {
        if (previewUrl.startsWith('blob:')) originalPreviewUrlToRevoke = previewUrl;
        await uploadPdfReceiptPages(file, uploadId, fileHash, renderedPdfPages);
        return;
      } else {
        imageProcessing = effectivePerceptualHash ? { perceptual_hash: effectivePerceptualHash } : null;
      }

      const effectiveQrPayload = qrPayload === undefined
        ? await decodeQrPayloadFromImageFile(ocrSourceFile)
        : qrPayload;
      const result = await createReceiptFromFile(file, {
        processedFile,
        imageProcessing,
        fileHash,
        autoParse: true,
        awaitParse: false,
        onAsyncParseError: handleAsyncParseError,
        parseMode: 'ocr',
        enabledFieldKeys,
        docType: looksLikeEInvoiceQrPayload(effectiveQrPayload) ? 'E-invoice' : null,
        qrPayload: effectiveQrPayload,
      });
      setUploadList((old: any[]) => old.map(u => u.id === uploadId ? { ...u, progress: 62, status: 'OCR parsing in background' } : u));
      const displayReceipt = await buildDisplayReceipt(result.receipt, displayPreviewUrl);

      upsertHistoryReceipt(displayReceipt);
      showToast(typeof t.uploadQueuedMessage === 'function' ? t.uploadQueuedMessage(file.name) : `${file.name} uploaded. OCR started.`, 'success', {
        persist: true,
        title: t.uploadQueuedTitle,
        receiptId: result.receipt.id,
      });
      startReceiptResultPolling(result.receipt.id, displayPreviewUrl, uploadId);
    } catch (error) {
      console.error('Receipt upload failed:', error);
      setUploadList((old: any[]) => old.map(u => u.id === uploadId ? { ...u, status: 'Failed', progress: 100 } : u));
      showToast(error instanceof Error ? error.message : t.uploadFailedLabel, 'error', {
        persist: true,
        title: t.uploadFailedTitle,
      });
      URL.revokeObjectURL(previewUrl);
      if (displayPreviewUrl !== previewUrl && displayPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(displayPreviewUrl);
      }
    } finally {
      if (fileHash) pendingUploadHashesRef.current.delete(fileHash);
      if (originalPreviewUrlToRevoke) URL.revokeObjectURL(originalPreviewUrlToRevoke);
    }
  };

  const handleRetry = useCallback((id: string) => {
    showToast(typeof t.retryingLabel === 'function' ? t.retryingLabel(id) : `Retrying API for ID: ${id}`, 'info');
    setHistory(history.filter(h => h.id !== id));
  }, [history, showToast, t]);

  const clearRepairProgressTimer = () => {
    if (repairProgressTimerRef.current) {
      window.clearInterval(repairProgressTimerRef.current);
      repairProgressTimerRef.current = null;
    }
  };

  const startRepairProgress = (receiptId: string, mode: RepairProgress['mode'] = 'deepseek') => {
    const repairLabels = t.repairProgressLabels || {};
    const stageTexts = repairLabels.stages?.[mode];
    const stages = mode === 'smart'
      ? [
        { percent: 12, label: stageTexts?.[0] || '上传裁剪图并准备智能解析' },
        { percent: 28, label: stageTexts?.[1] || 'Qwen 视觉模型正在读取票据图片' },
        { percent: 48, label: stageTexts?.[2] || '抽取商户、字段、金额和明细' },
        { percent: 68, label: stageTexts?.[3] || 'DeepSeek 正在校验结构和数学校验' },
        { percent: 88, label: stageTexts?.[4] || '写回云端并刷新审核页' },
      ]
      : mode === 'vision'
      ? [
        { percent: 14, label: stageTexts?.[0] || '准备裁剪图并调用 Qwen VL' },
        { percent: 32, label: stageTexts?.[1] || 'Qwen VL 正在读取票据图片' },
        { percent: 52, label: stageTexts?.[2] || '提取商户、金额和商品明细' },
        { percent: 72, label: stageTexts?.[3] || 'DeepSeek 校验结构和数学校验' },
        { percent: 88, label: stageTexts?.[4] || '等待云函数写回视觉结果' },
      ]
      : [
        { percent: 18, label: stageTexts?.[0] || '连接 DeepSeek 修复引擎' },
        { percent: 34, label: stageTexts?.[1] || '发送 OCR 原文和初始结果' },
        { percent: 56, label: stageTexts?.[2] || '重排商户、日期、金额和明细' },
        { percent: 74, label: stageTexts?.[3] || '校验小计、舍入和总额' },
        { percent: 86, label: stageTexts?.[4] || '等待云函数写回结果' },
      ];
    let stageIndex = 0;

    clearRepairProgressTimer();
    setRepairProgress({
      receiptId,
      mode,
      percent: 8,
      label: repairLabels.initial?.[mode] || (mode === 'smart' ? '准备智能解析' : mode === 'vision' ? '准备 Qwen 视觉重解析' : '准备 DeepSeek 文本修复'),
    });

    repairProgressTimerRef.current = window.setInterval(() => {
      const nextStage = stages[stageIndex];
      if (!nextStage) {
        setRepairProgress((current) => {
          if (!current || current.receiptId !== receiptId) return current;
          return {
            receiptId,
            mode,
            percent: Math.min(90, current.percent + 1),
            label: repairLabels.waiting?.[mode] || (mode === 'smart' ? '智能解析仍在处理，请稍候' : mode === 'vision' ? '视觉模型仍在处理，请稍候' : 'DeepSeek 仍在处理，请稍候'),
          };
        });
        return;
      }
      setRepairProgress({ receiptId, mode, ...nextStage });
      stageIndex += 1;
    }, 1100);
  };

  const handleSmartParse = async () => {
    if (!selectedReceipt?.id || smartParsingReceiptId) return;

    const imageUrl = selectedReceipt.mime_type === 'application/pdf'
      ? selectedReceipt.processed_image_url || selectedReceipt.image_url
      : selectedReceipt.original_image_url || selectedReceipt.image_url;
    if (!imageUrl) {
      showToast(t.noImageToParseLabel, 'error');
      return;
    }

    try {
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error(t.loadOriginalFailedLabel);
      const blob = await response.blob();
      const file = new File([blob], selectedReceipt.filename || `${selectedReceipt.id}.jpg`, {
        type: blob.type || selectedReceipt.mime_type || 'image/jpeg',
      });
      setSmartCropTarget({ receipt: selectedReceipt, file });
    } catch (error) {
      console.error('Failed to prepare smart parse crop:', error);
      showToast(error instanceof Error ? error.message : t.prepareSmartParseFailedLabel, 'error');
    }
  };

  const handleSmartCropConfirm = (result: { processedFile: File | null; imageProcessing: ImageProcessingMetadata | null }) => {
    const target = smartCropTarget;
    if (!target) return;

    setSmartCropTarget(null);
    setIsCropModalBusy(false);
    void runSmartParse(target.receipt, result.processedFile, result.imageProcessing);
  };

  const runSmartParse = async (
    receipt: any,
    processedFile: File | null,
    imageProcessing: ImageProcessingMetadata | null,
  ) => {
    const receiptId = receipt.id;
    const currentImageUrl = receipt.image_url;
    const currentOriginalImageUrl = receipt.original_image_url;
    const currentProcessedImageUrl = receipt.processed_image_url;

    setSmartParsingReceiptId(receiptId);
    startRepairProgress(receiptId, 'smart');
    setSelectedReceipt(null);
    setHistory((current) => current.map((item) => item.id === receiptId ? { ...item, status: 'Processing', processing_stage: 'ai_extracting' } : item));
    showToast(t.smartParseStartedLabel, 'info', {
      persist: true,
      title: t.smartParseStartedTitle,
      receiptId,
    });

    try {
      if (processedFile && imageProcessing) {
        const updated = await uploadProcessedReceiptImage(receiptId, processedFile, imageProcessing);
        const displayProcessingReceipt = await buildDisplayReceipt(updated, currentImageUrl);
        setHistory((current) => current.map((item) => item.id === displayProcessingReceipt.id ? {
          ...displayProcessingReceipt,
          status: 'Processing',
          processing_stage: 'ai_extracting',
        } : item));
      } else {
        setHistory((current) => current.map((item) => item.id === receiptId ? { ...item, status: 'Processing' } : item));
      }

      const result = await smartParseReceipt(receiptId, {
        docType: receipt.doc_type,
        enabledFieldKeys,
        qrPayload: receipt.extra_fields?.qr_payload,
      });
      clearRepairProgressTimer();
      setRepairProgress({ receiptId, mode: 'smart', percent: 94, label: t.smartParseSyncLabel });
      const originalSignedUrl = await createReceiptFileSignedUrl(result.receipt.file_path);
      const processedSignedUrl = await createReceiptFileSignedUrl(result.receipt.processed_file_path || null);
      const displayReceipt = toDisplayReceipt({
        ...result.receipt,
        image_url: processedSignedUrl || originalSignedUrl || currentImageUrl,
        original_image_url: originalSignedUrl || currentOriginalImageUrl,
        processed_image_url: processedSignedUrl || currentProcessedImageUrl,
      });

      setHistory((current) => current.map((item) => item.id === displayReceipt.id ? displayReceipt : item));
      setRepairProgress({ receiptId, mode: 'smart', percent: 100, label: result.parseError ? t.smartParseReturnedErrorLabel : t.smartParseFinishedLabel });
      showToast(result.parseError || `${displayReceipt.merchant_name || displayReceipt.filename || 'Receipt'} ${t.smartParseFinishedLabel}.`, result.parseError ? 'error' : 'success', {
        persist: true,
        title: result.parseError ? t.smartParseFailedLabel : t.smartParseFinishedLabel,
        receiptId,
      });
    } catch (error) {
      console.error('Smart parse failed:', error);
      clearRepairProgressTimer();
      setRepairProgress({ receiptId, mode: 'smart', percent: 100, label: t.smartParseFailedLabel });
      setHistory((current) => current.map((item) => item.id === receiptId ? { ...item, status: receipt.status || 'Uploaded' } : item));
      showToast(error instanceof Error ? error.message : t.smartParseFailedLabel, 'error', {
        persist: true,
        title: t.smartParseFailedLabel,
        receiptId,
      });
    } finally {
      setSmartParsingReceiptId(null);
      window.setTimeout(() => {
        setRepairProgress((current) => current?.receiptId === receiptId ? null : current);
      }, 1800);
    }
  };

  const handleDelete = useCallback(async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setDeleteDialog({ mode: 'soft', ids: [id], defaultReason: 'other', isSubmitting: false });
  }, []);

  const handleBatchDelete = async () => {
    const targets = history.filter((item) => selectedRowIds.includes(item.id));
    if (targets.length === 0) {
      showToast(t.noReceiptsSelectedLabel, 'info');
      return;
    }

    setDeleteDialog({ mode: 'soft', ids: targets.map((item) => item.id), defaultReason: 'duplicate', isSubmitting: false });
  };

  const handleBatchMarkSynced = async () => {
    const targets = history.filter((item) => selectedRowIds.includes(item.id));
    if (targets.length === 0) {
      showToast(t.noReceiptsSelectedLabel, 'info');
      return;
    }

    try {
      const updatedReceipts = await Promise.all(
        targets.map((item) => saveReceipt(toApiReceipt({ ...item, status: 'Synced' }), item.items || [])),
      );
      const displayReceipts = await Promise.all(updatedReceipts.map((receipt) => buildDisplayReceipt(receipt)));
      setHistory((current) => current.map((item) => displayReceipts.find((updated) => updated.id === item.id) || item));
      setSelectedReceipt((current: any) => displayReceipts.find((updated) => updated.id === current?.id) || current);
      setSelectedRowIds([]);
      showToast(typeof t.batchSyncSuccessLabel === 'function' ? t.batchSyncSuccessLabel(targets.length) : `${targets.length} receipts marked as synced.`, 'success', {
        persist: true,
        title: t.batchSyncFinishedLabel,
      });
    } catch (error) {
      console.error('Batch mark synced failed:', error);
      showToast(t.batchSyncFailedLabel, 'error', { persist: true, title: t.batchSyncFailedLabel });
    }
  };

  const handleRestoreDeleted = async (id: string) => {
    try {
      const restored = await restoreReceipt(id);
      const displayReceipt = await buildDisplayReceipt(restored);
      setDeletedReceipts((current) => current.filter((item) => item.id !== id));
      upsertHistoryReceipt(displayReceipt);
      setSelectedDeletedIds((current) => current.filter((itemId) => itemId !== id));
      if (selectedReceipt?.id === id) setSelectedReceipt(displayReceipt);
      showToast(t.receiptRestoredLabel, 'success', { persist: true, title: t.receiptRestoredLabel, receiptId: id });
    } catch (error) {
      console.error('Restore failed:', error);
      showToast(t.restoreFailedLabel, 'error', { persist: true, title: t.restoreFailedLabel, receiptId: id });
    }
  };

  const handlePermanentDelete = async (id: string) => {
    setDeleteDialog({ mode: 'permanent', ids: [id], isSubmitting: false });
  };

  const handleBatchRestoreDeleted = async () => {
    const targets = deletedReceipts.filter((item) => selectedDeletedIds.includes(item.id));
    if (targets.length === 0) {
      showToast(t.noDeletedSelectedLabel, 'info');
      return;
    }

    try {
      const restoredReceipts = await Promise.all(targets.map((item) => restoreReceipt(item.id)));
      const displayReceipts = await Promise.all(restoredReceipts.map((receipt) => buildDisplayReceipt(receipt)));
      setDeletedReceipts((current) => current.filter((item) => !selectedDeletedIds.includes(item.id)));
      setHistory((current) => [
        ...displayReceipts,
        ...current.filter((item) => !displayReceipts.some((restored) => restored.id === item.id)),
      ]);
      setSelectedDeletedIds([]);
      showToast(typeof t.batchRestoreSuccessLabel === 'function' ? t.batchRestoreSuccessLabel(targets.length) : `${targets.length} receipts restored.`, 'success', {
        persist: true,
        title: t.batchRestoreFinishedLabel,
      });
    } catch (error) {
      console.error('Batch restore failed:', error);
      showToast(t.batchRestoreFailedLabel, 'error', { persist: true, title: t.batchRestoreFailedLabel });
    }
  };

  const handleBatchPermanentDelete = async () => {
    const targets = deletedReceipts.filter((item) => selectedDeletedIds.includes(item.id));
    if (targets.length === 0) {
      showToast(t.noDeletedSelectedLabel, 'info');
      return;
    }
    setDeleteDialog({ mode: 'permanent', ids: targets.map((item) => item.id), isSubmitting: false });
  };

  const handleConfirmDeleteDialog = async ({ reason = 'other', note }: DeleteDialogSubmitPayload) => {
    if (!deleteDialog || deleteDialog.ids.length === 0) return;
    const ids = deleteDialog.ids;
    const idSet = new Set(ids);
    const trimmedNote = note?.trim() || undefined;

    setDeleteDialog((current) => current ? { ...current, isSubmitting: true } : current);

    if (deleteDialog.mode === 'soft') {
      const targets = history.filter((item) => idSet.has(item.id));
      try {
        await Promise.all(ids.map((id) => softDeleteReceipt(id, { reason, note: trimmedNote })));
        const deletedAt = new Date().toISOString();
        setHistory((current) => current.filter((item) => !idSet.has(item.id)));
        if (targets.length > 0) {
          setDeletedReceipts((current) => [
            ...targets.map((item) => ({ ...item, deleted_reason: reason, deleted_note: trimmedNote || null, deleted_at: deletedAt })),
            ...current,
          ]);
        }
        if (selectedReceipt && idSet.has(selectedReceipt.id)) setSelectedReceipt(null);
        setSelectedRowIds((current) => current.filter((id) => !idSet.has(id)));
        setDeleteDialog(null);
        showToast(
          ids.length > 1 && typeof t.batchDeleteSuccessLabel === 'function'
            ? t.batchDeleteSuccessLabel(ids.length)
            : t.receiptMovedRejectedLabel,
          'success',
          {
            persist: true,
            title: ids.length > 1 ? t.batchDeleteFinishedLabel : t.receiptDeletedTitle,
            receiptId: ids.length === 1 ? ids[0] : undefined,
          },
        );
      } catch (error) {
        console.error('Delete failed:', error);
        setDeleteDialog((current) => current ? { ...current, isSubmitting: false } : current);
        showToast(ids.length > 1 ? t.batchDeleteFailedLabel : t.deleteFailedLabel, 'error', {
          persist: true,
          title: ids.length > 1 ? t.batchDeleteFailedLabel : t.deleteFailedLabel,
          receiptId: ids.length === 1 ? ids[0] : undefined,
        });
      }
      return;
    }

    try {
      await Promise.all(ids.map((id) => permanentlyDeleteReceipt(id)));
      setDeletedReceipts((current) => current.filter((item) => !idSet.has(item.id)));
      setSelectedDeletedIds((current) => current.filter((itemId) => !idSet.has(itemId)));
      if (selectedReceipt && idSet.has(selectedReceipt.id)) setSelectedReceipt(null);
      setDeleteDialog(null);
      showToast(
        ids.length > 1 && typeof t.batchPermanentDeleteSuccessLabel === 'function'
          ? t.batchPermanentDeleteSuccessLabel(ids.length)
          : t.permanentDeleteSuccessLabel,
        'success',
        {
          persist: true,
          title: ids.length > 1 ? t.batchPermanentDeleteFinishedLabel : t.permanentDeleteSuccessLabel,
        },
      );
    } catch (error) {
      console.error('Permanent delete failed:', error);
      setDeleteDialog((current) => current ? { ...current, isSubmitting: false } : current);
      showToast(ids.length > 1 ? t.batchPermanentDeleteFailedLabel : t.permanentDeleteFailedLabel, 'error', {
        persist: true,
        title: ids.length > 1 ? t.batchPermanentDeleteFailedLabel : t.permanentDeleteFailedLabel,
        receiptId: ids.length === 1 ? ids[0] : undefined,
      });
    }
  };

  const handleSaveFieldPreferences = async (preferences: FieldPreference[]) => {
    setFieldPreferences(preferences);
    try {
      const saved = await saveFieldPreferences(preferences);
      setFieldPreferences(saved);
      showToast(t.fieldPreferencesSavedLabel, 'success');
    } catch (error) {
      console.error('Save field preferences failed:', error);
      showToast(t.fieldPreferencesLocalOnlyLabel, 'error');
    }
  };

  const handleSaveCustomDocType = async (rawValue: string) => {
    const value = rawValue.trim();
    if (!value) return;
    setCustomDocumentTypes((current) => Array.from(new Set([...current, value])));
    setSelectedReceipt((current: any) => current ? { ...current, doc_type: 'Custom (自定义)', custom_doc_type: value } : current);
    try {
      await saveCustomDocumentType(value);
      showToast(t.customDocumentTypeSavedLabel, 'success');
    } catch (error) {
      console.error('Save custom document type failed:', error);
      showToast(t.customDocumentTypeLocalOnlyLabel, 'error');
    }
  };

  const handleSyncSelectedReceipt = async () => {
    if (!selectedReceipt) return;
    const updated = { ...selectedReceipt, status: 'Synced' };
    setHistory(history.map(h => h.id === selectedReceipt.id ? updated : h));
    await syncToDatabase(updated);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = Boolean(target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable));

      if (event.key === 'Escape') {
        if (zoomImage) {
          setZoomImage(null);
          return;
        }
        if (deleteDialog && !deleteDialog.isSubmitting) {
          setDeleteDialog(null);
          return;
        }
        if (duplicatePrompt) {
          cancelDuplicateUpload();
          return;
        }
        if (isSettingsOpen) {
          setIsSettingsOpen(false);
          return;
        }
        if (isNotificationCenterOpen) {
          setIsNotificationCenterOpen(false);
          return;
        }
        if (selectedReceipt) {
          setSelectedReceipt(null);
        }
        return;
      }

      if (isTyping || (!event.ctrlKey && !event.metaKey)) return;

      const key = event.key.toLowerCase();
      if (key === '1' || key === '2' || key === '3') {
        event.preventDefault();
        setActiveTab(key === '1' ? 'upload' : key === '2' ? 'history' : 'rejected');
      }
      if (key === 'e') {
        event.preventDefault();
        void handleExport(selectedReceipt || undefined);
      }
      if (key === 's' && selectedReceipt && !selectedReceipt.deleted_at) {
        event.preventDefault();
        void handleSyncSelectedReceipt();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteDialog, duplicatePrompt, handleExport, handleSyncSelectedReceipt, isNotificationCenterOpen, isSettingsOpen, selectedReceipt, zoomImage]);

  const deleteDialogReceipt = deleteDialog?.ids.length === 1
    ? [...history, ...deletedReceipts].find((receipt) => receipt.id === deleteDialog.ids[0])
    : null;
  const deleteDialogReceiptName = deleteDialogReceipt
    ? deleteDialogReceipt.merchant_name || deleteDialogReceipt.display_filename || deleteDialogReceipt.filename || null
    : null;
  const activeRepairProgress = selectedReceipt && repairProgress?.receiptId === selectedReceipt.id ? repairProgress : null;

  return (
    <AppShell colorMode={config.colorMode}>
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[200] px-6 py-3 rounded-2xl shadow-2xl animate-in slide-in-from-top duration-300 flex items-center gap-3 border ${
          toast.type === 'success' ? 'bg-emerald-500 text-white border-emerald-400' : 
          toast.type === 'error' ? 'bg-rose-500 text-white border-rose-400' : 
          'bg-slate-800 text-white border-slate-700'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="w-5 h-5" /> : 
           toast.type === 'error' ? <AlertCircle className="w-5 h-5" /> : 
           <Info className="w-5 h-5" />}
          <span className="text-sm font-black tracking-tight">{toast.message}</span>
        </div>
      )}

      {deleteDialog && (
        <DeleteReceiptDialog
          mode={deleteDialog.mode}
          count={deleteDialog.ids.length}
          receiptName={deleteDialogReceiptName}
          defaultReason={deleteDialog.defaultReason}
          isSubmitting={deleteDialog.isSubmitting}
          labels={t}
          colorMode={config.colorMode}
          onCancel={() => {
            if (!deleteDialog.isSubmitting) setDeleteDialog(null);
          }}
          onConfirm={handleConfirmDeleteDialog}
        />
      )}

      {smartCropTarget && (
        <ReceiptCropModal
          file={smartCropTarget.file}
          queueCount={1}
          disabled={isCropModalBusy}
          title={t.cropTitle}
          description={t.cropDescription}
          skipLabel={t.cropSkipLabel}
          confirmLabel={t.cropConfirmLabel}
          labels={t}
          onCancel={() => setSmartCropTarget(null)}
          onConfirm={handleSmartCropConfirm}
          onError={(message) => showToast(message, 'error')}
        />
      )}

      {duplicatePrompt && (
        <DuplicateDialog
          filename={duplicatePrompt.file.name}
          candidates={duplicatePrompt.candidates}
          labels={t}
          onCancel={cancelDuplicateUpload}
          onContinue={continueDuplicateUpload}
          onOpenExisting={openDuplicateCandidate}
        />
      )}

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          activeTab={activeTab}
          uploadCount={uploadList.length}
          syncedCount={history.filter(h => h.status === 'Synced').length}
          deletedCount={deletedReceipts.length}
          labels={{
            workflow: t.workflow,
            workflowSection: t.upload,
            history: t.history,
            rejected: t.rejectedReceiptsLabel,
            settings: t.settings,
          }}
          config={config}
          onTabChange={setActiveTab}
          onSettingsOpen={() => setIsSettingsOpen(true)}
        />

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          <header className={`border-b h-16 flex items-center justify-between px-8 shrink-0 z-10 transition-colors ${config.colorMode === 'Dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
             <div className="flex items-center gap-4">
                <h2 className={`text-sm font-black uppercase tracking-widest ${config.colorMode === 'Dark' ? 'text-slate-400' : 'text-slate-800'}`}>
                  {activeTab === 'upload' ? t.auditQueue : activeTab === 'rejected' ? t.rejectedReceiptsLabel : t.archiveLib}
                </h2>
             </div>
             <div className="flex items-center gap-4">
                <NotificationCenter
                  notifications={notifications}
                  isOpen={isNotificationCenterOpen}
                  colorMode={config.colorMode}
                  labels={t}
                  onToggle={() => setIsNotificationCenterOpen((current) => !current)}
                  onMarkAllRead={() => setNotifications((current) => markAppNotificationsRead(current))}
                  onClear={() => setNotifications([])}
                  onOpenReceipt={handleOpenNotificationReceipt}
                />
                <button onClick={handleSignOut} className={`flex items-center gap-2 px-4 py-2 border rounded-xl text-[10px] font-black uppercase transition-all shadow-sm ${config.colorMode === 'Dark' ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                   <LogOut className="w-4 h-4" /> {t.signOutLabel}
                </button>
                <button disabled={isExporting} onClick={() => handleExport()} className={`flex items-center gap-2 px-5 py-2 text-white rounded-xl text-[10px] font-black uppercase transition-all shadow-md disabled:cursor-wait disabled:opacity-60 ${config.colorMode === 'Dark' ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-slate-900 hover:bg-slate-800'}`}>
                   <FileSpreadsheet className="w-4 h-4" /> {isExporting ? t.generatingExcelLabel : t.exportExcel}
                </button>
             </div>
          </header>

          <main className="flex-1 overflow-y-auto p-8 lg:p-10">
            {activeTab === 'upload' ? (
              <div className="mx-auto max-w-[1520px] space-y-8 animate-in fade-in duration-500">
                <label className={`group relative block border-2 border-dashed rounded-[32px] p-16 text-center transition-all cursor-pointer shadow-sm ${config.colorMode === 'Dark' ? 'bg-slate-900 border-slate-700 hover:border-indigo-500' : 'bg-white border-slate-300 hover:border-indigo-400'}`}>
                  <div className={`w-16 h-16 ${config.theme.light} rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-all duration-300 ${config.colorMode === 'Dark' ? 'bg-indigo-900/30' : ''}`}>
                    <Upload className={`w-8 h-8 ${config.theme.text}`} />
                  </div>
                  <h3 className={`text-lg font-black ${config.colorMode === 'Dark' ? 'text-slate-200' : 'text-slate-800'}`}>{t.uploadHint}</h3>
                  <p className={`text-xs mt-2 font-medium ${config.colorMode === 'Dark' ? 'text-slate-500' : 'text-slate-400'}`}>{t.uploadLimit}</p>
                  <input type="file" className="hidden" multiple onChange={handleUpload} accept="image/png,image/jpeg,application/pdf" />
                </label>

                <UploadQueue items={uploadList} visibleLimit={config.uploadQueueLimit || 10} processingLabel={t.processing} labels={t} config={config} />

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 px-2 md:grid-cols-5">
                    {queueQuickFilters.map((chip) => {
                      const active = filters.status === chip.status && Boolean(filters.attention) === chip.attention;
                      return (
                        <button
                          key={chip.key}
                          type="button"
                          onClick={() => setFilters((current) => ({ ...current, status: chip.status, attention: chip.attention }))}
                          className={`rounded-2xl border px-4 py-3 text-left transition-all ${
                            active
                              ? `${config.theme.color} border-transparent text-white shadow-lg`
                              : config.colorMode === 'Dark'
                                ? 'border-slate-800 bg-slate-900 text-slate-400 hover:bg-slate-800'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-100 hover:bg-indigo-50/50'
                          }`}
                        >
                          <span className="block text-[9px] font-black uppercase tracking-[1.5px] opacity-70">{chip.label}</span>
                          <span className="mt-1 block text-xl font-black tabular-nums">{chip.count}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap gap-3 items-center p-2">
                     <div className="relative flex-1 min-w-[200px]">
                        <Search className={`absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 ${config.colorMode === 'Dark' ? 'text-slate-600' : 'text-slate-400'}`} />
                        <input type="text" placeholder={t.searchPlaceholder} value={filters.search} onChange={e => setFilters({...filters, search: e.target.value})} className={`w-full border rounded-xl pl-10 pr-4 py-2.5 text-xs font-medium focus:outline-none transition-all shadow-sm ${config.colorMode === 'Dark' ? 'bg-slate-900 border-slate-800 text-white focus:border-indigo-500 ring-indigo-500/10' : 'bg-white border-slate-200 text-slate-900 focus:border-indigo-500 ring-indigo-500/10'}`} />
                     </div>
                     <div className="relative">
                        <select value={filters.status} onChange={e => setFilters({...filters, status: e.target.value, attention: false})} className={`appearance-none border rounded-xl pl-4 pr-10 py-2.5 text-xs font-black outline-none shadow-sm transition-all cursor-pointer ${config.colorMode === 'Dark' ? 'bg-slate-900 border-slate-800 text-slate-400 focus:border-indigo-500' : 'bg-white border-slate-200 text-slate-600 focus:border-indigo-500'}`}>
                           <option value="All">{t.statusAll}</option>
                           <option value="Uploaded">{t.statusUploaded}</option>
                           <option value="Processing">{t.statusProcessing}</option>
                           <option value="Pending">{t.statusPending}</option>
                           <option value="Failed">{t.statusFailed}</option>
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                     </div>

                     <div className="relative">
                        <select value={filters.docType} onChange={e => setFilters({...filters, docType: e.target.value})} className={`appearance-none border rounded-xl pl-4 pr-10 py-2.5 text-xs font-black outline-none shadow-sm transition-all cursor-pointer ${config.colorMode === 'Dark' ? 'bg-slate-900 border-slate-800 text-slate-400 focus:border-indigo-500' : 'bg-white border-slate-200 text-slate-600 focus:border-indigo-500'}`}>
                           <option value="All">{t.typeAll}</option>
                           {documentTypeOptions.map((type) => <option key={type} value={type}>{t.optionLabels?.[type] || type}</option>)}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                     </div>

                     <div className="relative">
                        <select value={filters.tag} onChange={e => setFilters({...filters, tag: e.target.value})} className={`appearance-none border rounded-xl pl-4 pr-10 py-2.5 text-xs font-black outline-none shadow-sm transition-all cursor-pointer ${config.colorMode === 'Dark' ? 'bg-slate-900 border-slate-800 text-slate-400 focus:border-indigo-500' : 'bg-white border-slate-200 text-slate-600 focus:border-indigo-500'}`}>
                           <option value="All">{t.tagAll}</option>
                           {TAGS_OPTIONS.map((tag) => <option key={tag} value={tag}>{t.optionLabels?.[tag] || tag}</option>)}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                     </div>
                  </div>

                  {selectedRowIds.length > 0 && (
                    <div className={`mx-2 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${config.colorMode === 'Dark' ? 'border-indigo-900 bg-indigo-950/30' : 'border-indigo-100 bg-indigo-50'}`}>
                      <p className={`text-[10px] font-black uppercase ${config.colorMode === 'Dark' ? 'text-indigo-200' : 'text-indigo-700'}`}>{typeof t.selectedCountLabel === 'function' ? t.selectedCountLabel(selectedRowIds.length) : `已选 ${selectedRowIds.length} 条`}</p>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => handleExport()} className="rounded-xl bg-white px-3 py-2 text-[10px] font-black uppercase text-slate-700 shadow-sm hover:bg-slate-50">{t.exportSelected}</button>
                        <button type="button" onClick={handleBatchMarkSynced} className="rounded-xl bg-emerald-600 px-3 py-2 text-[10px] font-black uppercase text-white shadow-sm hover:bg-emerald-500">{t.markSyncedLabel || '标记为已同步'}</button>
                        <button type="button" onClick={handleBatchDelete} className="rounded-xl bg-rose-600 px-3 py-2 text-[10px] font-black uppercase text-white shadow-sm hover:bg-rose-500">{t.deleteSelectedLabel || '删除已选'}</button>
                      </div>
                    </div>
                  )}

                  <ReceiptTable
                    items={filteredHistory}
                    selectedRowIds={selectedRowIds}
                    labels={t}
                    isLoading={isReceiptsLoading}
                    pageSize={config.receiptListPageSize || 10}
                    config={receiptTableConfig}
                    isSelectableForBulk={isSelectableForBulk}
                    onToggleSelectAll={handleToggleSelectAll}
                    onToggleSelectRow={handleToggleSelectRow}
                    onOpenReceipt={setSelectedReceipt}
                    onOpenThumbnail={setZoomImage}
                    onCopyText={handleCopyText}
                    onRetry={handleRetry}
                    onDelete={handleDelete}
                  />
                </div>
              </div>
            ) : activeTab === 'rejected' ? (
              <div className="mx-auto max-w-[1520px] space-y-6">
                {deletedReceipts.length > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4">
                    <label className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-500">
                      <input
                        type="checkbox"
                        checked={selectedDeletedIds.length === deletedReceipts.length}
                        onChange={() => setSelectedDeletedIds((current) => current.length === deletedReceipts.length ? [] : deletedReceipts.map((receipt) => receipt.id))}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      {typeof t.selectedCountLabel === 'function' ? t.selectedCountLabel(selectedDeletedIds.length) : `已选 ${selectedDeletedIds.length} 条`}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={handleBatchRestoreDeleted} className="rounded-xl bg-emerald-50 px-3 py-2 text-[10px] font-black uppercase text-emerald-700 hover:bg-emerald-100">{t.restoreSelectedLabel || '恢复已选'}</button>
                      <button type="button" onClick={handleBatchPermanentDelete} className="rounded-xl bg-rose-50 px-3 py-2 text-[10px] font-black uppercase text-rose-700 hover:bg-rose-100">{t.deleteSelectedLabel || '删除已选'}</button>
                    </div>
                  </div>
                )}
                <DeletedReceiptList
                  receipts={deletedReceipts.map(toApiReceipt)}
                  selectedIds={selectedDeletedIds}
                  labels={t}
                  onToggleSelect={(id) => setSelectedDeletedIds((current) => current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id])}
                  onOpen={(id) => {
                    const found = deletedReceipts.find((receipt) => receipt.id === id);
                    if (found) setSelectedReceipt(found);
                  }}
                  onCopyReuploadMessage={(message) => {
                    void copyTextToClipboard(message)
                      .then(() => showToast(t.reuploadCopiedLabel, 'success'))
                      .catch(() => showToast(t.copyFailedLabel, 'error'));
                  }}
                  onRestore={handleRestoreDeleted}
                  onPermanentDelete={handlePermanentDelete}
                />
              </div>
            ) : (
              <div className="mx-auto max-w-[1520px] space-y-6">
                 <div className="flex gap-4 items-center">
                     <div className="relative flex-1 group min-w-[200px]">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input type="text" placeholder={t.historySearchPlaceholder} value={filters.search} onChange={e => setFilters({...filters, search: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs font-medium focus:outline-none focus:border-indigo-500 shadow-sm" />
                     </div>
                 </div>

                 <div className="bg-white border border-slate-200 rounded-[24px] overflow-hidden shadow-sm">
                    <table className="w-full text-left">
                       <thead className="bg-slate-50 text-[10px] font-black text-slate-500 uppercase border-b border-slate-100">
                          <tr><th className="px-6 py-4">{t.syncedDataLabel}</th><th className="px-6 py-4">{t.totalLabel}</th><th className="px-6 py-4 text-right">{t.auditLabel}</th></tr>
                       </thead>
                       <tbody className="divide-y divide-slate-50">
                          {filteredHistory.filter(h => h.status === 'Synced').map(item => (
                            <tr key={item.id} className={`hover:bg-slate-50 transition-all cursor-pointer ${config.colorMode === 'Dark' ? 'hover:bg-slate-800 border-slate-800' : ''}`} onClick={() => setSelectedReceipt(item)}>
                              <td className="px-6 py-5 font-black text-sm">{item.merchant_name}</td>
                              <td className="px-6 py-5 font-black">{config.currency} {parseFloat(item.grand_total as any).toFixed(2)}</td>
                              <td className="px-6 py-5 text-right">
                                 <div className="flex items-center justify-end gap-2">
                                  <ExternalLink className="w-4 h-4 text-slate-400" />
                                  <button onClick={(e) => handleDelete(item.id, e)} className={`p-1.5 rounded-lg transition-all ${config.colorMode === 'Dark' ? 'text-slate-600 hover:bg-rose-600/20 hover:text-rose-500' : 'text-slate-300 hover:bg-rose-50 hover:text-rose-500'}`} title={t.removeArchiveLabel}>
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                 </div>
                               </td>
                            </tr>
                          ))}
                          {filteredHistory.filter(h => h.status === 'Synced').length === 0 && (
                            <tr><td colSpan={3} className="px-6 py-12 text-center text-slate-400 text-xs font-bold">{t.noArchive}</td></tr>
                          )}
                       </tbody>
                    </table>
                 </div>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Receipt review drawer */}
      {selectedReceipt && (
        <ReceiptReviewDrawer
          receipt={selectedReceipt}
          config={config}
          labels={t}
          documentTypeOptions={documentTypeOptions}
          industries={INDUSTRIES}
          tagOptions={TAGS_OPTIONS}
          activeRepairProgress={activeRepairProgress}
          isExporting={isExporting}
          isSmartParsing={smartParsingReceiptId === selectedReceipt.id}
          isFieldVisible={isAuditFieldVisible}
          onReceiptChange={handleSelectedReceiptChange}
          onClose={() => setSelectedReceipt(null)}
          onSmartParse={handleSmartParse}
          onExport={() => handleExport(selectedReceipt)}
          onRestore={() => handleRestoreDeleted(selectedReceipt.id)}
          onPermanentDelete={() => handlePermanentDelete(selectedReceipt.id)}
          onSync={handleSyncSelectedReceipt}
          onSaveCustomDocType={handleSaveCustomDocType}
          onZoomImage={setZoomImage}
        />
      )}
      {/* Settings Modal - Safety Preserved */}
      {isSettingsOpen && (
        <SettingsModal
          config={config}
          labels={t}
          themes={THEMES}
          fieldPreferences={fieldPreferences}
          onConfigChange={setConfig}
          onFieldPreferencesChange={handleSaveFieldPreferences}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}

      {/* 全屏图片放大预览模态框 */}
      {zoomImage && (
        <div 
           className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-10 bg-slate-900/90 backdrop-blur-sm animate-in fade-in zoom-in duration-200 cursor-zoom-out"
           onClick={() => setZoomImage(null)}
        >
           <button 
              onClick={() => setZoomImage(null)} 
              className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-rose-500 text-white rounded-full transition-all backdrop-blur-md z-10"
           >
              <X className="w-6 h-6" />
           </button>
           <img 
              src={zoomImage} 
              alt={t.zoomedReceiptAlt}
              className="max-w-full max-h-full object-contain drop-shadow-2xl rounded-lg cursor-default" 
              onClick={(e) => e.stopPropagation()} 
              referrerPolicy="no-referrer"
           />
        </div>
      )}
    </AppShell>
  );
}
