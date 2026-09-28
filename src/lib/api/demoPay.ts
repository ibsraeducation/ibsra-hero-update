/* ==========================================================================
   The money pages, with no backend behind them.

   Demo mode (`VITE_BACKEND=off`) is how this app is looked at without an
   account, and until now the payments page had nothing to show there: every
   read went to Supabase and came back "Backend is not configured", so the
   settings cards never drew at all.

   This is the stand-in — the same row shapes, seeded with plausible values
   and kept in this browser's localStorage, exactly like the rest of the demo
   data. Nothing here ever runs when a backend is configured: each API
   function reaches for it only behind `if (!backendLive)`.
   ========================================================================== */

import type {
  BillingSettingsRow, PayAccountsRow, PaymentRow, SubscriptionRow, WalletEntryRow,
} from './rows'
import type { WalletOwner } from './wallet'

const KEY = 'ibsra.demo.pay.v1'

export interface DemoPayDb {
  accounts: PayAccountsRow
  billing: BillingSettingsRow
  payments: PaymentRow[]
  subscriptions: SubscriptionRow[]
  /** The demo family wallet: what is on it, and how it got there. */
  walletEgp: number
  walletEntries: WalletEntryRow[]
}

/* The demo people. Ids are stable so a reload keeps the same family. */
const PARENT = { id: 'dem_parent', name: 'Nour Hassan', email: 'nour@example.com', phone: '01001234567' }
const CHILD = { id: 'dem_student', name: 'Omar Hassan', email: 'omar@example.com', age: 14 }

const daysFromNow = (d: number) => new Date(Date.now() + d * 86_400_000)
const iso = (d: Date) => d.toISOString()
const day = (d: Date) => iso(d).slice(0, 10)

function seed(): DemoPayDb {
  return {
    accounts: {
      id: true,
      instapay_on: true,
      instapay_handle: 'ibsra@instapay',
      instapay_link: 'https://ipn.eg/S/ibsra',
      instapay_qr: null,
      vodafone_on: true,
      vodafone_number: '',
      vodafone_link: 'https://vfcash.vodafone.com.eg/pay/ibsra',
      vodafone_qr: null,
      instructions: 'Put your student’s name in the transfer note so we can match it.',
      updated_at: iso(new Date()),
    },
    billing: {
      id: true,
      monthly_egp: 1700,
      quarterly_egp: 4500,
      half_annual_egp: 8200,
      annual_egp: 15000,
      monthly_on: true,
      quarterly_on: true,
      half_annual_on: true,
      annual_on: true,
      close_before_days: 5,
      updated_at: iso(new Date()),
    },
    /* One waiting and one already answered, so both halves of the page have
       something to say. */
    payments: [
      {
        id: 'dem_pay_1',
        parent_id: PARENT.id,
        student_id: CHILD.id,
        track_id: 'trk_brand',
        program_name: 'Brand Builder',
        amount_egp: 4500,
        method: 'instapay',
        sender_ref: 'nour@instapay',
        proof_path: null,
        note: 'Sent this morning from the InstaPay app.',
        status: 'pending',
        plan: 'quarterly',
        review_note: null,
        reviewed_by: null,
        reviewed_at: null,
        created_at: iso(daysFromNow(-1)),
        updated_at: iso(daysFromNow(-1)),
      },
      {
        id: 'dem_pay_0',
        parent_id: PARENT.id,
        student_id: CHILD.id,
        track_id: null,
        program_name: 'Half-yearly subscription',
        amount_egp: 8200,
        method: 'vodafone_cash',
        sender_ref: '01009876543',
        proof_path: null,
        note: null,
        status: 'approved',
        plan: 'half_annual',
        review_note: '',
        reviewed_by: null,
        reviewed_at: iso(daysFromNow(-60)),
        created_at: iso(daysFromNow(-61)),
        updated_at: iso(daysFromNow(-60)),
      },
    ],
    /* Paid up twelve days out, so with the default five-day rule the door
       shuts in a week and the countdown has something real to count. */
    subscriptions: [
      { student_id: CHILD.id, paid_through: day(daysFromNow(12)), last_plan: 'half_annual', updated_at: iso(new Date()) },
    ],
    /* An empty wallet, so the admin's Add-to-wallet button has somewhere to
       put the first credit. */
    walletEgp: 0,
    walletEntries: [],
  }
}

let db: DemoPayDb | null = null

function load(): DemoPayDb {
  if (db) return db
  try {
    const raw = window.localStorage.getItem(KEY)
    db = raw ? { ...seed(), ...JSON.parse(raw) as DemoPayDb } : seed()
  } catch {
    db = seed()
  }
  return db
}

