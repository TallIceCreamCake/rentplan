import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast, useStore } from '../../store'
import { useAccess } from '../../lib/auth'
import { ColorPicker, Empty, Field, Icon, Menu, Modal, NumInput, SelectionBar, Toggle } from '../../components/ui'
import RichText from '../../components/doc/RichText'
import { PageBackground } from '../../components/doc/DocRender'
import { allTemplates, defaultTemplateId, letterheadsOf } from '../../lib/templates'
import { blankLetterhead, blankTemplate, cloneTemplate, COUNTRIES, DEFAULT_LETTERHEADS, LANGUAGES, PAGE_SIZES, VISIBILITY } from '../../lib/templates/defaults'
import { DOC_TYPES } from '../../lib/model'
import { DB_ENABLED, uploadFile } from '../../lib/db'
import { matches, stableJson, uid } from '../../lib/utils'
import { HeaderActions } from './slot'

const LANG = Object.fromEntries(LANGUAGES)
const yesNo = (v) => (v ? 'Oui' : 'Non')

// ====================================================================== Modèles de documents

export function DocumentTemplatesPanel() {
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const access = useAccess()
  const navigate = useNavigate()
  const editable = access.can('configuration', 'modification')
  const [type, setType] = useState('tous')
  const [q, setQ] = useState('')
  const [checked, setChecked] = useState([])
  const [adding, setAdding] = useState(false)
  const list = allTemplates(settings).filter((t) => (type === 'tous' || t.type === type) && matches(q, t.name, DOC_TYPES[t.type]?.label))
  const own = settings.documentTemplates || []
  const defaults = settings.defaultTemplates || {}
  const isDefault = (t) => defaultTemplateId(settings, t.type) === t.id

  const setHidden = (ids, hidden) => {
    const sys = new Set(settings.hiddenSystemTemplates || [])
    for (const id of ids) if (id.startsWith('sys_')) (hidden ? sys.add(id) : sys.delete(id))
    updateSettings({ hiddenSystemTemplates: [...sys], documentTemplates: own.map((t) => (ids.includes(t.id) ? { ...t, hidden } : t)) })
  }
  const duplicate = (ids) => {
    const copies = allTemplates(settings).filter((t) => ids.includes(t.id)).map((t) => cloneTemplate(t, { name: `${t.name} - copie` }))
    updateSettings({ documentTemplates: [...own, ...copies] })
    toast(copies.length > 1 ? `${copies.length} modèles dupliqués` : `Modèle « ${copies[0].name} » créé`)
    return copies
  }
  const remove = (ids) => {
    const mine = ids.filter((id) => !id.startsWith('sys_'))
    if (!mine.length) return toast('Les modèles système ne peuvent pas être supprimés (masquez-les).', 'error')
    const used = useStore.getState().documents.filter((d) => mine.includes(d.templateId)).length
    if (!confirm(`Supprimer ${mine.length} modèle${mine.length > 1 ? 's' : ''} ?${used ? `\n${used} document${used > 1 ? 's' : ''} utilisant ce modèle passeront au modèle par défaut.` : ''}`)) return
    const nextDefaults = Object.fromEntries(Object.entries(defaults).filter(([, v]) => !mine.includes(v)))
    updateSettings({ documentTemplates: own.filter((t) => !mine.includes(t.id)), defaultTemplates: nextDefaults })
    setChecked([])
  }
  const all = list.length > 0 && list.every((t) => checked.includes(t.id))

  return (
    <div className="stack">
      <div className="card">
        {checked.length ? (
          <SelectionBar count={checked.length} onClear={() => setChecked([])}>
            {editable && (
              <>
                <button className="btn btn-sm" onClick={() => { duplicate(checked); setChecked([]) }}><Icon name="content_copy" size={16} /> Dupliquer</button>
                <button className="btn btn-sm" onClick={() => setHidden(checked, true)}><Icon name="visibility_off" size={16} /> Masquer</button>
                <button className="btn btn-sm" onClick={() => setHidden(checked, false)}><Icon name="visibility" size={16} /> Afficher</button>
                <button className="btn btn-sm btn-danger" onClick={() => remove(checked)}><Icon name="delete" size={16} /> Supprimer</button>
              </>
            )}
          </SelectionBar>
        ) : (
          <div className="grid-toolbar">
            <div className="chips">
              {[['tous', 'Tous'], ...Object.entries(DOC_TYPES).map(([k, d]) => [k, d.plural])].map(([k, l]) => (
                <button key={k} className={`chip ${type === k ? 'on' : ''}`} onClick={() => setType(k)}>{l}</button>
              ))}
            </div>
            <div className="search underline" style={{ width: 240 }}>
              <Icon name="search" size={19} className="icon" />
              <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un modèle" aria-label="Rechercher un modèle" />
            </div>
            <span className="spacer" />
            {editable && <button className="btn btn-primary" onClick={() => setAdding(true)}><Icon name="add" size={18} /> Ajouter un modèle</button>}
          </div>
        )}
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 40 }}><input type="checkbox" checked={all} onChange={(e) => setChecked(e.target.checked ? list.map((t) => t.id) : [])} aria-label="Tout sélectionner" /></th>
                <th>Nom</th><th>Type</th><th>Langue</th><th>Pays</th><th>Masqué</th><th>Modèle système</th><th className="center">Par défaut</th><th />
              </tr>
            </thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.id} className={`clickable ${checked.includes(t.id) ? 'selected' : ''}`} onClick={() => navigate(`/editeur/${t.id}`)} style={t.hidden ? { color: 'var(--muted)' } : null}>
                  <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={checked.includes(t.id)} onChange={(e) => setChecked(e.target.checked ? [...checked, t.id] : checked.filter((x) => x !== t.id))} aria-label={`Sélectionner ${t.name}`} /></td>
                  <td className="strong">{t.system && <Icon name="lock" size={15} style={{ color: 'var(--muted)', verticalAlign: -2, marginRight: 6 }} />}{t.name}</td>
                  <td>{DOC_TYPES[t.type]?.label}</td>
                  <td>{LANG[t.language] || t.language}</td>
                  <td>{t.country}</td>
                  <td>{yesNo(t.hidden)}</td>
                  <td>{yesNo(t.system)}</td>
                  <td className="center" onClick={(e) => e.stopPropagation()}>
                    <input type="radio" name={`def-${t.type}`} checked={isDefault(t)} disabled={!editable || t.hidden} onChange={() => updateSettings({ defaultTemplates: { ...defaults, [t.type]: t.id } })} aria-label={`Modèle par défaut des ${DOC_TYPES[t.type]?.plural.toLowerCase()}`} />
                  </td>
                  <td className="right nowrap" onClick={(e) => e.stopPropagation()}>
                    <button className="btn btn-ghost btn-icon btn-sm" title={t.system ? 'Voir' : 'Modifier'} onClick={() => navigate(`/editeur/${t.id}`)} aria-label="Modifier"><Icon name={t.system ? 'visibility' : 'edit'} size={17} /></button>
                    {editable && (
                      <Menu
                        trigger={<button className="btn btn-ghost btn-icon btn-sm" aria-label="Plus d'options"><Icon name="more_vert" size={18} /></button>}
                        items={[
                          { icon: 'content_copy', label: 'Dupliquer', onClick: () => duplicate([t.id]) },
                          { icon: t.hidden ? 'visibility' : 'visibility_off', label: t.hidden ? 'Afficher' : 'Masquer', onClick: () => setHidden([t.id], !t.hidden) },
                          !t.system && '-',
                          !t.system && { icon: 'delete', label: 'Supprimer', danger: true, onClick: () => remove([t.id]) },
                        ]}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!list.length && <Empty icon="description" title="Aucun modèle" text="Aucun modèle ne correspond à ce filtre." />}
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        Les modèles système (Compact et Étendu) ne se modifient pas : dupliquez-les pour créer votre propre version. Le modèle « par défaut » est proposé en premier dans la fenêtre Générer de chaque type de document.
      </p>
      <TextTemplatesCard editable={editable} />
      {adding && (
        <AddTemplateModal
          onClose={() => setAdding(false)}
          onCreate={(tpl) => {
            updateSettings({ documentTemplates: [...(useStore.getState().settings.documentTemplates || []), tpl] })
            setAdding(false)
            navigate(`/editeur/${tpl.id}`)
          }}
        />
      )}
    </div>
  )
}

