import { create } from 'zustand'
import { tokenStorage } from '@/api/tokenStorage'
import { queryClient } from '@/lib/queryClient'
import type { CurrentUser } from '@/types/user'

interface AuthState {
  /** In-memory only — never persisted (5-minute lifetime, re-derived on boot). */
  accessToken: string | null
  user: CurrentUser | null
  /** True until the boot-time silent refresh + /me fetch has settled. */
  isBootstrapping: boolean
  setAccessToken: (token: string | null) => void
  setUser: (user: CurrentUser | null) => void
  setBootstrapped: () => void
  /** Clears in-memory state, the persisted refresh token, and every
   * cached TanStack Query result — the single logout path shared by a
   * manual "Log out" click and every automatic forced-logout (e.g. a
   * failed silent refresh in api/client.ts), so no protected data from
   * one session can ever leak into the next. */
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  isBootstrapping: true,
  setAccessToken: (accessToken) => set({ accessToken }),
  setUser: (user) => set({ user }),
  setBootstrapped: () => set({ isBootstrapping: false }),
  logout: () => {
    tokenStorage.clearRefreshToken()
    queryClient.clear()
    set({ accessToken: null, user: null })
  },
}))
