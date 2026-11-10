import { Link } from 'react-router-dom'
import { fmtDate } from '../lib/utils'

/** Badge de l'état réel d'un numéro de série (avec le projet concerné). */
export default function SerialStateBadge({ state, compact = false }) {
  const p = state.project
  const when = state.id === 'reserve' ? state.from : state.until
  return (
    <span className="sn-state" title={p ? `${state.label} · ${p.number} ${p.name}${when ? ` · ${fmtDate(when)}` : ''}` : state.label}>
      <span className="sn-dot" style={{ background: state.color }} />
      <span style={{ color: state.color, fontWeight: 600 }}>{state.label}</span>
      {p && !compact && (
        <Link to={`/projets/${p.id}?tab=logistique`} className="sn-proj" onClick={(e) => e.stopPropagation()}>
          {p.number} {p.name}{when ? ` · ${state.id === 'reserve' ? 'dès le' : state.id === 'retard' ? 'attendu le' : 'retour'} ${fmtDate(when)}` : ''}
        </Link>
      )}
    </span>
  )
}
