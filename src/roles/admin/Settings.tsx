import { Database, Moon, RotateCcw, ShieldAlert, Sun } from 'lucide-react'
import { useStore } from '@/lib/store'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge, Field, Switch } from '@/components/ui'
import { count } from '@/lib/format'

export default function Settings() {
  const db = useStore(s => s.db)
  const theme = useStore(s => s.theme)
  const toggleTheme = useStore(s => s.toggleTheme)
  const resetDemo = useStore(s => s.resetDemo)

  const rows: Array<[string, string | number]> = [
    ['Tracks', db.tracks.length],
    ['Loops', db.loops.length],
    ['Cohorts', db.cohorts.length],
    ['Sessions', db.sessions.length],
    ['Titles', db.sessions.reduce((a, s) => a + s.titles.length, 0)],
    ['Materials', db.sessions.reduce((a, s) => a + s.titles.reduce((b, t) => b + t.materials.length, 0), 0)],
    ['Q&A tasks', db.sessions.reduce((a, s) => a + s.titles.reduce((b, t) => b + t.tasks.length, 0), 0)],
    ['People', db.people.length],
  ]

  return (
    <div className="page">
      <PageHeader title="Settings" />

      <div className="grid g-2">
        <section className="card">
          <div className="card-head"><h2 className="t-md w-sb">Appearance</h2></div>
          <div className="card-body stack g14">
            <div className="row g10">
              <Switch on={theme === 'dark'} onChange={toggleTheme} label="Dark theme" />
              <div className="stack g2 grow">
                <span className="t-sm w-med row g6">
                  {theme === 'dark' ? <Moon style={{ width: 13, height: 13 }} /> : <Sun style={{ width: 13, height: 13 }} />}
                  {theme === 'dark' ? 'Dark theme' : 'Light theme'}
                </span>
                <span className="hint">Applies to every role dashboard.</span>
              </div>
            </div>

            <Field label="Interface direction">
              <select className="sel" defaultValue="ltr"
                onChange={e => { document.documentElement.dir = e.target.value }}>
                <option value="ltr">Left to right (English)</option>
                <option value="rtl">Right to left (العربية) — layout preview</option>
              </select>
            </Field>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2 className="t-md w-sb">Local data</h2>
            <Badge tone="line"><Database />localStorage</Badge>
          </div>
          <div className="card-body stack g10">
            {rows.map(([k, v]) => (
              <div key={k} className="between">
                <span className="t-sm c-muted">{k}</span>
                <span className="t-sm w-sb tnum">{count(Number(v))}</span>
              </div>
            ))}
          </div>
          <div className="card-foot">
            <button className="btn danger sm" onClick={resetDemo}><RotateCcw />Reset to seed data</button>
          </div>
        </section>
      </div>

      <section className="card mt20" style={{
        borderColor: 'color-mix(in srgb, var(--rose-500) 30%, var(--line))',
      }}>
        <div className="card-head"><h2 className="t-md w-sb">Not built yet — on purpose</h2></div>
        <div className="card-body stack g12">
          {([
            ['Authentication & roles', 'Out of scope for this stage. The role switcher in the top bar stands in for it.'],
            ['Video pipeline', 'Attaching a recording is instant here. Upload, transcode and the processing state are stage 2.'],
            ['Payments', 'Per-loop tuition, instalments and the multi-loop bundle land with the parent dashboard.'],
            ['PDPL compliance', 'Children’s data is sensitive under Egypt’s PDPL. DPO, consent capture and the PDPC licence gate go in before any real student record exists.'],
            ['Arabic content', 'Layout is RTL-ready; copy is not translated.'],
          ] as const).map(([k, v]) => (
            <div key={k} className="rowtop g10">
              <ShieldAlert style={{ width: 14, height: 14, flex: 'none', marginTop: 2, color: 'var(--rose-500)' }} />
              <div className="stack g2">
                <span className="t-sm w-med">{k}</span>
                <span className="t-xs c-muted2" style={{ lineHeight: 1.55 }}>{v}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
