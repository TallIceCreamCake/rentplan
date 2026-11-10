import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useIdx, useRecent, useStore, toast } from '../store'
import { useAccess } from '../lib/auth'
import { Field, Icon, Menu, Modal, Tabs } from '../components/ui'
import NotFound from './NotFound'
import { useTrackRecent } from '../components/useTrackRecent'
import { functionFill, isFinancialDoc, projectShortages, projectStatus, PROJECT_STATUSES, statusOf, subShortages, subTotals } from '../lib/model'
import { fmtMoney } from '../lib/utils'
import GeneralTab from './project/GeneralTab'
import ScheduleTab from './project/ScheduleTab'
import TasksTab from './project/TasksTab'
import EquipmentTab from './project/EquipmentTab'
import CrewTransportTab from './project/CrewTransportTab'
import CostsTab from './project/CostsTab'
import FinanceTab from './project/FinanceTab'
import SubrentTab from './project/SubrentTab'
import PurchaseOrdersTab from './project/PurchaseOrdersTab'
import SchedulingTab from './project/SchedulingTab'
import LogTab from './project/LogTab'
import DocumentsTab from './project/DocumentsTab'
import LogisticsTab from './project/LogisticsTab'
import ProposalsTab from './project/ProposalsTab'
import { PROPOSAL_STATES, proposalSets, subLabel } from '../lib/proposals'
import { chargeStatus, lateDays, logisticsOf } from '../lib/logistics'

