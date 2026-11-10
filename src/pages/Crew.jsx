import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useIdx, useRecent, useStore, toast } from '../store'
import { Avatar, Badge, ColorPicker, Empty, Field, Icon, Menu, Modal, NumInput, PALETTE, Section, SortTh, Tabs, TagInput, Toggle, sortBy } from '../components/ui'
import NotFound from './NotFound'
import { useTrackRecent } from '../components/useTrackRecent'
import { assignmentHours, assignmentSlots, assignmentTimes, crewBusy, statusOf } from '../lib/model'
import { addDays, fmtDateTime, fmtHM, fmtRange, hoursSpan, matches, parse, personName, startOfDay, toLocalInput, uid } from '../lib/utils'

export const AVAILABILITY_KINDS = {
  indisponible: { label: 'Indisponible', color: '#e2284f', icon: 'event_busy' },
  disponible: { label: 'Disponible', color: '#19b26b', icon: 'event_available' },
  conge: { label: 'Congé', color: '#f08c00', icon: 'beach_access' },
  rendezvous: { label: 'Rendez-vous', color: '#1f87e5', icon: 'event' },
}

export default function Crew() {
  const { id } = useParams()
  return id ? <CrewDetail id={id} /> : <CrewList />
}

function CrewList() {
  const idx = useIdx()
  const store = useStore()
  const navigate = useNavigate()
  const [skill, setSkill] = useState('')
  const [q, setQ] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [sort, setSort] = useState({ key: 'lastName', dir: 'asc' })
  const now = new Date()
  const today = startOfDay(now)
  const skills = idx.settings.crewSkills || []
  const rows = sortBy(
    idx.d.crew
      .filter((c) => (showInactive || c.active) && (!skill || c.functions.includes(skill)) && matches(q, personName(c), c.email, c.functions.join(' '), (c.tags || []).join(' ')))
      .map((c) => {
        const next = (idx.asgByCrew[c.id] || [])
          .flatMap((a) => assignmentSlots(a, idx).map((t) => ({ a, ...t })))
          .filter((x) => x.end && parse(x.end) >= now && idx.sub[x.a.subprojectId]?.status !== 'annule')
          .sort((a, b) => parse(a.start) - parse(b.start))[0]
        return { ...c, next, busyToday: crewBusy(idx, c.id, toLocalInput(today), toLocalInput(addDays(today, 1))) }
      }),
    sort,
  )
  const create = () => {
    const c = { id: uid('cr_'), firstName: 'Nouveau', lastName: 'membre', email: '', phone: '', functions: [], dayRate: 300, hourRate: 40, costRate: 25, color: PALETTE[idx.d.crew.length % PALETTE.length], notes: '', tags: [], active: true, city: '' }
    store.upsert('crew', c)
    navigate(`/personnel/${c.id}`)
  }
  return (
    <>
      <div className="page-header">
        <h1>Membres du personnel <span className="help-dot" title="Techniciens salariés, intermittents et freelances"><Icon name="help_outline" size={20} /></span></h1>
        <div className="actions"><button className="btn btn-primary" onClick={create}><Icon name="add" /> Membre du personnel</button></div>
      </div>
      <div className="split">
        <div className="card filter-panel">
          <div className="panel-title">Fonctions</div>
          <div className="tree">
            <button className={!skill ? 'on' : ''} onClick={() => setSkill('')}><Icon name="people" size={18} /> Tout le personnel <span className="n">{idx.d.crew.filter((c) => c.active).length}</span></button>
            {skills.map((s) => (
              <button key={s} className={skill === s ? 'on' : ''} onClick={() => setSkill(s)}><Icon name="label" size={18} /> {s} <span className="n">{idx.d.crew.filter((c) => c.active && c.functions.includes(s)).length}</span></button>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="grid-toolbar">
            <div className="search underline" style={{ width: 280 }}>
              <Icon name="search" size={19} className="icon" />
              <input className="input" placeholder="Nom, fonction, étiquette…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <label className="check small"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Afficher les inactifs</label>
          </div>
          {rows.length === 0 ? <Empty icon="people" title="Aucun membre du personnel" /> : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <SortTh label="Nom" k="lastName" sort={sort} setSort={setSort} />
                    <th>Fonctions</th>
                    <th>Téléphone</th>
                    <SortTh label="Tarif horaire" k="hourRate" sort={sort} setSort={setSort} className="num" />
                    <th>Aujourd'hui</th>
                    <th>Prochaine mission</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id} className="clickable" style={c.active ? null : { opacity: 0.55 }} onClick={() => navigate(`/personnel/${c.id}`)}>
                      <td><span className="row"><Avatar person={c} /><span><span className="strong">{personName(c)}</span><div className="small muted">{c.email}</div></span></span></td>
                      <td><span className="row wrap" style={{ gap: 4 }}>{c.functions.map((f) => <span key={f} className="tag">{f}</span>)}</span></td>
                      <td className="nowrap">{c.phone || '—'}</td>
                      <td className="num mono">{c.hourRate} €/h</td>
                      <td>{c.busyToday ? <span className="small danger-text"><span className="avail-dot busy" /> {c.busyToday.unavailable ? AVAILABILITY_KINDS[c.busyToday.unavailable.kind]?.label : c.busyToday.project?.name}</span> : <span className="small success-text"><span className="avail-dot free" /> Disponible</span>}</td>
                      <td className="small">{c.next ? <><div className="strong">{idx.project[c.next.a.projectId]?.name}</div><div className="muted">{idx.fn[c.next.a.functionId]?.name} · {fmtRange(c.next.start, c.next.end)}</div></> : <span className="muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function CrewDetail({ id }) {
  const idx = useIdx()
  const store = useStore()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [entry, setEntry] = useState(null)
  const c = idx.crew[id]
  useTrackRecent('personnel', id, !!c)
  if (!c) return <NotFound what="Ce membre du personnel" />
  const tab = params.get('tab') || 'general'
  const update = (patch) => store.patch('crew', id, patch)
  const set = (k) => (e) => update({ [k]: e.target.value })
  const avail = (idx.availByCrew[id] || []).sort((a, b) => String(b.startsAt).localeCompare(String(a.startsAt)))
  const asg = (idx.asgByCrew[id] || []).map((a) => ({ a, ...assignmentTimes(a, idx) })).sort((a, b) => String(b.start).localeCompare(String(a.start)))
  const entries = idx.d.timeEntries.filter((t) => t.crewId === id).sort((a, b) => String(b.startsAt).localeCompare(String(a.startsAt)))
  const now = new Date()

  return (
    <>
      <div className="record-header">
        <div className="title-row">
          <Avatar person={c} size="lg" />
          <h1>{personName(c)}</h1>
          <span className="status-text muted">{c.functions.join(' · ') || 'Aucune fonction'}</span>
          <div className="actions">
            <button className="btn" onClick={() => { useRecent.getState().close(`personnel:${id}`); navigate('/personnel') }}>Fermer</button>
            <Menu trigger={<button className="btn btn-icon" aria-label="Plus d'options"><Icon name="more_vert" /></button>} items={[{ icon: c.active ? 'person_off' : 'person', label: c.active ? 'Désactiver' : 'Réactiver', onClick: () => update({ active: !c.active }) }, '-', { icon: 'delete', label: 'Supprimer', danger: true, onClick: () => { if (confirm(`Supprimer ${personName(c)} ? Ses affectations seront retirées.`)) { store.remove('crew', id); store.removeWhere('assignments', (a) => a.crewId === id); navigate('/personnel') } } }]} />
          </div>
        </div>
        <Tabs
          value={tab}
          onChange={(t) => setParams({ tab: t }, { replace: true })}
          tabs={[
            { id: 'general', label: 'Général' },
            { id: 'tarifs', label: 'Fonctions et tarifs' },
            { id: 'disponibilite', label: 'Disponibilité et congés', count: avail.filter((a) => a.status === 'demande').length || null, warn: avail.some((a) => a.status === 'demande') },
            { id: 'planning', label: 'Planning', count: asg.filter((x) => parse(x.end) >= now).length },
            { id: 'heures', label: 'Heures enregistrées', count: entries.length },
          ]}
        />
      </div>

      {tab === 'general' && (
        <div className="grid grid-side" style={{ gridTemplateColumns: 'minmax(0,1fr) 340px' }}>
          <Section title="Informations personnelles">
            <div className="form-grid">
              <Field label="Prénom"><input className="input" value={c.firstName || ''} onChange={set('firstName')} /></Field>
              <Field label="Nom"><input className="input" value={c.lastName || ''} onChange={set('lastName')} /></Field>
              <Field label="E-mail"><input className="input" type="email" value={c.email || ''} onChange={set('email')} /></Field>
              <Field label="Téléphone"><input className="input" value={c.phone || ''} onChange={set('phone')} /></Field>
              <Field label="Ville"><input className="input" value={c.city || ''} onChange={set('city')} /></Field>
              <Field label="Statut"><Toggle checked={c.active} onChange={(v) => update({ active: v })} label={c.active ? 'Actif (planifiable)' : 'Inactif'} /></Field>
              <Field label="Couleur dans le planning" className="full"><ColorPicker value={c.color} onChange={(color) => update({ color })} /></Field>
              <Field label="Notes" className="full" hint="Permis, habilitations, spécialités…"><textarea className="textarea" value={c.notes || ''} onChange={set('notes')} /></Field>
            </div>
          </Section>
          <Section title="Étiquettes" icon="label">
            <p className="muted small" style={{ marginTop: 0 }}>Les étiquettes identiques à celles d'une fonction font apparaître ce membre dans « Étiquettes correspondantes ».</p>
            <TagInput value={c.tags || []} onChange={(tags) => update({ tags })} suggestions={idx.settings.crewSkills || []} />
          </Section>
        </div>
      )}

      {tab === 'tarifs' && (
        <div className="grid grid-2">
          <Section title="Fonctions">
            <div className="chips">
              {(idx.settings.crewSkills || []).map((f) => (
                <button key={f} className={`chip ${c.functions.includes(f) ? 'on' : ''}`} onClick={() => update({ functions: c.functions.includes(f) ? c.functions.filter((x) => x !== f) : [...c.functions, f], tags: c.functions.includes(f) ? (c.tags || []).filter((x) => x !== f) : [...new Set([...(c.tags || []), f])] })}>{f}</button>
              ))}
            </div>
            <p className="muted small" style={{ marginBottom: 0 }}>La liste des fonctions se gère dans Configuration.</p>
          </Section>
          <Section title="Tarifs du personnel">
            <div className="form-grid form-grid-3">
              <Field label="Tarif horaire (€)" hint="Référence pour les devis"><NumInput className="input input-num" value={c.hourRate} onChange={(v) => update({ hourRate: v })} /></Field>
              <Field label="Tarif journalier (€)"><NumInput className="input input-num" value={c.dayRate} onChange={(v) => update({ dayRate: v })} /></Field>
              <Field label="Coût horaire (€)" hint="Utilisé pour les coûts prévus"><NumInput className="input input-num" value={c.costRate} onChange={(v) => update({ costRate: v })} /></Field>
            </div>
          </Section>
        </div>
      )}

      {tab === 'disponibilite' && (
        <div className="card">
          <div className="grid-toolbar">
            <span className="muted small">Indisponibilités, disponibilités déclarées, congés et rendez-vous : utilisés par le planificateur d'équipes.</span>
            <span className="spacer" />
            <Menu
              trigger={<button className="btn btn-primary"><Icon name="add" /> Ajouter <Icon name="arrow_drop_down" /></button>}
              items={Object.entries(AVAILABILITY_KINDS).map(([k, v]) => ({ icon: v.icon, label: v.label, onClick: () => setEntry({ id: uid('ca_'), crewId: id, kind: k, startsAt: toLocalInput(addDays(startOfDay(now), 1)), endsAt: toLocalInput(addDays(startOfDay(now), 2)), title: v.label, status: k === 'conge' ? 'demande' : 'approuve', note: '', isNew: true }) }))}
            />
          </div>
          {avail.length === 0 ? <Empty icon="event_available" title="Aucune entrée" /> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Type</th><th>Titre</th><th>Période</th><th>Statut</th><th /></tr></thead>
                <tbody>
                  {avail.map((a) => {
                    const k = AVAILABILITY_KINDS[a.kind] || AVAILABILITY_KINDS.indisponible
                    return (
                      <tr key={a.id} className="clickable" onClick={() => setEntry(a)}>
                        <td><span className="row" style={{ color: k.color }}><Icon name={k.icon} size={18} /> {k.label}</span></td>
                        <td className="strong">{a.title}</td>
                        <td className="nowrap">{fmtDateTime(a.startsAt)} → {fmtDateTime(a.endsAt)}</td>
                        <td>{a.kind === 'conge' ? <Badge color={a.status === 'approuve' ? '#19b26b' : a.status === 'refuse' ? '#e2284f' : '#f08c00'}>{a.status === 'approuve' ? 'Approuvé' : a.status === 'refuse' ? 'Refusé' : 'En attente'}</Badge> : '—'}</td>
                        <td className="right nowrap" onClick={(e) => e.stopPropagation()}>
                          {a.kind === 'conge' && a.status === 'demande' && (
                            <>
                              <button className="btn-link success-text" onClick={() => { store.patch('crewAvailability', a.id, { status: 'approuve' }); toast('Congé approuvé') }}><Icon name="check" size={17} /> Approuver</button>
                              <button className="btn-link danger-text" onClick={() => { store.patch('crewAvailability', a.id, { status: 'refuse' }); toast('Congé refusé') }}><Icon name="close" size={17} /> Refuser</button>
                            </>
                          )}
                          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => store.remove('crewAvailability', a.id)} aria-label="Supprimer"><Icon name="delete" size={17} /></button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'planning' && (
        <div className="card">
          {asg.length === 0 ? <Empty icon="event" title="Aucune mission planifiée" /> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Projet</th><th>Fonction</th><th>Période</th><th className="num">Heures</th><th>Visibilité</th><th>Invitation</th><th>Statut du projet</th></tr></thead>
                <tbody>
                  {asg.map(({ a, start, end }) => {
                    const sub = idx.sub[a.subprojectId]
                    const st = statusOf(sub?.status)
                    return (
                      <tr key={a.id} className="clickable" style={parse(end) < now ? { opacity: 0.6 } : null} onClick={() => navigate(`/projets/${a.projectId}?sp=${a.subprojectId}&tab=personnel`)}>
                        <td className="strong">{idx.project[a.projectId]?.name}</td>
                        <td>{idx.fn[a.functionId]?.name}</td>
                        <td className="nowrap">
                          {fmtDateTime(start)} → {fmtDateTime(end)}
                          {a.shifts?.length > 1 && <div className="small muted">{a.shifts.length} créneaux : {assignmentSlots(a, idx).map((s) => fmtRange(s.start, s.end)).join(', ')}</div>}
                        </td>
                        <td className="num mono">{Math.round(assignmentHours(a, idx) * 10) / 10}</td>
                        <td>{a.visible ? 'Visible' : <span className="muted">Invisible</span>}</td>
                        <td>{{ aucune: 'Non invité', invite: 'Invité', accepte: 'Accepté', refuse: 'Refusé' }[a.invitation]}</td>
                        <td><Badge color={st.color}>{st.label}</Badge></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'heures' && (
        <div className="card">
          {entries.length === 0 ? <Empty icon="watch_later" title="Aucune heure enregistrée" /> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Date</th><th>Projet</th><th>Activité</th><th className="num">Durée</th><th>Statut</th></tr></thead>
                <tbody>
                  {entries.map((t) => (
                    <tr key={t.id}>
                      <td className="nowrap">{fmtDateTime(t.startsAt)}</td>
                      <td>{idx.project[t.projectId]?.name || '—'}</td>
                      <td>{t.activity}</td>
                      <td className="num mono">{fmtHM(hoursSpan(t.startsAt, t.endsAt) * 60 - (t.breakMinutes || 0))}</td>
                      <td><Badge color={t.status === 'approuve' ? '#19b26b' : t.status === 'refuse' ? '#e2284f' : '#1f87e5'}>{{ soumis: 'Soumis', approuve: 'Approuvé', refuse: 'Refusé' }[t.status]}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {entry && <AvailabilityModal entry={entry} onClose={() => setEntry(null)} />}
    </>
  )
}

function AvailabilityModal({ entry, onClose }) {
  const store = useStore()
  const [f, setF] = useState(entry)
  const save = () => {
    if (parse(f.endsAt) <= parse(f.startsAt)) return toast('La fin doit être après le début', 'error')
    const { isNew, ...row } = f
    store.upsert('crewAvailability', row)
    toast(isNew ? 'Entrée ajoutée' : 'Entrée enregistrée')
    onClose()
  }
  return (
    <Modal title={AVAILABILITY_KINDS[f.kind]?.label} size="sm" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn btn-primary" onClick={save}>Enregistrer</button></>}>
      <div className="form-grid">
        <Field label="Type" className="full">
          <select className="select" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.entries(AVAILABILITY_KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        </Field>
        <Field label="Titre" className="full"><input className="input" value={f.title || ''} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Début"><input type="datetime-local" className="input" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} /></Field>
        <Field label="Fin"><input type="datetime-local" className="input" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} /></Field>
        {f.kind === 'conge' && (
          <Field label="Statut de la demande" className="full">
            <select className="select" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="demande">En attente</option><option value="approuve">Approuvé</option><option value="refuse">Refusé</option></select>
          </Field>
        )}
        <Field label="Note" className="full"><textarea className="textarea" value={f.note || ''} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </div>
    </Modal>
  )
}
