import { useNavigate } from 'react-router-dom'
import { Icon } from './ui'
import { addDays, isSameDay, startOfDay, startOfWeek } from '../lib/utils'

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const LANE = 24
const MAX_LANES = 7

/**
 * Calendrier mensuel avec barres continues sur plusieurs jours.
 * events : [{ id, s: Date, e: Date, label, color, icon, to, italic, strike }]
 */
export default function MonthCalendar({ month, events, onDayDoubleClick }) {
  const navigate = useNavigate()
  const gridStart = startOfWeek(month)
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 1)
  const weeks = []
  for (let w = gridStart; w < monthEnd; w = addDays(w, 7)) weeks.push(w)
  const today = new Date()

  return (
    <div className="month-cal">
      <div className="cal-head-row">
        {WEEKDAYS.map((d) => <div key={d} className="cal-head">{d}</div>)}
      </div>
      {weeks.map((ws) => {
        const we = addDays(ws, 7)
        const inWeek = events.filter((ev) => ev.s < we && ev.e > ws).sort((a, b) => a.s - b.s || b.e - a.e)
        const lanes = []
        const placed = []
        let hidden = 0
        for (const ev of inWeek) {
          const from = Math.max(0, Math.floor((startOfDay(ev.s) - ws) / 86400000))
          const lastDay = new Date(ev.e.getTime() - 1)
          const to = Math.min(6, Math.floor((startOfDay(lastDay) - ws) / 86400000))
          let lane = lanes.findIndex((lastTo) => lastTo < from)
          if (lane === -1) {
            lane = lanes.length
            lanes.push(to)
          } else lanes[lane] = to
          if (lane >= MAX_LANES) hidden++
          else placed.push({ ...ev, from, to: Math.max(from, to), lane, contL: ev.s < ws, contR: ev.e > we })
        }
        const shown = Math.min(lanes.length, MAX_LANES)
        return (
          <div key={ws.toISOString()} className="cal-week" style={{ minHeight: Math.max(118, 36 + shown * (LANE + 3) + (hidden ? 18 : 6)) }}>
            {Array.from({ length: 7 }, (_, i) => {
              const d = addDays(ws, i)
              return (
                <div key={i} className={`cal-day ${d.getMonth() !== month.getMonth() ? 'other' : ''} ${isSameDay(d, today) ? 'today' : ''} ${[5, 6].includes(i) ? 'weekend' : ''}`} onDoubleClick={() => onDayDoubleClick?.(d)}>
                  <span className="cal-num">{d.getDate()}</span>
                </div>
              )
            })}
            <div className="cal-bars">
              {placed.map((ev) => (
                <div
                  key={ev.id}
                  className={`cal-bar ${ev.contL ? 'cont-left' : ''} ${ev.contR ? 'cont-right' : ''}`}
                  style={{ gridColumn: `${ev.from + 1} / ${ev.to + 2}`, gridRow: ev.lane + 1, background: `${ev.color}38`, fontStyle: ev.italic ? 'italic' : 'normal', textDecoration: ev.strike ? 'line-through' : 'none' }}
                  title={ev.title || ev.label}
                  onClick={() => ev.to && navigate(ev.to)}
                >
                  {ev.icon && <Icon name={ev.icon} size={14} style={{ color: ev.color }} />}
                  {ev.label}
                </div>
              ))}
            </div>
            {hidden > 0 && <div className="muted small" style={{ position: 'absolute', bottom: 2, right: 10 }}>+ {hidden} autre(s)</div>}
          </div>
        )
      })}
    </div>
  )
}
