import { useEffect, useState } from 'react'
import { DB_ENABLED, fetchAuditLog, useSyncStatus } from '../../lib/db'
import { Empty, Icon } from '../../components/ui'
import { statusOf } from '../../lib/model'
import { fmtDateTime, personName } from '../../lib/utils'

const TABLES = {
  projects: 'Projet',
  subprojects: 'Sous-projet',
  periods: 'Planning',
  equipment_groups: "Groupe d'équipements",
  planned_equipment: 'Équipement',
  bookings: 'Entrepôt',
  function_groups: 'Groupe de fonctions',
  functions: 'Fonction',
  assignments: 'Planification',
  costs: 'Coût supplémentaire',
  documents: 'Document',
  tasks: 'Tâche',
  subrents: 'Sous-location',
  purchase_orders: 'Bon de commande',
}
const FIELDS = {
  name: 'Nom', quantity: 'Quantité', status: 'Statut', starts_at: 'Début', ends_at: 'Fin', price: 'Prix', discount: 'Remise', cost: 'Coût',
  crew_id: 'Membre du personnel', vehicle_id: 'Véhicule', equipment_id: 'Équipement', plan_start: 'Début de planification', plan_end: 'Fin de planification',
  use_start: "Début d'utilisation", use_end: "Fin d'utilisation", visible: 'Visible', invitation: 'Invitation', client_id: 'Client', venue_id: 'Lieu',
  notes: 'Notes', number: 'Numéro', discounts: 'Remises', discount_total: 'Remise totale', locked_total: 'Prix verrouillé', insurance_pct: 'Assurance',
  pret: 'Prêt', sur_site: 'Sur site', retourne: 'Retourné', perdu: 'Perdu', reserved_qty: 'Quantité réservée', is_optional: 'Optionnel', group_id: 'Groupe',
  title: 'Titre', deadline: 'Échéance', type_id: 'Type de projet', color: 'Couleur', remark: 'Remarque', break_minutes: 'Pause', distance_km: 'Distance',
}

export default function LogTab({ project, idx }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const savedAt = useSyncStatus((s) => s.savedAt)
  useEffect(() => {
    if (!DB_ENABLED) return
    let alive = true
    fetchAuditLog(project.id)
      .then((r) => alive && setRows(r))
      .catch((e) => alive && setError(e.message))
    return () => {
      alive = false
    }
  }, [project.id, savedAt])

  if (!DB_ENABLED) return <div className="card"><Empty icon="history" title="Registre indisponible" text="Le registre est alimenté par la base Supabase (lancez « npm run db:start »)." /></div>
  if (error) return <div className="alert alert-danger"><Icon name="error" size={18} /> {error}</div>
  if (!rows) return <div className="card"><Empty icon="sync" title="Chargement du registre…" /></div>
  if (!rows.length) return <div className="card"><Empty icon="history" title="Aucune modification enregistrée" text="Les modifications apportées à ce projet apparaîtront ici (qui, quoi, quand)." /></div>

  const value = (k, v) => {
    if (v == null || v === '') return '—'
    if (k === 'status') return statusOf(v)?.label || v
    if (k === 'crew_id') return personName(idx.crew[v])
    if (k === 'vehicle_id') return idx.vehicle[v]?.name || v
    if (k === 'equipment_id') return idx.eq[v]?.name || v
    if (k === 'client_id' || k === 'venue_id') return idx.contact[v]?.company || v
    if (k === 'group_id') return idx.group[v]?.name || idx.fgroup[v]?.name || v
    if (typeof v === 'boolean') return v ? 'Oui' : 'Non'
    if (typeof v === 'object') return JSON.stringify(v)
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return fmtDateTime(v.slice(0, 16))
    return String(v)
  }
  // Regroupement par « sauvegarde » : même auteur, même minute
  const saves = []
  for (const r of rows) {
    const key = `${r.author || '?'}|${r.at.slice(0, 16)}`
    const last = saves[saves.length - 1]
    if (last?.key === key) last.items.push(r)
    else saves.push({ key, author: r.author, at: r.at, items: [r] })
  }
  const ICONS = { insert: ['add_circle', 'var(--success)'], update: ['edit', 'var(--primary)'], delete: ['remove_circle', 'var(--danger)'] }

  return (
    <div className="stack">
      {saves.map((s) => (
        <div key={s.key + s.items[0].id} className="card">
          <div className="card-header">
            <Icon name="save" size={19} style={{ color: 'var(--muted)' }} />
            <strong>{s.author || 'Inconnu'}</strong>
            <span className="muted small">{new Date(s.at).toLocaleString('fr-FR')}</span>
            <span className="actions small muted">{s.items.length} modification(s)</span>
          </div>
          <div className="list">
            {s.items.map((r) => {
              const [icon, color] = ICONS[r.action] || ICONS.update
              const changes = r.action === 'update' ? Object.entries(r.changes || {}) : []
              return (
                <div key={r.id} className="list-item" style={{ alignItems: 'flex-start' }}>
                  <Icon name={icon} size={19} style={{ color, marginTop: 2 }} />
                  <div style={{ minWidth: 0 }}>
                    <div><strong>{TABLES[r.table_name] || r.table_name}</strong> {r.label ? `« ${r.label} »` : ''} <span className="muted">{r.action === 'insert' ? 'ajouté' : r.action === 'delete' ? 'supprimé' : 'modifié'}</span></div>
                    {changes.map(([k, d]) => (
                      <div key={k} className="small muted">
                        {FIELDS[k] || k} : <span style={{ textDecoration: 'line-through' }}>{value(k, d.old)}</span> → <span style={{ color: 'var(--text)' }}>{value(k, d.new)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
