import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useIdx, useStore, toast } from '../store'
import { Badge, Empty, Field, Icon, Kpi, Modal, Tabs } from '../components/ui'
import { InspectionRows, RepairModal } from './EquipmentDetail'
import { fmtMoney, fmtRange, parse, startOfDay, addDays, toDateInput, toLocalInput, uid } from '../lib/utils'

export default function Maintenance() {
  const idx = useIdx()
  const store = useStore()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || 'reparations'
  const [filter, setFilter] = useState('en_cours')
  const [edit, setEdit] = useState(null)
  const [newInspection, setNewInspection] = useState(false)
  const today = startOfDay(new Date())
  const repairs = idx.d.repairs.filter((r) => filter === 'tous' || r.status === filter).sort((a, b) => String(b.startsAt).localeCompare(String(a.startsAt)))
  const inspections = [...idx.d.inspections].sort((a, b) => String(a.nextDate).localeCompare(String(b.nextDate)))
  const due = inspections.filter((i) => i.result !== 'ok' && i.nextDate && parse(i.nextDate) <= addDays(today, 30))
  const lostBookings = idx.d.bookings.filter((b) => Number(b.perdu) > 0)
  const lostSerials = idx.d.serials.filter((s) => s.status === 'perdu')

  return (
    <>
      <div className="page-header">
        <h1>Maintenance <span className="help-dot" title="Réparations, inspections périodiques et matériel perdu"><Icon name="help_outline" size={20} /></span></h1>
        <div className="actions">
          {tab === 'reparations' && <button className="btn btn-primary" onClick={() => setEdit({})}><Icon name="add" /> Réparation</button>}
          {tab === 'inspections' && <button className="btn btn-primary" onClick={() => setNewInspection(true)}><Icon name="add" /> Inspection</button>}
        </div>
      </div>
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Kpi icon="build" color="#f08c00" label="Réparations en cours" value={idx.d.repairs.filter((r) => r.status === 'en_cours').length} sub={`${idx.d.repairs.filter((r) => r.status === 'en_cours' && r.unavailable).reduce((s, r) => s + r.quantity, 0)} unité(s) indisponible(s)`} />
        <Kpi icon="fact_check" color="#e2284f" label="Inspections à prévoir (30 j)" value={due.length} />
        <Kpi icon="report" color="#5f6b7a" label="Équipements perdus" value={lostBookings.reduce((s, b) => s + Number(b.perdu), 0) + lostSerials.length} />
        <Kpi icon="euro" color="#1f87e5" label="Coût des réparations" value={fmtMoney(idx.d.repairs.reduce((s, r) => s + (Number(r.cost) || 0), 0))} />
      </div>
      <Tabs value={tab} onChange={(t) => setParams({ tab: t })} tabs={[{ id: 'reparations', label: 'Réparations', count: idx.d.repairs.filter((r) => r.status === 'en_cours').length }, { id: 'inspections', label: 'Inspections périodiques', count: due.length, warn: due.some((i) => parse(i.nextDate) < today) }, { id: 'perdus', label: 'Équipements perdus', count: lostBookings.length + lostSerials.length }]} />

      {tab === 'reparations' && (
        <div className="card">
          <div className="grid-toolbar">
            <div className="btn-group">
              {[['en_cours', 'En cours'], ['terminee', 'Terminées'], ['tous', 'Toutes']].map(([k, l]) => <button key={k} className={`btn btn-sm ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{l}</button>)}
            </div>
          </div>
          {repairs.length === 0 ? <Empty icon="build" title="Aucune réparation" /> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Numéro</th><th>Équipement</th><th>Problème</th><th className="num">Qté</th><th>Période</th><th>Indisponible</th><th>Réparateur</th><th>Statut</th><th className="num">Coût</th><th /></tr></thead>
                <tbody>
                  {repairs.map((r) => (
                    <tr key={r.id} className="clickable" onClick={() => setEdit(r)}>
                      <td className="mono">{r.number}</td>
                      <td><Link to={`/equipements/${r.equipmentId}?tab=reparations`} onClick={(e) => e.stopPropagation()}>{idx.eq[r.equipmentId]?.name}</Link>{r.serialId && <div className="small muted mono">{idx.d.serials.find((s) => s.id === r.serialId)?.serial}</div>}</td>
                      <td className="strong">{r.title}</td>
                      <td className="num">{r.quantity}</td>
                      <td className="nowrap">{fmtRange(r.startsAt, r.endsAt)}</td>
                      <td>{r.unavailable ? 'Oui' : 'Non'}</td>
                      <td>{r.repairer || '—'}</td>
                      <td><Badge color={r.status === 'en_cours' ? '#f08c00' : '#19b26b'}>{r.status === 'en_cours' ? 'En cours' : 'Terminée'}</Badge></td>
                      <td className="num mono">{fmtMoney(r.cost)}</td>
                      <td className="right" onClick={(e) => e.stopPropagation()}>{r.status === 'en_cours' && <button className="btn-link" onClick={() => { store.patch('repairs', r.id, { status: 'terminee', endsAt: toLocalInput(new Date()) }); toast('Réparation terminée : l’équipement est de nouveau disponible') }}><Icon name="task_alt" size={17} /> Terminer</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'inspections' && <div className="card">{inspections.length ? <InspectionRows list={inspections} idx={idx} showEquipment /> : <Empty icon="fact_check" title="Aucune inspection" />}</div>}

      {tab === 'perdus' && (
        <div className="card">
          {lostBookings.length + lostSerials.length === 0 ? <Empty icon="check_circle" title="Aucun équipement perdu" /> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Équipement</th><th>Projet</th><th className="num">Quantité</th><th /></tr></thead>
                <tbody>
                  {lostBookings.map((b) => (
                    <tr key={b.id}>
                      <td><Link to={`/equipements/${b.equipmentId}`}>{idx.eq[b.equipmentId]?.name}</Link></td>
                      <td>{idx.project[b.projectId]?.name}</td>
                      <td className="num">{b.perdu}</td>
                      <td className="right"><button className="btn-link" onClick={() => { store.patch('bookings', b.id, { perdu: 0, retourne: Number(b.retourne) + Number(b.perdu) }); toast('Équipement retrouvé et retourné en stock') }}><Icon name="restore" size={17} /> Retrouvé</button></td>
                    </tr>
                  ))}
                  {lostSerials.map((s) => (
                    <tr key={s.id}>
                      <td><Link to={`/equipements/${s.equipmentId}?tab=series`}>{idx.eq[s.equipmentId]?.name}</Link> <span className="mono small">{s.serial}</span></td>
                      <td className="muted">—</td>
                      <td className="num">1</td>
                      <td className="right"><button className="btn-link" onClick={() => { store.patch('serials', s.id, { status: 'ok' }); toast('Numéro de série remis en service') }}><Icon name="restore" size={17} /> Retrouvé</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {edit && <RepairModal repair={edit.id ? edit : null} onClose={() => setEdit(null)} />}
      {newInspection && <NewInspectionModal idx={idx} onClose={() => setNewInspection(false)} />}
    </>
  )
}

function NewInspectionModal({ idx, onClose }) {
  const store = useStore()
  const [f, setF] = useState({ equipmentId: '', name: '', intervalMonths: 12, nextDate: toDateInput(addDays(new Date(), 30)) })
  const save = () => {
    if (!f.equipmentId || !f.name.trim()) return toast('Choisissez un équipement et nommez l’inspection', 'error')
    store.upsert('inspections', { id: uid('ins_'), equipmentId: f.equipmentId, serialId: null, name: f.name, intervalMonths: f.intervalMonths, lastDate: null, nextDate: f.nextDate, result: 'a_faire', notes: '' })
    toast('Inspection planifiée')
    onClose()
  }
  return (
    <Modal title="Nouvelle inspection périodique" size="sm" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn btn-primary" onClick={save}>Créer</button></>}>
      <div className="form-grid">
        <Field label="Équipement" className="full">
          <select className="select" value={f.equipmentId} onChange={(e) => setF({ ...f, equipmentId: e.target.value })}><option value="">— Choisir —</option>{idx.d.equipment.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
        </Field>
        {(idx.settings.inspectionTypes || []).length > 0 && (
          <Field label="Type d’inspection" className="full" hint="Configuration › Inspections périodiques">
            <select className="select" value="" onChange={(e) => { const t = idx.settings.inspectionTypes.find((x) => x.id === e.target.value); if (t) setF({ ...f, name: t.name, intervalMonths: Number(t.intervalMonths) || 12, nextDate: toDateInput(addDays(new Date(), Math.round((Number(t.intervalMonths) || 12) * 30.4))) }) }}>
              <option value="">Choisir un type pour pré-remplir…</option>
              {idx.settings.inspectionTypes.map((t) => <option key={t.id} value={t.id}>{t.name} — tous les {t.intervalMonths} mois</option>)}
            </select>
          </Field>
        )}
        <Field label="Inspection" className="full"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex. Vérification électrique annuelle" /></Field>
        <Field label="Intervalle (mois)"><input className="input" type="number" min={1} value={f.intervalMonths} onChange={(e) => setF({ ...f, intervalMonths: Number(e.target.value) || 12 })} /></Field>
        <Field label="Prochaine échéance"><input type="date" className="input" value={f.nextDate} onChange={(e) => setF({ ...f, nextDate: e.target.value })} /></Field>
      </div>
    </Modal>
  )
}
