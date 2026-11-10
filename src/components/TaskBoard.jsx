import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useIdx, useStore, toast } from '../store'
import { Avatar, ColorPicker, Empty, Field, Icon, Menu, Modal, TagInput } from './ui'
import { fmtDateTime, fmtHM, matches, parse, personName, uid } from '../lib/utils'

export const TASK_STATUSES = [
  { id: 'a_faire', label: 'À faire', color: '#8a929c' },
  { id: 'en_cours', label: 'En cours', color: '#1f87e5' },
  { id: 'termine', label: 'Terminé', color: '#19b26b' },
]
const PRIORITIES = { basse: ['Basse', '#8a929c'], normale: ['Normale', '#1f87e5'], haute: ['Haute', '#e2284f'] }

/** Tableau de tâches (kanban ou liste), pour le module Tâches et l'onglet Tâches d'un projet. */
export default function TaskBoard({ projectId = undefined }) {
  const idx = useIdx()
  const { patch } = useStore()
  const [view, setView] = useState('board')
  const [q, setQ] = useState('')
  const [who, setWho] = useState('')
  const [editing, setEditing] = useState(null)
  const [dragId, setDragId] = useState(null)
  const tasks = idx.d.tasks
    .filter((t) => projectId === undefined || t.projectId === projectId)
    .filter((t) => (!who || t.assignees.includes(who)) && matches(q, t.title, t.details, idx.project[t.projectId]?.name))
    .sort((a, b) => String(a.deadline || '9').localeCompare(String(b.deadline || '9')))

  const newTask = () => setEditing({ id: uid('tk_'), projectId: projectId ?? null, title: '', details: '', status: 'a_faire', priority: 'normale', deadline: null, assignees: [], timeBudgetMin: 0, trackedMin: 0, subtasks: [], tags: [], color: null, sort: 0, createdBy: useStore.getState().settings.userName, createdAt: new Date().toISOString(), isNew: true })

  return (
    <div className="card">
      <div className="grid-toolbar">
        <div className="btn-group">
          <button className={`btn btn-sm ${view === 'board' ? 'on' : ''}`} onClick={() => setView('board')}><Icon name="view_column" size={18} /> Tableau</button>
          <button className={`btn btn-sm ${view === 'list' ? 'on' : ''}`} onClick={() => setView('list')}><Icon name="view_list" size={18} /> Liste</button>
        </div>
        <div className="search underline" style={{ width: 240 }}>
          <Icon name="search" size={18} className="icon" />
          <input className="input" placeholder="Rechercher une tâche" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="select input-sm" style={{ width: 200 }} value={who} onChange={(e) => setWho(e.target.value)} aria-label="Assigné à">
          <option value="">Assigné à : tout le monde</option>
          {idx.d.crew.map((c) => <option key={c.id} value={c.id}>{personName(c)}</option>)}
        </select>
        <span className="spacer" />
        <button className="btn btn-primary" onClick={newTask}><Icon name="add" /> Ajouter une tâche</button>
      </div>

      {view === 'board' ? (
        <div className="task-board">
          {TASK_STATUSES.map((st) => {
            const list = tasks.filter((t) => t.status === st.id)
            return (
              <div
                key={st.id}
                className="task-col"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragId) patch('tasks', dragId, { status: st.id })
                  setDragId(null)
                }}
              >
                <div className="task-col-head">
                  {st.label.toUpperCase()} ({list.length})
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setEditing({ ...newTaskBase(projectId), status: st.id })} aria-label={`Ajouter une tâche ${st.label}`}><Icon name="add" size={18} /></button>
                </div>
                {list.map((t) => (
                  <TaskCard key={t.id} task={t} idx={idx} showProject={projectId === undefined} onOpen={() => setEditing(t)} onDrag={() => setDragId(t.id)} />
                ))}
                <button className="add-task" onClick={() => setEditing({ ...newTaskBase(projectId), status: st.id })}>+ Ajouter une tâche</button>
              </div>
            )
          })}
        </div>
      ) : tasks.length === 0 ? (
        <Empty icon="assignment_turned_in" title="Aucune tâche" />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Tâche</th>{projectId === undefined && <th>Projet</th>}<th>Statut</th><th>Priorité</th><th>Échéance</th><th>Assigné à</th><th className="num">Temps</th></tr>
            </thead>
            <tbody>
              {TASK_STATUSES.map((st) => {
                const list = tasks.filter((t) => t.status === st.id)
                if (!list.length) return null
                return [
                  <tr key={st.id} className="group-row"><td colSpan={7}>{st.label} ({list.length})</td></tr>,
                  ...list.map((t) => (
                    <tr key={t.id} className="clickable" onClick={() => setEditing(t)}>
                      <td className="strong">{t.title}</td>
                      {projectId === undefined && <td>{t.projectId ? <Link to={`/projets/${t.projectId}?tab=taches`} onClick={(e) => e.stopPropagation()}>{idx.project[t.projectId]?.name}</Link> : <span className="muted">—</span>}</td>}
                      <td><span className="badge" style={{ color: st.color }}><span className="dot" />{st.label}</span></td>
                      <td><Icon name="flag" size={18} style={{ color: PRIORITIES[t.priority]?.[1] }} title={PRIORITIES[t.priority]?.[0]} /></td>
                      <td className={`nowrap ${t.deadline && parse(t.deadline) < new Date() && t.status !== 'termine' ? 'danger-text strong' : ''}`}>{t.deadline ? fmtDateTime(t.deadline) : '—'}</td>
                      <td>{t.assignees.map((a) => idx.crew[a] && personName(idx.crew[a])).filter(Boolean).join(', ') || '—'}</td>
                      <td className="num mono">{fmtHM(t.trackedMin)}{t.timeBudgetMin ? ` / ${fmtHM(t.timeBudgetMin)}` : ''}</td>
                    </tr>
                  )),
                ]
              })}
            </tbody>
          </table>
        </div>
      )}
      {editing && <TaskModal task={editing} onClose={() => setEditing(null)} showProject={projectId === undefined} />}
    </div>
  )

  function newTaskBase(pid) {
    return { id: uid('tk_'), projectId: pid ?? null, title: '', details: '', status: 'a_faire', priority: 'normale', deadline: null, assignees: [], timeBudgetMin: 0, trackedMin: 0, subtasks: [], tags: [], color: null, sort: 0, createdBy: useStore.getState().settings.userName, createdAt: new Date().toISOString(), isNew: true }
  }
}

