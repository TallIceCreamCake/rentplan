import { useState } from 'react'
import { useStore, toast } from '../../store'
import { Empty, Field, Icon, Menu, Modal, NumInput, SelectionBar } from '../../components/ui'
import { DateRangeField } from '../../components/DatePicker'
import { addHours, fmtDateTime, fmtShort, hoursSpan, parse, startOfDay, addDays, toLocalInput, uid } from '../../lib/utils'

const shift = (s, hours) => (s ? toLocalInput(addHours(parse(s), hours)) : s)

export default function ScheduleTab({ project, sub, subs, idx }) {
  const store = useStore()
  const { patch, upsert } = store
  const [selected, setSelected] = useState([])
  const [timeline, setTimeline] = useState(true)
  const [shiftOpen, setShiftOpen] = useState(false)
  const periods = idx.periodsByProject[project.id] || []

  const linkedTo = (p) => {
    const groups = idx.d.equipmentGroups.filter((g) => g.planningPeriodId === p.id || g.usagePeriodId === p.id).length
    const fgroups = idx.d.functionGroups.filter((g) => g.planningPeriodId === p.id || g.usagePeriodId === p.id).length
    const fns = idx.d.functions.filter((f) => f.planningPeriodId === p.id || f.usagePeriodId === p.id).length
    return [groups && `${groups} groupe${groups > 1 ? 's' : ''} d'équipements`, fgroups && `${fgroups} groupe${fgroups > 1 ? 's' : ''} de fonctions`, fns && `${fns} fonction${fns > 1 ? 's' : ''}`].filter(Boolean).join(', ') || '—'
  }

  const addPeriod = () => {
    const base = periods.find((p) => p.isUsage) || periods[0]
    upsert('periods', { id: uid('per_'), projectId: project.id, subprojectId: null, name: 'Nouvelle période', startsAt: base?.startsAt || toLocalInput(addDays(startOfDay(new Date()), 1)), endsAt: base?.endsAt || toLocalInput(addDays(startOfDay(new Date()), 2)), isPlanning: false, isUsage: false, showInternal: true, showExternal: false, sort: periods.length })
  }

  /** Supprime des périodes en recopiant leurs horaires dans les groupes qui y étaient liés. */
  const removePeriods = (ids) => {
    const s = useStore.getState()
    const byId = Object.fromEntries(s.periods.map((p) => [p.id, p]))
    const detach = (x) => {
      const out = { ...x }
      if (ids.includes(x.planningPeriodId)) Object.assign(out, { planningPeriodId: null, planStart: byId[x.planningPeriodId].startsAt, planEnd: byId[x.planningPeriodId].endsAt })
      if (ids.includes(x.usagePeriodId)) Object.assign(out, { usagePeriodId: null, useStart: byId[x.usagePeriodId].startsAt, useEnd: byId[x.usagePeriodId].endsAt })
      return out
    }
    useStore.setState({
      equipmentGroups: s.equipmentGroups.map(detach),
      functions: s.functions.map(detach),
      functionGroups: s.functionGroups.map((g) => ({ ...g, planningPeriodId: ids.includes(g.planningPeriodId) ? null : g.planningPeriodId, usagePeriodId: ids.includes(g.usagePeriodId) ? null : g.usagePeriodId })),
      periods: s.periods.filter((p) => !ids.includes(p.id)),
    })
  }

  const setDefault = (kind) => {
    const id = selected[0]
    const p = periods.find((x) => x.id === id)
    const key = kind === 'planning' ? 'isPlanning' : 'isUsage'
    const linkKey = kind === 'planning' ? 'planningPeriodId' : 'usagePeriodId'
    const old = periods.find((x) => x[key] && x.subprojectId === p.subprojectId)
    const s = useStore.getState()
    useStore.setState({
      periods: s.periods.map((x) => (x.projectId === project.id && x.subprojectId === p.subprojectId ? { ...x, [key]: x.id === id } : x)),
      // Les groupes reliés à l'ancienne période par défaut suivent la nouvelle
      equipmentGroups: s.equipmentGroups.map((g) => (old && g[linkKey] === old.id ? { ...g, [linkKey]: id } : g)),
      functionGroups: s.functionGroups.map((g) => (old && g[linkKey] === old.id ? { ...g, [linkKey]: id } : g)),
    })
    toast(`« ${p.name} » est la période ${kind === 'planning' ? 'de planification' : "d'utilisation"} par défaut`)
  }

  const copyToCrew = () => {
    const sel = periods.filter((p) => selected.includes(p.id))
    sel.forEach((p, i) =>
      upsert('functionGroups', { id: uid('fg_'), projectId: project.id, subprojectId: sub.id, name: p.name, sort: (idx.fgroupsBySub[sub.id] || []).length + i, planningPeriodId: p.id, usagePeriodId: p.id }),
    )
    toast(`${sel.length} groupe(s) de fonctions créé(s) dans « Équipe et transport »`)
    setSelected([])
  }

  const duplicate = () => {
    const sel = periods.filter((p) => selected.includes(p.id))
    sel.forEach((p, i) => upsert('periods', { ...p, id: uid('per_'), name: `${p.name} (copie)`, isPlanning: false, isUsage: false, sort: periods.length + i }))
    setSelected([])
  }

  const sortChrono = () => {
    const sorted = [...periods].sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)))
    const s = useStore.getState()
    const rank = Object.fromEntries(sorted.map((p, i) => [p.id, i]))
    useStore.setState({ periods: s.periods.map((p) => (rank[p.id] != null ? { ...p, sort: rank[p.id] } : p)) })
  }

  // Bornes de la chronologie
  const starts = periods.map((p) => parse(p.startsAt)).filter(Boolean)
  const ends = periods.map((p) => parse(p.endsAt)).filter(Boolean)
  const t0 = starts.length ? startOfDay(new Date(Math.min(...starts))) : startOfDay(new Date())
  const t1 = ends.length ? addDays(startOfDay(new Date(Math.max(...ends))), 1) : addDays(t0, 3)
  const nDays = Math.max(1, Math.round((t1 - t0) / 86400000))
  const pct = (d) => ((parse(d) - t0) / (t1 - t0)) * 100

  return (
    <div className="stack">
      <div className="card">
        {selected.length > 0 ? (
          <SelectionBar
            count={selected.length}
            onClear={() => setSelected([])}
            right={
              <Menu
                trigger={<button className="btn btn-icon" aria-label="Plus d'options"><Icon name="more_vert" /></button>}
                items={[
                  { icon: 'file_copy', label: 'Dupliquer', onClick: duplicate },
                  selected.length === 1 && { icon: 'event_available', label: 'Période de planification par défaut', onClick: () => setDefault('planning') },
                  selected.length === 1 && { icon: 'event_note', label: "Période d'utilisation par défaut", onClick: () => setDefault('usage') },
                  '-',
                  {
                    icon: 'delete',
                    label: 'Supprimer',
                    danger: true,
                    onClick: () => {
                      if (selected.some((id) => periods.find((p) => p.id === id)?.isPlanning || periods.find((p) => p.id === id)?.isUsage) && !confirm('Une période par défaut est sélectionnée. Les groupes liés garderont leurs horaires actuels. Continuer ?')) return
                      removePeriods(selected)
                      setSelected([])
                    },
                  },
                ]}
              />
            }
          >
            <button className="btn-link" onClick={copyToCrew}><Icon name="file_copy" size={17} /> Copier vers équipe et transport</button>
            {selected.length === 1 && (
              <Menu trigger={<button className="btn-link"><Icon name="settings" size={17} /> Configurer comme période par défaut <Icon name="arrow_drop_down" size={18} /></button>} items={[{ label: 'Période de planification', onClick: () => setDefault('planning') }, { label: "Période d'utilisation", onClick: () => setDefault('usage') }]} />
            )}
          </SelectionBar>
        ) : (
          <div className="grid-toolbar">
            <button className="btn btn-primary" onClick={addPeriod}><Icon name="add" /> Ajouter un horaire</button>
            <button className="btn-link" onClick={() => setTimeline(!timeline)}><Icon name="watch_later" size={18} /> {timeline ? 'Fermer la chronologie' : 'Ouvrir la chronologie'}</button>
            <span className="spacer" />
            <button className="btn-link" onClick={() => setShiftOpen(true)}><Icon name="update" size={18} /> Décaler les horaires</button>
            <button className="btn btn-ghost btn-icon" onClick={sortChrono} title="Trier chronologiquement" aria-label="Trier chronologiquement"><Icon name="sort" /></button>
          </div>
        )}
        {periods.length === 0 ? (
          <Empty icon="schedule" title="Aucune période" text="Un projet doit avoir au moins une période de planification et une période d'utilisation." />
        ) : (
          <div className="table-wrap">
            <table className="table table-compact">
              <thead>
                <tr>
                  <th className="check-col"><input type="checkbox" checked={selected.length === periods.length} onChange={(e) => setSelected(e.target.checked ? periods.map((p) => p.id) : [])} aria-label="Tout sélectionner" /></th>
                  <th>Nom</th>
                  <th>Période</th>
                  <th>Durée</th>
                  <th>Sous-projet</th>
                  <th>Lié à</th>
                  <th title="Afficher sur les documents internes">Doc. internes</th>
                  <th title="Afficher sur les documents externes (devis, factures)">Doc. externes</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p.id} className={selected.includes(p.id) ? 'selected' : ''}>
                    <td className="check-col"><input type="checkbox" checked={selected.includes(p.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, p.id] : selected.filter((x) => x !== p.id))} aria-label={`Sélectionner ${p.name}`} /></td>
                    <td style={{ minWidth: 220 }}>
                      <input className="input input-sm" style={{ maxWidth: 'none' }} value={p.name} onChange={(e) => patch('periods', p.id, { name: e.target.value })} aria-label="Nom de la période" />
                      <div className="row" style={{ gap: 4, marginTop: 3 }}>
                        {p.isPlanning && <span className="tag tag-blue">Période de planification par défaut</span>}
                        {p.isUsage && <span className="tag tag-green">Période d'utilisation par défaut</span>}
                      </div>
                    </td>
                    <td style={{ minWidth: 330 }}>
                      <DateRangeField small start={p.startsAt} end={p.endsAt} onChange={({ start, end }) => patch('periods', p.id, { startsAt: start, endsAt: end })} aria-label={`Période : ${p.name}`} />
                    </td>
                    <td className="nowrap muted">{Math.round(hoursSpan(p.startsAt, p.endsAt) * 10) / 10} h</td>
                    <td>
                      <select className="select input-sm" style={{ maxWidth: 170 }} value={p.subprojectId || ''} onChange={(e) => patch('periods', p.id, { subprojectId: e.target.value || null })} aria-label="Sous-projet">
                        <option value="">Projet principal</option>
                        {subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </td>
                    <td className="small muted">{linkedTo(p)}</td>
                    <td className="center"><input type="checkbox" checked={!!p.showInternal} onChange={(e) => patch('periods', p.id, { showInternal: e.target.checked })} aria-label="Documents internes" /></td>
                    <td className="center"><input type="checkbox" checked={!!p.showExternal} onChange={(e) => patch('periods', p.id, { showExternal: e.target.checked })} aria-label="Documents externes" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {timeline && periods.length > 0 && (
        <div className="card">
          <div className="card-header"><span className="section-title">Chronologie du planning</span></div>
          <div className="tl" style={{ padding: '6px 0 12px' }}>
            <div style={{ minWidth: 260 + nDays * 60 }}>
              <div className="tl-row head">
                <div className="tl-label">Période</div>
                <div className="tl-days" style={{ gridTemplateColumns: `repeat(${nDays}, 1fr)` }}>
                  {Array.from({ length: nDays }, (_, i) => <div key={i}>{fmtShort(toLocalInput(addDays(t0, i)))}</div>)}
                </div>
              </div>
              {periods.map((p) => (
                <div key={p.id} className="tl-row">
                  <div className="tl-label">{p.name}</div>
                  <div className="tl-track">
                    <div className="tl-grid" style={{ gridTemplateColumns: `repeat(${nDays}, 1fr)` }}>{Array.from({ length: nDays }, (_, i) => <div key={i} />)}</div>
                    <div className={`tl-bar ${p.isUsage ? 'usage' : p.isPlanning ? 'planning' : ''}`} style={{ left: `${pct(p.startsAt)}%`, width: `${Math.max(0.5, pct(p.endsAt) - pct(p.startsAt))}%`, top: 6 }} title={`${fmtDateTime(p.startsAt)} → ${fmtDateTime(p.endsAt)}`}>
                      {fmtDateTime(p.startsAt).slice(11)} – {fmtDateTime(p.endsAt).slice(11)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {shiftOpen && <ShiftModal project={project} onClose={() => setShiftOpen(false)} />}
    </div>
  )
}

/** Décaler toutes les périodes et horaires du projet (projet reporté, avancé…). */
function ShiftModal({ project, onClose }) {
  const [days, setDays] = useState(0)
  const [hours, setHours] = useState(0)
  const apply = () => {
    const h = days * 24 + hours
    if (!h) return onClose()
    const s = useStore.getState()
    const mine = (x) => x.projectId === project.id
    useStore.setState({
      periods: s.periods.map((p) => (mine(p) ? { ...p, startsAt: shift(p.startsAt, h), endsAt: shift(p.endsAt, h) } : p)),
      equipmentGroups: s.equipmentGroups.map((g) => (mine(g) ? { ...g, planStart: shift(g.planStart, h), planEnd: shift(g.planEnd, h), useStart: shift(g.useStart, h), useEnd: shift(g.useEnd, h) } : g)),
      functions: s.functions.map((f) => (mine(f) ? { ...f, planStart: shift(f.planStart, h), planEnd: shift(f.planEnd, h), useStart: shift(f.useStart, h), useEnd: shift(f.useEnd, h) } : f)),
      assignments: s.assignments.map((a) => (mine(a) ? { ...a, planStart: shift(a.planStart, h), planEnd: shift(a.planEnd, h), shifts: (a.shifts || []).map((c) => ({ ...c, start: shift(c.start, h), end: shift(c.end, h) })) } : a)),
    })
    toast(`Horaires décalés de ${days ? `${days} jour(s) ` : ''}${hours ? `${hours} heure(s)` : ''}`)
    onClose()
  }
  return (
    <Modal
      title="Décaler les horaires du projet"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={apply}>Décaler</button>
        </>
      }
    >
      <p className="muted small" style={{ marginTop: 0 }}>Toutes les périodes, les groupes, les fonctions et le personnel planifié sont décalés. Utilisez une valeur négative pour avancer le projet.</p>
      <div className="form-grid">
        <Field label="Jours"><NumInput className="input input-num" value={days} onChange={(v) => setDays(Math.round(v))} /></Field>
        <Field label="Heures"><NumInput className="input input-num" value={hours} onChange={(v) => setHours(v)} /></Field>
      </div>
    </Modal>
  )
}
