import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useIdx, useStore, toast } from '../store'
import { Badge, Empty, Field, Icon, Modal, NumInput } from '../components/ui'
import { available } from '../lib/model'
import { addDays, fmtDateTime, fmtMoney, startOfDay, toLocalInput, uid } from '../lib/utils'

const STATUS = { nouvelle: ['Nouvelle', '#1f87e5'], acceptee: ['Projet créé', '#19b26b'], refusee: ['Refusée', '#e2284f'] }

export default function Requests() {
  const idx = useIdx()
  const store = useStore()
  const navigate = useNavigate()
  const [filter, setFilter] = useState('nouvelle')
  const [selId, setSelId] = useState(null)
  const [creating, setCreating] = useState(false)
  const list = idx.d.requests.filter((r) => filter === 'tous' || r.status === filter).sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)))
  const sel = idx.d.requests.find((r) => r.id === selId) || list[0]

  return (
    <>
      <div className="page-header">
        <h1>Demandes de location <span className="help-dot" title="Demandes de location reçues depuis votre site ou votre boutique en ligne"><Icon name="help_outline" size={20} /></span></h1>
        <div className="actions"><button className="btn btn-primary" onClick={() => setCreating(true)}><Icon name="add" /> Saisir une demande</button></div>
      </div>
      <div className="split" style={{ gridTemplateColumns: '360px minmax(0, 1fr)' }}>
        <div className="card filter-panel">
          <div className="grid-toolbar">
            <div className="btn-group">
              {[['nouvelle', 'Nouvelles'], ['acceptee', 'Traitées'], ['refusee', 'Refusées'], ['tous', 'Toutes']].map(([k, l]) => <button key={k} className={`btn btn-sm ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{l}</button>)}
            </div>
          </div>
          <div className="list">
            {list.length === 0 && <div className="empty">Aucune demande.</div>}
            {list.map((r) => (
              <div key={r.id} className={`list-item clickable ${sel?.id === r.id ? 'active-item' : ''}`} onClick={() => setSelId(r.id)}>
                <Icon name="move_to_inbox" size={20} style={{ color: r.status === 'nouvelle' ? 'var(--primary)' : 'var(--muted)' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="title">{r.eventName}</div>
                  <div className="meta">{r.company || r.contactName} · reçue le {new Date(r.receivedAt).toLocaleDateString('fr-FR')}</div>
                </div>
                <Badge color={STATUS[r.status][1]}>{STATUS[r.status][0]}</Badge>
              </div>
            ))}
          </div>
        </div>
        {sel ? (
          <div className="stack">
            <div className="card">
              <div className="card-header">
                <span className="section-title">{sel.eventName}</span>
                <div className="actions">
                  {sel.status === 'nouvelle' ? (
                    <>
                      <button className="btn btn-danger btn-sm" onClick={() => { store.patch('requests', sel.id, { status: 'refusee' }); toast('Demande refusée') }}><Icon name="close" size={17} /> Refuser</button>
                      <button className="btn btn-primary btn-sm" onClick={() => { const pid = store.convertRequest(sel.id); toast('Projet créé à partir de la demande'); navigate(`/projets/${pid}?tab=equipement`) }}><Icon name="add_task" size={17} /> Créer le projet</button>
                    </>
                  ) : sel.projectId ? (
                    <button className="btn btn-sm" onClick={() => navigate(`/projets/${sel.projectId}`)}><Icon name="launch" size={17} /> Ouvrir le projet</button>
                  ) : null}
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { if (confirm('Supprimer cette demande ?')) { store.remove('requests', sel.id); setSelId(null) } }} aria-label="Supprimer"><Icon name="delete" size={18} /></button>
                </div>
              </div>
              <div className="card-body grid grid-2">
                <div className="stack" style={{ gap: 6 }}>
                  <div className="kpi-label">Demandeur</div>
                  <div className="strong">{sel.contactName}{sel.company ? ` — ${sel.company}` : ''}</div>
                  <div>{sel.email} · {sel.phone}</div>
                </div>
                <div className="stack" style={{ gap: 6 }}>
                  <div className="kpi-label">Événement</div>
                  <div>{fmtDateTime(sel.startsAt)} → {fmtDateTime(sel.endsAt)}</div>
                  <div>{sel.venue}</div>
                </div>
                {sel.message && <div className="full note" style={{ gridColumn: '1 / -1' }}>{sel.message}</div>}
              </div>
            </div>
            <div className="card">
              <div className="card-header"><span className="section-title">Équipements demandés</span></div>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Équipement</th><th className="num">Quantité</th><th className="num">Disponible sur la période</th><th className="num">Prix / jour</th></tr></thead>
                  <tbody>
                    {(sel.items || []).map((it) => {
                      const n = available(idx, it.equipmentId, sel.startsAt, sel.endsAt)
                      return (
                        <tr key={it.equipmentId}>
                          <td>{idx.eq[it.equipmentId]?.name || it.equipmentId}</td>
                          <td className="num">{it.quantity}</td>
                          <td className="num"><span className={`avail-pill tl-seg ${n < it.quantity ? 'short' : 'ok'}`} style={{ position: 'static', borderLeft: 0 }}>{n}</span></td>
                          <td className="num mono">{fmtMoney(idx.eq[it.equipmentId]?.rentalPrice)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="card"><Empty icon="move_to_inbox" title="Aucune demande sélectionnée" /></div>
        )}
      </div>
      {creating && <NewRequestModal idx={idx} onClose={() => setCreating(false)} onCreated={setSelId} />}
    </>
  )
}

function NewRequestModal({ idx, onClose, onCreated }) {
  const store = useStore()
  const [f, setF] = useState({ contactName: '', company: '', email: '', phone: '', eventName: '', startsAt: toLocalInput(addDays(startOfDay(new Date()), 14)), endsAt: toLocalInput(addDays(startOfDay(new Date()), 15)), venue: '', message: '', items: [] })
  const [addId, setAddId] = useState('')
  const save = () => {
    if (!f.eventName.trim() || !f.contactName.trim()) return toast('Indiquez au moins le demandeur et l’événement', 'error')
    const id = uid('rq_')
    store.upsert('requests', { id, receivedAt: new Date().toISOString(), ...f, company: f.company || null, status: 'nouvelle', projectId: null })
    toast('Demande enregistrée')
    onCreated(id)
    onClose()
  }
  return (
    <Modal title="Saisir une demande de projet" size="lg" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn btn-primary" onClick={save}>Enregistrer</button></>}>
      <div className="form-grid">
        <Field label="Nom du demandeur *"><input className="input" value={f.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} /></Field>
        <Field label="Entreprise"><input className="input" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></Field>
        <Field label="E-mail"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Téléphone"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Événement *" className="full"><input className="input" value={f.eventName} onChange={(e) => setF({ ...f, eventName: e.target.value })} /></Field>
        <Field label="Début"><input type="datetime-local" className="input" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} /></Field>
        <Field label="Fin"><input type="datetime-local" className="input" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} /></Field>
        <Field label="Lieu" className="full"><input className="input" value={f.venue} onChange={(e) => setF({ ...f, venue: e.target.value })} /></Field>
        <Field label="Message" className="full"><textarea className="textarea" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></Field>
      </div>
      <div className="section-title" style={{ margin: '14px 0 8px' }}>Équipements souhaités</div>
      {f.items.map((it, i) => (
        <div key={i} className="row" style={{ marginBottom: 6 }}>
          <span style={{ flex: 1 }}>{idx.eq[it.equipmentId]?.name}</span>
          <NumInput style={{ width: 70 }} value={it.quantity} onChange={(v) => setF({ ...f, items: f.items.map((x, j) => (j === i ? { ...x, quantity: Math.max(1, Math.round(v)) } : x)) })} />
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setF({ ...f, items: f.items.filter((_, j) => j !== i) })} aria-label="Retirer"><Icon name="delete" size={17} /></button>
        </div>
      ))}
      <div className="row">
        <select className="select input-sm" style={{ maxWidth: 360 }} value={addId} onChange={(e) => setAddId(e.target.value)} aria-label="Équipement"><option value="">Ajouter un équipement…</option>{idx.d.equipment.filter((e) => e.type !== 'case').map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
        <button className="btn btn-sm" disabled={!addId} onClick={() => { setF({ ...f, items: [...f.items, { equipmentId: addId, quantity: 1 }] }); setAddId('') }}><Icon name="add" size={17} /> Ajouter</button>
      </div>
    </Modal>
  )
}
