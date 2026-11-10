import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useIdx } from '../store'
import { Icon } from '../components/ui'
import { DocViewer, PagedDocument } from '../components/doc/DocRender'
import SignForm, { signState } from '../components/doc/SignForm'
import { useDocUser } from '../components/doc/useDocUser'
import { docLayout, docTexts } from '../lib/templates'
import { DOC_TYPES } from '../lib/model'
import { documentAmounts } from '../lib/documents'
import { fmtDate, fmtDateTime, fmtMoney } from '../lib/utils'

/** Page de signature numérique d'un devis ou d'un contrat (lien du bouton « Signature numérique »). */
export default function SignDocument() {
  const { id } = useParams()
  const idx = useIdx()
  const user = useDocUser()
  const s = idx.settings
  const doc = idx.d.documents.find((d) => d.id === id)
  const { template, letterhead } = useMemo(() => (doc ? docLayout(doc, s) : {}), [doc?.templateId, doc?.letterheadId, doc?.type, s]) // eslint-disable-line react-hooks/exhaustive-deps
  const [pages, setPages] = useState(1)
  const [done, setDone] = useState(false)

  if (!doc) {
    return (
      <div className="sign-page">
        <div className="sign-card"><Icon name="search_off" size={40} /><h2>Document introuvable</h2><p className="muted">Ce lien de signature n’est plus valable ou vous n’avez pas accès à ce document.</p><Link to="/">Retour à RentPlan</Link></div>
      </div>
    )
  }
  const st = signState(doc, s)
  const texts = docTexts(doc, idx, template, user)
  const logo = s.digitalSignature?.logoUrl || s.logoUrl
  const label = DOC_TYPES[doc.type].label
  return (
    <div className="sign-page">
      <header className="sign-top">
        {logo ? <img src={logo} alt={s.companyName} /> : <strong>{s.companyName}</strong>}
        <span className="spacer" />
        <span className="muted small">{s.phone}{s.phone && s.email ? ' · ' : ''}{s.email}</span>
      </header>
      <div className="sign-layout">
        <section className="sign-doc">
          <DocViewer pages={pages} pageWidth={Number(letterhead?.width) || 21} initialFit>
            <PagedDocument doc={doc} template={template} letterhead={letterhead} idx={idx} user={user} showBackground={doc.showBackground !== false} onPages={setPages} />
          </DocViewer>
        </section>
        <aside className="sign-side">
          <div className="sign-card">
            <div className="sign-kicker">{label} {doc.number}</div>
            <h2>{texts.subject || label}</h2>
            <div className="sign-amount">{fmtMoney(documentAmounts(doc).total, s.currency)} <span className="muted small">TTC</span></div>
            <div className="muted small">Émis le {fmtDate(doc.date)}{doc.dueDate ? ` · valable jusqu’au ${fmtDate(doc.dueDate)}` : ''}</div>
          </div>
          <div className="sign-card">
            {doc.signature ? (
              <div className="sign-done">
                <Icon name="task_alt" size={34} />
                <h3>{done ? 'Merci, votre signature est enregistrée' : 'Document signé'}</h3>
                {doc.signature.image && <img src={doc.signature.image} alt="Signature" />}
                <p className="muted small">Signé par {doc.signature.name} le {fmtDateTime(doc.signedAt || doc.signature.signedAt)}.</p>
              </div>
            ) : st.ok ? (
              <>
                <h3 style={{ marginTop: 0 }}>Signer et accepter</h3>
                <SignForm doc={doc} onSigned={() => setDone(true)} />
              </>
            ) : (
              <div className="alert alert-warning"><Icon name="info" size={18} /><span>{st.reason}</span></div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
