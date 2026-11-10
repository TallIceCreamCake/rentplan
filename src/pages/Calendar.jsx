import { useMemo, useState } from 'react'
import { useIdx } from '../store'
import { useAccess } from '../lib/auth'
import { Icon, Menu } from '../components/ui'
import MonthCalendar from '../components/MonthCalendar'
import NewProjectModal from '../components/NewProjectModal'
import { AVAILABILITY_KINDS } from './Crew'
import { assignmentSlots, assignmentTimes, isConfirmed, PROJECT_STATUSES, projectStatus, projectTimes, statusOf } from '../lib/model'
import { addDays, addHours, parse, personName, startOfMonth, toLocalInput } from '../lib/utils'

const LAYERS = [
  { id: 'projets', label: 'Projets', icon: 'table_chart' },
  { id: 'equipe', label: "Fonctions d'équipe", icon: 'account_circle' },
  { id: 'transport', label: 'Transports', icon: 'local_shipping' },
  { id: 'disponibilite', label: 'Disponibilités et congés', icon: 'event_busy' },
  { id: 'taches', label: 'Échéances des tâches', icon: 'assignment_turned_in' },
]

export default function Agenda() {
  const idx = useIdx()
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [layers, setLayers] = useState(['projets', 'equipe', 'transport', 'disponibilite'])
  const [statuses, setStatuses] = useState(PROJECT_STATUSES.filter((s) => s.id !== 'annule').map((s) => s.id))
  const access = useAccess()
  // Sans accès au personnel ni au planificateur : uniquement son propre agenda
  const seesOthers = access.can('personnel') || access.can('planificateur')
  const [chosen, setChosen] = useState(access.crewId || '')
  const crewId = seesOthers ? chosen : access.crewId || '__aucun__'
  const [creating, setCreating] = useState(null)
  const toggle = (list, set, id) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  const events = useMemo(() => {
    const out = []
    const showSub = (subId) => statuses.includes(idx.sub[subId]?.status)
    if (layers.includes('projets') && access.can('projets')) {
      // Avec un membre du personnel choisi : seulement les projets sur lesquels il est planifié
      const mine = crewId ? new Set((idx.asgByCrew[crewId] || []).map((a) => a.projectId)) : null
      for (const p of idx.d.projects) {
        if (mine && !mine.has(p.id)) continue
        const st = projectStatus(p.id, idx)
        if (!statuses.includes(st.id)) continue
        const t = projectTimes(p.id, idx)
        if (!t.planStart) continue
        const color = p.color || idx.type[p.typeId]?.color || statusOf(st.id).color
        out.push({
          id: p.id,
          s: parse(t.planStart),
          e: parse(t.planEnd),
          label: `${p.number} - ${p.name}`,
          title: `${p.name} · ${statusOf(st.id).label}`,
          color,
          icon: 'table_chart',
          to: `/projets/${p.id}`,
          italic: !isConfirmed(st.id),
          strike: st.id === 'annule',
        })
      }
    }
    for (const a of idx.d.assignments) {
      const fn = idx.fn[a.functionId]
      if (!fn || !showSub(a.subprojectId)) continue
      if (crewId && a.crewId !== crewId) continue
      const project = idx.project[a.projectId]
      for (const [i, t] of assignmentSlots(a, idx).entries()) {
        if (a.crewId && layers.includes('equipe')) {
          const c = idx.crew[a.crewId]
          out.push({ id: `${a.id}-${i}`, s: parse(t.start), e: parse(t.end), label: `${fn.name} · ${personName(c)} — ${project?.name}`, color: c?.color || '#4c8fe0', icon: 'account_circle', to: `/projets/${a.projectId}?tab=personnel`, italic: !isConfirmed(idx.sub[a.subprojectId]?.status) })
        }
        if (a.vehicleId && layers.includes('transport')) {
          const v = idx.vehicle[a.vehicleId]
          out.push({ id: `${a.id}-v${i}`, s: parse(t.start), e: parse(t.end), label: `${v?.name || 'Véhicule'} — ${project?.name}`, color: '#0d9488', icon: 'local_shipping', to: `/projets/${a.projectId}?tab=transports` })
        }
      }
    }
    if (layers.includes('disponibilite')) {
      for (const u of idx.d.crewAvailability) {
        if (crewId && u.crewId !== crewId) continue
        const k = AVAILABILITY_KINDS[u.kind] || AVAILABILITY_KINDS.indisponible
        out.push({ id: u.id, s: parse(u.startsAt), e: parse(u.endsAt), label: `${u.title || k.label} · ${personName(idx.crew[u.crewId])}`, title: `${k.label}${u.status === 'demande' ? ' (en attente)' : ''}`, color: k.color, icon: k.icon, to: `/personnel/${u.crewId}?tab=disponibilite`, italic: u.status === 'demande' })
      }
    }
    if (layers.includes('taches')) {
      for (const t of idx.d.tasks) {
        if (!t.deadline || t.status === 'termine') continue
        if (crewId && !(t.assignees || []).includes(crewId)) continue
        const d = parse(t.deadline)
        out.push({ id: t.id, s: addHours(d, -1), e: d, label: t.title, color: '#7c3aed', icon: 'assignment_turned_in', to: t.projectId ? `/projets/${t.projectId}?tab=taches` : '/taches' })
      }
    }
    return out.filter((e) => e.s && e.e)
  }, [idx, layers, statuses, crewId])

  const createOn = (d) => {
    const at = (day, h) => {
      const x = new Date(day)
      x.setHours(h, 0, 0, 0)
      return toLocalInput(x)
    }
    setCreating({ planStart: at(d, 8), planEnd: at(addDays(d, 1), 12), useStart: at(d, 9), useEnd: at(d, 23) })
  }

  return (
    <>
      <div className="page-header">
        <h1>Mon agenda <span className="help-dot" title="Projets, fonctions, transports et disponibilités. Double-cliquez sur un jour pour créer un projet."><Icon name="help_outline" size={20} /></span></h1>
      </div>
      <div className="card">
        <div className="grid-toolbar" style={{ gap: 12 }}>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Mois précédent"><Icon name="chevron_left" /></button>
          <strong style={{ fontSize: 16, minWidth: 140, textAlign: 'center', textTransform: 'capitalize' }}>{month.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</strong>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Mois suivant"><Icon name="chevron_right" /></button>
          <button className="btn btn-sm" onClick={() => setMonth(startOfMonth(new Date()))}>Aujourd'hui</button>
          <span className="spacer" />
          {seesOthers ? (
            <select className="select input-sm" style={{ width: 220 }} value={chosen} onChange={(e) => setChosen(e.target.value)} aria-label="Membre du personnel">
              <option value="">Tout le personnel</option>
              {idx.d.crew.map((c) => <option key={c.id} value={c.id}>{personName(c)}</option>)}
            </select>
          ) : (
            <span className="small muted">{access.crewId ? `Planning de ${personName(idx.crew[access.crewId])}` : 'Compte non lié à un membre du personnel'}</span>
          )}
          <Menu trigger={<button className="btn btn-outline btn-sm">Planning <Icon name="arrow_drop_down" size={18} /></button>} width={250}>
            <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 9 }}>
              {LAYERS.map((l) => (
                <label key={l.id} className="check">
                  <input type="checkbox" checked={layers.includes(l.id)} onChange={() => toggle(layers, setLayers, l.id)} />
                  <Icon name={l.icon} size={17} style={{ color: 'var(--muted)' }} /> {l.label}
                </label>
              ))}
            </div>
          </Menu>
          <Menu trigger={<button className="btn btn-outline btn-sm">Projets <Icon name="arrow_drop_down" size={18} /></button>} width={230}>
            <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 9 }}>
              {PROJECT_STATUSES.map((s) => (
                <label key={s.id} className="check">
                  <input type="checkbox" checked={statuses.includes(s.id)} onChange={() => toggle(statuses, setStatuses, s.id)} />
                  <span className="color-dot" style={{ background: s.color }} /> {s.label}
                </label>
              ))}
            </div>
          </Menu>
        </div>
        <MonthCalendar month={month} events={events} onDayDoubleClick={access.can('projets', 'modification') ? createOn : undefined} />
        <div className="legend-inline small muted" style={{ padding: '10px 16px' }}>
          <span><i style={{ fontStyle: 'italic' }}>Italique</i> : non confirmé</span>
          <span><s>Barré</s> : annulé</span>
          <span>La couleur des projets est celle de leur type</span>
        </div>
      </div>
      {creating && <NewProjectModal defaults={creating} onClose={() => setCreating(null)} />}
    </>
  )
}
