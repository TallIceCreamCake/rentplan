import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useIdx, useStore, toast } from '../store'
import { Badge, Empty, Icon, Menu, Tabs } from '../components/ui'
import SubrentModal, { SUBRENT_STATUSES } from '../components/SubrentModal'
import { available, saleLineReserves, statusOf, stockOf, subShortages, subTimes } from '../lib/model'
import { contactName, fmtMoney, fmtRange, parse, startOfDay } from '../lib/utils'

export default function Shortages() {
  const idx = useIdx()
  const store = useStore()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || 'penuries'
  const [modal, setModal] = useState(null)
  const [statusFilter, setStatusFilter] = useState('')
  const sales = useMemo(() => saleShortages(idx), [idx])

  const rows = useMemo(() => {
    const today = startOfDay(new Date())
    return idx.d.subprojects
      .filter((s) => {
        const t = subTimes(s.id, idx)
        return t.planEnd && parse(t.planEnd) >= today
      })
      .flatMap((s) => subShortages(s.id, idx).map((x) => ({ ...x, sub: s, project: idx.project[s.projectId], t: subTimes(s.id, idx) })))
      .sort((a, b) => String(a.t.planStart).localeCompare(String(b.t.planStart)))
  }, [idx])

  const replaceWith = (row, altId) => {
    const s = useStore.getState()
    useStore.setState({ plannedEquipment: s.plannedEquipment.map((l) => (l.subprojectId === row.sub.id && l.equipmentId === row.equipmentId && l.relation === 'principal' ? { ...l, equipmentId: altId, price: null } : l)) })
    toast(`${idx.eq[row.equipmentId]?.name} remplacé par ${idx.eq[altId]?.name} dans « ${row.project.name} »`)
  }
  const subrents = idx.d.subrents.filter((s) => !statusFilter || s.status === statusFilter).sort((a, b) => String(b.startsAt).localeCompare(String(a.startsAt)))

  return (
    <>
      <div className="page-header">
        <h1>Pénuries <span className="help-dot" title="Matériel planifié au-delà du stock disponible, et sous-locations pour y remédier"><Icon name="help_outline" size={20} /></span></h1>
        <div className="actions">
          <button className="btn btn-primary" onClick={() => setModal({})}><Icon name="add" /> Sous-location</button>
        </div>
      </div>
      <Tabs tabs={[{ id: 'penuries', label: 'Pénuries de location', count: rows.length }, { id: 'vente', label: 'Pénuries de vente', count: sales.length }, { id: 'souslocations', label: 'Sous-locations', count: idx.d.subrents.length }]} value={tab} onChange={(t) => setParams({ tab: t })} />

      {tab === 'vente' && (
        <div className="card">
          {sales.length === 0 ? (
            <Empty icon="check_circle" title="Aucune pénurie de vente" text="Le stock des articles de vente couvre tous les projets à venir." />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Article de vente</th><th>Projet</th><th>Période de planification</th><th className="num">Quantité</th><th className="num">Cumul planifié</th><th className="num">Stock</th><th className="num">Manque</th></tr></thead>
                <tbody>
                  {sales.map((r, i) => (
                    <tr key={i} className="shortage-row">
                      <td><Link to={`/equipements/${r.equipmentId}`} className="strong" style={{ color: 'var(--text)' }}>{idx.eq[r.equipmentId]?.name}</Link><div className="small muted">{idx.eq[r.equipmentId]?.code}</div></td>
                      <td><Link to={`/projets/${r.sub.projectId}?sp=${r.sub.id}&tab=equipement`}>{idx.project[r.sub.projectId]?.name}</Link></td>
                      <td className="nowrap">{fmtRange(r.t.planStart, r.t.planEnd)}</td>
                      <td className="num">{r.qty}</td>
                      <td className="num">{r.needed}</td>
                      <td className="num">{r.stock}</td>
                      <td className="num"><span className="avail-pill tl-seg short" style={{ position: 'static', borderLeft: 0 }}>−{r.shortage}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'penuries' && (
        <div className="card">
          {rows.length === 0 ? (
            <Empty icon="check_circle" title="Aucune pénurie" text="Tout le matériel planifié sur les projets à venir est disponible." />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Équipement</th><th>Projet</th><th>Période de planification</th><th>Statut</th><th className="num">Planifié</th><th className="num">Disponible</th><th className="num">Manquant</th><th /></tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const eq = idx.eq[r.equipmentId]
                    const alts = (eq?.alternatives || []).map((id) => ({ eq: idx.eq[id], n: idx.eq[id] ? available(idx, id, r.t.planStart, r.t.planEnd, r.sub.id) : 0 })).filter((a) => a.eq)
                    const st = statusOf(r.sub.status)
                    return (
                      <tr key={`${r.sub.id}-${r.equipmentId}`} className="shortage-row">
                        <td><Link to={`/equipements/${r.equipmentId}`} className="strong" style={{ color: 'var(--text)' }}>{eq?.name}</Link><div className="small muted">{eq?.code}</div></td>
                        <td><Link to={`/projets/${r.project.id}?sp=${r.sub.id}&tab=equipement`}>{r.project.name}</Link>{(idx.subsByProject[r.project.id] || []).length > 1 && <div className="small muted">{r.sub.name}</div>}</td>
                        <td className="nowrap">{fmtRange(r.t.planStart, r.t.planEnd)}</td>
                        <td><Badge color={st.color}>{st.label}</Badge></td>
                        <td className="num">{r.needed}</td>
                        <td className="num">{Math.max(0, r.available)}</td>
                        <td className="num"><span className="eq-status short">{r.shortage}</span></td>
                        <td className="right nowrap">
                          {alts.length > 0 && (
                            <Menu
                              width={320}
                              trigger={<button className="btn-link"><Icon name="swap_horiz" size={17} /> Alternatives</button>}
                              items={alts.map((a) => ({ icon: a.n >= r.needed ? 'check_circle' : 'warning', label: `Remplacer par ${a.eq.name} (${a.n} dispo.)`, onClick: () => replaceWith(r, a.eq.id) }))}
                            />
                          )}
                          <button
                            className="btn-link"
                            onClick={() => setModal({ defaults: { projectId: r.project.id, supplierId: eq?.supplierIds?.[0] || '', startsAt: r.t.planStart, endsAt: r.t.planEnd, lines: [{ equipmentId: r.equipmentId, quantity: r.shortage, price: eq?.subrentalCost || 0 }] } })}
                          >
                            <Icon name="swap_horizontal_circle" size={17} /> Sous-louer
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="grid-footer">Pour résoudre une pénurie : réservez l'équipement pour le projet prioritaire, remplacez-le par une alternative ou sous-louez-le auprès d'un fournisseur.</div>
        </div>
      )}

      {tab === 'souslocations' && (
        <div className="card">
          <div className="grid-toolbar">
            <select className="select input-sm" style={{ width: 200 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Statut">
              <option value="">Tous les statuts</option>
              {SUBRENT_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          {subrents.length === 0 ? (
            <Empty icon="swap_horizontal_circle" title="Aucune sous-location" />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Numéro</th><th>Fournisseur</th><th>Projet</th><th>Période</th><th>Équipements</th><th>Statut</th><th className="num">Coût</th><th /></tr></thead>
                <tbody>
                  {subrents.map((s) => {
                    const st = SUBRENT_STATUSES.find((x) => x.id === s.status) || SUBRENT_STATUSES[0]
                    return (
                      <tr key={s.id} className="clickable" onClick={() => setModal({ subrent: s })}>
                        <td className="mono strong">{s.number}</td>
                        <td>{contactName(idx.contact[s.supplierId])}</td>
                        <td>{s.projectId ? <Link to={`/projets/${s.projectId}?tab=souslocation`} onClick={(e) => e.stopPropagation()}>{idx.project[s.projectId]?.name}</Link> : '—'}</td>
                        <td className="nowrap">{fmtRange(s.startsAt, s.endsAt)}</td>
                        <td className="small">{(s.lines || []).map((l) => `${l.quantity} × ${idx.eq[l.equipmentId]?.name}`).join(', ')}</td>
                        <td><Badge color={st.color}>{st.label}</Badge></td>
                        <td className="num mono">{fmtMoney(s.cost)}</td>
                        <td className="right" onClick={(e) => e.stopPropagation()}><button className="btn btn-ghost btn-icon btn-sm" onClick={() => { if (confirm(`Supprimer ${s.number} ?`)) store.remove('subrents', s.id) }} aria-label="Supprimer"><Icon name="delete" size={17} /></button></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {modal && <SubrentModal subrent={modal.subrent} defaults={modal.defaults} onClose={() => setModal(null)} />}
    </>
  )
}

/**
 * Articles de vente : le stock est consommé projet après projet, dans l'ordre des dates. Les projets retournés
 * ont déjà été déduits du stock ; les autres (même passés) le réservent encore.
 */
function saleShortages(idx) {
  const byEq = {}
  for (const l of idx.d.plannedEquipment) {
    if (!saleLineReserves(l, idx)) continue
    const sub = idx.sub[l.subprojectId]
    const t = subTimes(sub.id, idx)
    ;(byEq[l.equipmentId] ||= []).push({ sub, t, qty: Number(l.quantity) || 0 })
  }
  const rows = []
  for (const [equipmentId, list] of Object.entries(byEq)) {
    list.sort((a, b) => String(a.t.planStart).localeCompare(String(b.t.planStart)) || a.sub.id.localeCompare(b.sub.id))
    const stock = stockOf(idx.eq[equipmentId], idx)
    let used = 0
    for (const x of list) {
      used += x.qty
      if (used > stock) rows.push({ ...x, equipmentId, stock, needed: used, shortage: Math.min(x.qty, used - stock) })
    }
  }
  return rows.sort((a, b) => String(a.t.planStart).localeCompare(String(b.t.planStart)))
}
