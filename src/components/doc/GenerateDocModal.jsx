import { useEffect, useMemo, useRef, useState } from 'react'
import { toast, useIdx, useStore } from '../../store'
import { setPreference, useAuth } from '../../lib/auth'
import { Icon, Menu, Modal } from '../ui'
import RichText from './RichText'
import VariablePicker from './VariablePicker'
import { useDocUser } from './useDocUser'
import { defaultLetterheadId, defaultTemplateId, docTexts, letterheadsFor, templateById, templatesFor } from '../../lib/templates'
import { nextDocNumber } from '../../lib/documents'
import { DOC_TYPES, isFinancialDoc, statusOf } from '../../lib/model'
import { addDays, toDateInput } from '../../lib/utils'

const QUICK_VARS = [
  ['f.greeting', 'Formule d’appel'],
  ['f.customer.displayname', 'Nom du client'],
  ['f.contact.name', 'Personne de contact'],
  ['f.project.name', 'Nom du projet'],
  ['f.project.number', 'Numéro du projet'],
  ['f.number', 'Numéro du document'],
  ['f.date', 'Date du document'],
  ['f.duedate', 'Échéance / validité'],
  ['f.price_invat', 'Prix TTC'],
  ['f.project.usageperiod_start', 'Début de la période d’utilisation'],
  ['f.project.accountmanager', 'Gestionnaire de compte'],
  ['user.name', 'Utilisateur connecté'],
]

const isQuote = (type) => type === 'devis' || type === 'contrat'

/** Dernier modèle et en-tête utilisés par ce compte pour ce type de document. */
const lastUsed = (type) => useAuth.getState().profile?.preferences?.docDialog?.[type] || {}

/** Génère sans fenêtre (option « Ignorer cette fenêtre contextuelle la prochaine fois »). */
export function generateDirect(projectId, type, extra = {}) {
  const s = useStore.getState().settings
  const last = lastUsed(type)
  return useStore.getState().createDocument(projectId, type, { templateId: defaultTemplateId(s, type, last.templateId), letterheadId: defaultLetterheadId(s, type, last.letterheadId), ...extra })
}
export const skipGenerateDialog = () => Boolean(useAuth.getState().profile?.preferences?.docDialog?.skip)

/** Comme dans Rentman : créer un devis ou un contrat fait passer les sous-projets en concept ou demande en Option. */
export function afterGenerate(doc) {
  if (doc.type !== 'devis' && doc.type !== 'contrat') return
  const st = useStore.getState()
  for (const id of doc.subprojectIds || []) if (['concept', 'demande'].includes(st.subprojects.find((x) => x.id === id)?.status)) st.setSubStatus(id, 'option')
}

function Fold({ title, open, onToggle, children }) {
  return (
    <section className={`gen-fold ${open ? 'open' : ''}`}>
      <button type="button" className="gen-fold-head" onClick={onToggle}>
        <span>{title}</span>
        <Icon name="expand_less" size={22} />
      </button>
      {open && <div className="gen-fold-body">{children}</div>}
    </section>
  )
}

/**
 * Fenêtre « Générer devis / facture » : mise en page (modèle, en-tête), texte du document, paramètres avancés.
 * Avec `doc`, modifie la mise en page d'un document existant.
 */
