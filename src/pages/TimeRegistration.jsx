import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useIdx, useStore, toast } from '../store'
import { useAccess } from '../lib/auth'
import { Avatar, Badge, Empty, Field, Icon, Modal, NumInput, SelectionBar, Tabs } from '../components/ui'
import { assignmentHours, assignmentSlots, assignmentTimes } from '../lib/model'
import { addDays, daysSpan, downloadFile, fmtDate, fmtHM, fmtRange, fmtTime, hoursSpan, overlaps, parse, personName, startOfDay, startOfWeek, toCsv, toDateInput, toLocalInput, uid } from '../lib/utils'

const STATUS = { soumis: ['Soumis', '#1f87e5'], approuve: ['Approuvé', '#19b26b'], refuse: ['Refusé', '#e2284f'] }
const LEAVE = { demande: ['En attente', '#f08c00'], approuve: ['Approuvée', '#19b26b'], refuse: ['Refusée', '#e2284f'] }
const KINDS = { travail: 'Travaillé', trajet: 'Trajet', formation: 'Formation', autre: 'Autre' }
const minutes = (t) => Math.max(0, hoursSpan(t.startsAt, t.endsAt) * 60 - (Number(t.breakMinutes) || 0))

/** Nombre de jours entre le début et la fin d'un pointage (affiché « +N » après l'heure de fin). */
const nextDays = (t) => Math.round((startOfDay(parse(t.endsAt)) - startOfDay(parse(t.startsAt))) / 86400000)

