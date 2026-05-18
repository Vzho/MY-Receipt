import { memo } from 'react'
import { Database, Receipt, RefreshCw, Settings, Trash2 } from 'lucide-react'

interface SidebarLabels {
  workflowSection?: string
  workflow: string
  history: string
  rejected?: string
  settings: string
}

interface SidebarProps {
  activeTab: string
  uploadCount: number
  syncedCount: number
  deletedCount: number
  labels: SidebarLabels
  config: {
    colorMode: string
    theme: {
      color: string
    }
  }
  onTabChange: (tab: 'upload' | 'history' | 'rejected') => void
  onSettingsOpen: () => void
}

function SidebarComponent({
  activeTab,
  uploadCount,
  syncedCount,
  deletedCount,
  labels,
  config,
  onTabChange,
  onSettingsOpen,
}: SidebarProps) {
  return (
    <aside className={`w-64 border-r hidden lg:flex flex-col shrink-0 z-20 transition-colors ${config.colorMode === 'Dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
      <div className={`p-8 border-b ${config.colorMode === 'Dark' ? 'border-slate-800' : 'border-slate-100'}`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 ${config.theme.color} rounded-[14px] flex items-center justify-center shadow-lg transition-all ${config.colorMode === 'Dark' ? 'shadow-black/40' : 'shadow-indigo-100'}`}>
            <Receipt className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className={`font-black tracking-tight text-lg leading-none ${config.colorMode === 'Dark' ? 'text-white' : 'text-slate-800'}`}>ResitAI</h1>
            <p className={`text-[9px] font-bold mt-1 uppercase ${config.colorMode === 'Dark' ? 'text-slate-500' : 'text-slate-400'}`}>v0.3 Audit Edition</p>
          </div>
        </div>
      </div>
      <nav className="p-4 space-y-1.5 flex-1">
        <p className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest ${config.colorMode === 'Dark' ? 'text-slate-600' : 'text-slate-400'}`}>{labels.workflowSection || 'Workflow'}</p>
        <button onClick={() => onTabChange('upload')} className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl text-sm font-bold transition-all ${activeTab === 'upload' ? `${config.theme.color} text-white shadow-md` : config.colorMode === 'Dark' ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-50'}`}>
          <div className="flex items-center gap-3"><RefreshCw className={`w-4 h-4 ${uploadCount > 0 ? 'animate-spin' : ''}`} /> {labels.workflow}</div>
          {uploadCount > 0 && <span className="bg-white/20 px-2 py-0.5 rounded-md text-[10px]">{uploadCount}</span>}
        </button>
        <button onClick={() => onTabChange('history')} className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl text-sm font-bold transition-all ${activeTab === 'history' ? `${config.theme.color} text-white shadow-md` : config.colorMode === 'Dark' ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-50'}`}>
          <div className="flex items-center gap-3"><Database className="w-4 h-4" /> {labels.history}</div>
          <span className={`px-2 py-0.5 rounded-md text-[10px] ${activeTab === 'history' ? 'bg-white/20' : config.colorMode === 'Dark' ? 'bg-slate-800 text-slate-500' : 'bg-slate-100 text-slate-400'}`}>{syncedCount}</span>
        </button>
        <button onClick={() => onTabChange('rejected')} className={`w-full flex items-center justify-between px-4 py-3.5 rounded-2xl text-sm font-bold transition-all ${activeTab === 'rejected' ? `${config.theme.color} text-white shadow-md` : config.colorMode === 'Dark' ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-50'}`}>
          <div className="flex items-center gap-3"><Trash2 className="w-4 h-4" /> {labels.rejected || 'Rejected'}</div>
          <span className={`px-2 py-0.5 rounded-md text-[10px] ${activeTab === 'rejected' ? 'bg-white/20' : config.colorMode === 'Dark' ? 'bg-slate-800 text-slate-500' : 'bg-slate-100 text-slate-400'}`}>{deletedCount}</span>
        </button>
      </nav>
      <div className={`p-6 border-t transition-colors ${config.colorMode === 'Dark' ? 'border-slate-800 bg-slate-900/50' : 'border-slate-100 bg-slate-50/50'}`}>
        <button onClick={onSettingsOpen} className={`flex items-center gap-3 px-4 py-3 w-full rounded-2xl text-sm font-bold transition-all border border-transparent ${config.colorMode === 'Dark' ? 'text-slate-400 hover:bg-slate-800 hover:border-slate-700' : 'text-slate-500 hover:bg-white hover:shadow-sm hover:border-slate-200'}`}>
          <Settings className="w-4 h-4" /> {labels.settings}
        </button>
      </div>
    </aside>
  )
}

export const Sidebar = memo(SidebarComponent)
