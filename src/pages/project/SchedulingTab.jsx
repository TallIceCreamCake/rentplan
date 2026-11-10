import { useState } from 'react'
import { useStore, toast } from '../../store'
import { Avatar, Empty, Field, Icon, Modal, NumInput, Toggle } from '../../components/ui'
import { DateRangeField } from '../../components/DatePicker'
import { assignmentHours, assignmentSlots, crewBusy, dailySlots, freeDays, functionFill, functionTimes, vehicleBusy } from '../../lib/model'
import { addDays, fmtMoney, fmtPeriod, fmtTime, hoursSpan, overlaps, parse, personName, toLocalInput, uid } from '../../lib/utils'
import { siblingsOf } from '../../lib/proposals'

const dayFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
/** « mar. 27 oct. · 07:00–20:00 » (fin le lendemain : « → mer. 28 · 02:00 »). */
export const slotLabel = (s) => {
  const a = parse(s.start)
  const b = parse(s.end)
  if (!a || !b) return ''
  const sameDay = a.toDateString() === b.toDateString()
  return `${dayFmt.format(a)} · ${fmtTime(s.start)}–${sameDay ? '' : `${dayFmt.format(b)} `}${fmtTime(s.end)}`
}

const INVITATIONS = { aucune: ['Non invité', '#8a929c'], invite: ['Invité', '#f0a000'], accepte: ['Accepté', '#19b26b'], refuse: ['Refusé', '#e2284f'] }

