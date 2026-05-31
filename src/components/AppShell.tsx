import type { ReactNode } from 'react'

interface AppShellProps {
  colorMode: string
  children: ReactNode
}

export function AppShell({ colorMode, children }: AppShellProps) {
  return (
    <div className={`flex h-screen flex-col overflow-hidden font-sans transition-colors duration-300 ${colorMode === 'Dark' ? 'bg-slate-950 text-slate-100' : 'bg-[#F1F5F9] text-slate-900'}`}>
      {children}
    </div>
  )
}
