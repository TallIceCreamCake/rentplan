import { useState } from 'react'
import { useStore, toast } from '../../store'
import { Icon } from '../../components/ui'
import { MonthGrid, MonthHeader, MonthYearPanel, TimeInput, dayDiff, durationLabel, endFrom, lastDayOf, readDate } from '../../components/DatePicker'
import { projectTimes } from '../../lib/model'
import { addDays, startOfMonth, toLocalInput } from '../../lib/utils'

const pad = (n) => String(n).padStart(2, '0')
const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
const fmtDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
const fmtDayYear = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })
const at = (day, time) => {
  const [h, m] = time.split(':').map(Number)
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m)
}
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
const rangeText = (a, b) => (a && b ? `${fmtDay.format(a)} · ${hm(a)} → ${fmtDay.format(b)} · ${hm(b)}` : '—')

/**
 * Période du projet (comme Rentman) : calendrier du mois avec la période d'utilisation et la planification,
 * modifiable en cliquant le premier puis le dernier jour, et le planning calculé à partir du contenu.
 */
export default function ProjectPeriodCard({ project, idx, canEdit }) {
  const patch = useStore((s) => s.patch)
  const periods = idx.periodsByProject[project.id] || []
  const main = periods.filter((p) => !p.subprojectId)
  const usage = main.find((p) => p.isUsage) || periods.find((p) => p.isUsage)
  const planning = main.find((p) => p.isPlanning) || periods.find((p) => p.isPlanning)
  const calc = projectTimes(project.id, idx)
  const useStart = readDate(usage?.startsAt || calc.useStart)
  const useEnd = readDate(usage?.endsAt || calc.useEnd)
  const planStart = readDate(planning?.startsAt || calc.planStart)
  const planEnd = readDate(planning?.endsAt || calc.planEnd)
  const [month, setMonth] = useState(() => startOfMonth(useStart || new Date()))
  const [picking, setPicking] = useState(false)
  const [edit, setEdit] = useState(false)
  const [from, setFrom] = useState(null)
  const [hover, setHover] = useState(null)
  const [pending, setPending] = useState(null)
  const [moveAll, setMoveAll] = useState(true)

  // Plage affichée : la période d'utilisation, celle en cours de sélection ou celle à confirmer
  let range = useStart && useEnd ? [useStart, lastDayOf(useStart, useEnd)] : null
  if (pending) range = [pending.first, pending.last]
  else if (edit && from) {
    const other = hover || from
    range = other < from ? [other, from] : [from, other]
  }
  let soft = planStart && planEnd ? [planStart, lastDayOf(planStart, planEnd)] : null

  const stop = () => { setEdit(false); setFrom(null); setPending(null); setHover(null) }
  const startEdit = () => {
    setEdit(true)
    setFrom(null)
    setPending(null)
    setPicking(false)
    if (useStart) setMonth(startOfMonth(useStart))
  }
  const pick = (d) => {
    if (!edit || pending) return
    if (!from) return setFrom(d)
    const [first, last] = d < from ? [d, from] : [from, d]
    setPending({ first, last, st: useStart ? hm(useStart) : '09:00', et: useEnd ? hm(useEnd) : '23:00' })
  }
  // Nouvelle période : une heure de fin plus matinale que celle du début tombe le lendemain (soirée qui finit à 2 h)
  const newStart = pending && at(pending.first, pending.st)
  const newEnd = pending && endFrom(pending.last, pending.et, pending.st)
  // Aperçu : la planification se décale avec la nouvelle période (marges conservées)
  if (pending && soft && useStart && useEnd) soft = [addDays(soft[0], dayDiff(newStart, useStart)), addDays(soft[1], dayDiff(lastDayOf(newStart, newEnd), lastDayOf(useStart, useEnd)))]

  const save = () => {
    if (!usage) return toast('Ce projet n’a pas de période d’utilisation à modifier', 'error')
    const oldStart = readDate(usage.startsAt)
    const oldEnd = readDate(usage.endsAt)
    // Décalage en jours du début et de la fin (la planification garde ses marges de préparation et de retour)
    const ds = dayDiff(newStart, oldStart)
    const de = dayDiff(lastDayOf(newStart, newEnd), lastDayOf(oldStart, oldEnd))
    const shift = (v, n) => (v && n ? toLocalInput(addDays(readDate(v), n)) : v)
    patch('periods', usage.id, { startsAt: toLocalInput(newStart), endsAt: toLocalInput(newEnd) })
    for (const pe of periods) {
      if (pe.id === usage.id) continue
      if (pe.isUsage || pe.isPlanning) patch('periods', pe.id, { startsAt: shift(pe.startsAt, ds), endsAt: shift(pe.endsAt, de) })
      else if (moveAll && ds) patch('periods', pe.id, { startsAt: shift(pe.startsAt, ds), endsAt: shift(pe.endsAt, ds) })
    }
    // Horaires propres du matériel, de l'équipe, du transport et des sous-locations : déplacés avec le début du projet
    if (moveAll && ds) {
      const s = useStore.getState()
      const mine = (list) => list.filter((x) => x.projectId === project.id)
      for (const g of mine(s.equipmentGroups)) if (g.planStart || g.useStart) patch('equipmentGroups', g.id, { planStart: shift(g.planStart, ds), planEnd: shift(g.planEnd, ds), useStart: shift(g.useStart, ds), useEnd: shift(g.useEnd, ds) })
      for (const f of mine(s.functions)) if (f.planStart || f.useStart) patch('functions', f.id, { planStart: shift(f.planStart, ds), planEnd: shift(f.planEnd, ds), useStart: shift(f.useStart, ds), useEnd: shift(f.useEnd, ds) })
      // Créneaux des affectations déplacés avec le projet
      for (const x of mine(s.assignments)) if (x.planStart || x.shifts?.length) patch('assignments', x.id, { planStart: shift(x.planStart, ds), planEnd: shift(x.planEnd, ds), shifts: (x.shifts || []).map((c) => ({ ...c, start: shift(c.start, ds), end: shift(c.end, ds) })) })
      for (const r of mine(s.subrents)) if (r.startsAt) patch('subrents', r.id, { startsAt: shift(r.startsAt, ds), endsAt: shift(r.endsAt, ds) })
    }
    toast(`Période du projet : ${rangeText(newStart, newEnd)}`)
    setMonth(startOfMonth(newStart))
    stop()
  }

  const cStart = readDate(calc.useStart)
  const cEnd = readDate(calc.useEnd)
  const cpStart = readDate(calc.planStart)
  const cpEnd = readDate(calc.planEnd)
  const today = new Date()
  const elsewhere = useStart && (month.getMonth() !== useStart.getMonth() || month.getFullYear() !== useStart.getFullYear())
  return (
    <div className={`card ppc ${edit ? 'editing' : ''}`}>
      <div className="card-header">
        <span className="section-title">Période du projet</span>
        <Icon name="info" size={16} title="Période d’utilisation du projet. La période de planification (sortie et retour du matériel) apparaît en bande claire." style={{ color: 'var(--muted)' }} />
        <div className="actions">
          {canEdit && (edit ? <button className="btn-link" onClick={stop}>Annuler</button> : <button className="btn-link" onClick={startEdit}>Modifier</button>)}
        </div>
      </div>
      <div className="ppc-body">
        {edit && !pending && (
          <div className="ppc-hint">
            <span className="ppc-step">{from ? 2 : 1}</span>
            {from ? 'Cliquez sur le dernier jour de la période d’utilisation' : 'Cliquez sur le premier jour de la période d’utilisation'}
          </div>
        )}
        <MonthHeader
          month={month}
          setMonth={(m) => { setMonth(m); setPicking(false) }}
          picking={picking}
          setPicking={setPicking}
          align="left"
          extra={
            <div className="cal-extra">
              {elsewhere && <button type="button" className="cal-today" onClick={() => setMonth(startOfMonth(useStart))} title="Afficher le mois de la période">Période</button>}
              <button type="button" className="cal-today" onClick={() => setMonth(startOfMonth(today))}>Aujourd’hui</button>
            </div>
          }
        />
        {picking ? (
          <MonthYearPanel value={month} onPick={(m) => { setMonth(m); setPicking(false) }} />
        ) : (
          <MonthGrid month={month} weeks size="md" range={range} soft={soft} onPick={edit && !pending ? pick : undefined} onHover={edit && from && !pending ? setHover : undefined} />
        )}
        {pending ? (
          <div className="ppc-confirm">
            <div className="ppc-confirm-dates">
              <div>
                <span className="ppc-label">Début</span>
                <strong>{fmtDayYear.format(pending.first)}</strong>
                <TimeInput label="Heure de début" value={pending.st} onChange={(st) => setPending({ ...pending, st })} />
              </div>
              <Icon name="arrow_forward" size={18} className="ppc-arrow" />
              <div>
                <span className="ppc-label">Fin</span>
                <strong>{fmtDayYear.format(newEnd)}{newEnd && !sameDay(newEnd, pending.last) && <span className="dp-next"> lendemain</span>}</strong>
                <TimeInput label="Heure de fin" value={pending.et} onChange={(et) => setPending({ ...pending, et })} />
              </div>
            </div>
            <label className="ppc-check">
              <input type="checkbox" checked={moveAll} onChange={(e) => setMoveAll(e.target.checked)} />
              <span>Décaler tout le planning du projet (matériel, équipe, transport et sous-locations ayant leurs propres horaires)</span>
            </label>
            <div className="ppc-confirm-foot">
              <span className="muted small">{durationLabel(newStart, newEnd)}</span>
              <span className="spacer" />
              <button className="btn btn-sm" onClick={() => { setPending(null); setFrom(null) }}>Recommencer</button>
              <button className="btn btn-sm btn-primary" onClick={save}>Appliquer</button>
            </div>
          </div>
        ) : (
          <div className="ppc-legend">
            <span><i className="ppc-key use" /> Utilisation</span>
            <span><i className="ppc-key plan" /> Planification</span>
            <span><i className="ppc-key today" /> Aujourd’hui</span>
          </div>
        )}
      </div>
      <div className="ppc-calc">
        <div className="ppc-calc-head">
          <span className="section-title">Planning calculé</span>
          <Icon name="info" size={15} title="Calculé à partir des périodes du matériel et des fonctions de tous les sous-projets." style={{ color: 'var(--muted)' }} />
        </div>
        <button type="button" className="ppc-row" onClick={() => cStart && setMonth(startOfMonth(cStart))} disabled={!cStart} title="Afficher dans le calendrier">
          <i className="ppc-key use" />
          <span className="ppc-row-main"><span className="ppc-label">Utilisation</span><strong>{rangeText(cStart, cEnd)}</strong></span>
          <span className="ppc-dur">{cStart && cEnd ? durationLabel(cStart, cEnd) : ''}</span>
        </button>
        <button type="button" className="ppc-row" onClick={() => cpStart && setMonth(startOfMonth(cpStart))} disabled={!cpStart} title="Afficher dans le calendrier">
          <i className="ppc-key plan" />
          <span className="ppc-row-main"><span className="ppc-label">Planification</span><strong>{rangeText(cpStart, cpEnd)}</strong></span>
          <span className="ppc-dur">{cpStart && cpEnd ? durationLabel(cpStart, cpEnd) : ''}</span>
        </button>
      </div>
    </div>
  )
}
