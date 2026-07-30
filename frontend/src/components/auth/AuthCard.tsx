import type { ReactNode } from 'react'

interface AuthCardProps {
  title: string
  children: ReactNode
}

/** Centered card shell shared by Login and Register (design spec §5). */
export function AuthCard({ title, children }: AuthCardProps) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-[420px] rounded-md border border-text-secondary/10 bg-surface p-6 shadow-card sm:p-8">
        <h1 className="mb-6 text-2xl font-semibold text-text-primary">{title}</h1>
        {children}
      </div>
    </div>
  )
}