function AddTemplateModal({ onClose, onCreate }) {
  const settings = useStore((s) => s.settings)
  const [name, setName] = useState('Nouveau modèle')
  const [type, setType] = useState('devis')
  const [base, setBase] = useState('sys_etendu_devis')
  const bases = allTemplates(settings).filter((t) => t.type === type)
  const create = () => {
    const src = bases.find((t) => t.id === base)
    onCreate(src ? cloneTemplate(src, { name: name.trim() || 'Nouveau modèle', type }) : blankTemplate(type, name.trim() || 'Nouveau modèle'))
  }
  return (
    <Modal title="Ajouter un modèle" size="sm" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn btn-primary" onClick={create}>Créer et modifier</button></>}>
      <div className="stack" style={{ gap: 14 }}>
        <Field label="Nom"><input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Type">
          <select className="select" value={type} onChange={(e) => { setType(e.target.value); setBase(defaultTemplateId(settings, e.target.value)) }}>
            {Object.entries(DOC_TYPES).map(([k, d]) => <option key={k} value={k}>{d.label}</option>)}
          </select>
        </Field>
        <Field label="Basé sur">
          <select className="select" value={base} onChange={(e) => setBase(e.target.value)}>
            <option value="">Modèle vierge</option>
            {bases.map((t) => <option key={t.id} value={t.id}>{t.name}{t.system ? ' (système)' : ''}</option>)}
          </select>
        </Field>
      </div>
    </Modal>
  )
}

