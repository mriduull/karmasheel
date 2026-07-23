import { create } from 'zustand'
import { tokenStorage } from '@/api/tokenStorage'
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
  /** Clears in-memory state and the persisted refresh token. */
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
    set({ accessToken: null, user: null })
  },
}))
