import { useState } from 'react'
import { Field, Icon, Modal, NumInput } from '../../components/ui'
import RichText from '../../components/doc/RichText'
import VariablePicker from '../../components/doc/VariablePicker'
import { CONTENT_BLOCKS, COUNTRIES, DOC_FONTS, LANGUAGES, LAYOUT_BLOCKS, MODULES, modulesFor } from '../../lib/templates/defaults'
import { fieldsOf } from '../../lib/templates/schema'
import { resizeSection } from '../../lib/templates/tree'
import { DOC_TYPES } from '../../lib/model'
import { DB_ENABLED, uploadFile } from '../../lib/db'
import { toast, useStore } from '../../store'
import { ALIGN_OPTIONS, HEADER_STYLES, MODULE_HELP, OPS, OPTION_FORMS } from './forms'

// ---------- Champs du panneau sombre ----------
export function EF({ label, children, hint, sub }) {
  return (
    <label className={`ef ${sub ? 'ef-sub' : ''}`}>
      {label && <span className="ef-label">{label}</span>}
      {children}
      {hint && <span className="ef-hint">{hint}</span>}
    </label>
  )
}
export const ESel = ({ value, onChange, options, ...rest }) => (
  <select className="ef-input" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest}>
    {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
  </select>
)
export const EBool = ({ value, onChange, yes = 'Oui', no = 'Non' }) => <ESel value={value ? '1' : '0'} onChange={(v) => onChange(v === '1')} options={[['1', yes], ['0', no]]} />
export const EText = ({ value, onChange, ...rest }) => <input className="ef-input" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest} />
export const ENum = ({ value, onChange, unit, ...rest }) => (
  <span className="ef-unit">
    <NumInput className="ef-input" value={value ?? 0} onChange={onChange} {...rest} />
    {unit && <span>{unit}</span>}
  </span>
)
export function EColor({ value, onChange, placeholder = 'Comme le document' }) {
  return (
    <span className="ef-color">
      <input type="color" value={value || '#1d1f23'} onChange={(e) => onChange(e.target.value)} aria-label="Couleur" />
      <input className="ef-input" value={value || ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value || null)} />
      {value && <button type="button" className="ef-clear" onClick={() => onChange(null)} aria-label="Effacer"><Icon name="close" size={15} /></button>}
    </span>
  )
}

/** Champ texte avec le bouton <> qui ouvre « Toutes les variables » (Sujet, Nom de fichier…). */
export function EVarText({ value, onChange, docType, disabled }) {
  const [picker, setPicker] = useState(false)
  const [caret, setCaret] = useState(null)
  return (
    <span className="ef-var">
      <input className="ef-input" value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value)} onSelect={(e) => setCaret(e.target.selectionStart)} />
      <button type="button" disabled={disabled} title="Ajouter une variable" onClick={() => setPicker(true)}><Icon name="code" size={18} /></button>
      {picker && (
        <VariablePicker
          docType={docType}
          onClose={() => setPicker(false)}
          onAdd={(path) => {
            const v = value || ''
            const at = caret ?? v.length
            onChange(`${v.slice(0, at)}{$${path}}${v.slice(at)}`)
            setPicker(false)
          }}
        />
      )}
    </span>
  )
}

export const PanelTitle = ({ children, help, action }) => (
  <div className="ep-title">
    <h3>{children}</h3>
    {help && <span className="ep-help" title={help}><Icon name="help_outline" size={17} /></span>}
    {action}
  </div>
)

// ---------- Document › Aperçu ----------
export function PreviewPanel({ docs, sampleId, setSampleId, lhId, setLhId, letterheads, showBg, setShowBg, onPaged }) {
  return (
    <div className="ep">
      <PanelTitle>Aperçu</PanelTitle>
      <p className="ep-text">Sélectionnez les données que vous souhaitez utiliser comme exemple pour ce modèle. Ces données ne font pas partie du modèle, elles sont uniquement utilisées pour l’affichage.</p>
      <EF label="Document">
        <ESel value={sampleId} onChange={setSampleId} options={[...docs.map((d) => [d.id, d.label]), ['__exemple', 'Exemple généré à partir d’un projet']]} />
      </EF>
      <EF label="En-tête documents">
        <ESel value={lhId} onChange={setLhId} options={letterheads.map((l) => [l.id, l.name])} />
      </EF>
      <EF label="Afficher le fond de l’en-tête">
        <EBool value={showBg} onChange={setShowBg} />
      </EF>
      <p className="ep-text">La page de gauche est paginée comme le PDF final. L’aperçu du PDF masque en plus les repères et les modules vides.</p>
      <button className="ed-outline wide" onClick={onPaged}><Icon name="picture_as_pdf" size={18} /> Aperçu du PDF</button>
    </div>
  )
}