export default function GenerateDocModal({ projectId, type, subs = [], doc = null, initialTemplateId = null, onClose, onDone }) {
  const idx = useIdx()
  const settings = useStore((s) => s.settings)
  const user = useDocUser()
  const prefs = useAuth((s) => s.profile?.preferences?.docDialog) || {}
  const t = doc?.type || type
  const project = idx.project[doc?.projectId || projectId]
  const client = idx.contact[project?.clientId]
  const editing = Boolean(doc)
  const templates = templatesFor(settings, t)
  const letterheads = letterheadsFor(settings, t)
  const last = prefs[t] || {}
  const [templateId, setTemplateId] = useState(doc?.templateId || (templates.some((x) => x.id === initialTemplateId) ? initialTemplateId : defaultTemplateId(settings, t, last.templateId)))
  const [letterheadId, setLetterheadId] = useState(doc?.letterheadId || defaultLetterheadId(settings, t, last.letterheadId))
  const [body, setBody] = useState(doc?.body || '')
  const [fileName, setFileName] = useState(doc?.fileName || '')
  const [subject, setSubject] = useState(doc?.subject || '')
  const [showBg, setShowBg] = useState(doc ? doc.showBackground !== false : true)
  const [skip, setSkip] = useState(Boolean(prefs.skip))
  const active = subs.filter((s) => s.status !== 'annule')
  const [subIds, setSubIds] = useState(active.map((s) => s.id))
  const today = new Date()
  const financial = isFinancialDoc(t)
  const offered = subs.filter((s) => subIds.includes(s.id) && s.proposal?.set && s.proposal.state !== 'ecartee')
  const multiProposals = offered.length > 1 && new Set(offered.map((s) => s.proposal.set)).size === 1
  const proposalTpl = `sys_propositions_${t}`
  useEffect(() => {
    if (editing || !multiProposals || !templates.some((x) => x.id === proposalTpl)) return
    setTemplateId((cur) => (String(cur).startsWith('sys_') && !String(cur).startsWith('sys_propositions') ? proposalTpl : cur))
  }, [multiProposals]) // eslint-disable-line react-hooks/exhaustive-deps
  const days = isQuote(t) ? settings.quoteValidityDays || 14 : client?.paymentTermDays ?? settings.paymentTermDays ?? 30
  const [date, setDate] = useState(doc?.date || toDateInput(today))
  const [dueDate, setDueDate] = useState(doc ? doc.dueDate : financial ? toDateInput(addDays(today, days)) : null)
  const autoNumber = useMemo(() => nextDocNumber(useStore.getState(), t, projectId, today), [t, projectId]) // eslint-disable-line react-hooks/exhaustive-deps
  const [number, setNumber] = useState('')
  const [open, setOpen] = useState({ page: true, doc: !editing, text: true, adv: editing })
  const [picker, setPicker] = useState(false)
  const rt = useRef(null)
  const textTemplates = (settings.textTemplates || []).filter((x) => x.type === 'tous' || x.type === t)

  // Valeurs proposées par le modèle pour le sujet et le nom de fichier
  const template = useMemo(() => templateById(settings, templateId), [settings, templateId])
  const preview = useMemo(() => {
    const d = doc || { id: 'preview', type: t, number: number.trim() || autoNumber, version: 1, date, dueDate, projectId, clientId: project?.clientId, subprojectIds: subIds, totals: { categories: {}, vatRate: settings.vatRate }, payments: [], extraLines: [] }
    return template ? docTexts({ ...d, subject: null, fileName: null }, idx, template, user) : { subject: '', fileName: '' }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template, doc, number, date, dueDate, subIds, idx, user])

  const submit = () => {
    const layout = { templateId, letterheadId, body: body.replace(/<p><br><\/p>|<br>/g, '').trim() ? body : null, subject: subject.trim() || null, fileName: fileName.trim() || null, showBackground: showBg ? null : false }
    setPreference('docDialog', { ...prefs, skip, [t]: { templateId, letterheadId } })
    if (editing) {
      useStore.getState().patch('documents', doc.id, { ...layout, date, dueDate })
      toast('Mise en page du document mise à jour')
      onDone?.(doc)
      return
    }
    if (subs.length > 1 && !subIds.length) return toast('Sélectionnez au moins un sous-projet', 'error')
    if (number.trim() && idx.d.documents.some((d) => d.type === t && d.number === number.trim())) return toast(`Le numéro ${number.trim()} existe déjà`, 'error')
    // Sous-projets explicites : une proposition seule ne doit pas entraîner les autres
    const created = useStore.getState().createDocument(projectId, t, { ...layout, subprojectIds: subIds.length ? subIds : undefined, number: number.trim(), date, dueDate })
    onDone?.(created)
  }

  const label = DOC_TYPES[t].label
  return (
    <Modal
      title={editing ? `Mise en page — ${label} ${doc.number}` : `Générer ${label.toLowerCase()}`}
      size="gen"
      onClose={onClose}
      footer={
        <>
          {!editing && (
            <label className="check gen-skip">
              <input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} />
              Ignorer cette fenêtre contextuelle la prochaine fois
            </label>
          )}
          <span className="spacer" />
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={submit} disabled={!templateId}>{editing ? 'Enregistrer' : 'Générer'}</button>
        </>
      }
    >
      <div className="gen">
        <Fold title="Mise en page" open={open.page} onToggle={() => setOpen({ ...open, page: !open.page })}>
          <div className="form-grid">
            <div className="field">
              <label>Modèle</label>
              <select className="select" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                {templates.map((x) => <option key={x.id} value={x.id}>{x.name}{x.system ? '' : ' (personnalisé)'}</option>)}
              </select>
            </div>
            <div className="field">
              <label>En-tête documents</label>
              <select className="select" value={letterheadId} onChange={(e) => setLetterheadId(e.target.value)}>
                {letterheads.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          </div>
        </Fold>

        <Fold title="Document" open={open.doc} onToggle={() => setOpen({ ...open, doc: !open.doc })}>
          <div className="form-grid">
            {!editing && (
              <div className="field">
                <label>Numéro <span className="muted">(Optionnel)</span></label>
                <input className="input" value={number} onChange={(e) => setNumber(e.target.value)} placeholder={autoNumber} />
              </div>
            )}
            <div className="field">
              <label>Date</label>
              <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            {financial && t !== 'avoir' && (
              <div className="field">
                <label>{isQuote(t) ? 'Valable jusqu’au' : 'Date d’échéance'}</label>
                <input type="date" className="input" value={dueDate || ''} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            )}
            {!editing && subs.length > 1 && (
              <div className="field full">
                <label>Sous-projets sélectionnés</label>
                <div className="gen-subs">
                  {subs.map((s) => (
                    <label key={s.id} className="check">
                      <input type="checkbox" checked={subIds.includes(s.id)} onChange={(e) => setSubIds(e.target.checked ? [...subIds, s.id] : subIds.filter((x) => x !== s.id))} />
                      {s.proposal?.label ? <strong>Proposition {s.proposal.label} ·&nbsp;</strong> : null}{s.name} <span className="muted small">({s.proposal?.state === 'ecartee' ? 'écartée' : statusOf(s.status).label})</span>
                    </label>
                  ))}
                </div>
                {multiProposals && isQuote(t) && (
                  <div className="gen-proposals"><Icon name="call_split" size={17} /> Ce document présente {offered.length} propositions ({offered.map((s) => s.proposal.label).join(', ')}) : le client choisira la sienne en signant. Le modèle « Propositions » détaille chacune avec son total.</div>
                )}
              </div>
            )}
          </div>
        </Fold>

        <Fold title="Texte du document" open={open.text} onToggle={() => setOpen({ ...open, text: !open.text })}>
          <div className="gen-tools">
            <Menu
              align="left"
              width={300}
              trigger={<button type="button" className="gen-link">Ajouter une variable <Icon name="expand_more" size={18} /></button>}
              items={[...QUICK_VARS.map(([path, l]) => ({ label: l, onClick: () => rt.current?.insert(`{$${path}}`) })), '-', { icon: 'data_object', label: 'Toutes les variables…', onClick: () => setPicker(true) }]}
            />
            <Menu
              align="left"
              width={300}
              trigger={<button type="button" className="gen-link">Appliquer modèle <Icon name="expand_more" size={18} /></button>}
              items={textTemplates.length ? textTemplates.map((x) => ({ label: x.name, onClick: () => rt.current?.setHtml(x.html) })) : [{ label: 'Aucun modèle de texte (Configuration › Modèles de documents)', disabled: true, onClick: () => {} }]}
            />
          </div>
          <RichText ref={rt} value={body} onChange={setBody} docType={t} minHeight={190} placeholder="Texte affiché par le module « Texte du document » du modèle" />
          {template && !JSON.stringify(template.blocks).includes('"documentText"') && <div className="alert alert-warning" style={{ marginTop: 10 }}><Icon name="info" size={18} /><span>Le modèle « {template.name} » n’affiche pas le texte du document (module « Texte du document » absent).</span></div>}
        </Fold>

        <Fold title="Paramètres avancés" open={open.adv} onToggle={() => setOpen({ ...open, adv: !open.adv })}>
          <div className="form-grid">
            <div className="field">
              <label>Nom de fichier</label>
              <input className="input" value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder={preview.fileName || 'Nom de fichier'} />
            </div>
            <div className="field">
              <label>Afficher le fond de l’en-tête</label>
              <select className="select" value={showBg ? '1' : '0'} onChange={(e) => setShowBg(e.target.value === '1')}>
                <option value="1">Oui</option>
                <option value="0">Non (papier déjà imprimé)</option>
              </select>
            </div>
            <div className="field full">
              <label>Sujet</label>
              <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={preview.subject || 'Sujet'} />
            </div>
          </div>
        </Fold>
      </div>
      {picker && <VariablePicker docType={t} onClose={() => setPicker(false)} onAdd={(path) => { setPicker(false); setTimeout(() => rt.current?.insert(`{$${path}}`), 0) }} />}
    </Modal>
  )
}
