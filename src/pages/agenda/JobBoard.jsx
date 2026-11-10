import { Link } from 'react-router-dom'
import { useIdx, useStore, toast } from '../../store'
import { useAccess } from '../../lib/auth'
import { Empty, Icon, StatusBadge } from '../../components/ui'
import { crewBusy, functionFill, functionTimes } from '../../lib/model'
import { fmtDate, fmtTime, hoursSpan, overlaps, parse, personName, uid } from '../../lib/utils'

/** Mon agenda › Job board : les fonctions encore à pourvoir sur les projets à venir. */
export default function JobBoard() {
  const idx = useIdx()
  const store = useStore()
  const access = useAccess()
  const crewId = access.crewId
  const canDeclare = crewId && access.canEditCollection('crewAvailability')
  const canPlan = access.can('projets', 'modification') || access.can('planificateur', 'modification')
  const now = new Date()
  const jobs = idx.d.functions
    .filter((f) => f.kind === 'equipe')
    .map((f) => ({ f, t: functionTimes(f, idx), fill: functionFill(f, idx), sub: idx.sub[f.subprojectId] }))
    .filter(({ t, fill, sub }) => sub && !['annule', 'retourne'].includes(sub.status) && !fill.full && t.planStart && parse(t.planEnd) >= now)
    .sort((a, b) => String(a.t.planStart).localeCompare(String(b.t.planStart)))
  const declared = (t) => (idx.availByCrew[crewId] || []).some((u) => u.kind === 'disponible' && parse(u.startsAt) <= parse(t.planStart) && parse(u.endsAt) >= parse(t.planEnd))
  const declare = ({ f, t }) => {
    store.upsert('crewAvailability', { id: uid('ca_'), crewId, kind: 'disponible', startsAt: t.planStart, endsAt: t.planEnd, title: `Disponible : ${f.name}`, status: 'approuve', note: idx.project[f.projectId]?.name || '' })
    toast('Disponibilité envoyée au planificateur')
  }

  return (
    <>
      <div className="page-header">
        <h1>Job board <span className="help-dot" title="Fonctions qui restent à pourvoir : déclarez-vous disponible, le planificateur vous verra en vert"><Icon name="help_outline" size={20} /></span></h1>
      </div>
      {!crewId && !canPlan && <div className="alert alert-info" style={{ marginBottom: 14 }}><Icon name="link_off" size={18} /> Liez votre compte à un membre du personnel pour vous déclarer disponible.</div>}
      <div className="card">
        {jobs.length === 0 ? (
          <Empty icon="work_outline" title="Aucune fonction à pourvoir" text="Toutes les fonctions des projets à venir sont planifiées." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Fonction</th><th>Projet</th><th>Date</th><th>Horaires</th><th className="num">Durée</th><th className="num">Postes</th>{crewId && <th>Mon planning</th>}<th /></tr></thead>
              <tbody>
                {jobs.map((j) => {
                  const busy = crewId ? crewBusy(idx, crewId, j.t.planStart, j.t.planEnd) : null
                  const free = crewId && !busy
                  const isDeclared = crewId && declared(j.t)
                  const others = (idx.asgByFn[j.f.id] || []).map((a) => personName(idx.crew[a.crewId])).filter((n) => n !== '—')
                  return (
                    <tr key={j.f.id}>
                      <td><div className="strong">{j.f.name}</div>{(j.f.tags || []).length > 0 && <div className="small muted">{j.f.tags.join(' · ')}</div>}</td>
                      <td>{access.can('projets') ? <Link to={`/projets/${j.f.projectId}?tab=personnel`}>{idx.project[j.f.projectId]?.name}</Link> : idx.project[j.f.projectId]?.name}<div><StatusBadge status={j.sub.status} /></div></td>
                      <td className="nowrap">{fmtDate(j.t.planStart)}</td>
                      <td className="nowrap mono">{fmtTime(j.t.planStart)} – {fmtTime(j.t.planEnd)}</td>
                      <td className="num mono">{Math.round(hoursSpan(j.t.planStart, j.t.planEnd))} h</td>
                      <td className="num"><span className="total-pill bad">{j.fill.planned}/{j.fill.needed}</span>{others.length > 0 && <div className="small muted">{others.join(', ')}</div>}</td>
                      {crewId && (
                        <td>
                          {free ? <span className="small success-text"><span className="avail-dot free" /> Disponible</span> : <span className="small danger-text"><span className="avail-dot busy" /> {busy?.unavailable ? 'Indisponible' : `Déjà planifié (${busy?.project?.name})`}</span>}
                        </td>
                      )}
                      <td className="right nowrap">
                        {canDeclare && free && (isDeclared ? <span className="tag tag-green">Disponibilité envoyée</span> : <button className="btn btn-sm btn-outline" onClick={() => declare(j)}><Icon name="event_available" size={17} /> Je suis disponible</button>)}
                        {canPlan && <Link className="btn-link" to={`/projets/${j.f.projectId}?sp=${j.f.subprojectId}&tab=personnel`} style={{ marginLeft: 8 }}><Icon name="person_add" size={17} /> Planifier</Link>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {jobs.some((j) => overlaps(parse(j.t.planStart), parse(j.t.planEnd), now, new Date(now.getTime() + 7 * 86400000))) && (
        <p className="muted small">Les fonctions de la semaine à venir apparaissent aussi dans les alertes du tableau de bord.</p>
      )}
    </>
  )
}
