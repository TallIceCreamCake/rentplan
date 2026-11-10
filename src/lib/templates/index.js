// Accès aux modèles de documents et aux en-têtes enregistrés dans les réglages.
import { DEFAULT_LETTERHEADS, DEFAULT_SIGNATURE, DEFAULT_STYLE, LABEL_LETTERHEADS, SYSTEM_TEMPLATES, VISIBILITY_OF_TYPE } from './defaults'
import { makeEnv } from './schema'
import { renderTemplate } from './engine'

/** Modèles système (masquables) puis modèles de l'espace de travail. */
export function allTemplates(settings) {
  const hidden = new Set(settings.hiddenSystemTemplates || [])
  return [...SYSTEM_TEMPLATES.map((t) => (hidden.has(t.id) ? { ...t, hidden: true } : t)), ...(settings.documentTemplates || [])]
}

/** Modèle complété des réglages par défaut (anciens modèles enregistrés). */
const complete = (t) => t && { ...t, style: { ...DEFAULT_STYLE, ...(t.style || {}) }, signature: { ...DEFAULT_SIGNATURE, ...(t.signature || {}) }, blocks: t.blocks || [] }

export const templateById = (settings, id) => complete(allTemplates(settings).find((t) => t.id === id))

export const templatesFor = (settings, type, { includeHidden = false } = {}) => allTemplates(settings).filter((t) => t.type === type && (includeHidden || !t.hidden))

export function defaultTemplateId(settings, type, preferred) {
  const list = templatesFor(settings, type)
  for (const id of [preferred, settings.defaultTemplates?.[type], `sys_etendu_${type}`, `sys_standard_${type}`]) if (id && list.some((t) => t.id === id)) return id
  return list[0]?.id || `sys_standard_${type}`
}

export const letterheadsOf = (settings) => (settings.letterheads?.length ? settings.letterheads : DEFAULT_LETTERHEADS)
export const letterheadById = (settings, id) => letterheadsOf(settings).find((l) => l.id === id) || LABEL_LETTERHEADS.find((l) => l.id === id)
// Étiquettes : les en-têtes marqués « étiquettes » puis les formats intégrés ; ailleurs, les en-têtes visibles pour le type
export const letterheadsFor = (settings, type) =>
  type === 'etiquette'
    ? [...letterheadsOf(settings).filter((l) => l.visibility?.etiquettes === true), ...LABEL_LETTERHEADS]
    : letterheadsOf(settings).filter((l) => l.visibility?.[VISIBILITY_OF_TYPE[type] || 'autres'] !== false)

export function defaultLetterheadId(settings, type, preferred) {
  const list = letterheadsFor(settings, type)
  if (preferred && list.some((l) => l.id === preferred)) return preferred
  return list[0]?.id || letterheadsOf(settings)[0]?.id
}

/** Modèle et en-tête d'un document (ceux par défaut si le document n'en a pas). */
export function docLayout(doc, settings) {
  const template = templateById(settings, doc.templateId) || templateById(settings, defaultTemplateId(settings, doc.type))
  const letterhead = letterheadById(settings, doc.letterheadId) || letterheadById(settings, defaultLetterheadId(settings, doc.type)) || DEFAULT_LETTERHEADS[0]
  return { template, letterhead }
}

/** Sujet et nom de fichier calculés (les valeurs saisies sur le document l'emportent). */
export function docTexts(doc, idx, template, user) {
  const env = makeEnv({ doc, idx, user, template })
  const subject = doc.subject?.trim() ? doc.subject : renderTemplate(template?.subject || '', env, { html: false }).trim()
  env.subject = subject
  const raw = doc.fileName?.trim() ? doc.fileName : renderTemplate(template?.fileName || '{$f.type} {$f.number}', env, { html: false })
  // eslint-disable-next-line no-control-regex
  const fileName = raw.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').trim() || doc.number
  return { subject, fileName }
}