export default function ProjectDetail() {
  const { id } = useParams()
  const idx = useIdx()
  const store = useStore()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [subModal, setSubModal] = useState(null)
  const access = useAccess()
  const project = idx.project[id]
  useTrackRecent('projet', id, !!project)
  if (!project) return <NotFound what="Ce projet" />

  const subs = idx.subsByProject[id] || []
  const sub = subs.find((s) => s.id === params.get('sp')) || subs[0]
  if (!sub) return <NotFound what="Ce projet" />
  const tab = params.get('tab') || 'general'
  const multi = subs.length > 1
  const status = projectStatus(id, idx)
  const shortages = projectShortages(id, idx)
  const subIds = subs.map((s) => s.id)
  const fns = idx.d.functions.filter((f) => subIds.includes(f.subprojectId))
  const countLines = subs.reduce((n, s) => n + (idx.linesBySub[s.id] || []).filter((l) => l.relation === 'principal').length, 0)

  const setQuery = (patch) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) (v == null ? next.delete(k) : next.set(k, v))
    setParams(next, { replace: true })
  }

  const tabs = [
    { id: 'general', label: 'Général' },
    { id: 'propositions', label: 'Propositions', count: proposalSets(id, idx).reduce((n, x) => n + x.items.length, 0) || undefined },
    { id: 'planning', label: 'Planning', warn: !idx.periodsByProject[id]?.length },
    { id: 'taches', label: 'Tâches', count: (idx.tasksByProject[id] || []).filter((t) => t.status !== 'termine').length },
    { id: 'equipement', label: 'Équipement', count: countLines, warn: shortages.length > 0 },
    {
      id: 'logistique',
      label: 'Préparation & retour',
      count: subs.flatMap((s) => idx.chargesBySub[s.id] || []).filter((c) => chargeStatus(c, idx, access.finances) === 'a_facturer').length,
      warn: subs.some((s) => !s.logistics?.ret?.doneAt && lateDays(s, idx, logisticsOf(s.id, idx).totals) > 0),
    },
    { id: 'equipe', label: 'Équipe et transport', count: fns.length },
    access.finances && { id: 'couts', label: 'Coûts supplémentaires', count: idx.d.costs.filter((c) => subIds.includes(c.subprojectId)).length },
    access.finances && { id: 'finances', label: 'Finances' },
    { id: 'documents', label: 'Documents', count: (idx.docsByProject[id] || []).filter((d) => access.finances || !isFinancialDoc(d)).length },
    { id: 'souslocation', label: 'Sous-location', count: idx.d.subrents.filter((s) => s.projectId === id).length },
    access.finances && { id: 'commandes', label: 'Bons de commande', count: idx.d.purchaseOrders.filter((p) => p.projectId === id).length },
    { id: 'personnel', label: 'Planification du personnel', warn: fns.some((f) => f.kind === 'equipe' && !functionFill(f, idx).full) },
    { id: 'transports', label: 'Planification des transports', warn: fns.some((f) => f.kind === 'transport' && !functionFill(f, idx).full) },
    { id: 'registre', label: 'Registre' },
  ].filter(Boolean)
  // Un onglet masqué par les droits (finances) revient à l'onglet Général
  const activeTab = tabs.some((t) => t.id === tab) ? tab : 'general'
  const props = { project, sub, subs, idx, setQuery }
  const s = statusOf(status.id)

  return (
    <>
      <div className="record-header">
        <div className="title-row">
          <h1>
            <span className="muted" style={{ fontWeight: 500 }}>{project.number}</span> {project.name}
          </h1>
          <span className="status-text" style={{ color: s.color }}>{multi && status.mixed ? 'Le statut varie selon le sous-projet' : s.label}</span>
          {project.kind === 'transfert' && (
            <span className="project-kind" title="Projet de transfert entre emplacements de stock">
              <Icon name="move_down" size={16} /> Transfert : {idx.location[project.stockLocationId]?.name || '?'} → {idx.location[project.transferToId]?.name || '?'}
            </span>
          )}
          <Menu
            align="left"
            width={330}
            trigger={
              <button className="subproject-select">
                {multi ? subLabel(sub) : 'Aucun sous-projet'} <Icon name="arrow_drop_down" />
              </button>
            }
          >
            <div className="popover-head">Sous-projets</div>
            {subs.map((x) => (
              <div key={x.id} className={`menu-item ${x.id === sub.id ? 'active' : ''}`} data-close onClick={() => setQuery({ sp: x.id })}>
                <span className="dot-status" style={{ background: statusOf(x.status).color }} title={statusOf(x.status).label} />
                {x.proposal?.label && <span className="pp-mini" style={{ background: PROPOSAL_STATES[x.proposal.state]?.color }}>{x.proposal.label}</span>}
                <span style={{ flex: 1, textDecoration: x.proposal?.state === 'ecartee' ? 'line-through' : undefined }}>{x.name}</span>
                {subShortages(x.id, idx).length > 0 && <Icon name="warning" size={16} style={{ color: 'var(--danger)' }} title="Pénurie" />}
              </div>
            ))}
            <div className="menu-sep" />
            <button className="menu-item" data-close onClick={() => setSubModal({ mode: 'new' })}><Icon name="add" size={18} /> Ajouter un sous-projet</button>
            <button className="menu-item" data-close onClick={() => setSubModal({ mode: 'dup', from: sub.id })}><Icon name="file_copy" size={18} /> Dupliquer « {sub.name} »</button>
            <button
              className="menu-item"
              data-close
              onClick={() => {
                const sid = store.createProposal(sub.id)
                const created = useStore.getState().subprojects.find((x) => x.id === sid)
                toast(`Proposition ${created?.proposal?.label} créée : copie de « ${sub.name} »`)
                setQuery({ sp: sid, tab: 'propositions' })
              }}
            >
              <Icon name="call_split" size={18} /> {sub.proposal ? `Nouvelle proposition (copie de ${sub.proposal.label})` : 'Créer des propositions A / B'}
            </button>
            {multi && (
              <button
                className="menu-item danger"
                data-close
                onClick={() => {
                  if (!confirm(`Supprimer le sous-projet « ${sub.name} » et tout son contenu ?`)) return
                  store.removeSubproject(sub.id)
                  setQuery({ sp: null })
                  toast('Sous-projet supprimé')
                }}
              >
                <Icon name="delete" size={18} /> Supprimer « {sub.name} »
              </button>
            )}
          </Menu>
          <div className="actions">
            {shortages.length > 0 && (
              <button className="btn-link danger-text" onClick={() => setQuery({ tab: 'equipement' })}>
                <Icon name="warning" size={18} /> {shortages.length} pénurie{shortages.length > 1 ? 's' : ''}
              </button>
            )}
            <button
              className="btn"
              onClick={() => {
                useRecent.getState().close(`projet:${id}`)
                navigate('/projets')
              }}
            >
              Fermer
            </button>
            <Menu
              trigger={<button className="btn btn-icon" aria-label="Plus d'options"><Icon name="more_vert" /></button>}
              items={[
                {
                  icon: 'file_copy',
                  label: 'Dupliquer le projet',
                  onClick: () => {
                    const nid = store.duplicateProject(id)
                    toast('Projet dupliqué (sans le personnel ni les véhicules planifiés)')
                    navigate(`/projets/${nid}`)
                  },
                },
                '-',
                ...PROJECT_STATUSES.map((st) => ({
                  icon: 'fiber_manual_record',
                  label: `${multi ? 'Tous les sous-projets' : 'Statut'} : ${st.label}`,
                  onClick: () => {
                    store.setProjectStatus(id, st.id)
                    toast(`Statut : ${st.label}`)
                  },
                })),
                '-',
                {
                  icon: 'delete',
                  label: 'Supprimer le projet',
                  danger: true,
                  onClick: () => {
                    if (!confirm(`Supprimer définitivement « ${project.name} » ? Les factures sont conservées.`)) return
                    store.removeProject(id)
                    useRecent.getState().close(`projet:${id}`)
                    toast('Projet supprimé')
                    navigate('/projets')
                  },
                },
              ]}
            />
          </div>
        </div>
        <ProposalBar project={project} sub={sub} idx={idx} setQuery={setQuery} money={access.finances} canEdit={access.can('projets', 'modification')} />
        <Tabs tabs={tabs} value={activeTab} onChange={(t) => setQuery({ tab: t })} />
      </div>

      {activeTab === 'general' && <GeneralTab {...props} />}
      {activeTab === 'propositions' && <ProposalsTab key={sub.id} {...props} />}
      {activeTab === 'planning' && <ScheduleTab {...props} />}
      {activeTab === 'taches' && <TasksTab {...props} />}
      {activeTab === 'equipement' && <EquipmentTab key={sub.id} {...props} />}
      {activeTab === 'logistique' && <LogisticsTab key={sub.id} {...props} />}
      {activeTab === 'equipe' && <CrewTransportTab key={sub.id} {...props} />}
      {activeTab === 'couts' && <CostsTab key={sub.id} {...props} />}
      {activeTab === 'finances' && <FinanceTab key={sub.id} {...props} />}
      {activeTab === 'documents' && <DocumentsTab {...props} />}
      {activeTab === 'souslocation' && <SubrentTab {...props} />}
      {activeTab === 'commandes' && <PurchaseOrdersTab {...props} />}
      {activeTab === 'personnel' && <SchedulingTab key={`p${sub.id}`} kind="equipe" {...props} />}
      {activeTab === 'transports' && <SchedulingTab key={`t${sub.id}`} kind="transport" {...props} />}
      {activeTab === 'registre' && <LogTab {...props} />}

      {subModal && <SubprojectModal project={project} subs={subs} mode={subModal} onClose={() => setSubModal(null)} onCreated={(sid) => setQuery({ sp: sid })} />}
    </>
  )
}

