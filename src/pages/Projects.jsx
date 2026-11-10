import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useIdx, useStore, toast } from '../store'
import { useAccess, useAuth } from '../lib/auth'
import { Empty, Icon, Menu, PROGRESS_INFO, ProgressIcons, SelectionBar, SortTh, sortBy, progressColor } from '../components/ui'
import NewProjectModal from '../components/NewProjectModal'
import MonthCalendar from '../components/MonthCalendar'
import { docStatusOf, isConfirmed, PROJECT_STATUSES, projectProgress, projectStatus, projectTimes, projectTotals, statusOf, STATUS_GROUPS } from '../lib/model'
import { addDays, contactName, downloadFile, fmtDate, fmtMoney, fmtRange, matches, parse, startOfDay, startOfMonth, startOfWeek, toCsv } from '../lib/utils'

const PRESETS = [
  { id: 'avenir', label: 'À venir et en cours', icon: 'date_range' },
  { id: 'encours', label: 'En cours (sur site)', icon: 'place' },
  { id: 'nonconf', label: 'Non confirmés', icon: 'help_outline' },
  { id: 'conf', label: 'Confirmés', icon: 'check_circle' },
  { id: 'mes', label: 'Mes projets', icon: 'person' },
  { id: 'expires', label: 'Avec devis expirés', icon: 'timer_off' },
  { id: 'facturer', label: 'À facturer', icon: 'monetization_on' },
  { id: 'termines', label: 'Terminés', icon: 'history' },
  { id: 'annules', label: 'Annulés', icon: 'block' },
  { id: 'tous', label: 'Tous les projets', icon: 'table_chart' },
]

