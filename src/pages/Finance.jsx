import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useIdx, useStore, toast } from '../store'
import { Badge, Empty, Field, Icon, Kpi, Menu, Modal, NumInput, SortTh, Tabs, sortBy } from '../components/ui'
import { DOC_TYPES, docStatusOf, INVOICE_STATUSES, isConfirmed, paidAmount, PO_STATUSES, projectStatus, projectTimes, projectTotals, QUOTE_STATUSES } from '../lib/model'
import { documentAmounts } from '../lib/documents'
import GenerateDocModal, { generateDirect, skipGenerateDialog } from '../components/doc/GenerateDocModal'
import { contactName, downloadFile, fmtDate, fmtMoney, matches, parse, round2, toCsv, toDateInput } from '../lib/utils'

export { PO_STATUSES }

export default function Finance() {
  const idx = useIdx()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || 'factures'
  const [newInvoice, setNewInvoice] = useState(false)
  const docs = idx.d.documents
  const invoices = docs.filter((d) => d.type === 'facture' || d.type === 'avoir')
  const quotes = docs.filter((d) => d.type === 'devis' || d.type === 'contrat')
  const cur = idx.settings.currency
  const sum = (list) => round2(list.reduce((s, d) => s + documentAmounts(d).total, 0))
  const open = invoices.filter((d) => d.type === 'facture' && ['envoye', 'partiel'].includes(d.status))
  const late = open.filter((d) => docStatusOf(d).id === 'retard')
  const toInvoice = idx.d.projects.filter((p) => isConfirmed(projectStatus(p.id, idx).id)).map((p) => {
    const total = projectTotals(p.id, idx).total
    const invoiced = (idx.docsByProject[p.id] || []).filter((d) => d.type === 'facture' && d.status !== 'annulee').reduce((s, d) => s + documentAmounts(d).total, 0)
    return { p, total, invoiced, rest: round2(total - invoiced), t: projectTimes(p.id, idx) }
  }).filter((x) => x.rest > 0.01)

  return (
    <>
      <div className="page-header">
        <h1>Finances <span className="help-dot" title="Devis, contrats, factures et bons de commande"><Icon name="help_outline" size={20} /></span></h1>
        <div className="actions">
          <button className="btn btn-primary" onClick={() => setNewInvoice(true)}><Icon name="add" /> Facture</button>
        </div>
      </div>
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Kpi icon="hourglass_top" color="#1f87e5" label="Factures ouvertes (TTC)" value={fmtMoney(sum(open) - open.reduce((s, d) => s + paidAmount(d), 0), cur)} sub={`${open.length} facture(s)`} />
        <Kpi icon="warning" color="#e2284f" label="En retard" value={fmtMoney(sum(late) - late.reduce((s, d) => s + paidAmount(d), 0), cur)} sub={`${late.length} facture(s)`} />
        <Kpi icon="monetization_on" color="#4f46c8" label="À facturer (TTC)" value={fmtMoney(toInvoice.reduce((s, x) => s + x.rest, 0), cur)} sub={`${toInvoice.length} projet(s)`} />
        <Kpi icon="description" color="#f08c00" label="Devis en attente" value={quotes.filter((d) => d.status === 'envoye').length} sub={fmtMoney(sum(quotes.filter((d) => d.status === 'envoye')), cur)} />
      </div>
      <Tabs
        value={tab}
        onChange={(t) => setParams({ tab: t })}
        tabs={[
          { id: 'devis', label: 'Devis & contrats', count: quotes.length },
          { id: 'factures', label: 'Factures', count: invoices.length },
          { id: 'afacturer', label: 'À facturer', count: toInvoice.length },
          { id: 'commandes', label: 'Bons de commande', count: idx.d.purchaseOrders.length },
        ]}
      />
      {tab === 'devis' && <DocTable docs={quotes} idx={idx} statuses={QUOTE_STATUSES} kind="devis" />}
      {tab === 'factures' && <DocTable docs={invoices} idx={idx} statuses={INVOICE_STATUSES} kind="facture" />}
      {tab === 'afacturer' && <ToInvoice rows={toInvoice} idx={idx} />}
      {tab === 'commandes' && <PurchaseOrders idx={idx} />}
      {newInvoice && <NewInvoiceModal idx={idx} onClose={() => setNewInvoice(false)} />}
    </>
  )
}

