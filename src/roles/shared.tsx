import { Construction } from 'lucide-react'

/** Marks a surface that is intentionally shallow while admin is the focus. */
export function StageNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rowtop g10 mt20" style={{
      padding: '11px 13px', border: '1px dashed var(--line-hard)',
      borderRadius: 'var(--r-md)', background: 'var(--surface-2)',
    }}>
      <Construction style={{ width: 15, height: 15, flex: 'none', color: 'var(--muted-2)', marginTop: 1 }} />
      <div className="stack g2">
        <span className="t-sm w-med">Sketched, not built</span>
        <span className="t-xs c-muted2" style={{ lineHeight: 1.6 }}>{children}</span>
      </div>
    </div>
  )
}

/** Deterministic pseudo-picker so demo surfaces stay stable across reloads. */
export function pickBy<T>(arr: T[], seed: number): T | undefined {
  return arr.length ? arr[seed % arr.length] : undefined
}
