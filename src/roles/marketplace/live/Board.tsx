/* ==========================================================================
   The Marketplace, as the training path — the same three-column map the
   admin builds it on, read by a family and by a student.

   One view, two thin entry points. A parent picks a child first (when there
   is more than one), and a card is dim until every course of that program
   is open for the picked hero. A student reads the same map for themself,
   dim until they are actually enrolled — there is nothing to buy here, only
   a card to open and ask about.

   The entry points exist so neither side calls the other's data hooks —
   `useFamily` and `useMe` each make their own network calls, and calling
   one conditionally on the other's audience would either waste a request or
   read a hook's state built for a role the page is not showing.

   Kits stay a family-only, parent-only thing: a box that reaches a hero's
   hands, paid for from the wallet, with nothing training-path shaped about
   it. They sit below the map rather than in it.

   For a parent the Marketplace is kits and nothing else: the training path
   moved into Material, where a dimmed program opens the enrol dialog and a
   bright one opens the program. A student still reads the path here.
   ========================================================================== */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Package, PlayCircle } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { ProgramPicker } from '@/components/ProgramPicker'
import { Badge, Confirm, Empty } from '@/components/ui'
import { money } from '@/lib/format'
import { toMessage } from '@/lib/api/errors'
import { fetchCatalogue, type Catalogue } from '@/lib/api/catalogue'
import { buyKitFromWallet, fetchProducts } from '@/lib/api/products'
import { fetchWallet } from '@/lib/api/wallet'
import { useAuth } from '@/lib/auth'
import { useStore } from '@/lib/store'
import { EnrollDialog } from './EnrollDialog'
import { useFamily } from '@/roles/parent/live/useFamily'
import { ChildPicker } from '@/roles/parent/live/ChildPicker'
import { useMe } from '@/roles/student/useMe'
import type { GuardianChild } from '@/lib/api/rows'
import type { Product, Track } from '@/lib/types'

interface BoardViewProps {
  base: string
  sub: string
  footnote: string
  enrolledTrackIds: Set<string>
  /** False for a parent: their path lives in Material, and this page is kits. */
  path?: boolean
  /* Who is being enrolled or bought for. For a student it is themself. */
  family?: { children: GuardianChild[] | null; child: GuardianChild | null; pick: (id: string) => void }
}

