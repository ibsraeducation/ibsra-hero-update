import { create } from 'zustand'

export interface SyncStatus {
  /** Changes waiting to be sent, or being sent. */
  pending: number
  saving: boolean
  lastSavedAt: number
  /** Set when the last attempt failed and will not retry on its own. */
  error: string | null
  /** The initial (or a forced) load from the server. */
  data: 'idle' | 'loading' | 'ready' | 'error'
  dataError: string | null
}

export const useSyncStatus = create<SyncStatus>(() => ({
  pending: 0,
  saving: false,
  lastSavedAt: 0,
  error: null,
  data: 'idle',
  dataError: null,
}))
