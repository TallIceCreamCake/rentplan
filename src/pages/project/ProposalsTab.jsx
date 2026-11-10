import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore, toast } from '../../store'
import { useAccess } from '../../lib/auth'
import { Badge, Empty, Icon, Menu } from '../../components/ui'
import GenerateDocModal, { afterGenerate } from '../../components/doc/GenerateDocModal'
import { DOC_TYPES, docStatusOf, FIN_CATEGORIES, statusOf } from '../../lib/model'
import { equipmentDiff, PROPOSAL_STATES, proposalSets, proposalSummary } from '../../lib/proposals'
import { fmtMoney, fmtNumber } from '../../lib/utils'

/**
 * Propositions A, B, C… d'un projet : comparatif côte à côte (totaux, contenu, pénuries, devis), écarts de matériel,
 * choix de la proposition retenue et devis présentant toutes les propositions.
 */
export default function ProposalsTab({ project, sub, idx, setQuery }) {
  const store = useStore()
  const navigate = useNavigate()
  const access = useAccess()
  const canEdit = access.can('projets', 'modification')
  const money = access.finances
  const cur = idx.settings.currency
  const sets = proposalSets(project.id, idx)
  const [gen, setGen] = useState(null)
  const [diffOnly, setDiffOnly] = useState(true)

  const create = (fromId, blank = false) => {
    const sid = store.createProposal(fromId, { blank })
    const created = useStore.getState().subprojects.find((x) => x.id === sid)
    toast(`Proposition ${created?.proposal?.label} créée${blank ? ' (vierge)' : ' (copie)'}`)
    setQuery({ sp: sid })
  }

  if (!sets.length) {
    return (
      <div className="card">
        <Empty
          icon="call_split"
          title="Plusieurs propositions pour un même client"
          text={`Proposez des formules différentes (A, B, C… sans limite) : chacune a son propre matériel, son équipe, ses coûts et ses remises. Le client choisit la sienne en signant le devis ; les autres sont écartées.`}
          action={canEdit && (
            <div className="row" style={{ gap: 8, justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={() => create(sub.id)}><Icon name="call_split" /> Créer les propositions A et B</button>
              <button className="btn" onClick={() => create(sub.id, true)}>B vierge</button>
            </div>
          )}
        />
        <p className="muted small" style={{ margin: '0 0 18px', textAlign: 'center' }}>« {sub.name} » devient la proposition A ; la proposition B en est une copie que vous pouvez modifier.</p>
      </div>
    )
  }

  return (
    <div className="stack">
      {sets.map(({ set, items, retained }) => {
        const sums = items.map((s) => ({ s, ...proposalSummary(s, idx) }))
        const open = items.filter((x) => x.proposal.state !== 'ecartee')
        const min = Math.min(...open.map((s) => sums.find((x) => x.s.id === s.id).totals.totalExVat))
        const diff = equipmentDiff(items, idx)
        const shownDiff = diffOnly ? diff.filter((r) => !r.same) : diff
        const gridStyle = { gridTemplateColumns: `200px repeat(${items.length}, minmax(190px, 1fr))` }
        const cell = (s, i) => `pp-cell ${s.id === sub.id ? 'current' : ''} ${s.proposal.state}`
        return (
          <div key={set} className="card">
            <div className="card-header">
              <Icon name="call_split" size={19} style={{ color: 'var(--muted)' }} />
              <span className="section-title">Propositions</span>
              <span className="muted small">
                {retained ? `Proposition ${retained.proposal.label} retenue` : `${items.length} propositions · le client choisit en signant le devis`}
              </span>
              <div className="actions">
                {canEdit && money && open.length > 1 && !retained && (
                  <button className="btn btn-sm btn-primary" onClick={() => setGen({ type: 'devis', subs: open })}><Icon name="description" size={17} /> Devis avec les {open.length} propositions</button>
                )}
                {canEdit && (
                  <Menu
                    width={280}
                    trigger={<button className="btn btn-sm"><Icon name="add" size={17} /> Proposition</button>}
                    items={[
                      { icon: 'content_copy', label: `Copie de ${sub.proposal?.set === set ? `la proposition ${sub.proposal.label}` : `la proposition ${items[0].proposal.label}`}`, onClick: () => create(sub.proposal?.set === set ? sub.id : items[0].id) },
                      { icon: 'note_add', label: 'Proposition vierge', onClick: () => create(items[0].id, true) },
                    ]}
                  />
                )}
                {canEdit && retained && (
                  <Menu
                    width={300}
                    trigger={<button className="btn btn-ghost btn-icon btn-sm" aria-label="Plus d'options"><Icon name="more_vert" size={18} /></button>}
                    items={[
                      { icon: 'undo', label: 'Rouvrir le choix', onClick: () => { store.reopenProposals(set); toast('Toutes les propositions sont de nouveau proposées') } },
                      { icon: 'cleaning_services', label: 'Supprimer les propositions écartées', danger: true, onClick: () => { if (confirm('Supprimer les propositions écartées et leur contenu ? La proposition retenue redevient un sous-projet ordinaire.')) { store.keepRetainedOnly(set); setQuery({ sp: retained.id }); toast('Propositions écartées supprimées') } } },
                    ]}
                  />
                )}
              </div>
            </div>

            <div className="pp-scroll">
              <div className="pp-grid" style={gridStyle}>
                {/* En-têtes : lettre, nom, état */}
                <div className="pp-label pp-head-label" />
                {items.map((s, i) => {
                  const st = PROPOSAL_STATES[s.proposal.state]
                  return (
                    <div key={s.id} className={`${cell(s, i)} pp-head`}>
                      <div className="row" style={{ gap: 8 }}>
                        <span className="pp-letter" style={{ background: st.color }}>{s.proposal.label}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {canEdit ? (
                            <input className="pp-name" value={s.name} onChange={(e) => store.patch('subprojects', s.id, { name: e.target.value })} aria-label={`Nom de la proposition ${s.proposal.label}`} />
                          ) : <strong>{s.name}</strong>}
                          <div className="small" style={{ color: st.color, fontWeight: 600 }}><Icon name={st.icon} size={13} style={{ verticalAlign: -2 }} /> {st.label}{s.proposal.state !== 'ecartee' && <span className="muted"> · {statusOf(s.status).label}</span>}</div>
                        </div>
                        {canEdit && (
                          <Menu
                            width={260}
                            trigger={<button className="btn btn-ghost btn-icon btn-sm" aria-label={`Options de la proposition ${s.proposal.label}`}><Icon name="more_vert" size={18} /></button>}
                            items={[
                              { icon: 'edit', label: 'Ouvrir (matériel, équipe…)', onClick: () => setQuery({ sp: s.id, tab: 'equipement' }) },
                              { icon: 'content_copy', label: 'Dupliquer en nouvelle proposition', onClick: () => create(s.id) },
                              money && { icon: 'description', label: 'Devis de cette proposition seule', onClick: () => setGen({ type: 'devis', subs: [s] }) },
                              '-',
                              s.proposal.state !== 'retenue' && { icon: 'check_circle', label: 'Retenir cette proposition', onClick: () => { store.chooseProposal(s.id); toast(`Proposition ${s.proposal.label} retenue · les autres sont écartées`) } },
                              s.proposal.state === 'retenue' && { icon: 'undo', label: 'Rouvrir le choix', onClick: () => store.reopenProposals(set) },
                              '-',
                              { icon: 'delete', label: 'Supprimer la proposition', danger: true, onClick: () => { if (confirm(`Supprimer la proposition ${s.proposal.label} « ${s.name} » et tout son contenu ?`)) { store.removeProposal(s.id); if (s.id === sub.id) setQuery({ sp: null }); toast(`Proposition ${s.proposal.label} supprimée`) } } },
                            ]}
                          />
                        )}
                      </div>
                    </div>
                  )
                })}

                {/* Montants */}
                {money && FIN_CATEGORIES.map((c) => (
                  sums.some((x) => x.totals.rows[c.id].total) ? (
                    <Row key={c.id} label={c.label} items={items} cell={cell} render={(s, i) => <span className="mono">{fmtMoney(sums[i].totals.rows[c.id].total, cur)}</span>} />
                  ) : null
                ))}
                {money && sums.some((x) => x.totals.discountTotal) && <Row label="Remise sur le total" items={items} cell={cell} render={(s, i) => <span className="mono">{sums[i].totals.discountTotal ? `− ${fmtMoney(sums[i].totals.discountTotal, cur)}` : '—'}</span>} />}
                {money && (
                  <Row
                    label="Total HT"
                    strong
                    items={items}
                    cell={cell}
                    render={(s, i) => (
                      <span className="pp-total">
                        <span className="mono">{fmtMoney(sums[i].totals.totalExVat, cur)}</span>
                        {s.proposal.state !== 'ecartee' && open.length > 1 && sums[i].totals.totalExVat > min && <span className="pp-delta">+{fmtMoney(sums[i].totals.totalExVat - min, cur)}</span>}
                        {s.proposal.state !== 'ecartee' && open.length > 1 && sums[i].totals.totalExVat === min && <span className="pp-best">la moins chère</span>}
                      </span>
                    )}
                  />
                )}
                {money && <Row label="Total TTC" items={items} cell={cell} render={(s, i) => <span className="mono">{fmtMoney(sums[i].totals.total, cur)}</span>} />}
                {money && <Row label="Marge" items={items} cell={cell} render={(s, i) => <span className="mono" style={{ color: sums[i].totals.profit < 0 ? 'var(--danger)' : undefined }}>{fmtMoney(sums[i].totals.profit, cur)}{sums[i].totals.totalExVat ? <span className="muted small"> ({Math.round((sums[i].totals.profit / sums[i].totals.totalExVat) * 100)} %)</span> : null}</span>} />}

                {/* Contenu */}
                <Row label="Matériel" items={items} cell={cell} render={(s, i) => <span>{sums[i].articles} article{sums[i].articles > 1 ? 's' : ''} · {sums[i].items} unités</span>} />
                <Row label="Équipe et transport" items={items} cell={cell} render={(s, i) => <span>{sums[i].functions} fonction{sums[i].functions > 1 ? 's' : ''}</span>} />
                <Row label="Poids" items={items} cell={cell} render={(s, i) => <span>{fmtNumber(sums[i].totals.weight)} kg</span>} />
                <Row
                  label="Disponibilité"
                  items={items}
                  cell={cell}
                  render={(s, i) => (sums[i].shortages.length ? <span className="danger-text"><Icon name="warning" size={15} style={{ verticalAlign: -3 }} /> {sums[i].shortages.length} pénurie{sums[i].shortages.length > 1 ? 's' : ''}</span> : s.proposal.state === 'ecartee' ? <span className="muted">—</span> : <span className="success-text"><Icon name="check" size={15} style={{ verticalAlign: -3 }} /> Tout est disponible</span>)}
                />
                {money && (
                  <Row
                    label="Devis"
                    items={items}
                    cell={cell}
                    render={(s, i) => (sums[i].quotes.length ? (
                      <span className="pp-docs">
                        {sums[i].quotes.map((d) => (
                          <button key={d.id} type="button" className="btn-link small" onClick={() => navigate(`/documents/${d.id}`)}>
                            {DOC_TYPES[d.type].label} {d.number} <Badge color={docStatusOf(d).color}>{docStatusOf(d).label}</Badge>
                          </button>
                        ))}
                      </span>
                    ) : <span className="muted">Aucun</span>)}
                  />
                )}
                {/* Actions */}
                {canEdit && (
                  <>
                    <div className="pp-label" />
                    {items.map((s, i) => (
                      <div key={s.id} className={`${cell(s, i)} pp-actions`}>
                        <button className="btn btn-sm" onClick={() => setQuery({ sp: s.id, tab: 'equipement' })}><Icon name="edit" size={16} /> Ouvrir</button>
                        {s.proposal.state === 'ouverte' && <button className="btn btn-sm btn-primary" onClick={() => { store.chooseProposal(s.id); toast(`Proposition ${s.proposal.label} retenue · les autres sont écartées`) }}><Icon name="check_circle" size={16} /> Retenir</button>}
                        {s.proposal.state === 'ecartee' && <button className="btn btn-sm" onClick={() => { store.reopenProposals(set); toast('Le choix est rouvert') }}><Icon name="undo" size={16} /> Rouvrir</button>}
                        {s.proposal.state === 'retenue' && <span className="success-text small strong"><Icon name="verified" size={16} style={{ verticalAlign: -3 }} /> Retenue</span>}
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>

            {/* Écarts de matériel */}
            <div className="pp-diff-head">
              <strong>Matériel comparé</strong>
              <span className="muted small">{diff.filter((r) => !r.same).length} article{diff.filter((r) => !r.same).length > 1 ? 's' : ''} différent{diff.filter((r) => !r.same).length > 1 ? 's' : ''} sur {diff.length}</span>
              <span className="spacer" />
              <label className="check small"><input type="checkbox" checked={diffOnly} onChange={(e) => setDiffOnly(e.target.checked)} /> Seulement les différences</label>
            </div>
            {shownDiff.length === 0 ? (
              <div className="muted small" style={{ padding: '4px 18px 16px' }}>{diff.length ? 'Le matériel est identique dans toutes les propositions.' : 'Aucun matériel planifié.'}</div>
            ) : (
              <div className="table-wrap">
                <table className="table table-compact pp-diff">
                  <thead><tr><th>Équipement</th>{items.map((s) => <th key={s.id} className="num">{s.proposal.label}</th>)}</tr></thead>
                  <tbody>
                    {shownDiff.map((r) => {
                      const max = Math.max(...r.qty)
                      return (
                        <tr key={r.eq?.id} className={r.same ? '' : 'diff'}>
                          <td>{r.eq?.name}</td>
                          {r.qty.map((q, i) => <td key={i} className={`num mono ${q === 0 ? 'muted' : q === max && !r.same ? 'strong' : ''}`}>{q || '—'}</td>)}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}

      {gen && (
        <GenerateDocModal
          projectId={project.id}
          type={gen.type}
          subs={gen.subs}
          initialTemplateId={gen.subs.length > 1 ? `sys_propositions_${gen.type}` : null}
          onClose={() => setGen(null)}
          onDone={(doc) => {
            afterGenerate(doc)
            setGen(null)
            toast(`${DOC_TYPES[doc.type].label} ${doc.number} généré${(doc.content?.proposals || []).length > 1 ? ` avec ${doc.content.proposals.length} propositions` : ''}`)
            navigate(`/documents/${doc.id}`)
          }}
        />
      )}
    </div>
  )
}

function Row({ label, items, cell, render, strong = false }) {
  return (
    <>
      <div className={`pp-label ${strong ? 'strong' : ''}`}>{label}</div>
      {items.map((s, i) => <div key={s.id} className={`${cell(s, i)} ${strong ? 'strong' : ''}`}>{render(s, i)}</div>)}
    </>
  )
}