function TextTemplatesCard({ editable }) {
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const [edit, setEdit] = useState(null)
  const list = settings.textTemplates || []
  const save = (t) => {
    updateSettings({ textTemplates: list.some((x) => x.id === t.id) ? list.map((x) => (x.id === t.id ? t : x)) : [...list, t] })
    setEdit(null)
  }
  return (
    <div className="card">
      <div className="card-header">
        <span className="section-title">Modèles de texte</span>
        <span className="muted small">« Appliquer modèle » du texte du document</span>
        {editable && <div className="actions"><button className="btn btn-sm btn-primary" onClick={() => setEdit({ id: uid('tt_'), name: 'Nouveau texte', type: 'tous', html: '<p>{$f.greeting}</p><p></p>' })}><Icon name="add" size={17} /> Ajouter</button></div>}
      </div>
      <div className="table-wrap">
        <table className="table table-compact">
          <thead><tr><th>Nom</th><th>Type</th><th>Aperçu</th><th /></tr></thead>
          <tbody>
            {list.map((t) => (
              <tr key={t.id} className="clickable" onClick={() => editable && setEdit(t)}>
                <td className="strong">{t.name}</td>
                <td>{t.type === 'tous' ? 'Tous les documents' : DOC_TYPES[t.type]?.label}</td>
                <td className="muted small ellipsis" style={{ maxWidth: 420 }}>{t.html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()}</td>
                <td className="right" onClick={(e) => e.stopPropagation()}>
                  {editable && <button className="btn btn-ghost btn-icon btn-sm" onClick={() => updateSettings({ textTemplates: list.filter((x) => x.id !== t.id) })} aria-label="Supprimer"><Icon name="delete" size={17} /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!list.length && <Empty title="Aucun modèle de texte" text="Ajoutez des textes réutilisables pour la fenêtre Générer." />}
      {edit && (
        <Modal title={list.some((x) => x.id === edit.id) ? 'Modifier le modèle de texte' : 'Ajouter un modèle de texte'} size="lg" onClose={() => setEdit(null)} footer={<><button className="btn" onClick={() => setEdit(null)}>Annuler</button><button className="btn btn-primary" onClick={() => save(edit)}>Confirmer</button></>}>
          <div className="form-grid" style={{ marginBottom: 14 }}>
            <Field label="Nom"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Type de document">
              <select className="select" value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value })}>
                <option value="tous">Tous les documents</option>
                {Object.entries(DOC_TYPES).map(([k, d]) => <option key={k} value={k}>{d.label}</option>)}
              </select>
            </Field>
          </div>
          <RichText value={edit.html} onChange={(html) => setEdit((e) => ({ ...e, html }))} docType={edit.type === 'tous' ? 'devis' : edit.type} minHeight={180} />
        </Modal>
      )}
    </div>
  )
}

// ====================================================================== En-tête documents

const bgLabel = (lh) => {
  const bg = lh.background
  if (!bg) return ''
  if (bg.kind === 'auto') return 'Généré (logo et coordonnées)'
  return bg.name || (bg.kind === 'pdf' ? 'Fond PDF' : 'Image')
}

