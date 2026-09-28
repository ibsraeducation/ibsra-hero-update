/* ==========================================================================
   What is waiting for the admin, in one place.

   Three separate queues, each already backed by a real table: access
   requests, payments waiting to be checked, and answers waiting to be
   graded. Every page that changes one of these counts calls `refresh()`
   afterwards, so the rail badges and the pages they sit next to can never
   disagree.
   ========================================================================== */

import { create } from 'zustand'
import { backendLive } from '@/lib/supabase'
import { pendingRequestCount } from './requests'
import { pendingPaymentCount } from './payments'
import { pendingGradingCount } from './submissions'

interface AdminQueue {
  requests: number
  payments: number
  grading: number
  refresh: () => Promise<void>
}

export const useAdminQueue = create<AdminQueue>(set => ({
  requests: 0,
  payments: 0,
  grading: 0,
  refresh: async () => {
    if (!backendLive) return
    try {
      const [requests, payments, grading] = await Promise.all([
        pendingRequestCount(), pendingPaymentCount(), pendingGradingCount(),
      ])
      set({ requests, payments, grading })
    } catch {
      /* Every badge here is a convenience; a failed count is not worth a toast. */
    }
  },
}))