// ---------- Document › Modèle ----------
export function TemplatePanel({ tpl, patch, editable, onSignature, onHeader, onFooter }) {
  return (
    <fieldset className="ep" disabled={!editable}>
      <PanelTitle>Modèle</PanelTitle>
      <EF label="Nom"><EText value={tpl.name} onChange={(v) => patch({ name: v }, 'name')} /></EF>
      <EF label="Type"><ESel value={tpl.type} onChange={(v) => patch({ type: v })} options={Object.entries(DOC_TYPES).map(([k, d]) => [k, d.label])} /></EF>
      <EF label="Caché"><EBool value={tpl.hidden} onChange={(v) => patch({ hidden: v })} /></EF>
      <EF label="Langue"><ESel value={tpl.language} onChange={(v) => patch({ language: v })} options={LANGUAGES} /></EF>
      <EF label="Pays" hint="Détermine le format des dates et des montants"><ESel value={tpl.country} onChange={(v) => patch({ country: v })} options={COUNTRIES.map((c) => [c, c])} /></EF>
      <EF label="Sujet"><EVarText value={tpl.subject} onChange={(v) => patch({ subject: v }, 'subject')} docType={tpl.type} disabled={!editable} /></EF>
      <EF label="Nom de fichier"><EVarText value={tpl.fileName} onChange={(v) => patch({ fileName: v }, 'fileName')} docType={tpl.type} disabled={!editable} /></EF>
      <EF label="Lignes fines"><EBool value={tpl.thinLines} onChange={(v) => patch({ thinLines: v })} yes="Oui (Non pris en charge par tous les lecteurs PDF)" /></EF>
      <div className="ep-buttons">
        <button type="button" className="ed-outline" onClick={onSignature}>Options de signature digitale</button>
        <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="ed-outline" onClick={onHeader}>Texte d’en-tête</button>
          <button type="button" className="ed-outline" onClick={onFooter}>Pied de page</button>
        </div>
      </div>
    </fieldset>
  )
}

// ---------- Document › Insérer : blocs et modules ----------
function Tile({ icon, label, number, onAdd, onDragStart, onDragEnd, disabled }) {
  return (
    <button type="button" className="ep-tile" disabled={disabled} draggable={!disabled} onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={onAdd} title={`${label} — cliquez ou glissez sur la page`}>
      <span className="ep-tile-ic">{number ? <span className="ep-num">{number}</span> : <Icon name={icon} size={21} />}</span>
      <span className="ep-tile-lbl">{label}</span>
    </button>
  )
}
export function InsertPanel({ type, onAdd, startDrag, endDrag, editable }) {
  const tile = (payload, props) => <Tile key={props.label} {...props} disabled={!editable} onAdd={() => onAdd(payload)} onDragStart={(e) => startDrag(e, payload)} onDragEnd={endDrag} />
  return (
    <div className="ep">
      <PanelTitle help="Faites glisser un bloc ou un module à l’endroit voulu sur la page, ou cliquez dessus pour l’ajouter après le bloc sélectionné.">Insérer : blocs et modules</PanelTitle>
      <div className="ep-group">Mise en page</div>
      <div className="ep-tiles">{LAYOUT_BLOCKS.map((b) => tile({ add: 'section', cols: b.cols }, { label: b.label, number: b.cols }))}</div>
      <div className="ep-group">Sous-projets <span className="ep-help" title="Le contenu déposé dans ce bloc est répété pour chaque sous-projet du document ; les modules n’y affichent que les données du sous-projet."><Icon name="help_outline" size={16} /></span></div>
      <div className="ep-tiles">{tile({ add: 'subprojects' }, { label: 'Sous-projets', icon: 'view_week' })}</div>
      <div className="ep-group">Contenu</div>
      <div className="ep-tiles">{CONTENT_BLOCKS.map((b) => tile({ add: b.kind }, { label: b.label, icon: b.icon }))}</div>
      <div className="ep-group">Modules</div>
      <div className="ep-tiles">{modulesFor(type).map((k) => tile({ add: k }, { label: MODULES[k].label, icon: MODULES[k].icon }))}</div>
    </div>
  )
}

