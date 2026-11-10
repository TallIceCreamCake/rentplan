import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './ui'
import { addDays, isSameDay, startOfDay, startOfMonth, startOfWeek, toDateInput, toLocalInput } from '../lib/utils'

// Sélecteurs de date, d'heure et de période (calendrier maison, partagé avec la carte « Période du projet »).

export const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const pad = (n) => String(n).padStart(2, '0')
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)
export const monthTitle = (d) => `${cap(MONTHS[d.getMonth()])} ${d.getFullYear()}`

/** Numéro de semaine ISO 8601 (la semaine 1 contient le premier jeudi de l'année). */
export function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const jan1 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t - jan1) / 86400000 + 1) / 7)
}

export const dayDiff = (a, b) => Math.round((startOfDay(a) - startOfDay(b)) / 86400000)

const minutesOf = (d) => d.getHours() * 60 + d.getMinutes()
/**
 * Dernier jour couvert par une période : une fin à une heure plus matinale que le début (soirée qui finit
 * à 2 h, fin à minuit) appartient à la veille.
 */
export function lastDayOf(start, end) {
  if (!end) return null
  const e = startOfDay(end)
  return start && dayDiff(end, start) > 0 && minutesOf(end) <= minutesOf(start) ? addDays(e, -1) : e
}
/** Fin d'une période à partir de son dernier jour et de l'heure de fin (après minuit si l'heure précède celle du début). */
export function endFrom(lastDay, endTime, startTime) {
  const [h, m] = endTime.split(':').map(Number)
  const [sh, sm] = startTime.split(':').map(Number)
  const d = new Date(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate(), h, m)
  return h * 60 + m <= sh * 60 + sm ? addDays(d, 1) : d
}

/** Lit « 2026-10-28 » ou « 2026-10-28T09:00 » en heure locale (une date seule n'est pas lue en UTC). */
export function readDate(v) {
  if (!v) return null
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v
  const s = String(v)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/)
  if (m && !/(Z|[+-]\d{2}:?\d{2})$/.test(s)) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0))
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
const at = (day, time) => {
  const [h, m] = time.split(':').map(Number)
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m)
}

/** « 9 », « 930 », « 9h30 », « 21:15 » → « HH:MM » (null si illisible). */
export function parseTime(s) {
  const t = String(s || '').trim().toLowerCase().replace(/\s+/g, '')
  const m = t.match(/^(\d{1,2})(?:[:h.](\d{0,2}))?$/) || t.match(/^(\d{1,2})(\d{2})$/)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2] || 0)
  if (h > 23 || min > 59) return null
  return `${pad(h)}:${pad(min)}`
}

const fmtDayLong = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
const fmtDay = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
const fmtDayNoYear = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })

/** Durée lisible d'une période : « 5 h 30 » sous 24 h, sinon le nombre de jours calendaires couverts. */
export function durationLabel(start, end) {
  if (!start || !end || end <= start) return ''
  const min = Math.round((end - start) / 60000)
  if (min < 24 * 60) return `${Math.floor(min / 60)} h${min % 60 ? ` ${pad(min % 60)}` : ''}`
  const days = dayDiff(lastDayOf(start, end), start) + 1
  return `${days} jour${days > 1 ? 's' : ''}`
}
const daysLabel = (a, b) => { const n = dayDiff(b, a) + 1; return `${n} jour${n > 1 ? 's' : ''}` }

// ---------- Fenêtre flottante ----------
/** Rendue dans <body> sous le déclencheur (au-dessus s'il manque de place), fermée par Échap ou un clic à côté. */
export function Popover({ anchor, onClose, children, className = '' }) {
  const ref = useRef(null)
  const [pos, setPos] = useState(null)
  useLayoutEffect(() => {
    const place = () => {
      const a = anchor.current
      const el = ref.current
      if (!a || !el) return
      const r = a.getBoundingClientRect()
      const w = el.offsetWidth
      const h = el.offsetHeight
      let top = r.bottom + 6
      if (top + h > innerHeight - 8 && r.top - h - 6 >= 8) top = r.top - h - 6
      top = Math.max(8, Math.min(top, innerHeight - h - 8))
      const left = Math.max(8, Math.min(r.left, innerWidth - w - 8))
      setPos((p) => (p && p.top === top && p.left === left ? p : { top, left }))
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(ref.current)
    addEventListener('resize', place)
    addEventListener('scroll', place, true)
    return () => {
      ro.disconnect()
      removeEventListener('resize', place)
      removeEventListener('scroll', place, true)
    }
  }, [anchor])
  useEffect(() => {
    const down = (e) => {
      if (!ref.current?.contains(e.target) && !anchor.current?.contains(e.target)) onClose()
    }
    // Échap ferme d'abord le calendrier, pas la fenêtre qui le contient
    const key = (e) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    document.addEventListener('mousedown', down)
    addEventListener('keydown', key, true)
    return () => {
      document.removeEventListener('mousedown', down)
      removeEventListener('keydown', key, true)
    }
  }, [anchor, onClose])
  return createPortal(
    <div ref={ref} className={`dp-pop ${className}`} role="dialog" style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}>
      {children}
    </div>,
    document.body,
  )
}

