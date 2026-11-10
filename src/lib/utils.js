// ---------- Identifiants ----------
export const uid = (prefix = '') =>
  prefix + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4)

// ---------- Dates ----------
// Les horaires sont stockés en heure locale « YYYY-MM-DDTHH:mm » (compatible <input type="datetime-local">)
const pad = (n) => String(n).padStart(2, '0')

export const toLocalInput = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`

export const toDateInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const parse = (s) => (s ? new Date(s) : null)

export const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

export const addDays = (d, n) => {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export const addHours = (d, n) => new Date(d.getTime() + n * 3600000)

export const startOfWeek = (d) => {
  const r = startOfDay(d)
  return addDays(r, -((r.getDay() + 6) % 7)) // lundi
}

export const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1)

export const isSameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/** Nombre de jours calendaires couverts par une période (minimum 1). */
export const daysSpan = (start, end) => {
  if (!start || !end) return 1
  const s = startOfDay(parse(start))
  const e = startOfDay(parse(end))
  return Math.max(1, Math.round((e - s) / 86400000) + 1)
}

export const hoursSpan = (start, end) => {
  if (!start || !end) return 0
  return Math.max(0, (parse(end) - parse(start)) / 3600000)
}

export const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd

const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const shortFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })
const timeFmt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })
const longFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

export const fmtDate = (s) => (s ? dateFmt.format(parse(s)) : '—')
export const fmtShort = (s) => (s ? shortFmt.format(parse(s)) : '—')
export const fmtTime = (s) => (s ? timeFmt.format(parse(s)) : '')
export const fmtDateTime = (s) => (s ? `${dateFmt.format(parse(s))} ${timeFmt.format(parse(s))}` : '—')
export const fmtLong = (d) => longFmt.format(d)
export const fmtRange = (a, b) => {
  if (!a) return '—'
  if (!b || isSameDay(parse(a), parse(b))) return fmtShort(a)
  return `${fmtShort(a)} → ${fmtShort(b)}`
}
export const fmtPeriod = (a, b) => (a ? `${fmtDateTime(a)} - ${fmtDateTime(b)}` : '—')
export const fmtHM = (minutes) => {
  const m = Math.round(Number(minutes) || 0)
  return `${pad(Math.floor(m / 60))}:${pad(Math.abs(m % 60))}`
}

// ---------- Nombres ----------
export const fmtMoney = (n, currency = 'EUR') =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(Number(n) || 0)

export const fmtNumber = (n, digits = 0) =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: digits }).format(Number(n) || 0)

export const num = (v) => {
  const n = parseFloat(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// ---------- Tarif dégressif (coefficients sur plusieurs jours) ----------
/** La grille donne un facteur par nombre de jours ; au-delà de la dernière ligne on ajoute `extra` par jour. */
export const durationFactor = (days, staffel = [], extra = 0.25) => {
  if (!staffel.length) return days
  const sorted = [...staffel].sort((a, b) => a.days - b.days)
  const last = sorted[sorted.length - 1]
  if (days > last.days) return round2(last.factor + (days - last.days) * extra)
  let f = sorted[0].factor
  for (const s of sorted) if (s.days <= days) f = s.factor
  return f
}

// ---------- Divers ----------
export const personName = (c) => (c ? [c.firstName, c.lastName].filter(Boolean).join(' ') : '—')

export const contactName = (c) => {
  if (!c) return '—'
  if (c.company) return c.company
  return personName(c) || 'Sans nom'
}

export const initials = (c) => ((c?.firstName?.[0] || '') + (c?.lastName?.[0] || '')).toUpperCase() || '?'

export const matches = (q, ...fields) => {
  if (!q) return true
  const s = q.toLowerCase()
  return fields.some((f) => String(f ?? '').toLowerCase().includes(s))
}

export const downloadFile = (name, content, type = 'application/json') => {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export const toCsv = (rows) =>
  rows
    .map((r) =>
      r
        .map((v) => {
          const s = String(v ?? '')
          return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
        })
        .join(';'),
    )
    .join('\n')

export const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]))

/** JSON aux clés triées : deux objets égaux donnent le même texte (la base jsonb réordonne les clés). */
export const stableJson = (v) => {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`
  if (v && typeof v === 'object') return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stableJson(v[k])}`).join(',')}}`
  return JSON.stringify(v ?? null)
}

export const groupBy = (list, key) => {
  const m = {}
  for (const x of list) {
    const k = x[key]
    if (k == null) continue
    ;(m[k] ||= []).push(x)
  }
  return m
}

export const sortByKey = (key) => (a, b) => (a[key] ?? 0) - (b[key] ?? 0)
