import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore, toast } from '../../store'
import { Icon, StatusBadge } from '../../components/ui'
import { computeAlerts } from '../../lib/alerts'
import { documentAmounts } from '../../lib/documents'
import { moduleEnabled, moduleOfPath } from '../../lib/permissions'
import { assignmentHours, assignmentSlots, assignmentTimes, docStatusOf, isConfirmed, paidAmount, projectStatus, projectTimes, projectTotals, subShortages, subTimes, subTotals, warehouseColumn } from '../../lib/model'
import { addDays, contactName, fmtDate, fmtLong, fmtMoney, fmtRange, fmtTime, hoursSpan, overlaps, parse, personName, startOfDay, uid } from '../../lib/utils'

// ---------- Outils communs ----------
const rel = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' })
/** « il y a 3 jours », « dans 2 heures »… */
export function fmtRelative(date) {
  const diff = (parse(date) - Date.now()) / 1000
  const abs = Math.abs(diff)
  if (abs < 3600) return rel.format(Math.round(diff / 60), 'minute')
  if (abs < 86400) return rel.format(Math.round(diff / 3600), 'hour')
  if (abs < 86400 * 45) return rel.format(Math.round(diff / 86400), 'day')
  return rel.format(Math.round(diff / (86400 * 30)), 'month')
}
const compact = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 })
const fmtCompact = (v) => `${compact.format(v)} €`

function WEmpty({ icon = 'info', children }) {
  return (
    <div className="wg-empty">
      <Icon name={icon} size={30} />
      <div>{children}</div>
    </div>
  )
}
const NoCrew = () => <WEmpty icon="link_off">Votre compte n’est lié à aucun membre du personnel. Un administrateur peut le lier dans Configuration › Utilisateurs.</WEmpty>

// Statuts de revenus (ordre et couleurs fixes, palette validée : contraste ≥ 3:1, séparation daltonisme OK)
export const REV_STATUSES = [
  { id: 'confirme', label: 'Projets confirmés', color: '#4f46c8' },
  { id: 'attente', label: 'Projets en attente', color: '#1a8fd0' },
  { id: 'annule', label: 'Projets annulés', color: '#d9467a' },
]
const monthKey = (d) => `${d.getFullYear()}-${d.getMonth()}`

/** Revenus HT par mois et par statut : chaque sous-projet est réparti jour par jour sur sa période de planification. */
const revCache = new WeakMap()
function monthlyRevenue(idx) {
  if (revCache.has(idx)) return revCache.get(idx)
  const out = new Map()
  for (const sub of idx.d.subprojects) {
    const t = subTimes(sub.id, idx)
    if (!t.planStart || !t.planEnd) continue
    const amount = subTotals(sub.id, idx).totalExVat
    if (!amount) continue
    const cat = sub.status === 'annule' ? 'annule' : isConfirmed(sub.status) ? 'confirme' : 'attente'
    const first = startOfDay(parse(t.planStart))
    const last = startOfDay(new Date(parse(t.planEnd).getTime() - 1))
    const days = Math.max(1, Math.round((last - first) / 86400000) + 1)
    for (let i = 0; i < days; i++) {
      const k = monthKey(addDays(first, i))
      const v = out.get(k) || { confirme: 0, attente: 0, annule: 0 }
      v[cat] += amount / days
      out.set(k, v)
    }
  }
  revCache.set(idx, out)
  return out
}
const niceMax = (v) => {
  const p = 10 ** Math.floor(Math.log10(v))
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= v) || v
}