// ---------- Calendrier ----------
/**
 * Grille d'un mois, du lundi au dimanche.
 * range : [début, fin] (pastilles aux extrémités, bande entre les deux) ; soft : période secondaire en bande claire.
 */
export function MonthGrid({ month, range, soft, weeks = false, size = 'sm', onPick, onHover, isDisabled }) {
  const first = startOfWeek(month)
  const today = new Date()
  const [a, b] = (range || []).map((d) => d && startOfDay(d))
  const [sa, sb] = (soft || []).map((d) => d && startOfDay(d))
  const within = (d, x, y) => x && y && d >= x && d <= y
  const cells = []
  if (weeks) cells.push(<div key="wh" className="cal-h cal-wkh">Sem.</div>)
  WEEKDAYS.forEach((w) => cells.push(<div key={w} className="cal-h">{w}</div>))
  for (let w = 0; w < 6; w++) {
    const ws = addDays(first, w * 7)
    if (weeks) cells.push(<div key={`w${w}`} className="cal-wk">{isoWeek(ws)}</div>)
    for (let i = 0; i < 7; i++) {
      const d = addDays(ws, i)
      const inR = within(d, a, b)
      const inS = within(d, sa, sb)
      const dis = isDisabled?.(d)
      const cls = [
        'cal-d',
        `c${i}`,
        d.getMonth() !== month.getMonth() && 'out',
        i >= 5 && 'we',
        isSameDay(d, today) && 'today',
        inR && 'r',
        inR && isSameDay(d, a) && 'rs',
        inR && isSameDay(d, b) && 're',
        inS && 'p',
        inS && isSameDay(d, sa) && 'ps',
        inS && isSameDay(d, sb) && 'pe',
      ].filter(Boolean).join(' ')
      const label = fmtDayLong.format(d)
      cells.push(onPick ? (
        <button key={d.getTime()} type="button" className={cls} disabled={dis} onClick={() => onPick(d)} onMouseEnter={() => onHover?.(d)} aria-label={label} aria-pressed={!!inR}>
          <span>{d.getDate()}</span>
        </button>
      ) : (
        <div key={d.getTime()} className={cls} title={label}><span>{d.getDate()}</span></div>
      ))
    }
  }
  return <div className={`cal cal-${size} ${weeks ? 'weeks' : ''} ${onPick ? 'pickable' : ''}`} onMouseLeave={() => onHover?.(null)}>{cells}</div>
}

/** Choix rapide du mois et de l'année (clic sur le titre du calendrier). */
export function MonthYearPanel({ value, onPick }) {
  const [year, setYear] = useState(value.getFullYear())
  const now = new Date()
  return (
    <div className="cal-my">
      <div className="cal-my-head">
        <button type="button" className="cal-nav" onClick={() => setYear(year - 1)} aria-label="Année précédente"><Icon name="chevron_left" size={20} /></button>
        <strong>{year}</strong>
        <button type="button" className="cal-nav" onClick={() => setYear(year + 1)} aria-label="Année suivante"><Icon name="chevron_right" size={20} /></button>
      </div>
      <div className="cal-my-grid">
        {MONTHS_SHORT.map((m, i) => (
          <button
            key={m}
            type="button"
            className={`${i === value.getMonth() && year === value.getFullYear() ? 'on' : ''} ${i === now.getMonth() && year === now.getFullYear() ? 'now' : ''}`}
            onClick={() => onPick(new Date(year, i, 1))}
          >
            {cap(m)}
          </button>
        ))}
      </div>
    </div>
  )
}