export default function SchedulingTab({ sub, idx, kind }) {
  const store = useStore()
  const isCrew = kind === 'equipe'
  const fns = (idx.fnsBySub[sub.id] || []).filter((f) => f.kind === kind)
  const fgroups = idx.fgroupsBySub[sub.id] || []
  const [selectedFn, setSelectedFn] = useState(fns.find((f) => !functionFill(f, idx).full)?.id || fns[0]?.id || null)
  const [checked, setChecked] = useState([])
  const [groupFilter, setGroupFilter] = useState('')
  const [onlyMatching, setOnlyMatching] = useState(false)
  const [onlyAvailable, setOnlyAvailable] = useState(false)
  const [editAsg, setEditAsg] = useState(null)
  const fn = idx.fn[selectedFn]
  const ft = fn ? functionTimes(fn, idx) : {}
  const resources = isCrew ? idx.d.crew.filter((c) => c.active) : idx.d.vehicles
  // Propositions sœurs (A, B…) : alternatives du même projet, jamais réalisées ensemble
  const siblings = siblingsOf(sub, idx).filter((s) => s.id !== sub.id).map((s) => s.id)

  const availability = (r) => {
    if (!fn || !ft.planStart) return { state: 'unknown', label: 'Disponibilité inconnue' }
    const mine = (idx.asgByFn[fn.id] || []).find((a) => (isCrew ? a.crewId : a.vehicleId) === r.id)
    if (mine) return mine.invitation === 'invite' ? { state: 'invited', label: 'Invité sur cette fonction' } : { state: 'planned', label: 'Planifié sur cette fonction' }
    const busy = isCrew ? crewBusy(idx, r.id, ft.planStart, ft.planEnd, null, siblings) : vehicleBusy(idx, r.id, ft.planStart, ft.planEnd, null, siblings)
    if (busy) {
      // Occupé une partie du temps seulement : libre certains jours de la fonction
      const { slots, free } = freeDays(idx, isCrew ? 'personnel' : 'vehicule', r.id, ft.planStart, ft.planEnd, null, siblings)
      if (free.length && free.length < slots.length) return { state: 'partial', label: `Libre ${free.length} jour${free.length > 1 ? 's' : ''} sur ${slots.length} (${free.map((x) => dayFmt.format(parse(x.start))).join(', ')})`, free }
    }
    if (busy?.unavailable) return { state: 'busy', label: busy.unavailable.kind === 'conge' ? 'En congé' : busy.unavailable.title || 'Indisponible' }
    if (busy) return { state: 'busy', label: `Planifié sur ${busy.project?.name}` }
    const declared = isCrew && (idx.availByCrew[r.id] || []).some((u) => u.kind === 'disponible' && overlaps(parse(u.startsAt), parse(u.endsAt), parse(ft.planStart), parse(ft.planEnd)))
    return { state: 'free', label: declared ? 'Disponible (confirmé)' : 'Disponible' }
  }
  const matching = (r) => !isCrew || !fn || [fn.name, fn.internalName, ...(fn.tags || [])].some((t) => r.functions?.includes(t) || r.tags?.includes(t))

  const assign = (ids) => {
    if (!fn) return toast('Sélectionnez d’abord une fonction à gauche', 'error')
    const already = new Set((idx.asgByFn[fn.id] || []).map((a) => (isCrew ? a.crewId : a.vehicleId)))
    const dup = ids.filter((id) => already.has(id))
    const todo = ids.filter((id) => !already.has(id))
    let partial = 0
    for (const id of todo) {
      const av = availability(resources.find((r) => r.id === id) || { id })
      const shifts = av.state === 'partial' ? av.free.map((x) => ({ id: uid('cr_'), start: x.start, end: x.end, note: '' })) : []
      if (shifts.length) partial++
      store.assign(fn.id, { ...(isCrew ? { crewId: id } : { vehicleId: id }), shifts })
    }
    if (todo.length) toast(`${todo.length} ${isCrew ? 'membre(s)' : 'véhicule(s)'} planifié(s) sur « ${fn.name} »${partial ? ` · ${partial} sur ses seuls jours libres` : ''}`)
    // Déjà dans l'équipe de la fonction : on ouvre ses créneaux plutôt que de l'affecter une seconde fois
    if (dup.length === 1 && !todo.length) {
      const a = (idx.asgByFn[fn.id] || []).find((x) => (isCrew ? x.crewId : x.vehicleId) === dup[0])
      toast('Déjà dans l’équipe de cette fonction : ajoutez-lui un créneau')
      setEditAsg(a)
    }
    setChecked([])
  }

  const communicate = () => {
    const list = idx.d.assignments.filter((a) => a.subprojectId === sub.id && a.crewId && a.invitation === 'aucune')
    list.forEach((a) => store.patch('assignments', a.id, { invitation: 'invite', visible: true }))
    toast(list.length ? `Planning communiqué à ${new Set(list.map((a) => a.crewId)).size} membre(s) du personnel` : 'Tout le monde a déjà reçu son planning')
  }

  const list = resources
    .map((r) => ({ r, av: availability(r), match: matching(r) }))
    .filter((x) => (!onlyMatching || x.match) && (!onlyAvailable || x.av.state === 'free' || x.av.state === 'partial'))
    .sort((a, b) => Number(b.match) - Number(a.match) || ['free', 'partial', 'invited', 'planned', 'unknown', 'busy'].indexOf(a.av.state) - ['free', 'partial', 'invited', 'planned', 'unknown', 'busy'].indexOf(b.av.state))

  if (!fns.length)
    return (
      <div className="card">
        <Empty icon={isCrew ? 'people' : 'local_shipping'} title={`Aucune fonction ${isCrew ? "d'équipe" : 'de transport'}`} text="Ajoutez d'abord des fonctions dans l'onglet « Équipe et transport »." />
      </div>
    )

  return (
    <div className="eq-workspace" style={{ gridTemplateColumns: 'minmax(360px, 460px) minmax(0, 1fr)' }}>
      <div className="card eq-panel">
        <div className="grid-toolbar">
          <select className="select input-sm" style={{ width: 200 }} value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} aria-label="Groupe de fonctions">
            <option value="">Tous les groupes de fonctions</option>
            {fgroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <span className="spacer" />
          {isCrew && <button className="btn btn-sm btn-primary" onClick={communicate}><Icon name="send" size={17} /> Communiquer le planning</button>}
        </div>
        <div className="eq-scroll">
          {fns
            .filter((f) => !groupFilter || f.groupId === groupFilter)
            .map((f) => {
              const t = functionTimes(f, idx)
              const fill = functionFill(f, idx)
              const asg = idx.asgByFn[f.id] || []
              return (
                <div key={f.id} className={`fn-block ${selectedFn === f.id ? 'on' : ''}`} onClick={() => setSelectedFn(f.id)}>
                  <div className={`fn-head ${fill.full ? 'full' : 'missing'}`}>
                    <Icon name={isCrew ? 'people' : 'local_shipping'} size={18} />
                    <strong>({fill.planned}/{fill.needed}) {f.internalName || f.name}</strong>
                    <span className="spacer" />
                    <span className="small">{t.planStart ? `${fmtPeriod(t.planStart, t.planEnd)}` : 'Sans horaire'}</span>
                  </div>
                  {asg.map((a) => {
                    const slots = assignmentSlots(a, idx)
                    const custom = a.shifts?.length || a.planStart || a.planEnd
                    const who = isCrew ? idx.crew[a.crewId] : idx.vehicle[a.vehicleId]
                    const inv = INVITATIONS[a.invitation] || INVITATIONS.aucune
                    return (
                      <div key={a.id} className={`asg-row ${a.visible ? '' : 'invisible'}`} onDoubleClick={() => setEditAsg(a)} title="Double-cliquez pour modifier les créneaux">
                        {isCrew ? <Avatar person={who} /> : <Icon name="local_shipping" size={18} />}
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span className="strong">{isCrew ? personName(who) : `${who?.name} (${who?.plate})`}</span>
                          {custom && (
                            <span className="asg-slots">
                              {slots.map((sl, i) => <span key={i} className="asg-slot" title={sl.note || 'Créneau'}>{slotLabel(sl)}</span>)}
                            </span>
                          )}
                        </span>
                        <button className="btn btn-ghost btn-icon btn-sm" title="Créneaux (horaires, jours)" onClick={(e) => { e.stopPropagation(); setEditAsg(a) }} aria-label="Créneaux"><Icon name="more_time" size={17} /></button>
                        {isCrew && <span className="small" style={{ color: inv[1] }}>{inv[0]}</span>}
                        <button className="btn btn-ghost btn-icon btn-sm" title={a.visible ? 'Planning visible pour le personnel' : 'Planning invisible (provisoire)'} onClick={(e) => { e.stopPropagation(); store.patch('assignments', a.id, { visible: !a.visible }) }} aria-label="Visibilité"><Icon name={a.visible ? 'visibility' : 'visibility_off'} size={17} /></button>
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={(e) => { e.stopPropagation(); store.remove('assignments', a.id) }} aria-label="Retirer"><Icon name="close" size={17} /></button>
                      </div>
                    )
                  })}
                </div>
              )
            })}
        </div>
      </div>

      <div className="card eq-panel">
        <div className="grid-toolbar">
          <strong>{isCrew ? 'Membres du personnel' : 'Véhicules'}</strong>
          {fn && <span className="small muted">pour « {fn.internalName || fn.name} » · {fmtPeriod(ft.planStart, ft.planEnd)}</span>}
          <span className="spacer" />
          {isCrew && <label className="check small"><input type="checkbox" checked={onlyMatching} onChange={(e) => setOnlyMatching(e.target.checked)} /> Étiquettes correspondantes</label>}
          <label className="check small"><input type="checkbox" checked={onlyAvailable} onChange={(e) => setOnlyAvailable(e.target.checked)} /> Disponibles</label>
          <button className="btn btn-sm btn-primary" disabled={!checked.length} onClick={() => assign(checked)}><Icon name="add" size={17} /> Ajouter</button>
        </div>
        <div className="eq-scroll">
          <div className="table-wrap">
            <table className="table table-compact">
              <thead><tr><th className="check-col" /><th>Nom</th><th>Disponibilité</th>{isCrew ? <th>Fonctions</th> : <th>Capacité</th>}<th className="num">{isCrew ? 'Tarif' : 'Tarif / jour'}</th></tr></thead>
              <tbody>
                {list.map(({ r, av, match }) => (
                  <tr key={r.id} className={`avail-${av.state}`} onDoubleClick={() => assign([r.id])} title="Double-cliquez pour planifier sur la fonction sélectionnée">
                    <td className="check-col"><input type="checkbox" checked={checked.includes(r.id)} onChange={(e) => setChecked(e.target.checked ? [...checked, r.id] : checked.filter((x) => x !== r.id))} aria-label={`Sélectionner ${isCrew ? personName(r) : r.name}`} /></td>
                    <td>
                      <span className="row">
                        {isCrew ? <Avatar person={r} /> : <Icon name="local_shipping" size={19} />}
                        <span className="strong">{isCrew ? personName(r) : r.name}</span>
                        {isCrew && match && fn && <Icon name="label" size={16} style={{ color: 'var(--primary)' }} title="Étiquettes correspondantes" />}
                      </span>
                    </td>
                    <td><span className={`avail-dot ${av.state}`} /> {av.label}</td>
                    <td className="small muted">{isCrew ? r.functions.join(', ') : `${r.capacityKg} kg · ${r.volume} m³`}</td>
                    <td className="num mono">{isCrew ? `${r.hourRate} €/h` : `${r.dayRate} €`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="grid-footer">
          <span><span className="avail-dot free" /> Disponible</span>
          <span><span className="avail-dot partial" /> Libre certains jours (planifié sur ces jours)</span>
          <span><span className="avail-dot busy" /> Indisponible / déjà planifié</span>
          <span><span className="avail-dot invited" /> Invité</span>
          <span><span className="avail-dot planned" /> Planifié sur cette fonction</span>
        </div>
      </div>

      {editAsg && <AssignmentModal asg={editAsg} idx={idx} isCrew={isCrew} onClose={() => setEditAsg(null)} />}
    </div>
  )
}

function AssignmentModal({ asg, idx, isCrew, onClose }) {
  const { patch } = useStore()
  const fn = idx.fn[asg.functionId]
  const ft = functionTimes(fn, idx)
  // Créneaux : ceux de l'affectation ; d'anciens horaires propres deviennent un créneau
  const initial = asg.shifts?.length ? asg.shifts : asg.planStart && asg.planEnd ? [{ id: uid('cr_'), start: asg.planStart, end: asg.planEnd, note: '' }] : []
  const [f, setF] = useState(asg)
  const [mode, setMode] = useState(initial.length ? 'creneaux' : 'fonction')
  const [shifts, setShifts] = useState(initial)
  const siblings = siblingsOf(idx.sub[asg.subprojectId], idx).filter((s) => s.id !== asg.subprojectId).map((s) => s.id)
  const busyOf = (sl) => (isCrew ? crewBusy(idx, asg.crewId, sl.start, sl.end, asg.id, siblings) : vehicleBusy(idx, asg.vehicleId, sl.start, sl.end, asg.id, siblings))
  const sorted = [...shifts].sort((a, b) => String(a.start).localeCompare(String(b.start)))
  const overlap = sorted.some((s, i) => i > 0 && parse(s.start) < parse(sorted[i - 1].end))
  const setShift = (id, p) => setShifts(shifts.map((x) => (x.id === id ? { ...x, ...p } : x)))
  // Nouveau créneau : le lendemain du dernier, aux mêmes horaires (sinon le premier jour de la fonction)
  const addShift = () => {
    const last = sorted[sorted.length - 1]
    const base = last || dailySlots(ft.planStart, ft.planEnd)[0] || { start: toLocalInput(new Date()), end: toLocalInput(new Date(Date.now() + 8 * 3600000)) }
    const shift = (v) => toLocalInput(addDays(parse(v), last ? 1 : 0))
    setShifts([...shifts, { id: uid('cr_'), start: shift(base.start), end: shift(base.end), note: '' }])
    setMode('creneaux')
  }
  const perDay = () => {
    const days = dailySlots(ft.planStart, ft.planEnd)
    if (!days.length) return toast('La fonction n’a pas d’horaires', 'error')
    setShifts(days.map((d) => ({ id: uid('cr_'), ...d, note: '' })))
    setMode('creneaux')
  }
  const view = mode === 'creneaux' ? sorted : assignmentSlots({ ...asg, shifts: [], planStart: null, planEnd: null }, idx)
  const hours = mode === 'creneaux' ? assignmentHours({ ...asg, shifts: sorted }, idx) : assignmentHours({ ...asg, shifts: [], planStart: null, planEnd: null }, idx)
  const rate = f.rate ?? idx.crew[asg.crewId]?.costRate ?? fn?.cost
  const save = () => {
    if (mode === 'creneaux' && !sorted.length) return toast('Ajoutez au moins un créneau, ou revenez aux horaires de la fonction', 'error')
    if (sorted.some((s) => parse(s.end) <= parse(s.start))) return toast('Un créneau se termine avant de commencer', 'error')
    if (overlap) return toast('Deux créneaux se chevauchent : fusionnez-les ou modifiez leurs horaires', 'error')
    patch('assignments', asg.id, {
      shifts: mode === 'creneaux' ? sorted : [],
      planStart: null,
      planEnd: null,
      rate: f.rate === '' ? null : f.rate,
      visible: f.visible,
      invitation: f.invitation,
      remark: f.remark,
    })
    toast(mode === 'creneaux' ? `${sorted.length} créneau${sorted.length > 1 ? 'x' : ''} enregistré${sorted.length > 1 ? 's' : ''}` : 'Horaires de la fonction')
    onClose()
  }
  return (
    <Modal
      title={`${isCrew ? personName(idx.crew[asg.crewId]) : idx.vehicle[asg.vehicleId]?.name} — ${fn?.name || ''}`}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <span className="small muted" style={{ marginRight: 'auto' }}>
            {view.length} créneau{view.length > 1 ? 'x' : ''} · {Math.round(hours * 10) / 10} h{isCrew && rate ? ` · coût ${fmtMoney(hours * rate, idx.settings.currency)}` : ''}
          </span>
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={save}>Enregistrer</button>
        </>
      }
    >
      <div className="stack" style={{ gap: 14 }}>
        <div className="asg-modes">
          <label className={`asg-mode ${mode === 'fonction' ? 'on' : ''}`}>
            <input type="radio" checked={mode === 'fonction'} onChange={() => setMode('fonction')} />
            <span><strong>Horaires de la fonction</strong><span className="muted small">{fmtPeriod(ft.planStart, ft.planEnd) || 'Sans horaire'}</span></span>
          </label>
          <label className={`asg-mode ${mode === 'creneaux' ? 'on' : ''}`}>
            <input type="radio" checked={mode === 'creneaux'} onChange={() => { if (!shifts.length) perDay(); setMode('creneaux') }} />
            <span><strong>Créneaux personnalisés</strong><span className="muted small">Plusieurs horaires, plusieurs jours, dans la même équipe</span></span>
          </label>
        </div>

        {mode === 'creneaux' && (
          <div className="asg-shifts">
            <div className="asg-shifts-head">
              <strong>Créneaux</strong>
              <span className="spacer" />
              <button type="button" className="btn btn-sm" onClick={perDay} title="Remplace les créneaux par un créneau par jour de la fonction, aux horaires de la fonction"><Icon name="calendar_view_week" size={17} /> Un par jour de la fonction</button>
              <button type="button" className="btn btn-sm btn-primary" onClick={addShift}><Icon name="add" size={17} /> Ajouter un créneau</button>
            </div>
            {sorted.length === 0 && <p className="muted small" style={{ margin: 0 }}>Aucun créneau : ajoutez-en un, ou créez-en un par jour de la fonction.</p>}
            {sorted.map((sl, i) => {
              const busy = sl.start && sl.end ? busyOf(sl) : null
              const clash = i > 0 && parse(sl.start) < parse(sorted[i - 1].end)
              return (
                <div key={sl.id} className={`asg-shift ${busy || clash ? 'warn' : ''}`}>
                  <span className="asg-shift-n">{i + 1}</span>
                  <div style={{ flex: '1 1 300px', minWidth: 0 }}>
                    <DateRangeField small start={sl.start} end={sl.end} soft={[ft.planStart, ft.planEnd]} softLabel="Horaires de la fonction" onChange={({ start, end }) => setShift(sl.id, { start, end })} aria-label={`Créneau ${i + 1}`} />
                  </div>
                  <input className="input input-sm" style={{ flex: '1 1 160px', maxWidth: 'none' }} placeholder="Note (montage, démontage…)" value={sl.note || ''} onChange={(e) => setShift(sl.id, { note: e.target.value })} aria-label={`Note du créneau ${i + 1}`} />
                  <span className="asg-shift-h">{Math.round(hoursSpan(sl.start, sl.end) * 10) / 10} h</span>
                  <button type="button" className="btn btn-ghost btn-icon btn-sm" title="Dupliquer sur le jour suivant" onClick={() => setShifts([...shifts, { id: uid('cr_'), start: toLocalInput(addDays(parse(sl.start), 1)), end: toLocalInput(addDays(parse(sl.end), 1)), note: sl.note || '' }])} aria-label="Dupliquer"><Icon name="content_copy" size={16} /></button>
                  <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setShifts(shifts.filter((x) => x.id !== sl.id))} aria-label="Supprimer le créneau"><Icon name="delete" size={17} /></button>
                  {(busy || clash) && (
                    <div className="asg-shift-msg">
                      <Icon name="warning" size={15} />
                      {clash ? 'Chevauche le créneau précédent' : busy.unavailable ? (busy.unavailable.kind === 'conge' ? 'En congé sur ce créneau' : busy.unavailable.title || 'Indisponible sur ce créneau') : `Déjà planifié sur ${busy.project?.number || ''} ${busy.project?.name || ''} (${slotLabel(busy.slot)})`}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="form-grid">
          {isCrew && <Field label="Tarif du membre (€/h)" hint="Vide = tarif de coût par défaut"><NumInput className="input input-num" value={f.rate ?? ''} onChange={(v) => setF({ ...f, rate: v })} /></Field>}
          {isCrew && (
            <Field label="Invitation">
              <select className="select" value={f.invitation} onChange={(e) => setF({ ...f, invitation: e.target.value })}>
                {Object.entries(INVITATIONS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
          )}
          <Field label="Visibilité" className="full"><Toggle checked={f.visible} onChange={(v) => setF({ ...f, visible: v })} label={f.visible ? 'Planning définitif (visible pour le personnel)' : 'Planning provisoire (invisible)'} /></Field>
          <Field label="Remarque" className="full"><textarea className="textarea" value={f.remark || ''} onChange={(e) => setF({ ...f, remark: e.target.value })} /></Field>
        </div>
        <p className="muted small" style={{ margin: 0 }}>Les créneaux comptent pour les coûts, les disponibilités, l’agenda et la feuille de route. Le prix facturé au client reste celui de la fonction.</p>
      </div>
    </Modal>
  )
}