export function LetterheadsPanel() {
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const access = useAccess()
  const navigate = useNavigate()
  const editable = access.can('configuration', 'modification')
  const saved = letterheadsOf(settings)
  const [draft, setDraft] = useState(saved)
  const [checked, setChecked] = useState([])
  const [open, setOpen] = useState(null)
  const dirty = useMemo(() => stableJson(draft) !== stableJson(saved), [draft, saved])
  // Enregistré ailleurs (autre onglet, autre utilisateur) : la liste suit tant qu'elle n'a pas été modifiée ici
  const base = useRef(saved)
  useEffect(() => {
    if (saved !== base.current) {
      if (stableJson(draft) === stableJson(base.current)) setDraft(saved)
      base.current = saved
    }
  }, [saved, draft])

  const save = () => {
    if (!draft.length) return toast('Gardez au moins un en-tête de documents', 'error')
    updateSettings({ letterheads: draft })
    toast('En-têtes enregistrés')
  }
  const close = () => {
    if (dirty && !confirm('Fermer sans enregistrer les modifications ?')) return
    setDraft(saved)
    navigate('/')
  }
  const remove = (ids) => {
    const used = useStore.getState().documents.filter((d) => ids.includes(d.letterheadId)).length
    if (draft.length - ids.length < 1) return toast('Gardez au moins un en-tête de documents', 'error')
    if (!confirm(`Supprimer ${ids.length} en-tête${ids.length > 1 ? 's' : ''} ?${used ? `\n${used} document${used > 1 ? 's' : ''} passeront à l’en-tête par défaut.` : ''}`)) return
    setDraft(draft.filter((l) => !ids.includes(l.id)))
    setChecked([])
  }
  const all = draft.length > 0 && draft.every((l) => checked.includes(l.id))
  return (
    <div className="stack">
      <HeaderActions>
        {dirty && <span className="unsaved"><span className="dot" /> Modifications non enregistrées</span>}
        <button className="btn" onClick={close}>Fermer</button>
        <button className="btn btn-primary" onClick={save} disabled={!editable || !dirty}>Sauvegarder</button>
      </HeaderActions>
      <div className="card">
        {checked.length ? (
          <SelectionBar count={checked.length} onClear={() => setChecked([])}>
            {editable && (
              <>
                <button className="btn btn-sm" onClick={() => { setDraft([...draft, ...draft.filter((l) => checked.includes(l.id)).map((l) => ({ ...structuredClone(l), id: uid('lh_'), name: `${l.name} - copie` }))]); setChecked([]) }}><Icon name="content_copy" size={16} /> Dupliquer</button>
                <button className="btn btn-sm btn-danger" onClick={() => remove(checked)}><Icon name="delete" size={16} /> Supprimer</button>
              </>
            )}
          </SelectionBar>
        ) : (
          <div className="grid-toolbar">
            <span className="spacer" />
            {editable && <button className="btn btn-primary" onClick={() => setOpen(blankLetterhead())}><Icon name="add" size={18} /> Ajouter un en-tête</button>}
          </div>
        )}
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 40 }}><input type="checkbox" checked={all} onChange={(e) => setChecked(e.target.checked ? draft.map((l) => l.id) : [])} aria-label="Tout sélectionner" /></th>
                <th>Nom</th><th>Arrière-plan</th><th>Afficher dans les factures</th><th>Afficher dans les devis</th><th>Afficher sur d’autres documents</th>
              </tr>
            </thead>
            <tbody>
              {draft.map((l) => (
                <tr key={l.id} className={`clickable ${checked.includes(l.id) ? 'selected' : ''}`} onClick={() => setOpen(l)}>
                  <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={checked.includes(l.id)} onChange={(e) => setChecked(e.target.checked ? [...checked, l.id] : checked.filter((x) => x !== l.id))} aria-label={`Sélectionner ${l.name}`} /></td>
                  <td className="strong">{l.name}</td>
                  <td>
                    {l.background && (
                      <span className="lh-cell">
                        <Icon name={l.background.kind === 'pdf' ? 'picture_as_pdf' : l.background.kind === 'auto' ? 'auto_awesome' : 'image'} size={17} style={{ color: l.background.kind === 'pdf' ? '#e5487a' : 'var(--muted)' }} />
                        {bgLabel(l)}
                      </span>
                    )}
                  </td>
                  <td>{yesNo(l.visibility?.factures !== false)}</td>
                  <td>{yesNo(l.visibility?.devis !== false)}</td>
                  <td>{yesNo(l.visibility?.autres !== false)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        L’arrière-plan (PDF ou image) est imprimé sous le contenu des documents ; avec un PDF de deux pages, la deuxième sert de fond aux pages suivantes. Les marges délimitent la zone où s’écrit le document.
      </p>
      {open && (
        <LetterheadModal
          value={open}
          editable={editable}
          onClose={() => setOpen(null)}
          onConfirm={(lh) => {
            setDraft(draft.some((x) => x.id === lh.id) ? draft.map((x) => (x.id === lh.id ? lh : x)) : [...draft, lh])
            setOpen(null)
          }}
        />
      )}
    </div>
  )
}

/** PDF → images JPEG (1re page, et 2e page pour les suivantes), dimensions de la page en cm. */
async function renderPdf(file) {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const pages = []
  let size = null
  for (let n = 1; n <= Math.min(2, pdf.numPages); n++) {
    const page = await pdf.getPage(n)
    const base = page.getViewport({ scale: 1 })
    if (n === 1) size = { width: Math.round((base.width / 72) * 2.54 * 100) / 100, height: Math.round((base.height / 72) * 2.54 * 100) / 100 }
    const viewport = page.getViewport({ scale: 1754 / Math.max(base.width, base.height) })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    await page.render({ canvas, viewport, background: '#ffffff' }).promise
    pages.push(await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.86)))
  }
  await pdf.destroy()
  return { pages, size, count: pages.length }
}

