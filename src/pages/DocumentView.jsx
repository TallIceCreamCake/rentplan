import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useIdx, useStore, toast } from '../store'
import { Empty, Icon, Menu, Modal, NumInput } from '../components/ui'
import { useAccess } from '../lib/auth'
import NotFound from './NotFound'
import { PaymentModal } from './Finance'
import { useTrackRecent } from '../components/useTrackRecent'
import { DocViewer, PagedDocument } from '../components/doc/DocRender'
import GenerateDocModal from '../components/doc/GenerateDocModal'
import RichText from '../components/doc/RichText'
import SignForm, { signState } from '../components/doc/SignForm'
import { useDocUser } from '../components/doc/useDocUser'
import { DOC_TYPES, docStatusOf, isFinancialDoc, paidAmount, statusesOfType } from '../lib/model'
import { documentAmounts } from '../lib/documents'
import { contactName, downloadFile, fmtDateTime, fmtMoney } from '../lib/utils'
import { buildUbl } from '../lib/einvoice'
import { settingObject } from './settings/panels'
import { docLayout, docTexts, letterheadsFor, templatesFor } from '../lib/templates'
import { makeEnv } from '../lib/templates/schema'
import { display } from '../lib/templates/engine'

export default function DocumentView() {
  const { id } = useParams()
  const idx = useIdx()
  const patch = useStore((s) => s.patch)
  const navigate = useNavigate()
  const user = useDocUser()
  const [pay, setPay] = useState(false)
  const [layoutOpen, setLayoutOpen] = useState(false)
  const [signing, setSigning] = useState(false)
  const [pages, setPages] = useState(1)
  const doc = idx.d.documents.find((d) => d.id === id)
  useTrackRecent('document', id, !!doc)
  const s = idx.settings
  const { template, letterhead } = useMemo(() => (doc ? docLayout(doc, s) : {}), [doc?.templateId, doc?.letterheadId, doc?.type, s]) // eslint-disable-line react-hooks/exhaustive-deps
  const texts = useMemo(() => (doc && template ? docTexts(doc, idx, template, user) : { subject: '', fileName: '' }), [doc, idx, template, user])
  const onPages = useCallback((n) => setPages(n), [])
  const access = useAccess()
  if (!doc) return <NotFound what="Ce document" />
  const financial = isFinancialDoc(doc)
  if (financial && !access.finances)
    return <div className="card" style={{ marginTop: 26 }}><Empty icon="lock" title="Accès refusé" text={`Votre rôle « ${access.roleName} » ne donne pas accès aux documents financiers.`} /></div>

  const project = idx.project[doc.projectId]
  const client = idx.contact[doc.clientId]
  const person = project?.contactPersonId ? idx.person[project.contactPersonId] : null
  const isQuote = doc.type === 'devis' || doc.type === 'contrat'
  const st = docStatusOf(doc)
  const am = documentAmounts(doc)
  const paid = paidAmount(doc)
  const cur = s.currency
  const update = (p) => patch('documents', doc.id, p)
  const einvoice = settingObject(s, 'einvoice')
  const signable = signState(doc, s)
  const signUrl = `${window.location.origin}/signer/${doc.id}`
  const W = Number(letterhead.width) || 21
  const H = Number(letterhead.height) || 29.7

  const print = () => {
    // Le nom du fichier PDF proposé par le navigateur reprend le « Nom de fichier » du modèle
    const title = document.title
    document.title = texts.fileName
    window.addEventListener('afterprint', () => (document.title = title), { once: true })
    window.print()
  }
  const sendByEmail = () => {
    const m = settingObject(s, 'emailSettings')
    const sal = settingObject(s, 'salutation')
    const greeting = display(makeEnv({ doc, idx, user, template }).resolve('f.greeting'), {})
    const vars = { '{document}': DOC_TYPES[doc.type].label.toLowerCase(), '{numéro}': doc.number, '{projet}': project?.name || '', '{client}': contactName(client), '{prénom}': person?.firstName || '' }
    const fill = (txt) => Object.entries(vars).reduce((out, [k, v]) => out.split(k).join(v), txt || '')
    const to = person?.email || client?.email || ''
    const lines = [greeting, '', fill(m.body)]
    if (signable.ok) lines.push('', `Vous pouvez signer ${doc.type === 'contrat' ? 'ce contrat' : 'cette offre'} en ligne : ${signUrl}`)
    lines.push('', sal.closing, '', sal.politeness, fill(m.signature))
    window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(texts.subject || fill(m.subject))}&body=${encodeURIComponent(lines.join('\n'))}`
  }

  return (
    <>
      <style>{`@page { size: ${W}cm ${H}cm; margin: 0; }`}</style>
      <div className="no-print">
        <div className="page-header">
          <div>
            <div className="crumbs">
              {financial ? <Link to="/finances">Finances</Link> : <Link to="/projets">Projets</Link>} <Icon name="chevron_right" size={15} />
              {project ? <Link to={`/projets/${project.id}?tab=documents`}>{project.number} {project.name}</Link> : <span>Sans projet</span>}
            </div>
            <h1>{DOC_TYPES[doc.type].label} {doc.number}{doc.version > 1 ? ` (v${doc.version})` : ''}</h1>
          </div>
          <div className="actions">
            <select className="select" style={{ width: 170, color: st.color, fontWeight: 600 }} value={doc.status} onChange={(e) => update({ status: e.target.value })} aria-label="Statut">
              {statusesOfType(doc.type).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
            {doc.type === 'facture' && doc.status !== 'payee' && <button className="btn" onClick={() => setPay(true)}><Icon name="payments" size={18} /> Paiement</button>}
            {signable.ok && <button className="btn" onClick={() => setSigning(true)}><Icon name="draw" size={18} /> Signer</button>}
            <button className="btn" onClick={() => setLayoutOpen(true)}><Icon name="dashboard_customize" size={18} /> Mise en page</button>
            <button className="btn btn-primary" onClick={print}><Icon name="print" size={18} /> Imprimer / PDF</button>
            <Menu
              trigger={<button className="btn btn-icon" aria-label="Plus d'options"><Icon name="more_vert" /></button>}
              items={[
                { icon: 'mail', label: 'Envoyer par e-mail', onClick: sendByEmail },
                isQuote && { icon: 'open_in_new', label: 'Ouvrir la page de signature', onClick: () => window.open(`/signer/${doc.id}`, '_blank', 'noopener') },
                isQuote && { icon: 'link', label: 'Copier le lien de signature', onClick: () => navigator.clipboard?.writeText(signUrl).then(() => toast('Lien de signature copié')) },
                doc.signature && { icon: 'backspace', label: 'Retirer la signature', onClick: () => { if (confirm('Retirer la signature numérique de ce document ?')) update({ signature: null, signedAt: null }) } },
                einvoice.enabled && (doc.type === 'facture' || doc.type === 'avoir') && { icon: 'code', label: `Facture électronique (${einvoice.format})`, onClick: () => { downloadFile(`${texts.fileName}.xml`, buildUbl(doc, idx, paid), 'application/xml'); toast('Facture électronique exportée') } },
                { icon: 'edit_document', label: 'Modifier le modèle', onClick: () => navigate(`/editeur/${template.id}`) },
                project && { icon: 'refresh', label: 'Regénérer — nouvelle version', onClick: () => { useStore.getState().regenerateDocument(doc.id); toast('Document regénéré à partir du projet') } },
                isQuote && { icon: 'receipt', label: 'Convertir en facture', onClick: () => { const inv = useStore.getState().convertQuoteToInvoice(doc.id); toast(`Facture ${inv.number} créée`); navigate(`/documents/${inv.id}`) } },
                doc.type === 'facture' && { icon: 'undo', label: 'Créer une note de crédit', onClick: () => { const cn = useStore.getState().createCreditNote(doc.id); navigate(`/documents/${cn.id}`) } },
                '-',
                { icon: 'delete', label: 'Supprimer', danger: true, onClick: () => { if (confirm(`Supprimer ${doc.number} ?`)) { useStore.getState().remove('documents', doc.id); navigate('/finances') } } },
              ]}
            />
          </div>
        </div>
        <div className="card card-body row wrap doc-toolbar">
          <label className="row small">Date <input type="date" className="input input-sm" style={{ width: 150 }} value={doc.date || ''} onChange={(e) => update({ date: e.target.value })} /></label>
          {financial && doc.type !== 'avoir' && <label className="row small">{isQuote ? 'Valable jusqu’au' : 'Échéance'} <input type="date" className="input input-sm" style={{ width: 150 }} value={doc.dueDate || ''} onChange={(e) => update({ dueDate: e.target.value })} /></label>}
          {doc.type === 'facture' && (
            <label className="row small">
              Facture partielle
              <span className="input-group" style={{ width: 110 }}>
                <NumInput value={doc.partialPct ?? 100} max={100} onChange={(v) => update({ partialPct: v >= 100 ? null : v })} />
                <span className="addon">%</span>
              </span>
            </label>
          )}
          <label className="row small">
            Modèle
            <select className="select input-sm" style={{ width: 170 }} value={template.id} onChange={(e) => update({ templateId: e.target.value })}>
              {templatesFor(s, doc.type, { includeHidden: true }).filter((t) => !t.hidden || t.id === template.id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label className="row small">
            En-tête
            <select className="select input-sm" style={{ width: 170 }} value={letterhead.id} onChange={(e) => update({ letterheadId: e.target.value })}>
              {letterheadsFor(s, doc.type).concat(letterheadsFor(s, doc.type).some((l) => l.id === letterhead.id) ? [] : [letterhead]).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
          <label className="check small"><input type="checkbox" checked={doc.showBackground !== false} onChange={(e) => update({ showBackground: e.target.checked ? null : false })} /> Fond de l’en-tête</label>
          <span className="spacer" />
          <span className="small muted">{pages} page{pages > 1 ? 's' : ''}</span>
          {doc.type === 'facture' && <span className="small">Payé : <strong>{fmtMoney(paid, cur)}</strong> / {fmtMoney(am.total, cur)}</span>}
        </div>
      </div>

      <div className="doc-view">
        <div className="doc-view-pages">
          <DocViewer
            pages={pages}
            pageWidth={W}
            initialFit
            actions={
              <>
                <span className="pdfv-file" title="Nom du fichier PDF"><Icon name="picture_as_pdf" size={17} /> {texts.fileName}.pdf</span>
                <button type="button" className="pdfv-btn primary" onClick={print} title="Imprimer ou « Enregistrer au format PDF »"><Icon name="download" size={18} /> PDF</button>
              </>
            }
          >
            <PagedDocument doc={doc} template={template} letterhead={letterhead} idx={idx} user={user} showBackground={doc.showBackground !== false} onPages={onPages} />
          </DocViewer>
        </div>
        <aside className="doc-side no-print">
          {doc.signature && (
            <div className="card doc-signed-card">
              <div className="card-header"><Icon name="task_alt" size={19} style={{ color: 'var(--success)' }} /><span className="section-title">Signé numériquement</span></div>
              <div className="card-body">
                {doc.signature.image && <img src={doc.signature.image} alt="Signature" className="doc-signed-img" />}
                {doc.signature.proposal && <div className="sign-chosen"><span className="pp-letter sm" style={{ background: 'var(--success)' }}>{doc.signature.proposal.label}</span> Proposition retenue : <strong>{doc.signature.proposal.name}</strong></div>}
                <div className="strong">{doc.signature.name}</div>
                <div className="muted small">{doc.signature.email}{doc.signature.email && ' · '}{fmtDateTime(doc.signedAt || doc.signature.signedAt)}</div>
                {doc.signature.comment && <p className="small" style={{ marginBottom: 0 }}>« {doc.signature.comment} »</p>}
              </div>
            </div>
          )}
          <div className="card">
            <div className="card-header"><span className="section-title">Texte du document</span></div>
            <div className="card-body">
              <RichText key={doc.id} value={doc.body || ''} onChange={(html) => update({ body: html })} docType={doc.type} minHeight={120} placeholder="Texte affiché par le module « Texte du document »" />
            </div>
          </div>
          {financial && <div className="card">
            <div className="card-header"><span className="section-title">Lignes supplémentaires</span></div>
            <div className="card-body">
              <p className="muted small" style={{ marginTop: 0 }}>Montant HT, négatif pour une déduction. Affichées par le module Somme.</p>
              {(doc.extraLines || []).map((l, i) => (
                <div key={i} className="row" style={{ marginBottom: 6 }}>
                  <input className="input input-sm" value={l.label} onChange={(e) => update({ extraLines: doc.extraLines.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} aria-label="Libellé" />
                  <NumInput style={{ width: 110 }} value={l.amount} onChange={(v) => update({ extraLines: doc.extraLines.map((x, j) => (j === i ? { ...x, amount: v } : x)) })} />
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => update({ extraLines: doc.extraLines.filter((_, j) => j !== i) })} aria-label="Retirer"><Icon name="delete" size={17} /></button>
                </div>
              ))}
              <button className="btn-link" onClick={() => update({ extraLines: [...(doc.extraLines || []), { label: 'Ligne supplémentaire', amount: 0 }] })}><Icon name="add" size={17} /> Ajouter une ligne</button>
            </div>
          </div>}
          <div className="card">
            <div className="card-header"><span className="section-title">Conditions</span></div>
            <div className="card-body">
              <textarea className="textarea" rows={4} value={doc.notes || ''} onChange={(e) => update({ notes: e.target.value })} style={{ fontSize: 13 }} aria-label="Conditions" />
            </div>
          </div>
          <div className="card">
            <div className="card-header"><span className="section-title">Envoi</span></div>
            <div className="card-body small stack" style={{ gap: 6 }}>
              <div><span className="muted">Sujet :</span> {texts.subject || '—'}</div>
              <div><span className="muted">Nom de fichier :</span> <span className="mono">{texts.fileName}.pdf</span></div>
              <button className="btn-link" onClick={() => setLayoutOpen(true)}><Icon name="edit" size={16} /> Modifier la mise en page</button>
            </div>
          </div>
        </aside>
      </div>
      {pay && <PaymentModal doc={doc} onClose={() => setPay(false)} />}
      {layoutOpen && <GenerateDocModal doc={doc} type={doc.type} onClose={() => setLayoutOpen(false)} onDone={() => setLayoutOpen(false)} />}
      {signing && (
        <Modal title={`Signer — ${DOC_TYPES[doc.type].label} ${doc.number}`} onClose={() => setSigning(false)}>
          <p className="muted small" style={{ marginTop: 0 }}>Signature sur place (tablette, ordinateur). Le client peut aussi signer à distance avec le bouton du document ou le lien de signature.</p>
          <SignForm doc={doc} onSigned={() => setSigning(false)} onCancel={() => setSigning(false)} />
        </Modal>
      )}
    </>
  )
}