// ---------- Document › Styles ----------
export function StylesPanel({ tpl, patchStyle, editable }) {
  const s = tpl.style
  const fonts = DOC_FONTS.includes(s.font) ? DOC_FONTS : [s.font, ...DOC_FONTS]
  return (
    <fieldset className="ep" disabled={!editable}>
      <PanelTitle help="Style général du document : texte, titres et tableaux. Le CSS personnalisé ne s’applique qu’à ce modèle.">Styles du document</PanelTitle>
      <div className="ep-group">Texte</div>
      <EF label="Police"><ESel value={s.font} onChange={(v) => patchStyle({ font: v })} options={fonts.map((f) => [f, f])} /></EF>
      <EF label="Police Google (autre)" hint="Nom exact d’une police de fonts.google.com, chargée automatiquement">
        <EText value={DOC_FONTS.includes(s.font) ? '' : s.font} placeholder="Ex. Nunito" onChange={(v) => v.trim() && patchStyle({ font: v.trim() }, 'font')} />
      </EF>
      <div className="ef-row">
        <EF label="Taille du texte"><ENum value={s.size} unit="pt" onChange={(v) => patchStyle({ size: Math.max(5, Math.min(24, v || 9)) }, 'size')} /></EF>
        <EF label="Interligne"><ENum value={s.lineHeight} onChange={(v) => patchStyle({ lineHeight: Math.max(0.8, Math.min(3, v || 1.35)) }, 'lh')} /></EF>
      </div>
      <EF label="Couleur du texte"><EColor value={s.color} onChange={(v) => patchStyle({ color: v || '#1d1f23' })} placeholder="#1d1f23" /></EF>
      <div className="ep-group">Titres</div>
      <EF label="Police des titres"><ESel value={s.headingFont || ''} onChange={(v) => patchStyle({ headingFont: v })} options={[['', 'Comme le texte'], ...DOC_FONTS.map((f) => [f, f])]} /></EF>
      <EF label="Couleur des titres"><EColor value={s.headingColor} onChange={(v) => patchStyle({ headingColor: v || '#1d1f23' })} placeholder="#1d1f23" /></EF>
      <div className="ef-row">
        <EF label="Titre 1"><ENum value={s.h1Size} unit="pt" onChange={(v) => patchStyle({ h1Size: v || 19 }, 'h1')} /></EF>
        <EF label="Titre 2"><ENum value={s.h2Size} unit="pt" onChange={(v) => patchStyle({ h2Size: v || 13 }, 'h2')} /></EF>
      </div>
      <div className="ep-group">Tableaux</div>
      <EF label="En-tête des tableaux"><ESel value={s.tableHeader} onChange={(v) => patchStyle({ tableHeader: v })} options={HEADER_STYLES.filter(([k]) => k && k !== 'titre')} /></EF>
      <EF label="Fond de l’en-tête (style « Fond coloré »)"><EColor value={s.headerBg} onChange={(v) => patchStyle({ headerBg: v || '#eef3f9' })} placeholder="#eef3f9" /></EF>
      <EF label="Couleur des lignes"><EColor value={s.lineColor} onChange={(v) => patchStyle({ lineColor: v || '#1d1f23' })} placeholder="#1d1f23" /></EF>
      <EF label="Couleur d’accent" hint="Liens et éléments mis en avant"><EColor value={s.accent} onChange={(v) => patchStyle({ accent: v || '#1f87e5' })} placeholder="#1f87e5" /></EF>
      <div className="ep-group">CSS personnalisé</div>
      <textarea className="ef-input ef-code" rows={7} value={s.css || ''} onChange={(e) => patchStyle({ css: e.target.value }, 'css')} placeholder={'h2 { text-transform: uppercase; }\n.dt-group { color: #1f87e5; }'} spellCheck={false} />
    </fieldset>
  )
}

// ---------- Module › Module sélectionné ----------
function OptionField({ f, value, onChange, docType, disabled }) {
  if (f.type === 'bool') return <EBool value={value} onChange={onChange} />
  if (f.type === 'select') return <ESel value={value} onChange={onChange} options={f.options} />
  if (f.type === 'number') return <ENum value={value} unit={f.unit} onChange={onChange} />
  if (f.type === 'textarea') return <textarea className="ef-input" rows={3} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
  if (f.type === 'multi')
    return (
      <span className="ef-multi">
        {f.options.map(([k, l]) => (
          <label key={k} className="ef-check">
            <input type="checkbox" checked={(value || []).includes(k)} onChange={(e) => onChange(e.target.checked ? [...(value || []), k] : (value || []).filter((x) => x !== k))} />
            {l}
          </label>
        ))}
      </span>
    )
  if (f.vars) return <EVarText value={value} onChange={onChange} docType={docType} disabled={disabled} />
  return <EText value={value} onChange={onChange} />
}

