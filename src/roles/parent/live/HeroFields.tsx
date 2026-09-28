/* ==========================================================================
   Adding a hero — the same fields wherever a family does it.

   Two places ask for them: My Heroes, and the Enroll dialog at the moment a
   family picks who a program is for. Keeping one component means the second
   one can never drift into asking for less than the record needs.

   The name is typed in the three parts an Egyptian family says it in, and
   the national ID is what the platform files the student under. The ID
   already carries the birth date, so the age is read out of it rather than
   asked for twice — see src/lib/nationalId.ts.
   ========================================================================== */

import { Field } from '@/components/ui'
import { addChild, type ParentUsersError } from '@/lib/api/family'
import { fullName, isNationalIdShape, readNationalId } from '@/lib/nationalId'
import { PasswordField } from './PasswordField'
import type { ProfileRow } from '@/lib/api/rows'

export interface HeroDraft {
  first: string
  second: string
  last: string
  nationalId: string
  whatsapp: string
  email: string
  password: string
  confirm: string
}

export const EMPTY_HERO: HeroDraft = {
  first: '', second: '', last: '', nationalId: '', whatsapp: '',
  email: '', password: '', confirm: '',
}

export const heroName = (d: HeroDraft) => fullName(d.first, d.second, d.last)

/** What the birth date in the ID works out to, or null while it is not a
 *  real one yet — shown under the field as the family types. */
export const heroBorn = (d: HeroDraft) => readNationalId(d.nationalId)

/** The one sentence wrong with the form, or null when it is ready to send. */
export function heroProblem(d: HeroDraft): string | null {
  if (!d.first.trim() || !d.last.trim()) return 'Their first and last name.'
  if (!isNationalIdShape(d.nationalId)) return 'Their national ID — 14 digits.'
  const born = readNationalId(d.nationalId)
  if (!born) return 'That national ID does not carry a real birth date — check the digits.'
  if (born.age < 8 || born.age > 99) return `That ID says they are ${born.age}. Check the digits.`
  if (!d.whatsapp.trim()) return 'A WhatsApp number we can reach the family on.'
  if (!d.email.trim()) return 'An email for them to sign in with.'
  if (d.password.length < 8) return 'A password of at least 8 characters.'
  if (d.password !== d.confirm) return 'The two passwords are not the same.'
  return null
}

/** Make the account. Throws {@link ParentUsersError} with a sentence the
 *  family can act on — a national ID already on the platform, most often. */
export async function createHero(d: HeroDraft): Promise<ProfileRow> {
  const { profile } = await addChild({
    name: heroName(d),
    email: d.email.trim(),
    password: d.password,
    phone: d.whatsapp.trim(),
    nationalId: d.nationalId.replace(/\s+/g, ''),
    whatsapp: d.whatsapp.trim(),
    firstName: d.first.trim(),
    secondName: d.second.trim() || undefined,
    lastName: d.last.trim(),
  })
  return profile
}

export function HeroFields({ value, onChange, idPrefix = 'hero', autoFocus }: {
  value: HeroDraft
  onChange: (next: HeroDraft) => void
  /** Two of these can be on one page; the password inputs need their own ids. */
  idPrefix?: string
  autoFocus?: boolean
}) {
  const set = <K extends keyof HeroDraft>(k: K, v: HeroDraft[K]) => onChange({ ...value, [k]: v })
  const born = heroBorn(value)
  const typedId = value.nationalId.trim().length > 0

  return (
    <>
      <div className="row g10 wrap">
        <Field label="First name">
          <input className="inp" autoFocus={autoFocus} value={value.first}
            onChange={e => set('first', e.target.value)} />
        </Field>
        <Field label="Second name">
          <input className="inp" value={value.second} onChange={e => set('second', e.target.value)} />
        </Field>
        <Field label="Last name">
          <input className="inp" value={value.last} onChange={e => set('last', e.target.value)} />
        </Field>
      </div>

      <Field label="National ID"
        hint={born
          ? `Born ${born.birthDate} · ${born.age} years old`
          : typedId
            ? 'Fourteen digits, exactly as they are on the card.'
            : 'Fourteen digits. We read their date of birth from it.'}>
        <input className="inp" inputMode="numeric" autoComplete="off" maxLength={14}
          placeholder="30301011201234"
          value={value.nationalId}
          onChange={e => set('nationalId', e.target.value.replace(/[^0-9]/g, ''))} />
      </Field>

      <Field label="WhatsApp number" hint="Where the mentor reaches the family.">
        <input className="inp" type="tel" autoComplete="off" placeholder="01xxxxxxxxx"
          value={value.whatsapp} onChange={e => set('whatsapp', e.target.value)} />
      </Field>

      <Field label="Their email" hint="This is what they sign in with.">
        <input className="inp" type="email" autoComplete="off" value={value.email}
          onChange={e => set('email', e.target.value)} />
      </Field>

      <PasswordField id={`${idPrefix}-pw`} label="Password you give them"
        value={value.password} onChange={v => set('password', v)} />
      <PasswordField id={`${idPrefix}-pw2`} label="Confirm password"
        value={value.confirm} onChange={v => set('confirm', v)}
        hint={value.confirm && value.confirm !== value.password ? 'The two passwords are not the same.' : undefined} />
    </>
  )
}