function save(): DemoPayDb {
  const next = load()
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* Private window, or a QR too big for the quota: it lives in memory
       for this session and that is enough for a demo. */
  }
  return next
}

/** Ids only have to be unique inside this browser. */
const uid = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

/** The people on the demo payments, for the admin list. */
export const DEMO_PEOPLE = { parent: PARENT, student: CHILD }

export const demoPay = {
  accounts: () => ({ ...load().accounts }),

  saveAccounts(patch: Partial<PayAccountsRow>): PayAccountsRow {
    const d = load()
    d.accounts = { ...d.accounts, ...patch, id: true, updated_at: iso(new Date()) }
    save()
    return { ...d.accounts }
  },

  billing: () => ({ ...load().billing }),

  saveBilling(patch: Partial<BillingSettingsRow>): BillingSettingsRow {
    const d = load()
    d.billing = { ...d.billing, ...patch, id: true, updated_at: iso(new Date()) }
    save()
    return { ...d.billing }
  },

  payments: () => load().payments.map(p => ({ ...p })),

  subscriptions: () => load().subscriptions.map(s => ({ ...s })),

  /** The same two things `approve_payment` does, in the same order: open the
   *  program, then push the date forward. */
  approve(id: string, note?: string, daysFor?: (p: PaymentRow) => number): PaymentRow {
    const d = load()
    const p = d.payments.find(x => x.id === id)
    if (!p) throw new Error('That payment is gone')
    p.status = 'approved'
    p.review_note = note ?? ''
    p.reviewed_at = iso(new Date())
    p.updated_at = p.reviewed_at

    if (p.plan && daysFor) {
      const days = daysFor(p)
      const row = d.subscriptions.find(s => s.student_id === p.student_id)
      const from = row && row.paid_through > day(new Date()) ? new Date(row.paid_through) : new Date()
      from.setDate(from.getDate() + days)
      if (row) {
        row.paid_through = day(from)
        row.last_plan = p.plan
        row.updated_at = iso(new Date())
      } else {
        d.subscriptions.push({
          student_id: p.student_id!, paid_through: day(from), last_plan: p.plan, updated_at: iso(new Date()),
        })
      }
    }
    save()
    return { ...p }
  },

  reject(id: string, note?: string): PaymentRow {
    const d = load()
    const p = d.payments.find(x => x.id === id)
    if (!p) throw new Error('That payment is gone')
    p.status = 'rejected'
    p.review_note = note ?? ''
    p.reviewed_at = iso(new Date())
    p.updated_at = p.reviewed_at
    save()
    return { ...p }
  },

  /* ---------------- the family wallet ---------------- */

  /** The one demo family, with what is on their wallet. */
  wallets(): WalletOwner[] {
    const d = load()
    return [{
      owner: {
        id: PARENT.id, name: PARENT.name, email: PARENT.email, phone: PARENT.phone,
        disabled: false, created_at: iso(daysFromNow(-90)), role: 'parent',
      },
      balanceEgp: d.walletEgp,
      updatedAt: d.walletEntries[0]?.created_at ?? null,
    }]
  },

  walletEntries: (parentId: string) =>
    load().walletEntries.filter(e => e.parent_id === parentId).map(e => ({ ...e })),

  /** The same three rows `admin_credit_wallet` writes, in the same order. */
  creditWallet(parentId: string, amountEgp: number, note?: string): PaymentRow {
    const d = load()
    const amount = Math.round(amountEgp)
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('The amount has to be more than nothing')
    const at = iso(new Date())
    const pay: PaymentRow = {
      id: uid('dem_pay'),
      parent_id: parentId,
      student_id: null,
      track_id: null,
      program_name: 'Wallet top-up',
      amount_egp: amount,
      method: 'admin',
      sender_ref: 'Added by the admin',
      proof_path: null,
      note: null,
      status: 'approved',
      kind: 'topup',
      review_note: note?.trim() || 'Added straight to the wallet',
      reviewed_by: null,
      reviewed_at: at,
      created_at: at,
      updated_at: at,
    }
    d.payments.unshift(pay)
    d.walletEgp += amount
    d.walletEntries.unshift({
      id: uid('dem_wal'),
      parent_id: parentId,
      move: 'topup',
      amount_egp: amount,
      balance_after: d.walletEgp,
      payment_id: pay.id,
      student_id: null,
      note: note?.trim() || 'Added by the admin',
      created_at: at,
    })
    save()
    return { ...pay }
  },

  /** A QR has no bucket to live in here, so the file itself is the path. */
  readAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(new Error('That image could not be read'))
      reader.readAsDataURL(file)
    })
  },
}