/** Barre des propositions A, B, C… : passer de l'une à l'autre, voir leur total et leur état, en ajouter une. */
function ProposalBar({ project, sub, idx, setQuery, money, canEdit }) {
  const createProposal = useStore((s) => s.createProposal)
  const sets = proposalSets(project.id, idx)
  if (!sets.length) return null
  return (
    <div className="pp-bar">
      {sets.map(({ set, items, retained }) => (
        <div key={set} className="pp-bar-set">
          <span className="pp-bar-title"><Icon name="call_split" size={16} /> Propositions</span>
          {items.map((x) => {
            const st = PROPOSAL_STATES[x.proposal.state]
            return (
              <button key={x.id} type="button" className={`pp-chip ${x.id === sub.id ? 'on' : ''} ${x.proposal.state}`} onClick={() => setQuery({ sp: x.id })} title={`Proposition ${x.proposal.label} — ${x.name} · ${st.label}`}>
                <span className="pp-letter sm" style={{ background: st.color }}>{x.proposal.label}</span>
                <span className="pp-chip-name">{x.name}</span>
                {money && <span className="pp-chip-total">{fmtMoney(subTotals(x.id, idx).totalExVat, idx.settings.currency)}</span>}
                {x.proposal.state === 'retenue' && <Icon name="check_circle" size={16} style={{ color: st.color }} />}
              </button>
            )
          })}
          {canEdit && !retained && (
            <button
              type="button"
              className="pp-chip add"
              title="Nouvelle proposition (copie de la proposition affichée)"
              onClick={() => {
                const sid = createProposal(sub.proposal?.set === set ? sub.id : items[0].id)
                const created = useStore.getState().subprojects.find((y) => y.id === sid)
                toast(`Proposition ${created?.proposal?.label} créée`)
                setQuery({ sp: sid })
              }}
            >
              <Icon name="add" size={17} />
            </button>
          )}
          <button type="button" className="btn-link small" onClick={() => setQuery({ tab: 'propositions' })}><Icon name="compare_arrows" size={16} /> Comparer</button>
        </div>
      ))}
    </div>
  )
}

