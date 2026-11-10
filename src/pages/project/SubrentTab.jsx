import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../../store'
import { Badge, Empty, Icon } from '../../components/ui'
import SubrentModal, { SUBRENT_STATUSES } from '../../components/SubrentModal'
import { PurchaseOrderModal } from './CostsTab'
import { projectShortages, subTimes } from '../../lib/model'
import { contactName, fmtMoney, fmtRange } from '../../lib/utils'

export default function SubrentTab({ project, idx }) {
  const store = useStore()
  const [modal, setModal] = useState(null)
  const [po, setPo] = useState(null)
  const subrents = idx.d.subrents.filter((s) => s.projectId === project.id)
  const shortages = projectShortages(project.id, idx)

  const fromShortages = () => {
    const t = subTimes(shortages[0]?.subId, idx)
    const firstSupplier = shortages.map((s) => idx.eq[s.equipmentId]?.supplierIds?.[0]).find(Boolean)
    setModal({ defaults: { projectId: project.id, supplierId: firstSupplier || '', startsAt: t.planStart, endsAt: t.planEnd, lines: shortages.map((s) => ({ equipmentId: s.equipmentId, quantity: s.shortage, price: idx.eq[s.equipmentId]?.subrentalCost || 0 })) } })
  }

  return (
    <div className="stack">
      {shortages.length > 0 && (
        <div className="alert alert-danger">
          <Icon name="warning" size={18} />
          <div style={{ flex: 1 }}>
            <strong>Pénuries sur ce projet :</strong> {shortages.map((s) => `${idx.eq[s.equipmentId]?.name} (−${s.shortage})`).join(', ')}
          </div>
          <button className="btn btn-sm btn-primary" onClick={fromShortages}><Icon name="swap_horizontal_circle" size={18} /> Sous-louer les manquants</button>
        </div>
      )}
      <div className="card">
        <div className="grid-toolbar">
          <span className="muted small">Sous-locations externes liées à ce projet. Elles s'ajoutent au stock disponible sur leur période.</span>
          <span className="spacer" />
          <button className="btn btn-primary" onClick={() => setModal({ defaults: { projectId: project.id } })}><Icon name="add" /> Sous-location</button>
        </div>
        {subrents.length === 0 ? (
          <Empty icon="swap_horizontal_circle" title="Aucune sous-location" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Numéro</th><th>Fournisseur</th><th>Période</th><th>Équipements</th><th>Statut</th><th className="num">Coût</th><th /></tr></thead>
              <tbody>
                {subrents.map((s) => {
                  const st = SUBRENT_STATUSES.find((x) => x.id === s.status) || SUBRENT_STATUSES[0]
                  return (
                    <tr key={s.id} className="clickable" onClick={() => setModal({ subrent: s })}>
                      <td className="mono strong">{s.number}</td>
                      <td>{contactName(idx.contact[s.supplierId])}</td>
                      <td className="nowrap">{fmtRange(s.startsAt, s.endsAt)}</td>
                      <td className="small">{(s.lines || []).map((l) => `${l.quantity} × ${idx.eq[l.equipmentId]?.name}`).join(', ')}</td>
                      <td><Badge color={st.color}>{st.label}</Badge></td>
                      <td className="num mono">{fmtMoney(s.cost)}</td>
                      <td className="right nowrap" onClick={(e) => e.stopPropagation()}>
                        {(() => {
                          const order = idx.d.purchaseOrders.find((p) => p.subrentId === s.id)
                          return order ? (
                            <Link className="btn btn-sm" to={`/bons-de-commande/${order.id}`} title="Bon de commande au format PDF"><Icon name="picture_as_pdf" size={17} /> {order.number}</Link>
                          ) : (
                            <button className="btn-link" onClick={() => setPo(s)}><Icon name="shopping_cart" size={17} /> Bon de commande</button>
                          )
                        })()}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {modal && <SubrentModal subrent={modal.subrent} defaults={modal.defaults} onClose={() => setModal(null)} />}
      {po && <PurchaseOrderModal project={project} subrentId={po.id} defaultSupplier={po.supplierId} lines={(po.lines || []).map((l) => ({ label: `Sous-location ${store.equipment.find((e) => e.id === l.equipmentId)?.name}`, quantity: l.quantity, price: l.price }))} onClose={() => setPo(null)} />}
    </div>
  )
}
