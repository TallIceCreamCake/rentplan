import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useIdx } from '../../store'
import { Empty, Icon } from '../../components/ui'
import { stockOf } from '../../lib/model'
import { matches } from '../../lib/utils'

/** Entrepôt › Combinaisons : le contenu des combinaisons physiques (cases) sans avoir à les ouvrir. */
export default function Combinations() {
  const idx = useIdx()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState([])
  const cases = idx.d.equipment
    .filter((e) => e.type === 'case' && !e.archived)
    .filter((e) => matches(q, e.name, e.code, ...(e.contents || []).map((c) => idx.eq[c.equipmentId]?.name)))
  const out = (eqId) => {
    let pret = 0
    let site = 0
    const projects = new Set()
    for (const b of idx.d.bookings) {
      if (b.equipmentId !== eqId) continue
      pret += Number(b.pret) || 0
      site += Number(b.surSite) || 0
      if (Number(b.pret) || Number(b.surSite)) projects.add(b.projectId)
    }
    return { pret, site, projects: [...projects].map((id) => idx.project[id]).filter(Boolean) }
  }
  const toggle = (id) => setOpen(open.includes(id) ? open.filter((x) => x !== id) : [...open, id])

  return (
    <>
      <div className="page-header">
        <h1>Combinaisons <span className="help-dot" title="Combinaisons physiques (flight-cases) : leur contenu fixe et l'endroit où elles se trouvent"><Icon name="help_outline" size={20} /></span></h1>
      </div>
      <div className="card">
        <div className="grid-toolbar">
          <div className="search underline" style={{ width: 320 }}>
            <Icon name="search" size={19} className="icon" />
            <input className="input" placeholder="Combinaison ou article contenu…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <span className="spacer" />
          <span className="muted small">{cases.length} combinaison(s)</span>
        </div>
        {cases.length === 0 ? (
          <Empty icon="inventory_2" title="Aucune combinaison physique" text="Créez un équipement de type « Combinaison physique (case) » dans le module Équipements." />
        ) : (
          <table className="tree-table">
            <thead><tr><th className="caret" /><th>Combinaison</th><th className="num">Stock</th><th className="num">Articles contenus</th><th className="num">Prêtes</th><th className="num">Sur site</th><th>Projets en cours</th></tr></thead>
            <tbody>
              {cases.map((e) => {
                const o = out(e.id)
                const isOpen = open.includes(e.id) || Boolean(q.trim())
                return [
                  <tr key={e.id} className="folder" onClick={() => toggle(e.id)} style={{ cursor: 'pointer' }}>
                    <td className="caret"><Icon name={isOpen ? 'arrow_drop_down' : 'arrow_right'} /></td>
                    <td><Icon name="inventory_2" size={19} className="folder-ico" /><Link to={`/equipements/${e.id}`} onClick={(ev) => ev.stopPropagation()} style={{ color: 'var(--text)' }}>{e.name}</Link><span className="sub">{e.code}</span></td>
                    <td className="num">{stockOf(e, idx)}</td>
                    <td className="num">{(e.contents || []).reduce((s, c) => s + (Number(c.quantity) || 0), 0)}</td>
                    <td className="num">{o.pret}</td>
                    <td className="num">{o.site}</td>
                    <td className="small">{o.projects.map((p) => p.name).join(', ') || <span className="muted">À l'entrepôt</span>}</td>
                  </tr>,
                  ...(isOpen
                    ? (e.contents || []).map((c) => (
                        <tr key={`${e.id}-${c.equipmentId}`} className="item">
                          <td className="caret" />
                          <td className="name"><Icon name="subdirectory_arrow_right" size={15} style={{ color: 'var(--muted)', marginRight: 6 }} /><Link to={`/equipements/${c.equipmentId}`}>{idx.eq[c.equipmentId]?.name}</Link> <span className="muted small">{idx.eq[c.equipmentId]?.code}</span></td>
                          <td className="num muted">—</td>
                          <td className="num">{c.quantity} par combinaison</td>
                          <td colSpan={3} />
                        </tr>
                      ))
                    : []),
                ]
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