export default function Projects() {
  const idx = useIdx()
  const store = useStore()
  const navigate = useNavigate()
  const [preset, setPreset] = useState('avenir')
  const [view, setView] = useState('liste')
  const [q, setQ] = useState('')
  const [statuses, setStatuses] = useState([])
  const [groupBy, setGroupBy] = useState('aucun')
  const [sort, setSort] = useState({ key: 'planStart', dir: 'asc' })
  const [selected, setSelected] = useState([])
  const [creating, setCreating] = useState(false)
  const [details, setDetails] = useState(null)
  const access = useAccess()
  const me = useAuth((s) => s.profile?.fullName)
  const canEdit = access.can('projets', 'modification')
  const cur = idx.settings.currency
  const today = startOfDay(new Date())

  const rows = useMemo(
    () =>
      idx.d.projects.map((p) => {
        const t = projectTimes(p.id, idx)
        const st = projectStatus(p.id, idx)
        const docs = idx.docsByProject[p.id] || []
        return {
          ...p,
          ...t,
          status: st.id,
          mixed: st.mixed,
          clientName: contactName(idx.contact[p.clientId]),
          venueName: p.venueId ? contactName(idx.contact[p.venueId]) : '',
          typeName: idx.type[p.typeId]?.name || '',
          color: p.color || idx.type[p.typeId]?.color || statusOf(st.id).color,
          totals: projectTotals(p.id, idx),
          progress: projectProgress(p.id, idx),
          expired: docs.some((d) => (d.type === 'devis' || d.type === 'contrat') && docStatusOf(d).id === 'expire'),
          toInvoice: isConfirmed(st.id) && !docs.some((d) => d.type === 'facture' && d.status !== 'annulee'),
        }
      }),
    [idx],
  )

  const inPresetId = (p, id) => {
    const end = parse(p.planEnd)
    switch (id) {
      case 'avenir': return p.status !== 'annule' && end >= today
      case 'encours': return p.status === 'sur_site'
      case 'nonconf': return ['demande', 'concept', 'option'].includes(p.status) && end >= today
      case 'conf': return isConfirmed(p.status) && end >= today
      case 'mes': return p.accountManager === me
      case 'expires': return p.expired
      case 'facturer': return p.toInvoice
      case 'termines': return p.status !== 'annule' && end < today
      case 'annules': return p.status === 'annule'
      default: return true
    }
  }
  const inPreset = (p) => inPresetId(p, preset)
  const filtered = rows.filter((p) => inPreset(p) && (!statuses.length || statuses.includes(p.status)) && matches(q, p.name, p.number, p.clientName, p.venueName, p.typeName))
  const sorted = sortBy(filtered, sort, { planStart: (p) => parse(p.planStart)?.getTime() || 0, total: (p) => p.totals.totalExVat, number: (p) => Number(p.number) || 0 })

  const groups = (() => {
    if (groupBy === 'aucun') return [{ key: 'all', label: null, list: sorted }]
    const map = new Map()
    for (const p of sorted) {
      const key = groupBy === 'date' ? fmtDate(p.planStart) : groupBy === 'statut' ? STATUS_GROUPS.find((g) => g.id === statusOf(p.status).group)?.label : p.typeName || 'Sans type'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(p)
    }
    return [...map.entries()].map(([key, list]) => ({ key, label: key, list }))
  })()

  const exportCsv = () =>
    downloadFile(
      'projets.csv',
      '﻿' + toCsv([['Numéro', 'Projet', 'Statut', 'Client', 'Lieu', 'Type', 'Début planification', 'Fin planification', ...(access.finances ? ['Total HT'] : [])], ...sorted.map((p) => [p.number, p.name, statusOf(p.status).label, p.clientName, p.venueName, p.typeName, fmtDate(p.planStart), fmtDate(p.planEnd), ...(access.finances ? [String(p.totals.totalExVat).replace('.', ',')] : [])])]),
      'text/csv;charset=utf-8',
    )

  const rowStyle = (p) => (p.status === 'annule' ? { textDecoration: 'line-through', color: 'var(--muted)' } : p.status === 'option' ? { color: '#e08a00' } : null)

  return (
    <>
      <div className="page-header">
        <h1>Projets <span className="help-dot" title="Aperçu de tous vos projets"><Icon name="help_outline" size={20} /></span></h1>
        <div className="actions">
          <div className="btn-group">
            {[['liste', 'view_list', 'Liste'], ['chronologie', 'view_timeline', 'Chronologie'], ['calendrier', 'calendar_month', 'Calendrier']].map(([k, icon, l]) => (
              <button key={k} className={`btn ${view === k ? 'on' : ''}`} onClick={() => setView(k)}><Icon name={icon} size={19} /> {l}</button>
            ))}
          </div>
          {canEdit && <button className="btn btn-primary" onClick={() => setCreating(true)}><Icon name="add" /> Projet</button>}
        </div>
      </div>

      <div className="split">
        <div className="card filter-panel">
          <div className="panel-title">Préréglages</div>
          <div className="tree">
            {PRESETS.map((pr) => (
              <button key={pr.id} className={preset === pr.id ? 'on' : ''} onClick={() => { setPreset(pr.id); setSelected([]) }}>
                <Icon name={pr.icon} size={18} /> {pr.label}
                <span className="n">{rows.filter((p) => inPresetId(p, pr.id)).length}</span>
              </button>
            ))}
          </div>
          <div className="panel-title" style={{ borderTop: '1px solid var(--border)' }}>Statut de projet</div>
          <div className="tree">
            {PROJECT_STATUSES.map((s) => (
              <label key={s.id} className="tree-check">
                <input type="checkbox" checked={statuses.includes(s.id)} onChange={(e) => setStatuses(e.target.checked ? [...statuses, s.id] : statuses.filter((x) => x !== s.id))} />
                <span className="color-dot" style={{ background: s.color }} /> {s.label}
                <span className="n">{rows.filter((p) => p.status === s.id && inPreset(p)).length}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="card">
          {selected.length > 0 && canEdit ? (
            <SelectionBar
              count={selected.length}
              onClear={() => setSelected([])}
              right={
                <button className="btn btn-danger" onClick={() => { if (!confirm(`Supprimer ${selected.length} projet(s) ?`)) return; selected.forEach((id) => store.removeProject(id)); toast(`${selected.length} projet(s) supprimé(s)`); setSelected([]) }}><Icon name="delete" size={18} /> Supprimer</button>
              }
            >
              <Menu
                trigger={<button className="btn-link"><Icon name="flag" size={17} /> Changer le statut <Icon name="arrow_drop_down" size={18} /></button>}
                items={PROJECT_STATUSES.map((s) => ({ icon: 'fiber_manual_record', label: s.label, onClick: () => { selected.forEach((id) => store.setProjectStatus(id, s.id)); toast(`${selected.length} projet(s) → ${s.label}`); setSelected([]) } }))}
              />
              <button className="btn-link" onClick={() => { selected.forEach((id) => store.duplicateProject(id)); toast(`${selected.length} projet(s) dupliqué(s)`); setSelected([]) }}><Icon name="file_copy" size={17} /> Dupliquer</button>
            </SelectionBar>
          ) : (
            <div className="grid-toolbar">
              <div className="search underline" style={{ width: 300 }}>
                <Icon name="search" size={19} className="icon" />
                <input className="input" placeholder="Rechercher par nom, numéro, client, lieu…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              {view === 'liste' && (
                <select className="select input-sm" style={{ width: 190 }} value={groupBy} onChange={(e) => setGroupBy(e.target.value)} aria-label="Grouper par">
                  <option value="aucun">Grouper : aucun</option>
                  <option value="date">Grouper par date</option>
                  <option value="statut">Grouper par statut</option>
                  <option value="type">Grouper par type</option>
                </select>
              )}
              <span className="spacer" />
              <span className="muted small">{sorted.length} projet(s)</span>
              <button className="btn btn-ghost btn-icon" onClick={exportCsv} title="Exporter en CSV" aria-label="Exporter"><Icon name="download" /></button>
            </div>
          )}

          {view === 'liste' && (
            sorted.length === 0 ? (
              <Empty icon="table_chart" title="Aucun projet" text="Aucun projet ne correspond à ces filtres." action={canEdit && <button className="btn btn-primary" onClick={() => setCreating(true)}><Icon name="add" /> Projet</button>} />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="check-col"><input type="checkbox" checked={sorted.every((p) => selected.includes(p.id))} onChange={(e) => setSelected(e.target.checked ? sorted.map((p) => p.id) : [])} aria-label="Tout sélectionner" /></th>
                      <th style={{ width: 40 }}>Couleur</th>
                      <SortTh label="Numéro" k="number" sort={sort} setSort={setSort} />
                      <SortTh label="Nom" k="name" sort={sort} setSort={setSort} />
                      <SortTh label="Statut du projet" k="status" sort={sort} setSort={setSort} />
                      <SortTh label="Client" k="clientName" sort={sort} setSort={setSort} />
                      <SortTh label="Période de planification" k="planStart" sort={sort} setSort={setSort} />
                      <th>Avancée du projet</th>
                      {access.finances && <SortTh label="Total HT" k="total" sort={sort} setSort={setSort} className="num" />}
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g) => [
                      g.label && <tr key={`g-${g.key}`} className="group-row"><td colSpan={10}>{g.label} ({g.list.length})</td></tr>,
                      ...g.list.map((p) => (
                        <tr key={p.id} className={`clickable ${selected.includes(p.id) ? 'selected' : ''}`} style={rowStyle(p)} onClick={() => navigate(`/projets/${p.id}`)}>
                          <td className="check-col" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.includes(p.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, p.id] : selected.filter((x) => x !== p.id))} aria-label={`Sélectionner ${p.name}`} /></td>
                          <td><span className="color-dot big" style={{ background: p.color }} title={p.typeName} /></td>
                          <td className="mono">{p.number}</td>
                          <td>
                            {p.kind === 'transfert' && <Icon name="move_down" size={16} title="Projet de transfert" style={{ color: '#d97706', verticalAlign: -3, marginRight: 4 }} />}
                            <span className="strong">{p.name}</span>
                            {(() => {
                              const all = idx.subsByProject[p.id] || []
                              const props = all.filter((x) => x.proposal?.set)
                              const plain = all.length - props.length
                              const retained = props.find((x) => x.proposal.state === 'retenue')
                              return (
                                <>
                                  {props.length > 0 && <span className="tag tag-blue" style={{ marginLeft: 6 }} title="Propositions A, B…">{retained ? `Proposition ${retained.proposal.label} retenue` : `${props.length} propositions`}</span>}
                                  {plain > 1 && <span className="tag" style={{ marginLeft: 6 }}>{plain} sous-projets</span>}
                                </>
                              )
                            })()}
                            <button className="btn-link details-btn" onClick={(e) => { e.stopPropagation(); setDetails(p) }}>Détails</button>
                          </td>
                          <td>{p.mixed ? 'Varie' : statusOf(p.status).label}</td>
                          <td>{p.clientName}</td>
                          <td className="nowrap">{fmtRange(p.planStart, p.planEnd)}</td>
                          <td><ProgressIcons progress={p.progress} /></td>
                          {access.finances && <td className="num mono">{fmtMoney(p.totals.totalExVat, cur)}</td>}
                          <td className="right" onClick={(e) => e.stopPropagation()}>
                            <Menu
                              trigger={<button className="btn btn-ghost btn-icon btn-sm" aria-label="Plus d'options"><Icon name="more_vert" size={18} /></button>}
                              items={[
                                { icon: 'launch', label: 'Ouvrir', onClick: () => navigate(`/projets/${p.id}`) },
                                canEdit && { icon: 'file_copy', label: 'Dupliquer', onClick: () => { const nid = store.duplicateProject(p.id); navigate(`/projets/${nid}`) } },
                                canEdit && { icon: 'delete', label: 'Supprimer', danger: true, onClick: () => { if (confirm(`Supprimer « ${p.name} » ?`)) store.removeProject(p.id) } },
                              ]}
                            />
                          </td>
                        </tr>
                      )),
                    ])}
                  </tbody>
                </table>
              </div>
            )
          )}
          {view === 'chronologie' && <ProjectsTimeline rows={sorted} idx={idx} />}
          {view === 'calendrier' && <ProjectsCalendar rows={sorted} />}
        </div>
      </div>
      {creating && <NewProjectModal onClose={() => setCreating(false)} />}
      {details && <DetailsDrawer project={details} idx={idx} onClose={() => setDetails(null)} />}
    </>
  )
}

