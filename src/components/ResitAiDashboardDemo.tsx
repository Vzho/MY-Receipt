import {
  AlertTriangle,
  BadgeCheck,
  Bell,
  Brain,
  ChevronRight,
  Clipboard,
  Download,
  Eye,
  FileSearch,
  Filter,
  History,
  Image as ImageIcon,
  LayoutGrid,
  Layers,
  Plus,
  Receipt,
  RotateCcw,
  Rows3,
  Search,
  SearchCheck,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  Zap,
} from 'lucide-react'

const toolGroups = ['全部', '待审核', '已同步', '异常项', 'Rejected', 'E-invoice']

const functionalTools = [
  { title: 'OCR-first', icon: FileSearch, tone: 'text-blue-600 bg-blue-50' },
  { title: 'Qwen VL', icon: Brain, tone: 'text-violet-600 bg-violet-50' },
  { title: 'DeepSeek', icon: Sparkles, tone: 'text-emerald-600 bg-emerald-50' },
  { title: '重复检测', icon: SearchCheck, tone: 'text-amber-600 bg-amber-50' },
  { title: '字段配置', icon: Settings, tone: 'text-slate-600 bg-slate-50' },
  { title: 'Excel 导出', icon: Download, tone: 'text-indigo-600 bg-indigo-50' },
]

const receipts = [
  {
    no: 'R0080',
    merchant: 'HOW KEE KOPITIAM (M) SDN. BHD.',
    invoice: 'CS00080062',
    amount: 'RM 57.80',
    date: '2026-04-19',
    type: 'Receipt',
    status: '可同步',
    tags: ['图片需确认'],
    color: 'bg-emerald-500',
  },
  {
    no: 'I1268',
    merchant: "BAKER'S COTTAGE SUNGAI BAKAP",
    invoice: '6230126818',
    amount: 'RM 18.00',
    date: '2026-03-21',
    type: 'Invoice',
    status: '待审核',
    tags: ['重复风险'],
    color: 'bg-amber-500',
  },
  {
    no: 'R7176',
    merchant: 'CRUMBS BAKERY DESSERT SDN. BHD.',
    invoice: 'NTCS01-1071769',
    amount: 'RM 56.70',
    date: '2026-04-19',
    type: 'Receipt',
    status: '异常项',
    tags: ['金额待核对'],
    color: 'bg-rose-500',
  },
  {
    no: 'R0122',
    merchant: 'SHELL MALAYSIA TRADING',
    invoice: 'SH-99201',
    amount: 'RM 120.00',
    date: '2026-05-02',
    type: 'Receipt',
    status: '可同步',
    tags: [],
    color: 'bg-emerald-500',
  },
  {
    no: 'I4412',
    merchant: 'GRAB HOLDINGS LIMITED',
    invoice: 'GRB-2026-04',
    amount: 'RM 32.50',
    date: '2026-04-28',
    type: 'Invoice',
    status: '待审核',
    tags: ['图片需确认'],
    color: 'bg-amber-500',
  },
  {
    no: 'R8891',
    merchant: 'STARBUCKS COFFEE MALAYSIA',
    invoice: 'SBX-112039',
    amount: 'RM 16.00',
    date: '2026-05-05',
    type: 'Receipt',
    status: '已同步',
    tags: [],
    color: 'bg-slate-300',
  },
  {
    no: 'R9012',
    merchant: 'JAYA GROCER (SUNWAY GIZA)',
    invoice: 'JG-882031',
    amount: 'RM 245.90',
    date: '2026-05-06',
    type: 'Receipt',
    status: '待审核',
    tags: ['金额待核对'],
    color: 'bg-amber-500',
  },
  {
    no: 'I5501',
    merchant: 'TELEKOM MALAYSIA BERHAD',
    invoice: 'TM-MAY-2026',
    amount: 'RM 159.00',
    date: '2026-05-01',
    type: 'Invoice',
    status: '可同步',
    tags: ['E-invoice'],
    color: 'bg-emerald-500',
  },
]

const queue = [
  { name: 'p8_0.jpeg', status: 'OCR 识别中', progressWidth: 'w-5/12', icon: FileSearch },
  { name: 'invoice-batch.pdf', status: 'PDF 页面分割', progressWidth: 'w-8/12', icon: Rows3 },
  { name: 'IMG_4412.png', status: '等待智能修复', progressWidth: 'w-2/12', icon: ImageIcon },
]