function SubprojectModal({ project, subs, mode, onClose, onCreated }) {
  const { addSubproject, patch } = useStore()
  const first = subs.length === 1 && mode.mode === 'new'
  const [names, setNames] = useState(
    first
      ? [subs[0].name === project.name ? 'Sous-projet 1' : subs[0].name, 'Sous-projet 2']
      : [mode.mode === 'dup' ? `${subs.find((s) => s.id === mode.from)?.name} (copie)` : `Sous-projet ${subs.length + 1}`],
  )
  const create = () => {
    if (names.some((n) => !n.trim())) return toast('Chaque sous-projet doit avoir un nom', 'error')
    let sid
    if (first) {
      // Le premier sous-projet reprend tout ce qui était planifié dans le projet principal
      patch('subprojects', subs[0].id, { name: names[0] })
      sid = addSubproject(project.id, names[1])
    } else sid = addSubproject(project.id, names[0], mode.mode === 'dup' ? mode.from : null)
    toast('Sous-projet créé')
    onCreated(sid)
    onClose()
  }
  return (
    <Modal
      title={mode.mode === 'dup' ? 'Dupliquer le sous-projet' : first ? 'Ajouter vos premiers sous-projets' : 'Ajouter un sous-projet'}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={create}>Créer</button>
        </>
      }
    >
      <div className="stack" style={{ gap: 12 }}>
        {first && <p className="muted small" style={{ margin: 0 }}>Tout ce qui est déjà planifié est placé dans le premier sous-projet. Les deux sous-projets reprennent les dates du projet principal.</p>}
        {mode.mode === 'dup' && <p className="muted small" style={{ margin: 0 }}>Toutes les informations sont copiées, à l'exception des membres du personnel et des véhicules planifiés.</p>}
        {names.map((n, i) => (
          <Field key={i} label={names.length > 1 ? `Nom du sous-projet ${i + 1}` : 'Nom du sous-projet'}>
            <input className="input" autoFocus={i === 0} value={n} onChange={(e) => setNames(names.map((x, j) => (j === i ? e.target.value : x)))} />
          </Field>
        ))}
      </div>
    </Modal>
  )
}
