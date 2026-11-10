import { Link } from 'react-router-dom'
import { useStore } from '../store'
import { useAccess } from '../lib/auth'
import { Field, Icon, NumInput, Section, Toggle } from './ui'

/** Champs de saisie supplémentaires d'un projet, d'un équipement ou d'un contact (Configuration › Champs de saisie supplémentaires). */
export default function CustomFields({ entity, values, onChange }) {
  const fields = useStore((s) => s.settings.customFields || []).filter((f) => f.entity === entity)
  const access = useAccess()
  if (!fields.length) return null
  const v = values || {}
  const set = (id, value) => onChange({ ...v, [id]: value })
  return (
    <Section title="Champs supplémentaires" icon="playlist_add" action={access.can('configuration') && <Link className="btn-link" to="/configuration?s=champs"><Icon name="settings" size={16} /> Configurer</Link>}>
      <div className="form-grid">
        {fields.map((f) => (
          <Field key={f.id} label={f.type === 'case' ? '' : f.label}>
            {f.type === 'case' ? (
              <Toggle checked={Boolean(v[f.id])} onChange={(x) => set(f.id, x)} label={f.label} />
            ) : f.type === 'nombre' ? (
              <NumInput className="input input-num" value={v[f.id] ?? ''} onChange={(x) => set(f.id, x)} />
            ) : (
              <input className="input" type={f.type === 'date' ? 'date' : 'text'} value={v[f.id] ?? ''} onChange={(e) => set(f.id, e.target.value)} />
            )}
          </Field>
        ))}
      </div>
    </Section>
  )
}
