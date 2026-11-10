import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore, toast } from '../../store'
import { Badge, Icon, Menu, NumInput } from '../../components/ui'
import GenerateDocModal, { generateDirect, skipGenerateDialog } from '../../components/doc/GenerateDocModal'
import { DOC_TYPES, docStatusOf, FIN_CATEGORIES, isFinancialDoc, statusOf, subTotals } from '../../lib/model'
import { documentAmounts } from '../../lib/documents'
import { fmtDate, fmtMoney, round2 } from '../../lib/utils'

export default function FinanceTab({ project, sub, subs, idx }) {
  const store = useStore()
  const navigate = useNavigate()
  const cur = idx.settings.currency
  const [showMargin, setShowMargin] = useState(false)
  const [quoteKind, setQuoteKind] = useState('devis')
  const [gen, setGen] = useState(null)
  const t = subTotals(sub.id, idx)
  const docs = (idx.docsByProject[project.id] || []).filter(isFinancialDoc).sort((a, b) => String(b.date).localeCompare(String(a.date)))
  const setDiscount = (cat, v) => store.patch('subprojects', sub.id, { discounts: { ...(sub.discounts || {}), [cat]: v } })
  const multi = subs.length > 1

  const done = (doc) => {
    const type = doc.type
    if (type === 'devis' || type === 'contrat') {
      // Comme dans Rentman : la création d'un devis fait passer le projet en Option
      for (const id of doc.subprojectIds || []) if (['concept', 'demande'].includes(idx.sub[id]?.status)) store.setSubStatus(id, 'option')
    }
    setGen(null)
    toast(`${DOC_TYPES[type].label} ${doc.number} créé${type === 'facture' ? 'e' : ''}`)
    navigate(`/documents/${doc.id}`)
  }
  // Fenêtre « Générer » (modèle, en-tête, texte), sauf si le compte a choisi de l'ignorer
  const ask = (type) => (skipGenerateDialog() && !multi ? done(generateDirect(project.id, type)) : setGen(type))
  const fmtProfit = (profit, revenue) => (showMargin ? (revenue ? `${round2((profit / revenue) * 100)} %` : '—') : fmtMoney(profit, cur))

  return (
    <div className="grid grid-side" style={{ gridTemplateColumns: 'minmax(0,1fr) 380px' }}>
      <div className="stack">
        {multi && (
          <div className="card">
            <div className="card-header"><span className="section-title">Projet principal — sous-projets</span></div>
            <div className="table-wrap">
              <table className="table table-compact">
                <thead><tr><th>Sous-projet</th><th>Statut</th><th className="num">Total HT</th><th className="num">Coûts</th><th className="num">Bénéfice</th></tr></thead>
                <tbody>
                  {subs.map((s) => {
                    const st = subTotals(s.id, idx)
                    return (
                      <tr key={s.id} className={s.id === sub.id ? 'selected' : ''} style={s.status === 'annule' ? { textDecoration: 'line-through', color: 'var(--muted)' } : null}>
                        <td className="strong">{s.name}</td>
                        <td><Badge color={statusOf(s.status).color}>{statusOf(s.status).label}</Badge></td>
                        <td className="num mono">{fmtMoney(st.totalExVat, cur)}</td>
                        <td className="num mono">{fmtMoney(st.costTotal, cur)}</td>
                        <td className="num mono">{fmtMoney(st.profit, cur)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-header">
            <span className="section-title">Aperçu financier{multi ? ` — ${sub.name}` : ''}</span>
            <div className="actions"><span className="small muted">Facteur dégressif selon la période d'utilisation</span></div>
          </div>
          <div className="table-wrap">
            <table className="table fin-table">
              <thead>
                <tr>
                  <th>Catégorie</th>
                  <th className="num">Coûts estimés</th>
                  <th className="num">Coûts prévus</th>
                  <th className="num">Coûts réels</th>
                  <th className="num">Chiffre d'affaires</th>
                  <th className="num">Remise</th>
                  <th className="num sortable" onClick={() => setShowMargin(!showMargin)} title="Basculer entre bénéfice et marge">{showMargin ? 'Marge' : 'Bénéfice'} <Icon name="swap_vert" size={15} /></th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {FIN_CATEGORIES.map((c) => {
                  const r = t.rows[c.id]
                  return (
                    <tr key={c.id}>
                      <td className="strong">{c.label}</td>
                      <td className="num muted">{fmtMoney(r.estimated, cur)}</td>
                      <td className="num muted">{fmtMoney(r.planned, cur)}</td>
                      <td className="num muted">{fmtMoney(r.actual, cur)}</td>
                      <td className="num">{fmtMoney(r.revenue, cur)}</td>
                      <td className="num">
                        <span className="input-group" style={{ justifyContent: 'flex-end' }}>
                          <NumInput style={{ width: 64 }} value={r.discount} max={100} onChange={(v) => setDiscount(c.id, v)} disabled={t.locked} />
                          <span className="addon">%</span>
                        </span>
                      </td>
                      <td className={`num ${r.profit < 0 ? 'danger-text' : ''}`}>{r.revenue || r.planned ? fmtProfit(r.profit, r.total) : '—'}</td>
                      <td className="num strong">{fmtMoney(r.total, cur)}</td>
                    </tr>
                  )
                })}
                <tr>
                  <td className="strong">Assurance</td>
                  <td colSpan={4} className="muted small">Pourcentage du prix brut de la location</td>
                  <td className="num">
                    <span className="input-group" style={{ justifyContent: 'flex-end' }}>
                      <NumInput style={{ width: 64 }} value={sub.insurancePct || 0} max={100} onChange={(v) => store.patch('subprojects', sub.id, { insurancePct: v })} />
                      <span className="addon">%</span>
                    </span>
                  </td>
                  <td />
                  <td className="num strong">{fmtMoney(t.insurance, cur)}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td>Total HT</td>
                  <td className="num">{fmtMoney(FIN_CATEGORIES.reduce((s, c) => s + t.rows[c.id].estimated, 0), cur)}</td>
                  <td className="num">{fmtMoney(t.costTotal, cur)}</td>
                  <td className="num">{fmtMoney(FIN_CATEGORIES.reduce((s, c) => s + t.rows[c.id].actual, 0), cur)}</td>
                  <td className="num">{fmtMoney(FIN_CATEGORIES.reduce((s, c) => s + t.rows[c.id].revenue, 0) + t.insurance, cur)}</td>
                  <td />
                  <td className="num">{fmtProfit(t.subtotal - t.costTotal, t.subtotal)}</td>
                  <td className="num">{fmtMoney(t.subtotal, cur)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="fin-summary-wrap">
            <div className="fin-summary">
              <div className="fin-line">
                <div>
                  <div className="strong">Remise</div>
                  <div className="small muted">Bénéfice {fmtMoney(t.profit, cur)}</div>
                </div>
                <span className="input-group">
                  <NumInput style={{ width: 80 }} value={sub.discountTotal || 0} max={100} onChange={(v) => store.patch('subprojects', sub.id, { discountTotal: v })} disabled={t.locked} />
                  <span className="addon">%</span>
                </span>
              </div>
              <div className="fin-line big">
                <span>Total HT</span>
                <span className="row" style={{ gap: 6 }}>
                  {t.locked ? (
                    <NumInput className="input input-num" style={{ width: 130 }} value={sub.lockedTotal} onChange={(v) => store.patch('subprojects', sub.id, { lockedTotal: v })} />
                  ) : (
                    <strong className="mono">{fmtMoney(t.totalExVat, cur)}</strong>
                  )}
                  <button
                    className={`btn btn-ghost btn-icon btn-sm ${t.locked ? 'locked' : ''}`}
                    title={t.locked ? 'Déverrouiller le prix' : 'Verrouiller le prix : les modifications du projet ne changeront plus le total'}
                    onClick={() => store.patch('subprojects', sub.id, { lockedTotal: t.locked ? null : t.computed })}
                    aria-label="Verrouiller le prix"
                  >
                    <Icon name={t.locked ? 'lock' : 'lock_open'} size={19} />
                  </button>
                </span>
              </div>
              {t.locked && Math.abs(t.computed - t.totalExVat) > 0.01 && <div className="small warning-text">Prix calculé actuel : {fmtMoney(t.computed, cur)}</div>}
              <div className="fin-line"><span>TVA ({t.vatRate} %)</span><span className="mono">{fmtMoney(t.vat, cur)}</span></div>
              <div className="fin-line big"><span>Total TTC</span><strong className="mono">{fmtMoney(t.total, cur)}</strong></div>
            </div>
          </div>
        </div>

        <div className="grid grid-2">
          <div className="card card-body">
            <div className="section-title" style={{ marginBottom: 10 }}>Caution</div>
            <div className="row">
              <NumInput className="input input-num" style={{ width: 130 }} value={sub.deposit || 0} onChange={(v) => store.patch('subprojects', sub.id, { deposit: v })} />
              {Number(sub.deposit) > 0 && (
                <select className="select" value={sub.depositStatus} onChange={(e) => store.patch('subprojects', sub.id, { depositStatus: e.target.value })} aria-label="Statut de la caution">
                  <option value="aucune">Aucune caution versée</option>
                  <option value="versee">Caution versée</option>
                  <option value="reversee">Caution reversée</option>
                </select>
              )}
            </div>
          </div>
          <div className="card card-body">
            <div className="section-title" style={{ marginBottom: 10 }}>Conditions supplémentaires</div>
            <textarea className="textarea" rows={3} value={sub.additionalConditions || ''} onChange={(e) => store.patch('subprojects', sub.id, { additionalConditions: e.target.value })} placeholder="Affichées au-dessus des conditions générales sur les documents" />
          </div>
        </div>
      </div>

      <div className="stack">
        <div className="card">
          <div className="card-header">
            <div className="btn-group">
              {['devis', 'contrat'].map((k) => (
                <button key={k} className={`btn btn-sm ${quoteKind === k ? 'on' : ''}`} onClick={() => setQuoteKind(k)}>{DOC_TYPES[k].label}</button>
              ))}
            </div>
            <div className="actions"><button className="btn btn-sm btn-primary" onClick={() => ask(quoteKind)}><Icon name="add" size={18} /> Ajouter {quoteKind === 'devis' ? 'un devis' : 'un contrat'}</button></div>
          </div>
          <DocList docs={docs.filter((d) => d.type === quoteKind)} navigate={navigate} store={store} cur={cur} />
        </div>
        <div className="card">
          <div className="card-header">
            <span className="section-title">Factures</span>
            <div className="actions"><button className="btn btn-sm btn-primary" onClick={() => ask('facture')}><Icon name="add" size={18} /> Ajouter une facture</button></div>
          </div>
          <DocList docs={docs.filter((d) => d.type === 'facture' || d.type === 'avoir')} navigate={navigate} store={store} cur={cur} />
        </div>
      </div>

      {gen && <GenerateDocModal projectId={project.id} type={gen} subs={subs} onClose={() => setGen(null)} onDone={done} />}
    </div>
  )
}

function DocList({ docs, navigate, store, cur }) {
  if (!docs.length) return <div className="empty" style={{ padding: 20 }}>Aucun document.</div>
  return (
    <div className="list">
      {docs.map((d) => {
        const st = docStatusOf(d)
        return (
          <div key={d.id} className="list-item clickable" onClick={() => navigate(`/documents/${d.id}`)}>
            <Icon name={d.type === 'facture' ? 'receipt' : d.type === 'avoir' ? 'undo' : 'description'} size={21} style={{ color: 'var(--muted)' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="title">{d.number}{d.version > 1 ? ` · v${d.version}` : ''}{d.partialPct ? ` · ${d.partialPct} %` : ''}</div>
              <div className="meta">{fmtDate(d.date)} · {fmtMoney(documentAmounts(d).total, cur)} TTC</div>
            </div>
            <Badge color={st.color}>{st.label}</Badge>
            <span onClick={(e) => e.stopPropagation()}>
              <Menu
                trigger={<button className="btn btn-ghost btn-icon btn-sm" aria-label="Plus d'options"><Icon name="more_vert" size={18} /></button>}
                items={[
                  { icon: 'launch', label: 'Ouvrir', onClick: () => navigate(`/documents/${d.id}`) },
                  { icon: 'refresh', label: 'Regénérer (nouvelle version)', onClick: () => { store.regenerateDocument(d.id); toast('Nouvelle version générée') } },
                  (d.type === 'devis' || d.type === 'contrat') && { icon: 'receipt', label: 'Convertir en facture', onClick: () => { const inv = store.convertQuoteToInvoice(d.id); navigate(`/documents/${inv.id}`) } },
                  d.type === 'facture' && { icon: 'undo', label: 'Créer une note de crédit', onClick: () => { const cn = store.createCreditNote(d.id); navigate(`/documents/${cn.id}`) } },
                  '-',
                  { icon: 'delete', label: 'Supprimer', danger: true, onClick: () => { if (confirm(`Supprimer ${d.number} ?`)) store.remove('documents', d.id) } },
                ]}
              />
            </span>
          </div>
        )
      })}
    </div>
  )
}