// ---------- (Mon) agenda ----------
function AgendaWidget({ idx, access, me }) {
  const navigate = useNavigate()
  const [day, setDay] = useState(0)
  const d0 = addDays(startOfDay(new Date()), day)
  const d1 = addDays(d0, 1)
  const crewId = me?.crewId
  const everyone = !crewId && access.can('planificateur')
  const items = []
  if (crewId || everyone) {
    for (const a of idx.d.assignments) {
      if (!a.crewId || (crewId && a.crewId !== crewId) || idx.sub[a.subprojectId]?.status === 'annule') continue
      for (const [i, t] of assignmentSlots(a, idx).entries()) {
        if (!overlaps(parse(t.start), parse(t.end), d0, d1)) continue
        items.push({ id: `${a.id}-${i}`, title: `Fonction : ${idx.fn[a.functionId]?.name}`, sub: `${idx.project[a.projectId]?.name}${everyone ? ` · ${personName(idx.crew[a.crewId])}` : ''}`, start: t.start, to: `/projets/${a.projectId}?tab=personnel` })
      }
    }
    for (const u of idx.availByCrew[crewId] || []) {
      if (u.kind === 'disponible' || !overlaps(parse(u.startsAt), parse(u.endsAt), d0, d1)) continue
      const kind = { rendezvous: 'Rendez-vous', conge: 'Congé', indisponible: 'Indisponible' }[u.kind]
      items.push({ id: u.id, title: `${kind} : ${u.title}`, sub: u.note, start: u.startsAt, icon: 'place', to: `/personnel/${crewId}?tab=disponibilite` })
    }
  }
  items.sort((a, b) => String(a.start).localeCompare(String(b.start)))
  return (
    <>
      <div className="wg-tabs">
        <button className={day === 0 ? 'on' : ''} onClick={() => setDay(0)}>Aujourd'hui</button>
        <button className={day === 1 ? 'on' : ''} onClick={() => setDay(1)}>Demain</button>
        <span className="muted small" style={{ marginLeft: 'auto', textTransform: 'capitalize' }}>{fmtLong(d0)}</span>
      </div>
      {!crewId && !everyone ? (
        <NoCrew />
      ) : items.length === 0 ? (
        <WEmpty icon="event_available">Rien de planifié {day === 0 ? 'aujourd’hui' : 'demain'}.</WEmpty>
      ) : (
        <div className="wg-cards">
          {items.map((it) => (
            <div key={it.id} className="wg-card clickable" onClick={() => navigate(it.to)}>
              <div className="wg-card-title">{it.title}</div>
              {it.sub && <div className="wg-card-sub">{it.sub}</div>}
              <div className="wg-card-meta">
                <span><Icon name="event" size={16} /> {fmtDate(parse(it.start) < d0 ? d0.toISOString() : it.start)}</span>
                <span><Icon name="schedule" size={16} /> {parse(it.start) < d0 ? 'Depuis la veille' : fmtTime(it.start)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ---------- Tâches ----------
function TasksWidget({ idx, me, settings }) {
  const navigate = useNavigate()
  const scope = settings.scope || 'mes'
  const mine = (t) => (me?.crewId && t.assignees?.includes(me.crewId)) || (t.createdBy && t.createdBy === me?.fullName)
  const now = new Date()
  const list = idx.d.tasks
    .filter((t) => t.status !== 'termine' && (scope === 'toutes' || mine(t)))
    .sort((a, b) => String(a.deadline || '9999').localeCompare(String(b.deadline || '9999')))
  if (!list.length) return <WEmpty icon="task_alt">{scope === 'mes' ? 'Aucune tâche ne vous est attribuée.' : 'Aucune tâche ouverte.'}</WEmpty>
  return (
    <div className="wg-list">
      {list.map((t) => {
        const late = t.deadline && parse(t.deadline) < now
        return (
          <div key={t.id} className="wg-row clickable" onClick={() => navigate(t.projectId ? `/projets/${t.projectId}?tab=taches` : '/taches')}>
            <Icon name={t.status === 'en_cours' ? 'timelapse' : 'radio_button_unchecked'} size={19} style={{ color: t.status === 'en_cours' ? 'var(--primary)' : 'var(--muted)' }} />
            <div className="wg-row-main">
              <div className="strong">{t.title}</div>
              <div className="small muted">{t.projectId ? idx.project[t.projectId]?.name : 'Tâche générale'}{scope === 'toutes' ? ` · ${(t.assignees || []).map((id) => personName(idx.crew[id])).join(', ') || 'non attribuée'}` : ''}</div>
            </div>
            {t.deadline && <span className={`small nowrap ${late ? 'danger-text strong' : 'muted'}`}>{late && <Icon name="warning" size={14} />} {late ? 'En retard' : fmtRelative(t.deadline)}</span>}
          </div>
        )
      })}
    </div>
  )
}

// ---------- Invitations ----------
function InvitationsWidget({ idx, me }) {
  const store = useStore()
  if (!me?.crewId) return <NoCrew />
  const list = idx.d.assignments
    .filter((a) => a.crewId === me.crewId && a.invitation === 'invite' && idx.sub[a.subprojectId]?.status !== 'annule')
    .map((a) => ({ a, ...assignmentTimes(a, idx) }))
    .sort((x, y) => String(x.start).localeCompare(String(y.start)))
  if (!list.length) return <WEmpty icon="mark_email_read">Aucune invitation en attente.</WEmpty>
  const answer = (a, invitation) => {
    store.patch('assignments', a.id, { invitation })
    toast(invitation === 'accepte' ? 'Invitation acceptée' : 'Invitation refusée')
  }
  return (
    <div className="wg-cards">
      {list.map(({ a, start, end }) => {
        const soon = start && parse(start) - Date.now() < 86400000
        return (
          <div key={a.id} className="inv-card">
            <div className="strong">Invitation pour planification directe</div>
            <div className="small">{idx.project[a.projectId]?.name} » {idx.fn[a.functionId]?.name}</div>
            <div className="inv-dates">
              <span className="inv-ico"><Icon name="event" size={18} /></span>
              <div style={{ flex: 1 }}>
                <div>{fmtDate(start)} {fmtTime(start)}</div>
                <div>{fmtDate(end)} {fmtTime(end)}</div>
              </div>
              <div className="right">
                <div className="strong">{Math.round(hoursSpan(start, end) * 10) / 10} h</div>
                <div className="small muted">Durée</div>
              </div>
            </div>
            {start && <div className={`small ${soon ? 'danger-text' : 'muted'}`}><Icon name="schedule" size={14} /> Commence {fmtRelative(start)}</div>}
            {a.remark && <div className="small muted">« {a.remark} »</div>}
            <div className="inv-actions">
              <button className="btn btn-outline" onClick={() => answer(a, 'refuse')}>Refuser</button>
              <button className="btn btn-primary" onClick={() => answer(a, 'accepte')}>Accepter</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------- Enregistrement horaire ----------
function TimeWidget({ idx, me }) {
  const navigate = useNavigate()
  if (!me?.crewId) return <NoCrew />
  const done = new Set(idx.d.timeEntries.filter((e) => e.crewId === me.crewId).map((e) => e.functionId))
  const now = new Date()
  const list = (idx.asgByCrew[me.crewId] || [])
    .map((a) => ({ a, ...assignmentTimes(a, idx) }))
    .filter((x) => x.end && parse(x.end) < now && !done.has(x.a.functionId) && idx.sub[x.a.subprojectId]?.status !== 'annule')
    .sort((x, y) => String(y.end).localeCompare(String(x.end)))
  if (!list.length) return <WEmpty icon="check_circle">Toutes vos heures sont enregistrées.</WEmpty>
  return (
    <div className="wg-cards">
      {list.map(({ a, start, end }) => (
        <div key={a.id} className="wg-card clickable" onClick={() => navigate('/heures')}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="wg-card-title">{idx.fn[a.functionId]?.name}</span>
            <span className="strong" style={{ color: 'var(--primary)' }}>{Math.round(assignmentHours(a, idx))} h</span>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="wg-card-sub">{idx.project[a.projectId]?.name}</span>
            <span className="small muted">{fmtRelative(end)}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------- Factures ----------
const INVOICE_PARTS = [
  { id: 'open', label: 'En attente', color: '#1f87e5' },
  { id: 'late', label: 'En retard', color: '#e2284f' },
  { id: 'todo', label: 'À facturer', color: '#4f46c8' },
]
function InvoicesWidget({ idx }) {
  const cur = idx.settings.currency
  const docs = idx.d.documents
  const open = docs.filter((d) => d.type === 'facture' && ['envoye', 'partiel'].includes(d.status))
  const remaining = (d) => Math.max(0, documentAmounts(d).total - paidAmount(d))
  const late = open.filter((d) => docStatusOf(d).id === 'retard').reduce((s, d) => s + remaining(d), 0)
  const todo = idx.d.projects
    .filter((p) => isConfirmed(projectStatus(p.id, idx).id))
    .reduce((s, p) => {
      const invoiced = (idx.docsByProject[p.id] || []).filter((d) => (d.type === 'facture' || d.type === 'avoir') && d.status !== 'annulee').reduce((t, d) => t + documentAmounts(d).total, 0)
      return s + Math.max(0, projectTotals(p.id, idx).total - invoiced)
    }, 0)
  const values = { open: open.reduce((s, d) => s + remaining(d), 0) - late, late, todo }
  const balance = values.open + late + todo
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div>
        <div className="muted small">Solde restant à encaisser (TTC)</div>
        <div className="wg-big mono">{fmtMoney(balance, cur)}</div>
      </div>
      <div className="stacked" role="img" aria-label="Répartition : en attente, en retard, à facturer">
        {INVOICE_PARTS.map((x) => (values[x.id] > 0 ? <div key={x.id} title={`${x.label} : ${fmtMoney(values[x.id], cur)}`} style={{ width: `${(values[x.id] / (balance || 1)) * 100}%`, background: x.color }} /> : null))}
      </div>
      <div className="row wrap" style={{ gap: 18 }}>
        {INVOICE_PARTS.map((x) => (
          <span key={x.id} className="row small" style={{ gap: 6 }}>
            <i className="legend-swatch" style={{ background: x.color }} />
            <span className="muted">{x.label}</span>
            <strong className="mono">{fmtMoney(values[x.id], cur)}</strong>
          </span>
        ))}
      </div>
    </div>
  )
}

// ---------- Revenus (graphique à barres) ----------
function RevenueBarsWidget({ idx, settings }) {
  const [hover, setHover] = useState(null)
  const past = Number(settings.past ?? 5)
  const future = Number(settings.future ?? 6)
  const shown = REV_STATUSES.filter((s) => (settings.statuses || REV_STATUSES.map((x) => x.id)).includes(s.id))
  const data = monthlyRevenue(idx)
  const now = new Date()
  const months = []
  for (let i = -past; i <= future; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const v = data.get(monthKey(d)) || {}
    months.push({ key: monthKey(d), label: d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }), full: d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }), values: shown.map((s) => v[s.id] || 0), current: i === 0 })
  }
  const max = niceMax(Math.max(1, ...months.flatMap((m) => m.values)))
  const ticks = [1, 0.75, 0.5, 0.25, 0].map((f) => f * max)
  const cur = idx.settings.currency
  return (
    <div className="rev-chart">
      <div className="rev-legend">
        {shown.map((s) => <span key={s.id}><i style={{ background: s.color }} /> {s.label}</span>)}
      </div>
      <div className="rev-plot" role="img" aria-label="Revenus mensuels par statut de projet">
        <div className="rev-axis">{ticks.map((t) => <span key={t}>{fmtCompact(t)}</span>)}</div>
        <div className="rev-area">
          <div className="rev-grid">{ticks.map((t) => <i key={t} />)}</div>
          <div className="rev-cols">
            {months.map((m, i) => (
              <div key={m.key} className={`rev-col ${m.current ? 'current' : ''}`} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <div className="rev-bars">
                  {m.values.map((v, j) => <span key={shown[j].id} className="rev-bar" style={{ height: `${(v / max) * 100}%`, background: shown[j].color }} />)}
                </div>
                {hover === i && (
                  <div className={`chart-tip rev-tip ${i > months.length / 2 ? 'left' : ''}`}>
                    <div className="strong" style={{ textTransform: 'capitalize' }}>{m.full}</div>
                    {shown.map((s, j) => <div key={s.id} className="row" style={{ gap: 6 }}><i className="legend-swatch" style={{ background: s.color }} /> {s.label} : <strong className="mono">{fmtMoney(m.values[j], cur)}</strong></div>)}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="rev-lbls">{months.map((m) => <span key={m.key} className={m.current ? 'current' : ''}>{m.label}</span>)}</div>
        </div>
      </div>
    </div>
  )
}

// ---------- Revenus (graphique circulaire) ----------
function Delta({ now, before }) {
  if (!before) return <span className="small muted">{now ? 'nouveau' : '—'}</span>
  const pct = Math.round(((now - before) / before) * 100)
  const up = pct >= 0
  return (
    <span className="small strong nowrap" style={{ color: up ? 'var(--success)' : 'var(--danger)' }} title="Par rapport au mois précédent">
      <Icon name={up ? 'arrow_upward' : 'arrow_downward'} size={14} /> {Math.abs(pct)} %
    </span>
  )
}
function RevenuePieWidget({ idx, settings }) {
  const shown = REV_STATUSES.filter((s) => (settings.statuses || REV_STATUSES.map((x) => x.id)).includes(s.id))
  const data = monthlyRevenue(idx)
  const now = new Date()
  const cur = data.get(monthKey(now)) || {}
  const prev = data.get(monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1))) || {}
  const rows = shown.map((s) => ({ ...s, v: cur[s.id] || 0, p: prev[s.id] || 0 }))
  const total = rows.reduce((s, r) => s + r.v, 0)
  const R = 58
  const C = 2 * Math.PI * R
  const parts = rows.filter((r) => r.v > 0)
  const gap = parts.length > 1 ? 2 : 0
  let offset = 0
  return (
    <div className="rev-pie">
      <svg viewBox="0 0 160 160" role="img" aria-label={`Revenus de ${now.toLocaleDateString('fr-FR', { month: 'long' })} par statut`}>
        <circle cx="80" cy="80" r={R} fill="none" stroke="#eef0f3" strokeWidth="24" />
        {parts.map((r) => {
          const len = Math.max(0, (r.v / total) * C - gap)
          const el = (
            <circle key={r.id} cx="80" cy="80" r={R} fill="none" stroke={r.color} strokeWidth="24" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} transform="rotate(-90 80 80)">
              <title>{`${r.label} : ${fmtMoney(r.v, idx.settings.currency)}`}</title>
            </circle>
          )
          offset += (r.v / total) * C
          return el
        })}
        <text x="80" y="75" textAnchor="middle" className="pie-cap">{now.toLocaleDateString('fr-FR', { month: 'long' })}</text>
        <text x="80" y="96" textAnchor="middle" className="pie-total">{fmtCompact(total)}</text>
      </svg>
      <div className="rev-pie-legend">
        {rows.map((r) => (
          <div key={r.id}>
            <div className="row small" style={{ gap: 6 }}><i className="legend-swatch" style={{ background: r.color }} /> {r.label}</div>
            <div className="row" style={{ gap: 8 }}>
              <strong className="mono">{fmtMoney(r.v, idx.settings.currency)}</strong>
              <Delta now={r.v} before={r.p} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- Devis ----------
function QuotesWidget({ idx }) {
  const cur = idx.settings.currency
  const quotes = idx.d.documents.filter((d) => d.type === 'devis' || d.type === 'contrat')
  const pending = quotes.filter((d) => docStatusOf(d).id === 'envoye')
  const expired = quotes.filter((d) => docStatusOf(d).id === 'expire')
  const decided = quotes.filter((d) => ['accepte', 'refuse'].includes(d.status))
  const rate = decided.length ? Math.round((decided.filter((d) => d.status === 'accepte').length / decided.length) * 100) : null
  return (
    <>
      <div className="stat-row"><span>En attente de réponse</span><strong className="mono">{pending.length}</strong></div>
      <div className="stat-row"><span>Montant en attente (TTC)</span><strong className="mono">{fmtMoney(pending.reduce((s, d) => s + documentAmounts(d).total, 0), cur)}</strong></div>
      <div className="stat-row"><span>Expirés sans réponse</span><strong className="mono" style={expired.length ? { color: 'var(--warning)' } : null}>{expired.length}</strong></div>
      <div className="stat-row"><span>Taux de transformation</span><strong className="mono">{rate == null ? '—' : `${rate} %`}</strong></div>
    </>
  )
}

// ---------- Projets à venir ----------
function UpcomingWidget({ idx, access, settings }) {
  const navigate = useNavigate()
  const days = Number(settings.days || 15)
  const today = startOfDay(new Date())
  const list = idx.d.projects
    .map((p) => ({ p, t: projectTimes(p.id, idx), st: projectStatus(p.id, idx) }))
    .filter(({ t, st }) => st.id !== 'annule' && t.planStart && parse(t.planEnd) >= today && parse(t.planStart) < addDays(today, days))
    .sort((a, b) => String(a.t.planStart).localeCompare(String(b.t.planStart)))
  if (!list.length) return <WEmpty icon="event_available">Aucun projet dans les {days} prochains jours.</WEmpty>
  return (
    <table className="table table-compact wg-table">
      <thead><tr><th>Projet</th><th>Client</th><th>Planification</th><th>Statut</th>{access.finances && <th className="num">Montant HT</th>}</tr></thead>
      <tbody>
        {list.map(({ p, t, st }) => (
          <tr key={p.id} className="clickable" onClick={() => navigate(`/projets/${p.id}`)}>
            <td><div className="strong">{p.name}</div><div className="small muted">{p.number}</div></td>
            <td>{contactName(idx.contact[p.clientId])}</td>
            <td className="nowrap">{fmtRange(t.planStart, t.planEnd)}</td>
            <td><StatusBadge status={st.id} mixed={st.mixed} /></td>
            {access.finances && <td className="num mono">{fmtMoney(projectTotals(p.id, idx).totalExVat, idx.settings.currency)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ---------- Entrepôt ----------
const WAREHOUSE = [
  { id: 'a_preparer', label: 'À préparer', icon: 'inventory_2' },
  { id: 'pret', label: 'Prêt', icon: 'check_box' },
  { id: 'sur_site', label: 'Sur site', icon: 'place' },
  { id: 'retour_attendu', label: 'Retour attendu', icon: 'assignment_return' },
  { id: 'retarde', label: 'Retardé', icon: 'schedule' },
]
function WarehouseWidget({ idx }) {
  const navigate = useNavigate()
  const today = startOfDay(new Date())
  const count = Object.fromEntries(WAREHOUSE.map((w) => [w.id, 0]))
  for (const sub of idx.d.subprojects) {
    const col = warehouseColumn(sub, idx, today)
    if (col) count[col]++
  }
  return WAREHOUSE.map((w) => {
    const alert = w.id === 'retarde' && count[w.id] > 0
    return (
      <div key={w.id} className="stat-row clickable" onClick={() => navigate('/entrepot')}>
        <span className="row" style={{ gap: 8 }}><Icon name={w.icon} size={18} style={{ color: alert ? 'var(--danger)' : 'var(--muted)' }} /> {w.label}</span>
        <strong className={alert ? 'danger-text' : ''}>{count[w.id]}</strong>
      </div>
    )
  })
}

// ---------- Alertes ----------
const ALERT_ICONS = {
  shortage: ['swap_horizontal_circle', '#e2284f'],
  conflict: ['people', '#e2284f'],
  unfilled: ['person_add_disabled', '#e08a00'],
  late: ['receipt_long', '#e2284f'],
  inspection: ['fact_check', '#e08a00'],
  request: ['move_to_inbox', '#1f87e5'],
}
function AlertsWidget({ idx, access }) {
  const navigate = useNavigate()
  const alerts = computeAlerts(idx).filter((a) => (a.kind !== 'late' || access.finances) && access.can(moduleOfPath(a.to.split('?')[0]) || 'dashboard'))
  if (!alerts.length) return <WEmpty icon="check_circle">Aucune alerte.</WEmpty>
  return (
    <div className="wg-list">
      {alerts.map((a) => {
        const [icon, color] = ALERT_ICONS[a.kind] || ['info', 'var(--muted)']
        return (
          <div key={a.id} className="wg-row clickable" onClick={() => navigate(a.to)}>
            <Icon name={icon} size={19} style={{ color }} />
            <div className="wg-row-main">
              <div className="strong">{a.title}</div>
              <div className="small muted">{a.meta}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------- Pénuries ----------
function ShortagesWidget({ idx }) {
  const navigate = useNavigate()
  const today = startOfDay(new Date())
  const rows = []
  for (const sub of idx.d.subprojects) {
    const t = subTimes(sub.id, idx)
    if (!t.planEnd || parse(t.planEnd) < today) continue
    for (const s of subShortages(sub.id, idx)) rows.push({ sub, t, ...s })
  }
  rows.sort((a, b) => String(a.t.planStart).localeCompare(String(b.t.planStart)))
  if (!rows.length) return <WEmpty icon="check_circle">Aucune pénurie à venir.</WEmpty>
  return (
    <div className="wg-list">
      {rows.map((r) => (
        <div key={`${r.sub.id}-${r.equipmentId}`} className="wg-row clickable" onClick={() => navigate(`/projets/${r.sub.projectId}?sp=${r.sub.id}&tab=equipement`)}>
          <Icon name="swap_horizontal_circle" size={19} style={{ color: 'var(--danger)' }} />
          <div className="wg-row-main">
            <div className="strong">{idx.eq[r.equipmentId]?.name}</div>
            <div className="small muted">{idx.project[r.sub.projectId]?.name} · {fmtRange(r.t.planStart, r.t.planEnd)}</div>
          </div>
          <span className="avail-pill tl-seg short" style={{ position: 'static', borderLeft: 0 }}>−{r.shortage}</span>
        </div>
      ))}
    </div>
  )
}

// ---------- Demandes de projets ----------
function RequestsWidget({ idx }) {
  const navigate = useNavigate()
  const list = idx.d.requests.filter((r) => r.status === 'nouvelle').sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)))
  if (!list.length) return <WEmpty icon="inbox">Aucune nouvelle demande.</WEmpty>
  return (
    <div className="wg-list">
      {list.map((r) => (
        <div key={r.id} className="wg-row clickable" onClick={() => navigate('/demandes')}>
          <Icon name="move_to_inbox" size={19} style={{ color: 'var(--primary)' }} />
          <div className="wg-row-main">
            <div className="strong">{r.eventName}</div>
            <div className="small muted">{r.company || r.contactName} · {fmtRange(r.startsAt, r.endsAt)}</div>
          </div>
          <span className="small muted nowrap">{fmtRelative(r.receivedAt)}</span>
        </div>
      ))}
    </div>
  )
}

// ---------- Maintenance ----------
function MaintenanceWidget({ idx }) {
  const navigate = useNavigate()
  const repairs = idx.d.repairs.filter((r) => r.status === 'en_cours')
  const soon = addDays(startOfDay(new Date()), 30)
  const due = idx.d.inspections.filter((i) => i.result !== 'ok' && i.nextDate && parse(i.nextDate) <= soon).sort((a, b) => String(a.nextDate).localeCompare(String(b.nextDate)))
  return (
    <>
      <div className="stat-row clickable" onClick={() => navigate('/maintenance')}><span className="row" style={{ gap: 8 }}><Icon name="build" size={18} style={{ color: 'var(--muted)' }} /> Réparations en cours</span><strong>{repairs.length}</strong></div>
      <div className="stat-row clickable" onClick={() => navigate('/maintenance?tab=inspections')}><span className="row" style={{ gap: 8 }}><Icon name="fact_check" size={18} style={{ color: due.length ? 'var(--warning)' : 'var(--muted)' }} /> Inspections à prévoir (30 j)</span><strong>{due.length}</strong></div>
      <div className="wg-list" style={{ marginTop: 6 }}>
        {[...repairs.map((r) => ({ id: r.id, title: r.title, meta: `${idx.eq[r.equipmentId]?.name} · ${r.number}` })), ...due.map((i) => ({ id: i.id, title: i.name, meta: `${idx.eq[i.equipmentId]?.name} · avant le ${fmtDate(i.nextDate)}` }))].slice(0, 6).map((x) => (
          <div key={x.id} className="wg-row"><div className="wg-row-main"><div className="strong">{x.title}</div><div className="small muted">{x.meta}</div></div></div>
        ))}
      </div>
    </>
  )
}

// ---------- Note libre ----------
function NoteWidget({ settings }) {
  if (!settings.text) return <WEmpty icon="sticky_note_2">Note vide : ajoutez un texte dans les paramètres du widget (Modifier le tableau de bord).</WEmpty>
  return <div className="wg-note">{settings.text}</div>
}

// ---------- Catalogue des widgets ----------
const STATUSES_SETTING = { key: 'statuses', label: 'Statuts de projet', type: 'statuses', default: REV_STATUSES.map((s) => s.id) }
const range = (n) => Array.from({ length: n + 1 }, (_, i) => [i, `${i} mois`])

export const WIDGETS = {
  agenda: { title: '(Mon) agenda', icon: 'event', description: 'Vos fonctions planifiées et rendez-vous d’aujourd’hui et de demain.', module: 'agenda', w: 4, h: 4, minW: 3, minH: 3, to: '/agenda', component: AgendaWidget },
  taches: {
    title: 'Tâches', icon: 'assignment_turned_in', description: 'Tâches à venir et en cours ; celles en retard sont signalées.', module: 'taches', w: 4, h: 4, minW: 3, minH: 3, to: '/taches', component: TasksWidget,
    settings: [{ key: 'scope', label: 'Tâches affichées', type: 'select', options: [['mes', 'Tâches personnelles (qui me sont attribuées)'], ['toutes', 'Tâches publiques (toutes les tâches)']], default: 'mes' }],
  },
  invitations: { title: 'Invitations', icon: 'mail', description: 'Les invitations reçues sur des fonctions : acceptez-les ou refusez-les directement.', module: 'dashboard', w: 4, h: 4, minW: 3, minH: 3, to: '/agenda', component: InvitationsWidget },
  heures: { title: 'Enregistrement horaire', icon: 'watch_later', description: 'Les fonctions passées pour lesquelles vous n’avez pas encore enregistré vos heures.', module: 'heures', w: 4, h: 3, minW: 3, minH: 2, to: '/heures', component: TimeWidget },
  factures: { title: 'Factures', icon: 'receipt_long', description: 'Montants en attente, en retard et à facturer.', module: 'finances', finance: true, w: 8, h: 3, minW: 4, minH: 2, to: '/finances?tab=factures', component: InvoicesWidget },
  revenus_barres: {
    title: 'Revenus (graphique à barres)', icon: 'bar_chart', description: 'Revenus mois par mois selon le statut des projets : confirmés, en attente, annulés.', module: 'finances', finance: true, w: 8, h: 4, minW: 5, minH: 3, to: '/statistiques', component: RevenueBarsWidget,
    info: 'Le chiffre d’affaires HT d’un projet est réparti jour par jour sur sa période de planification.',
    settings: [{ key: 'past', label: 'Mois passés', type: 'select', options: range(15), default: 5 }, { key: 'future', label: 'Mois à venir', type: 'select', options: range(15), default: 6 }, STATUSES_SETTING],
  },
  revenus_anneau: {
    title: 'Revenus (graphique circulaire)', icon: 'donut_large', description: 'Revenus du mois par statut de projet, comparés au mois précédent.', module: 'finances', finance: true, w: 4, h: 4, minW: 4, minH: 3, to: '/statistiques', component: RevenuePieWidget,
    info: 'Calcul sur le mois complet, comparé au mois complet précédent.',
    settings: [STATUSES_SETTING],
  },
  devis: { title: 'Devis', icon: 'description', description: 'Devis en attente de réponse, expirés et taux de transformation.', module: 'finances', finance: true, w: 4, h: 3, minW: 3, minH: 2, to: '/finances?tab=devis', component: QuotesWidget },
  projets: {
    title: 'Projets à venir', icon: 'table_chart', description: 'Les projets dont la planification commence bientôt.', module: 'projets', w: 8, h: 4, minW: 5, minH: 3, to: '/projets', component: UpcomingWidget,
    settings: [{ key: 'days', label: 'Période', type: 'select', options: [[7, '7 prochains jours'], [15, '15 prochains jours'], [30, '30 prochains jours'], [60, '60 prochains jours']], default: 15 }],
  },
  entrepot: { title: 'Entrepôt aujourd’hui', icon: 'warehouse', description: 'Nombre de projets à préparer, prêts, sur site, attendus en retour ou en retard.', module: 'entrepot', w: 4, h: 3, minW: 3, minH: 3, to: '/entrepot', component: WarehouseWidget },
  alertes: { title: 'Alertes', icon: 'notifications', description: 'Pénuries, doubles réservations, fonctions à pourvoir, factures en retard…', module: 'dashboard', w: 4, h: 4, minW: 3, minH: 3, component: AlertsWidget },
  penuries: { title: 'Pénuries', icon: 'swap_horizontal_circle', description: 'Le matériel manquant sur les projets à venir.', module: 'penuries', w: 6, h: 3, minW: 4, minH: 2, to: '/penuries', component: ShortagesWidget },
  demandes: { title: 'Demandes de projets', icon: 'move_to_inbox', description: 'Les nouvelles demandes reçues depuis votre site.', module: 'demandes', w: 4, h: 3, minW: 3, minH: 2, to: '/demandes', component: RequestsWidget },
  maintenance: { title: 'Maintenance', icon: 'build', description: 'Réparations en cours et inspections à prévoir.', module: 'maintenance', w: 4, h: 3, minW: 3, minH: 3, to: '/maintenance', component: MaintenanceWidget },
  note: {
    title: 'Note', icon: 'sticky_note_2', description: 'Un texte libre : consignes, numéros utiles, rappels…', module: 'dashboard', w: 4, h: 2, minW: 2, minH: 2, component: NoteWidget,
    settings: [{ key: 'title', label: 'Titre', type: 'text', default: 'Note' }, { key: 'text', label: 'Texte', type: 'textarea', default: '' }],
  },
}

// Un widget suit les droits du rôle et les extensions activées de l'espace de travail
export const widgetAvailable = (def, access) => Boolean(def) && access.can(def.module) && (!def.finance || access.finances) && moduleEnabled(useStore.getState().settings, def.finance ? 'finances' : def.module)

export function newWidget(type) {
  const def = WIDGETS[type]
  return { id: uid('w_'), type, w: def.w, h: def.h, settings: Object.fromEntries((def.settings || []).map((s) => [s.key, s.default])) }
}

/** Tableaux de bord proposés à la première connexion, selon les droits du rôle. */
export function defaultDashboards(access) {
  const make = (name, types) => ({ id: uid('db_'), name, widgets: types.filter((t) => widgetAvailable(WIDGETS[t], access)).map(newWidget) })
  const mine = make('Mon tableau de bord', ['agenda', 'taches', 'invitations', 'heures'])
  const finance = access.finances && make('Financier', ['factures', 'devis', 'revenus_barres', 'revenus_anneau'])
  const operations = (access.can('projets') || access.can('entrepot')) && make('Opérations', ['projets', 'entrepot', 'alertes', 'penuries', 'demandes', 'maintenance'])
  const list = (access.crewId ? [mine, operations, finance] : [operations, finance, mine]).filter((d) => d && d.widgets.length)
  return list.length ? list : [mine]
}
