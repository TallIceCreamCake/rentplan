import { useRef, useState } from 'react'
import { useIdx, useStore, toast } from '../../store'
import { Field, Icon } from '../ui'
import SignaturePad from './SignaturePad'
import { DOC_TYPES } from '../../lib/model'
import { fmtMoney, parse, personName, startOfDay } from '../../lib/utils'

/** Peut-on encore signer ce document ? (réglages de Configuration › Communication › Signature digitale) */
export function signState(doc, settings) {
  const d = { enabled: true, allowComments: true, allowExpired: false, ...(settings.digitalSignature || {}) }
  if (!['devis', 'contrat'].includes(doc.type)) return { ok: false, reason: 'Seuls les devis et les contrats se signent numériquement.' }
  if (doc.signature) return { ok: false, signed: true, reason: 'Ce document est déjà signé.' }
  if (!d.enabled) return { ok: false, reason: 'La signature numérique n’est pas activée (Configuration › Communication).' }
  if (doc.status === 'refuse') return { ok: false, reason: 'Ce document a été refusé.' }
  const expired = doc.dueDate && parse(doc.dueDate) < startOfDay(new Date())
  if (expired && !d.allowExpired) return { ok: false, reason: 'Ce document a expiré : contactez-nous pour recevoir une nouvelle version.' }
  return { ok: true, comments: d.allowComments }
}

/** Formulaire de signature (nom, e-mail, commentaire, signature manuscrite, accord). */
export default function SignForm({ doc, onSigned, onCancel }) {
  const idx = useIdx()
  const settings = useStore((s) => s.settings)
  const st = signState(doc, settings)
  const person = idx.person[idx.project[doc.projectId]?.contactPersonId]
  const [name, setName] = useState(person ? personName(person) : '')
  const [email, setEmail] = useState(person?.email || '')
  const [comment, setComment] = useState('')
  const [agree, setAgree] = useState(false)
  const [drawn, setDrawn] = useState(false)
  // Devis à propositions : le client choisit la sienne
  const offered = doc.content?.proposals || []
  const [choice, setChoice] = useState(offered.length === 1 ? offered[0].subprojectId : null)
  const pad = useRef(null)
  if (!st.ok) return <div className={`alert ${st.signed ? 'alert-info' : 'alert-warning'}`}><Icon name={st.signed ? 'task_alt' : 'info'} size={18} /><span>{st.reason}</span></div>
  const submit = () => {
    if (!name.trim()) return toast('Indiquez votre nom', 'error')
    const image = pad.current?.toDataURL()
    if (!image) return toast('Signez dans la zone prévue', 'error')
    if (!agree) return toast('Cochez la case d’accord', 'error')
    if (offered.length > 1 && !choice) return toast('Choisissez une proposition', 'error')
    useStore.getState().signDocument(doc.id, { name: name.trim(), email: email.trim(), comment: st.comments ? comment.trim() : '', image, proposalSubId: choice })
    const picked = offered.find((p) => p.subprojectId === choice)
    toast(`${DOC_TYPES[doc.type].label} ${doc.number} signé${picked && offered.length > 1 ? ` · proposition ${picked.label} retenue` : ''}`)
    onSigned?.()
  }
  return (
    <div className="stack" style={{ gap: 14 }}>
      {offered.length > 1 && (
        <Field label="Votre choix">
          <div className="sign-proposals">
            {offered.map((p) => (
              <label key={p.subprojectId} className={`sign-proposal ${choice === p.subprojectId ? 'on' : ''}`}>
                <input type="radio" name="proposition" checked={choice === p.subprojectId} onChange={() => setChoice(p.subprojectId)} />
                <span className="pp-letter sm" style={{ background: choice === p.subprojectId ? 'var(--primary)' : '#8a929c' }}>{p.label}</span>
                <span className="sign-proposal-name">{p.name}</span>
                <span className="sign-proposal-total">{fmtMoney(p.totalExVat, settings.currency)} HT<span className="muted small"> · {fmtMoney(p.total, settings.currency)} TTC</span></span>
              </label>
            ))}
          </div>
        </Field>
      )}
      <div className="form-grid">
        <Field label="Nom et prénom"><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>
        <Field label="E-mail"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>
        {st.comments && <Field label="Commentaire (facultatif)" className="full"><textarea className="textarea" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} /></Field>}
      </div>
      <Field label="Signature"><SignaturePad ref={pad} onChange={setDrawn} /></Field>
      <label className="check">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        J’accepte {doc.type === 'contrat' ? 'ce contrat' : 'cette offre'} ({doc.number}){offered.length > 1 && choice ? `, proposition ${offered.find((p) => p.subprojectId === choice)?.label},` : ''} et ses conditions.
      </label>
      <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
        {onCancel && <button className="btn" onClick={onCancel}>Annuler</button>}
        <button className="btn btn-primary" onClick={submit} disabled={!drawn || !agree || !name.trim() || (offered.length > 1 && !choice)}><Icon name="draw" size={18} /> {offered.length > 1 ? 'Choisir et signer' : 'Signer et accepter'}</button>
      </div>
    </div>
  )
}
