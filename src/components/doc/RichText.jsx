import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Icon } from '../ui'
import VariablePicker from './VariablePicker'

const FORMATS = [['p', 'Paragraphe'], ['h1', 'Titre 1'], ['h2', 'Titre 2'], ['h3', 'Titre 3'], ['pre', 'Préformaté']]
const SIZES = ['7', '8', '9', '10', '11', '12', '14', '16', '18', '24']

/**
 * Éditeur de texte riche (barre d'outils façon Rentman) : variables {$…}, code source <>, images, liens.
 * ref expose insert(texte) et setHtml(html) pour « Ajouter une variable » et « Appliquer modèle ».
 */
export default function RichText({ value, onChange, docType = 'devis', page = false, minHeight = 160, placeholder = 'Saisissez votre texte…', ref }) {
  const el = useRef(null)
  const range = useRef(null)
  const [source, setSource] = useState(false)
  const [picker, setPicker] = useState(false)
  const last = useRef(value)

  // Contenu remplacé de l'extérieur (modèle de texte appliqué, autre bloc sélectionné)
  useEffect(() => {
    if (!el.current || source) return
    if (value !== last.current || el.current.innerHTML !== (value || '')) {
      if (document.activeElement !== el.current || value !== last.current) el.current.innerHTML = value || ''
      last.current = value
    }
  }, [value, source])

  const emit = () => {
    if (!el.current) return
    // « Taille » : execCommand pose <font size="7"> que l'on convertit en style
    el.current.querySelectorAll('font[size="7"]').forEach((f) => {
      const span = document.createElement('span')
      span.style.fontSize = f.dataset.pt ? `${f.dataset.pt}pt` : ''
      span.innerHTML = f.innerHTML
      f.replaceWith(span)
    })
    const html = el.current.innerHTML
    last.current = html
    onChange(html)
  }
  const save = () => {
    const sel = window.getSelection()
    if (sel?.rangeCount && el.current?.contains(sel.getRangeAt(0).commonAncestorContainer)) range.current = sel.getRangeAt(0).cloneRange()
  }
  const restore = () => {
    el.current?.focus()
    const sel = window.getSelection()
    if (range.current && sel) {
      sel.removeAllRanges()
      sel.addRange(range.current)
    } else if (sel && el.current) {
      const r = document.createRange()
      r.selectNodeContents(el.current)
      r.collapse(false)
      sel.removeAllRanges()
      sel.addRange(r)
    }
  }
  const exec = (cmd, arg) => {
    restore()
    document.execCommand(cmd, false, arg)
    save()
    emit()
  }
  const setSize = (pt) => {
    restore()
    document.execCommand('fontSize', false, '7')
    el.current.querySelectorAll('font[size="7"]').forEach((f) => (f.dataset.pt = pt))
    emit()
  }
  const insert = (text) => {
    if (source) {
      onChange(`${value || ''}${text}`)
      return
    }
    restore()
    document.execCommand('insertText', false, text)
    save()
    emit()
  }

  useImperativeHandle(ref, () => ({
    insert,
    setHtml: (html) => {
      if (el.current) el.current.innerHTML = html
      last.current = html
      onChange(html)
    },
  }))

  const btn = (icon, title, onClick, active) => (
    <button type="button" className={`rt-btn ${active ? 'on' : ''}`} title={title} aria-label={title} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      <Icon name={icon} size={18} />
    </button>
  )

  return (
    <div className="rt">
      <div className="rt-bar">
        {btn('undo', 'Annuler', () => exec('undo'))}
        {btn('redo', 'Rétablir', () => exec('redo'))}
        <select className="rt-select" aria-label="Paragraphe" defaultValue="" onChange={(e) => { exec('formatBlock', `<${e.target.value}>`); e.target.value = '' }} disabled={source}>
          <option value="" disabled>Paragraphe</option>
          {FORMATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select className="rt-select" aria-label="Taille de police" defaultValue="" onChange={(e) => { setSize(e.target.value); e.target.value = '' }} disabled={source}>
          <option value="" disabled>Taille de police</option>
          {SIZES.map((s) => <option key={s} value={s}>{s} pt</option>)}
        </select>
        {btn('format_bold', 'Gras', () => exec('bold'))}
        {btn('format_italic', 'Italique', () => exec('italic'))}
        {btn('format_underlined', 'Souligné', () => exec('underline'))}
        {btn('format_list_bulleted', 'Liste à puces', () => exec('insertUnorderedList'))}
        {btn('format_list_numbered', 'Liste numérotée', () => exec('insertOrderedList'))}
        {btn('format_indent_decrease', 'Diminuer le retrait', () => exec('outdent'))}
        {btn('format_indent_increase', 'Augmenter le retrait', () => exec('indent'))}
        <span className="rt-sep" />
        {btn('format_align_left', 'Aligner à gauche', () => exec('justifyLeft'))}
        {btn('format_align_center', 'Centrer', () => exec('justifyCenter'))}
        {btn('format_align_right', 'Aligner à droite', () => exec('justifyRight'))}
        <label className="rt-btn rt-color" title="Couleur du texte" onMouseDown={save}>
          <Icon name="format_color_text" size={18} />
          <input type="color" onChange={(e) => exec('foreColor', e.target.value)} aria-label="Couleur du texte" />
        </label>
        {btn('format_clear', 'Effacer la mise en forme', () => exec('removeFormat'))}
        {btn('link', 'Lien', () => {
          const url = prompt('Adresse du lien (https://…)')
          if (url) exec('createLink', url)
        })}
        {btn('image', 'Image', () => {
          const url = prompt('Adresse de l’image (https://…)')
          if (url) exec('insertImage', url)
        })}
        {btn('code', 'Code source', () => {
          if (!source) emit()
          setSource(!source)
        }, source)}
        <button type="button" className="rt-var" onMouseDown={(e) => { e.preventDefault(); save() }} onClick={() => setPicker(true)}>
          <Icon name="data_object" size={17} /> Variable
        </button>
      </div>
      {source ? (
        <textarea className="rt-source mono" style={{ minHeight }} value={value || ''} onChange={(e) => onChange(e.target.value)} aria-label="Code source HTML" />
      ) : (
        <div
          ref={el}
          className="rt-area doc-rich"
          contentEditable
          suppressContentEditableWarning
          data-placeholder={placeholder}
          style={{ minHeight }}
          onInput={emit}
          onKeyUp={save}
          onMouseUp={save}
          onBlur={() => {
            save()
            emit()
          }}
        />
      )}
      {picker && (
        <VariablePicker
          docType={docType}
          page={page}
          onClose={() => setPicker(false)}
          onAdd={(path) => {
            setPicker(false)
            setTimeout(() => insert(`{$${path}}`), 0)
          }}
        />
      )}
    </div>
  )
}