/** En-tête d'un calendrier : titre cliquable (mois / année) et flèches. */
export function MonthHeader({ month, setMonth, count = 1, picking, setPicking, extra, align = 'center' }) {
  const go = (n) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1))
  const prev = <button type="button" className="cal-nav" onClick={() => go(-1)} aria-label="Mois précédent"><Icon name="chevron_left" size={20} /></button>
  const next = <button type="button" className="cal-nav" onClick={() => go(1)} aria-label="Mois suivant"><Icon name="chevron_right" size={20} /></button>
  const titles = (
    <div className="cal-titles">
      {Array.from({ length: count }, (_, i) => {
        const m = new Date(month.getFullYear(), month.getMonth() + i, 1)
        return i === 0 && setPicking ? (
          <button key={i} type="button" className={`cal-title ${picking ? 'on' : ''}`} onClick={() => setPicking(!picking)} aria-label="Choisir le mois et l'année" aria-expanded={!!picking}>
            {monthTitle(m)} <Icon name={picking ? 'expand_less' : 'expand_more'} size={18} />
          </button>
        ) : (
          <span key={i} className="cal-title static">{monthTitle(m)}</span>
        )
      })}
    </div>
  )
  // « left » : titre à gauche, actions et flèches à droite (carte du projet) ; sinon flèches de part et d'autre
  return align === 'left' ? (
    <div className="cal-head left">{titles}{extra}{prev}{next}</div>
  ) : (
    <div className="cal-head">{prev}{titles}{extra}{next}</div>
  )
}

// ---------- Heure ----------
const TIMES = Array.from({ length: 48 }, (_, i) => `${pad(Math.floor(i / 2))}:${i % 2 ? '30' : '00'}`)