function BoardView({ base, sub, footnote, enrolledTrackIds, family, path = true }: BoardViewProps) {
  const isParent = !!family
  const profile = useAuth(s => s.profile)
  const toast = useStore(s => s.toast)

  const [cat, setCat] = useState<Catalogue | null>(null)
  const [products, setProducts] = useState<Product[] | null>(null)
  const [balance, setBalance] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [buying, setBuying] = useState<Product | null>(null)
  /* A family reads a program in the dialog rather than on a page of its
     own: the video, what it covers and what they gain, then the ask -- all
     without losing their place on the map. A student still opens the page,
     because they are reading, not enrolling. */
  const [reading, setReading] = useState<Track | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [c, list, purse] = await Promise.all([
        path ? fetchCatalogue() : Promise.resolve({ tracks: [], loops: [], sessions: [] }),
        isParent ? fetchProducts() : Promise.resolve([]),
        isParent && profile ? fetchWallet(profile.id) : Promise.resolve(null),
      ])
      setCat(c)
      setProducts(list)
      setBalance(purse?.balance_egp ?? 0)
      setError(null)
    } catch (e) {
      setError(toMessage(e))
      setCat({ tracks: [], loops: [], sessions: [] })
    }
  }, [isParent, profile, path])

  useEffect(() => { void load() }, [load])

  const factsOf = useCallback((trackId: string) => {
    const courses = (cat?.loops ?? []).filter(l => l.trackId === trackId)
    const sessions = (cat?.sessions ?? []).filter(s => courses.some(c => c.id === s.loopId))
    const facts = [`${courses.length} course${courses.length === 1 ? '' : 's'}`]
    if (sessions.length) facts.push(`${sessions.length} session${sessions.length === 1 ? '' : 's'}`)
    const hasVideo = sessions.some(s => s.videoUrl)
      || courses.some(c => c.videoUrl)
      || !!(cat?.tracks ?? []).find(t => t.id === trackId)?.videoUrl
    if (hasVideo) facts.push('Video inside')
    return facts
  }, [cat])

  const kits = (products ?? []).filter(p => p.category === 'kit')

  const kitBlock = (p: Product): string => {
    if (!family?.child) return 'Add a hero to your account first.'
    if (p.price === null || p.price <= 0) return 'No price yet — ask the admin.'
    if (p.seats - p.seatsTaken <= 0) return 'Out of stock.'
    if ((balance ?? 0) < p.price) return `${money(p.price - (balance ?? 0))} short — charge your wallet.`
    return ''
  }

  const buyKit = async () => {
    if (!buying || !family?.child) return
    setBusy(true)
    try {
      await buyKitFromWallet(buying.id, family.child.profile.id)
      toast(`${buying.name} bought — the admin hands it over`)
      setBuying(null)
      await load()
    } catch (e) {
      toast(toMessage(e), 'err')
    }
    setBusy(false)
  }

  const kitGrid = (
    <div className="folder-grid mb24">
      {kits.map(p => {
        const blocked = kitBlock(p)
        return (
          <article key={p.id} className="folder prod-card">
            <div className="prod-thumb" style={{ height: 96, backgroundImage: p.thumbnail ? `url(${p.thumbnail})` : undefined }} />
            <div className="folder-body stack g8">
              <span className="t-sm w-sb">{p.name}</span>
              <span className="t-xs c-muted2">{p.summary}</span>
              <span className="t-md w-sb">{p.price ? money(p.price) : 'Price on request'}</span>
              <button className="btn primary sm" disabled={!!blocked}
                title={blocked || undefined}
                onClick={() => setBuying(p)}>
                {blocked || 'Buy from wallet'}
              </button>
            </div>
          </article>
        )
      })}
    </div>
  )

  const buyDialog = buying && (
    <Confirm
      open
      danger={false}
      onClose={() => setBuying(null)}
      onConfirm={() => void buyKit()}
      confirmLabel={busy ? 'Buying…' : 'Buy it'}
      title={`Buy ${buying.name}?`}
      body={profile?.role === 'student'
        ? <>{money(buying.price ?? 0)} comes off your wallet balance right away.</>
        : <>{money(buying.price ?? 0)} comes off your wallet balance right away, for <b>{family?.child?.profile.name || 'your hero'}</b>.</>}
    />
  )

  const loading = cat === null

  if (!path) {
    return (
      <div className="page">
        <PageHeader title="Marketplace" />
        {family?.children && family.children.length > 1 && (
          <ChildPicker kids={family.children} child={family.child} onPick={family.pick} />
        )}
        {error && <div className="auth-alert mb16" role="alert"><span>{error}</span></div>}
        {products === null ? (
          <div className="skel" style={{ height: 220 }} />
        ) : kits.length === 0 ? (
          <div className="card"><Empty icon={<Package />} title="No kits yet" /></div>
        ) : kitGrid}
        {buyDialog}
      </div>
    )
  }

  return (
    <div className="page">
      <PageHeader title="Training path" />

      {family?.children && family.children.length > 1 && (
        <ChildPicker kids={family.children} child={family.child} onPick={family.pick} />
      )}

      {error && <div className="auth-alert mb16" role="alert"><span>{error}</span></div>}

      {loading ? (
        <div className="skel" style={{ height: 280 }} />
      ) : cat.tracks.length === 0 ? (
        <Empty icon={<PlayCircle />} title="Nothing on the path yet" />
      ) : (
        <ProgramPicker
          tracks={cat.tracks}
          {...(isParent
            ? { onOpen: (t: Track) => setReading(t) }
            : { to: (t: Track) => `${base}/program/${t.id}` })}
          state={t => (enrolledTrackIds.has(t.id) ? 'on' : 'dim')}
          facts={t => factsOf(t.id)}
          tail={t => (enrolledTrackIds.has(t.id) ? <Badge tone="teal" dot>Open</Badge> : null)}
        />
      )}

      {isParent && kits.length > 0 && (
        <>
          <h2 className="t-lg w-sb mt24 mb12 row g8">
            <Package className="ico-xs" />Kits
          </h2>
          {kitGrid}
        </>
      )}

      {reading && (
        <EnrollDialog
          track={reading}
          courses={(cat?.loops ?? [])
            .filter(l => l.trackId === reading.id)
            .sort((a, b) => a.index - b.index)}
          onClose={() => setReading(null)}
          onDone={() => { setReading(null); void load() }}
        />
      )}
      {buyDialog}
    </div>
  )
}

/* ---------------- entry points ---------------- */

/* Kits only. The path a parent enrols from is on Material now. */
export function ParentMarketplaceBoard() {
  const family = useFamily()
  const none = useMemo(() => new Set<string>(), [])
  return (
    <BoardView
      base="/parent/marketplace"
      sub="Kits — the boxes that reach your hero's hands, paid for from the wallet."
      footnote=""
      enrolledTrackIds={none}
      family={family}
      path={false}
    />
  )
}

/* A student enrols and buys for themself, the same way a parent does: the
   "family" `useFamily` returns for a student is their own account, and the
   money comes off their own wallet. */
export function StudentMarketplaceBoard() {
  const me = useMe()
  const family = useFamily()
  const enrolledTrackIds = useMemo(() => new Set(me.trackIds), [me.trackIds])
  return (
    <BoardView
      base="/student/marketplace"
      sub="Every program IBSRA runs. Open one to see what it covers and enroll — pay from your wallet or directly."
      footnote="Dimmed programs are not open for you yet — open one and enroll."
      enrolledTrackIds={enrolledTrackIds}
      family={family}
    />
  )
}
