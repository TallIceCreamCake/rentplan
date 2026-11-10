import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import { toast, useIdx, useStore } from '../store'
import { useAccess } from '../lib/auth'
import { Icon } from '../components/ui'
import NotFound from './NotFound'
import { Chunk, DocStyles, DocViewer, Page, PagedDocument, renderBlock, themeStyle, usePagination, useRenderContext } from '../components/doc/DocRender'
import { useDocUser } from '../components/doc/useDocUser'
import { blockLabel, cloneTemplate, newBlock } from '../lib/templates/defaults'
import { defaultLetterheadId, letterheadById, letterheadsFor, letterheadsOf, templateById } from '../lib/templates'
import { findBlock, insertIn, locate, moveIn, removeIn, updateIn } from '../lib/templates/tree'
import { renderTemplate } from '../lib/templates/engine'
import { withEnv } from '../lib/templates/schema'
import { buildDocument, labelDoc, purchaseOrderDoc } from '../lib/documents'
import { DOC_TYPES } from '../lib/model'
import { fmtDate, stableJson, uid } from '../lib/utils'
import { ColumnsPanel, CutPasteModal, InsertPanel, ModulePanel, ModuleStylePanel, PreviewPanel, SignatureModal, StylesPanel, TemplatePanel, TextModal } from './editor/panels'

const DOC_TABS = [
  ['apercu', 'select_all', 'Aperçu'],
  ['modele', 'fact_check', 'Modèle'],
  ['inserer', 'add_circle', 'Insérer : blocs et modules'],
  ['styles', 'format_color_text', 'Styles du document'],
]
const MOD_TABS = [
  ['module', 'edit', 'Module sélectionné'],
  ['colonnes', 'table_chart', 'Colonnes'],
  ['style', 'palette', 'Style du module'],
]

const zoneKey = (t) => `${t.parent || 'root'}:${t.col || 0}:${t.index}`
const stripIds = (b) => {
  const fresh = (x) => {
    const id = uid('b_')
    return {
      ...x,
      id,
      ...(x.type === 'section' ? { columns: (x.columns || []).map((l) => l.map(fresh)) } : {}),
      ...(x.type === 'module' && x.columns ? { columns: x.columns.map((c, i) => ({ ...c, id: `${id}-c${i}` })) } : {}),
      ...(x.type === 'subprojects' ? { children: (x.children || []).map(fresh) } : {}),
    }
  }
  return fresh(b)
}

/** Données d'exemple de l'aperçu : un document existant, ou un document généré à partir d'un projet. */
/** Bon de commande d'exemple : le plus récent, sinon une sous-location fictive du projet le plus fourni. */
function samplePurchaseOrder(sampleId, idx) {
  const pos = [...idx.d.purchaseOrders].sort((a, b) => String(b.date).localeCompare(String(a.date)))
  const chosen = sampleId !== '__exemple' && (pos.find((p) => p.id === sampleId) || (!sampleId && pos[0]))
  if (chosen) return purchaseOrderDoc(chosen, idx)
  const supplier = idx.d.contacts.find((c) => c.type === 'fournisseur')
  const sr = idx.d.subrents[0]
  const eq = idx.d.equipment.filter((e) => e.kind !== 'vente').slice(0, 2)
  return purchaseOrderDoc({ id: '__exemple', number: 'BC-EXEMPLE', supplierId: supplier?.id || null, projectId: sr?.projectId || idx.d.projects[0]?.id || null, subrentId: sr?.id || null, date: new Date().toISOString().slice(0, 10), status: 'brouillon', lines: eq.length ? eq.map((e, i) => ({ label: `Sous-location ${e.name}`, quantity: 2 + i, price: Number(e.subrentalCost) || 40 })) : [{ label: 'Sous-location (exemple)', quantity: 2, price: 40 }], notes: '', body: '<p>Livraison au dépôt la veille de l’événement, avant 17 h.</p>' }, idx)
}