export function ModulePanel({ block, docType, editable, advanced, setAdvanced, patchBlock, patchOptions, patchStyle, onCutPaste }) {
  if (!block) return <EmptyModule />
  const st = block.style || {}
  const form = block.type === 'module' ? OPTION_FORMS[block.module] || [] : []
  const hasAdvanced = form.some((f) => f.adv)
  return (
    <fieldset className="ep" disabled={!editable}>
      <PanelTitle action={<button type="button" className="ed-outline" onClick={onCutPaste}>Options Couper/Coller</button>}>Module sélectionné</PanelTitle>
      <div className="ep-kind"><Icon name={block.type === 'module' ? MODULES[block.module]?.icon : 'widgets'} size={17} /> {block.type === 'module' ? MODULES[block.module]?.label : { section: `Section ${block.cols}-colonnes`, subprojects: 'Sous-projets', text: 'Texte', image: 'Images', hr: 'Ligne horizontale', pagebreak: 'Saut de page' }[block.type]}</div>
      {block.type === 'module' && MODULE_HELP[block.module] && <p className="ep-text">{MODULE_HELP[block.module]}</p>}
      {block.type !== 'pagebreak' && (
        <div className="ef-grid">
          <EF label="Marge ci-dessus :"><ENum value={st.marginTop} unit="px" onChange={(v) => patchStyle({ marginTop: v }, `mt-${block.id}`)} /></EF>
          <EF label="Marge ci-dessous :"><ENum value={st.marginBottom} unit="px" onChange={(v) => patchStyle({ marginBottom: v }, `mb-${block.id}`)} /></EF>
          <EF label="Marge gauche :"><ENum value={st.marginLeft} unit="px" onChange={(v) => patchStyle({ marginLeft: v }, `ml-${block.id}`)} /></EF>
          <EF label="Marge droite :"><ENum value={st.marginRight} unit="px" onChange={(v) => patchStyle({ marginRight: v }, `mr-${block.id}`)} /></EF>
        </div>
      )}
      {hasAdvanced && (
        <div className="ep-right">
          <button type="button" className="ed-outline" onClick={() => setAdvanced(!advanced)}>{advanced ? 'Masquer les paramètres avancés' : 'Afficher paramètres avancés'}</button>
        </div>
      )}
      {block.type === 'module' &&
        form.map((f, i) =>
          f.section ? (
            <div key={`s${i}`} className="ep-group">{f.section}</div>
          ) : f.adv && !advanced ? null : (
            <EF key={f.k} label={f.label} sub={f.sub}>
              <OptionField f={f} value={block.options?.[f.k]} docType={docType} disabled={!editable} onChange={(v) => patchOptions({ [f.k]: v }, `${f.k}-${block.id}`)} />
            </EF>
          ),
        )}
      {block.type === 'text' && (
        <div className="ep-rich">
          <RichText key={block.id} value={block.html} docType={docType} onChange={(html) => patchBlock({ html }, `html-${block.id}`)} minHeight={220} />
        </div>
      )}
      {block.type === 'image' && <ImageOptions block={block} patchBlock={patchBlock} />}
      {block.type === 'section' && <SectionOptions block={block} patchBlock={patchBlock} />}
      {block.type === 'subprojects' && (
        <>
          <EF label="Afficher le titre du sous-projet"><EBool value={block.options?.showTitle} onChange={(v) => patchBlock({ options: { ...block.options, showTitle: v } })} /></EF>
          <EF label="Titre"><EVarText value={block.options?.title} docType={docType} disabled={!editable} onChange={(v) => patchBlock({ options: { ...block.options, title: v } }, `spt-${block.id}`)} /></EF>
          <EF label="Saut de page entre les sous-projets"><EBool value={block.options?.pageBreak} onChange={(v) => patchBlock({ options: { ...block.options, pageBreak: v } })} /></EF>
          <p className="ep-text">Glissez des modules dans ce bloc : ils sont répétés pour chaque sous-projet du document, avec les données du seul sous-projet ({'{$sp.name}'}, totaux, matériel…).</p>
        </>
      )}
      {block.type === 'hr' && (
        <>
          <EF label="Épaisseur"><ENum value={block.options?.thickness} unit="px" onChange={(v) => patchBlock({ options: { ...block.options, thickness: v } }, `hr-${block.id}`)} /></EF>
          <EF label="Style"><ESel value={block.options?.lineStyle} onChange={(v) => patchBlock({ options: { ...block.options, lineStyle: v } })} options={[['solid', 'Continue'], ['dashed', 'Tirets'], ['dotted', 'Pointillés'], ['double', 'Double']]} /></EF>
          <EF label="Couleur"><EColor value={block.options?.color} onChange={(v) => patchBlock({ options: { ...block.options, color: v || '#1d1f23' } })} /></EF>
        </>
      )}
      {block.type === 'pagebreak' && <p className="ep-text">Le contenu suivant commence sur une nouvelle page.</p>}
    </fieldset>
  )
}