const blobToDataUrl = (blob) =>
  new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result)
    r.onerror = rej
    r.readAsDataURL(blob)
  })

/** Fichier d'arrière-plan → { kind, name, size, pages: [url] } (stockage Supabase, ou en local dans le navigateur). */
async function processBackground(file) {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
  if (!isPdf && !/^image\/(png|jpe?g|webp)$/.test(file.type)) throw new Error('choisissez un PDF ou une image PNG / JPEG / WebP')
  if (file.size > 12e6) throw new Error('fichier trop lourd (12 Mo maximum)')
  const out = { kind: isPdf ? 'pdf' : 'image', name: file.name, size: file.size, mime: file.type, pages: [], source: null }
  let blobs = [file]
  if (isPdf) {
    const r = await renderPdf(file)
    blobs = r.pages
    out.pageSize = r.size
  }
  if (DB_ENABLED) {
    out.source = (await uploadFile(file, 'entetes')).url
    for (const [i, b] of blobs.entries()) out.pages.push(isPdf ? (await uploadFile(new File([b], `${file.name.replace(/\.pdf$/i, '')}-page${i + 1}.jpg`, { type: 'image/jpeg' }), 'entetes')).url : out.source)
  } else {
    if (!isPdf && file.size > 2e6) throw new Error('image trop lourde pour le mode local (2 Mo maximum)')
    for (const b of blobs) out.pages.push(await blobToDataUrl(b))
  }
  return out
}

const fmtSize = (n) => (n > 1e6 ? `${(n / 1e6).toFixed(2).replace('.', ',')}MB` : `${Math.max(1, Math.round(n / 1e3))}KB`)

function Fold({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className={`fold ${open ? 'open' : ''}`}>
      <button type="button" className="fold-head" onClick={() => setOpen(!open)}>
        <span>{title}</span>
        <Icon name="expand_less" size={22} />
      </button>
      {open && <div className="fold-body">{children}</div>}
    </section>
  )
}

const YesNo = ({ value, onChange, disabled }) => (
  <select className="select" value={value ? '1' : '0'} onChange={(e) => onChange(e.target.value === '1')} disabled={disabled}>
    <option value="1">Oui</option>
    <option value="0">Non</option>
  </select>
)

const Cm = ({ value, onChange, disabled }) => (
  <span className="input-group">
    <NumInput className="input input-num" value={value} onChange={onChange} disabled={disabled} />
    <span className="addon">cm</span>
  </span>
)

