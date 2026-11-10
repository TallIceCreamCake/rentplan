import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore, toast } from '../store'
import { Field, Icon, Modal, NumInput } from './ui'
import { DateRangeField, readDate } from './DatePicker'
import { contactName, fmtMoney, round2, toLocalInput, uid } from '../lib/utils'

export const SUBRENT_STATUSES = [
  { id: 'demande', label: 'Demande', color: '#8a929c' },
  { id: 'confirme', label: 'Confirmée', color: '#19b26b' },
  { id: 'recu', label: 'Reçue', color: '#1f87e5' },
  { id: 'retourne', label: 'Retournée', color: '#5f6b7a' },
  { id: 'annule', label: 'Annulée', color: '#e2284f' },
]

/** Période de planification d'un projet (pour se repérer en choisissant celle de la sous-location). */
function projectSpan(store, projectId) {
  const periods = store.periods.filter((p) => p.projectId === projectId && p.isPlanning)
  const starts = periods.map((p) => readDate(p.startsAt)).filter(Boolean)
  const ends = periods.map((p) => readDate(p.endsAt)).filter(Boolean)
  return starts.length && ends.length ? [new Date(Math.min(...starts)), new Date(Math.max(...ends))] : undefined
}

/** Création / modification d'une sous-location (résout les pénuries). */
export default function SubrentModal({ subrent, defaults = {}, onClose }) {
  const store = useStore()
  const navigate = useNavigate()
  const suppliers = store.contacts.filter((c) => c.type === 'fournisseur')
  const [f, setF] = useState(() => {
    const init = subrent || { supplierId: suppliers[0]?.id || null, projectId: null, status: 'demande', startsAt: '', endsAt: '', lines: [], notes: '', ...defaults }
    // Le fournisseur proposé doit exister (sinon la base refuse l'enregistrement)
    const span = !init.startsAt && init.projectId ? projectSpan(store, init.projectId) : null
    return {
      ...init,
      supplierId: suppliers.some((c) => c.id === init.supplierId) ? init.supplierId : suppliers[0]?.id || null,
      lines: init.lines || [],
      // Par défaut, la période de planification du projet
      ...(span ? { startsAt: toLocalInput(span[0]), endsAt: toLocalInput(span[1]) } : {}),
    }
  })
  const [addId, setAddId] = useState('')
  const [newSupplier, setNewSupplier] = useState(null)
  const setLine = (i, patch) => setF({ ...f, lines: f.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) })
  const total = round2(f.lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.price) || 0), 0))
  const rentable = store.equipment.filter((e) => e.kind !== 'vente' && e.type !== 'kit')
  const project = store.projects.find((p) => p.id === f.projectId)

  const createSupplier = () => {
    const name = newSupplier?.trim()
    if (!name) return toast('Indiquez le nom du fournisseur', 'error')
    const id = uid('c_')
    store.upsert('contacts', { id, type: 'fournisseur', isCompany: true, company: name, firstName: '', lastName: '', email: '', phone: '', website: '', address: '', zip: '', city: '', country: store.settings.country || 'France', vatNumber: '', discountEquipment: 0, discountCrew: 0, paymentTermDays: null, notes: '', tags: [], createdAt: new Date().toISOString() })
    setF({ ...f, supplierId: id })
    setNewSupplier(null)
    toast(`Fournisseur « ${name} » créé`)
  }

  const save = (withPo) => {
    const lines = f.lines.filter((l) => l.equipmentId && Number(l.quantity) > 0).map((l) => ({ equipmentId: l.equipmentId, quantity: Math.max(1, Math.round(Number(l.quantity))), price: Number(l.price) || 0 }))
    if (!lines.length) return toast('Ajoutez au moins un équipement (quantité supérieure à 0)', 'error')
    if (!f.startsAt || !f.endsAt) return toast('Indiquez la période de sous-location', 'error')
    if (readDate(f.endsAt) <= readDate(f.startsAt)) return toast('La fin de la sous-location doit être après le début', 'error')
    if (withPo && !f.supplierId) return toast('Choisissez le fournisseur du bon de commande', 'error')
    const data = { ...f, lines, cost: round2(lines.reduce((s, l) => s + l.quantity * l.price, 0)), supplierId: f.supplierId || null, projectId: f.projectId || null }
    let sr
    if (subrent) {
      store.upsert('subrents', data)
      sr = data
    } else sr = store.createSubrent(data)
    if (withPo) {
      const po = store.createPurchaseOrder({ supplierId: data.supplierId, projectId: data.projectId, subrentId: sr.id, lines: lines.map((l) => ({ label: `Sous-location ${store.equipment.find((e) => e.id === l.equipmentId)?.name || ''}`, quantity: l.quantity, price: l.price })) })
      toast(`Sous-location ${sr.number} et bon de commande ${po.number} créés`)
      onClose()
      navigate(`/bons-de-commande/${po.id}`)
      return
    } else toast(subrent ? 'Sous-location enregistrée' : `Sous-location ${sr.number} créée`)
    onClose()
  }

  return (
    <Modal
      title={subrent ? `Sous-location ${subrent.number}` : 'Nouvelle sous-location'}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Annuler</button>
          {!subrent && <button className="btn" onClick={() => save(true)}><Icon name="shopping_cart" size={18} /> Créer avec bon de commande</button>}
          <button className="btn btn-primary" onClick={() => save(false)}>Enregistrer</button>
        </>
      }
    >
      <div className="form-grid form-grid-3">
        <Field label="Fournisseur">
          {newSupplier === null ? (
            <select className="select" value={f.supplierId || ''} onChange={(e) => (e.target.value === '__new' ? setNewSupplier('') : setF({ ...f, supplierId: e.target.value || null }))}>
              <option value="">{suppliers.length ? '— Aucun —' : '— Aucun fournisseur —'}</option>
              {suppliers.map((c) => <option key={c.id} value={c.id}>{contactName(c)}</option>)}
              <option value="__new">＋ Nouveau fournisseur…</option>
            </select>
          ) : (
            <div className="input-group">
              <input className="input" autoFocus placeholder="Nom du fournisseur" value={newSupplier} onChange={(e) => setNewSupplier(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createSupplier() } if (e.key === 'Escape') { e.stopPropagation(); setNewSupplier(null) } }} />
              <button type="button" className="addon btn-addon" onClick={createSupplier} aria-label="Créer le fournisseur"><Icon name="check" size={18} /></button>
              <button type="button" className="addon btn-addon" onClick={() => setNewSupplier(null)} aria-label="Annuler"><Icon name="close" size={18} /></button>
            </div>
          )}
        </Field>
        <Field label="Projet">
          <select
            className="select"
            value={f.projectId || ''}
            onChange={(e) => {
              const projectId = e.target.value || null
              const span = projectId && !f.startsAt ? projectSpan(store, projectId) : null
              setF({ ...f, projectId, ...(span ? { startsAt: toLocalInput(span[0]), endsAt: toLocalInput(span[1]) } : {}) })
            }}
          >
            <option value="">— Aucun —</option>
            {store.projects.map((p) => <option key={p.id} value={p.id}>{p.number} {p.name}</option>)}
          </select>
        </Field>
        <Field label="Statut">
          <select className="select" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            {SUBRENT_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Période de sous-location" className="span-2" hint={project ? 'En bande claire : la période de planification du projet' : undefined}>
          <DateRangeField start={f.startsAt} end={f.endsAt} soft={project ? projectSpan(store, project.id) : undefined} softLabel="Planification du projet" defaultTimes={['08:00', '18:00']} onChange={({ start, end }) => setF({ ...f, startsAt: start, endsAt: end })} aria-label="Période de sous-location" />
        </Field>
        <Field label="Coût total"><strong className="mono" style={{ paddingTop: 8 }}>{fmtMoney(total)}</strong></Field>
      </div>
      <div className="table-wrap">
        <table className="table table-compact" style={{ marginTop: 16 }}>
          <thead><tr><th>Équipement</th><th className="num">Quantité</th><th className="num">Prix (forfait/unité)</th><th className="num">Total</th><th /></tr></thead>
          <tbody>
            {f.lines.map((l, i) => (
              <tr key={i}>
                <td>{store.equipment.find((e) => e.id === l.equipmentId)?.name || '—'}</td>
                <td className="num"><NumInput style={{ width: 70 }} value={l.quantity} onChange={(v) => setLine(i, { quantity: Math.max(0, Math.round(v) || 0) })} /></td>
                <td className="num"><NumInput style={{ width: 90 }} value={l.price} onChange={(v) => setLine(i, { price: v })} /></td>
                <td className="num mono">{fmtMoney((Number(l.quantity) || 0) * (Number(l.price) || 0))}</td>
                <td className="right"><button className="btn btn-ghost btn-icon btn-sm" onClick={() => setF({ ...f, lines: f.lines.filter((_, j) => j !== i) })} aria-label="Retirer"><Icon name="delete" size={17} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <select className="select input-sm" style={{ maxWidth: 360 }} value={addId} onChange={(e) => setAddId(e.target.value)} aria-label="Équipement à ajouter">
          <option value="">Ajouter un équipement…</option>
          {rentable.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <button
          className="btn btn-sm"
          disabled={!addId}
          onClick={() => {
            const e = store.equipment.find((x) => x.id === addId)
            // Un article déjà présent voit sa quantité augmenter
            const i = f.lines.findIndex((l) => l.equipmentId === addId)
            setF({ ...f, lines: i >= 0 ? f.lines.map((l, j) => (j === i ? { ...l, quantity: (Number(l.quantity) || 0) + 1 } : l)) : [...f.lines, { equipmentId: addId, quantity: 1, price: e?.subrentalCost || 0 }] })
            setAddId('')
          }}
        >
          <Icon name="add" size={17} /> Ajouter
        </button>
      </div>
      <div style={{ marginTop: 16 }}>
        <Field label="Notes"><textarea className="textarea" value={f.notes || ''} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
      <p className="muted small" style={{ marginBottom: 0 }}>Les sous-locations confirmées ou reçues s'ajoutent au stock disponible sur leur période (barre bleue dans la chronologie).</p>
    </Modal>
  )
}