function EmptyModule() {
  return (
    <div className="ep">
      <PanelTitle>Module sélectionné</PanelTitle>
      <p className="ep-text">Sélectionnez d’abord un bloc ou un module sur la page pour modifier ses options.</p>
    </div>
  )
}

function ImageOptions({ block, patchBlock }) {
  const [busy, setBusy] = useState(false)
  const pick = async (file) => {
    if (!file) return
    if (!/^image\/(png|jpe?g|gif|webp)$/.test(file.type)) return toast('Choisissez une image PNG, JPEG, GIF ou WebP', 'error')
    setBusy(true)
    try {
      if (DB_ENABLED) patchBlock({ src: (await uploadFile(file, 'modeles')).url })
      else {
        if (file.size > 1.5e6) throw new Error('image trop lourde pour le mode local (1,5 Mo maximum)')
        patchBlock({ src: await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file) }) })
      }
    } catch (e) {
      toast(`Envoi impossible : ${e.message}`, 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <EF label="Image">
        <span className="ef-file">
          <label className="ed-outline">
            <Icon name="upload" size={17} /> {busy ? 'Envoi…' : 'Choisir une image'}
            <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => pick(e.target.files?.[0])} />
          </label>
          {block.src && <button type="button" className="ef-clear" onClick={() => patchBlock({ src: '' })} aria-label="Retirer l’image"><Icon name="delete" size={17} /></button>}
        </span>
      </EF>
      <EF label="Ou adresse de l’image"><EText value={block.src?.startsWith('data:') ? '' : block.src} placeholder="https://…/image.png" onChange={(v) => patchBlock({ src: v }, `src-${block.id}`)} /></EF>
      <div className="ef-row">
        <EF label="Largeur"><ENum value={block.width} unit="%" onChange={(v) => patchBlock({ width: Math.max(2, Math.min(100, v || 35)) }, `w-${block.id}`)} /></EF>
        <EF label="Aligner"><ESel value={block.align} onChange={(v) => patchBlock({ align: v })} options={ALIGN_OPTIONS} /></EF>
      </div>
    </>
  )
}

function SectionOptions({ block, patchBlock }) {
  return (
    <>
      <EF label="Nombre de colonnes"><ESel value={String(block.cols)} onChange={(v) => patchBlock(resizeSection(block, Number(v)))} options={[['2', '2 colonnes'], ['3', '3 colonnes'], ['4', '4 colonnes'], ['6', '6 colonnes']]} /></EF>
      <div className="ef-grid">
        {(block.widths || []).map((w, i) => (
          <EF key={i} label={`Largeur colonne ${i + 1}`}>
            <ENum value={w} unit="%" onChange={(v) => patchBlock({ widths: block.widths.map((x, j) => (j === i ? Math.max(1, v || 1) : x)) }, `cw-${block.id}-${i}`)} />
          </EF>
        ))}
      </div>
      <div className="ef-row">
        <EF label="Espacement"><ENum value={block.gap} unit="px" onChange={(v) => patchBlock({ gap: v }, `gap-${block.id}`)} /></EF>
        <EF label="Alignement vertical"><ESel value={block.valign} onChange={(v) => patchBlock({ valign: v })} options={[['top', 'Haut'], ['middle', 'Milieu'], ['bottom', 'Bas']]} /></EF>
      </div>
    </>
  )
}

// ---------- Module › Colonnes ----------
export function columnLabel(row, path, settings) {
  const keys = String(path || '').split('.')
  let node = row
  const labels = []
  for (const k of keys) {
    const f = fieldsOf(node, settings)[k]
    if (!f) return path
    labels.push(f.label)
    if (f.ref) node = f.ref
  }
  return labels.length > 1 ? `${labels[labels.length - 1]} (${labels.slice(0, -1).join(' › ')})` : labels[0] || path
}