function StatusBadge({ status }: { status: string }) {
  const isSyncReady = status === '可同步'
  const isPending = status === '待审核'
  const isError = status === '异常项'
  const isSynced = status === '已同步'

  return (
    <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-black border ${
      isSyncReady ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
      isError ? 'bg-rose-50 text-rose-700 border-rose-200' :
      isSynced ? 'bg-slate-50 text-slate-600 border-slate-200' :
      'bg-amber-50 text-amber-700 border-amber-200'
    }`}>
      {status}
    </span>
  )
}

function SecondaryTag({ text }: { key?: string; text: string }) {
  return (
    <span className="rounded bg-white border border-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-500 shadow-sm flex items-center gap-1">
      {text.includes('风险') || text.includes('核对') || text.includes('确认') ? (
        <AlertTriangle className="h-2.5 w-2.5 text-amber-500" />
      ) : null}
      {text}
    </span>
  )
}

function ReceiptThumbnail({ color }: { color: string }) {
  return (
    <div className="relative h-14 w-10 rounded-[3px] bg-white shadow-[0_2px_4px_rgba(0,0,0,0.06)] border border-slate-200 overflow-hidden flex flex-col transform group-hover:rotate-2 transition-transform duration-300">
      <div className={`h-1.5 w-full ${color}`} />
      <div className="flex-1 px-1.5 py-1.5 flex flex-col gap-1">
        <div className="h-0.5 w-3/4 bg-slate-300 rounded-full mx-auto" />
        <div className="h-0.5 w-1/2 bg-slate-200 rounded-full mx-auto mb-1" />
        
        <div className="h-0.5 w-full bg-slate-100 rounded-full" />
        <div className="h-0.5 w-4/5 bg-slate-100 rounded-full" />
        <div className="h-0.5 w-full bg-slate-100 rounded-full" />
        
        <div className="mt-auto flex justify-between items-end border-t border-slate-100 pt-0.5">
          <div className="h-0.5 w-2 bg-slate-200 rounded-full" />
          <div className="h-1 w-4 bg-slate-400 rounded-full" />
        </div>
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-slate-50/50 pointer-events-none" />
    </div>
  )
}

export function ResitAiDashboardDemo() {
  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-900 selection:bg-rose-100 selection:text-rose-900 font-sans flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-4 px-4 xl:px-8 py-2.5">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded bg-[#ed1c24] text-white">
                <Receipt className="h-4.5 w-4.5" />
              </div>
              <span className="text-lg font-black tracking-tighter text-slate-900">ResitAI</span>
            </div>
            <nav className="hidden items-center gap-1 md:flex">
              {['审核工作台', '文件库', '财务配置'].map((tab, i) => (
                <button
                  key={tab}
                  className={`rounded-md px-3 py-1.5 text-sm font-bold transition-colors ${i === 0 ? 'text-[#ed1c24] bg-rose-50' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}
                >
                  {tab}
                </button>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative hidden lg:block">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="搜索商户、发票号..."
                className="h-8 w-64 rounded-lg border border-slate-200 bg-slate-50 pl-9 text-xs font-medium focus:border-rose-300 focus:bg-white focus:ring-1 focus:ring-rose-200 focus:outline-none transition-all"
              />
            </div>
            <div className="h-5 w-[1px] bg-slate-200" />
            <button className="relative p-2 text-slate-500 hover:text-slate-900 transition-colors">
              <Bell className="h-4 w-4" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border-2 border-white bg-rose-500" />
            </button>
            <button className="flex h-8 w-8 items-center justify-center rounded-full bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
               <Settings className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 rounded-full bg-slate-100 p-1 pr-3 border border-slate-200 cursor-pointer hover:bg-slate-200 transition-colors">
              <div className="h-6 w-6 rounded-full bg-slate-400 text-white flex items-center justify-center text-[10px] font-bold">管</div>
              <span className="text-[12px] font-black text-slate-700">管理员</span>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1800px] w-full p-4 xl:px-8 xl:py-6 flex-1 flex flex-col">
        {/* Compact Operational Summary */}
        <div className="mb-5 flex flex-wrap items-center gap-2 sm:gap-4">
          <div className="flex bg-white rounded-lg border border-slate-200 shadow-sm p-1">
            {[
              { label: '今日待审', val: '12', color: 'text-amber-600' },
              { label: '本月同步', val: '428', color: 'text-emerald-600' },
              { label: '异常项', val: '5', color: 'text-rose-600' },
              { label: 'Rejected', val: '2', color: 'text-slate-600' },
            ].map((s, i) => (
              <div key={s.label} className={`flex items-center gap-2.5 px-4 py-1.5 ${i !== 0 ? 'border-l border-slate-100' : ''}`}>
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">{s.label}</span>
                <span className={`text-sm font-black tabular-nums ${s.color}`}>{s.val}</span>
              </div>
            ))}
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 rounded-lg bg-white border border-slate-200 px-3 py-2 text-[12px] font-black text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900 transition-colors">
              <Download className="h-3.5 w-3.5" /> 导出当月明细
            </button>
            <button className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-[12px] font-black text-white shadow-md hover:bg-slate-800 transition-all active:scale-95">
              <Plus className="h-3.5 w-3.5" /> 手动录入
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 flex-1">
          
          {/* LEFT COLUMN: CORE WORKSPACE */}
          <div className="lg:col-span-9 flex flex-col gap-5">
            
            {/* Upload Action Strip */}
            <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
               <button className="group relative flex items-center justify-center gap-3 rounded-xl border border-rose-200 bg-rose-50/50 px-4 py-3.5 text-left transition-all hover:bg-rose-50 hover:border-[#ed1c24] active:scale-[0.98] overflow-hidden">
                  <div className="bg-white p-2.5 rounded-lg shadow-sm border border-rose-100 group-hover:scale-105 transition-transform">
                    <UploadCloud className="h-4.5 w-4.5 text-[#ed1c24]" />
                  </div>
                  <div>
                    <p className="text-[13px] font-black text-slate-800 leading-tight group-hover:text-[#ed1c24] transition-colors">点击或拖拽上传</p>
                    <p className="text-[11px] text-slate-500 font-bold mt-0.5">支持批量 JPEG / PDF</p>
                  </div>
               </button>
               <button className="group flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-left shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98]">
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 group-hover:bg-white group-hover:shadow-sm transition-all">
                    <Clipboard className="h-4.5 w-4.5 text-slate-500 group-hover:text-slate-700" />
                  </div>
                  <div>
                    <p className="text-[13px] font-black text-slate-800 leading-tight">粘贴图片上传</p>
                    <p className="text-[11px] text-slate-400 font-bold mt-0.5">Ctrl + V 截图即识</p>
                  </div>
               </button>
               <button className="group flex items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-left shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98]">
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 group-hover:bg-white group-hover:shadow-sm transition-all">
                    <Layers className="h-4.5 w-4.5 text-slate-500 group-hover:text-slate-700" />
                  </div>
                  <div>
                    <p className="text-[13px] font-black text-slate-800 leading-tight">PDF 按页处理</p>
                    <p className="text-[11px] text-slate-400 font-bold mt-0.5">拆分 / 合并 / 长文档</p>
                  </div>
               </button>
            </section>

            {/* Main Receipt Table - Core Workspace */}
            <section className="flex flex-col flex-1 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden min-h-[600px]">
              
              {/* Table Toolbar */}
              <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/80 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
                  <h2 className="flex shrink-0 items-center gap-2 whitespace-nowrap text-[15px] font-black text-slate-800">
                    <LayoutGrid className="h-4.5 w-4.5 text-[#ed1c24]" /> 票据处理工作区
                  </h2>
                  <div className="hidden h-5 w-[1px] bg-slate-200 sm:block" />
                  <div className="flex max-w-full gap-1.5 overflow-x-auto no-scrollbar">
                    {toolGroups.map((g, i) => (
                      <button key={g} className={`shrink-0 rounded-md px-3 py-1.5 text-[12px] font-bold transition-all ${i === 1 ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-500 hover:bg-slate-200 hover:text-slate-800'}`}>
                        {g} {i === 1 && <span className="ml-1 rounded-full bg-amber-100 text-amber-700 px-1.5 py-0.5 text-[10px]">12</span>}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
                  <div className="relative">
                    <Filter className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <select className="appearance-none h-8 rounded-md border border-slate-200 bg-white pl-8 pr-8 text-[12px] font-bold text-slate-600 focus:outline-none focus:border-rose-300 hover:bg-slate-50 cursor-pointer transition-colors">
                      <option>所有时间</option>
                      <option>今日</option>
                      <option>本周</option>
                    </select>
                    <ChevronRight className="absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400 rotate-90 pointer-events-none" />
                  </div>
                  <div className="h-5 w-[1px] bg-slate-200 mx-1" />
                  <button className="flex items-center gap-1.5 rounded-md bg-slate-900 px-4 py-1.5 text-[12px] font-black text-white shadow-sm transition-all hover:bg-slate-800 active:scale-95">
                    <BadgeCheck className="h-4 w-4" /> 批量同步
                  </button>
                </div>
              </div>

              {/* Audit Guide Section */}
              <div className="mx-5 mt-4 mb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm">
                 <div className="flex items-center gap-2.5">
                   <AlertTriangle className="h-4.5 w-4.5 text-amber-600" />
                   <span className="text-[13px] font-bold text-amber-800">
                     建议优先处理 5 张异常票据，其中 2 张疑似重复，3 张金额待核对。
                   </span>
                 </div>
                 <div className="flex gap-2.5">
                   <button className="flex items-center justify-center gap-1.5 rounded-md bg-white border border-amber-200 px-3 py-1.5 text-[12px] font-black text-amber-700 shadow-sm hover:bg-amber-100 transition-colors">
                     审核下一张
                   </button>
                   <button className="flex items-center justify-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-[12px] font-black text-white shadow-sm hover:bg-amber-700 transition-colors">
                     处理异常项 <ChevronRight className="h-3.5 w-3.5" />
                   </button>
                 </div>
              </div>

              {/* Table Body - Container */}
              <div className="flex-1 overflow-auto bg-slate-50/20 mt-1">
                
                {/* Desktop Header */}
                <div className="sticky top-0 z-10 hidden grid-cols-[50px_minmax(220px,1fr)_72px_100px_130px_260px_130px] items-center border-y border-slate-200 bg-slate-50 px-5 py-2.5 text-[11px] font-black uppercase tracking-widest text-slate-500 md:grid shadow-sm">
                  <span className="text-center">#</span>
                  <span>商户 / 发票号</span>
                  <span className="text-center">预览</span>
                  <span className="text-center">分类</span>
                  <span className="text-right">总金额</span>
                  <span className="pl-5">业务状态与标签</span>
                  <span className="text-right pr-2">操作</span>
                </div>

                {/* Mobile View: Cards */}
                <div className="divide-y divide-slate-100 md:hidden border-t border-slate-100">
                  {receipts.map((r, idx) => (
                    <div key={r.no} className="bg-white p-5 transition-colors hover:bg-slate-50">
                      <div className="flex items-start gap-4">
                        <ReceiptThumbnail color={r.color} />
                        <div className="min-w-0 flex-1">
                          <div className="flex justify-between items-start mb-1.5">
                            <p className="truncate text-[15px] font-black text-slate-800">{r.merchant}</p>
                            <p className="text-[15px] font-black text-slate-900 tabular-nums shrink-0 ml-2">{r.amount}</p>
                          </div>
                          <div className="flex justify-between items-center mb-3.5">
                            <p className="text-[12px] font-bold text-slate-400 tabular-nums">{r.invoice}</p>
                            <p className="text-[11px] font-bold text-slate-400 tabular-nums">{r.date}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge status={r.status} />
                            {r.tags.map(t => <SecondaryTag key={t} text={t} />)}
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 flex justify-end gap-2.5 border-t border-slate-50 pt-4">
                        <button className="flex items-center justify-center flex-1 rounded-md bg-slate-50 py-2.5 text-[12px] font-bold text-slate-600 transition-colors hover:bg-slate-100 border border-slate-200">
                          详情
                        </button>
                        <button className="flex items-center justify-center flex-1 rounded-md bg-emerald-50 py-2.5 text-[12px] font-bold text-emerald-700 transition-colors hover:bg-emerald-100 border border-emerald-200">
                          同步
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop View: High Density Rows */}
                <div className="hidden divide-y divide-slate-100 md:block bg-white border-b border-slate-100">
                  {receipts.map((r, idx) => (
                    <div key={r.no} className="group grid grid-cols-[50px_minmax(220px,1fr)_72px_100px_130px_260px_130px] items-center px-5 py-3 transition-colors hover:bg-slate-50/80 cursor-default">
                      <span className="text-[11px] font-bold text-slate-300 text-center group-hover:text-slate-500">{(idx + 1).toString().padStart(2, '0')}</span>
                      <div className="min-w-0 pr-4">
                        <p className="truncate text-sm font-black text-slate-800 group-hover:text-blue-600 transition-colors">{r.merchant}</p>
                        <p className="mt-1 text-[11px] font-bold text-slate-400 tabular-nums">{r.invoice}</p>
                      </div>
                      <div className="flex justify-center">
                        <ReceiptThumbnail color={r.color} />
                      </div>
                      <div className="text-center">
                        <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-black text-slate-500 uppercase tracking-tight">{r.type}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-[15px] font-black text-slate-900 tabular-nums">{r.amount}</p>
                        <p className="text-[11px] font-bold text-slate-400 tabular-nums">{r.date}</p>
                      </div>
                      <div className="flex flex-wrap gap-1.5 items-center pl-5">
                        <StatusBadge status={r.status} />
                        {r.tags.map(t => <SecondaryTag key={t} text={t} />)}
                      </div>
                      <div className="flex justify-end gap-1.5 opacity-60 transition-opacity group-hover:opacity-100">
                        <button title="查看详情" className="p-1.5 text-slate-400 bg-slate-50 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors border border-slate-100 hover:border-blue-200 shadow-sm flex-shrink-0">
                          <Eye className="h-4 w-4" />
                        </button>
                        <button title="确认并同步" className="p-1.5 text-slate-400 bg-slate-50 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors border border-slate-100 hover:border-emerald-200 shadow-sm flex-shrink-0">
                          <BadgeCheck className="h-4 w-4" />
                        </button>
                        <button title="移入 Rejected" className="p-1.5 text-slate-400 bg-slate-50 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors border border-slate-100 hover:border-rose-200 shadow-sm flex-shrink-0">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {/* Empty state padding to fill space and look like a proper workspace table */}
                  {[...Array(3)].map((_, i) => (
                    <div key={`empty-${i}`} className="grid grid-cols-[50px_minmax(220px,1fr)_72px_100px_130px_260px_130px] items-center px-5 py-4 border-t border-slate-50/50 bg-slate-50/30">
                      <div className="mx-auto h-2 w-4 bg-slate-200/50 rounded" />
                      <div className="space-y-2">
                        <div className="h-2 w-32 bg-slate-200/50 rounded" />
                        <div className="h-1.5 w-20 bg-slate-100 rounded" />
                      </div>
                      <div className="mx-auto h-8 w-6 bg-slate-100 rounded" />
                      <div className="mx-auto h-3 w-12 bg-slate-100 rounded" />
                      <div className="ml-auto h-3 w-16 bg-slate-200/50 rounded" />
                      <div className="pl-5 flex gap-1.5"><div className="h-5 w-14 bg-slate-100 rounded-md" /></div>
                      <div />
                    </div>
                  ))}
                </div>
              </div>

              {/* Table Pagination / Footer */}
              <div className="flex items-center justify-between bg-white px-5 py-3">
                 <p className="text-[12px] font-bold text-slate-400">显示 1-8 条 · 共计 <span className="text-slate-600">1,208</span> 条记录</p>
                 <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                      <button className="p-1 rounded border border-slate-200 text-slate-400 hover:bg-slate-50 transition-colors disabled:opacity-50"><ChevronRight className="h-4 w-4 rotate-180" /></button>
                      <span className="px-2 text-[12px] font-black text-slate-700">1</span>
                      <span className="text-[12px] font-bold text-slate-400">/ 151</span>
                      <button className="p-1 rounded border border-slate-200 text-slate-400 hover:bg-slate-50 transition-colors"><ChevronRight className="h-4 w-4" /></button>
                    </div>
                 </div>
              </div>
            </section>
          </div>

          {/* RIGHT COLUMN: UNIFIED OPERATIONS PANEL */}
          <div className="lg:col-span-3 flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden h-fit">
            
            {/* 1. Real-time Processing Queue */}
            <div className="p-5 border-b border-slate-100">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[12px] font-black uppercase tracking-widest text-slate-600">实时处理队列</h3>
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[10px] font-bold border border-blue-100">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                  运行中
                </div>
              </div>
              <div className="space-y-4">
                {queue.map((item) => {
                  const Icon = item.icon
                  return (
                    <div key={item.name} className="group">
                      <div className="flex items-center gap-2.5 mb-1.5">
                        <Icon className="h-3.5 w-3.5 text-slate-400" />
                        <div className="min-w-0 flex-1 flex justify-between items-baseline">
                          <p className="truncate text-[12px] font-black text-slate-700">{item.name}</p>
                          <p className="text-[10px] font-bold text-slate-400 whitespace-nowrap ml-2">{item.status}</p>
                        </div>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full rounded-full bg-blue-500 ${item.progressWidth}`} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 2. AI Audit Suggestions */}
            <div className="p-5 bg-slate-800 text-white">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/10">
                <ShieldCheck className="h-4.5 w-4.5 text-emerald-400" />
                <h3 className="text-[12px] font-black uppercase tracking-widest text-slate-200">AI 审核建议</h3>
              </div>
              <div className="space-y-3.5">
                {[
                  { text: '发现 2 个高疑似重复项', icon: SearchCheck, color: 'text-amber-400' },
                  { text: '商户名与历史库高度匹配', icon: BadgeCheck, color: 'text-emerald-400' },
                  { text: '建议人工核查异常金额票据', icon: AlertTriangle, color: 'text-rose-400' },
                ].map((item, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <item.icon className={`h-4 w-4 flex-shrink-0 ${item.color}`} />
                    <span className="text-[12px] font-bold text-slate-300 leading-snug">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 3. Lightweight Action Rows */}
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col gap-2">
               <button className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-600 transition-colors hover:bg-slate-50 hover:border-slate-300 shadow-sm">
                  <div className="flex items-center gap-2.5">
                    <Trash2 className="h-4 w-4 text-slate-400" />
                    <span className="text-[12px] font-black">Rejected 垃圾库</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300" />
               </button>
               <button className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-600 transition-colors hover:bg-slate-50 hover:border-slate-300 shadow-sm">
                  <div className="flex items-center gap-2.5">
                    <Settings className="h-4 w-4 text-slate-400" />
                    <span className="text-[12px] font-black">自动同步规则配置</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300" />
               </button>
            </div>

            {/* 4. Monthly Usage (De-emphasized) */}
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400">本月处理用量</h3>
                <button className="text-slate-300 hover:text-slate-600 transition-colors"><RotateCcw className="h-3.5 w-3.5" /></button>
              </div>
              <div className="space-y-4">
                {[
                  { name: 'OCR 基础识别', used: 212, total: 1000, color: 'bg-blue-400', width: 'w-[21%]' },
                  { name: 'AI 视觉增强', used: 53, total: 200, color: 'bg-violet-400', width: 'w-[26%]' },
                  { name: '内容修复', used: 237, total: 500, color: 'bg-emerald-400', width: 'w-[47%]' },
                ].map((p) => (
                  <div key={p.name} className="space-y-1.5 opacity-80 hover:opacity-100 transition-opacity">
                    <div className="flex justify-between items-center">
                      <p className="text-[11px] font-bold text-slate-600">{p.name}</p>
                      <span className="text-[10px] font-black tabular-nums text-slate-500">{p.used} <span className="text-slate-300 font-bold">/ {p.total}</span></span>
                    </div>
                    <div className="h-1 w-full rounded-full bg-slate-100 overflow-hidden">
                       <div className={`h-full rounded-full ${p.color} ${p.width}`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
          </div>
        </div>
      </div>
      
      <footer className="py-4 text-center mt-auto">
        <p className="text-[11px] font-bold text-slate-300">
          ResitAI 票据审核工作台
        </p>
      </footer>
    </main>
  )
}
