import { type ReactNode, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

interface AuthGateProps {
  children: ReactNode
}

export function AuthGate({ children }: AuthGateProps) {
  const [email, setEmail] = useState('')
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) return

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoading(false)
    })

    return () => subscription.subscription.unsubscribe()
  }, [])

  async function sendMagicLink() {
    if (!supabase || !email.trim()) return

    setLoading(true)
    setMessage(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: window.location.origin,
      },
    })
    setLoading(false)
    setMessage(error ? error.message : '登录链接已发送，请检查邮箱。')
  }

  async function signInAnonymously() {
    if (!supabase) return

    setLoading(true)
    setMessage(null)
    const { error } = await supabase.auth.signInAnonymously()
    setLoading(false)
    setMessage(error ? error.message : null)
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen bg-slate-100 px-6 py-10 text-slate-900">
        <div className="mx-auto max-w-lg rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-black">缺少 Supabase 配置</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            请先配置 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`。前端只允许使用 anon key；
            OpenAI API key、腾讯云 OCR、service role key 必须放在 Supabase Edge Function Secrets。
          </p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-100 text-sm font-bold text-slate-500">
        正在检查登录状态...
      </div>
    )
  }

  if (!session) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-100 px-6 text-slate-900">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-black">ResitAI</h1>
          <p className="mt-2 text-sm text-slate-500">匿名试用可直接进入；邮箱登录用于保留长期账号。</p>
          <div className="mt-6 space-y-3">
            <button
              type="button"
              onClick={signInAnonymously}
              disabled={loading}
              className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              匿名试用
            </button>
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-[10px] font-black uppercase text-slate-400">或使用邮箱</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-500"
            />
            <button
              type="button"
              onClick={sendMagicLink}
              disabled={loading || !email.trim()}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              发送登录链接
            </button>
            {message && <p className="text-xs font-bold text-slate-500">{message}</p>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      {children}
    </>
  )
}
