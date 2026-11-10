import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore, toast } from '../../store'
import { Empty, Field, Icon, Modal, NumInput, SelectionBar } from '../../components/ui'
import { contactName, fmtMoney, round2, uid } from '../../lib/utils'

export default function CostsTab({ project, sub, idx }) {
  const store = useStore()
  const cur = idx.settings.currency
  const costs = idx.costsBySub[sub.id] || []
  const [selected, setSelected] = useState([])
  const [poOpen, setPoOpen] = useState(false)
  const add = (def = {}) =>
    store.upsert('costs', { id: uid('cs_'), projectId: project.id, subprojectId: sub.id, name: def.name || 'Nouveau coût', quantity: def.quantity ?? 1, price: def.price ?? 0, cost: def.cost ?? 0, discount: 0, remark: '', sort: costs.length })
  const total = (c) => round2((Number(c.quantity) || 0) * (Number(c.price) || 0) * (1 - (Number(c.discount) || 0) / 100))
  const purchase = (c) => round2((Number(c.quantity) || 0) * (Number(c.cost) || 0))

  return (
    <div className="eq-workspace" style={{ gridTemplateColumns: '280px minmax(0, 1fr)' }}>
      <div className="card eq-panel">
        <div className="side-list-title" style={{ paddingTop: 14 }}>Coûts par défaut</div>
        <div className="eq-scroll">
          {idx.d.defaultCosts.map((d) => (
            <div key={d.id} className="smart-item" onDoubleClick={() => add(d)} title="Double-cliquez pour ajouter">
              <Icon name="receipt_long" size={18} style={{ color: 'var(--primary)' }} />
              <span style={{ flex: 1 }}>{d.name}</span>
              <span className="small muted">{fmtMoney(d.price, cur)}</span>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => add(d)} aria-label={`Ajouter ${d.name}`}><Icon name="add" size={18} /></button>
            </div>
          ))}
        </div>
      </div>
      <div className="card eq-panel">
        {selected.length > 0 ? (
          <SelectionBar count={selected.length} onClear={() => setSelected([])} right={<button className="btn btn-danger" onClick={() => { selected.forEach((id) => store.remove('costs', id)); setSelected([]) }}><Icon name="delete" size={18} /> Supprimer</button>}>
            <button className="btn-link" onClick={() => setPoOpen(true)}><Icon name="shopping_cart" size={17} /> Créer un bon de commande</button>
          </SelectionBar>
        ) : (
          <div className="grid-toolbar">
            <span className="muted small">Hôtel, repas, déplacements, sous-traitance… ces coûts apparaissent sur les devis et factures.</span>
            <span className="spacer" />
            <button className="btn btn-primary" onClick={() => add()}><Icon name="add" /> Coûts</button>
          </div>
        )}
        <div className="eq-scroll">
          {costs.length === 0 ? (
            <Empty icon="receipt_long" title="Aucun coût supplémentaire" />
          ) : (
            <div className="table-wrap">
              <table className="table table-compact">
                <thead>
                  <tr>
                    <th className="check-col"><input type="checkbox" checked={selected.length === costs.length} onChange={(e) => setSelected(e.target.checked ? costs.map((c) => c.id) : [])} aria-label="Tout sélectionner" /></th>
                    <th>Nom</th>
                    <th className="num">Quantité</th>
                    <th className="num">Prix de vente unitaire</th>
                    <th className="num">Remise</th>
                    <th className="num">Prix d'achat unitaire</th>
                    <th className="num">Total</th>
                    <th className="num">Marge</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {costs.map((c) => (
                    <tr key={c.id} className={selected.includes(c.id) ? 'selected' : ''}>
                      <td className="check-col"><input type="checkbox" checked={selected.includes(c.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, c.id] : selected.filter((x) => x !== c.id))} aria-label={`Sélectionner ${c.name}`} /></td>
                      <td><input className="input input-sm" style={{ maxWidth: 'none' }} value={c.name} onChange={(e) => store.patch('costs', c.id, { name: e.target.value })} aria-label="Nom" /></td>
                      <td className="num"><NumInput style={{ width: 70 }} value={c.quantity} onChange={(v) => store.patch('costs', c.id, { quantity: v })} /></td>
                      <td className="num"><NumInput style={{ width: 90 }} value={c.price} onChange={(v) => store.patch('costs', c.id, { price: v })} /></td>
                      <td className="num"><span className="input-group" style={{ justifyContent: 'flex-end' }}><NumInput style={{ width: 52 }} value={c.discount} max={100} onChange={(v) => store.patch('costs', c.id, { discount: v })} /><span className="addon">%</span></span></td>
                      <td className="num"><NumInput style={{ width: 90 }} value={c.cost} onChange={(v) => store.patch('costs', c.id, { cost: v })} /></td>
                      <td className="num mono strong">{fmtMoney(total(c), cur)}</td>
                      <td className={`num mono ${total(c) - purchase(c) < 0 ? 'danger-text' : 'success-text'}`}>{fmtMoney(total(c) - purchase(c), cur)}</td>
                      <td className="right"><button className="btn btn-ghost btn-icon btn-sm row-action" onClick={() => store.remove('costs', c.id)} aria-label="Supprimer"><Icon name="delete" size={17} /></button></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={6}>Total</td>
                    <td className="num">{fmtMoney(costs.reduce((s, c) => s + total(c), 0), cur)}</td>
                    <td className="num">{fmtMoney(costs.reduce((s, c) => s + total(c) - purchase(c), 0), cur)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
      {poOpen && <PurchaseOrderModal project={project} lines={costs.filter((c) => selected.includes(c.id)).map((c) => ({ label: c.name, quantity: c.quantity, price: c.cost }))} onClose={() => { setPoOpen(false); setSelected([]) }} />}
    </div>
  )
}

export function PurchaseOrderModal({ project, lines, subrentId = null, defaultSupplier = '', onClose }) {
  const store = useStore()
  const navigate = useNavigate()
  const suppliers = store.contacts.filter((c) => c.type === 'fournisseur')
  const [supplierId, setSupplierId] = useState(defaultSupplier || suppliers[0]?.id || '')
  const create = () => {
    const po = store.createPurchaseOrder({ supplierId: supplierId || null, projectId: project?.id || null, subrentId, lines })
    toast(`Bon de commande ${po.number} créé`)
    onClose()
    navigate(`/bons-de-commande/${po.id}`)
  }
  return (
    <Modal title="Créer un bon de commande" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn btn-primary" onClick={create}>Créer</button></>}>
      <Field label="Fournisseur">
        <select className="select" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          <option value="">— Aucun —</option>
          {suppliers.map((c) => <option key={c.id} value={c.id}>{contactName(c)}</option>)}
        </select>
      </Field>
      <div className="table-wrap">
        <table className="table table-compact" style={{ marginTop: 12 }}>
          <thead><tr><th>Ligne</th><th className="num">Quantité</th><th className="num">Prix unitaire</th><th className="num">Total</th></tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}><td>{l.label}</td><td className="num">{l.quantity}</td><td className="num">{fmtMoney(l.price)}</td><td className="num">{fmtMoney(l.quantity * l.price)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}