export function ColumnsPanel({ block, editable, patchBlock }) {
  const settings = useStore((s) => s.settings)
  const [open, setOpen] = useState(null)
  const [picker, setPicker] = useState(false)
  const [dragI, setDragI] = useState(null)
  const row = block?.type === 'module' ? MODULES[block.module]?.row : null
  if (!row) {
    return (
      <div className="ep">
        <PanelTitle>Colonnes</PanelTitle>
        <p className="ep-text">{block ? 'Ce module n’a pas de colonnes.' : 'Sélectionnez d’abord un module à colonnes (Équipements, Coûts supplémentaires, Planning…).'}</p>
      </div>
    )
  }
  const cols = block.columns || []
  const setCols = (list, key) => patchBlock({ columns: list }, key)
  const patchCol = (id, patch, key) => setCols(cols.map((c) => (c.id === id ? { ...c, ...patch } : c)), key)
  const move = (from, to) => {
    if (from == null || from === to) return
    const list = [...cols]
    const [c] = list.splice(from, 1)
    list.splice(to, 0, c)
    setCols(list)
  }
  return (
    <fieldset className="ep" disabled={!editable}>
      <PanelTitle
        help="Ajoutez une colonne à partir des variables de la ligne, réorganisez-les avec les six points et réglez la largeur en pourcentage de la largeur du module."
        action={<button type="button" className="ed-outline" onClick={() => setPicker(true)}>Ajouter colonne</button>}
      >
        Colonnes
      </PanelTitle>
      <div className="ec-list">
        {cols.map((c, i) => (
          <div
            key={c.id}
            className={`ec ${open === c.id ? 'open' : ''} ${dragI === i ? 'dragging' : ''}`}
            onDragOver={(e) => dragI != null && e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              move(dragI, i)
              setDragI(null)
            }}
          >
            <div className="ec-head" onClick={() => setOpen(open === c.id ? null : c.id)}>
              <span className="ec-handle" draggable={editable} onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.setData('text/plain', 'col'); setDragI(i) }} onDragEnd={() => setDragI(null)} onClick={(e) => e.stopPropagation()}>
                <Icon name="drag_indicator" size={18} />
              </span>
              <span className="ec-name">{columnLabel(row, c.path, settings).toUpperCase()}</span>
              <Icon name={open === c.id ? 'expand_less' : 'expand_more'} size={20} />
            </div>
            {open === c.id && (
              <div className="ec-body">
                <EF label="Largeur"><ENum value={c.width} unit="%" onChange={(v) => patchCol(c.id, { width: Math.max(1, v || 1) }, `cw-${c.id}`)} /></EF>
                <EF label="Marge gauche"><ENum value={c.marginLeft} unit="px" onChange={(v) => patchCol(c.id, { marginLeft: v }, `cml-${c.id}`)} /></EF>
                <EF label="Marge droite"><ENum value={c.marginRight} unit="px" onChange={(v) => patchCol(c.id, { marginRight: v }, `cmr-${c.id}`)} /></EF>
                <EF label="Texte d’en-tête"><EText value={c.header} onChange={(v) => patchCol(c.id, { header: v }, `ch-${c.id}`)} /></EF>
                <EF label="Aligner"><ESel value={c.align} onChange={(v) => patchCol(c.id, { align: v })} options={ALIGN_OPTIONS} /></EF>
                <EF label="CSS personnalisé"><EText value={c.css} placeholder="font-weight: bold; color: #e2284f" onChange={(v) => patchCol(c.id, { css: v }, `ccss-${c.id}`)} /></EF>
                <EF label="Masquer les valeurs nulles"><ESel value={c.hideZero == null ? '' : c.hideZero ? '1' : '0'} onChange={(v) => patchCol(c.id, { hideZero: v === '' ? null : v === '1' })} options={[['', 'Choisir'], ['1', 'Oui'], ['0', 'Non']]} /></EF>
                <button type="button" className="ec-delete" onClick={() => setCols(cols.filter((x) => x.id !== c.id))}><Icon name="delete" size={18} /> Supprimer</button>
              </div>
            )}
          </div>
        ))}
        {!cols.length && <p className="ep-text">Aucune colonne : ajoutez-en une.</p>}
      </div>
      {picker && (
        <VariablePicker
          row={row}
          onClose={() => setPicker(false)}
          onAdd={(path, label, type) => {
            const id = `${block.id}-c${Date.now().toString(36)}`
            setCols([...cols, { id, path, header: label, width: 14, align: ['price', 'number', 'pct'].includes(type) ? 'right' : 'left', marginLeft: 0, marginRight: 0, css: '', hideZero: null }])
            setPicker(false)
            setOpen(id)
          }}
        />
      )}
    </fieldset>
  )
}

