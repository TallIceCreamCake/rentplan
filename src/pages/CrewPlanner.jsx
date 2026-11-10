import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useIdx, useStore, toast } from '../store'
import { Icon, Menu } from '../components/ui'
import { assignmentSlots, assignmentTimes, crewBusy, freeDays, functionFill, functionTimes, statusOf, vehicleBusy } from '../lib/model'
import { addDays, addHours, fmtTime, hoursSpan, matches, overlaps, parse, personName, startOfDay, startOfWeek, toLocalInput, uid } from '../lib/utils'

const SPANS = [3, 7, 14]

export default function CrewPlanner() {
  const idx = useIdx()
  const store = useStore()
  const navigate = useNavigate()
  const [span, setSpan] = useState(7)
  const [from, setFrom] = useState(() => startOfWeek(new Date()))
  const [selectedFn, setSelectedFn] = useState(null)
  const [resource, setResource] = useState('crew')
  const [q, setQ] = useState('')
  const [onlyMatching, setOnlyMatching] = useState(false)
  const [onlyAvailable, setOnlyAvailable] = useState(false)
  const [show, setShow] = useState({ full: true, confirmedOnly: false, transport: true })
  const [precise, setPrecise] = useState(false)
  const [collapsed, setCollapsed] = useState([])
  const trackRef = useRef(null)
  const [drag, setDrag] = useState(null)

  const to = addDays(from, span)
  const days = Array.from({ length: span }, (_, i) => addDays(from, i))
  const total = to - from
  const pct = (d) => ((parse(d) - from) / total) * 100
  const cols = `repeat(${span}, 1fr)`

  // Fonctions visibles sur la période, groupées par sous-projet
  const blocks = useMemo(() => {
    const out = []
    for (const f of idx.d.functions) {
      const sub = idx.sub[f.subprojectId]
      if (!sub || sub.status === 'annule' && !(idx.asgByFn[f.id] || []).length) continue
      if (show.confirmedOnly && !['confirme', 'pret', 'sur_site', 'retourne'].includes(sub.status)) continue
      if (!show.transport && f.kind === 'transport') continue
      const t = functionTimes(f, idx)
      if (!t.planStart || !overlaps(parse(t.planStart), parse(t.planEnd), from, to)) continue
      const fill = functionFill(f, idx)
      if (!show.full && fill.full) continue
      out.push({ f, sub, t, fill, asg: idx.asgByFn[f.id] || [] })
    }
    return out
  }, [idx, from, to, show]) // eslint-disable-line react-hooks/exhaustive-deps

  const bySub = new Map()
  for (const b of blocks) {
    if (!bySub.has(b.sub.id)) bySub.set(b.sub.id, [])
    bySub.get(b.sub.id).push(b)
  }
  const projects = new Map()
  for (const [sid, list] of bySub) {
    const pid = idx.sub[sid].projectId
    if (!projects.has(pid)) projects.set(pid, [])
    projects.get(pid).push({ sid, list })
  }

  const layout = (list) => {
    const lanes = []
    const placed = [...list]
      .sort((a, b) => parse(a.t.planStart) - parse(b.t.planStart))
      .map((b) => {
        const h = 34 + Math.min(b.asg.length, 4) * 19
        let lane = lanes.findIndex((l) => l.end <= parse(b.t.planStart))
        if (lane === -1) {
          lane = lanes.length
          lanes.push({ end: parse(b.t.planEnd), h })
        } else {
          lanes[lane].end = parse(b.t.planEnd)
          lanes[lane].h = Math.max(lanes[lane].h, h)
        }
        return { ...b, lane, h }
      })
    const tops = []
    let y = 6
    for (const l of lanes) {
      tops.push(y)
      y += l.h + 6
    }
    return { placed: placed.map((b) => ({ ...b, top: tops[b.lane] })), height: Math.max(48, y) }
  }

  // Déplacement d'une fonction à la souris
  const onMouseDown = (e, b) => {
    if (e.button !== 0) return
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return
    setDrag({ id: b.f.id, x0: e.clientX, width: rect.width - 260, moved: false, dx: 0 })
  }
  const onMouseMove = (e) => {
    if (!drag) return
    const dx = e.clientX - drag.x0
    setDrag({ ...drag, dx, moved: drag.moved || Math.abs(dx) > 4 })
  }
  const onMouseUp = () => {
    if (!drag) return
    if (drag.moved) {
      const hours = Math.round(((drag.dx / drag.width) * total) / 3600000 * 4) / 4
      const f = idx.fn[drag.id]
      const t = functionTimes(f, idx)
      if (hours && f) {
        const sh = (s) => toLocalInput(addHours(parse(s), hours))
        store.patch('functions', f.id, { planningPeriodId: null, usagePeriodId: null, planStart: sh(t.planStart), planEnd: sh(t.planEnd), useStart: sh(t.useStart), useEnd: sh(t.useEnd) })
        toast(`« ${f.name} » déplacée de ${hours > 0 ? '+' : ''}${hours} h (le prix du projet n'est pas modifié dans le devis existant)`)
      }
    } else setSelectedFn(drag.id === selectedFn ? null : drag.id)
    setDrag(null)
  }

  const sel = idx.fn[selectedFn]
  const selT = sel ? functionTimes(sel, idx) : null
  const resources = resource === 'crew' ? idx.d.crew.filter((c) => c.active) : resource === 'vehicles' ? idx.d.vehicles : []
  const resourceRows = resources
    .filter((r) => matches(q, resource === 'crew' ? personName(r) : r.name, r.functions?.join(' '), r.tags?.join(' ')))
    .map((r) => {
      const isCrew = resource === 'crew'
      const busy = sel && selT?.planStart ? (isCrew ? crewBusy(idx, r.id, selT.planStart, selT.planEnd) : vehicleBusy(idx, r.id, selT.planStart, selT.planEnd)) : null
      const match = isCrew && sel ? [sel.name, sel.internalName, ...(sel.tags || [])].some((t) => r.functions?.includes(t) || r.tags?.includes(t)) : false
      const asg = (isCrew ? idx.asgByCrew[r.id] : idx.asgByVehicle[r.id]) || []
      const items = asg.flatMap((a) => assignmentSlots(a, idx).map((t) => ({ a, ...t }))).filter((x) => overlaps(parse(x.start), parse(x.end), from, to) && idx.sub[x.a.subprojectId]?.status !== 'annule')
      const hours = items.reduce((s, x) => s + Math.min(hoursSpan(x.start, x.end), 24 * span), 0)
      return { r, busy, match, items, hours }
    })
    .filter((x) => (!onlyMatching || x.match) && (!onlyAvailable || !x.busy))
  const unscheduled = idx.d.functions.filter((f) => !functionTimes(f, idx).planStart)

  const assign = (r) => {
    if (!sel) return toast('Sélectionnez d’abord une fonction dans le planning', 'error')
    const isCrew = resource === 'crew'
    if ((idx.asgByFn[sel.id] || []).some((a) => (isCrew ? a.crewId : a.vehicleId) === r.id)) return toast('Déjà planifié sur cette fonction', 'error')
    if ((sel.kind === 'transport') !== !isCrew) return toast(isCrew ? 'Cette fonction attend un véhicule' : 'Cette fonction attend un membre du personnel', 'error')
    // Occupé une partie de la fonction : planifié sur ses seuls jours libres (créneaux)
    const { slots, free } = selT?.planStart ? freeDays(idx, isCrew ? 'personnel' : 'vehicule', r.id, selT.planStart, selT.planEnd) : { slots: [], free: [] }
    const shifts = free.length && free.length < slots.length ? free.map((x) => ({ id: uid('cr_'), start: x.start, end: x.end, note: '' })) : []
    store.assign(sel.id, { ...(isCrew ? { crewId: r.id } : { vehicleId: r.id }), shifts })
    toast(`${isCrew ? personName(r) : r.name} planifié(e) sur « ${sel.name} »${shifts.length ? ` · ${shifts.length} jour${shifts.length > 1 ? 's' : ''} libre${shifts.length > 1 ? 's' : ''} sur ${slots.length}` : ''}`)
  }

  const dayTotals = days.map((d) => {
    const d1 = addDays(d, 1)
    let planned = 0
    let needed = 0
    for (const b of blocks) {
      if (!overlaps(parse(b.t.planStart), parse(b.t.planEnd), d, d1)) continue
      planned += Math.min(b.fill.planned, b.fill.needed)
      needed += b.fill.needed
    }
    return { planned, needed }
  })
  const dayLabel = (d) => d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: span > 7 ? undefined : 'short' })
  const now = new Date()

  return (
    <div onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={() => setDrag(null)} style={{ userSelect: drag ? 'none' : undefined }}>
      <div className="page-header">
        <h1>Planificateur d'équipes <span className="help-dot" title="Toutes les fonctions d'équipe et de transport de vos projets"><Icon name="help_outline" size={20} /></span></h1>
        <div className="planner-nav">
          <span className="date-box"><Icon name="event" size={18} /> {from.toLocaleDateString('fr-FR', { day: 'numeric' })} - {addDays(to, -1).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
          <button className="btn btn-ghost btn-icon" onClick={() => setFrom(addDays(from, -span))} aria-label="Période précédente"><Icon name="first_page" /></button>
          <button className="btn btn-ghost btn-icon" onClick={() => setFrom(addDays(from, -1))} aria-label="Jour précédent"><Icon name="chevron_left" /></button>
          <button className="btn btn-ghost btn-sm" onClick={() => setFrom(startOfWeek(new Date()))}>Aujourd'hui</button>
          <button className="btn btn-ghost btn-icon" onClick={() => setFrom(addDays(from, 1))} aria-label="Jour suivant"><Icon name="chevron_right" /></button>
          <button className="btn btn-ghost btn-icon" onClick={() => setFrom(addDays(from, span))} aria-label="Période suivante"><Icon name="last_page" /></button>
          <button className="btn btn-ghost btn-icon" onClick={() => setSpan(SPANS[Math.min(SPANS.length - 1, SPANS.indexOf(span) + 1)])} aria-label="Dézoomer"><Icon name="remove" /></button>
          <button className="btn btn-ghost btn-icon" onClick={() => setSpan(SPANS[Math.max(0, SPANS.indexOf(span) - 1)])} aria-label="Zoomer"><Icon name="add" /></button>
        </div>
        <div className="actions">
          <Menu
            trigger={<button className="btn btn-primary">Inviter et envoyer <Icon name="arrow_drop_down" /></button>}
            items={[
              {
                icon: 'send',
                label: 'Envoyer le planning de la période',
                onClick: () => {
                  const list = idx.d.assignments.filter((a) => a.crewId && a.invitation === 'aucune' && overlaps(parse(assignmentTimes(a, idx).start), parse(assignmentTimes(a, idx).end), from, to))
                  list.forEach((a) => store.patch('assignments', a.id, { invitation: 'invite', visible: true }))
                  toast(list.length ? `Planning envoyé à ${new Set(list.map((a) => a.crewId)).size} membre(s)` : 'Aucun nouveau planning à envoyer')
                },
              },
              {
                icon: 'visibility',
                label: 'Rendre visible tout le planning de la période',
                onClick: () => {
                  const list = idx.d.assignments.filter((a) => !a.visible && overlaps(parse(assignmentTimes(a, idx).start), parse(assignmentTimes(a, idx).end), from, to))
                  list.forEach((a) => store.patch('assignments', a.id, { visible: true }))
                  toast(`${list.length} planification(s) rendue(s) visible(s)`)
                },
              },
            ]}
          />
        </div>
      </div>

      <div className="card planner-card">
        <div className="grid-toolbar">
          <Menu
            width={300}
            trigger={<button className="btn btn-sm"><Icon name="visibility" size={18} /> Afficher <Icon name="arrow_drop_down" size={18} /></button>}
          >
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 9 }}>
              <label className="check"><input type="checkbox" checked={show.full} onChange={(e) => setShow({ ...show, full: e.target.checked })} /> Fonctions entièrement planifiées</label>
              <label className="check"><input type="checkbox" checked={show.transport} onChange={(e) => setShow({ ...show, transport: e.target.checked })} /> Fonctions de transport</label>
              <label className="check"><input type="checkbox" checked={show.confirmedOnly} onChange={(e) => setShow({ ...show, confirmedOnly: e.target.checked })} /> Projets confirmés uniquement</label>
            </div>
          </Menu>
          <label className="check small"><input type="checkbox" checked={precise} onChange={(e) => setPrecise(e.target.checked)} /> Vue précise</label>
          <span className="spacer" />
          <span className="legend-inline"><i className="fnb full" /> Entièrement planifiée <i className="fnb missing" /> À pourvoir <i className="fnb invisible" /> Invisible</span>
        </div>

        <div className="planner" ref={trackRef}>
          <div style={{ minWidth: 260 + span * (precise ? 160 : 110) }}>
            <div className="tl-row head sticky-head">
              <div className="tl-label strong">Projets</div>
              <div className="tl-days" style={{ gridTemplateColumns: cols }}>
                {days.map((d) => <div key={d.toISOString()} className={startOfDay(d).getTime() === startOfDay(now).getTime() ? 'today-col' : ''}>{dayLabel(d)}{precise && <div className="hours-scale"><span>06</span><span>12</span><span>18</span></div>}</div>)}
              </div>
            </div>
            {[...projects.entries()].map(([pid, subs]) => {
              const p = idx.project[pid]
              const isCol = collapsed.includes(pid)
              return (
                <div key={pid}>
                  <div className="tl-row project-row">
                    <div className="tl-label">
                      <button className="caret-btn" onClick={() => setCollapsed(isCol ? collapsed.filter((x) => x !== pid) : [...collapsed, pid])} aria-label={isCol ? 'Déplier' : 'Replier'}><Icon name={isCol ? 'arrow_right' : 'arrow_drop_down'} /></button>
                      <span className="dot-status" style={{ background: p.color || idx.type[p.typeId]?.color || '#8a929c' }} />
                      <button className="link-name strong" onClick={() => navigate(`/projets/${pid}?tab=personnel`)} title="Ouvrir le projet">{p.name}</button>
                    </div>
                    <div className="tl-track" />
                  </div>
                  {!isCol &&
                    subs.map(({ sid, list }) => {
                      const { placed, height } = layout(list)
                      const sub = idx.sub[sid]
                      return (
                        <div key={sid} className="tl-row" style={{ minHeight: height }}>
                          <div className="tl-label indent small">
                            <span className="dot-status" style={{ background: statusOf(sub.status).color }} title={statusOf(sub.status).label} />
                            {(idx.subsByProject[pid] || []).length > 1 ? sub.name : statusOf(sub.status).label}
                          </div>
                          <div className="tl-track">
                            <div className="tl-grid" style={{ gridTemplateColumns: cols }}>{days.map((d) => <div key={d.toISOString()} className={[0, 6].includes(d.getDay()) ? 'we' : ''} />)}</div>
                            {now >= from && now < to && <div className="now-line" style={{ left: `${pct(toLocalInput(now))}%` }} />}
                            {placed.map((b) => {
                              const dx = drag?.id === b.f.id && drag.moved ? drag.dx : 0
                              const invisible = b.asg.some((a) => !a.visible)
                              const cls = `fn-card ${b.fill.full ? 'full' : 'missing'} ${invisible ? 'invisible' : ''} ${selectedFn === b.f.id ? 'selected' : ''}`
                              return (
                                <div
                                  key={b.f.id}
                                  className={cls}
                                  style={{ left: `calc(${Math.max(0, pct(b.t.planStart))}% + ${dx}px)`, width: `${Math.max(2.5, Math.min(100, pct(b.t.planEnd)) - Math.max(0, pct(b.t.planStart)))}%`, top: b.top, height: b.h }}
                                  onMouseDown={(e) => onMouseDown(e, b)}
                                  title={`${b.f.name} · ${idx.project[b.f.projectId]?.name}\n${fmtTime(b.t.planStart)} – ${fmtTime(b.t.planEnd)} · glisser pour déplacer`}
                                >
                                  <div className="fn-title">
                                    <Icon name={b.f.kind === 'transport' ? 'local_shipping' : 'people'} size={15} />
                                    <span>({b.fill.planned}/{b.fill.needed}) {b.f.internalName || b.f.name}</span>
                                  </div>
                                  <div className="fn-time">{fmtTime(b.t.planStart)} - {fmtTime(b.t.planEnd)}</div>
                                  {b.asg.slice(0, 4).map((a) => (
                                    <div key={a.id} className={`fn-asg ${a.visible ? '' : 'invisible'} ${a.invitation === 'invite' ? 'invited' : ''}`}>
                                      {a.crewId ? personName(idx.crew[a.crewId]) : idx.vehicle[a.vehicleId]?.name}
                                    </div>
                                  ))}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                </div>
              )
            })}
            {!projects.size && <div className="empty">Aucune fonction planifiée sur cette période.</div>}
            <div className="tl-row total-row">
              <div className="tl-label strong">Total</div>
              <div className="tl-days" style={{ gridTemplateColumns: cols }}>
                {dayTotals.map((t, i) => <div key={i}><span className={`total-pill ${t.needed && t.planned >= t.needed ? 'ok' : t.needed ? 'bad' : ''}`}>{t.planned}/{t.needed}</span></div>)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card planner-card" style={{ marginTop: 16 }}>
        <div className="grid-toolbar">
          <select className="select input-sm res-select" value={resource} onChange={(e) => setResource(e.target.value)} aria-label="Ressources">
            <option value="crew">MEMBRES DU PERSONNEL</option>
            <option value="vehicles">VÉHICULES</option>
            <option value="unscheduled">FONCTIONS NON PLANIFIÉES</option>
          </select>
          <div className="search underline" style={{ width: 200 }}>
            <Icon name="search" size={18} className="icon" />
            <input className="input" placeholder="Recherche rapide" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {resource === 'crew' && <label className="check small"><input type="checkbox" checked={onlyMatching} onChange={(e) => setOnlyMatching(e.target.checked)} /> Étiquettes correspondantes</label>}
          <label className="check small"><input type="checkbox" checked={onlyAvailable} onChange={(e) => setOnlyAvailable(e.target.checked)} /> Disponibles</label>
          <span className="spacer" />
          {sel ? <span className="small">Fonction sélectionnée : <strong>{sel.name}</strong> ({idx.project[sel.projectId]?.name}) — double-cliquez sur une ressource pour la planifier</span> : <span className="small muted">Cliquez sur une fonction dans le planning pour la sélectionner</span>}
        </div>
        {resource === 'unscheduled' ? (
          <div className="list">
            {unscheduled.length === 0 && <div className="empty">Toutes les fonctions ont des horaires.</div>}
            {unscheduled.map((f) => (
              <div key={f.id} className="list-item clickable" onClick={() => navigate(`/projets/${f.projectId}?tab=equipe`)}>
                <Icon name={f.kind === 'transport' ? 'local_shipping' : 'people'} size={19} />
                <div><div className="title">{f.name}</div><div className="meta">{idx.project[f.projectId]?.name}</div></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="planner">
            <div style={{ minWidth: 260 + span * (precise ? 160 : 110) }}>
              {resourceRows.map(({ r, busy, match, items, hours }) => {
                const isCrew = resource === 'crew'
                const unav = isCrew ? idx.availByCrew[r.id] || [] : []
                return (
                  <div key={r.id} className={`tl-row res-row ${sel ? (busy ? 'res-busy' : 'res-free') : ''}`} onDoubleClick={() => assign(r)} title={sel ? 'Double-cliquez pour planifier sur la fonction sélectionnée' : undefined}>
                    <div className="tl-label">
                      <div style={{ minWidth: 0 }}>
                        <div className="strong row" style={{ gap: 6 }}>
                          {isCrew ? personName(r) : r.name}
                          {match && <Icon name="label" size={15} style={{ color: 'var(--primary)' }} title="Étiquettes correspondantes" />}
                          {sel && <span className={`avail-dot ${busy ? 'busy' : 'free'}`} title={busy ? (busy.unavailable ? 'Indisponible' : `Déjà planifié : ${busy.project?.name}`) : 'Disponible'} />}
                        </div>
                        <div className="small muted">{Math.round(hours * 10) / 10} h planifiées</div>
                      </div>
                    </div>
                    <div className="tl-track">
                      <div className="tl-grid" style={{ gridTemplateColumns: cols }}>
                        {days.map((d) => {
                          const d1 = addDays(d, 1)
                          const off = unav.find((u) => u.kind !== 'disponible' && u.kind !== 'rendezvous' && (u.kind !== 'conge' || u.status === 'approuve') && overlaps(parse(u.startsAt), parse(u.endsAt), d, d1))
                          const on = unav.find((u) => u.kind === 'disponible' && overlaps(parse(u.startsAt), parse(u.endsAt), d, d1))
                          return <div key={d.toISOString()} className={`${[0, 6].includes(d.getDay()) ? 'we' : ''} ${off ? 'unav' : on ? 'av' : ''}`} title={off ? off.title || 'Indisponible' : on ? 'Disponible' : undefined} />
                        })}
                      </div>
                      {unav.filter((u) => u.kind === 'rendezvous' && overlaps(parse(u.startsAt), parse(u.endsAt), from, to)).map((u) => (
                        <div key={u.id} className="res-item appt" style={{ left: `${Math.max(0, pct(u.startsAt))}%`, width: `${Math.max(1.5, pct(u.endsAt) - Math.max(0, pct(u.startsAt)))}%` }} title={u.title}><Icon name="event" size={13} /> {u.title}</div>
                      ))}
                      {items.map(({ a, start, end }) => {
                        const f = idx.fn[a.functionId]
                        return (
                          <div key={`${a.id}-${start}`} className={`res-item ${a.visible ? '' : 'invisible'}`} style={{ left: `${Math.max(0, pct(start))}%`, width: `${Math.max(1.5, Math.min(100, pct(end)) - Math.max(0, pct(start)))}%` }} onClick={() => setSelectedFn(f?.id)} title={`${f?.name} · ${idx.project[a.projectId]?.name}`}>
                            <Icon name={f?.kind === 'transport' ? 'local_shipping' : 'people'} size={13} /> {f?.name} ({idx.project[a.projectId]?.name})
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