function TaskCard({ task: t, idx, onOpen, onDrag, showProject }) {
  const { patch } = useStore()
  const late = t.deadline && parse(t.deadline) < new Date() && t.status !== 'termine'
  const done = t.subtasks.filter((s) => s.done).length
  return (
    <div className="task-card" draggable onDragStart={onDrag} onClick={onOpen} style={t.color ? { borderLeft: `4px solid ${t.color}` } : null}>
      <div className="strong">{t.title}</div>
      {showProject && t.projectId && <div className="small muted">{idx.project[t.projectId]?.number} {idx.project[t.projectId]?.name}</div>}
      <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
        <span className={`chip-date ${late ? 'late' : ''}`}><Icon name="event" size={14} /> {t.deadline ? fmtDateTime(t.deadline) : 'Aucune échéance'}</span>
        {t.tags.map((g) => <span key={g} className="tag">{g}</span>)}
      </div>
      <div className="row" style={{ marginTop: 8, gap: 6 }} onClick={(e) => e.stopPropagation()}>
        {t.assignees.map((a) => idx.crew[a] && <Avatar key={a} person={idx.crew[a]} />)}
        <select className="select input-sm task-status" value={t.status} onChange={(e) => patch('tasks', t.id, { status: e.target.value })} aria-label="Statut">
          {TASK_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <Icon name="flag" size={18} style={{ color: PRIORITIES[t.priority]?.[1] }} title={`Priorité ${PRIORITIES[t.priority]?.[0]}`} />
        <span className="spacer" />
        {t.subtasks.length > 0 && <span className="small muted">{done}/{t.subtasks.length}</span>}
        <span className="small mono muted"><Icon name="timer" size={14} /> {fmtHM(t.trackedMin)}</span>
      </div>
    </div>
  )
}

function TaskModal({ task, onClose, showProject }) {
  const store = useStore()
  const [f, setF] = useState(task)
  const [sub, setSub] = useState('')
  const [running, setRunning] = useState(null)
  const [, tick] = useState(0)
  useEffect(() => {
    if (!running) return undefined
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [running])
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const elapsedMin = running ? Math.floor((Date.now() - running) / 60000) : 0
  const save = (extra = {}) => {
    if (!f.title.trim()) return toast('Le titre est obligatoire', 'error')
    const { isNew, ...task } = { ...f, ...extra, trackedMin: (f.trackedMin || 0) + elapsedMin }
    store.upsert('tasks', task)
    toast(isNew ? 'Tâche créée' : 'Tâche enregistrée')
    onClose()
  }
  return (
    <Modal
      title={task.isNew ? 'Créer une tâche' : 'Modifier la tâche'}
      size="lg"
      onClose={onClose}
      footer={
        <>
          {!task.isNew && (
            <button
              className="btn btn-danger"
              style={{ marginRight: 'auto' }}
              onClick={() => {
                store.remove('tasks', task.id)
                toast('Tâche supprimée')
                onClose()
              }}
            >
              <Icon name="delete" size={18} /> Supprimer
            </button>
          )}
          <button className="btn" onClick={() => save({ status: 'termine' })}>Marquer comme terminée</button>
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={() => save()}>Enregistrer</button>
        </>
      }
    >
      <div className="task-modal">
        <div className="stack" style={{ gap: 12 }}>
          <input className="input task-title" autoFocus placeholder="Titre de la tâche" value={f.title} onChange={set('title')} />
          <div className="row wrap" style={{ gap: 8 }}>
            <input type="datetime-local" className="input input-sm" style={{ width: 200 }} value={f.deadline || ''} onChange={(e) => setF({ ...f, deadline: e.target.value || null })} aria-label="Échéance" />
            <select className="select input-sm" style={{ width: 130 }} value={f.status} onChange={set('status')} aria-label="Statut">
              {TASK_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <select className="select input-sm" style={{ width: 150 }} value={f.priority} onChange={set('priority')} aria-label="Priorité">
              {Object.entries(PRIORITIES).map(([k, [l]]) => <option key={k} value={k}>Priorité {l.toLowerCase()}</option>)}
            </select>
            <ColorPicker value={f.color} onChange={(color) => setF({ ...f, color })} />
          </div>
          <Field label="Détails">
            <textarea className="textarea" rows={6} value={f.details || ''} onChange={set('details')} />
          </Field>
          <div>
            <div className="kpi-label" style={{ marginBottom: 6 }}>Sous-tâches ({f.subtasks.filter((s) => s.done).length}/{f.subtasks.length})</div>
            {f.subtasks.map((s) => (
              <div key={s.id} className="row" style={{ padding: '3px 0' }}>
                <input type="checkbox" checked={s.done} onChange={() => setF({ ...f, subtasks: f.subtasks.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)) })} aria-label={s.title} />
                <span style={{ flex: 1, textDecoration: s.done ? 'line-through' : 'none' }}>{s.title}</span>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setF({ ...f, subtasks: f.subtasks.filter((x) => x.id !== s.id) })} aria-label="Supprimer la sous-tâche"><Icon name="delete" size={16} /></button>
              </div>
            ))}
            <form
              className="row"
              style={{ marginTop: 6 }}
              onSubmit={(e) => {
                e.preventDefault()
                if (!sub.trim()) return
                setF({ ...f, subtasks: [...f.subtasks, { id: uid('st_'), title: sub.trim(), done: false }] })
                setSub('')
              }}
            >
              <input className="input input-sm" placeholder="Nouvelle sous-tâche" value={sub} onChange={(e) => setSub(e.target.value)} />
              <button className="btn btn-sm" type="submit"><Icon name="add" size={17} /></button>
            </form>
          </div>
          <div>
            <div className="kpi-label" style={{ marginBottom: 6 }}>Étiquettes</div>
            <TagInput value={f.tags} onChange={(tags) => setF({ ...f, tags })} />
          </div>
        </div>
        <div className="stack task-side" style={{ gap: 12 }}>
          {showProject && (
            <Field label="Projet">
              <select className="select input-sm" value={f.projectId || ''} onChange={(e) => setF({ ...f, projectId: e.target.value || null })}>
                <option value="">— Aucun —</option>
                {store.projects.map((p) => <option key={p.id} value={p.id}>{p.number} {p.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="Assigné à">
            <Menu
              width={260}
              trigger={<button className="btn btn-sm" type="button" style={{ width: '100%', justifyContent: 'space-between' }}>Sélectionner des membres <Icon name="arrow_drop_down" /></button>}
            >
              <div style={{ padding: 8, maxHeight: 260, overflow: 'auto' }}>
                {store.crew.map((c) => (
                  <label key={c.id} className="check" style={{ display: 'flex', padding: '5px 4px' }}>
                    <input type="checkbox" checked={f.assignees.includes(c.id)} onChange={(e) => setF({ ...f, assignees: e.target.checked ? [...f.assignees, c.id] : f.assignees.filter((x) => x !== c.id) })} />
                    {personName(c)}
                  </label>
                ))}
              </div>
            </Menu>
            <div className="row wrap" style={{ gap: 4, marginTop: 6 }}>
              {f.assignees.map((a) => store.crew.find((c) => c.id === a)).filter(Boolean).map((c) => <Avatar key={c.id} person={c} />)}
            </div>
          </Field>
          <Field label="Créée par"><span>{f.createdBy || '—'}</span></Field>
          <Field label="Budget temps (minutes)">
            <input className="input input-sm" type="number" min={0} value={f.timeBudgetMin || 0} onChange={(e) => setF({ ...f, timeBudgetMin: Number(e.target.value) || 0 })} />
          </Field>
          <Field label="Temps suivi">
            <div className="timer-box">
              <span className="mono" style={{ fontSize: 22 }}>{fmtHM((f.trackedMin || 0) + elapsedMin)}</span>
              <button className={`btn btn-sm ${running ? 'btn-danger' : 'btn-primary'}`} type="button" onClick={() => (running ? (setF({ ...f, trackedMin: (f.trackedMin || 0) + elapsedMin }), setRunning(null)) : setRunning(Date.now()))}>
                <Icon name={running ? 'stop' : 'play_arrow'} size={18} /> {running ? 'Arrêter' : 'Démarrer'}
              </button>
            </div>
          </Field>
        </div>
      </div>
    </Modal>
  )
}