/** Étiquette d'exemple : un numéro de série (le choisi, sinon le premier), à défaut un équipement. */
function sampleLabel(sampleId, idx) {
  const sn = idx.d.serials.find((x) => x.id === sampleId) || idx.d.serials[0]
  if (sn) return labelDoc({ serialId: sn.id }, idx)
  return labelDoc({ equipmentId: idx.d.equipment[0]?.id }, idx)
}

function useSample(type, sampleId, idx) {
  return useMemo(() => {
    if (type === 'commande') return samplePurchaseOrder(sampleId, idx)
    if (type === 'etiquette') return sampleLabel(sampleId, idx)
    const docs = idx.d.documents.filter((d) => d.type === type).sort((a, b) => String(b.date).localeCompare(String(a.date)))
    const chosen = sampleId !== '__exemple' && (docs.find((d) => d.id === sampleId) || (!sampleId && docs[0]))
    if (chosen) return chosen
    // Projet le plus fourni (matériel et fonctions) pour montrer tous les modules
    const score = (p) => (idx.subsByProject[p.id] || []).reduce((s, sp) => s + (idx.linesBySub[sp.id]?.length || 0) + 3 * (idx.fnsBySub[sp.id]?.length || 0), 0)
    const p = [...idx.d.projects].sort((a, b) => score(b) - score(a))[0]
    if (p) return { ...buildDocument(p.id, type, idx.d, { number: 'EXEMPLE' }), id: '__exemple', body: '<p>{$f.greeting}</p><p>Texte du document saisi lors de la génération (exemple).</p>' }
    return { id: '__exemple', type, number: 'EXEMPLE', version: 1, date: new Date().toISOString().slice(0, 10), dueDate: null, status: 'brouillon', subprojectIds: [], sections: [], totals: { categories: {}, vatRate: idx.settings.vatRate }, content: { subprojects: [], periods: [], tasks: [], notes: [] }, payments: [], extraLines: [] }
  }, [type, sampleId, idx])
}

