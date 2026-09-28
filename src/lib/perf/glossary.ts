/* ==========================================================================
   Performance Analysis — glossary (§12)

   Every label the module shows, in both languages, in one place. A view
   reads a name from here; nothing types one out. Arabic is authored, not
   machine-translated, and the copy is the parent's own register.
   ========================================================================== */

import type { AreaId, CardId } from './types'

export type Locale = 'en' | 'ar'

type Pair = { en: string; ar: string }

export const AREA_NAMES: Record<AreaId, Pair> = {
  character: { en: 'Character', ar: 'الشخصية' },
  engagement: { en: 'Engagement', ar: 'الحماس' },
  learning: { en: 'Learning', ar: 'التعلم' },
  portfolio: { en: 'Portfolio', ar: 'أعماله' },
  return: { en: 'Return', ar: 'العائد' },
}

export const CARD_NAMES: Record<CardId, Pair> = {
  reliability: { en: 'Reliability', ar: 'الالتزام' },
  teamwork: { en: 'Teamwork', ar: 'العمل الجماعي' },
  independence: { en: 'Independence', ar: 'الاستقلالية' },
  attendance: { en: 'Attendance', ar: 'الحضور' },
  happiness: { en: 'Happiness', ar: 'السعادة' },
  confidence: { en: 'Confidence', ar: 'الثقة بالنفس' },
  project_marks: { en: 'Project marks', ar: 'تقييم المشاريع' },
  skill_level: { en: 'Skill level', ar: 'المستوى' },
  skills_map: { en: 'Skills map', ar: 'خريطة المهارات' },
  projects_delivered: { en: 'Projects delivered', ar: 'مشاريع منشورة' },
  published_products: { en: 'Published products', ar: 'منتجات منشورة' },
  client_ready: { en: 'Client-ready skills', ar: 'مهارات جاهزة للعميل' },
  portfolio_value: { en: 'Portfolio value', ar: 'قيمة أعماله (تقديرية)' },
  return: { en: 'Return', ar: 'العائد' },
}

export const UI_TERMS = {
  earnedSoFar: { en: 'Earned so far', ar: 'اتقاضى لحد دلوقتي' },
  proof: { en: 'Proof', ar: 'الدليل' },
  mentor: { en: 'Mentor', ar: 'المنتور' },
  nextMilestone: { en: 'Next milestone', ar: 'الخطوة الجاية' },
  hisQuarter: { en: 'His Quarter', ar: 'ربع السنة' },
  myQuarter: { en: 'My Quarter', ar: 'ربعي' },
  collecting: { en: 'Collecting', ar: 'جاري التجميع' },
  firstReading: { en: 'First reading', ar: 'أول قراءة' },
  estimated: { en: 'estimated', ar: 'تقديرية' },
} satisfies Record<string, Pair>

/**
 * One sentence saying what a card counts, shown in its detail sheet. A parent
 * who wants to argue with a number should be able to see exactly what it is.
 */
export const CARD_DEFINITIONS: Record<CardId, string> = {
  reliability: 'Tasks handed in by their due date, with no reminder needed, out of the tasks due this quarter.',
  teamwork: 'The average score his teammates gave him this month, rated privately each week.',
  independence: 'The share of steps in his last project he finished without asking for help.',
  attendance: 'Live sessions he came to, out of the sessions held this quarter.',
  happiness: 'His own two-tap answer each Friday — how the week felt, and how proud he is of the work.',
  confidence: 'A rung on a five-step ladder, rated once a month by him and by his mentor.',
  project_marks: 'His first two marked projects against his last two, on the same rubric.',
  skill_level: 'The level his mentors have signed off, which needs two signatures and a passed retention test.',
  skills_map: 'The five skills of his course, scored 1–5 each month. A skill at 2 or below is a gap.',
  projects_delivered: 'Client work that is live, with his name on it and consent on file.',
  published_products: 'Courses, games or templates he has published that can earn without him.',
  client_ready: 'Skills scored 4 or 5 — the ones he could be paid for today.',
  portfolio_value: 'What clients actually paid, plus market rates for the unpaid pieces scaled by their mark.',
  return: 'Client payments a mentor has verified against a receipt.',
}

export const cardName = (id: CardId, locale: Locale = 'en'): string => CARD_NAMES[id][locale]
export const areaName = (id: AreaId, locale: Locale = 'en'): string => AREA_NAMES[id][locale]
export const term = (key: keyof typeof UI_TERMS, locale: Locale = 'en'): string => UI_TERMS[key][locale]
