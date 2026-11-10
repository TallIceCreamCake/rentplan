import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useIdx, useStore, toast } from '../store'
import { Icon, Menu } from '../components/ui'
import NotFound from './NotFound'
import { PoModal } from './Finance'
import { useTrackRecent } from '../components/useTrackRecent'
import { DocViewer, PagedDocument } from '../components/doc/DocRender'
import RichText from '../components/doc/RichText'
import { useDocUser } from '../components/doc/useDocUser'
import { DateField } from '../components/DatePicker'
import { PO_STATUSES } from '../lib/model'
import { purchaseOrderDoc } from '../lib/documents'
import { contactName, fmtDateTime, fmtMoney } from '../lib/utils'
import { docLayout, docTexts, letterheadsFor, templatesFor } from '../lib/templates'

/** Bon de commande au format PDF (modèle « Bon de commande », en-tête des bons de sous-location). */
export default function PurchaseOrderView() {
  const { id } = useParams()
  const idx = useIdx()
  const patch = useStore((s) => s.patch)
  const navigate = useNavigate()
  const user = useDocUser()
  const [edit, setEdit] = useState(false)
  const [pages, setPages] = useState(1)
  const po = idx.d.purchaseOrders.find((p) => p.id === id)
  useTrackRecent('commande', id, !!po)
  const s = idx.settings
  const doc = useMemo(() => (po ? purchaseOrderDoc(po, idx) : null), [po, idx])
  const { template, letterhead } = useMemo(() => (doc ? docLayout(doc, s) : {}), [doc?.templateId, doc?.letterheadId, s]) // eslint-disable-line react-hooks/exhaustive-deps
  const texts = useMemo(() => (doc && template ? docTexts(doc, idx, template, user) : { subject: '', fileName: '' }), [doc, idx, template, user])
  const onPages = useCallback((n) => setPages(n), [])
  if (!po) return <NotFound what="Ce bon de commande" />

  const supplier = idx.contact[po.supplierId]
  const project = idx.project[po.projectId]
  const subrent = po.subrentId ? idx.d.subrents.find((x) => x.id === po.subrentId) : null
  const st = PO_STATUSES.find((x) => x.id === po.status) || PO_STATUSES[0]
  const update = (p) => patch('purchaseOrders', po.id, p)
  const W = Number(letterhead.width) || 21
  const H = Number(letterhead.height) || 29.7
  const print = () => {
    // Le navigateur propose le « Nom de fichier » du modèle pour le PDF
    const title = document.title
    document.title = texts.fileName
    window.addEventListener('afterprint', () => (document.title = title), { once: true })
    window.print()
  }
  const sendByEmail = () => {
    if (!supplier?.email) toast('Ce fournisseur n’a pas d’adresse e-mail : complétez sa fiche contact', 'error')
    const lines = ['Bonjour,', '', `Veuillez trouver ci-joint notre bon de commande ${po.number}${subrent?.startsAt ? ` pour la période du ${fmtDateTime(subrent.startsAt)} au ${fmtDateTime(subrent.endsAt)}` : ''}.`, 'Merci de nous confirmer sa bonne réception.', '', 'Cordialement,', s.companyName || '']
    window.location.href = `mailto:${encodeURIComponent(supplier?.email || '')}?subject=${encodeURIComponent(texts.subject || `Bon de commande ${po.number}`)}&body=${encodeURIComponent(lines.join('\n'))}`
    if (po.status === 'brouillon') update({ status: 'envoye' })
  }

  return (
    <>
      <style>{`@page { size: ${W}cm ${H}cm; margin: 0; }`}</style>
      <div className="no-print">
        <div className="page-header">
          <div>
            <div className="crumbs">
              <Link to="/finances?tab=commandes">Bons de commande</Link> <Icon name="chevron_right" size={15} />
              {project ? <Link to={`/projets/${project.id}?tab=commandes`}>{project.number} {project.name}</Link> : <span>Sans projet</span>}
            </div>
            <h1>Bon de commande {po.number}</h1>
          </div>
          <div className="actions">
            <select className="select" style={{ width: 150, color: st.color, fontWeight: 600 }} value={po.status} onChange={(e) => update({ status: e.target.value })} aria-label="Statut">
              {PO_STATUSES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
            <button className="btn" onClick={() => setEdit(true)}><Icon name="edit" size={18} /> Modifier</button>
            <button className="btn btn-primary" onClick={print}><Icon name="print" size={18} /> Imprimer / PDF</button>
            <Menu
              trigger={<button className="btn btn-icon" aria-label="Plus d'options"><Icon name="more_vert" /></button>}
              items={[
                { icon: 'mail', label: 'Envoyer au fournisseur par e-mail', onClick: sendByEmail },
                subrent && { icon: 'swap_horizontal_circle', label: `Sous-location ${subrent.number}`, onClick: () => navigate(subrent.projectId ? `/projets/${subrent.projectId}?tab=souslocation` : '/penuries?tab=souslocations') },
                { icon: 'edit_document', label: 'Modifier le modèle', onClick: () => navigate(`/editeur/${template.id}`) },
                '-',
                { icon: 'delete', label: 'Supprimer', danger: true, onClick: () => { if (confirm(`Supprimer le bon de commande ${po.number} ?`)) { useStore.getState().remove('purchaseOrders', po.id); navigate('/finances?tab=commandes') } } },
              ]}
            />
          </div>
        </div>
        <div className="card card-body row wrap doc-toolbar">
          <label className="row small">Date <span style={{ width: 190 }}><DateField small value={po.date || ''} onChange={(v) => update({ date: v })} aria-label="Date du bon de commande" /></span></label>
          <label className="row small">
            Modèle
            <select className="select input-sm" style={{ width: 170 }} value={template.id} onChange={(e) => update({ templateId: e.target.value })}>
              {templatesFor(s, 'commande', { includeHidden: true }).filter((t) => !t.hidden || t.id === template.id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label className="row small">
            En-tête
            <select className="select input-sm" style={{ width: 170 }} value={letterhead.id} onChange={(e) => update({ letterheadId: e.target.value })}>
              {letterheadsFor(s, 'commande').concat(letterheadsFor(s, 'commande').some((l) => l.id === letterhead.id) ? [] : [letterhead]).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
          <label className="check small"><input type="checkbox" checked={po.showBackground !== false} onChange={(e) => update({ showBackground: e.target.checked ? null : false })} /> Fond de l’en-tête</label>
          <span className="spacer" />
          <span className="small muted">{pages} page{pages > 1 ? 's' : ''}</span>
          <span className="small">Total : <strong>{fmtMoney(doc.totals.totalExVat, s.currency)} HT</strong></span>
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
            <PagedDocument doc={doc} template={template} letterhead={letterhead} idx={idx} user={user} showBackground={po.showBackground !== false} onPages={onPages} />
          </DocViewer>
        </div>
        <aside className="doc-side no-print">
          <div className="card">
            <div className="card-header"><span className="section-title">Fournisseur</span></div>
            <div className="card-body small stack" style={{ gap: 4 }}>
              {supplier ? (
                <>
                  <Link to={`/contacts/${supplier.id}`} className="strong">{contactName(supplier)}</Link>
                  {supplier.email && <span>{supplier.email}</span>}
                  {supplier.phone && <span>{supplier.phone}</span>}
                </>
              ) : <span className="muted">Aucun fournisseur : choisissez-le avec « Modifier ».</span>}
              {subrent && <span className="muted">Sous-location {subrent.number} · {fmtDateTime(subrent.startsAt)} → {fmtDateTime(subrent.endsAt)}</span>}
            </div>
          </div>
          <div className="card">
            <div className="card-header"><span className="section-title">Texte du document</span></div>
            <div className="card-body">
              <RichText key={po.id} value={po.body || ''} onChange={(html) => update({ body: html })} docType="commande" minHeight={110} placeholder="Ex. instructions de livraison, horaires d’enlèvement…" />
            </div>
          </div>
          <div className="card">
            <div className="card-header"><span className="section-title">Conditions</span></div>
            <div className="card-body">
              <textarea className="textarea" rows={4} value={po.notes || ''} onChange={(e) => update({ notes: e.target.value })} style={{ fontSize: 13 }} placeholder="Ex. matériel à livrer testé et en état de fonctionnement." aria-label="Conditions" />
            </div>
          </div>
          <div className="card">
            <div className="card-header"><span className="section-title">Envoi</span></div>
            <div className="card-body small stack" style={{ gap: 6 }}>
              <div><span className="muted">Sujet :</span> {texts.subject || '—'}</div>
              <div><span className="muted">Nom de fichier :</span> <span className="mono">{texts.fileName}.pdf</span></div>
              <button className="btn-link" onClick={sendByEmail}><Icon name="mail" size={16} /> Envoyer au fournisseur</button>
            </div>
          </div>
        </aside>
      </div>
      {edit && <PoModal po={po} idx={idx} onClose={() => setEdit(false)} />}
    </>
  )
}