export default function TemplateEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const idx = useIdx()
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const access = useAccess()
  const user = useDocUser()
  const saved = useMemo(() => templateById(settings, id), [settings, id])

  const [draft, setDraft] = useState(saved)
  const draftRef = useRef(draft)
  draftRef.current = draft
  const [hist, setHist] = useState({ past: [], future: [] })
  const merge = useRef({ key: null, at: 0 })
  const [sel, setSel] = useState(null)
  const [hover, setHover] = useState(null)
  const [tab, setTab] = useState('apercu')
  const [advanced, setAdvanced] = useState(false)
  const [sampleId, setSampleId] = useState('')
  const [lhId, setLhId] = useState(() => defaultLetterheadId(settings, saved?.type || 'devis'))
  const [showBg, setShowBg] = useState(true)
  const [modal, setModal] = useState(null)
  const [over, setOver] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [pageCount, setPageCount] = useState(1)
  const [previewPages, setPreviewPages] = useState(1)
  const dragRef = useRef(null)

  // Autre modèle ouvert (ou modèle enregistré depuis un autre onglet sans modification locale)
  const loaded = useRef(id)
  useEffect(() => {
    if (loaded.current !== id) {
      loaded.current = id
      setDraft(saved)
      setHist({ past: [], future: [] })
      setSel(null)
    }
  }, [id, saved])

  const editable = Boolean(draft && !draft.system && access.can('configuration', 'modification'))
  const dirty = useMemo(() => Boolean(draft && saved && stableJson(draft) !== stableJson(saved)), [draft, saved])

  useEffect(() => {
    if (!dirty) return undefined
    const h = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  const commit = useCallback(
    (next, key) => {
      if (!editable) return
      const cur = draftRef.current
      const value = typeof next === 'function' ? next(cur) : next
      const now = Date.now()
      const same = key && merge.current.key === key && now - merge.current.at < 900
      merge.current = { key, at: now }
      if (!same) setHist((h) => ({ past: [...h.past.slice(-80), cur], future: [] }))
      draftRef.current = value
      setDraft(value)
    },
    [editable],
  )
  const undo = useCallback(() => {
    setHist((h) => {
      if (!h.past.length) return h
      const prev = h.past[h.past.length - 1]
      const cur = draftRef.current
      draftRef.current = prev
      setDraft(prev)
      return { past: h.past.slice(0, -1), future: [cur, ...h.future] }
    })
    merge.current = { key: null, at: 0 }
  }, [])
  const redo = useCallback(() => {
    setHist((h) => {
      if (!h.future.length) return h
      const [next, ...rest] = h.future
      const cur = draftRef.current
      draftRef.current = next
      setDraft(next)
      return { past: [...h.past, cur], future: rest }
    })
    merge.current = { key: null, at: 0 }
  }, [])

  const patchTpl = (patch, key) => commit((t) => ({ ...t, ...patch }), key)
  const patchStyle = (patch, key) => commit((t) => ({ ...t, style: { ...t.style, ...patch } }), key)
  const patchBlockOf = (bid) => (patch, key) => commit((t) => ({ ...t, blocks: updateIn(t.blocks, bid, (b) => ({ ...b, ...(typeof patch === 'function' ? patch(b) : patch) })) }), key)
  const removeBlock = (bid) => {
    commit((t) => ({ ...t, blocks: removeIn(t.blocks, bid)[0] }))
    if (sel === bid) setSel(null)
    setHover(null)
  }

  const save = useCallback(() => {
    const d = draftRef.current
    if (!d || d.system || !access.can('configuration', 'modification')) return
    const list = useStore.getState().settings.documentTemplates || []
    const clean = { ...d, updatedAt: new Date().toISOString() }
    updateSettings({ documentTemplates: list.some((t) => t.id === d.id) ? list.map((t) => (t.id === d.id ? clean : t)) : [...list, clean] })
    draftRef.current = clean
    setDraft(clean)
    toast('Modèle enregistré')
  }, [access, updateSettings])

  const close = () => {
    if (dirty && !confirm('Quitter l’éditeur sans enregistrer les modifications ?')) return
    navigate('/configuration?s=modeles-documents')
  }
  const duplicate = () => {
    const copy = cloneTemplate(draftRef.current, { name: `${draftRef.current.name} - copie` })
    updateSettings({ documentTemplates: [...(useStore.getState().settings.documentTemplates || []), copy] })
    toast('Modèle dupliqué : vous pouvez le modifier')
    navigate(`/editeur/${copy.id}`)
  }

  // Raccourcis : annuler / rétablir, enregistrer, supprimer le bloc sélectionné
  useEffect(() => {
    const onKey = (e) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        save()
      } else if (typing || modal) return
      else if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && sel && editable) {
        e.preventDefault()
        removeBlock(sel)
      } else if (e.key === 'Escape') setSel(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const sample = useSample(draft?.type || 'devis', sampleId, idx)
  const letterhead = letterheadById(settings, lhId) || letterheadsOf(settings)[0]
  const rctx = useRenderContext({ doc: sample, template: draft || saved, idx, user, editor: true })
  if (!draft) return <NotFound what="Ce modèle de document" />
  const selected = sel ? findBlock(draft.blocks, sel) : null

  // ---------- Glisser-déposer ----------
  const startDrag = (e, payload) => {
    if (!editable) return e.preventDefault()
    dragRef.current = payload
    e.dataTransfer.effectAllowed = payload.move ? 'move' : 'copy'
    e.dataTransfer.setData('text/plain', 'bloc')
    setTimeout(() => setDragging(true), 0)
  }
  const endDrag = () => {
    dragRef.current = null
    setDragging(false)
    setOver(null)
  }
  const make = (p) => (p.add === 'section' ? newBlock('section', { cols: p.cols }) : newBlock(p.add))
  const dropAt = (target) => {
    const p = dragRef.current
    endDrag()
    if (!p || !editable) return
    if (p.move) {
      if (p.move === target.parent) return
      commit((t) => ({ ...t, blocks: moveIn(t.blocks, p.move, target) }))
      setSel(p.move)
    } else {
      const b = make(p)
      commit((t) => ({ ...t, blocks: insertIn(t.blocks, target, b) }))
      setSel(b.id)
      setTab('module')
    }
  }
  const addFromPalette = (p) => {
    const b = make(p)
    const at = sel && locate(draft.blocks, sel)
    commit((t) => ({ ...t, blocks: insertIn(t.blocks, at ? { ...at, index: at.index + 1 } : { parent: null, index: t.blocks.length }, b) }))
    setSel(b.id)
    setTab('module')
    setTimeout(() => document.querySelector(`.ed-pages [data-block="${b.id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 120)
  }

  const ctx = {
    sel,
    hover,
    over,
    dragging,
    editable,
    dragRef,
    setHover,
    setOver,
    startDrag,
    endDrag,
    dropAt,
    select: (bid) => {
      setSel(bid)
      if (!['module', 'colonnes', 'style'].includes(tab)) setTab('module')
    },
    edit: (bid) => {
      setSel(bid)
      setTab('module')
    },
    clear: () => setSel(null),
    remove: removeBlock,
  }

  const docs = draft.type === 'etiquette'
    ? idx.d.serials.slice(0, 60).map((sn) => ({ id: sn.id, label: `${sn.serial} — ${idx.eq[sn.equipmentId]?.name || ''}` }))
    : (draft.type === 'commande' ? idx.d.purchaseOrders.map((p) => ({ ...p, type: 'commande' })) : idx.d.documents.filter((d) => d.type === draft.type))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 60)
    .map((d) => (draft.type === 'etiquette' ? d : { id: d.id, label: `${DOC_TYPES[d.type].label} ${d.number} — ${draft.type === 'commande' ? idx.contact[d.supplierId]?.company || 'Sans fournisseur' : idx.project[d.projectId]?.name || 'Sans projet'} (${fmtDate(d.date)})` }))
  const moduleTab = ['module', 'colonnes', 'style'].includes(tab)
  const patchSel = selected ? patchBlockOf(selected.id) : () => {}

  let panel = null
  if (tab === 'apercu') panel = <PreviewPanel docs={docs} sampleId={sampleId || docs[0]?.id || '__exemple'} setSampleId={setSampleId} lhId={letterhead?.id} setLhId={setLhId} letterheads={draft.type === 'etiquette' ? letterheadsFor(settings, 'etiquette') : letterheadsOf(settings)} showBg={showBg} setShowBg={setShowBg} onPaged={() => setModal('paged')} />
  else if (tab === 'modele') panel = <TemplatePanel tpl={draft} patch={patchTpl} editable={editable} onSignature={() => setModal('signature')} onHeader={() => setModal('header')} onFooter={() => setModal('footer')} />
  else if (tab === 'inserer') panel = <InsertPanel type={draft.type} onAdd={addFromPalette} startDrag={startDrag} endDrag={endDrag} editable={editable} />
  else if (tab === 'styles') panel = <StylesPanel tpl={draft} patchStyle={patchStyle} editable={editable} />
  else if (tab === 'module')
    panel = (
      <ModulePanel
        block={selected}
        docType={draft.type}
        editable={editable}
        advanced={advanced}
        setAdvanced={setAdvanced}
        patchBlock={patchSel}
        patchOptions={(patch, key) => patchSel((b) => ({ options: { ...b.options, ...patch } }), key)}
        patchStyle={(patch, key) => patchSel((b) => ({ style: { ...b.style, ...patch } }), key)}
        onCutPaste={() => setModal('json')}
      />
    )
  else if (tab === 'colonnes') panel = <ColumnsPanel block={selected} editable={editable} patchBlock={patchSel} />
  else if (tab === 'style') panel = <ModuleStylePanel block={selected} editable={editable} patchStyle={(patch, key) => patchSel((b) => ({ style: { ...b.style, ...patch } }), key)} />

  return (
    <div className={`ed ${dragging ? 'dragging' : ''}`}>
      <div className="ed-canvas" onMouseLeave={() => setHover(null)} onClick={() => setSel(null)}>
        {draft.system && (
          <div className="ed-banner" onClick={(e) => e.stopPropagation()}>
            <Icon name="lock" size={18} />
            <span className="ed-banner-text">Modèle système « {draft.name} » ({DOC_TYPES[draft.type].label}) : il ne peut pas être modifié directement.</span>
            <button className="btn btn-sm btn-primary" onClick={duplicate}><Icon name="content_copy" size={16} /> Dupliquer pour modifier</button>
          </div>
        )}
        {!draft.system && !editable && <div className="ed-banner" onClick={(e) => e.stopPropagation()}><Icon name="visibility" size={18} /><span className="ed-banner-text">Lecture seule : votre rôle ne permet pas de modifier la configuration.</span></div>}
        <DocViewer
          className="ed-viewer"
          pages={pageCount}
          pageWidth={Number(letterhead.width) || 21}
          initialFit
          actions={<button type="button" className="pdfv-btn" onClick={(e) => { e.stopPropagation(); setModal('paged') }}><Icon name="picture_as_pdf" size={18} /> Aperçu du PDF</button>}
        >
          <EditorCtx.Provider value={ctx}>
            <EditorPages tpl={draft} lh={letterhead} rctx={rctx} showBg={showBg} onPages={setPageCount} />
          </EditorCtx.Provider>
        </DocViewer>
      </div>

      <aside className="ed-side">
        <div className="ed-top">
          <button className="ed-icon" onClick={undo} disabled={!hist.past.length} title="Annuler (Ctrl+Z)" aria-label="Annuler"><Icon name="undo" size={20} /></button>
          <button className="ed-icon" onClick={redo} disabled={!hist.future.length} title="Rétablir (Ctrl+Maj+Z)" aria-label="Rétablir"><Icon name="redo" size={20} /></button>
          {dirty ? <span className="ed-dirty"><span className="dot" /> Modifications non enregistrées</span> : <span className="ed-saved">{draft.system ? 'Modèle système' : 'Enregistré'}</span>}
          <span className="spacer" />
          <button className="ed-btn" onClick={close}>Fermer</button>
          {draft.system ? (
            <button className="ed-btn primary" onClick={duplicate}>Dupliquer</button>
          ) : (
            <button className="ed-btn primary" onClick={save} disabled={!editable || !dirty}>Sauvegarder</button>
          )}
        </div>
        <div className="ed-main">
          <nav className="ed-rail" aria-label="Onglets de l’éditeur">
            <div className="ed-rail-title">Document</div>
            {DOC_TABS.map(([k, icon, label]) => (
              <button key={k} className={`ed-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)} data-tip={label} aria-label={label}>
                <Icon name={icon} size={21} />
              </button>
            ))}
            <div className="ed-rail-title">Module</div>
            {MOD_TABS.map(([k, icon, label]) => (
              <button key={k} className={`ed-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)} data-tip={selected ? label : `${label} — sélectionnez d’abord un module`} aria-label={label} disabled={!selected && k !== 'module'}>
                <Icon name={icon} size={21} />
              </button>
            ))}
          </nav>
          <div className={`ed-panel ${moduleTab && !selected ? 'muted' : ''}`} key={`${tab}-${moduleTab ? sel : ''}`}>
            {panel}
          </div>
        </div>
      </aside>

      {modal === 'signature' && <SignatureModal tpl={draft} editable={editable} onClose={() => setModal(null)} onSave={(signature) => { patchTpl({ signature }); setModal(null) }} />}
      {modal === 'header' && <TextModal title="Texte d’en-tête" value={draft.headerText} docType={draft.type} editable={editable} onClose={() => setModal(null)} onSave={(headerText) => { patchTpl({ headerText }); setModal(null) }} />}
      {modal === 'footer' && <TextModal title="Pied de page" value={draft.footerText} docType={draft.type} editable={editable} onClose={() => setModal(null)} onSave={(footerText) => { patchTpl({ footerText }); setModal(null) }} />}
      {modal === 'json' && selected && (
        <CutPasteModal
          block={selected}
          editable={editable}
          onClose={() => setModal(null)}
          onApply={(v) => {
            patchSel(() => ({ ...v, id: selected.id }))
            setModal(null)
            toast('Configuration appliquée')
          }}
          onInsertCopy={(v) => {
            const b = stripIds(v)
            const at = locate(draft.blocks, selected.id)
            commit((t) => ({ ...t, blocks: insertIn(t.blocks, { ...at, index: at.index + 1 }, b) }))
            setSel(b.id)
            setModal(null)
          }}
        />
      )}
      {modal === 'paged' && createPortal(
        <div className="ed-paged">
          <div className="ed-paged-bar">
            <Icon name="picture_as_pdf" size={20} style={{ color: '#f2557a' }} />
            <strong>Aperçu du PDF</strong> — {draft.name} · {letterhead?.name} · données de {sample.number}
            <span className="spacer" />
            <button className="ed-btn" onClick={() => setModal(null)}>Fermer</button>
          </div>
          <DocViewer className="ed-paged-viewer" pages={previewPages} pageWidth={Number(letterhead.width) || 21} initialFit>
            <PagedDocument doc={sample} template={draft} letterhead={letterhead} idx={idx} user={user} showBackground={showBg} onPages={setPreviewPages} />
          </DocViewer>
        </div>,
        document.body,
      )}
    </div>
  )
}

// ---------- Pages de l'éditeur : mêmes pages que le PDF, blocs sélectionnables et déplaçables ----------
const EditorCtx = createContext(null)

/** Morceau unique d'une section ou d'un bloc Sous-projets (leur contenu reste éditable). */
function containerChunk(b, index, rctx) {
  const st = b.style || {}
  return { key: `${b.id}:box`, blockId: b.id, index, cls: `dk dk-${b.type} b-${b.id}`, style: {}, pad: { top: Number(st.marginTop) || 0, bottom: Number(st.marginBottom) || 0, left: Number(st.marginLeft) || 0, right: Number(st.marginRight) || 0 }, el: <ContainerBody block={b} rctx={rctx} /> }
}

function EditorPages({ tpl, lh, rctx, showBg, onPages }) {
  const chunks = useMemo(() => tpl.blocks.flatMap((b, index) => (b.type === 'section' || b.type === 'subprojects' ? [containerChunk(b, index, rctx)] : renderBlock(b, rctx).map((c) => ({ ...c, index })))), [tpl.blocks, rctx])
  const { pages, byKey, measure } = usePagination(chunks, lh, { keepBreaks: true })
  const ends = useMemo(() => {
    const first = {}
    const last = {}
    for (const c of chunks) {
      first[c.blockId] ??= c.key
      last[c.blockId] = c.key
    }
    return { first, last }
  }, [chunks])
  const blockAt = useMemo(() => Object.fromEntries(tpl.blocks.map((b, i) => [b.id, { b, i }])), [tpl.blocks])
  useEffect(() => {
    onPages(pages.length)
  }, [pages.length, onPages])
  return (
    <div className={`doc-render tpl-${tpl.id}`} style={themeStyle(tpl)}>
      <DocStyles template={tpl} />
      {measure}
      <div className="doc-pages ed-pages">
        {pages.map((pg, n) => {
          // Morceaux consécutifs d'un même bloc : un segment (un bloc coupé sur deux pages en a deux)
          const segs = []
          for (const e of pg) {
            const c = byKey.get(e.ref)
            if (!c) continue
            const lastSeg = segs[segs.length - 1]
            if (lastSeg && lastSeg.blockId === c.blockId) lastSeg.items.push({ e, c })
            else segs.push({ blockId: c.blockId, items: [{ e, c }] })
          }
          return (
            <Page key={n} n={n + 1} total={pages.length} lh={lh} template={tpl} env={rctx.env} showBackground={showBg}>
              {segs.map((sg) => {
                const at = blockAt[sg.blockId]
                const body = sg.items.map(({ e, c }) => <Chunk key={e.id} c={c} />)
                if (!at) return <Fragment key={sg.items[0].e.id}>{body}</Fragment>
                return (
                  <Segment key={sg.items[0].e.id} block={at.b} index={at.i} first={sg.items.some(({ e }) => e.ref === ends.first[sg.blockId])} last={sg.items.some(({ e }) => e.ref === ends.last[sg.blockId])}>
                    {body}
                  </Segment>
                )
              })}
              {n === pages.length - 1 && <EndDrop index={tpl.blocks.length} empty={!tpl.blocks.length} />}
            </Page>
          )
        })}
      </div>
    </div>
  )
}

function BlockBar({ block }) {
  const ctx = useContext(EditorCtx)
  return (
    <div className="eb-bar" onClick={(e) => e.stopPropagation()}>
      <span className="eb-handle" draggable={ctx.editable} onDragStart={(e) => ctx.startDrag(e, { move: block.id })} onDragEnd={ctx.endDrag} title={ctx.editable ? 'Glisser pour déplacer' : ''}>
        <Icon name="drag_indicator" size={17} />
      </span>
      <span className="eb-name" onClick={() => ctx.select(block.id)}>{blockLabel(block)}</span>
      <span className="spacer" />
      <button type="button" title="Modifier" aria-label="Modifier" onClick={() => ctx.edit(block.id)}><Icon name="edit" size={16} /></button>
      {ctx.editable && <button type="button" title="Supprimer" aria-label="Supprimer" onClick={() => ctx.remove(block.id)}><Icon name="delete" size={16} /></button>}
    </div>
  )
}

/** Bloc de premier niveau (ou sa partie sur une page) : survol, sélection, dépôt avant / après. */
function Segment({ block, index, first, last, children }) {
  const ctx = useContext(EditorCtx)
  const ref = useRef(null)
  const target = (e) => {
    const r = ref.current.getBoundingClientRect()
    return { parent: null, col: 0, index: first && e.clientY < r.top + r.height / 2 ? index : index + 1 }
  }
  const before = first && ctx.over === zoneKey({ parent: null, col: 0, index })
  const after = last && ctx.over === zoneKey({ parent: null, col: 0, index: index + 1 })
  return (
    <div
      ref={ref}
      className={`eb seg eb-${block.type} ${ctx.sel === block.id ? 'sel' : ''} ${ctx.hover === block.id ? 'hover' : ''} ${before ? 'drop-before' : ''} ${after ? 'drop-after' : ''} ${first ? '' : 'cont'}`}
      data-block={block.id}
      onMouseOver={(e) => {
        e.stopPropagation()
        if (ctx.hover !== block.id) ctx.setHover(block.id)
      }}
      onClick={(e) => {
        e.stopPropagation()
        ctx.select(block.id)
      }}
      onDragOver={(e) => {
        if (!ctx.dragRef.current) return
        e.preventDefault()
        e.stopPropagation()
        const k = zoneKey(target(e))
        if (ctx.over !== k) ctx.setOver(k)
      }}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        ctx.dropAt(target(e))
      }}
    >
      {first && <BlockBar block={block} />}
      {children}
    </div>
  )
}

/** Espace libre en bas de la dernière page : dépôt à la fin du document. */
function EndDrop({ index, empty }) {
  const ctx = useContext(EditorCtx)
  const key = zoneKey({ parent: null, col: 0, index })
  return (
    <div
      className={`ed-end ${ctx.over === key ? 'over' : ''} ${empty ? 'empty' : ''}`}
      onDragOver={(e) => {
        if (!ctx.dragRef.current) return
        e.preventDefault()
        e.stopPropagation()
        if (ctx.over !== key) ctx.setOver(key)
      }}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        ctx.dropAt({ parent: null, col: 0, index })
      }}
    >
      {empty ? <span>{ctx.editable ? 'Faites glisser un bloc ou un module ici' : 'Modèle vide'}</span> : ctx.dragging ? <span>Déposer à la fin du document</span> : null}
    </div>
  )
}

function DropZone({ target, big }) {
  const ctx = useContext(EditorCtx)
  const key = zoneKey(target)
  return (
    <div
      className={`ez ${ctx.over === key ? 'over' : ''} ${big ? 'big' : ''}`}
      onDragOver={(e) => {
        if (!ctx.dragRef.current) return
        e.preventDefault()
        e.stopPropagation()
        if (ctx.over !== key) ctx.setOver(key)
      }}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        ctx.dropAt(target)
      }}
    >
      {big && <span>{ctx.editable ? 'Déposez un module ici' : 'Vide'}</span>}
    </div>
  )
}

/** Liste imbriquée (colonnes d'une section, contenu d'un bloc Sous-projets). */
function BlockList({ list, parent, col, rctx }) {
  if (!list.length) return <DropZone target={{ parent, col, index: 0 }} big />
  return (
    <div className="eb-list">
      <DropZone target={{ parent, col, index: 0 }} />
      {list.map((b, i) => (
        <Fragment key={b.id}>
          <EditorBlock block={b} rctx={rctx} target={{ parent, col, index: i }} />
          <DropZone target={{ parent, col, index: i + 1 }} />
        </Fragment>
      ))}
    </div>
  )
}

function ContainerBody({ block, rctx }) {
  if (block.type === 'section') {
    const inner = { ...rctx, nested: true }
    return (
      <div className="dk-cols" style={{ gridTemplateColumns: (block.widths || []).map((w) => `minmax(0, ${Math.max(1, Number(w) || 1)}fr)`).join(' '), columnGap: Number(block.gap) || 0, alignItems: block.valign === 'middle' ? 'center' : block.valign === 'bottom' ? 'end' : 'start' }}>
        {(block.columns || []).map((l, c) => (
          <div key={c} className="dk-col ed-col">
            <BlockList list={l} parent={block.id} col={c} rctx={inner} />
          </div>
        ))}
      </div>
    )
  }
  const sp = rctx.content.subprojects[0]
  const inner = sp ? { ...rctx, env: withEnv(rctx.env, { sub: rctx.idx.sub[sp.id] || { id: sp.id, name: sp.name, status: sp.status, projectId: rctx.doc.projectId } }), subs: [sp], inSub: true } : rctx
  return (
    <div className="ed-subprojects">
      {block.options?.showTitle && <h2 className="dk-subtitle-h">{renderTemplate(block.options.title || '{$sp.name}', inner.env, { html: false }) || 'Sous-projet'}</h2>}
      <BlockList list={block.children || []} parent={block.id} col={0} rctx={inner} />
      <div className="ed-sub-note"><Icon name="repeat" size={14} /> Répété pour chaque sous-projet du document</div>
    </div>
  )
}

/** Bloc imbriqué dans une section ou un bloc Sous-projets. */
function EditorBlock({ block, rctx, target }) {
  const ctx = useContext(EditorCtx)
  const ref = useRef(null)
  const half = (e) => {
    const r = ref.current.getBoundingClientRect()
    return { ...target, index: target.index + (e.clientY > r.top + r.height / 2 ? 1 : 0) }
  }
  // Rendu mémorisé : le survol et la sélection ne recalculent pas les modules
  const chunks = useMemo(() => (block.type === 'section' || block.type === 'subprojects' ? null : renderBlock(block, rctx)), [block, rctx])
  const st = block.style || {}
  const body = chunks ? chunks.map((c) => <Chunk key={c.key} c={c} />) : (
    <div className={`dk dk-${block.type} b-${block.id}`} style={{ paddingTop: Number(st.marginTop) || 0, paddingBottom: Number(st.marginBottom) || 0, paddingLeft: Number(st.marginLeft) || 0, paddingRight: Number(st.marginRight) || 0 }}>
      <ContainerBody block={block} rctx={rctx} />
    </div>
  )
  return (
    <div
      ref={ref}
      className={`eb ${ctx.sel === block.id ? 'sel' : ''} ${ctx.hover === block.id ? 'hover' : ''} eb-${block.type}`}
      data-block={block.id}
      onMouseOver={(e) => {
        e.stopPropagation()
        if (ctx.hover !== block.id) ctx.setHover(block.id)
      }}
      onClick={(e) => {
        e.stopPropagation()
        ctx.select(block.id)
      }}
      onDragOver={(e) => {
        if (!ctx.dragRef.current) return
        e.preventDefault()
        e.stopPropagation()
        const k = zoneKey(half(e))
        if (ctx.over !== k) ctx.setOver(k)
      }}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        ctx.dropAt(half(e))
      }}
    >
      <BlockBar block={block} />
      {body}
    </div>
  )
}
