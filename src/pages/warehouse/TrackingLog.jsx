import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useIdx } from '../../store'
import { Empty, Icon } from '../../components/ui'
import { DB_ENABLED, fetchAuditByTable } from '../../lib/db'
import { fmtDateTime, matches } from '../../lib/utils'

const FIELDS = [
  ['pret', 'Prêt'],
  ['sur_site', 'Sur site'],
  ['retourne', 'Retourné'],
  ['perdu', 'Perdu'],
]

/** Entrepôt › Registre de suivi d'entrepôt : qui a préparé, sorti ou retourné quel matériel, et quand. */
export default function TrackingLog() {
  const idx = useIdx()
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [projectId, setProjectId] = useState('')
  const load = useCallback(() => {
    if (!DB_ENABLED) return
    setError('')
    fetchAuditByTable('bookings', 500).then(setRows).catch((e) => setError(e.message))
  }, [])
  useEffect(load, [load])

  // Mouvements : différence de quantité par statut d'entrepôt
  const moves = (r) => {
    const c = r.changes || {}
    return FIELDS.map(([k, label]) => {
      const before = r.action === 'insert' ? 0 : Number(c[k]?.old) || 0
      const after = r.action === 'insert' ? Number(c[k]) || 0 : r.action === 'delete' ? 0 : c[k] ? Number(c[k].new) || 0 : before
      return r.action === 'update' && !c[k] ? null : before !== after ? { label, before, after } : null
    }).filter(Boolean)
  }
  const list = (rows || [])
    .map((r) => ({ r, eqId: (r.row_id || '').split(':')[1], moves: moves(r) }))
    .filter((x) => x.moves.length && (!projectId || x.r.project_id === projectId) && matches(q, idx.eq[x.eqId]?.name, idx.eq[x.eqId]?.code, idx.project[x.r.project_id]?.name, x.r.author))

  return (
    <>
      <div className="page-header">
        <h1>Registre de suivi d’entrepôt <span className="help-dot" title="Historique des enregistrements de matériel : préparation, sortie, retour et perte"><Icon name="help_outline" size={20} /></span></h1>
        <div className="actions">{DB_ENABLED && <button className="btn" onClick={load}><Icon name="refresh" size={18} /> Actualiser</button>}</div>
      </div>
      <div className="card">
        <div className="grid-toolbar">
          <div className="search underline" style={{ width: 300 }}>
            <Icon name="search" size={19} className="icon" />
            <input className="input" placeholder="Équipement, projet, auteur…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="select input-sm" style={{ width: 260 }} value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="Projet">
            <option value="">Tous les projets</option>
            {idx.d.projects.map((p) => <option key={p.id} value={p.id}>{p.number} {p.name}</option>)}
          </select>
          <span className="spacer" />
          {rows && <span className="muted small">{list.length} mouvement(s)</span>}
        </div>
        {!DB_ENABLED ? (
          <Empty icon="cloud_off" title="Registre indisponible" text="Le registre de suivi est tenu par la base Supabase (npm run db:start)." />
        ) : error ? (
          <div className="alert alert-danger" style={{ margin: 16 }}><Icon name="error" size={18} /> {error}</div>
        ) : !rows ? (
          <div className="muted" style={{ padding: 16 }}>Chargement…</div>
        ) : list.length === 0 ? (
          <Empty icon="history" title="Aucun mouvement enregistré" text="Les enregistrements faits depuis l’entrepôt ou l’onglet Équipement d’un projet apparaîtront ici." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Date</th><th>Auteur</th><th>Projet</th><th>Équipement</th><th>Mouvement</th></tr></thead>
              <tbody>
                {list.map(({ r, eqId, moves: m }) => (
                  <tr key={r.id}>
                    <td className="nowrap">{fmtDateTime(r.at)}</td>
                    <td>{r.author || '—'}</td>
                    <td>{idx.project[r.project_id] ? <Link to={`/projets/${r.project_id}?tab=equipement`}>{idx.project[r.project_id].name}</Link> : <span className="muted">Projet supprimé</span>}</td>
                    <td>{idx.eq[eqId] ? <Link to={`/equipements/${eqId}`}>{idx.eq[eqId].name}</Link> : eqId}</td>
                    <td>
                      <div className="row wrap" style={{ gap: 6 }}>
                        {m.map((x) => (
                          <span key={x.label} className={`tag ${x.after > x.before ? 'tag-blue' : ''}`}>{x.label} : {x.before} → {x.after}</span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
