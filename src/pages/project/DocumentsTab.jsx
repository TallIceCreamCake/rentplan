import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStore, toast } from '../../store'
import { useAccess } from '../../lib/auth'
import { Badge, Empty, Icon, Menu, Modal } from '../../components/ui'
import GenerateDocModal, { afterGenerate, generateDirect, skipGenerateDialog } from '../../components/doc/GenerateDocModal'
import { DOC_GROUPS, DOC_TYPES, docStatusOf, isFinancialDoc } from '../../lib/model'
import { defaultTemplateId, docLayout, templatesFor } from '../../lib/templates'
import { documentAmounts } from '../../lib/documents'
import { fmtDate, fmtMoney } from '../../lib/utils'

/** Onglet Documents d'un projet : tous ses documents et la génération à partir des modèles. */
export default function DocumentsTab({ project, subs, idx }) {
  const access = useAccess()
  const navigate = useNavigate()
  const settings = idx.settings
  const canEdit = access.can('projets', 'modification') || access.can('finances', 'modification')
  const [filter, setFilter] = useState('tous')
  const [picker, setPicker] = useState(false)
  const [gen, setGen] = useState(null)
  const [layoutDoc, setLayoutDoc] = useState(null)
  const types = Object.keys(DOC_TYPES).filter((t) => (access.finances || !DOC_TYPES[t].finance) && t !== 'avoir' && !DOC_TYPES[t].standalone)
  const docs = (idx.docsByProject[project.id] || [])
    .filter((d) => access.finances || !isFinancialDoc(d))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt)))
  const groups = DOC_GROUPS.filter((g) => types.some((t) => DOC_TYPES[t].group === g.id))
  const shown = filter === 'tous' ? docs : docs.filter((d) => DOC_TYPES[d.type]?.group === filter)

  const done = (doc) => {
    afterGenerate(doc)
    setGen(null)
    toast(`${DOC_TYPES[doc.type].label} ${doc.number} généré${doc.type === 'facture' || doc.type === 'feuille_route' ? 'e' : ''}`)
    navigate(`/documents/${doc.id}`)
  }
  const start = (type, templateId = null) => {
    setPicker(false)
    if (skipGenerateDialog() && subs.length <= 1) return done(generateDirect(project.id, type, templateId ? { templateId } : {}))
    setGen({ type, templateId })
  }
  const templateItems = (type) => {
    const def = defaultTemplateId(settings, type)
    return templatesFor(settings, type).map((t) => ({ icon: t.id === def ? 'star' : t.system ? 'lock' : 'edit_document', label: `${t.name}${t.system ? '' : ' (personnalisé)'}`, onClick: () => start(type, t.id) }))
  }

  return (
    <div className="stack">
      {canEdit && (
        <div className="card">
          <div className="card-header">
            <span className="section-title">Générer un document</span>
            <span className="muted small">à partir des modèles de Configuration › Modèles de documents</span>
            <div className="actions">
              <button className="btn btn-sm btn-primary" onClick={() => setPicker(true)}><Icon name="add" size={18} /> Choisir un modèle</button>
            </div>
          </div>
          <div className="card-body pdoc-quick">
            {types.map((t) => {
              const n = templatesFor(settings, t).length
              return (
                <div key={t} className="pdoc-tile">
                  <button type="button" className="pdoc-tile-main" onClick={() => start(t)} title={`Générer : ${DOC_TYPES[t].label} (modèle par défaut)`}>
                    <span className={`pdoc-ic g-${DOC_TYPES[t].group}`}><Icon name={DOC_TYPES[t].icon} size={20} /></span>
                    <span className="pdoc-tile-txt">
                      <strong>{DOC_TYPES[t].label}</strong>
                      <span>{n} modèle{n > 1 ? 's' : ''}</span>
                    </span>
                  </button>
                  <Menu
                    width={260}
                    trigger={<button type="button" className="pdoc-tile-more" aria-label={`Modèles : ${DOC_TYPES[t].label}`}><Icon name="expand_more" size={18} /></button>}
                    items={[...templateItems(t), '-', { icon: 'settings', label: 'Gérer les modèles', onClick: () => navigate('/configuration?s=modeles-documents') }]}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="card">
        <div className="grid-toolbar">
          <div className="chips">
            <button className={`chip ${filter === 'tous' ? 'on' : ''}`} onClick={() => setFilter('tous')}>Tous <span className="n">{docs.length}</span></button>
            {groups.map((g) => {
              const n = docs.filter((d) => DOC_TYPES[d.type]?.group === g.id).length
              return <button key={g.id} className={`chip ${filter === g.id ? 'on' : ''}`} onClick={() => setFilter(g.id)}>{g.label} <span className="n">{n}</span></button>
            })}
          </div>
        </div>
        {shown.length === 0 ? (
          <Empty icon="folder_open" title="Aucun document" text={docs.length ? 'Aucun document dans cette catégorie.' : 'Générez un devis, une facture, un bon de préparation ou tout autre document à partir de vos modèles.'} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Document</th><th>Numéro</th><th>Modèle</th><th>En-tête</th><th>Date</th><th>Statut</th>{access.finances && <th className="num">Total TTC</th>}<th />
                </tr>
              </thead>
              <tbody>
                {shown.map((d) => {
                  const st = docStatusOf(d)
                  const { template, letterhead } = docLayout(d, settings)
                  const fin = isFinancialDoc(d)
                  return (
                    <tr key={d.id} className="clickable" onClick={() => navigate(`/documents/${d.id}`)}>
                      <td>
                        <span className="pdoc-type">
                          <span className={`pdoc-ic sm g-${DOC_TYPES[d.type]?.group}`}><Icon name={DOC_TYPES[d.type]?.icon || 'article'} size={17} /></span>
                          {DOC_TYPES[d.type]?.label || d.type}
                        </span>
                      </td>
                      <td className="mono nowrap">
                        {d.number}{d.version > 1 ? ` · v${d.version}` : ''}
                        {d.signature && <Icon name="task_alt" size={16} title={`Signé par ${d.signature.name}`} style={{ color: 'var(--success)', marginLeft: 6, verticalAlign: -3 }} />}
                      </td>
                      <td className="muted">{template?.name}{template && !template.system ? ' (personnalisé)' : ''}</td>
                      <td className="muted">{letterhead?.name}</td>
                      <td className="nowrap">{fmtDate(d.date)}</td>
                      <td><Badge color={st.color}>{st.label}</Badge></td>
                      {access.finances && <td className="num mono">{fin ? fmtMoney(documentAmounts(d).total, settings.currency) : ''}</td>}
                      <td className="right" onClick={(e) => e.stopPropagation()}>
                        <Menu
                          trigger={<button className="btn btn-ghost btn-icon btn-sm" aria-label="Plus d'options"><Icon name="more_vert" size={18} /></button>}
                          items={[
                            { icon: 'launch', label: 'Ouvrir', onClick: () => navigate(`/documents/${d.id}`) },
                            canEdit && { icon: 'dashboard_customize', label: 'Mise en page…', onClick: () => setLayoutDoc(d) },
                            canEdit && { icon: 'refresh', label: 'Regénérer (nouvelle version)', onClick: () => { useStore.getState().regenerateDocument(d.id); toast('Nouvelle version générée') } },
                            canEdit && (d.type === 'devis' || d.type === 'contrat') && { icon: 'receipt', label: 'Convertir en facture', onClick: () => { const inv = useStore.getState().convertQuoteToInvoice(d.id); navigate(`/documents/${inv.id}`) } },
                            canEdit && d.type === 'facture' && { icon: 'undo', label: 'Créer une note de crédit', onClick: () => { const cn = useStore.getState().createCreditNote(d.id); navigate(`/documents/${cn.id}`) } },
                            canEdit && '-',
                            canEdit && { icon: 'delete', label: 'Supprimer', danger: true, onClick: () => { if (confirm(`Supprimer ${d.number} ?`)) useStore.getState().remove('documents', d.id) } },
                          ]}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {!access.finances && <p className="muted small" style={{ margin: 0 }}>Les devis et factures n’apparaissent qu’aux rôles ayant la visibilité des finances.</p>}

      {picker && <TemplatePicker types={types} settings={settings} onClose={() => setPicker(false)} onPick={start} />}
      {gen && <GenerateDocModal projectId={project.id} type={gen.type} subs={subs} initialTemplateId={gen.templateId} onClose={() => setGen(null)} onDone={done} />}
      {layoutDoc && <GenerateDocModal doc={layoutDoc} type={layoutDoc.type} onClose={() => setLayoutDoc(null)} onDone={() => setLayoutDoc(null)} />}
    </div>
  )
}

/** « Choisir un modèle » : tous les modèles visibles, classés par type de document. */
function TemplatePicker({ types, settings, onClose, onPick }) {
  return (
    <Modal title="Générer un document" size="lg" onClose={onClose} footer={<><Link className="btn" to="/configuration?s=modeles-documents"><Icon name="settings" size={17} /> Gérer les modèles</Link><span className="spacer" /><button className="btn" onClick={onClose}>Annuler</button></>}>
      <div className="pdoc-picker">
        {DOC_GROUPS.map((g) => {
          const list = types.filter((t) => DOC_TYPES[t].group === g.id)
          if (!list.length) return null
          return (
            <section key={g.id}>
              <div className="pdoc-picker-group">{g.label}</div>
              <div className="pdoc-picker-grid">
                {list.map((t) => {
                  const def = defaultTemplateId(settings, t)
                  return (
                    <div key={t} className="pdoc-picker-type">
                      <div className="pdoc-picker-head"><span className={`pdoc-ic sm g-${g.id}`}><Icon name={DOC_TYPES[t].icon} size={17} /></span>{DOC_TYPES[t].label}</div>
                      {templatesFor(settings, t).map((tpl) => (
                        <button key={tpl.id} type="button" className="pdoc-picker-item" onClick={() => onPick(t, tpl.id)}>
                          <Icon name={tpl.system ? 'lock' : 'edit_document'} size={16} style={{ color: 'var(--muted)' }} />
                          <span className="pdoc-picker-name">{tpl.name}</span>
                          {tpl.id === def && <span className="pdoc-def" title="Modèle par défaut"><Icon name="star" size={14} /> Par défaut</span>}
                          {!tpl.system && <span className="tag">Personnalisé</span>}
                        </button>
                      ))}
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </Modal>
  )
}
