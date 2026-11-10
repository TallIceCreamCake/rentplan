import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useIdx, useStore, toast } from '../store'
import { Empty, Field, Icon, Modal, NumInput, SortTh, TagInput, sortBy } from '../components/ui'
import { assignmentSlots, assignmentTimes, vehicleBusy } from '../lib/model'
import { addDays, fmtMoney, fmtNumber, fmtRange, matches, parse, startOfDay, toLocalInput, uid } from '../lib/utils'

export default function Vehicles() {
  const idx = useIdx()
  const store = useStore()
  const [q, setQ] = useState('')
  const [sort, setSort] = useState({ key: 'name', dir: 'asc' })
  const [edit, setEdit] = useState(null)
  const now = new Date()
  const today = startOfDay(now)
  const trips = (vid) =>
    (idx.asgByVehicle[vid] || [])
      .flatMap((a) => assignmentSlots(a, idx).map((t) => ({ a, ...t })))
      .filter((x) => x.end && parse(x.end) >= now && idx.sub[x.a.subprojectId]?.status !== 'annule')
      .sort((a, b) => parse(a.start) - parse(b.start))
  const rows = sortBy(idx.d.vehicles.filter((v) => matches(q, v.name, v.plate, v.type)), sort)

  return (
    <>
      <div className="page-header">
        <h1>Véhicules <span className="help-dot" title="Votre flotte, planifiable sur les fonctions de transport"><Icon name="help_outline" size={20} /></span></h1>
        <div className="actions"><button className="btn btn-primary" onClick={() => setEdit({ id: uid('v_'), name: '', plate: '', type: 'Camion VL', capacityKg: 1000, volume: 20, seats: 3, dayRate: 150, costPerKm: 0.5, notes: '', tags: [], isNew: true })}><Icon name="add" /> Véhicule</button></div>
      </div>
      <div className="card">
        <div className="grid-toolbar">
          <div className="search underline" style={{ width: 280 }}>
            <Icon name="search" size={19} className="icon" />
            <input className="input" placeholder="Nom, immatriculation, type…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        {rows.length === 0 ? <Empty icon="local_shipping" title="Aucun véhicule" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <SortTh label="Nom" k="name" sort={sort} setSort={setSort} />
                  <SortTh label="Immatriculation" k="plate" sort={sort} setSort={setSort} />
                  <SortTh label="Type" k="type" sort={sort} setSort={setSort} />
                  <SortTh label="Charge utile" k="capacityKg" sort={sort} setSort={setSort} className="num" />
                  <SortTh label="Volume" k="volume" sort={sort} setSort={setSort} className="num" />
                  <th className="num">Places</th>
                  <SortTh label="Tarif / jour" k="dayRate" sort={sort} setSort={setSort} className="num" />
                  <th className="num">Coût / km</th>
                  <th>Aujourd'hui</th>
                  <th>Prochaine mission</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => {
                  const next = trips(v.id)[0]
                  const busy = vehicleBusy(idx, v.id, toLocalInput(today), toLocalInput(addDays(today, 1)))
                  return (
                    <tr key={v.id} className="clickable" onClick={() => setEdit(v)}>
                      <td><span className="row"><Icon name="local_shipping" size={19} style={{ color: 'var(--primary)' }} /><span className="strong">{v.name}</span></span></td>
                      <td className="mono">{v.plate}</td>
                      <td>{v.type}</td>
                      <td className="num">{fmtNumber(v.capacityKg)} kg</td>
                      <td className="num">{v.volume} m³</td>
                      <td className="num">{v.seats}</td>
                      <td className="num mono">{fmtMoney(v.dayRate)}</td>
                      <td className="num mono">{fmtMoney(v.costPerKm)}</td>
                      <td>{busy ? <span className="small" style={{ color: '#7c3aed' }}><span className="avail-dot busy" /> En mission</span> : <span className="small success-text"><span className="avail-dot free" /> Disponible</span>}</td>
                      <td className="small">{next ? <><Link to={`/projets/${next.a.projectId}?tab=transports`} onClick={(e) => e.stopPropagation()}>{idx.project[next.a.projectId]?.name}</Link><div className="muted">{fmtRange(next.start, next.end)}</div></> : <span className="muted">—</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {edit && <VehicleModal vehicle={edit} trips={edit.isNew ? [] : trips(edit.id)} idx={idx} onClose={() => setEdit(null)} onSave={(v) => { const { isNew, ...row } = v; if (!row.name.trim()) return toast('Le nom est obligatoire', 'error'); store.upsert('vehicles', row); toast(isNew ? 'Véhicule ajouté' : 'Véhicule enregistré'); setEdit(null) }} onDelete={(id) => { if (confirm('Supprimer ce véhicule ? Ses affectations seront retirées.')) { store.remove('vehicles', id); store.removeWhere('assignments', (a) => a.vehicleId === id); setEdit(null) } }} />}
    </>
  )
}

function VehicleModal({ vehicle, trips, idx, onClose, onSave, onDelete }) {
  const [f, setF] = useState(vehicle)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const setN = (k) => (v) => setF({ ...f, [k]: v })
  return (
    <Modal
      title={vehicle.isNew ? 'Nouveau véhicule' : vehicle.name}
      size="lg"
      onClose={onClose}
      footer={
        <>
          {!vehicle.isNew && <button className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={() => onDelete(vehicle.id)}><Icon name="delete" size={18} /> Supprimer</button>}
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={() => onSave(f)}>Enregistrer</button>
        </>
      }
    >
      <div className="form-grid form-grid-3">
        <Field label="Nom *" className="full"><input className="input" autoFocus value={f.name} onChange={set('name')} /></Field>
        <Field label="Immatriculation"><input className="input mono" value={f.plate || ''} onChange={set('plate')} placeholder="AB-123-CD" /></Field>
        <Field label="Type">
          <select className="select" value={f.type || ''} onChange={set('type')}>{['Utilitaire', 'Camion VL', 'Poids lourd', 'Semi', 'Remorque', 'Voiture'].map((t) => <option key={t}>{t}</option>)}</select>
        </Field>
        <Field label="Places"><NumInput className="input input-num" value={f.seats} onChange={(v) => setF({ ...f, seats: Math.round(v) })} /></Field>
        <Field label="Charge utile (kg)"><NumInput className="input input-num" value={f.capacityKg} onChange={setN('capacityKg')} /></Field>
        <Field label="Volume (m³)"><NumInput className="input input-num" value={f.volume} onChange={setN('volume')} /></Field>
        <Field label="Tarif journalier (€)"><NumInput className="input input-num" value={f.dayRate} onChange={setN('dayRate')} /></Field>
        <Field label="Coût au km (€)"><NumInput className="input input-num" value={f.costPerKm} onChange={setN('costPerKm')} /></Field>
        <Field label="Étiquettes" className="full"><TagInput value={f.tags || []} onChange={(tags) => setF({ ...f, tags })} /></Field>
        <Field label="Notes" className="full"><textarea className="textarea" value={f.notes || ''} onChange={set('notes')} /></Field>
      </div>
      {!vehicle.isNew && (
        <>
          <div className="section-title" style={{ margin: '18px 0 8px' }}>Missions à venir</div>
          {trips.length === 0 ? <div className="muted small">Aucune mission planifiée.</div> : (
            <div className="table-wrap">
              <table className="table table-compact">
                <tbody>
                  {trips.map(({ a, start, end }) => (
                    <tr key={`${a.id}-${start}`}>
                      <td className="strong">{idx.project[a.projectId]?.name}</td>
                      <td>{idx.fn[a.functionId]?.name}</td>
                      <td className="nowrap">{fmtRange(start, end)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Modal>
  )
}
