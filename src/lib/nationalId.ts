/* ==========================================================================
   The Egyptian national ID — 14 digits that already say when someone was
   born, which is why a family enrolling a hero is not asked for the date
   twice.

       3  12 03 08  21  0153  4
       │  │  │  │   │   │     └ check digit
       │  │  │  │   │   └────── serial (odd male, even female)
       │  │  │  │   └────────── governorate
       │  └──┴──┴────────────── birth date, yy mm dd
       └─────────────────────── century: 2 → 1900s, 3 → 2000s, 4 → 2100s

   The check digit is not verified: the published algorithm is not one the
   government guarantees, and a wrong refusal on a real child's ID costs far
   more than a typo caught later by the admin. The shape and the date are
   checked, because those are what the platform actually reads.
   ========================================================================== */

export interface NationalId {
  /** The birth date the ID carries, as YYYY-MM-DD. */
  birthDate: string
  /** Whole years old today. */
  age: number
}

const CENTURY: Record<string, number> = { '2': 1900, '3': 2000, '4': 2100 }

/** 14 digits and nothing else — what the column's check constraint allows. */
export const isNationalIdShape = (v: string) => /^[0-9]{14}$/.test(v.trim())

/** What the ID says, or null when it is not 14 digits or the date inside it
 *  is not a real one (a 31st of February, a century digit nobody uses, or a
 *  birthday still in the future). */
export function readNationalId(raw: string, now = new Date()): NationalId | null {
  const v = raw.trim()
  if (!isNationalIdShape(v)) return null

  const base = CENTURY[v[0]]
  if (!base) return null
  const year = base + Number(v.slice(1, 3))
  const month = Number(v.slice(3, 5))
  const day = Number(v.slice(5, 7))
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  /* Round-tripping catches the days a month does not have: the 31st of
     April comes back as the 1st of May. */
  const born = new Date(Date.UTC(year, month - 1, day))
  if (born.getUTCFullYear() !== year || born.getUTCMonth() !== month - 1 || born.getUTCDate() !== day) return null
  if (born.getTime() > now.getTime()) return null

  let age = now.getUTCFullYear() - year
  const hadBirthday = now.getUTCMonth() + 1 > month
    || (now.getUTCMonth() + 1 === month && now.getUTCDate() >= day)
  if (!hadBirthday) age -= 1

  return { birthDate: `${year}-${v.slice(3, 5)}-${v.slice(5, 7)}`, age }
}

/** First, second and last name into the one name the platform shows. */
export const fullName = (first: string, second: string, last: string) =>
  [first, second, last].map(s => s.trim()).filter(Boolean).join(' ')
