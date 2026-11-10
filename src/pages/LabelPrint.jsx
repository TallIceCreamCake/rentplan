import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useIdx } from '../store'
import { Empty, Icon, NumInput } from '../components/ui'
import { DocViewer, PagedDocument } from '../components/doc/DocRender'
import { useDocUser } from '../components/doc/useDocUser'
import { labelDoc } from '../lib/documents'
import { defaultLetterheadId, defaultTemplateId, letterheadById, letterheadsFor, templateById, templatesFor } from '../lib/templates'

const PREF = 'rentplan-etiquettes'
const readPref = () => {
  try {
    return JSON.parse(localStorage.getItem(PREF) || '{}')
  } catch {
    return {}
  }
}
const writePref = (p) => {
  try {
    localStorage.setItem(PREF, JSON.stringify(p))
  } catch {
    /* stockage indisponible : le choix vaut pour cette visite */
  }
}

/**
 * Impression d'étiquettes : une page par étiquette, au format de l'étiquette (imprimante Dymo, Brother QL, Zebra…).
 * ?sn=id1,id2 : numéros de série ; ?eq=id : équipement sans numéro de série.
 */
export default function LabelPrint() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const idx = useIdx()
  const user = useDocUser()
  const s = idx.settings
  const pref = useMemo(readPref, [])
  const [templateId, setTemplateId] = useState(() => (templatesFor(s, 'etiquette').some((t) => t.id === pref.templateId) ? pref.templateId : defaultTemplateId(s, 'etiquette')))
  const [letterheadId, setLetterheadId] = useState(() => (letterheadsFor(s, 'etiquette').some((l) => l.id === pref.letterheadId) ? pref.letterheadId : defaultLetterheadId(s, 'etiquette')))
  const [copies, setCopies] = useState(Math.max(1, Number(params.get('n')) || 1))
  // Nouvelle sélection (lien vers la page déjà ouverte) : le nombre d'exemplaires demandé est repris
  const asked = params.get('n')
  useEffect(() => setCopies(Math.max(1, Number(asked) || 1)), [asked])
  const [counts, setCounts] = useState({})
  const choose = (patch) => writePref({ templateId, letterheadId, ...patch })

  const serialIds = (params.get('sn') || '').split(',').filter(Boolean)
  const eqId = params.get('eq')
  const items = serialIds.length ? serialIds.map((id) => ({ serialId: id })).filter((x) => idx.d.serials.some((sn) => sn.id === x.serialId)) : eqId && idx.eq[eqId] ? [{ equipmentId: eqId }] : []
  const labels = items.flatMap((it) => Array.from({ length: copies }, (_, copy) => labelDoc({ ...it, copy }, idx)))
  const template = templateById(s, templateId) || templateById(s, defaultTemplateId(s, 'etiquette'))
  const letterhead = letterheadById(s, letterheadId) || letterheadsFor(s, 'etiquette')[0]
  const W = Number(letterhead.width) || 8.9
  const H = Number(letterhead.height) || 3.6
  const pages = labels.reduce((n, d) => n + (counts[d.id] || 1), 0)
  const onPages = useCallback((id) => (n) => setCounts((c) => (c[id] === n ? c : { ...c, [id]: n })), [])
  const overflow = labels.some((d) => (counts[d.id] || 1) > 1)
  const first = idx.eq[items[0]?.equipmentId] || idx.eq[idx.d.serials.find((x) => x.id === items[0]?.serialId)?.equipmentId]
  const fileName = `Étiquettes ${first?.name || ''}`.trim()

  const print = () => {
    const title = document.title
    document.title = fileName
    window.addEventListener('afterprint', () => (document.title = title), { once: true })
    window.print()
  }

  if (!items.length) {
    return (
      <div className="card" style={{ marginTop: 26 }}>
        <Empty icon="qr_code_2" title="Aucune étiquette à imprimer" text="Choisissez des numéros de série dans la fiche d’un équipement (onglet Numéros de série) ou dans Équipements › Numéros de série." action={<Link className="btn" to="/equipements/numeros-de-serie">Numéros de série</Link>} />
      </div>
    )
  }
  return (
    <>
      <style>{`@page { size: ${W}cm ${H}cm; margin: 0; }`}</style>
      <div className="no-print">
        <div className="page-header">
          <div>
            <div className="crumbs">
              <Link to="/equipements">Équipements</Link> <Icon name="chevron_right" size={15} />
              {first ? <Link to={`/equipements/${first.id}?tab=series`}>{first.name}</Link> : <span>Étiquettes</span>}
            </div>
            <h1>Étiquettes · {items.length} {serialIds.length ? `numéro${items.length > 1 ? 's' : ''} de série` : 'équipement'}</h1>
          </div>
          <div className="actions">
            <button className="btn" onClick={() => navigate(`/editeur/${template.id}`)}><Icon name="edit_document" size={18} /> Modifier le modèle</button>
            <button className="btn btn-primary" onClick={print}><Icon name="print" size={18} /> Imprimer / PDF</button>
          </div>
        </div>
        <div className="card card-body row wrap doc-toolbar">
          <label className="row small">
            Modèle
            <select className="select input-sm" style={{ width: 190 }} value={template.id} onChange={(e) => { setTemplateId(e.target.value); choose({ templateId: e.target.value }) }}>
              {templatesFor(s, 'etiquette').map((t) => <option key={t.id} value={t.id}>{t.name}{t.system ? '' : ' (personnalisé)'}</option>)}
            </select>
          </label>
          <label className="row small">
            Format
            <select className="select input-sm" style={{ width: 220 }} value={letterhead.id} onChange={(e) => { setLetterheadId(e.target.value); choose({ letterheadId: e.target.value }) }}>
              {letterheadsFor(s, 'etiquette').map((l) => <option key={l.id} value={l.id}>{l.name}{l.system ? '' : ` (${Math.round(l.width * 10)} × ${Math.round(l.height * 10)} mm)`}</option>)}
            </select>
          </label>
          <label className="row small">
            Exemplaires
            <span style={{ width: 70 }}><NumInput className="input input-sm input-num" value={copies} onChange={(v) => setCopies(Math.max(1, Math.min(50, Math.round(v) || 1)))} /></span>
          </label>
          <span className="spacer" />
          {overflow && <span className="small danger-text"><Icon name="warning" size={16} style={{ verticalAlign: -3 }} /> Le contenu dépasse l’étiquette : réduisez-le dans le modèle ou choisissez un format plus grand.</span>}
          <span className="small muted">{pages} étiquette{pages > 1 ? 's' : ''} · {Math.round(W * 10)} × {Math.round(H * 10)} mm</span>
        </div>
      </div>
      <div className="doc-view label-view">
        <div className="doc-view-pages">
          <DocViewer pages={pages} pageWidth={W} initialFit fitMax={2} actions={<button type="button" className="pdfv-btn primary" onClick={print}><Icon name="download" size={18} /> PDF</button>}>
            <div className="label-sheet">
              {labels.map((d) => (
                <PagedDocument key={`${d.id}-${template.id}-${letterhead.id}`} doc={d} template={template} letterhead={letterhead} idx={idx} user={user} showBackground={false} onPages={onPages(d.id)} />
              ))}
            </div>
          </DocViewer>
        </div>
        <aside className="doc-side no-print">
          <div className="card">
            <div className="card-header"><span className="section-title">Impression</span></div>
            <div className="card-body small stack" style={{ gap: 8 }}>
              <p style={{ margin: 0 }}>Chaque étiquette est une page au format choisi. Dans la fenêtre d’impression, choisissez votre imprimante d’étiquettes, le format de papier correspondant et une échelle de 100 %.</p>
              <p className="muted" style={{ margin: 0 }}>Le QR code contient le numéro de série : la douchette de l’entrepôt le lit directement dans l’onglet Préparation & retour des projets.</p>
              <Link className="btn-link" to="/configuration?s=entete"><Icon name="straighten" size={16} /> Formats personnalisés (En-tête documents)</Link>
            </div>
          </div>
        </aside>
      </div>
    </>
  )
}