// ---------- Module › Style du module ----------
export function ModuleStylePanel({ block, editable, patchStyle }) {
  const settings = useStore((s) => s.settings)
  if (!block) {
    return (
      <div className="ep">
        <PanelTitle>Style du module</PanelTitle>
        <p className="ep-text">Sélectionnez d’abord un module sur la page.</p>
      </div>
    )
  }
  const st = block.style || {}
  const row = block.type === 'module' ? MODULES[block.module]?.row : null
  const rules = st.conditional || []
  const setRules = (list, key) => patchStyle({ conditional: list }, key)
  const fields = row ? Object.entries(fieldsOf(row, settings)).filter(([, f]) => !f.ref && !f.hidden).map(([k, f]) => [k, f.label]) : []
  return (
    <fieldset className="ep" disabled={!editable}>
      <PanelTitle help="Apparence de ce module uniquement : elle s’ajoute au style du document.">Style du module</PanelTitle>
      <div className="ef-row">
        <EF label="Taille du texte"><ENum value={st.fontSize ?? ''} unit="pt" placeholder="Doc." onChange={(v) => patchStyle({ fontSize: v || null }, `fs-${block.id}`)} /></EF>
        <EF label="Couleur du texte"><EColor value={st.color} onChange={(v) => patchStyle({ color: v })} /></EF>
      </div>
      <EF label="Couleur de fond"><EColor value={st.background} onChange={(v) => patchStyle({ background: v })} placeholder="Aucune" /></EF>
      {row && (
        <>
          <div className="ep-group">Tableau</div>
          <EF label="En-tête du tableau"><ESel value={st.headerStyle || ''} onChange={(v) => patchStyle({ headerStyle: v || null })} options={HEADER_STYLES} /></EF>
          <EF label="Fond de l’en-tête"><EColor value={st.headerBg} onChange={(v) => patchStyle({ headerBg: v })} placeholder="Comme le document" /></EF>
          <EF label="Noms des groupes en gras"><EBool value={st.groupBold !== false} onChange={(v) => patchStyle({ groupBold: v })} /></EF>
          <EF label="Couleur des noms de groupes"><EColor value={st.groupColor} onChange={(v) => patchStyle({ groupColor: v })} /></EF>
          {block.module === 'equipment' && (
            <>
              <EF label="Contenu des combinaisons en italique"><EBool value={st.contentsItalic} onChange={(v) => patchStyle({ contentsItalic: v })} /></EF>
              <EF label="Couleur du contenu des combinaisons"><EColor value={st.contentsColor} onChange={(v) => patchStyle({ contentsColor: v })} /></EF>
            </>
          )}
          <EF label="Lignes alternées (zébrage)"><EBool value={st.stripes} onChange={(v) => patchStyle({ stripes: v })} /></EF>
          <EF label="Lignes de séparation"><EBool value={st.rowLines} onChange={(v) => patchStyle({ rowLines: v })} /></EF>
          <div className="ep-group">Mise en forme conditionnelle</div>
          {rules.map((r, i) => (
            <div key={i} className="ecr">
              <div className="ecr-line">
                <span className="ecr-if">Si</span>
                <ESel value={r.path} onChange={(v) => setRules(rules.map((x, j) => (j === i ? { ...x, path: v } : x)))} options={[['', 'Champ…'], ...fields]} />
                <ESel value={r.op} onChange={(v) => setRules(rules.map((x, j) => (j === i ? { ...x, op: v } : x)))} options={OPS} />
                <input className="ef-input" value={r.value ?? ''} placeholder="Valeur" onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)), `cr-${i}`)} />
              </div>
              <div className="ecr-line">
                {[['bold', 'Gras'], ['italic', 'Italique'], ['hide', 'Masquer la ligne']].map(([k, l]) => (
                  <label key={k} className="ef-check"><input type="checkbox" checked={Boolean(r[k])} onChange={(e) => setRules(rules.map((x, j) => (j === i ? { ...x, [k]: e.target.checked } : x)))} />{l}</label>
                ))}
              </div>
              <div className="ecr-line">
                <EColor value={r.color} onChange={(v) => setRules(rules.map((x, j) => (j === i ? { ...x, color: v } : x)))} placeholder="Couleur du texte" />
                <EColor value={r.background} onChange={(v) => setRules(rules.map((x, j) => (j === i ? { ...x, background: v } : x)))} placeholder="Fond" />
                <button type="button" className="ef-clear" onClick={() => setRules(rules.filter((_, j) => j !== i))} aria-label="Supprimer la règle"><Icon name="delete" size={17} /></button>
              </div>
            </div>
          ))}
          <button type="button" className="ed-outline" onClick={() => setRules([...rules, { path: fields[0]?.[0] || '', op: '>', value: '0', bold: true }])}><Icon name="add" size={17} /> Ajouter une règle</button>
        </>
      )}
      <div className="ep-group">Avancé</div>
      <EF label="Classe CSS" hint={`Le module porte aussi la classe .b-${block.id}`}><EText value={st.className} placeholder="mon-module" onChange={(v) => patchStyle({ className: v.replace(/[^\w -]/g, '') }, `cls-${block.id}`)} /></EF>
      <EF label="CSS personnalisé du module"><textarea className="ef-input ef-code" rows={5} value={st.css || ''} onChange={(e) => patchStyle({ css: e.target.value }, `css-${block.id}`)} placeholder={'.dt-row { font-size: 8pt; }'} spellCheck={false} /></EF>
    </fieldset>
  )
}

