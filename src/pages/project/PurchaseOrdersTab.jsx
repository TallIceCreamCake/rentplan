import { useNavigate } from 'react-router-dom'
import { useStore } from '../../store'
import { Empty, Icon } from '../../components/ui'
import { PO_STATUSES } from '../Finance'
import { contactName, fmtDate, fmtMoney } from '../../lib/utils'

export default function PurchaseOrdersTab({ project, idx, setQuery }) {
  const store = useStore()
  const navigate = useNavigate()
  const pos = idx.d.purchaseOrders.filter((p) => p.projectId === project.id)
  return (
    <div className="card">
      <div className="grid-toolbar">
        <span className="muted small">Aperçu des bons de commande du projet. Créez-les depuis l'onglet Coûts supplémentaires ou Sous-location.</span>
        <span className="spacer" />
        <button className="btn-link" onClick={() => setQuery({ tab: 'couts' })}><Icon name="receipt_long" size={17} /> Coûts supplémentaires</button>
        <button className="btn-link" onClick={() => setQuery({ tab: 'souslocation' })}><Icon name="swap_horizontal_circle" size={17} /> Sous-location</button>
      </div>
      {pos.length === 0 ? (
        <Empty icon="shopping_cart" title="Aucun bon de commande" />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Numéro</th><th>Fournisseur</th><th>Date</th><th>Lignes</th><th>Statut</th><th className="num">Total</th><th /></tr></thead>
            <tbody>
              {pos.map((p) => (
                <tr key={p.id} className="clickable" onClick={() => navigate(`/bons-de-commande/${p.id}`)} title="Ouvrir le bon de commande (PDF)">
                  <td className="mono strong">{p.number}</td>
                  <td>{contactName(idx.contact[p.supplierId])}</td>
                  <td>{fmtDate(p.date)}</td>
                  <td className="small">{(p.lines || []).map((l) => l.label).join(', ')}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <select className="select input-sm" style={{ width: 150 }} value={p.status} onChange={(e) => store.patch('purchaseOrders', p.id, { status: e.target.value })} aria-label="Statut">
                      {PO_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </td>
                  <td className="num mono">{fmtMoney(p.total)}</td>
                  <td className="right nowrap" onClick={(e) => e.stopPropagation()}>
                    <button className="btn btn-sm" onClick={() => navigate(`/bons-de-commande/${p.id}`)}><Icon name="picture_as_pdf" size={17} /> PDF</button>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { if (confirm(`Supprimer le bon de commande ${p.number} ?`)) store.remove('purchaseOrders', p.id) }} aria-label="Supprimer"><Icon name="delete" size={17} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
