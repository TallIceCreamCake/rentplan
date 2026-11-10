import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useToasts } from '../store'
import { initials, num } from '../lib/utils'
import { statusOf } from '../lib/model'

/** Icône Material (la même bibliothèque que Rentman). */
export function Icon({ name, size = 20, className = '', style, title }) {
  return (
    <span className={`material-icons mi ${className}`} style={{ fontSize: size, ...style }} title={title} aria-hidden={title ? undefined : true}>
      {name}
    </span>
  )
}

export function Modal({ title, onClose, children, footer, size = '' }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  // Rendue dans <body> : une animation ou une transformation d'un parent ne la rogne pas
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${size ? `modal-${size}` : ''}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="btn btn-ghost btn-icon" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Fermer">
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function Field({ label, hint, children, className = '' }) {
  return (
    <div className={`field ${className}`}>
      {label && <label>{label}</label>}
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  )
}

export function Badge({ color = '#8a929c', children, dot = true }) {
  return (
    <span className="badge" style={{ color }}>
      {dot && <span className="dot" />}
      {children}
    </span>
  )
}

export function StatusBadge({ status, mixed }) {
  const s = statusOf(status)
  return <Badge color={s.color}>{mixed ? `${s.label} (varie)` : s.label}</Badge>
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} className={`tab ${value === t.id ? 'active' : ''}`} onClick={() => onChange(t.id)}>
          {t.warn && <Icon name="warning" size={17} style={{ color: 'var(--warning)' }} />}
          {t.label}
          {t.count != null && t.count !== 0 && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Empty({ icon, title, text, action }) {
  return (
    <div className="empty">
      {icon && <Icon name={icon} size={44} />}
      {title && <h3>{title}</h3>}
      {text && <p style={{ margin: '0 0 14px' }}>{text}</p>}
      {action}
    </div>
  )
}

/** Champ numérique qui accepte la virgule et les saisies intermédiaires (« 12, »). */
export function NumInput({ value, onChange, className = 'input input-sm input-num', max, min, onBlur, onFocus, ...rest }) {
  const [text, setText] = useState(null)
  return (
    <input
      {...rest}
      className={className}
      inputMode="decimal"
      value={text ?? String(value ?? '').replace('.', ',')}
      onFocus={(e) => {
        setText(String(value ?? '').replace('.', ','))
        e.target.select()
        onFocus?.(e)
      }}
      onChange={(e) => {
        setText(e.target.value)
        let n = num(e.target.value)
        if (max != null) n = Math.min(max, n)
        if (min != null) n = Math.max(min, n)
        onChange(n)
      }}
      onBlur={(e) => {
        setText(null)
        onBlur?.(e)
      }}
    />
  )
}

export function QtyStepper({ value, onChange, min = 0 }) {
  const v = Number(value) || 0
  return (
    <div className="qty-stepper">
      <button type="button" onClick={() => onChange(Math.max(min, v - 1))} aria-label="Moins">
        <Icon name="remove" size={16} />
      </button>
      <input
        value={value}
        inputMode="numeric"
        aria-label="Quantité"
        onChange={(e) => {
          const n = parseInt(e.target.value, 10)
          onChange(Number.isFinite(n) ? Math.max(min, n) : min)
        }}
        onFocus={(e) => e.target.select()}
      />
      <button type="button" onClick={() => onChange(v + 1)} aria-label="Plus">
        <Icon name="add" size={16} />
      </button>
    </div>
  )
}

export const PALETTE = ['#1f87e5', '#7c3aed', '#db2777', '#e2284f', '#f4511e', '#f59e0b', '#65a30d', '#19b26b', '#0d9488', '#0891b2', '#64748b', '#24282f']

export function ColorPicker({ value, onChange }) {
  return (
    <div className="color-swatches">
      {PALETTE.map((c) => (
        <button type="button" key={c} className={value === c ? 'on' : ''} style={{ background: c }} onClick={() => onChange(value === c ? null : c)} aria-label={`Couleur ${c}`} />
      ))}
    </div>
  )
}

export function Avatar({ person, size = '' }) {
  return (
    <span className={`avatar ${size ? `avatar-${size}` : ''}`} style={{ background: person?.color || '#8f969f' }} title={person ? `${person.firstName || ''} ${person.lastName || ''}` : undefined}>
      {initials(person)}
    </span>
  )
}

export function Toasts() {
  const toasts = useToasts((s) => s.toasts)
  return (
    <div className="toasts" role="status">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}`}>
          <Icon name={t.type === 'error' ? 'error' : 'check_circle'} size={19} style={{ color: t.type === 'error' ? '#fff' : '#5ee39a' }} />
          {t.message}
        </div>
      ))}
    </div>
  )
}

export function Kpi({ icon, color, label, value, sub }) {
  return (
    <div className="card kpi">
      <div className="kpi-icon" style={{ background: `${color}16`, color }}>
        <Icon name={icon} size={22} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="kpi-label">{label}</div>
        <div className="kpi-value">{value}</div>
        {sub && <div className="kpi-sub">{sub}</div>}
      </div>
    </div>
  )
}

/** En-tête de colonne triable (le titre trié passe en bleu, comme dans Rentman). */
export function SortTh({ label, k, sort, setSort, className = '' }) {
  const active = sort.key === k
  return (
    <th className={`sortable ${active ? 'sorted' : ''} ${className}`} onClick={() => setSort({ key: k, dir: active && sort.dir === 'asc' ? 'desc' : 'asc' })}>
      {label} {active && <Icon name={sort.dir === 'asc' ? 'arrow_upward' : 'arrow_downward'} size={15} style={{ verticalAlign: -3 }} />}
    </th>
  )
}

export const sortBy = (list, { key, dir }, getters = {}) => {
  const get = getters[key] || ((x) => x[key])
  return [...list].sort((a, b) => {
    const va = get(a)
    const vb = get(b)
    const r = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va ?? '').localeCompare(String(vb ?? ''), 'fr', { numeric: true })
    return dir === 'asc' ? r : -r
  })
}

/**
 * Bouton qui ouvre un petit menu (« ⋮ Plus d'options », « Afficher ▾ »…).
 * Le menu est rendu dans <body>, au-dessus de tout : ni un tableau qui défile, ni une carte, ni une fenêtre ne le
 * rognent. Il se place contre son bouton, s'ouvre vers le haut si la place manque en bas et reste dans l'écran.
 */
export function Menu({ trigger, items, align = 'right', children, width }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const ref = useRef(null)
  const menu = useRef(null)

  // Fermeture : clic hors du bouton et du menu ; Échap ferme le menu sans fermer la fenêtre qui le contient
  useEffect(() => {
    if (!open) return undefined
    const down = (e) => {
      if (!ref.current?.contains(e.target) && !menu.current?.contains(e.target)) setOpen(false)
    }
    const key = (e) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setOpen(false)
    }
    document.addEventListener('mousedown', down)
    addEventListener('keydown', key, true)
    return () => {
      document.removeEventListener('mousedown', down)
      removeEventListener('keydown', key, true)
    }
  }, [open])

  useLayoutEffect(() => {
    if (!open) return setPos(null)
    const place = () => {
      const t = ref.current?.getBoundingClientRect()
      const m = menu.current
      if (!t || !m) return
      // Bouton sorti de l'écran (page défilée) : le menu se ferme
      if (t.bottom < 0 || t.top > innerHeight) return setOpen(false)
      const h = m.scrollHeight + 2
      const w = m.offsetWidth
      const below = innerHeight - t.bottom - 10
      const above = t.top - 10
      const up = h > below && above > below
      const maxHeight = Math.max(120, Math.min(innerHeight * 0.7, up ? above : below))
      const left = Math.max(8, Math.min(align === 'left' ? t.left : t.right - w, innerWidth - w - 8))
      const top = up ? Math.max(8, t.top - 4 - Math.min(h, maxHeight)) : t.bottom + 4
      setPos((p) => (p && p.top === top && p.left === left && p.maxHeight === maxHeight ? p : { top, left, maxHeight, up }))
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(menu.current)
    addEventListener('resize', place)
    addEventListener('scroll', place, true)
    return () => {
      ro.disconnect()
      removeEventListener('resize', place)
      removeEventListener('scroll', place, true)
    }
  }, [open, align])

  return (
    <div className="menu-wrap" ref={ref}>
      {/* En capture : un bouton qui arrête le clic (pour ne pas sélectionner la ligne ou l'onglet) ouvre quand même le menu */}
      <span onClickCapture={() => setOpen(!open)}>{trigger}</span>
      {open &&
        createPortal(
          <div
            ref={menu}
            className={`menu ${pos?.up ? 'up' : ''}`}
            role="menu"
            style={{ ...(width ? { width } : null), ...(pos ? { top: pos.top, left: pos.left, maxHeight: pos.maxHeight } : { top: 0, left: -9999, visibility: 'hidden' }) }}
            onClick={(e) => e.target.closest('[data-close]') && setOpen(false)}
          >
            {children}
            {(items || []).filter(Boolean).map((it, i) =>
              it === '-' ? (
                <div key={i} className="menu-sep" />
              ) : (
                <button
                  key={i}
                  type="button"
                  role="menuitem"
                  className={`menu-item ${it.danger ? 'danger' : ''}`}
                  disabled={it.disabled}
                  onClick={() => {
                    setOpen(false)
                    it.onClick()
                  }}
                >
                  {it.icon && <Icon name={it.icon} size={18} />}
                  {it.label}
                </button>
              ),
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}

/** Barre bleue de sélection (« ✕ 2 éléments sélectionnés  MODIFIER  … »). */
export function SelectionBar({ count, onClear, children, right }) {
  return (
    <div className="bulk-bar">
      <button className="btn btn-ghost btn-icon btn-sm" onClick={onClear} aria-label="Désélectionner">
        <Icon name="close" />
      </button>
      <span className="count-lbl">
        {count} élément{count > 1 ? 's' : ''} sélectionné{count > 1 ? 's' : ''}
      </span>
      {children}
      {right && (
        <>
          <span className="spacer" />
          {right}
        </>
      )}
    </div>
  )
}

/** Carte de section au style Rentman (titre en majuscules, action bleue à droite). */
export function Section({ title, action, children, className = '', bodyClass = 'card-body', icon }) {
  return (
    <div className={`card ${className}`}>
      <div className="card-header">
        {icon && <Icon name={icon} size={19} style={{ color: 'var(--muted)' }} />}
        <span className="section-title">{title}</span>
        {action && <div className="actions">{action}</div>}
      </div>
      <div className={bodyClass}>{children}</div>
    </div>
  )
}

const PROGRESS = [
  ['equipment', 'category', 'Planification du matériel'],
  ['crew', 'account_circle', 'Équipe et transport'],
  ['quote', 'description', 'Devis'],
  ['invoice', 'monetization_on', 'Factures'],
  ['task', 'assignment_turned_in', 'Tâches'],
]
const PROGRESS_COLORS = { ok: '#19b26b', warn: '#f0a000', bad: '#e2284f', none: '#c4c9d0' }

/** Les 5 icônes « Avancée du projet » de la liste des projets. */
export function ProgressIcons({ progress }) {
  return (
    <span className="progress-icons">
      {PROGRESS.map(([k, icon, label]) => (
        <Icon key={k} name={icon} size={19} style={{ color: PROGRESS_COLORS[progress[k]] }} title={label} />
      ))}
    </span>
  )
}

export const PROGRESS_INFO = PROGRESS
export const progressColor = (v) => PROGRESS_COLORS[v]

/** Interrupteur on/off. */
export function Toggle({ checked, onChange, label }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" />
      {label && <span>{label}</span>}
    </label>
  )
}

/** Sélecteur d'étiquettes (texte libre, Entrée pour ajouter). */
export function TagInput({ value = [], onChange, suggestions = [], placeholder = 'Ajouter une étiquette' }) {
  const [text, setText] = useState('')
  const add = (t) => {
    const v = t.trim()
    if (v && !value.includes(v)) onChange([...value, v])
    setText('')
  }
  return (
    <div className="tag-input">
      {value.map((t) => (
        <span key={t} className="tag">
          {t}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`Retirer ${t}`}>
            <Icon name="close" size={13} />
          </button>
        </span>
      ))}
      <input
        list={suggestions.length ? 'tag-suggestions' : undefined}
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            add(text)
          }
        }}
        onBlur={() => text && add(text)}
      />
      {suggestions.length > 0 && (
        <datalist id="tag-suggestions">
          {suggestions.map((s) => <option key={s} value={s} />)}
        </datalist>
      )}
    </div>
  )
}