export default function TimeRegistration() {
  const idx = useIdx()
  const store = useStore()
  const [week, setWeek] = useState(() => startOfWeek(new Date()))
  const [who, setWho] = useState('')
  const [status, setStatus] = useState('')
  const [params, setParams] = useSearchParams()
  // Sous-modules : Heures enregistrées, Activités planifiées, Demandes de congé
  const tab = { rapprochement: 'activites' }[params.get('tab')] || params.get('tab') || 'heures'
  const setTab = (t) => setParams({ tab: t })
  const access = useAccess()
  const [selected, setSelected] = useState([])
  const [edit, setEdit] = useState(null)
  const [leave, setLeave] = useState(null)
  const end = addDays(week, 7)
  const entries = idx.d.timeEntries
    .filter((t) => overlaps(parse(t.startsAt), parse(t.endsAt), week, end) && (!who || t.crewId === who) && (!status || t.status === status))
    .sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)))
  const byDay = new Map()
  for (const t of entries) {
    const k = t.startsAt.slice(0, 10)
    if (!byDay.has(k)) byDay.set(k, [])
    byDay.get(k).push(t)
  }
  const totalMin = entries.reduce((s, t) => s + minutes(t), 0)

  // Activités planifiées : heures prévues par activité (affectation) et heures enregistrées dessus
  const activities = idx.d.assignments
    .filter((a) => a.crewId && (!who || a.crewId === who) && idx.sub[a.subprojectId]?.status !== 'annule')
    .map((a) => ({ a, ...assignmentTimes(a, idx) }))
    .filter((x) => assignmentSlots(x.a, idx).some((t) => overlaps(parse(t.start), parse(t.end), week, end)))
    .map((x) => ({
      ...x,
      planned: assignmentHours(x.a, idx) * 60,
      registered: idx.d.timeEntries.filter((t) => t.crewId === x.a.crewId && t.functionId === x.a.functionId && t.status !== 'refuse').reduce((s, t) => s + minutes(t), 0),
    }))
    .sort((x, y) => String(x.start).localeCompare(String(y.start)))
  const leaves = idx.d.crewAvailability
    .filter((u) => u.kind === 'conge' && (!who || u.crewId === who) && (!status || u.status === status))
    .sort((a, b) => String(b.startsAt).localeCompare(String(a.startsAt)))
  const canLeave = access.can('heures', 'modification') || access.can('personnel', 'modification')

  const exportCsv = () =>
    downloadFile('heures.csv', '﻿' + toCsv([['Membre', 'Projet', 'Fonction', 'Type', 'Début', 'Fin', 'Pause (min)', 'Trajet (min)', 'Durée (h)', 'Statut'], ...entries.map((t) => [personName(idx.crew[t.crewId]), idx.project[t.projectId]?.name || '', idx.fn[t.functionId]?.name || '', KINDS[t.kind], t.startsAt.replace('T', ' '), t.endsAt.replace('T', ' '), t.breakMinutes, t.travelMinutes, (minutes(t) / 60).toFixed(2).replace('.', ','), STATUS[t.status]?.[0]])]), 'text/csv;charset=utf-8')

  return (
    <>
      <div className="page-header">
        <h1>Enregistrement horaire <span className="help-dot" title="Heures travaillées par le personnel, à approuver"><Icon name="help_outline" size={20} /></span></h1>
        <div className="actions">
          <button className="btn btn-ghost btn-icon" onClick={exportCsv} title="Exporter (CSV)" aria-label="Exporter"><Icon name="download" /></button>
          {tab === 'conges' ? (
            canLeave && <button className="btn btn-primary" onClick={() => setLeave({ crewId: who || access.crewId || idx.d.crew[0]?.id, from: toDateInput(addDays(new Date(), 7)), to: toDateInput(addDays(new Date(), 11)), title: 'Congés payés', note: '' })}><Icon name="add" /> Demande de congé</button>
          ) : <button className="btn btn-primary" onClick={() => setEdit({ id: uid('te_'), crewId: who || idx.d.crew[0]?.id, projectId: null, functionId: null, kind: 'travail', startsAt: toLocalInput(new Date(new Date().setHours(9, 0, 0, 0))), endsAt: toLocalInput(new Date(new Date().setHours(17, 0, 0, 0))), activity: '', status: 'soumis', notes: '', createdAt: new Date().toISOString(), isNew: true, breakMinutes: idx.settings.defaultBreakMinutes ?? 30, travelMinutes: idx.settings.defaultTravelMinutes ?? 0 })}><Icon name="add" /> Enregistrement horaire</button>}
        </div>
      </div>
      <div className="card">
        <div className="grid-toolbar">
          {tab !== 'conges' && (
            <>
              <div className="tl-range">
                <button onClick={() => setWeek(addDays(week, -7))} aria-label="Semaine précédente"><Icon name="chevron_left" /></button>
                <span>{fmtDate(toLocalInput(week))} – {fmtDate(toLocalInput(addDays(end, -1)))}</span>
                <button onClick={() => setWeek(addDays(week, 7))} aria-label="Semaine suivante"><Icon name="chevron_right" /></button>
              </div>
              <button className="btn btn-sm" onClick={() => setWeek(startOfWeek(new Date()))}>Cette semaine</button>
            </>
          )}
          <select className="select input-sm" style={{ width: 210 }} value={who} onChange={(e) => setWho(e.target.value)} aria-label="Membre du personnel">
            <option value="">Tout le personnel</option>
            {idx.d.crew.map((c) => <option key={c.id} value={c.id}>{personName(c)}</option>)}
          </select>
          {tab !== 'activites' && (
            <select className="select input-sm" style={{ width: 160 }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Statut">
              <option value="">Tous les statuts</option>
              {Object.entries(tab === 'conges' ? LEAVE : STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
            </select>
          )}
          <span className="spacer" />
          {tab === 'heures' && <span className="small">Total : <strong className="mono">{fmtHM(totalMin)}</strong> heures</span>}
        </div>
        <div style={{ padding: '0 16px' }}>
          <Tabs value={tab} onChange={(t) => { setStatus(''); setTab(t) }} tabs={[{ id: 'heures', label: 'Heures enregistrées', count: entries.length }, { id: 'activites', label: 'Activités planifiées', count: activities.length }, { id: 'conges', label: 'Demandes de congé', count: idx.d.crewAvailability.filter((u) => u.kind === 'conge' && u.status === 'demande').length }]} />
        </div>

        {tab === 'heures' && (
          <>
            {selected.length > 0 && (
              <SelectionBar count={selected.length} onClear={() => setSelected([])}>
                <button className="btn-link success-text" onClick={() => { selected.forEach((id) => store.patch('timeEntries', id, { status: 'approuve' })); toast(`${selected.length} enregistrement(s) approuvé(s)`); setSelected([]) }}><Icon name="check" size={17} /> Approuver</button>
                <button className="btn-link danger-text" onClick={() => { selected.forEach((id) => store.patch('timeEntries', id, { status: 'refuse' })); toast(`${selected.length} enregistrement(s) refusé(s)`); setSelected([]) }}><Icon name="close" size={17} /> Refuser</button>
              </SelectionBar>
            )}
            {entries.length === 0 ? <Empty icon="watch_later" title="Aucune heure enregistrée cette semaine" /> : (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th className="check-col" /><th>Membre</th><th>Projet / fonction</th><th>Type</th><th>Horaires</th><th className="num">Pause</th><th className="num">Trajet</th><th className="num">Durée</th><th>Statut</th><th /></tr></thead>
                  <tbody>
                    {[...byDay.entries()].map(([day, list]) => [
                      <tr key={day} className="group-row"><td colSpan={10}>{new Date(`${day}T00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} — {fmtHM(list.reduce((s, t) => s + minutes(t), 0))} heures</td></tr>,
                      ...list.map((t) => {
                        const c = idx.crew[t.crewId]
                        const [label, color] = STATUS[t.status] || STATUS.soumis
                        return (
                          <tr key={t.id} className={`clickable ${selected.includes(t.id) ? 'selected' : ''}`} onClick={() => setEdit(t)}>
                            <td className="check-col" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.includes(t.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, t.id] : selected.filter((x) => x !== t.id))} aria-label="Sélectionner" /></td>
                            <td><span className="row"><Avatar person={c} /> {personName(c)}</span></td>
                            <td>{t.projectId ? <Link to={`/projets/${t.projectId}?tab=personnel`} onClick={(e) => e.stopPropagation()}>{idx.project[t.projectId]?.name}</Link> : <span className="muted">Sans projet</span>}<div className="small muted">{idx.fn[t.functionId]?.name || t.activity}</div></td>
                            <td>{KINDS[t.kind]}</td>
                            <td className="nowrap mono">{fmtTime(t.startsAt)} – {fmtTime(t.endsAt)}{nextDays(t) > 0 ? ` (+${nextDays(t)})` : ''}</td>
                            <td className="num mono">{t.breakMinutes} min</td>
                            <td className="num mono">{t.travelMinutes} min</td>
                            <td className="num mono strong">{fmtHM(minutes(t))}</td>
                            <td><Badge color={color}>{label}</Badge></td>
                            <td className="right nowrap" onClick={(e) => e.stopPropagation()}>
                              {t.status === 'soumis' && <button className="btn btn-ghost btn-icon btn-sm" title="Approuver" onClick={() => store.patch('timeEntries', t.id, { status: 'approuve' })} aria-label="Approuver"><Icon name="check" size={18} style={{ color: 'var(--success)' }} /></button>}
                              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => store.remove('timeEntries', t.id)} aria-label="Supprimer"><Icon name="delete" size={17} /></button>
                            </td>
                          </tr>
                        )
                      }),
                    ])}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {tab === 'activites' && (
          activities.length === 0 ? <Empty icon="event_note" title="Aucune activité planifiée cette semaine" /> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Membre du personnel</th><th>Projet / activité</th><th>Planifié</th><th className="num">Heures planifiées</th><th className="num">Heures enregistrées</th><th className="num">Écart</th><th>Progression</th></tr></thead>
                <tbody>
                  {activities.map(({ a, start, end: e, planned, registered }) => {
                    const diff = registered - planned
                    const c = idx.crew[a.crewId]
                    return (
                      <tr key={a.id}>
                        <td><span className="row"><Avatar person={c} /> {personName(c)}</span></td>
                        <td><Link to={`/projets/${a.projectId}?tab=personnel`}>{idx.project[a.projectId]?.name}</Link><div className="small muted">{idx.fn[a.functionId]?.name}</div></td>
                        <td className="nowrap small">{fmtDate(start)} {fmtTime(start)} – {fmtTime(e)}{nextDays({ startsAt: start, endsAt: e }) > 0 ? ` (+${nextDays({ startsAt: start, endsAt: e })})` : ''}</td>
                        <td className="num mono">{fmtHM(planned)}</td>
                        <td className="num mono">{fmtHM(registered)}</td>
                        <td className={`num mono strong ${!registered ? 'muted' : diff > 30 ? 'warning-text' : diff < -30 ? 'danger-text' : 'success-text'}`}>{diff >= 0 ? '+' : '−'}{fmtHM(Math.abs(diff))}</td>
                        <td style={{ width: 180 }}><div className="progress"><div style={{ width: `${Math.min(100, planned ? (registered / planned) * 100 : 100)}%` }} /></div></td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot><tr><td colSpan={3}>Total</td><td className="num mono">{fmtHM(activities.reduce((s, x) => s + x.planned, 0))}</td><td className="num mono">{fmtHM(activities.reduce((s, x) => s + x.registered, 0))}</td><td colSpan={2} /></tr></tfoot>
              </table>
            </div>
          )
        )}

        {tab === 'conges' && (
          leaves.length === 0 ? <Empty icon="beach_access" title="Aucune demande de congé" /> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Membre du personnel</th><th>Période</th><th className="num">Jours</th><th>Motif</th><th>Statut</th><th /></tr></thead>
                <tbody>
                  {leaves.map((u) => {
                    const c = idx.crew[u.crewId]
                    const [label, color] = LEAVE[u.status] || LEAVE.demande
                    return (
                      <tr key={u.id}>
                        <td><span className="row"><Avatar person={c} /> {personName(c)}</span></td>
                        <td className="nowrap">{fmtRange(u.startsAt, u.endsAt)}</td>
                        <td className="num mono">{daysSpan(u.startsAt, u.endsAt)}</td>
                        <td>{u.title}{u.note && <div className="small muted">{u.note}</div>}</td>
                        <td><Badge color={color}>{label}</Badge></td>
                        <td className="right nowrap">
                          {canLeave && u.status === 'demande' && (
                            <>
                              <button className="btn-link success-text" onClick={() => { store.patch('crewAvailability', u.id, { status: 'approuve' }); toast('Congé approuvé') }}><Icon name="check" size={17} /> Approuver</button>
                              <button className="btn-link danger-text" onClick={() => { store.patch('crewAvailability', u.id, { status: 'refuse' }); toast('Congé refusé') }}><Icon name="close" size={17} /> Refuser</button>
                            </>
                          )}
                          {canLeave && <button className="btn btn-ghost btn-icon btn-sm" onClick={() => confirm('Supprimer cette demande de congé ?') && store.remove('crewAvailability', u.id)} aria-label="Supprimer"><Icon name="delete" size={17} /></button>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
      {leave && <LeaveModal value={leave} idx={idx} onClose={() => setLeave(null)} />}
      {edit && <EntryModal entry={edit} idx={idx} onClose={() => setEdit(null)} />}
    </>
  )
}

function EntryModal({ entry, idx, onClose }) {
  const store = useStore()
  const [f, setF] = useState(entry)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  // Fonctions planifiées pour ce membre autour de la date choisie
  const day = parse(f.startsAt)
  const activities = (idx.asgByCrew[f.crewId] || [])
    .map((a) => ({ a, ...assignmentTimes(a, idx) }))
    .filter((x) => x.start && day && overlaps(parse(x.start), parse(x.end), addDays(day, -2), addDays(day, 3)))
  const save = () => {
    if (parse(f.endsAt) <= parse(f.startsAt)) return toast('La fin doit être après le début', 'error')
    const { isNew, ...row } = f
    store.upsert('timeEntries', row)
    toast(isNew ? 'Heures enregistrées' : 'Enregistrement modifié')
    onClose()
  }
  return (
    <Modal title={entry.isNew ? 'Créer un enregistrement horaire' : 'Enregistrement horaire'} size="lg" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn btn-primary" onClick={save}>Enregistrer</button></>}>
      <div className="grid grid-2">
        <div className="form-grid">
          <div className="full section-title">Détails</div>
          <Field label="Membre du personnel" className="full">
            <select className="select" value={f.crewId} onChange={(e) => setF({ ...f, crewId: e.target.value, functionId: null, projectId: null })}>{idx.d.crew.map((c) => <option key={c.id} value={c.id}>{personName(c)}</option>)}</select>
          </Field>
          <Field label="Type d'enregistrement">
            <select className="select" value={f.kind} onChange={set('kind')}>{Object.entries(KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </Field>
          <Field label="Statut">
            <select className="select" value={f.status} onChange={set('status')}>{Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
          </Field>
          <Field label="De"><input type="datetime-local" className="input" value={f.startsAt} onChange={set('startsAt')} /></Field>
          <Field label="À"><input type="datetime-local" className="input" value={f.endsAt} onChange={set('endsAt')} /></Field>
          <Field label="Pause (minutes)"><NumInput className="input input-num" value={f.breakMinutes} onChange={(v) => setF({ ...f, breakMinutes: Math.round(v) })} /></Field>
          <Field label="Temps de trajet (minutes)"><NumInput className="input input-num" value={f.travelMinutes} onChange={(v) => setF({ ...f, travelMinutes: Math.round(v) })} /></Field>
          <Field label="Activité" className="full"><input className="input" value={f.activity || ''} onChange={set('activity')} placeholder="Ex. montage, réglages, démontage…" /></Field>
          <div className="full timer-box"><span className="muted">Durée travaillée (hors pause)</span><strong className="mono" style={{ fontSize: 22 }}>{fmtHM(minutes(f))}</strong></div>
        </div>
        <div>
          <div className="section-title" style={{ marginBottom: 8 }}>Activités planifiées</div>
          {activities.length === 0 && <div className="muted small">Aucune fonction planifiée pour ce membre autour de cette date.</div>}
          <div className="stack" style={{ gap: 8 }}>
            {activities.map(({ a, start, end }) => {
              const fn = idx.fn[a.functionId]
              const on = f.functionId === fn?.id
              return (
                <button key={a.id} className={`activity-card ${on ? 'on' : ''}`} onClick={() => setF({ ...f, functionId: fn?.id, projectId: a.projectId, activity: f.activity || fn?.name, startsAt: f.isNew ? start : f.startsAt, endsAt: f.isNew ? end : f.endsAt })}>
                  <div className="strong">Fonction : {fn?.name}</div>
                  <div className="small muted">Projet : {idx.project[a.projectId]?.number} {idx.project[a.projectId]?.name}</div>
                  <div className="small muted">Prévu : {fmtDate(start)} {fmtTime(start)} – {fmtTime(end)}</div>
                </button>
              )
            })}
          </div>
          {f.functionId && <button className="btn-link" style={{ marginTop: 8 }} onClick={() => setF({ ...f, functionId: null, projectId: null })}><Icon name="link_off" size={17} /> Détacher de la fonction</button>}
        </div>
      </div>
    </Modal>
  )
}

/** Jours de congé approuvés sur l'année en cours (Configuration › Enregistrement horaire › congés annuels). */
const takenDays = (idx, crewId) =>
  idx.d.crewAvailability.filter((u) => u.crewId === crewId && u.kind === 'conge' && u.status === 'approuve' && parse(u.startsAt).getFullYear() === new Date().getFullYear()).reduce((n, u) => n + daysSpan(u.startsAt, u.endsAt), 0)

function LeaveModal({ value, idx, onClose }) {
  const store = useStore()
  const [f, setF] = useState(value)
  const save = () => {
    if (!f.crewId || !f.from || !f.to || f.to < f.from) return toast('Indiquez le membre du personnel et une période valide', 'error')
    store.upsert('crewAvailability', { id: uid('ca_'), crewId: f.crewId, kind: 'conge', startsAt: `${f.from}T00:00`, endsAt: `${f.to}T23:59`, title: f.title || 'Congés', status: 'demande', note: f.note })
    toast('Demande de congé enregistrée')
    onClose()
  }
  return (
    <Modal title="Demande de congé" size="sm" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn btn-primary" onClick={save}>Envoyer la demande</button></>}>
      <div className="form-grid">
        <Field label="Membre du personnel" className="full">
          <select className="select" value={f.crewId} onChange={(e) => setF({ ...f, crewId: e.target.value })}>{idx.d.crew.map((c) => <option key={c.id} value={c.id}>{personName(c)}</option>)}</select>
        </Field>
        <div className="full small muted">Congés approuvés en {new Date().getFullYear()} : <strong>{takenDays(idx, f.crewId)}</strong> / {idx.settings.annualLeaveDays ?? 25} jours</div>
        <Field label="Du"><input type="date" className="input" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
        <Field label="Au"><input type="date" className="input" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
        <Field label="Motif" className="full"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Remarque" className="full"><textarea className="textarea" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </div>
    </Modal>
  )
}
