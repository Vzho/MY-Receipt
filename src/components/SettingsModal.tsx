import { Banknote, BellRing, CheckCircle, Languages, ListOrdered, Moon, Settings, Sun, X } from 'lucide-react'
import { playNotificationSoundPreview, shouldPreviewNotificationSoundOnToggle } from '../lib/notificationSound'
import { FieldConfigPanel } from './FieldConfigPanel'
import type { FieldPreference } from '../types/fieldConfig'

interface SettingsModalProps {
  config: any
  labels: any
  themes: any[]
  fieldPreferences: FieldPreference[]
  onConfigChange: (config: any) => void
  onFieldPreferencesChange: (preferences: FieldPreference[]) => void
  onClose: () => void
}

export function SettingsModal({
  config,
  labels,
  themes,
  fieldPreferences,
  onConfigChange,
  onFieldPreferencesChange,
  onClose,
}: SettingsModalProps) {
  const uploadQueueLimit = Math.max(1, Math.round(Number(config.uploadQueueLimit) || 10))
  const receiptListPageSize = Math.max(1, Math.round(Number(config.receiptListPageSize) || 10))
  const queueLimitOptions = [5, 10, 20]
  const receiptPageSizeOptions = [10, 20, 50]

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
      <div className={`settings-modal-frame w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-[32px] shadow-2xl transition-colors ${config.colorMode === 'Dark' ? 'bg-slate-900 text-white border border-slate-800' : 'bg-white text-slate-900'}`}>
        <div className="settings-modal-scroll themed-scrollbar max-h-[90vh] overflow-y-auto p-8 space-y-6">
        <div className={`flex justify-between items-center border-b pb-4 ${config.colorMode === 'Dark' ? 'border-slate-800' : 'border-slate-50'}`}>
          <h3 className="text-xl font-black flex items-center gap-2">
            <Settings className="w-5 h-5" /> {labels.systemPref}
          </h3>
          <button onClick={onClose} className={`p-2 rounded-full transition-all ${config.colorMode === 'Dark' ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-400'}`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-6">
          <div className="space-y-3">
            <label className={`text-[10px] font-black uppercase tracking-[2px] flex items-center gap-2 ${config.colorMode === 'Dark' ? 'text-slate-500' : 'text-slate-400'}`}>
              <Languages className="w-3.5 h-3.5" /> {labels.languagePref}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[{ id: 'zh', name: '中文' }, { id: 'en', name: 'English' }, { id: 'ms', name: 'Melayu' }].map((lang) => (
                <button
                  key={lang.id}
                  onClick={() => onConfigChange({ ...config, language: lang.id })}
                  className={`px-4 py-3 rounded-xl text-xs font-black transition-all border ${
                    config.language === lang.id
                      ? `${config.theme.color} text-white border-transparent shadow-lg`
                      : config.colorMode === 'Dark'
                        ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                        : 'bg-slate-50 border-slate-100 text-slate-600 hover:bg-white hover:shadow-sm'
                  }`}
                >
                  {lang.name}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <label className={`text-[10px] font-black uppercase tracking-[2px] flex items-center gap-2 ${config.colorMode === 'Dark' ? 'text-slate-500' : 'text-slate-400'}`}>
              <Sun className="w-3.5 h-3.5" /> {labels.themeMode}
            </label>
            <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl gap-1">
              <button
                onClick={() => onConfigChange({ ...config, colorMode: 'Light' })}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black transition-all ${config.colorMode === 'Light' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Sun className="w-4 h-4" /> {labels.lightMode}
              </button>
              <button
                onClick={() => onConfigChange({ ...config, colorMode: 'Dark' })}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black transition-all ${config.colorMode === 'Dark' ? 'bg-slate-700 shadow-sm text-white' : 'text-slate-500 hover:text-slate-300'}`}
              >
                <Moon className="w-4 h-4" /> {labels.darkMode}
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <label className={`text-[10px] font-black uppercase tracking-[2px] flex items-center gap-2 ${config.colorMode === 'Dark' ? 'text-slate-500' : 'text-slate-400'}`}>
              <Banknote className="w-3.5 h-3.5" /> {labels.currencyPref}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {['RM', 'USD', 'CNY'].map((currency) => (
                <button
                  key={currency}
                  onClick={() => onConfigChange({ ...config, currency })}
                  className={`px-4 py-3 rounded-xl text-xs font-black transition-all border ${
                    config.currency === currency
                      ? `${config.theme.color} text-white border-transparent shadow-lg`
                      : config.colorMode === 'Dark'
                        ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                        : 'bg-slate-50 border-slate-100 text-slate-600 hover:bg-white hover:shadow-sm'
                  }`}
                >
                  {currency}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={`text-[10px] font-black uppercase tracking-[2px] block mb-3 ${config.colorMode === 'Dark' ? 'text-slate-500' : 'text-slate-400'}`}>{labels.brandColor}</label>
            <div className="flex gap-4">
              {themes.map((theme) => (
                <button
                  key={theme.name}
                  onClick={() => onConfigChange({ ...config, theme })}
                  className={`w-10 h-10 rounded-2xl ${theme.color} flex items-center justify-center transition-all ${config.theme.name === theme.name ? 'scale-110 ring-4 ring-offset-4 ' + (config.colorMode === 'Dark' ? 'ring-slate-700 ring-offset-slate-900' : 'ring-slate-200 ring-offset-white') : 'opacity-40 hover:opacity-100'}`}
                >
                  {config.theme.name === theme.name && <CheckCircle className="w-5 h-5 text-white" />}
                </button>
              ))}
            </div>
          </div>

          <div className={`flex items-center justify-between gap-4 rounded-2xl border p-4 ${config.colorMode === 'Dark' ? 'border-slate-800 bg-slate-950/40' : 'border-slate-100 bg-slate-50'}`}>
            <div>
              <label className={`text-[10px] font-black uppercase tracking-[2px] flex items-center gap-2 ${config.colorMode === 'Dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                <BellRing className="w-3.5 h-3.5" /> 消息音效
              </label>
              <p className={`mt-1 text-[11px] font-semibold ${config.colorMode === 'Dark' ? 'text-slate-500' : 'text-slate-400'}`}>仅在失败、重复检测和批量完成等关键消息时播放。</p>
            </div>
            <button
              type="button"
              onClick={() => {
                const nextNotificationSound = !config.notificationSound
                if (shouldPreviewNotificationSoundOnToggle(Boolean(config.notificationSound), nextNotificationSound)) {
                  playNotificationSoundPreview()
                }
                onConfigChange({ ...config, notificationSound: nextNotificationSound })
              }}
              className={`relative h-7 w-12 rounded-full transition ${config.notificationSound ? config.theme.color : config.colorMode === 'Dark' ? 'bg-slate-700' : 'bg-slate-300'}`}
              aria-pressed={Boolean(config.notificationSound)}
            >
              <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${config.notificationSound ? 'left-6' : 'left-1'}`} />
            </button>
          </div>

          <div className={`flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-4 ${config.colorMode === 'Dark' ? 'border-slate-800 bg-slate-950/40' : 'border-slate-100 bg-slate-50'}`}>
            <div>
              <label className={`text-[10px] font-black uppercase tracking-[2px] flex items-center gap-2 ${config.colorMode === 'Dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                <ListOrdered className="w-3.5 h-3.5" /> 上传队列显示数量
              </label>
              <p className={`mt-1 text-[11px] font-semibold ${config.colorMode === 'Dark' ? 'text-slate-500' : 'text-slate-400'}`}>批量上传时首页默认展示的处理任务数量。</p>
            </div>
            <div className={`grid grid-cols-3 gap-1 rounded-2xl p-1 ${config.colorMode === 'Dark' ? 'bg-slate-800' : 'bg-slate-100'}`}>
              {queueLimitOptions.map((limit) => (
                <button
                  key={limit}
                  type="button"
                  onClick={() => onConfigChange({ ...config, uploadQueueLimit: limit })}
                  aria-pressed={uploadQueueLimit === limit}
                  className={`min-w-12 rounded-xl px-4 py-2 text-xs font-black transition-all ${
                    uploadQueueLimit === limit
                      ? `${config.theme.color} text-white shadow-sm`
                      : config.colorMode === 'Dark'
                        ? 'text-slate-400 hover:bg-slate-700'
                        : 'text-slate-500 hover:bg-white'
                  }`}
                >
                  {limit}
                </button>
              ))}
            </div>
          </div>

          <div className={`flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-4 ${config.colorMode === 'Dark' ? 'border-slate-800 bg-slate-950/40' : 'border-slate-100 bg-slate-50'}`}>
            <div>
              <label className={`text-[10px] font-black uppercase tracking-[2px] flex items-center gap-2 ${config.colorMode === 'Dark' ? 'text-slate-400' : 'text-slate-600'}`}>
                <ListOrdered className="w-3.5 h-3.5" /> 发票列表每页数量
              </label>
              <p className={`mt-1 text-[11px] font-semibold ${config.colorMode === 'Dark' ? 'text-slate-500' : 'text-slate-400'}`}>首页发票列表每页默认展示的记录数量。</p>
            </div>
            <div className={`grid grid-cols-3 gap-1 rounded-2xl p-1 ${config.colorMode === 'Dark' ? 'bg-slate-800' : 'bg-slate-100'}`}>
              {receiptPageSizeOptions.map((limit) => (
                <button
                  key={limit}
                  type="button"
                  onClick={() => onConfigChange({ ...config, receiptListPageSize: limit })}
                  aria-pressed={receiptListPageSize === limit}
                  className={`min-w-12 rounded-xl px-4 py-2 text-xs font-black transition-all ${
                    receiptListPageSize === limit
                      ? `${config.theme.color} text-white shadow-sm`
                      : config.colorMode === 'Dark'
                        ? 'text-slate-400 hover:bg-slate-700'
                        : 'text-slate-500 hover:bg-white'
                  }`}
                >
                  {limit}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <label className={`text-[10px] font-black uppercase tracking-[2px] block ${config.colorMode === 'Dark' ? 'text-slate-500' : 'text-slate-400'}`}>Field extraction & export</label>
            <FieldConfigPanel preferences={fieldPreferences} onChange={onFieldPreferencesChange} />
          </div>
        </div>

        <div className="pt-2">
          <button
            onClick={onClose}
            className={`w-full py-4 ${config.theme.color} text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg hover:brightness-110 transition-all`}
          >
            {labels.saveAndApply}
          </button>
        </div>
        </div>
      </div>
    </div>
  )
}