export function LetterheadModal({ value, editable, onClose, onConfirm }) {
  const settings = useStore((s) => s.settings)
  const [lh, setLh] = useState(() => ({ ...blankLetterhead(), ...structuredClone(value), margins: { ...blankLetterhead().margins, ...(value.margins || {}) } }))
  const [busy, setBusy] = useState(false)
  const set = (patch) => setLh((x) => ({ ...x, ...patch }))
  const setM = (k, v) => setLh((x) => ({ ...x, margins: { ...x.margins, [k]: Math.max(0, v) } }))
  const auto = { accent: '#1f87e5', tagline: '', showContact: true, logoPosition: 'gauche', footer: true, ...(lh.auto || {}) }
  const pick = async (file) => {
    if (!file) return
    setBusy(true)
    try {
      const bg = await processBackground(file)
      const patch = { background: bg }
      // Les dimensions suivent celles du PDF
      if (bg.pageSize) {
        const match = Object.entries(PAGE_SIZES).find(([, [w, h]]) => Math.abs(w - bg.pageSize.width) < 0.3 && Math.abs(h - bg.pageSize.height) < 0.3)
        Object.assign(patch, { width: bg.pageSize.width, height: bg.pageSize.height, pageSize: match ? match[0] : 'Personnalisé' })
      }
      set(patch)
      toast(bg.kind === 'pdf' ? `PDF importé (${bg.pages.length} page${bg.pages.length > 1 ? 's' : ''} utilisée${bg.pages.length > 1 ? 's' : ''})` : 'Image importée')
    } catch (e) {
      toast(`Import impossible : ${e.message}`, 'error')
    } finally {
      setBusy(false)
    }
  }
  const W = Number(lh.width) || 21
  const H = Number(lh.height) || 29.7
  const thumbW = 132
  const k = thumbW / W
  return (
    <Modal
      title={(lh.name || 'En-tête').toUpperCase()}
      size="lh"
      onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn btn-primary" disabled={!editable || !lh.name.trim()} onClick={() => onConfirm({ ...lh, name: lh.name.trim() })}>Confirmer</button></>}
    >
      <fieldset className="lh-form" disabled={!editable}>
        <Fold title="Général">
          <div className="lh-general">
            <div className="form-grid">
              <Field label="Nom"><input className="input" autoFocus value={lh.name} onChange={(e) => set({ name: e.target.value })} /></Field>
              <Field label={<>Arrière-plan <Icon name="info" size={15} title="PDF ou image imprimé sous le contenu. Un PDF de deux pages : la 2e page sert de fond aux pages suivantes." style={{ verticalAlign: -3, color: 'var(--muted)' }} /></>}>
                {lh.background && lh.background.kind !== 'auto' ? (
                  <div className="file-chip">
                    <Icon name={lh.background.kind === 'pdf' ? 'picture_as_pdf' : 'image'} size={22} style={{ color: lh.background.kind === 'pdf' ? '#e5487a' : 'var(--primary)' }} />
                    <div className="file-chip-text">
                      <strong>{lh.background.name}</strong>
                      <span>{lh.background.size ? fmtSize(lh.background.size) : ''}{lh.background.pages?.length > 1 ? ' · 2 pages' : ''}</span>
                    </div>
                    <a className="btn btn-ghost btn-icon btn-sm" href={lh.background.source || lh.background.pages?.[0]} download={lh.background.name} target="_blank" rel="noreferrer" title="Télécharger"><Icon name="download" size={18} /></a>
                    <button type="button" className="btn btn-ghost btn-icon btn-sm" title="Supprimer l’arrière-plan" onClick={() => set({ background: null })}><Icon name="delete" size={18} /></button>
                  </div>
                ) : (
                  <label className={`btn ${busy ? 'disabled' : ''}`} style={{ justifyContent: 'center' }}>
                    <Icon name={busy ? 'hourglass_top' : 'upload_file'} size={18} /> {busy ? 'Import en cours…' : 'Importer un PDF ou une image'}
                    <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" hidden disabled={busy} onChange={(e) => pick(e.target.files?.[0])} />
                  </label>
                )}
              </Field>
              <Field label="Papier généré" className="full">
                <Toggle checked={lh.background?.kind === 'auto'} onChange={(v) => set({ background: v ? { kind: 'auto' } : null, auto: v ? auto : lh.auto })} label="Générer l’en-tête à partir du logo et des coordonnées de l’entreprise" />
              </Field>
              {lh.background?.kind === 'auto' && (
                <>
                  <Field label="Slogan / activité"><input className="input" value={auto.tagline} onChange={(e) => set({ auto: { ...auto, tagline: e.target.value } })} /></Field>
                  <Field label="Position du logo">
                    <select className="select" value={auto.logoPosition} onChange={(e) => set({ auto: { ...auto, logoPosition: e.target.value } })}><option value="gauche">À gauche</option><option value="droite">À droite</option></select>
                  </Field>
                  <Field label="Couleur d’accent" className="full"><ColorPicker value={auto.accent} onChange={(c) => set({ auto: { ...auto, accent: c || '#1f87e5' } })} /></Field>
                  <Field label="Coordonnées"><YesNo value={auto.showContact} onChange={(v) => set({ auto: { ...auto, showContact: v } })} /></Field>
                  <Field label="Pied de page (mentions légales)"><YesNo value={auto.footer} onChange={(v) => set({ auto: { ...auto, footer: v } })} /></Field>
                  {!settings.logoUrl && <p className="muted small full" style={{ margin: 0 }}>Sans logo, le nom de l’entreprise est affiché. Le logo se règle dans Configuration › Détails de l’entreprise.</p>}
                </>
              )}
            </div>
            <div className="lh-thumb" style={{ width: thumbW, height: H * k }} aria-label="Aperçu de la page">
              <div className="lh-thumb-page" style={{ width: `${W}cm`, height: `${H}cm`, transform: `scale(${k / 37.7953})` }}>
                <PageBackground lh={lh} settings={settings} n={1} />
              </div>
              <div className="lh-thumb-margins" style={{ top: lh.margins.top * k, right: lh.margins.right * k, bottom: lh.margins.bottom * k, left: lh.margins.left * k }} />
            </div>
          </div>
        </Fold>
        <Fold title="Dimensions">
          <div className="form-grid">
            <Field label="Taille de la page">
              <select className="select" value={lh.pageSize} onChange={(e) => { const s = PAGE_SIZES[e.target.value]; set(s ? { pageSize: e.target.value, width: s[0], height: s[1] } : { pageSize: 'Personnalisé' }) }}>
                {Object.keys(PAGE_SIZES).map((s) => <option key={s} value={s}>{s}</option>)}
                <option value="Personnalisé">Personnalisé</option>
              </select>
            </Field>
            <span />
            <Field label="Largeur papier"><Cm value={lh.width} onChange={(v) => set({ width: Math.max(5, v), pageSize: 'Personnalisé' })} /></Field>
            <Field label="Hauteur du papier"><Cm value={lh.height} onChange={(v) => set({ height: Math.max(5, v), pageSize: 'Personnalisé' })} /></Field>
          </div>
        </Fold>
        <Fold title="Marges">
          <div className="form-grid">
            <Field label="Marge supérieure"><Cm value={lh.margins.top} onChange={(v) => setM('top', v)} /></Field>
            <Field label="Marge droite"><Cm value={lh.margins.right} onChange={(v) => setM('right', v)} /></Field>
            <Field label="Marge inférieure"><Cm value={lh.margins.bottom} onChange={(v) => setM('bottom', v)} /></Field>
            <Field label="Marge gauche"><Cm value={lh.margins.left} onChange={(v) => setM('left', v)} /></Field>
            <Field label="Marge au-dessus de l’en-tête" hint="Position du « Texte d’en-tête » du modèle"><Cm value={lh.margins.header} onChange={(v) => setM('header', v)} /></Field>
            <Field label="Marge au-dessus du pied de page" hint="Position du « Pied de page » et des numéros"><Cm value={lh.margins.footer} onChange={(v) => setM('footer', v)} /></Field>
          </div>
          {lh.margins.top + lh.margins.bottom >= H - 2 && <div className="alert alert-warning" style={{ marginTop: 12 }}><Icon name="warning" size={18} /><span>Les marges laissent moins de 2 cm pour le contenu.</span></div>}
        </Fold>
        <Fold title="Options">
          <div className="form-grid">
            <Field label="Laisser la première page blanche" hint="Page de garde : le contenu commence page 2"><YesNo value={lh.firstPageBlank} onChange={(v) => set({ firstPageBlank: v })} /></Field>
            <Field label="Numéros de page"><YesNo value={lh.pageNumbers} onChange={(v) => set({ pageNumbers: v })} /></Field>
          </div>
        </Fold>
        <Fold title="Visibilité">
          <div className="form-grid">
            {VISIBILITY.map(([key, label]) => (
              <Field key={key} label={label}><YesNo value={lh.visibility?.[key] !== false} onChange={(v) => set({ visibility: { ...lh.visibility, [key]: v } })} /></Field>
            ))}
          </div>
        </Fold>
      </fieldset>
    </Modal>
  )
}

export { DEFAULT_LETTERHEADS }