/** Heure saisie au clavier (« 9h30 », « 930 »…) ou choisie dans la liste. */
export function TimeInput({ value, onChange, label = 'Heure' }) {
  const [text, setText] = useState(value)
  const [open, setOpen] = useState(false)
  const [up, setUp] = useState(false)
  const input = useRef(null)
  const list = useRef(null)
  useEffect(() => setText(value), [value])
  useLayoutEffect(() => {
    if (!open || !list.current) return
    const i = TIMES.findIndex((t) => t >= value)
    const el = list.current.children[Math.max(0, i)]
    if (el) list.current.scrollTop = el.offsetTop - list.current.clientHeight / 2 + el.offsetHeight / 2
  }, [open, value])
  const commit = () => {
    const t = parseTime(text)
    if (t) onChange(t)
    setText(t || value)
  }
  return (
    <div className="dp-time">
      <Icon name="schedule" size={16} />
      <input
        ref={input}
        className="dp-time-input"
        value={text}
        inputMode="numeric"
        aria-label={label}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => { setUp(e.target.getBoundingClientRect().bottom + 210 > innerHeight); setOpen(true); e.target.select() }}
        onBlur={() => { commit(); setOpen(false) }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); input.current.blur() }
          if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false) }
        }}
      />
      {open && (
        <div className={`dp-time-list ${up ? 'up' : ''}`} ref={list}>
          {TIMES.map((t) => (
            <button key={t} type="button" className={t === value ? 'on' : ''} onMouseDown={(e) => { e.preventDefault(); onChange(t); setText(t); input.current.blur() }}>{t}</button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------- Champ date (et heure) ----------
/**
 * Remplace <input type="date"> / <input type="datetime-local"> : même valeur (« AAAA-MM-JJ » ou « AAAA-MM-JJTHH:MM »).
 */
export function DateField({ value, onChange, time = false, placeholder = 'Choisir une date', clearable = false, invalid = false, small = false, defaultTime = '09:00', isDisabled, 'aria-label': ariaLabel }) {
  const anchor = useRef(null)
  const [open, setOpen] = useState(false)
  const d = readDate(value)
  const [month, setMonth] = useState(() => startOfMonth(d || new Date()))
  const [picking, setPicking] = useState(false)
  const toggle = () => {
    if (!open) { setMonth(startOfMonth(d || new Date())); setPicking(false) }
    setOpen(!open)
  }
  const emit = (x) => onChange(time ? toLocalInput(x) : toDateInput(x))
  const pick = (day) => {
    emit(time ? at(day, d ? hm(d) : defaultTime) : day)
    if (!time) setOpen(false)
  }
  const text = d ? (time ? `${fmtDayLong.format(d)} · ${hm(d)}` : fmtDayLong.format(d)) : placeholder
  return (
    <>
      <button ref={anchor} type="button" className={`input dp-trigger ${small ? 'input-sm' : ''} ${open ? 'open' : ''} ${invalid ? 'invalid' : ''}`} onClick={toggle} aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={open}>
        <Icon name="calendar_today" size={16} />
        <span className={`dp-text ${d ? '' : 'ph'}`}>{text}</span>
        {clearable && d && <span className="dp-clear" role="button" tabIndex={-1} aria-label="Effacer" onClick={(e) => { e.stopPropagation(); onChange('') }}><Icon name="close" size={15} /></span>}
      </button>
      {open && (
        <Popover anchor={anchor} onClose={() => setOpen(false)} className="dp-single">
          <MonthHeader month={month} setMonth={setMonth} picking={picking} setPicking={setPicking} />
          {picking ? <MonthYearPanel value={month} onPick={(m) => { setMonth(m); setPicking(false) }} /> : <MonthGrid month={month} range={d ? [d, d] : null} onPick={pick} isDisabled={isDisabled} />}
          <div className="dp-foot">
            {time && <TimeInput value={d ? hm(d) : defaultTime} onChange={(t) => emit(at(d || startOfDay(new Date()), t))} />}
            <button type="button" className="btn-link" onClick={() => { const now = new Date(); setMonth(startOfMonth(now)); pick(now) }}>Aujourd’hui</button>
            <span className="spacer" />
            {time && <button type="button" className="btn btn-sm btn-primary" onClick={() => setOpen(false)}>OK</button>}
          </div>
        </Popover>
      )}
    </>
  )
}

// ---------- Champ période ----------
const PRESETS = [
  ['1 jour', 1],
  ['2 jours', 2],
  ['3 jours', 3],
  ['1 semaine', 7],
]

/**
 * Période (début → fin) choisie sur deux mois : un clic pour le début, un second pour la fin, puis les heures.
 * onChange({ start, end }) reçoit des valeurs « AAAA-MM-JJTHH:MM » (ou « AAAA-MM-JJ » sans heures).
 * soft : autre période affichée en bande claire pour se repérer (ex. l'utilisation quand on règle la planification).
 */
export function DateRangeField({ start, end, onChange, time = true, soft, softLabel, placeholder = 'Choisir une période', invalid = false, small = false, months = 2, defaultTimes = ['09:00', '23:00'], 'aria-label': ariaLabel }) {
  const anchor = useRef(null)
  const [open, setOpen] = useState(false)
  const s0 = readDate(start)
  const e0 = readDate(end)
  const [draft, setDraft] = useState(null)
  const [hover, setHover] = useState(null)
  const [month, setMonth] = useState(() => startOfMonth(s0 || new Date()))
  const [picking, setPicking] = useState(false)
  const count = typeof window !== 'undefined' && innerWidth < 720 ? 1 : months

  const openIt = () => {
    setDraft({ s: s0 && startOfDay(s0), e: e0 && lastDayOf(s0, e0), st: s0 ? hm(s0) : defaultTimes[0], et: e0 ? hm(e0) : defaultTimes[1], phase: 'start' })
    setMonth(startOfMonth(s0 || new Date()))
    setPicking(false)
    setHover(null)
    setOpen(true)
  }
  const close = () => setOpen(false)
  const pick = (day) => {
    setDraft((x) => {
      if (x.phase === 'start' || !x.s) return { ...x, s: day, e: null, phase: 'end' }
      if (day < x.s) return { ...x, s: day, e: null, phase: 'end' }
      return { ...x, e: day, phase: 'start' }
    })
  }
  const preset = (n) => setDraft((x) => { const s = x.s || startOfDay(new Date()); return { ...x, s, e: addDays(s, n - 1), phase: 'start' } })

  const ds = draft?.s && (time ? at(draft.s, draft.st) : draft.s)
  // Une heure de fin plus matinale que celle du début (soirée qui finit à 2 h) : la fin tombe le lendemain matin
  const deFixed = draft?.e && (time ? endFrom(draft.e, draft.et, draft.st) : draft.e)
  const nextMorning = time && deFixed && !isSameDay(deFixed, draft.e)
  const valid = ds && deFixed && (time ? deFixed > ds : deFixed >= ds)
  const apply = () => {
    if (!valid) return
    onChange(time ? { start: toLocalInput(ds), end: toLocalInput(deFixed) } : { start: toDateInput(ds), end: toDateInput(deFixed) })
    close()
  }
  const preview = draft?.phase === 'end' && draft.s && hover && hover >= draft.s ? [draft.s, hover] : draft?.s ? [draft.s, draft.e || draft.s] : null

  const textOf = (a, b) => {
    if (!a || !b) return placeholder
    const sameYear = a.getFullYear() === b.getFullYear() && a.getFullYear() === new Date().getFullYear()
    const f = (d) => (sameYear ? fmtDayNoYear : fmtDay).format(d)
    if (!time) return isSameDay(a, b) ? f(a) : `${f(a)} → ${f(b)}`
    return isSameDay(a, b) ? `${f(a)} · ${hm(a)} → ${hm(b)}` : `${f(a)} · ${hm(a)} → ${f(b)} · ${hm(b)}`
  }
  const dur = s0 && e0 && e0 >= s0 ? (time ? durationLabel(s0, e0) : daysLabel(s0, e0)) : ''
  return (
    <>
      <button ref={anchor} type="button" className={`input dp-trigger ${small ? 'input-sm' : ''} ${open ? 'open' : ''} ${invalid || (s0 && e0 && e0 < s0) ? 'invalid' : ''}`} onClick={() => (open ? close() : openIt())} aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={open}>
        <Icon name="date_range" size={17} />
        <span className={`dp-text ${s0 && e0 ? '' : 'ph'}`}>{textOf(s0, e0)}</span>
        {dur && <span className="dp-dur">{dur}</span>}
      </button>
      {open && draft && (
        <Popover anchor={anchor} onClose={close} className={`dp-range m${count}`}>
          <div className="dp-presets">
            {PRESETS.map(([l, n]) => <button key={n} type="button" className="chip" onClick={() => preset(n)}>{l}</button>)}
            <span className="spacer" />
            <span className="dp-step">{draft.phase === 'end' ? 'Cliquez sur le dernier jour' : 'Cliquez sur le premier jour'}</span>
          </div>
          <MonthHeader month={month} setMonth={setMonth} count={picking ? 1 : count} picking={picking} setPicking={setPicking} />
          {picking ? (
            <MonthYearPanel value={month} onPick={(m) => { setMonth(m); setPicking(false) }} />
          ) : (
            <div className="dp-months">
              {Array.from({ length: count }, (_, i) => (
                <MonthGrid key={i} month={new Date(month.getFullYear(), month.getMonth() + i, 1)} range={preview} soft={soft?.map(readDate)} onPick={pick} onHover={draft.phase === 'end' ? setHover : undefined} />
              ))}
            </div>
          )}
          {soft && softLabel && <div className="dp-soft-legend"><i /> {softLabel}</div>}
          <div className="dp-range-foot">
            <div className={`dp-end ${draft.phase === 'start' ? 'active' : ''}`}>
              <span className="dp-end-label">Début</span>
              <strong>{draft.s ? fmtDayLong.format(draft.s) : '—'}</strong>
              {time && <TimeInput label="Heure de début" value={draft.st} onChange={(t) => setDraft({ ...draft, st: t })} />}
            </div>
            <Icon name="arrow_forward" size={18} className="dp-arrow" />
            <div className={`dp-end ${draft.phase === 'end' ? 'active' : ''}`}>
              <span className="dp-end-label">Fin</span>
              <strong>{draft.e ? fmtDayLong.format(deFixed) : '—'}{nextMorning && <span className="dp-next"> lendemain</span>}</strong>
              {time && <TimeInput label="Heure de fin" value={draft.et} onChange={(t) => setDraft({ ...draft, et: t })} />}
            </div>
          </div>
          <div className="dp-foot">
            <span className={`small ${valid || !draft.e ? 'muted' : 'dp-err'}`}>{valid ? (time ? durationLabel(ds, deFixed) : daysLabel(ds, deFixed)) : draft.e ? 'La fin doit être après le début' : ''}</span>
            <span className="spacer" />
            <button type="button" className="btn btn-sm" onClick={close}>Annuler</button>
            <button type="button" className="btn btn-sm btn-primary" onClick={apply} disabled={!valid}>Appliquer</button>
          </div>
        </Popover>
      )}
    </>
  )
}
