import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useIdx, toast } from '../store'
import { Empty, Field, Icon, Menu, Modal } from '../components/ui'
import { setPreference, updateMyProfile, useAccess, useAuth } from '../lib/auth'
import { uid } from '../lib/utils'
import { defaultDashboards, newWidget, REV_STATUSES, widgetAvailable, WIDGETS } from './dashboard/widgets'

// Grille : 12 colonnes, lignes de 96 px séparées de 16 px (voir .dash-grid)
const ROW = 96
const GAP = 16

export default function Dashboard() {
  const idx = useIdx()
  const access = useAccess()
  const me = useAuth((s) => s.profile)
  const canEdit = access.can('dashboard', 'modification')
  const saved = me?.dashboards || []

  // Première visite : tableaux de bord par défaut selon le rôle, enregistrés sur le compte
  const defaults = useMemo(() => (saved.length ? null : defaultDashboards(access)), [saved.length, access])
  useEffect(() => {
    if (defaults && canEdit) updateMyProfile({ dashboards: defaults, preferences: { ...(me?.preferences || {}), dashboardId: defaults[0].id } })
  }, [defaults]) // eslint-disable-line react-hooks/exhaustive-deps

  const list = saved.length ? saved : defaults
  const current = list.find((d) => d.id === me?.preferences?.dashboardId) || list[0]
  const [draft, setDraft] = useState(null)
  const [gallery, setGallery] = useState(false)
  const [settingsOf, setSettingsOf] = useState(null)
  const [naming, setNaming] = useState(null)
  const [dragId, setDragId] = useState(null)
  const [overId, setOverId] = useState(null)
  const gridRef = useRef(null)
  const editing = draft !== null
  const widgets = editing ? draft : current.widgets

  const saveList = (next, extra = {}) => updateMyProfile({ dashboards: next, ...extra })
  const select = (id) => !editing && setPreference('dashboardId', id)
  const startEdit = () => setDraft(structuredClone(current.widgets))
  const save = () => {
    saveList(list.map((d) => (d.id === current.id ? { ...d, widgets: draft } : d)))
    setDraft(null)
    toast('Tableau de bord sauvegardé')
  }
  const patchWidget = (id, patch) => setDraft((d) => d.map((w) => (w.id === id ? { ...w, ...patch } : w)))
  const move = (id, beforeId) =>
    setDraft((d) => {
      const item = d.find((w) => w.id === id)
      const rest = d.filter((w) => w.id !== id)
      const i = beforeId ? rest.findIndex((w) => w.id === beforeId) : -1
      rest.splice(i < 0 ? rest.length : i, 0, item)
      return rest
    })

  const createDashboard = (name) => {
    const d = { id: uid('db_'), name, widgets: [] }
    saveList([...list, d], { preferences: { ...(me.preferences || {}), dashboardId: d.id } })
    setDraft([])
    setGallery(true)
  }
  const renameDashboard = (id, name) => saveList(list.map((d) => (d.id === id ? { ...d, name } : d)))
  const duplicateDashboard = (d) => {
    const copy = { ...structuredClone(d), id: uid('db_'), name: `${d.name} (copie)` }
    copy.widgets = copy.widgets.map((w) => ({ ...w, id: uid('w_') }))
    saveList([...list, copy], { preferences: { ...(me.preferences || {}), dashboardId: copy.id } })
  }
  const deleteDashboard = (d) => {
    if (!confirm(`Supprimer le tableau de bord « ${d.name} » ?`)) return
    const next = list.filter((x) => x.id !== d.id)
    saveList(next, { preferences: { ...(me.preferences || {}), dashboardId: next[0].id } })
    toast('Tableau de bord supprimé')
  }
  const resetDefaults = () => {
    if (!confirm('Remplacer tous vos tableaux de bord par ceux proposés par défaut ?')) return
    const next = defaultDashboards(access)
    setDraft(null)
    saveList(next, { preferences: { ...(me.preferences || {}), dashboardId: next[0].id } })
  }

  // Redimensionnement à la souris (coin inférieur droit), aligné sur la grille
  const startResize = (e, w) => {
    e.preventDefault()
    e.stopPropagation()
    const grid = gridRef.current.getBoundingClientRect()
    const colW = (grid.width - GAP * 11) / 12
    const card = e.currentTarget.parentElement.getBoundingClientRect()
    const start = { x: e.clientX, y: e.clientY, width: card.width, height: card.height }
    const def = WIDGETS[w.type]
    const onMove = (ev) => {
      const nw = Math.max(def.minW || 2, Math.min(12, Math.round((start.width + ev.clientX - start.x + GAP) / (colW + GAP))))
      const nh = Math.max(def.minH || 2, Math.min(8, Math.round((start.height + ev.clientY - start.y + GAP) / (ROW + GAP))))
      setDraft((d) => d.map((x) => (x.id === w.id && (x.w !== nw || x.h !== nh) ? { ...x, w: nw, h: nh } : x)))
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <>
      <div className="page-header dash-header">
        <div className="dash-tabs" role="tablist" aria-label="Tableaux de bord">
          {list.map((d) => (
            <div key={d.id} role="tab" aria-selected={d.id === current.id} className={`dash-tab ${d.id === current.id ? 'active' : ''} ${editing && d.id !== current.id ? 'disabled' : ''}`} onClick={() => select(d.id)}>
              <span>{d.name}</span>
              {d.id === current.id && canEdit && !editing && (
                <Menu
                  align="left"
                  trigger={<button className="btn btn-ghost btn-icon btn-sm" aria-label={`Options de « ${d.name} »`} onClick={(e) => e.stopPropagation()}><Icon name="arrow_drop_down" /></button>}
                  items={[
                    { icon: 'edit', label: 'Changer le nom', onClick: () => setNaming({ id: d.id, name: d.name }) },
                    { icon: 'file_copy', label: 'Dupliquer', onClick: () => duplicateDashboard(d) },
                    { icon: 'restart_alt', label: 'Rétablir les tableaux par défaut', onClick: resetDefaults },
                    '-',
                    { icon: 'delete', label: 'Supprimer', danger: true, disabled: list.length <= 1, onClick: () => deleteDashboard(d) },
                  ]}
                />
              )}
            </div>
          ))}
          {canEdit && !editing && (
            <button className="btn-link" onClick={() => setNaming({ name: '' })}><Icon name="add" size={18} /> Nouveau tableau de bord</button>
          )}
        </div>
        {canEdit && (
          <div className="actions">
            {editing ? (
              <>
                <button className="btn" onClick={() => setGallery(true)}><Icon name="add" /> Ajouter un widget</button>
                <button className="btn" onClick={() => setDraft(null)}>Annuler</button>
                <button className="btn btn-primary" onClick={save}><Icon name="save" size={19} /> Sauvegarder</button>
              </>
            ) : (
              <button className="btn" onClick={startEdit}><Icon name="dashboard_customize" size={19} /> Modifier le tableau de bord</button>
            )}
          </div>
        )}
      </div>

      {editing && (
        <div className="alert alert-info" style={{ marginBottom: 14 }}>
          <Icon name="info" size={18} />
          <span>Faites glisser un widget par son en-tête pour le déplacer, et par son coin inférieur droit pour changer sa taille. <Icon name="filter_list" size={15} /> ouvre ses paramètres.</span>
        </div>
      )}

      {widgets.length === 0 && !editing ? (
        <div className="card">
          <Empty icon="dashboard_customize" title="Ce tableau de bord est vide" text="Ajoutez des widgets pour suivre vos projets, votre planning et vos finances." action={canEdit && <button className="btn btn-primary" onClick={() => { startEdit(); setGallery(true) }}><Icon name="add" /> Ajouter un widget</button>} />
        </div>
      ) : (
        <div className={`dash-grid ${editing ? 'editing' : ''}`} ref={gridRef}>
          {widgets.map((w) => (
            <WidgetFrame
              key={w.id}
              w={w}
              idx={idx}
              access={access}
              me={me}
              editing={editing}
              dragging={dragId === w.id}
              over={overId === w.id && dragId !== w.id}
              onDragStart={() => setDragId(w.id)}
              onDragEnd={() => { setDragId(null); setOverId(null) }}
              onDragOver={() => overId !== w.id && setOverId(w.id)}
              onDrop={() => { if (dragId && dragId !== w.id) move(dragId, w.id); setDragId(null); setOverId(null) }}
              onSettings={() => setSettingsOf(w)}
              onRemove={() => setDraft((d) => d.filter((x) => x.id !== w.id))}
              onResize={startResize}
            />
          ))}
          {editing && (
            <div
              className={`dash-drop-end ${overId === 'end' ? 'over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setOverId('end') }}
              onDragLeave={() => setOverId(null)}
              onDrop={() => { if (dragId) move(dragId, null); setDragId(null); setOverId(null) }}
              onClick={() => setGallery(true)}
            >
              <Icon name="add" /> {dragId ? 'Déposer ici pour placer en dernier' : 'Ajouter un widget'}
            </div>
          )}
        </div>
      )}

      {gallery && <WidgetGallery access={access} onClose={() => setGallery(false)} onAdd={(type) => { setDraft((d) => [...(d || []), newWidget(type)]); setGallery(false) }} />}
      {settingsOf && <WidgetSettings widget={settingsOf} onClose={() => setSettingsOf(null)} onSave={(settings) => { patchWidget(settingsOf.id, { settings }); setSettingsOf(null) }} />}
      {naming && (
        <NameModal
          title={naming.id ? 'Changer le nom du tableau de bord' : 'Nouveau tableau de bord'}
          initial={naming.name}
          onClose={() => setNaming(null)}
          onSave={(name) => {
            if (naming.id) renameDashboard(naming.id, name)
            else createDashboard(name)
            setNaming(null)
          }}
        />
      )}
    </>
  )
}

function WidgetFrame({ w, idx, access, me, editing, dragging, over, onDragStart, onDragEnd, onDragOver, onDrop, onSettings, onRemove, onResize }) {
  const def = WIDGETS[w.type]
  if (!def) return null
  const ok = widgetAvailable(def, access)
  const Body = def.component
  const title = w.type === 'note' ? w.settings?.title || def.title : def.title
  return (
    <div
      className={`card widget ${dragging ? 'dragging' : ''} ${over ? 'drop-before' : ''}`}
      style={{ gridColumn: `span ${Math.min(12, w.w)}`, gridRow: `span ${w.h}` }}
      onDragOver={(e) => { if (!editing) return; e.preventDefault(); onDragOver() }}
      onDrop={(e) => { e.preventDefault(); onDrop() }}
    >
      <div
        className="widget-head"
        draggable={editing}
        onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', w.id); onDragStart() }}
        onDragEnd={onDragEnd}
      >
        {editing && <Icon name="drag_indicator" size={20} className="widget-grip" />}
        <span className="widget-title">{title}</span>
        {def.info && <span className="help-dot" title={def.info}><Icon name="info" size={17} /></span>}
        <span className="widget-icons">
          {editing ? (
            <>
              {def.settings && <button className="btn btn-ghost btn-icon btn-sm" onClick={onSettings} title="Paramètres du widget" aria-label="Paramètres du widget"><Icon name="filter_list" size={19} /></button>}
              <Menu trigger={<button className="btn btn-ghost btn-icon btn-sm" aria-label="Options du widget"><Icon name="more_vert" size={19} /></button>} items={[{ icon: 'delete', label: 'Supprimer le widget', danger: true, onClick: onRemove }]} />
            </>
          ) : (
            def.to && ok && <Link to={def.to} className="btn btn-ghost btn-icon btn-sm" title="Ouvrir le module" aria-label="Ouvrir le module"><Icon name="open_in_new" size={18} /></Link>
          )}
        </span>
      </div>
      <div className="widget-body">
        {ok ? <Body idx={idx} access={access} me={me} settings={w.settings || {}} /> : <div className="wg-empty"><Icon name="lock" size={30} /><div>Ce widget n’est pas disponible pour votre rôle.</div></div>}
      </div>
      {editing && (
        <span className="widget-resize" onPointerDown={(e) => onResize(e, w)} title="Redimensionner" aria-hidden="true">
          <Icon name="south_east" size={16} />
        </span>
      )}
    </div>
  )
}

function WidgetGallery({ access, onAdd, onClose }) {
  const available = Object.entries(WIDGETS).filter(([, def]) => widgetAvailable(def, access))
  return (
    <Modal title="Ajouter un widget" size="lg" onClose={onClose}>
      <div className="widget-gallery">
        {available.map(([type, def]) => (
          <button key={type} className="gallery-item" onClick={() => onAdd(type)}>
            <Icon name={def.icon} size={26} />
            <strong>{def.title}</strong>
            <span>{def.description}</span>
          </button>
        ))}
      </div>
      {available.length < Object.keys(WIDGETS).length && <p className="muted small" style={{ margin: '14px 0 0' }}>Certains widgets ne sont pas proposés car votre rôle n’a pas accès au module correspondant ou aux finances.</p>}
    </Modal>
  )
}

function WidgetSettings({ widget, onSave, onClose }) {
  const def = WIDGETS[widget.type]
  const [s, setS] = useState(() => ({ ...Object.fromEntries(def.settings.map((x) => [x.key, x.default])), ...widget.settings }))
  return (
    <Modal title={`Paramètres — ${def.title}`} size="sm" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn btn-primary" onClick={() => onSave(s)}>Appliquer</button></>}>
      <div className="stack" style={{ gap: 14 }}>
        {def.settings.map((f) => (
          <Field key={f.key} label={f.label}>
            {f.type === 'select' && (
              <select className="select" value={String(s[f.key])} onChange={(e) => setS({ ...s, [f.key]: typeof f.options[0][0] === 'number' ? Number(e.target.value) : e.target.value })}>
                {f.options.map(([v, l]) => <option key={v} value={String(v)}>{l}</option>)}
              </select>
            )}
            {f.type === 'text' && <input className="input" value={s[f.key] || ''} onChange={(e) => setS({ ...s, [f.key]: e.target.value })} />}
            {f.type === 'textarea' && <textarea className="textarea" rows={6} value={s[f.key] || ''} onChange={(e) => setS({ ...s, [f.key]: e.target.value })} />}
            {f.type === 'statuses' && (
              <div className="stack" style={{ gap: 8 }}>
                {REV_STATUSES.map((st) => (
                  <label key={st.id} className="check">
                    <input type="checkbox" checked={(s[f.key] || []).includes(st.id)} onChange={(e) => setS({ ...s, [f.key]: e.target.checked ? [...(s[f.key] || []), st.id] : (s[f.key] || []).filter((x) => x !== st.id) })} />
                    <i className="legend-swatch" style={{ background: st.color }} /> {st.label}
                  </label>
                ))}
              </div>
            )}
          </Field>
        ))}
      </div>
    </Modal>
  )
}

function NameModal({ title, initial, onSave, onClose }) {
  const [name, setName] = useState(initial)
  const submit = (e) => {
    e.preventDefault()
    if (name.trim()) onSave(name.trim())
  }
  return (
    <Modal title={title} size="sm" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn btn-primary" onClick={submit} disabled={!name.trim()}>Enregistrer</button></>}>
      <form onSubmit={submit}>
        <Field label="Nom du tableau de bord">
          <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Suivi commercial" />
        </Field>
      </form>
    </Modal>
  )
}
