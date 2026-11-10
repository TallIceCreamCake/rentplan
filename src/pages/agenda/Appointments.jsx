import { useState } from 'react'
import { useIdx, useStore, toast } from '../../store'
import { useAccess } from '../../lib/auth'
import { Avatar, Empty, Field, Icon, Modal } from '../../components/ui'
import { addDays, fmtDate, fmtHM, fmtTime, hoursSpan, parse, personName, startOfDay, toLocalInput, uid } from '../../lib/utils'

/** Mon agenda › Rendez-vous : les rendez-vous du personnel (visites techniques, réunions…). */
export default function Appointments() {
  const idx = useIdx()
  const store = useStore()
  const access = useAccess()
  const seesOthers = access.can('personnel') || access.can('planificateur')
  const canEdit = access.canEditCollection('crewAvailability')
  const [scope, setScope] = useState(access.crewId ? 'mes' : 'tous')
  const [period, setPeriod] = useState('avenir')
  const [edit, setEdit] = useState(null)
  const now = new Date()
  const mineOnly = scope === 'mes' || !seesOthers
  const list = idx.d.crewAvailability
    .filter((u) => u.kind === 'rendezvous' && (!mineOnly || u.crewId === access.crewId))
    .filter((u) => (period === 'avenir' ? parse(u.endsAt) >= now : parse(u.endsAt) < now))
    .sort((a, b) => (period === 'avenir' ? 1 : -1) * String(a.startsAt).localeCompare(String(b.startsAt)))

  const blank = () => {
    const s = addDays(startOfDay(now), 1)
    s.setHours(10, 0, 0, 0)
    return { id: uid('ca_'), crewId: access.crewId || idx.d.crew[0]?.id, kind: 'rendezvous', startsAt: toLocalInput(s), endsAt: toLocalInput(new Date(s.getTime() + 3600000)), title: '', status: 'approuve', note: '', isNew: true }
  }

  return (
    <>
      <div className="page-header">
        <h1>Rendez-vous <span className="help-dot" title="Rendez-vous des membres du personnel, affichés dans leur agenda et dans le planificateur"><Icon name="help_outline" size={20} /></span></h1>
        <div className="actions">{canEdit && <button className="btn btn-primary" onClick={() => setEdit(blank())}><Icon name="add" /> Rendez-vous</button>}</div>
      </div>
      <div className="card">
        <div className="grid-toolbar">
          <div className="btn-group">
            {[['avenir', 'À venir'], ['passes', 'Passés']].map(([k, l]) => <button key={k} className={`btn btn-sm ${period === k ? 'on' : ''}`} onClick={() => setPeriod(k)}>{l}</button>)}
          </div>
          {seesOthers && (
            <select className="select input-sm" style={{ width: 200 }} value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Rendez-vous affichés">
              {access.crewId && <option value="mes">Mes rendez-vous</option>}
              <option value="tous">Tous les rendez-vous</option>
            </select>
          )}
          <span className="spacer" />
          <span className="muted small">{list.length} rendez-vous</span>
        </div>
        {mineOnly && !access.crewId ? (
          <Empty icon="link_off" title="Compte non lié" text="Votre compte n’est lié à aucun membre du personnel : un administrateur peut le lier dans Configuration › Utilisateurs." />
        ) : list.length === 0 ? (
          <Empty icon="event" title={period === 'avenir' ? 'Aucun rendez-vous à venir' : 'Aucun rendez-vous passé'} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Rendez-vous</th><th>Membre du personnel</th><th>Date</th><th>Horaires</th><th className="num">Durée</th><th /></tr></thead>
              <tbody>
                {list.map((u) => (
                  <tr key={u.id} className={canEdit ? 'clickable' : ''} onClick={() => canEdit && setEdit(u)}>
                    <td><div className="strong">{u.title}</div>{u.note && <div className="small muted">{u.note}</div>}</td>
                    <td><span className="row"><Avatar person={idx.crew[u.crewId]} /> {personName(idx.crew[u.crewId])}</span></td>
                    <td className="nowrap">{fmtDate(u.startsAt)}</td>
                    <td className="nowrap mono">{fmtTime(u.startsAt)} – {fmtTime(u.endsAt)}</td>
                    <td className="num mono">{fmtHM(hoursSpan(u.startsAt, u.endsAt) * 60)}</td>
                    <td className="right" onClick={(e) => e.stopPropagation()}>
                      {canEdit && <button className="btn btn-ghost btn-icon btn-sm" onClick={() => confirm(`Supprimer « ${u.title} » ?`) && store.remove('crewAvailability', u.id)} aria-label="Supprimer"><Icon name="delete" size={17} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {edit && <AppointmentModal value={edit} idx={idx} onClose={() => setEdit(null)} />}
    </>
  )
}

function AppointmentModal({ value, idx, onClose }) {
  const store = useStore()
  const [f, setF] = useState(value)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const save = () => {
    if (!f.title.trim()) return toast('Donnez un titre au rendez-vous', 'error')
    if (!f.startsAt || !f.endsAt || f.endsAt <= f.startsAt) return toast('La fin doit être après le début', 'error')
    const { isNew: _n, ...row } = f
    store.upsert('crewAvailability', row)
    toast(value.isNew ? 'Rendez-vous ajouté' : 'Rendez-vous modifié')
    onClose()
  }
  return (
    <Modal title={value.isNew ? 'Nouveau rendez-vous' : 'Rendez-vous'} size="sm" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn btn-primary" onClick={save}>Enregistrer</button></>}>
      <div className="form-grid">
        <Field label="Titre" className="full"><input className="input" value={f.title} onChange={set('title')} autoFocus placeholder="Ex. Visite technique au Zénith" /></Field>
        <Field label="Membre du personnel" className="full">
          <select className="select" value={f.crewId} onChange={set('crewId')}>{idx.d.crew.map((c) => <option key={c.id} value={c.id}>{personName(c)}</option>)}</select>
        </Field>
        <Field label="Début"><input type="datetime-local" className="input" value={f.startsAt} onChange={set('startsAt')} /></Field>
        <Field label="Fin"><input type="datetime-local" className="input" value={f.endsAt} onChange={set('endsAt')} /></Field>
        <Field label="Lieu / remarque" className="full"><textarea className="textarea" value={f.note} onChange={set('note')} /></Field>
      </div>
    </Modal>
  )
}