function DocTable({ docs, idx, statuses, kind }) {
  const store = useStore()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [sort, setSort] = useState({ key: 'date', dir: 'desc' })
  const [pay, setPay] = useState(null)
  const cur = idx.settings.currency
  const rows = sortBy(
    docs.map((d) => ({ ...d, projectName: idx.project[d.projectId]?.name || '—', clientName: contactName(idx.contact[d.clientId]), st: docStatusOf(d), amounts: documentAmounts(d), paid: paidAmount(d) })).filter((d) => matches(q, d.number, d.projectName, d.clientName)),
    sort,
    { total: (d) => d.amounts.total },
  )
  const exportCsv = () =>
    downloadFile(`${kind}.csv`, '﻿' + toCsv([['Numéro', 'Type', 'Projet', 'Client', 'Date', 'Échéance', 'HT', 'TVA', 'TTC', 'Payé', 'Statut'], ...rows.map((d) => [d.number, DOC_TYPES[d.type].label, d.projectName, d.clientName, fmtDate(d.date), fmtDate(d.dueDate), d.amounts.exVat, d.amounts.vat, d.amounts.total, d.paid, d.st.label])]), 'text/csv;charset=utf-8')
  return (
    <div className="card">
      <div className="grid-toolbar">
        <div className="search underline" style={{ width: 300 }}>
          <Icon name="search" size={19} className="icon" />
          <input className="input" placeholder="Numéro, projet, client…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="spacer" />
        <button className="btn btn-ghost btn-icon" onClick={exportCsv} title="Exporter (CSV)" aria-label="Exporter"><Icon name="download" /></button>
      </div>
      {rows.length === 0 ? (
        <Empty icon="description" title="Aucun document" text="Générez des devis et factures depuis l'onglet Finances d'un projet." />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <SortTh label="Numéro" k="number" sort={sort} setSort={setSort} />
                <th>Type</th>
                <SortTh label="Projet" k="projectName" sort={sort} setSort={setSort} />
                <SortTh label="Client" k="clientName" sort={sort} setSort={setSort} />
                <SortTh label="Date" k="date" sort={sort} setSort={setSort} />
                <SortTh label={kind === 'devis' ? 'Expiration' : 'Échéance'} k="dueDate" sort={sort} setSort={setSort} />
                <SortTh label="Total TTC" k="total" sort={sort} setSort={setSort} className="num" />
                {kind === 'facture' && <th className="num">Payé</th>}
                <th>Statut</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className="clickable" onClick={() => navigate(`/documents/${d.id}`)}>
                  <td className="mono strong nowrap">{d.number}{d.version > 1 ? ` v${d.version}` : ''}</td>
                  <td>{DOC_TYPES[d.type].label}{d.partialPct ? ` (${d.partialPct} %)` : ''}</td>
                  <td>{d.projectId ? <Link to={`/projets/${d.projectId}?tab=finances`} onClick={(e) => e.stopPropagation()}>{d.projectName}</Link> : '—'}</td>
                  <td>{d.clientName}</td>
                  <td className="nowrap">{fmtDate(d.date)}</td>
                  <td className={`nowrap ${['retard', 'expire'].includes(d.st.id) ? 'danger-text strong' : ''}`}>{fmtDate(d.dueDate)}</td>
                  <td className="num mono strong">{fmtMoney(d.amounts.total, cur)}</td>
                  {kind === 'facture' && <td className="num mono">{fmtMoney(d.paid, cur)}</td>}
                  <td onClick={(e) => e.stopPropagation()}>
                    <select className="select input-sm" style={{ width: 160, color: d.st.color, fontWeight: 600 }} value={d.status} onChange={(e) => store.patch('documents', d.id, { status: e.target.value })} aria-label="Statut">
                      {statuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </td>
                  <td className="right nowrap" onClick={(e) => e.stopPropagation()}>
                    <Menu
                      trigger={<button className="btn btn-ghost btn-icon btn-sm" aria-label="Plus d'options"><Icon name="more_vert" size={18} /></button>}
                      items={[
                        { icon: 'launch', label: 'Ouvrir', onClick: () => navigate(`/documents/${d.id}`) },
                        kind === 'devis' && { icon: 'receipt', label: 'Convertir en facture', onClick: () => { const inv = store.convertQuoteToInvoice(d.id); toast(`Facture ${inv.number} créée`); navigate(`/documents/${inv.id}`) } },
                        d.type === 'facture' && d.status !== 'payee' && { icon: 'payments', label: 'Marquer comme payée', onClick: () => setPay(d) },
                        d.type === 'facture' && { icon: 'undo', label: 'Créer une note de crédit', onClick: () => { const cn = store.createCreditNote(d.id); navigate(`/documents/${cn.id}`) } },
                        '-',
                        { icon: 'delete', label: 'Supprimer', danger: true, onClick: () => { if (confirm(`Supprimer ${d.number} ?`)) store.remove('documents', d.id) } },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pay && <PaymentModal doc={pay} onClose={() => setPay(null)} />}
    </div>
  )
}

export function PaymentModal({ doc, onClose }) {
  const store = useStore()
  const rest = round2(documentAmounts(doc).total - paidAmount(doc))
  const [amount, setAmount] = useState(rest)
  const [date, setDate] = useState(toDateInput(new Date()))
  const [method, setMethod] = useState('Virement')
  return (
    <Modal title={`Paiement — ${doc.number}`} size="sm" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn btn-primary" onClick={() => { store.addPayment(doc.id, amount, date, method); toast('Paiement enregistré'); onClose() }}>Enregistrer</button></>}>
      <div className="form-grid">
        <Field label="Montant (€)" hint={`Reste à payer : ${fmtMoney(rest)}`}><NumInput className="input input-num" value={amount} onChange={setAmount} /></Field>
        <Field label="Date"><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Moyen de paiement" className="full">
          <select className="select" value={method} onChange={(e) => setMethod(e.target.value)}>
            {[...new Set([...(useStore.getState().settings.paymentMethods || []), 'Virement', 'Carte bancaire', 'Chèque', 'Espèces', 'Prélèvement'])].map((m) => <option key={m}>{m}</option>)}
          </select>
        </Field>
      </div>
    </Modal>
  )
}

/** Fenêtre « Générer facture » pour un projet (ou génération directe si le compte l'a désactivée). */
function useInvoiceDialog(idx) {
  const navigate = useNavigate()
  const [projectId, setProjectId] = useState(null)
  const done = (doc) => {
    setProjectId(null)
    toast(`Facture ${doc.number} créée`)
    navigate(`/documents/${doc.id}`)
  }
  const subs = projectId ? idx.subsByProject[projectId] || [] : []
  return {
    open: (pid) => ((idx.subsByProject[pid] || []).length <= 1 && skipGenerateDialog() ? done(generateDirect(pid, 'facture')) : setProjectId(pid)),
    modal: projectId && <GenerateDocModal projectId={projectId} type="facture" subs={subs} onClose={() => setProjectId(null)} onDone={done} />,
  }
}

function ToInvoice({ rows, idx }) {
  const invoice = useInvoiceDialog(idx)
  const now = new Date()
  if (!rows.length) return <div className="card"><Empty icon="done_all" title="Tout est facturé" text="Les projets confirmés apparaissent ici tant qu'ils ne sont pas entièrement facturés." /></div>
  return (
    <div className="card">
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Projet</th><th>Client</th><th>Fin de la période</th><th className="num">Total TTC</th><th className="num">Déjà facturé</th><th className="num">Reste à facturer</th><th /></tr></thead>
          <tbody>
            {rows.map(({ p, total, invoiced, rest, t }) => {
              const overdue = t.planEnd && parse(t.planEnd) < now
              return (
                <tr key={p.id} style={overdue ? { background: 'var(--danger-50)' } : null}>
                  <td><Link to={`/projets/${p.id}?tab=finances`} className="strong">{p.number} {p.name}</Link></td>
                  <td>{contactName(idx.contact[p.clientId])}</td>
                  <td className={`nowrap ${overdue ? 'danger-text strong' : ''}`}>{fmtDate(t.planEnd)}</td>
                  <td className="num mono">{fmtMoney(total)}</td>
                  <td className="num mono">{fmtMoney(invoiced)}</td>
                  <td className="num mono strong">{fmtMoney(rest)}</td>
                  <td className="right">
                    <button className="btn btn-sm btn-primary" onClick={() => invoice.open(p.id)}>
                      <Icon name="monetization_on" size={17} /> Facturer
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="grid-footer">En rouge : la période du projet est terminée mais il n'a pas encore été entièrement facturé.</div>
      {invoice.modal}
    </div>
  )
}

function PurchaseOrders({ idx }) {
  const store = useStore()
  const navigate = useNavigate()
  const [edit, setEdit] = useState(null)
  const pos = [...idx.d.purchaseOrders].sort((a, b) => String(b.date).localeCompare(String(a.date)))
  return (
    <div className="card">
      <div className="grid-toolbar">
        <span className="muted small">Dépenses liées aux projets : sous-locations, sous-traitance, achats…</span>
        <span className="spacer" />
        <button className="btn btn-primary" onClick={() => setEdit({ supplierId: '', projectId: '', lines: [{ label: '', quantity: 1, price: 0 }], isNew: true })}><Icon name="add" /> Bon de commande</button>
      </div>
      {pos.length === 0 ? (
        <Empty icon="shopping_cart" title="Aucun bon de commande" />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Numéro</th><th>Fournisseur</th><th>Projet</th><th>Date</th><th>Lignes</th><th>Statut</th><th className="num">Total HT</th><th /></tr></thead>
            <tbody>
              {pos.map((p) => (
                <tr key={p.id} className="clickable" onClick={() => navigate(`/bons-de-commande/${p.id}`)} title="Ouvrir le bon de commande (PDF)">
                  <td className="mono strong">{p.number}</td>
                  <td>{contactName(idx.contact[p.supplierId])}</td>
                  <td>{p.projectId ? <Link to={`/projets/${p.projectId}?tab=commandes`} onClick={(e) => e.stopPropagation()}>{idx.project[p.projectId]?.name}</Link> : '—'}</td>
                  <td>{fmtDate(p.date)}</td>
                  <td className="small">{(p.lines || []).map((l) => l.label).join(', ')}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <select className="select input-sm" style={{ width: 140 }} value={p.status} onChange={(e) => store.patch('purchaseOrders', p.id, { status: e.target.value })} aria-label="Statut">
                      {PO_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </td>
                  <td className="num mono">{fmtMoney(p.total)}</td>
                  <td className="right nowrap" onClick={(e) => e.stopPropagation()}>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => navigate(`/bons-de-commande/${p.id}`)} title="PDF du bon de commande" aria-label="PDF du bon de commande"><Icon name="picture_as_pdf" size={17} /></button>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setEdit(p)} title="Modifier" aria-label="Modifier"><Icon name="edit" size={17} /></button>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { if (confirm(`Supprimer le bon de commande ${p.number} ?`)) store.remove('purchaseOrders', p.id) }} aria-label="Supprimer"><Icon name="delete" size={17} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && <PoModal po={edit} idx={idx} onClose={(created) => { setEdit(null); if (created?.id) navigate(`/bons-de-commande/${created.id}`) }} />}
    </div>
  )
}

export function PoModal({ po, idx, onClose }) {
  const store = useStore()
  const [f, setF] = useState(po)
  const setLine = (i, patch) => setF({ ...f, lines: f.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) })
  const total = round2(f.lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.price) || 0), 0))
  const save = () => {
    const lines = f.lines.filter((l) => l.label.trim())
    if (f.isNew) {
      const created = store.createPurchaseOrder({ supplierId: f.supplierId || null, projectId: f.projectId || null, lines })
      toast(`Bon de commande ${created.number} créé`)
      onClose(created)
      return
    }
    store.upsert('purchaseOrders', { ...f, lines, total })
    toast('Bon de commande enregistré')
    onClose()
  }
  return (
    <Modal title={f.isNew ? 'Nouveau bon de commande' : `Bon de commande ${po.number}`} size="lg" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn btn-primary" onClick={save}>Enregistrer</button></>}>
      <div className="form-grid">
        <Field label="Fournisseur">
          <select className="select" value={f.supplierId || ''} onChange={(e) => setF({ ...f, supplierId: e.target.value })}>
            <option value="">— Aucun —</option>
            {idx.d.contacts.filter((c) => c.type === 'fournisseur').map((c) => <option key={c.id} value={c.id}>{contactName(c)}</option>)}
          </select>
        </Field>
        <Field label="Projet">
          <select className="select" value={f.projectId || ''} onChange={(e) => setF({ ...f, projectId: e.target.value })}>
            <option value="">— Aucun —</option>
            {idx.d.projects.map((p) => <option key={p.id} value={p.id}>{p.number} {p.name}</option>)}
          </select>
        </Field>
      </div>
      <div className="table-wrap">
        <table className="table table-compact" style={{ marginTop: 14 }}>
          <thead><tr><th>Désignation</th><th className="num">Quantité</th><th className="num">Prix unitaire</th><th className="num">Total</th><th /></tr></thead>
          <tbody>
            {f.lines.map((l, i) => (
              <tr key={i}>
                <td><input className="input input-sm" style={{ maxWidth: 'none' }} value={l.label} onChange={(e) => setLine(i, { label: e.target.value })} aria-label="Désignation" /></td>
                <td className="num"><NumInput style={{ width: 70 }} value={l.quantity} onChange={(v) => setLine(i, { quantity: v })} /></td>
                <td className="num"><NumInput style={{ width: 90 }} value={l.price} onChange={(v) => setLine(i, { price: v })} /></td>
                <td className="num mono">{fmtMoney((Number(l.quantity) || 0) * (Number(l.price) || 0))}</td>
                <td className="right"><button className="btn btn-ghost btn-icon btn-sm" onClick={() => setF({ ...f, lines: f.lines.filter((_, j) => j !== i) })} aria-label="Retirer"><Icon name="delete" size={17} /></button></td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={3}>Total HT</td><td className="num">{fmtMoney(total)}</td><td /></tr></tfoot>
        </table>
      </div>
      <button className="btn-link" style={{ marginTop: 8 }} onClick={() => setF({ ...f, lines: [...f.lines, { label: '', quantity: 1, price: 0 }] })}><Icon name="add" size={17} /> Ajouter une ligne</button>
    </Modal>
  )
}

function NewInvoiceModal({ idx, onClose }) {
  const invoice = useInvoiceDialog(idx)
  const [projectId, setProjectId] = useState('')
  if (invoice.modal) return invoice.modal
  const next = () => {
    if (!projectId) return toast('Choisissez un projet', 'error')
    invoice.open(projectId)
  }
  return (
    <Modal title="Ajouter une facture" size="sm" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn btn-primary" onClick={next}>Suivant</button></>}>
      <Field label="Projet à facturer">
        <select className="select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">— Choisir —</option>
          {idx.d.projects.map((p) => <option key={p.id} value={p.id}>{p.number} {p.name}</option>)}
        </select>
      </Field>
      <p className="muted small" style={{ marginBottom: 0 }}>La facture reprend les données actuelles du projet. Vous choisirez ensuite le modèle, l’en-tête et le texte du document.</p>
    </Modal>
  )
}