// ---------- Fenêtres ----------
export function SignatureModal({ tpl, onSave, onClose, editable }) {
  const [s, setS] = useState(tpl.signature)
  const settings = useStore((st) => st.settings)
  return (
    <Modal title="Options de signature digitale" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn btn-primary" disabled={!editable} onClick={() => onSave(s)}>Confirmer</button></>}>
      <div className="form-grid">
        <Field label="Texte du bouton" className="full"><input className="input" value={s.buttonText} onChange={(e) => setS({ ...s, buttonText: e.target.value })} /></Field>
        <Field label="Couleur du bouton"><input type="color" className="input input-color" value={s.buttonColor} onChange={(e) => setS({ ...s, buttonColor: e.target.value })} /></Field>
        <Field label="Couleur du texte"><input type="color" className="input input-color" value={s.textColor} onChange={(e) => setS({ ...s, textColor: e.target.value })} /></Field>
        <Field label="Taille du bouton"><select className="select" value={s.size} onChange={(e) => setS({ ...s, size: e.target.value })}><option value="normal">Normale</option><option value="grand">Grande</option></select></Field>
        <Field label="Une fois signé"><select className="select" value={s.showSigned ? '1' : '0'} onChange={(e) => setS({ ...s, showSigned: e.target.value === '1' })}><option value="1">Afficher la signature à la place du bouton</option><option value="0">Toujours afficher le bouton</option></select></Field>
      </div>
      <div className="sig-preview"><span style={{ background: s.buttonColor, color: s.textColor, fontSize: s.size === 'grand' ? 16 : 13 }}>{s.buttonText}</span></div>
      <div className={`alert ${settings.digitalSignature?.enabled ? 'alert-info' : 'alert-warning'}`} style={{ marginTop: 14 }}>
        <Icon name="info" size={18} />
        <span>{settings.digitalSignature?.enabled ? 'La signature numérique est activée (Configuration › Communication). Ajoutez le module « Signature numérique » sur la page pour afficher le bouton.' : 'La signature numérique est désactivée : activez « Laisser le client signer numériquement » dans Configuration › Communication.'}</span>
      </div>
    </Modal>
  )
}

export function TextModal({ title, value, docType, onSave, onClose, editable }) {
  const [html, setHtml] = useState(value || '')
  return (
    <Modal title={title} size="lg" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn btn-primary" disabled={!editable} onClick={() => onSave(html)}>Confirmer</button></>}>
      <p className="muted small" style={{ marginTop: 0 }}>Répété sur chaque page. Variables utiles : {'{$page.number}'} / {'{$page.total}'} (pagination), {'{$f.number}'}, {'{$company.name}'}…</p>
      <RichText value={html} onChange={setHtml} docType={docType} page minHeight={140} />
    </Modal>
  )
}

/** « Options Couper/Coller » : configuration JSON du module (copier dans un autre modèle, coller ici). */
export function CutPasteModal({ block, onApply, onInsertCopy, onClose, editable }) {
  const { id, ...rest } = block
  const [text, setText] = useState(JSON.stringify(rest, null, 2))
  const [err, setErr] = useState('')
  const parse = () => {
    try {
      const v = JSON.parse(text)
      if (!v || typeof v !== 'object' || !v.type) throw new Error('le champ « type » est obligatoire')
      setErr('')
      return v
    } catch (e) {
      setErr(`JSON invalide : ${e.message}`)
      return null
    }
  }
  return (
    <Modal
      title="Options Couper/Coller"
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={() => navigator.clipboard?.writeText(text).then(() => toast('Configuration copiée'))}><Icon name="content_copy" size={17} /> Copier</button>
          <span className="spacer" />
          <button className="btn" disabled={!editable} onClick={() => { const v = parse(); if (v) onInsertCopy(v) }}>Coller comme nouveau bloc</button>
          <button className="btn btn-primary" disabled={!editable} onClick={() => { const v = parse(); if (v) onApply(v) }}>Appliquer à ce module</button>
        </>
      }
    >
      <p className="muted small" style={{ marginTop: 0 }}>Configuration complète du module ({id}) : options, colonnes et style, y compris la mise en forme conditionnelle (« conditional »). Copiez-la pour la réutiliser dans un autre modèle.</p>
      <textarea className="textarea mono" rows={18} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} style={{ fontSize: 12 }} />
      {err && <div className="alert alert-danger" style={{ marginTop: 10 }}><Icon name="error" size={18} /><span>{err}</span></div>}
    </Modal>
  )
}
