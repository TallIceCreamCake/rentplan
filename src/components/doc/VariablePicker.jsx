import { useMemo, useState } from 'react'
import { useStore } from '../../store'
import { Icon, Modal } from '../ui'
import { pickerEntries, pickerRoots, pickerSearch, SCHEMA } from '../../lib/templates/schema'

/**
 * « Toutes les variables » : on part de « Début », on descend avec », on recherche à partir de 3 lettres
 * (sur deux niveaux, comme Rentman). onAdd(path, label, type) reçoit « f.project.number ».
 */
export default function VariablePicker({ docType = 'devis', row = null, page = false, title = 'Toutes les variables', onAdd, onClose }) {
  const settings = useStore((s) => s.settings)
  const roots = useMemo(() => pickerRoots({ docType, row, page }), [docType, row, page])
  // trail : [{ label, node, key }] — le premier élément est la racine choisie
  const [trail, setTrail] = useState([])
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState(null)
  const node = trail.length ? trail[trail.length - 1].node : null
  // Chemin complet : préfixe de la racine (f, company…), champs traversés, puis la variable
  const pathOf = (keys) => [trail[0]?.prefix, ...trail.slice(1).map((t) => t.key), ...keys.map((k) => k.key)].filter(Boolean).join('.')
  const entries = node ? pickerEntries(node, settings) : roots.map((r) => ({ key: r.prefix, label: r.label, ref: r.node, root: r }))
  const results = q.trim().length >= 3 ? (node ? pickerSearch(node, q, settings) : roots.flatMap((r) => pickerSearch(r.node, q, settings).map((p) => [{ ...r, key: r.prefix, ref: r.node, root: r }, ...p]))) : null

  const enter = (e) => {
    setTrail([...trail, e.root ? { label: e.label, node: e.ref, key: '', prefix: e.root.prefix } : { label: e.label, node: e.ref, key: e.key }])
    setQ('')
    setPicked(null)
  }
  const choose = (keys, e) => setPicked({ path: pathOf(keys), label: e.label, type: e.type })
  const add = (p = picked) => p && onAdd(p.path, p.label, p.type)

  return (
    <Modal
      title={title}
      size="var"
      onClose={onClose}
      footer={
        <>
          <span className="vp-path mono">{picked ? `{$${picked.path}}` : ''}</span>
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" disabled={!picked} onClick={() => add()}>Ajouter</button>
        </>
      }
    >
      <div className="vp">
        <div className="vp-crumbs">
          <button className="btn-link" onClick={() => { setTrail([]); setPicked(null) }}>Début</button>
          {trail.map((t, i) => (
            <span key={i} className="vp-crumb">
              <Icon name="chevron_right" size={16} />
              <button className="btn-link" onClick={() => { setTrail(trail.slice(0, i + 1)); setPicked(null) }}>{t.label}</button>
            </span>
          ))}
          {!trail.length && <Icon name="chevron_right" size={16} />}
        </div>
        <div className="vp-search">
          <Icon name="search" size={18} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Entrez au moins trois lettres pour rechercher" aria-label="Rechercher une variable" />
          {q && <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setQ('')} aria-label="Effacer"><Icon name="close" size={17} /></button>}
        </div>
        <div className="vp-list">
          {results
            ? results.map((path) => {
                const leaf = path[path.length - 1]
                const p = node ? pathOf(path) : [path[0].root.prefix, ...path.slice(1).map((k) => k.key)].filter(Boolean).join('.')
                return (
                  <button key={p} className={`vp-item ${picked?.path === p ? 'on' : ''}`} onClick={() => setPicked({ path: p, label: leaf.label, type: leaf.type })} onDoubleClick={() => add({ path: p, label: leaf.label, type: leaf.type })}>
                    <span>{path.map((k) => k.label).join(' › ')}</span>
                    <span className="vp-code mono">{`{$${p}}`}</span>
                  </button>
                )
              })
            : entries.map((e) =>
                e.ref ? (
                  <button key={e.key || e.label} className="vp-item" onClick={() => enter(e)}>
                    <span>{e.label}</span>
                    <Icon name="keyboard_double_arrow_right" size={22} className="vp-go" />
                  </button>
                ) : (
                  <button key={e.key} className={`vp-item ${picked?.path === pathOf([e]) ? 'on' : ''}`} onClick={() => choose([e], e)} onDoubleClick={() => add({ path: pathOf([e]), label: e.label, type: e.type })}>
                    <span>{e.label}</span>
                    <span className="vp-code mono">{`{$${pathOf([e])}}`}</span>
                  </button>
                ),
              )}
          {results && !results.length && <div className="vp-empty">Aucune variable trouvée à moins de deux niveaux de « {trail.length ? trail[trail.length - 1].label : 'Début'} ».</div>}
        </div>
        {node && SCHEMA[node] && !results && <div className="vp-hint">Double-cliquez sur une variable pour l’ajouter directement.</div>}
      </div>
    </Modal>
  )
}