const PROGRESS_TEXT = {
  equipment: { ok: 'Tout le matériel de location est réservé', warn: 'Matériel planifié, pas encore réservé', bad: 'Il y a une pénurie de matériel', none: 'Aucun équipement' },
  crew: { ok: 'Toutes les fonctions sont planifiées', warn: 'Des fonctions restent à planifier', bad: 'Le projet est confirmé mais toutes les fonctions ne sont pas planifiées', none: 'Aucune fonction' },
  quote: { ok: 'Le projet a été confirmé', warn: 'Devis en attente de confirmation', none: 'Aucun devis' },
  invoice: { ok: 'Toutes les factures sont payées', warn: 'Il reste des factures impayées ou à créer', bad: 'Une facture est en retard', none: 'Aucune facture' },
  task: { ok: 'Toutes les tâches sont terminées', warn: 'Des tâches restent à faire', none: 'Il n’y a aucune tâche dans ce projet' },
}

function DetailsDrawer({ project, idx, onClose }) {
  const navigate = useNavigate()
  const access = useAccess()
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  // Rendu dans <body> : le tiroir couvre tout l'écran, au-dessus du menu et de la barre du haut
  return createPortal(
    <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer">
        <div className="modal-header">
          <h2>{project.number} {project.name}</h2>
          <button className="btn btn-ghost btn-icon" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Fermer"><Icon name="close" /></button>
        </div>
        <div className="list">
          {PROGRESS_INFO.map(([k, icon, label]) => (
            <div key={k} className="list-item clickable progress-row" onClick={() => navigate(`/projets/${project.id}`)}>
              <span className="progress-dot" style={{ background: `${progressColor(project.progress[k])}22`, color: progressColor(project.progress[k]) }}><Icon name={icon} size={22} /></span>
              <div style={{ flex: 1 }}>
                <div className="title">{label}</div>
                <div className="meta">{PROGRESS_TEXT[k][project.progress[k]] || ''}</div>
              </div>
              <Icon name="chevron_right" style={{ color: 'var(--primary)' }} />
            </div>
          ))}
        </div>
        <div className="card-body">
          <div className="stat-row"><span>Client</span><strong>{project.clientName}</strong></div>
          <div className="stat-row"><span>Période</span><strong>{fmtRange(project.planStart, project.planEnd)}</strong></div>
          <div className="stat-row"><span>Poids total</span><strong>{Math.round(project.totals.weight)} kg</strong></div>
          {access.finances && <div className="stat-row"><span>Total HT</span><strong>{fmtMoney(project.totals.totalExVat, idx.settings.currency)}</strong></div>}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function ProjectsTimeline({ rows, idx }) {
  const navigate = useNavigate()
  const [span, setSpan] = useState(28)
  const [from, setFrom] = useState(() => addDays(startOfWeek(new Date()), -7))
  const to = addDays(from, span)
  const days = Array.from({ length: span }, (_, i) => addDays(from, i))
  const pct = (d) => Math.max(0, Math.min(100, ((parse(d) - from) / (to - from)) * 100))
  const visible = rows.filter((p) => p.planStart && parse(p.planStart) < to && parse(p.planEnd) > from)
  const byType = new Map()
  for (const p of visible) {
    const k = p.typeName || 'Sans type'
    if (!byType.has(k)) byType.set(k, [])
    byType.get(k).push(p)
  }
  const cols = `repeat(${span}, 1fr)`
  return (
    <div>
      <div className="grid-toolbar" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="tl-range">
          <button onClick={() => setFrom(addDays(from, -7))} aria-label="Précédent"><Icon name="chevron_left" /></button>
          <span>{fmtRange(from.toISOString(), addDays(to, -1).toISOString())}</span>
          <button onClick={() => setFrom(addDays(from, 7))} aria-label="Suivant"><Icon name="chevron_right" /></button>
        </div>
        <button className="btn btn-sm" onClick={() => setFrom(addDays(startOfWeek(new Date()), -7))}>Aujourd'hui</button>
        <span className="spacer" />
        <div className="btn-group">
          {[14, 28, 56].map((n) => <button key={n} className={`btn btn-sm ${span === n ? 'on' : ''}`} onClick={() => setSpan(n)}>{n / 7} sem.</button>)}
        </div>
      </div>
      <div className="tl">
        <div style={{ minWidth: 260 + span * 34 }}>
          <div className="tl-row head">
            <div className="tl-label">Ressources</div>
            <div className="tl-days" style={{ gridTemplateColumns: cols }}>
              {days.map((d) => <div key={d.toISOString()} className={startOfDay(d).getTime() === startOfDay(new Date()).getTime() ? 'today-col' : ''}>{d.toLocaleDateString('fr-FR', { weekday: 'narrow' })} {d.getDate()}</div>)}
            </div>
          </div>
          {[...byType.entries()].map(([type, list]) => {
            const ends = []
            const laid = list.map((p) => {
              let lane = ends.findIndex((e) => e <= parse(p.planStart))
              if (lane === -1) {
                lane = ends.length
                ends.push(parse(p.planEnd))
              } else ends[lane] = parse(p.planEnd)
              return { p, lane }
            })
            return (
              <div key={type} className="tl-row" style={{ minHeight: Math.max(1, ends.length) * 30 + 12 }}>
                <div className="tl-label strong"><Icon name="arrow_drop_down" /> {type}</div>
                <div className="tl-track">
                  <div className="tl-grid" style={{ gridTemplateColumns: cols }}>{days.map((d) => <div key={d.toISOString()} className={[0, 6].includes(d.getDay()) ? 'we' : ''} />)}</div>
                  {laid.map(({ p, lane }) => (
                    <div key={p.id} className="tl-bar project" style={{ left: `${pct(p.planStart)}%`, width: `${Math.max(1, pct(p.planEnd) - pct(p.planStart))}%`, top: 6 + lane * 30, background: `${p.color}38`, borderLeftColor: p.color, fontStyle: ['demande', 'concept', 'option'].includes(p.status) ? 'italic' : 'normal', textDecoration: p.status === 'annule' ? 'line-through' : 'none' }} onClick={() => navigate(`/projets/${p.id}`)} title={`${p.number} ${p.name} · ${statusOf(p.status).label}`}>
                      {p.name}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
          {!visible.length && <div className="empty">Aucun projet sur cette période.</div>}
        </div>
      </div>
    </div>
  )
}

function ProjectsCalendar({ rows }) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const events = rows.filter((p) => p.planStart).map((p) => ({ id: p.id, s: parse(p.planStart), e: parse(p.planEnd), label: p.name, color: p.color, icon: 'table_chart', to: `/projets/${p.id}`, italic: ['demande', 'concept', 'option'].includes(p.status), strike: p.status === 'annule', title: `${p.number} ${p.name} · ${statusOf(p.status).label}` }))
  return (
    <div>
      <div className="grid-toolbar" style={{ borderTop: '1px solid var(--border)' }}>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Mois précédent"><Icon name="chevron_left" /></button>
        <strong style={{ minWidth: 150, textAlign: 'center', textTransform: 'capitalize' }}>{month.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</strong>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Mois suivant"><Icon name="chevron_right" /></button>
        <button className="btn btn-sm" onClick={() => setMonth(startOfMonth(new Date()))}>Aujourd'hui</button>
        <span className="spacer" />
        <span className="small muted">Italique : non confirmé · barré : annulé · couleur : type de projet</span>
      </div>
      <MonthCalendar month={month} events={events} />
    </div>
  )
}
