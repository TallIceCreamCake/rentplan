import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useIdx, useStore, toast } from '../store'
import { Empty, Field, Icon, Modal, NumInput, SelectionBar, SortTh, sortBy } from '../components/ui'
import { available, stockOf } from '../lib/model'
import { addDays, downloadFile, fmtMoney, matches, startOfDay, toCsv, uid } from '../lib/utils'
import { useAccess } from '../lib/auth'

const TYPES = [
  { id: 'article', label: 'Article physique', icon: 'check_box_outline_blank', help: 'Un objet unique ou en quantité (enceinte, câble…)' },
  { id: 'kit', label: 'Combinaison virtuelle (kit)', icon: 'grid_view', help: 'Un ensemble d’articles toujours loués ensemble, composé au moment de la préparation' },
  { id: 'case', label: 'Combinaison physique (case)', icon: 'inventory_2', help: 'Un flight-case préparé à l’avance avec un contenu fixe et son propre stock' },
  { id: 'vente', label: 'Article de vente', icon: 'sell', help: 'Consommable vendu, qui ne revient pas en stock' },
]

export default function Equipment() {
  const idx = useIdx()
  const store = useStore()
  const money = useAccess().finances
  const navigate = useNavigate()
  const [folder, setFolder] = useState('all')
  const [open, setOpen] = useState(() => idx.d.categories.filter((c) => !c.parentId).map((c) => c.id))
  const [q, setQ] = useState('')
  const [sort, setSort] = useState({ key: 'code', dir: 'asc' })
  const [selected, setSelected] = useState([])
  const [creating, setCreating] = useState(false)
  const [bulk, setBulk] = useState(false)
  const cur = idx.settings.currency
  const today = startOfDay(new Date())

  const childrenOf = (pid) => idx.d.categories.filter((c) => (c.parentId || null) === pid).sort((a, b) => a.sort - b.sort)
  const descendants = (id) => [id, ...childrenOf(id).flatMap((c) => descendants(c.id))]
  const inFolder = folder === 'all' ? null : new Set(descendants(folder))

  const rows = useMemo(
    () =>
      idx.d.equipment
        .filter((e) => !e.archived && (!inFolder || inFolder.has(e.categoryId)) && matches(q, e.name, e.code, e.location, (e.tags || []).join(' ')))
        .map((e) => ({ ...e, stockN: e.type === 'kit' ? null : stockOf(e, idx), availToday: available(idx, e.id, today, addDays(today, 1)), folderName: idx.cat[e.categoryId]?.name || '' })),
    [idx, q, folder], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const sorted = sortBy(rows, sort, { stockN: (e) => e.stockN ?? -1, availToday: (e) => e.availToday })
  const value = idx.d.equipment.reduce((s, e) => s + (Number(e.purchasePrice) || 0) * (e.type === 'kit' || e.kind === 'vente' ? 0 : stockOf(e, idx)), 0)
  const countIn = (id) => idx.d.equipment.filter((e) => !e.archived && descendants(id).includes(e.categoryId)).length

  const folderTree = (pid, depth) =>
    childrenOf(pid).map((c) => {
      const kids = childrenOf(c.id)
      const isOpen = open.includes(c.id)
      return (
        <div key={c.id}>
          <button className={folder === c.id ? 'on' : ''} style={{ paddingLeft: 10 + depth * 16 }} onClick={() => setFolder(c.id)}>
            <span onClick={(e) => { if (!kids.length) return; e.stopPropagation(); setOpen(isOpen ? open.filter((x) => x !== c.id) : [...open, c.id]) }}>
              <Icon name={kids.length ? (isOpen ? 'arrow_drop_down' : 'arrow_right') : 'remove'} size={18} style={{ color: kids.length ? 'var(--text-2)' : 'transparent' }} />
            </span>
            <Icon name="folder" size={18} style={{ color: c.color || '#3d4249' }} />
            {c.name}
            <span className="n">{countIn(c.id)}</span>
          </button>
          {isOpen && folderTree(c.id, depth + 1)}
        </div>
      )
    })

  const exportCsv = () =>
    downloadFile('equipements.csv', '﻿' + toCsv([['Code', 'Nom', 'Dossier', 'Type', 'Stock', 'Prix de location', "Prix d'achat", 'Poids (kg)', 'Emplacement', 'Étiquettes'], ...sorted.map((e) => [e.code, e.name, e.folderName, e.kind === 'vente' ? 'vente' : e.type, e.stockN ?? '', e.rentalPrice, e.purchasePrice, e.weight, e.location, (e.tags || []).join(', ')])]), 'text/csv;charset=utf-8')

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Équipements <span className="help-dot" title="La base de données de votre matériel"><Icon name="help_outline" size={20} /></span></h1>
          <div className="sub">{idx.d.equipment.filter((e) => !e.archived).length} références{money ? ` · valeur du parc ${fmtMoney(value, cur)}` : ''}</div>
        </div>
        <div className="actions">
          <button className="btn btn-ghost btn-icon" onClick={exportCsv} title="Exporter (CSV)" aria-label="Exporter"><Icon name="download" /></button>
          <button className="btn btn-primary" onClick={() => setCreating(true)}><Icon name="add" /> Équipement</button>
        </div>
      </div>
      <div className="split">
        <div className="card filter-panel">
          <div className="panel-title">Dossiers</div>
          <div className="tree">
            <button className={folder === 'all' ? 'on' : ''} onClick={() => setFolder('all')}><Icon name="category" size={18} /> Tous les équipements <span className="n">{idx.d.equipment.filter((e) => !e.archived).length}</span></button>
            {folderTree(null, 0)}
          </div>
        </div>
        <div className="card">
          {selected.length > 0 ? (
            <SelectionBar
              count={selected.length}
              onClear={() => setSelected([])}
              right={<button className="btn btn-danger" onClick={() => { if (!confirm(`Supprimer ${selected.length} équipement(s) ? Les lignes planifiées deviendront des articles temporaires.`)) return; selected.forEach((id) => store.remove('equipment', id)); setSelected([]) }}><Icon name="delete" size={18} /> Supprimer</button>}
            >
              <button className="btn-link" onClick={() => setBulk(true)}><Icon name="edit" size={17} /> Modifier en masse</button>
              <button className="btn-link" onClick={() => { selected.forEach((id) => store.patch('equipment', id, { archived: true })); toast(`${selected.length} équipement(s) archivé(s) : voir « Équipements archivés »`); setSelected([]) }}><Icon name="archive" size={17} /> Archiver</button>
            </SelectionBar>
          ) : (
            <div className="grid-toolbar">
              <div className="search underline" style={{ width: 300 }}>
                <Icon name="search" size={19} className="icon" />
                <input className="input" placeholder="Nom, code, emplacement, étiquette…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <span className="spacer" />
              <span className="muted small">{sorted.length} équipement(s)</span>
            </div>
          )}
          {sorted.length === 0 ? (
            <Empty icon="category" title="Aucun équipement" />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th className="check-col"><input type="checkbox" checked={sorted.every((e) => selected.includes(e.id))} onChange={(e) => setSelected(e.target.checked ? sorted.map((x) => x.id) : [])} aria-label="Tout sélectionner" /></th>
                    <SortTh label="Code" k="code" sort={sort} setSort={setSort} />
                    <SortTh label="Nom" k="name" sort={sort} setSort={setSort} />
                    <th>Type</th>
                    <SortTh label="Dossier" k="folderName" sort={sort} setSort={setSort} />
                    <SortTh label="Emplacement" k="location" sort={sort} setSort={setSort} />
                    <SortTh label="Stock" k="stockN" sort={sort} setSort={setSort} className="num" />
                    <SortTh label="Disponible aujourd'hui" k="availToday" sort={sort} setSort={setSort} className="num" />
                    {money && <SortTh label="Prix de location" k="rentalPrice" sort={sort} setSort={setSort} className="num" />}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((e) => {
                    const ty = e.kind === 'vente' ? TYPES[3] : TYPES.find((t) => t.id === e.type) || TYPES[0]
                    return (
                      <tr key={e.id} className={`clickable ${selected.includes(e.id) ? 'selected' : ''}`} style={e.archived ? { opacity: 0.55 } : null} onClick={() => navigate(`/equipements/${e.id}`)}>
                        <td className="check-col" onClick={(ev) => ev.stopPropagation()}><input type="checkbox" checked={selected.includes(e.id)} onChange={(ev) => setSelected(ev.target.checked ? [...selected, e.id] : selected.filter((x) => x !== e.id))} aria-label={`Sélectionner ${e.name}`} /></td>
                        <td className="mono muted nowrap">{e.code}</td>
                        <td>
                          {e.imageUrl && <img className="eq-thumb" src={e.imageUrl} alt="" loading="lazy" />}
                          <span className="strong">{e.name}</span>
                          {e.serialized && <span className="tag" style={{ marginLeft: 6 }}>{(idx.serialsByEq[e.id] || []).length} n° de série</span>}
                          {(e.tags || []).map((t) => <span key={t} className="tag" style={{ marginLeft: 4 }}>{t}</span>)}
                        </td>
                        <td><span className="type-cell small"><Icon name={ty.icon} size={17} style={{ color: 'var(--primary)' }} /> {ty.label.split(' (')[0]}</span></td>
                        <td className="muted">{e.folderName}</td>
                        <td className="muted">{e.location || '—'}</td>
                        <td className="num">{e.stockN ?? '—'}</td>
                        <td className="num"><span className={`avail-pill tl-seg ${e.availToday < 0 ? 'short' : e.availToday === 0 ? 'zero' : 'ok'}`} style={{ position: 'static', borderLeft: 0 }}>{e.availToday}</span></td>
                        {money && <td className="num mono">{fmtMoney(e.rentalPrice, cur)}</td>}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {creating && <NewEquipmentModal folder={folder === 'all' ? idx.d.categories[0]?.id : folder} onClose={() => setCreating(false)} onCreated={(id) => navigate(`/equipements/${id}`)} />}
      {bulk && <BulkModal ids={selected} idx={idx} onClose={() => { setBulk(false); setSelected([]) }} />}
    </>
  )
}

function NewEquipmentModal({ folder, onClose, onCreated }) {
  const store = useStore()
  const [type, setType] = useState('article')
  const [f, setF] = useState({ name: '', code: '', categoryId: folder, rentalPrice: 0, stock: 1 })
  const create = () => {
    if (!f.name.trim()) return toast('Le nom est obligatoire', 'error')
    const id = uid('e_')
    store.upsert('equipment', { id, code: f.code, name: f.name, categoryId: f.categoryId || null, kind: type === 'vente' ? 'vente' : 'location', type: type === 'vente' ? 'article' : type, stock: type === 'kit' ? 0 : f.stock, serialized: false, rentalPrice: f.rentalPrice, subrentalCost: 0, purchasePrice: 0, weight: 0, volume: 0, power: 0, current: 0, location: '', defaultGroup: '', displayInPlanner: true, tags: [], internalRemark: '', externalRemark: '', imageUrl: null, contents: [], accessories: [], alternatives: [], supplierIds: [], archived: false, createdAt: new Date().toISOString() })
    toast(`« ${f.name} » ajouté à la base de données`)
    onClose()
    onCreated(id)
  }
  return (
    <Modal title="Nouvel équipement" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn btn-primary" onClick={create}>Créer</button></>}>
      <div className="type-choice">
        {TYPES.map((t) => (
          <button key={t.id} className={type === t.id ? 'on' : ''} onClick={() => setType(t.id)}>
            <Icon name={t.icon} size={24} />
            <strong>{t.label}</strong>
            <span>{t.help}</span>
          </button>
        ))}
      </div>
      <div className="form-grid" style={{ marginTop: 16 }}>
        <Field label="Nom *" className="full"><input className="input" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Code"><input className="input" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="SON-200" /></Field>
        <Field label="Dossier">
          <select className="select" value={f.categoryId || ''} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
            {store.categories.map((c) => <option key={c.id} value={c.id}>{c.parentId ? '— ' : ''}{c.name}</option>)}
          </select>
        </Field>
        <Field label={type === 'vente' ? 'Prix de vente' : 'Prix de location'}><NumInput className="input input-num" value={f.rentalPrice} onChange={(v) => setF({ ...f, rentalPrice: v })} /></Field>
        {type !== 'kit' && <Field label="Quantité en stock"><NumInput className="input input-num" value={f.stock} onChange={(v) => setF({ ...f, stock: Math.round(v) })} /></Field>}
      </div>
    </Modal>
  )
}

function BulkModal({ ids, idx, onClose }) {
  const [categoryId, setCategoryId] = useState('')
  const [pct, setPct] = useState(0)
  const apply = () => {
    useStore.setState({
      equipment: useStore.getState().equipment.map((e) => (ids.includes(e.id) ? { ...e, ...(categoryId ? { categoryId } : {}), ...(pct ? { rentalPrice: Math.round(e.rentalPrice * (1 + pct / 100) * 100) / 100 } : {}) } : e)),
    })
    toast(`${ids.length} équipement(s) modifié(s)`)
    onClose()
  }
  return (
    <Modal title={`Modifier ${ids.length} équipement(s)`} size="sm" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn btn-primary" onClick={apply}>Appliquer</button></>}>
      <div className="form-grid">
        <Field label="Déplacer vers le dossier" className="full">
          <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">— Ne pas modifier —</option>
            {idx.d.categories.map((c) => <option key={c.id} value={c.id}>{c.parentId ? '— ' : ''}{c.name}</option>)}
          </select>
        </Field>
        <Field label="Ajuster les prix de location (%)" className="full" hint="Ex. 5 pour +5 %, −10 pour −10 %"><NumInput className="input input-num" value={pct} onChange={setPct} /></Field>
      </div>
    </Modal>
  )
}

export { TYPES as EQUIPMENT_TYPES }
