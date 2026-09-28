/* ==========================================================================
   A window is an opening; a slot is a sitting inside it.

   The admin says "Sunday, 01:00 to 03:00, sessions of 60 minutes". That is
   not one two-hour class — it is two one-hour slots, 01:00–02:00 and
   02:00–03:00, and a family picks one of them. Publishing the opening once
   and letting it divide is how a mentor's free afternoon becomes four
   bookable hours without the admin filling the form four times.

   The same arithmetic lives in `private.expand_window` on the server, which
   is what actually writes the sittings. This is the browser's copy, so a
   form can show the slots as they are typed and the enrolment step can list
   them without a round trip per window. Both round the same way: whole
   slots only, and a remainder too short to hold one is not offered.
   ========================================================================== */

/** As much of a window as slicing it needs to know. */
export interface Sliceable {
  start_min: number
  end_min: number
  /** The shortest sitting this opening offers, and the default when a
   *  family names none. Null is the whole opening as one sitting, which is
   *  every window written before slots existed. */
  slot_min?: number | null
  /** The longest sitting it offers. Null is "the same as the shortest" — a
   *  fixed length, which is every window written before the range existed. */
  slot_max_min?: number | null
}

/** The lengths a family may ask for in this opening, ends included. */
export function sessionRange(w: Sliceable): { min: number; max: number } {
  const span = Math.max(1, w.end_min - w.start_min)
  const min = Math.max(1, w.slot_min || span)
  return { min, max: Math.max(min, w.slot_max_min || min) }
}

export const lengthOffered = (w: Sliceable, lenMin?: number | null): boolean => {
  if (!lenMin) return true
  const { min, max } = sessionRange(w)
  return lenMin >= min && lenMin <= max
}

/** One bookable sitting: minutes from midnight, in the window's own zone. */
export interface Slot {
  startMin: number
  endMin: number
}

/** The length of one sitting in this window, never zero or negative. */
export const slotLength = (w: Sliceable, lenMin?: number | null): number =>
  Math.max(1, (lenMin || 0) || w.slot_min || (w.end_min - w.start_min))

/** Every whole sitting the window divides into, in order.
 *
 *  A remainder is dropped rather than offered short: 01:00–03:30 at 60
 *  minutes is two slots and a half-hour nobody is taught in, not a
 *  thirty-minute lesson somebody has to explain. */
export function slotsOf(w: Sliceable, lenMin?: number | null): Slot[] {
  if (!lengthOffered(w, lenMin)) return []
  const len = slotLength(w, lenMin)
  const span = w.end_min - w.start_min
  if (span < len) return []
  const n = Math.floor(span / len)
  /* A window a day long divided into minutes is a typo, not a timetable;
     the server's own expansion is bounded too. */
  return Array.from({ length: Math.min(n, 96) }, (_, i) => ({
    startMin: w.start_min + i * len,
    endMin: w.start_min + (i + 1) * len,
  }))
}

/** How many sittings it divides into. */
export const slotCount = (w: Sliceable, lenMin?: number | null): number =>
  slotsOf(w, lenMin).length
