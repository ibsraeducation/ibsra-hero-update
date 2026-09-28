import type { ReactNode } from 'react'

/* A page says what it is and offers what you can do on it. It does not
   explain itself: the sub-paragraph these used to carry was a sentence
   nobody read twice, on 41 screens.

   The eyebrow survives for the one thing it is still good for — a back-link
   on a detail page. A label that repeats the breadcrumb is not that. */
export function PageHeader({ eyebrow, title, actions }: {
  eyebrow?: ReactNode; title: ReactNode; actions?: ReactNode
}) {
  return (
    <div className="phead">
      <div className="stack g4" style={{ minWidth: 0 }}>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1 className="t-2xl w-sb">{title}</h1>
      </div>
      {actions && <div className="row g8 wrap" style={{ flex: 'none' }}>{actions}</div>}
    </div>
  )
}

export function SectionHead({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="between mb12">
      <h2 className="t-md w-sb">{title}</h2>
      {action}
    </div>
  )
}
