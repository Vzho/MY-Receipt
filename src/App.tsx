import React, { useState, useMemo, useEffect, useRef } from 'react';
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
import { keepSyncedReceiptSelected } from './lib/syncSelection';
import { playNotificationSound } from './lib/notificationSound';
import {
  createAppNotification,
  loadAppNotifications,
  markAppNotificationsRead,
  prependAppNotification,
  saveAppNotifications,
  type AppNotificationInput,
} from './lib/appNotifications';
import { DeletedReceiptList } from './components/DeletedReceiptList';
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
    statusUploaded: '待智能解析 (Uploaded)',
    statusProcessing: '解析中 (Processing)',
    statusPending: '待核对 (Pending Sync)',
    statusFailed: '解析失败 (Failed)',
    typeAll: '单据类型: 全部',
    tagAll: '标签: 全部',
    noPending: '没有待处理记录。',
    noData: '数据库中无记录。',
    colMerchant: '状态/商户 (Merchant)',
    colFinance: '财务摘要 (Financials)',
    colTags: '分类与标签 (Tags)',
    colAudit: '人工审计 (Audit)',
    colCloud: 'Cloud Data (Database)',
    colTotal: '合计金额',
    colAction: '查看单据与原图',
    modalTitle: '系统偏好与集成',
    storageSettings: '存储引擎',
    pgDesc: '关系型数据与状态同步。',
    storageDesc: '发票原图持久化云端存储。',
    exportSingle: '导出当前单据 (XLSX)',
    originalImg: '单据原图',
    headerInfo: '发票抬头、商户信息与分类标签',
    skuInfo: '商品明细表 (SKU Items)',
    financeInfo: '财务汇总与数学校验引擎',
    addSku: '添加 SKU 行',
    hold: '保持挂起',
    syncToCloud: '同步至云端',
    merchantLabel: '商户名称 (Merchant)',
    thumbnailLabel: '发票缩略图',
    dateLabel: '日期 (Date)',
    invoiceLabel: '发票号 (Invoice No)',
    regNoLabel: '注册号 (Reg No)',
    sstIdLabel: 'SST ID',
    phonePaymentLabel: '电话 (Phone) & 支付 (Payment)',
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
    itemName: 'Item Description',
    qty: 'Qty',
    subtotal: 'Subtotal (Items)',
    discount: 'Discount (-)',
    serviceCharge: 'Service Chg (+)',
    taxSst: 'Tax/SST (+)',
    rounding: 'Rounding (+/-)',
    change: 'Change (找零)',
    grandTotal: 'Calculated Grand Total',
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
    history: 'Cloud History'
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
    history: 'Sejarah Awan'
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
  const [smartCropTarget, setSmartCropTarget] = useState<SmartCropTarget | null>(null);
  const [isCropModalBusy, setIsCropModalBusy] = useState(false);
  const [smartParsingReceiptId, setSmartParsingReceiptId] = useState<string | null>(null);
  const [repairProgress, setRepairProgress] = useState<RepairProgress | null>(null);
  const repairProgressTimerRef = useRef<number | null>(null);
  const pollingReceiptIdsRef = useRef<Set<string>>(new Set());
  const pendingUploadHashesRef = useRef<Set<string>>(new Set());
  const pendingRealtimeReceiptIdsRef = useRef<Set<string>>(new Set());
  const pendingRealtimeDeletedIdsRef = useRef<Set<string>>(new Set());
  const pendingRealtimeFullRefreshRef = useRef(false);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [toast, setToast] = useState<{message: string, type: 'info' | 'success' | 'error'} | null>(null);
  const [filters, setFilters] = useState({ search: '', status: 'All', docType: 'All', tag: 'All' });

  const [config, setConfig] = useState(() => {
    const saved = localStorage.getItem('my_receipt_config');
    if (saved) return JSON.parse(saved);
    return {
      theme: THEMES[0],
      language: 'zh',
      currency: 'RM',
      colorMode: 'Light',
      notificationSound: false,
      uploadQueueLimit: 10,
    };
  });

  useEffect(() => {
    localStorage.setItem('my_receipt_config', JSON.stringify(config));
  }, [config]);

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

  const addNotification = (input: AppNotificationInput) => {
    setNotifications((current) => prependAppNotification(current, createAppNotification(input)));
    playNotificationSound(Boolean(config.notificationSound), input);
  };

  // Toast Function
  const showToast = (
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
  };

  const t = useMemo(() => {
    const langMap: any = { 'zh': '中文', 'en': 'English', 'ms': 'Melayu' };
    const langKey = langMap[config.language] || 'English';
    return I18N[langKey];
  }, [config.language]);

  const documentTypeOptions = useMemo(() => {
    const customOptions = customDocumentTypes.filter((name) => !DOC_TYPES.includes(name));
    return [...DOC_TYPES, ...customOptions];
  }, [customDocumentTypes]);

  const isSelectableForBulk = (receipt: any) => receipt.status === 'Pending' || receipt.status === 'Failed';
  const isAuditFieldVisible = (fieldKey: FieldKey) => isFieldEnabled(fieldPreferences, fieldKey);
  const enabledFieldKeys = useMemo(
    () => fieldPreferences.filter((preference) => preference.enabled).map((preference) => preference.field_key),
    [fieldPreferences],
  );

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

  const handleToggleSelectAll = () => {
    const currentPendingIds = filteredHistory.filter(isSelectableForBulk).map(h => h.id);
    if (selectedRowIds.length === currentPendingIds.length) {
      setSelectedRowIds([]);
    } else {
      setSelectedRowIds(currentPendingIds);
    }
  };

  const handleToggleSelectRow = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const receipt = history.find((item) => item.id === id);
    if (receipt && !isSelectableForBulk(receipt)) return;
    setSelectedRowIds(prev => 
      prev.includes(id) ? prev.filter(rowId => rowId !== id) : [...prev, id]
    );
  };

  const filteredHistory = useMemo(() => {
    return history.filter(item => {
      const search = filters.search.trim().toLowerCase();
      const matchSearch = !search
        || item.merchant_name?.toLowerCase().includes(search)
        || item.invoice_no?.toLowerCase().includes(search)
        || item.filename?.toLowerCase().includes(search);
      const matchStatus = filters.status === 'All' || item.status === filters.status;
      const matchType = filters.docType === 'All' || item.doc_type === filters.docType;
      const matchTag = filters.tag === 'All' || item.tags?.includes(filters.tag);
      return matchSearch && matchStatus && matchType && matchTag;
    });
  }, [history, filters]);

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

  const handleCopyText = async (value: string | null | undefined, label: string, event?: React.MouseEvent) => {
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
  };

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
        showToast(`${file.name} is already uploading.`, 'info');
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
          throw new Error('PDF receipt has no pages.')
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
          title: 'Possible duplicate detected',
          message: `${file.name} looks similar to an existing receipt.`,
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
      showToast(error instanceof Error ? error.message : 'Duplicate precheck failed.', 'error', {
        persist: true,
        title: 'Duplicate precheck failed',
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
      showToast(error instanceof Error ? error.message : 'Upload failed.', 'error');
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
        showToast('Receipt no longer exists.', 'info');
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
      showToast('Failed to open receipt from message.', 'error');
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
      throw new Error('PDF receipt has no pages.');
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
        title: 'PDF page queued',
        message: `${file.name} page ${pageNumber} of ${totalPages} is queued for OCR.`,
        receipt_id: result.receipt.id,
      });
      startReceiptResultPolling(result.receipt.id, pagePreviewUrl);
    }

    setUploadList((old: any[]) => old.filter((item) => item.id !== uploadId));
    showToast(`${file.name}: ${createdReceipts.length} PDF page${createdReceipts.length > 1 ? 's' : ''} uploaded. OCR started.`, 'success', {
      persist: true,
      title: 'PDF upload queued',
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
        parseMode: 'ocr',
        enabledFieldKeys,
        docType: looksLikeEInvoiceQrPayload(effectiveQrPayload) ? 'E-invoice' : null,
        qrPayload: effectiveQrPayload,
      });
      setUploadList((old: any[]) => old.map(u => u.id === uploadId ? { ...u, progress: 62, status: 'OCR parsing in background' } : u));
      const displayReceipt = await buildDisplayReceipt(result.receipt, displayPreviewUrl);

      upsertHistoryReceipt(displayReceipt);
      showToast(`${file.name} uploaded. OCR started.`, 'success', {
        persist: true,
        title: 'Receipt upload queued',
        receiptId: result.receipt.id,
      });
      startReceiptResultPolling(result.receipt.id, displayPreviewUrl, uploadId);
    } catch (error) {
      console.error('Receipt upload failed:', error);
      setUploadList((old: any[]) => old.map(u => u.id === uploadId ? { ...u, status: 'Failed', progress: 100 } : u));
      showToast(error instanceof Error ? error.message : 'Upload failed.', 'error', {
        persist: true,
        title: 'Receipt upload failed',
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

  const handleRetry = (id: string) => {
    showToast(`Retrying API for ID: ${id}`, 'info');
    setHistory(history.filter(h => h.id !== id));
  };

  const clearRepairProgressTimer = () => {
    if (repairProgressTimerRef.current) {
      window.clearInterval(repairProgressTimerRef.current);
      repairProgressTimerRef.current = null;
    }
  };

  const startRepairProgress = (receiptId: string, mode: RepairProgress['mode'] = 'deepseek') => {
    const stages = mode === 'smart'
      ? [
        { percent: 12, label: '上传裁剪图并准备智能解析' },
        { percent: 28, label: 'Qwen 视觉模型正在读取票据图片' },
        { percent: 48, label: '抽取商户、字段、金额和明细' },
        { percent: 68, label: 'DeepSeek 正在校验结构和数学校验' },
        { percent: 88, label: '写回云端并刷新审核页' },
      ]
      : mode === 'vision'
      ? [
        { percent: 14, label: '准备裁剪图并调用 Qwen VL' },
        { percent: 32, label: 'Qwen VL 正在读取票据图片' },
        { percent: 52, label: '提取商户、金额和商品明细' },
        { percent: 72, label: 'DeepSeek 校验结构和数学校验' },
        { percent: 88, label: '等待云函数写回视觉结果' },
      ]
      : [
        { percent: 18, label: '连接 DeepSeek 修复引擎' },
        { percent: 34, label: '发送 OCR 原文和初始结果' },
        { percent: 56, label: '重排商户、日期、金额和明细' },
        { percent: 74, label: '校验小计、舍入和总额' },
        { percent: 86, label: '等待云函数写回结果' },
      ];
    let stageIndex = 0;

    clearRepairProgressTimer();
    setRepairProgress({
      receiptId,
      mode,
      percent: 8,
      label: mode === 'smart' ? '准备智能解析' : mode === 'vision' ? '准备 Qwen 视觉重解析' : '准备 DeepSeek 文本修复',
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
            label: mode === 'smart' ? '智能解析仍在处理，请稍候' : mode === 'vision' ? '视觉模型仍在处理，请稍候' : 'DeepSeek 仍在处理，请稍候',
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
      showToast('This receipt has no image to parse.', 'error');
      return;
    }

    try {
      const response = await fetch(imageUrl);
      if (!response.ok) throw new Error('Failed to load original receipt image for cropping.');
      const blob = await response.blob();
      const file = new File([blob], selectedReceipt.filename || `${selectedReceipt.id}.jpg`, {
        type: blob.type || selectedReceipt.mime_type || 'image/jpeg',
      });
      setSmartCropTarget({ receipt: selectedReceipt, file });
    } catch (error) {
      console.error('Failed to prepare smart parse crop:', error);
      showToast(error instanceof Error ? error.message : 'Failed to prepare smart parse.', 'error');
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
    showToast('智能解析已在后台开始，完成后会提示。', 'info', {
      persist: true,
      title: 'Smart parse started',
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
      setRepairProgress({ receiptId, mode: 'smart', percent: 94, label: '同步智能解析结果到界面' });
      const originalSignedUrl = await createReceiptFileSignedUrl(result.receipt.file_path);
      const processedSignedUrl = await createReceiptFileSignedUrl(result.receipt.processed_file_path || null);
      const displayReceipt = toDisplayReceipt({
        ...result.receipt,
        image_url: processedSignedUrl || originalSignedUrl || currentImageUrl,
        original_image_url: originalSignedUrl || currentOriginalImageUrl,
        processed_image_url: processedSignedUrl || currentProcessedImageUrl,
      });

      setHistory((current) => current.map((item) => item.id === displayReceipt.id ? displayReceipt : item));
      setRepairProgress({ receiptId, mode: 'smart', percent: 100, label: result.parseError ? '智能解析返回错误' : '智能解析完成' });
      showToast(result.parseError || `${displayReceipt.merchant_name || displayReceipt.filename || 'Receipt'} 智能解析完成。`, result.parseError ? 'error' : 'success', {
        persist: true,
        title: result.parseError ? 'Smart parse failed' : 'Smart parse finished',
        receiptId,
      });
    } catch (error) {
      console.error('Smart parse failed:', error);
      clearRepairProgressTimer();
      setRepairProgress({ receiptId, mode: 'smart', percent: 100, label: '智能解析失败' });
      setHistory((current) => current.map((item) => item.id === receiptId ? { ...item, status: receipt.status || 'Uploaded' } : item));
      showToast(error instanceof Error ? error.message : 'Smart parse failed.', 'error', {
        persist: true,
        title: 'Smart parse failed',
        receiptId,
      });
    } finally {
      setSmartParsingReceiptId(null);
      window.setTimeout(() => {
        setRepairProgress((current) => current?.receiptId === receiptId ? null : current);
      }, 1800);
    }
  };

  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const reason = window.prompt('删除原因（blurry_image / duplicate / amount_not_clear / not_receipt / missing_required_info / other）', 'other');
    if (!reason) return;

    try {
      await softDeleteReceipt(id, { reason });
    } catch (err) {
      console.error('Failed to delete from Supabase:', err);
      showToast('Delete failed.', 'error', { persist: true, title: 'Delete failed', receiptId: id });
      return;
    }

    const deleted = history.find((item) => item.id === id);
    setHistory(prev => prev.filter(h => h.id !== id));
    if (deleted) {
      setDeletedReceipts((current) => [{ ...deleted, deleted_reason: reason, deleted_at: new Date().toISOString() }, ...current]);
    }
    if (selectedReceipt?.id === id) setSelectedReceipt(null);
    showToast('Receipt moved to Rejected.', 'success', {
      persist: true,
      title: 'Receipt deleted',
      receiptId: id,
    });
  };

  const handleBatchDelete = async () => {
    const targets = history.filter((item) => selectedRowIds.includes(item.id));
    if (targets.length === 0) {
      showToast('No receipts selected.', 'info');
      return;
    }

    const reason = window.prompt('批量删除原因（blurry_image / duplicate / amount_not_clear / not_receipt / missing_required_info / other）', 'duplicate');
    if (!reason) return;

    try {
      await Promise.all(targets.map((item) => softDeleteReceipt(item.id, { reason })));
      setHistory((current) => current.filter((item) => !selectedRowIds.includes(item.id)));
      setDeletedReceipts((current) => [
        ...targets.map((item) => ({ ...item, deleted_reason: reason, deleted_at: new Date().toISOString() })),
        ...current,
      ]);
      if (selectedReceipt && selectedRowIds.includes(selectedReceipt.id)) setSelectedReceipt(null);
      setSelectedRowIds([]);
      showToast(`${targets.length} receipts moved to Rejected.`, 'success', {
        persist: true,
        title: 'Batch delete finished',
      });
    } catch (error) {
      console.error('Batch delete failed:', error);
      showToast('Batch delete failed.', 'error', { persist: true, title: 'Batch delete failed' });
    }
  };

  const handleBatchMarkSynced = async () => {
    const targets = history.filter((item) => selectedRowIds.includes(item.id));
    if (targets.length === 0) {
      showToast('No receipts selected.', 'info');
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
      showToast(`${targets.length} receipts marked as synced.`, 'success', {
        persist: true,
        title: 'Batch sync finished',
      });
    } catch (error) {
      console.error('Batch mark synced failed:', error);
      showToast('Batch mark synced failed.', 'error', { persist: true, title: 'Batch sync failed' });
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
      showToast('Receipt restored.', 'success', { persist: true, title: 'Receipt restored', receiptId: id });
    } catch (error) {
      console.error('Restore failed:', error);
      showToast('Restore failed.', 'error', { persist: true, title: 'Restore failed', receiptId: id });
    }
  };

  const handlePermanentDelete = async (id: string) => {
    if (!window.confirm('永久删除会移除数据库记录和 Storage 文件，确定继续吗？')) return;
    try {
      await permanentlyDeleteReceipt(id);
      setDeletedReceipts((current) => current.filter((item) => item.id !== id));
      setSelectedDeletedIds((current) => current.filter((itemId) => itemId !== id));
      if (selectedReceipt?.id === id) setSelectedReceipt(null);
      showToast('Receipt permanently deleted.', 'success', { persist: true, title: 'Receipt permanently deleted' });
    } catch (error) {
      console.error('Permanent delete failed:', error);
      showToast('Permanent delete failed.', 'error', { persist: true, title: 'Permanent delete failed', receiptId: id });
    }
  };

  const handleBatchRestoreDeleted = async () => {
    const targets = deletedReceipts.filter((item) => selectedDeletedIds.includes(item.id));
    if (targets.length === 0) {
      showToast('No deleted receipts selected.', 'info');
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
      showToast(`${targets.length} receipts restored.`, 'success', {
        persist: true,
        title: 'Batch restore finished',
      });
    } catch (error) {
      console.error('Batch restore failed:', error);
      showToast('Batch restore failed.', 'error', { persist: true, title: 'Batch restore failed' });
    }
  };

  const handleBatchPermanentDelete = async () => {
    const targets = deletedReceipts.filter((item) => selectedDeletedIds.includes(item.id));
    if (targets.length === 0) {
      showToast('No deleted receipts selected.', 'info');
      return;
    }
    if (!window.confirm(`永久删除 ${targets.length} 张收据？`)) return;

    try {
      await Promise.all(targets.map((item) => permanentlyDeleteReceipt(item.id)));
      setDeletedReceipts((current) => current.filter((item) => !selectedDeletedIds.includes(item.id)));
      if (selectedReceipt && selectedDeletedIds.includes(selectedReceipt.id)) setSelectedReceipt(null);
      setSelectedDeletedIds([]);
      showToast(`${targets.length} receipts permanently deleted.`, 'success', {
        persist: true,
        title: 'Batch permanent delete finished',
      });
    } catch (error) {
      console.error('Batch permanent delete failed:', error);
      showToast('Batch permanent delete failed.', 'error', { persist: true, title: 'Batch permanent delete failed' });
    }
  };

  const handleSaveFieldPreferences = async (preferences: FieldPreference[]) => {
    setFieldPreferences(preferences);
    try {
      const saved = await saveFieldPreferences(preferences);
      setFieldPreferences(saved);
      showToast('Field preferences saved.', 'success');
    } catch (error) {
      console.error('Save field preferences failed:', error);
      showToast('Field preferences saved locally only.', 'error');
    }
  };

  const handleSaveCustomDocType = async (rawValue: string) => {
    const value = rawValue.trim();
    if (!value) return;
    setCustomDocumentTypes((current) => Array.from(new Set([...current, value])));
    setSelectedReceipt((current: any) => current ? { ...current, doc_type: 'Custom (自定义)', custom_doc_type: value } : current);
    try {
      await saveCustomDocumentType(value);
      showToast('Custom document type saved.', 'success');
    } catch (error) {
      console.error('Save custom document type failed:', error);
      showToast('Custom document type saved locally only.', 'error');
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
  }, [duplicatePrompt, handleExport, handleSyncSelectedReceipt, isNotificationCenterOpen, isSettingsOpen, selectedReceipt, zoomImage]);

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

      {smartCropTarget && (
        <ReceiptCropModal
          file={smartCropTarget.file}
          queueCount={1}
          disabled={isCropModalBusy}
          title="智能解析前裁剪"
          description="先框住票据主体，再用 Qwen 视觉读取图片，并由 DeepSeek 校验结构、金额和字段。"
          skipLabel="直接解析原图"
          confirmLabel="裁剪并智能解析"
          onCancel={() => setSmartCropTarget(null)}
          onConfirm={handleSmartCropConfirm}
          onError={(message) => showToast(message, 'error')}
        />
      )}

      {duplicatePrompt && (
        <DuplicateDialog
          filename={duplicatePrompt.file.name}
          candidates={duplicatePrompt.candidates}
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
            history: t.history,
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
                  {activeTab === 'upload' ? t.auditQueue : activeTab === 'rejected' ? 'Rejected Receipts' : t.archiveLib}
                </h2>
             </div>
             <div className="flex items-center gap-4">
                <NotificationCenter
                  notifications={notifications}
                  isOpen={isNotificationCenterOpen}
                  colorMode={config.colorMode}
                  onToggle={() => setIsNotificationCenterOpen((current) => !current)}
                  onMarkAllRead={() => setNotifications((current) => markAppNotificationsRead(current))}
                  onClear={() => setNotifications([])}
                  onOpenReceipt={handleOpenNotificationReceipt}
                />
                <button onClick={handleSignOut} className={`flex items-center gap-2 px-4 py-2 border rounded-xl text-[10px] font-black uppercase transition-all shadow-sm ${config.colorMode === 'Dark' ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                   <LogOut className="w-4 h-4" /> 退出登录
                </button>
                <button disabled={isExporting} onClick={() => handleExport()} className={`flex items-center gap-2 px-5 py-2 text-white rounded-xl text-[10px] font-black uppercase transition-all shadow-md disabled:cursor-wait disabled:opacity-60 ${config.colorMode === 'Dark' ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-slate-900 hover:bg-slate-800'}`}>
                   <FileSpreadsheet className="w-4 h-4" /> {isExporting ? 'Generating Excel...' : t.exportExcel}
                </button>
             </div>
          </header>

          <main className="flex-1 overflow-y-auto p-8 lg:p-10">
            {activeTab === 'upload' ? (
              <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
                <label className={`group relative block border-2 border-dashed rounded-[32px] p-16 text-center transition-all cursor-pointer shadow-sm ${config.colorMode === 'Dark' ? 'bg-slate-900 border-slate-700 hover:border-indigo-500' : 'bg-white border-slate-300 hover:border-indigo-400'}`}>
                  <div className={`w-16 h-16 ${config.theme.light} rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-all duration-300 ${config.colorMode === 'Dark' ? 'bg-indigo-900/30' : ''}`}>
                    <Upload className={`w-8 h-8 ${config.theme.text}`} />
                  </div>
                  <h3 className={`text-lg font-black ${config.colorMode === 'Dark' ? 'text-slate-200' : 'text-slate-800'}`}>{t.uploadHint}</h3>
                  <p className={`text-xs mt-2 font-medium ${config.colorMode === 'Dark' ? 'text-slate-500' : 'text-slate-400'}`}>{t.uploadLimit}</p>
                  <input type="file" className="hidden" multiple onChange={handleUpload} accept="image/png,image/jpeg,application/pdf" />
                </label>

                <UploadQueue items={uploadList} visibleLimit={config.uploadQueueLimit || 10} processingLabel={t.processing} config={config} />

                <div className="space-y-4">
                  <div className="flex flex-wrap gap-3 items-center p-2">
                     <div className="relative flex-1 min-w-[200px]">
                        <Search className={`absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 ${config.colorMode === 'Dark' ? 'text-slate-600' : 'text-slate-400'}`} />
                        <input type="text" placeholder={t.searchPlaceholder} value={filters.search} onChange={e => setFilters({...filters, search: e.target.value})} className={`w-full border rounded-xl pl-10 pr-4 py-2.5 text-xs font-medium focus:outline-none transition-all shadow-sm ${config.colorMode === 'Dark' ? 'bg-slate-900 border-slate-800 text-white focus:border-indigo-500 ring-indigo-500/10' : 'bg-white border-slate-200 text-slate-900 focus:border-indigo-500 ring-indigo-500/10'}`} />
                     </div>
                     <div className="relative">
                        <select value={filters.status} onChange={e => setFilters({...filters, status: e.target.value})} className={`appearance-none border rounded-xl pl-4 pr-10 py-2.5 text-xs font-black outline-none shadow-sm transition-all cursor-pointer ${config.colorMode === 'Dark' ? 'bg-slate-900 border-slate-800 text-slate-400 focus:border-indigo-500' : 'bg-white border-slate-200 text-slate-600 focus:border-indigo-500'}`}>
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
                           {documentTypeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                     </div>

                     <div className="relative">
                        <select value={filters.tag} onChange={e => setFilters({...filters, tag: e.target.value})} className={`appearance-none border rounded-xl pl-4 pr-10 py-2.5 text-xs font-black outline-none shadow-sm transition-all cursor-pointer ${config.colorMode === 'Dark' ? 'bg-slate-900 border-slate-800 text-slate-400 focus:border-indigo-500' : 'bg-white border-slate-200 text-slate-600 focus:border-indigo-500'}`}>
                           <option value="All">{t.tagAll}</option>
                           {TAGS_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                     </div>
                  </div>

                  {selectedRowIds.length > 0 && (
                    <div className={`mx-2 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${config.colorMode === 'Dark' ? 'border-indigo-900 bg-indigo-950/30' : 'border-indigo-100 bg-indigo-50'}`}>
                      <p className={`text-[10px] font-black uppercase ${config.colorMode === 'Dark' ? 'text-indigo-200' : 'text-indigo-700'}`}>{selectedRowIds.length} selected</p>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => handleExport()} className="rounded-xl bg-white px-3 py-2 text-[10px] font-black uppercase text-slate-700 shadow-sm hover:bg-slate-50">Export selected</button>
                        <button type="button" onClick={handleBatchMarkSynced} className="rounded-xl bg-emerald-600 px-3 py-2 text-[10px] font-black uppercase text-white shadow-sm hover:bg-emerald-500">Mark synced</button>
                        <button type="button" onClick={handleBatchDelete} className="rounded-xl bg-rose-600 px-3 py-2 text-[10px] font-black uppercase text-white shadow-sm hover:bg-rose-500">Delete selected</button>
                      </div>
                    </div>
                  )}

                  <ReceiptTable
                    items={filteredHistory}
                    selectedRowIds={selectedRowIds}
                    labels={{
                      merchantLabel: t.merchantLabel,
                      thumbnailLabel: t.thumbnailLabel,
                      financialsLabel: t.financialsLabel,
                      tagsLabel: t.tagsLabel,
                      auditLabel: t.auditLabel,
                      retry: t.retry,
                      loadingRecords: t.loadingRecords,
                      noRecords: t.noRecords,
                      totalItems: t.totalItems,
                    }}
                    isLoading={isReceiptsLoading}
                    config={config}
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
              <div className="max-w-6xl mx-auto space-y-6">
                {deletedReceipts.length > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4">
                    <label className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-500">
                      <input
                        type="checkbox"
                        checked={selectedDeletedIds.length === deletedReceipts.length}
                        onChange={() => setSelectedDeletedIds((current) => current.length === deletedReceipts.length ? [] : deletedReceipts.map((receipt) => receipt.id))}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      {selectedDeletedIds.length} selected
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={handleBatchRestoreDeleted} className="rounded-xl bg-emerald-50 px-3 py-2 text-[10px] font-black uppercase text-emerald-700 hover:bg-emerald-100">Restore selected</button>
                      <button type="button" onClick={handleBatchPermanentDelete} className="rounded-xl bg-rose-50 px-3 py-2 text-[10px] font-black uppercase text-rose-700 hover:bg-rose-100">Delete selected</button>
                    </div>
                  </div>
                )}
                <DeletedReceiptList
                  receipts={deletedReceipts.map(toApiReceipt)}
                  selectedIds={selectedDeletedIds}
                  onToggleSelect={(id) => setSelectedDeletedIds((current) => current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id])}
                  onOpen={(id) => {
                    const found = deletedReceipts.find((receipt) => receipt.id === id);
                    if (found) setSelectedReceipt(found);
                  }}
                  onCopyReuploadMessage={(message) => {
                    void copyTextToClipboard(message)
                      .then(() => showToast('Reupload request copied.', 'success'))
                      .catch(() => showToast('Copy failed.', 'error'));
                  }}
                  onRestore={handleRestoreDeleted}
                  onPermanentDelete={handlePermanentDelete}
                />
              </div>
            ) : (
              <div className="max-w-6xl mx-auto space-y-6">
                 <div className="flex gap-4 items-center">
                     <div className="relative flex-1 group min-w-[200px]">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input type="text" placeholder="全局搜索历史商户或发票号..." value={filters.search} onChange={e => setFilters({...filters, search: e.target.value})} className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs font-medium focus:outline-none focus:border-indigo-500 shadow-sm" />
                     </div>
                 </div>

                 <div className="bg-white border border-slate-200 rounded-[24px] overflow-hidden shadow-sm">
                    <table className="w-full text-left">
                       <thead className="bg-slate-50 text-[10px] font-black text-slate-500 uppercase border-b border-slate-100">
                          <tr><th className="px-6 py-4">已同步数据 (Supabase)</th><th className="px-6 py-4">Total</th><th className="px-6 py-4 text-right">Action</th></tr>
                       </thead>
                       <tbody className="divide-y divide-slate-50">
                          {filteredHistory.filter(h => h.status === 'Synced').map(item => (
                            <tr key={item.id} className={`hover:bg-slate-50 transition-all cursor-pointer ${config.colorMode === 'Dark' ? 'hover:bg-slate-800 border-slate-800' : ''}`} onClick={() => setSelectedReceipt(item)}>
                              <td className="px-6 py-5 font-black text-sm">{item.merchant_name}</td>
                              <td className="px-6 py-5 font-black">{config.currency} {parseFloat(item.grand_total as any).toFixed(2)}</td>
                              <td className="px-6 py-5 text-right">
                                 <div className="flex items-center justify-end gap-2">
                                  <ExternalLink className="w-4 h-4 text-slate-400" />
                                  <button onClick={(e) => handleDelete(item.id, e)} className={`p-1.5 rounded-lg transition-all ${config.colorMode === 'Dark' ? 'text-slate-600 hover:bg-rose-600/20 hover:text-rose-500' : 'text-slate-300 hover:bg-rose-50 hover:text-rose-500'}`} title="从存档移除">
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
          onReceiptChange={setSelectedReceipt}
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
              alt="Zoomed Receipt" 
              className="max-w-full max-h-full object-contain drop-shadow-2xl rounded-lg cursor-default" 
              onClick={(e) => e.stopPropagation()} 
              referrerPolicy="no-referrer"
           />
        </div>
      )}
    </AppShell>
  );
}
