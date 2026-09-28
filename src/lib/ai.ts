/* ==========================================================================
   The parent progress assistant — the one network call in this build.

   Provider: any OpenAI-compatible chat endpoint, set in `.env.local`:
     VITE_AI_KEY       a free key (required for live answers)
     VITE_AI_ENDPOINT  default: OpenRouter's chat completions
     VITE_AI_MODEL     default: meta-llama/llama-3.3-70b-instruct:free —
                       an open-weights model on OpenRouter's free tier
   Groq (free tier, also open-weights Llama) works the same way — point the
   endpoint at https://api.groq.com/openai/v1/chat/completions.

   Pollinations was tried first (free, keyless, open source) but now rejects
   anonymous browser calls with a bot check, and that is not something to
   work around. So the key is configurable instead.

   Dev build only: a VITE_ key is baked into the bundle and visible to anyone
   who opens it. Before this ships, the call moves behind a small proxy that
   holds the key.

   What is sent: the numbers on the report the parent is looking at, and the
   conversation. Never a name, an email or an id — the child is "the student".

   Two guards sit around the model:
     · a local out-of-scope check, so a question that plainly belongs to the
       mentor (why a mark, payments, schedule…) is handed off without a call;
     · a local answerer, used with no key set or when the call fails, so the
       parent always gets an honest answer built from the same numbers.
   ========================================================================== */

const env = import.meta.env
const ENDPOINT: string = env.VITE_AI_ENDPOINT || 'https://openrouter.ai/api/v1/chat/completions'
const MODEL: string = env.VITE_AI_MODEL || 'meta-llama/llama-3.3-70b-instruct:free'
const KEY: string = env.VITE_AI_KEY || ''
const TIMEOUT_MS = 25_000

/** Whether live answers are possible at all. Without a key, nothing is sent. */
export const aiLive = KEY.length > 0

export interface Turn { role: 'user' | 'assistant'; content: string }
export interface Reply {
  text: string
  /** The question belongs to the mentor — the UI offers the hand-off. */
  toMentor: boolean
  /** 'ai' came from the model; 'local' was answered in the browser. */
  source: 'ai' | 'local'
}

/* Things only the mentor can answer: their judgement, their calendar, money,
   and anything personal. English and Egyptian Arabic. */
const OUT_OF_SCOPE: RegExp[] = [
  /\bwhy\b.*\b(mark|grade|score|marked|graded)\b/i,
  /\b(refunds?|payments?|invoices?|instal(l)?ments?|discount)\b/i,
  /\bpay (for|the|my)\b/i,
  /\b(reschedul\w*|change (the )?(class|time|date|group|mentor)|move (the )?class|timetable)\b/i,
  /\b(mentor|teacher|instructor)('s)? (think|opinion|view|feel)/i,
  /\b(sick|illness|health|bully\w*|anxious|anxiety|depress\w*)\b/i,
  /\b(password|log ?in|account locked|certificate)\b/i,
  /استرداد|فلوس|الدفع|قسط|تقسيط|موعد|ميعاد|تغيير (المجموعة|الميعاد)|ليه (الدرجة|اخد)|رأي المدرس|رأي المنتور/,
]
export const outOfScope = (q: string) => OUT_OF_SCOPE.some(r => r.test(q))

const RULES = `You are the IBSRA Heros progress assistant. You talk to a PARENT who is reading their child's performance report. The FACTS below are the only data you have about the child.

Rules:
1. Use only the FACTS. Never invent numbers, dates, marks, names or mentor feedback.
2. Be honest and specific: say what the numbers are. Describe any gap as what is still to come or as the next step. Never use the words "disadvantage", "weak", "poor", "failing", "bad" or "behind", and never compare the child with other named students.
3. Income: never predict or promise income. If you mention money from clients, also say how many students there are, what the middle (median) student earned, and how many earned nothing yet, exactly as in the FACTS.
4. FORMAT — this matters most:
   - Answer as 2 to 5 short bullet points. Each bullet starts with "- " on its own line.
   - Use very simple, everyday English, like talking to a friend. Short sentences, under 15 words each.
   - No technical words. Never say "slice", "payback", "ratio", "metric", "asset", "cohort", "KPI" or "percentile". Say "lessons", "homework", "finished pieces of work", "money from clients", "other students".
   - Explain any number in plain words, for example "came to 9 of 10 classes".
   - No headings, no bold, no tables. Speak warmly and directly to the parent.
   - If the parent writes in Arabic, answer in simple Arabic with the same bullet format.
5. In scope: what these numbers mean, what comes next in the program, and general ways a parent can support study at home.
6. Out of scope: why a specific mark was given, the mentor's opinion of the child, schedule or class changes, fees, payments or refunds, technical help with the child's work, health or personal matters, and anything the FACTS do not cover. For these, reply exactly "[MENTOR]" followed by one short sentence saying the mentor is the right person to ask and why.`

export async function askAssistant(
  question: string,
  history: Turn[],
  facts: string,
  fallback: (q: string) => Reply,
): Promise<Reply> {
  if (outOfScope(question)) return { text: '', toMentor: true, source: 'local' }
  if (!aiLive) return fallback(question)

  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${KEY}`,
        /* OpenRouter's optional attribution headers; others ignore them. */
        'HTTP-Referer': window.location.origin,
        'X-Title': 'IBSRA Heros',
      },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.3,
        max_tokens: 320,
        messages: [
          { role: 'system', content: `${RULES}\n\nFACTS (JSON):\n${facts}` },
          ...history.slice(-8),
          { role: 'user', content: question },
        ],
      }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const text = String(data?.choices?.[0]?.message?.content ?? '').trim()
    if (!text) throw new Error('empty reply')
    if (/^\[MENTOR\]/i.test(text)) {
      return { text: text.replace(/^\[MENTOR\]\s*/i, ''), toMentor: true, source: 'ai' }
    }
    return { text, toMentor: false, source: 'ai' }
  } catch {
    return fallback(question)
  } finally {
    window.clearTimeout(timer)
  }
}
