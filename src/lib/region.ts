/* ==========================================================================
   Where an intake is offered, and where the family reading the page is.

   A batch is run for somewhere: "batch 1 · Canada" is taught at hours that
   make sense in Canada, to families living there. So a batch carries a
   region, and the enrol form only offers the hours of the batches that suit
   the family — plus every batch that says "everywhere".

   The family's own region is read off the clock their browser is set to.
   Nobody is asked a question they would rather not answer, and it is right
   the first time for someone sitting at home, which is where a family
   enrols from. It is a reading, not a passport: a VPN or a holiday reads as
   somewhere else, so the admin can always book a hero by hand, and the
   family can always ask for a time (see AskAdmin in EnrollDialog).
   ========================================================================== */

export const ANYWHERE = 'anywhere'

export interface Region {
  code: string
  label: string
  /** The IANA zones that mean this country. Only zones that belong to one
   *  country, so a reading is never a guess between two of them. */
  zones: string[]
}

export const REGIONS: Region[] = [
  {
    code: 'EG',
    label: 'Egypt',
    zones: ['Africa/Cairo'],
  },
  {
    code: 'SA',
    label: 'Saudi Arabia',
    zones: ['Asia/Riyadh'],
  },
  {
    code: 'AE',
    label: 'United Arab Emirates',
    zones: ['Asia/Dubai'],
  },
  {
    code: 'KW',
    label: 'Kuwait',
    zones: ['Asia/Kuwait'],
  },
  {
    code: 'QA',
    label: 'Qatar',
    zones: ['Asia/Qatar'],
  },
  {
    code: 'CA',
    label: 'Canada',
    zones: [
      'America/Toronto', 'America/Montreal', 'America/Vancouver', 'America/Edmonton',
      'America/Winnipeg', 'America/Halifax', 'America/St_Johns', 'America/Regina',
      'America/Moncton', 'America/Glace_Bay', 'America/Goose_Bay', 'America/Blanc-Sablon',
      'America/Thunder_Bay', 'America/Nipigon', 'America/Rainy_River', 'America/Atikokan',
      'America/Swift_Current', 'America/Creston', 'America/Dawson', 'America/Dawson_Creek',
      'America/Fort_Nelson', 'America/Whitehorse', 'America/Yellowknife', 'America/Inuvik',
      'America/Cambridge_Bay', 'America/Rankin_Inlet', 'America/Resolute', 'America/Iqaluit',
    ],
  },
  {
    code: 'US',
    label: 'United States',
    zones: [
      'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
      'America/Phoenix', 'America/Anchorage', 'America/Adak', 'America/Juneau',
      'America/Sitka', 'America/Nome', 'America/Metlakatla', 'America/Yakutat',
      'America/Boise', 'America/Detroit', 'America/Menominee', 'America/Indiana/Indianapolis',
      'America/Indiana/Knox', 'America/Indiana/Marengo', 'America/Indiana/Petersburg',
      'America/Indiana/Tell_City', 'America/Indiana/Vevay', 'America/Indiana/Vincennes',
      'America/Indiana/Winamac', 'America/Kentucky/Louisville', 'America/Kentucky/Monticello',
      'America/North_Dakota/Beulah', 'America/North_Dakota/Center',
      'America/North_Dakota/New_Salem', 'Pacific/Honolulu',
    ],
  },
  {
    code: 'GB',
    label: 'United Kingdom',
    zones: ['Europe/London'],
  },
  {
    code: 'DE',
    label: 'Germany',
    zones: ['Europe/Berlin', 'Europe/Busingen'],
  },
  {
    code: 'FR',
    label: 'France',
    zones: ['Europe/Paris'],
  },
]

const BY_ZONE: Record<string, string> = Object.fromEntries(
  REGIONS.flatMap(r => r.zones.map(z => [z, r.code])))

export function regionLabel(code: string | null | undefined): string {
  if (!code || code === ANYWHERE) return 'Everywhere'
  return REGIONS.find(r => r.code === code)?.label ?? code
}

/** The country a clock belongs to, or null when the zone is one we do not
 *  run a batch for — an unknown reading is not a wrong one. */
export function regionOfZone(tz: string | null | undefined): string | null {
  if (!tz) return null
  return BY_ZONE[tz] ?? null
}

export function viewerRegion(): string | null {
  try {
    return regionOfZone(Intl.DateTimeFormat().resolvedOptions().timeZone)
  } catch {
    return null
  }
}

/** Is this intake offered to a family reading from `viewer`? An hour with
 *  no batch behind it, and a batch for everywhere, are offered to all. */
export function batchOpenTo(region: string | null | undefined, viewer: string | null): boolean {
  const where = region || ANYWHERE
  return where === ANYWHERE || where === viewer
}

/** The hours a family in `viewer` is actually offered: everything whose
 *  batch is theirs, or belongs to nobody in particular. */
export function inViewerRegion<T extends { batch_id?: string | null }>(
  rows: T[], regionOf: Map<string, string>, viewer: string | null,
): T[] {
  return rows.filter(w =>
    batchOpenTo(w.batch_id ? regionOf.get(w.batch_id) : ANYWHERE, viewer))
}
