import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStore, toast } from '../../store'
import { currentUserName, useAccess } from '../../lib/auth'
import ProjectPeriodCard from './ProjectPeriodCard'
import GenerateDocModal, { afterGenerate } from '../../components/doc/GenerateDocModal'
import CustomFields from '../../components/CustomFields'
import { ColorPicker, Field, Icon, Menu, Modal, PROGRESS_INFO, Section, TagInput, progressColor } from '../../components/ui'
import { DB_ENABLED, fileUrl, uploadFile } from '../../lib/db'
import { DOC_TYPES, PROJECT_STATUSES, projectProgress, projectTotals, statusOf } from '../../lib/model'
import { contactName, fmtDateTime, fmtMoney, fmtNumber, personName, uid } from '../../lib/utils'

const PROGRESS_TEXT = {
  equipment: { ok: 'Tout le matériel de location est réservé', warn: 'Le matériel sera réservé à la confirmation', bad: 'Il y a une pénurie de matériel', none: 'Aucun équipement planifié' },
  crew: { ok: 'Toutes les fonctions sont entièrement planifiées', warn: 'Des fonctions restent à planifier', bad: 'Le projet est confirmé mais toutes les fonctions ne sont pas planifiées', none: 'Aucune fonction dans ce projet' },
  quote: { ok: 'Le projet a été confirmé', warn: 'Un devis est en attente de confirmation', none: 'Aucun devis pour ce projet' },
  invoice: { ok: 'Toutes les factures sont payées', warn: 'Il reste à facturer ou des factures sont impayées', bad: 'Une facture est en retard', none: 'Aucune facture pour ce projet' },
  task: { ok: 'Toutes les tâches sont terminées', warn: 'Des tâches restent à faire', none: 'Il n’y a aucune tâche dans ce projet' },
}
const PROGRESS_TAB = { equipment: 'equipement', crew: 'personnel', quote: 'finances', invoice: 'finances', task: 'taches' }

export default function GeneralTab({ project, sub, subs, idx, setQuery }) {
  const { patch, setSubStatus, contacts, contactPersons, projectTypes, stockLocations, crew, settings } = useStore()
  const set = (k) => (e) => patch('projects', project.id, { [k]: e.target.value || null })
  const client = idx.contact[project.clientId]
  const venue = idx.contact[project.venueId]
  const progress = projectProgress(project.id, idx)
  const totals = projectTotals(project.id, idx)
  const periods = idx.periodsByProject[project.id] || []
  const managers = [...new Set([currentUserName(), ...crew.map(personName)])]
  const access = useAccess()
  const navigate = useNavigate()
  const canEdit = access.can('projets', 'modification')
  const [applyTpl, setApplyTpl] = useState(false)
  const [gen, setGen] = useState(null)
  const docTypes = Object.keys(DOC_TYPES).filter((t) => t !== 'avoir' && !DOC_TYPES[t].standalone && (access.finances || !DOC_TYPES[t].finance))

  return (
    <div className="grid grid-side" style={{ gridTemplateColumns: 'minmax(0,1fr) 400px' }}>
      <div className="stack">
        <Section
          title="Projet"
          action={canEdit && (
            <div className="row project-actions" style={{ gap: 12 }}>
              <button className="btn-link" onClick={() => setApplyTpl(true)} title="Appliquer un modèle de projet"><Icon name="note_add" size={18} /> <span className="wide-only">Appliquer un modèle de projet</span><span className="narrow-only">Modèle</span></button>
              <div className="split-btn">
                <button className="btn btn-sm btn-primary" onClick={() => setQuery({ tab: 'documents' })} title="Créer un document de projet"><Icon name="print" size={17} /> <span className="wide-only">Créer un document de projet</span><span className="narrow-only">Document</span></button>
                <Menu
                  width={240}
                  trigger={<button className="btn btn-sm btn-primary split-more" aria-label="Choisir le type de document"><Icon name="arrow_drop_down" size={20} /></button>}
                  items={docTypes.map((t) => ({ icon: DOC_TYPES[t].icon, label: DOC_TYPES[t].label, onClick: () => setGen(t) }))}
                />
              </div>
            </div>
          )}
        >
          <div className="form-grid">
            <Field label="Nom" className="full">
              <input className="input" value={project.name} onChange={(e) => patch('projects', project.id, { name: e.target.value })} />
            </Field>
            <Field label="Type de projet">
              <select className="select" value={project.typeId || ''} onChange={set('typeId')}>
                <option value="">— Aucun —</option>
                {projectTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            <Field label={subs.length > 1 ? `Statut (${sub.name})` : 'Statut'}>
              <select className="select" value={sub.status} onChange={(e) => setSubStatus(sub.id, e.target.value)} style={{ color: statusOf(sub.status).color, fontWeight: 600 }}>
                {PROJECT_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </Field>
            <Field label="Numéro">
              <input className="input" value={project.number || ''} onChange={(e) => patch('projects', project.id, { number: e.target.value })} />
            </Field>
            <Field label="Gestionnaire de compte">
              <select className="select" value={project.accountManager || ''} onChange={set('accountManager')}>
                <option value="">— Aucun —</option>
                {managers.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Référence externe" hint="Ex. numéro de bon de commande du client">
              <input className="input" value={project.externalRef || ''} onChange={set('externalRef')} />
            </Field>
            <Field label="Emplacement de stock">
              <select className="select" value={project.stockLocationId || ''} onChange={set('stockLocationId')}>
                {stockLocations.filter((l) => !l.archived || l.id === project.stockLocationId).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </Field>
            <Field label="Couleur" hint="Utilisée dans l'agenda et l'aperçu des projets (sinon : couleur du type)">
              <ColorPicker value={project.color} onChange={(color) => patch('projects', project.id, { color })} />
            </Field>
          </div>
        </Section>

        <div className="grid grid-2">
          <Section title="Client" action={<Link className="btn-link" to="/contacts">Contacts</Link>}>
            <div className="stack" style={{ gap: 10 }}>
              <select className="select" value={project.clientId || ''} onChange={(e) => patch('projects', project.id, { clientId: e.target.value || null, contactPersonId: null })} aria-label="Client">
                <option value="">— Aucun client —</option>
                {contacts.filter((c) => c.type === 'client').map((c) => <option key={c.id} value={c.id}>{contactName(c)}</option>)}
              </select>
              <select className="select" value={project.contactPersonId || ''} onChange={set('contactPersonId')} aria-label="Personne de contact" disabled={!client}>
                <option value="">— Personne de contact —</option>
                {contactPersons.filter((p) => p.contactId === project.clientId).map((p) => <option key={p.id} value={p.id}>{personName(p)}{p.role ? ` · ${p.role}` : ''}</option>)}
              </select>
              {client && (
                <div className="address-block">
                  <div className="strong">{contactName(client)}</div>
                  <div>{client.address}</div>
                  <div>{client.zip} {client.city}</div>
                  {client.email && <div className="muted">{client.email} · {client.phone}</div>}
                  {client.discountEquipment > 0 && <div className="tag" style={{ marginTop: 6 }}>Remise client matériel {client.discountEquipment} %</div>}
                </div>
              )}
            </div>
          </Section>
          <Section title="Lieu de la prestation">
            <div className="stack" style={{ gap: 10 }}>
              <select className="select" value={project.venueId || ''} onChange={set('venueId')} aria-label="Lieu">
                <option value="">— Aucun lieu —</option>
                {contacts.filter((c) => c.type === 'lieu').map((c) => <option key={c.id} value={c.id}>{contactName(c)}</option>)}
              </select>
              {venue && (
                <div className="address-block">
                  <div className="strong">{contactName(venue)}</div>
                  <div>{venue.address}</div>
                  <div>{venue.zip} {venue.city}</div>
                  {venue.notes && <div className="alert alert-info" style={{ marginTop: 8 }}>{venue.notes}</div>}
                  <a className="btn-link" href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(`${venue.address} ${venue.zip} ${venue.city}`)}`} target="_blank" rel="noreferrer">
                    <Icon name="map" size={17} /> Voir sur la carte
                  </a>
                </div>
              )}
            </div>
          </Section>
        </div>

        <CustomFields entity="projet" values={project.customFields} onChange={(customFields) => patch('projects', project.id, { customFields })} />

        <Section title="Planning" action={<button className="btn-link" onClick={() => setQuery({ tab: 'planning' })}><Icon name="edit" size={17} /> Modifier</button>} bodyClass="card-body tight">
          <div className="table-wrap">
            <table className="table table-compact">
              <thead><tr><th>Nom</th><th>Début</th><th>Fin</th><th>Sous-projet</th></tr></thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p.id}>
                    <td className="strong">
                      {p.name}
                      {p.isPlanning && <span className="tag" style={{ marginLeft: 6 }}>planification</span>}
                      {p.isUsage && <span className="tag" style={{ marginLeft: 6 }}>utilisation</span>}
                    </td>
                    <td className="nowrap">{fmtDateTime(p.startsAt)}</td>
                    <td className="nowrap">{fmtDateTime(p.endsAt)}</td>
                    <td className="muted">{p.subprojectId ? idx.sub[p.subprojectId]?.name : 'Projet principal'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Notes internes">
          <textarea className="textarea" rows={4} value={project.notes || ''} onChange={(e) => patch('projects', project.id, { notes: e.target.value })} placeholder="Accès, horaires, informations techniques…" />
        </Section>
      </div>

      <div className="stack">
        <ProjectPeriodCard project={project} idx={idx} canEdit={canEdit} />
        <Section title="Avancée du projet" bodyClass="card-body tight">
          <div className="list">
            {PROGRESS_INFO.map(([k, icon, label]) => (
              <div key={k} className="list-item clickable progress-row" onClick={() => setQuery({ tab: PROGRESS_TAB[k] })}>
                <span className="progress-dot" style={{ background: `${progressColor(progress[k])}22`, color: progressColor(progress[k]) }}>
                  <Icon name={icon} size={22} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="title">{label}</div>
                  <div className="meta">{PROGRESS_TEXT[k][progress[k]] || PROGRESS_TEXT[k].warn}</div>
                </div>
                <Icon name="chevron_right" style={{ color: 'var(--primary)' }} />
              </div>
            ))}
          </div>
        </Section>

        <Section title="Détails du projet" icon="info">
          <div className="grid grid-2" style={{ gap: 12 }}>
            <div><div className="kpi-label">Poids total</div><strong>{fmtNumber(totals.weight, 1)} kg</strong></div>
            <div><div className="kpi-label">Volume total</div><strong>{fmtNumber(totals.volume, 2)} m³</strong></div>
            <div><div className="kpi-label">Puissance totale</div><strong>{fmtNumber(totals.power)} W</strong></div>
            <div><div className="kpi-label">Total HT</div><strong>{fmtMoney(totals.totalExVat, settings.currency)}</strong></div>
          </div>
          <div className="divider" />
          <div className="kpi-label" style={{ marginBottom: 6 }}>Étiquettes</div>
          <TagInput value={project.tags || []} onChange={(tags) => patch('projects', project.id, { tags })} />
        </Section>

        <NotesFiles project={project} idx={idx} setQuery={setQuery} />
      </div>
      {applyTpl && <ApplyTemplateModal project={project} sub={sub} subs={subs} onClose={() => setApplyTpl(false)} />}
      {gen && (
        <GenerateDocModal
          projectId={project.id}
          type={gen}
          subs={subs}
          onClose={() => setGen(null)}
          onDone={(doc) => {
            afterGenerate(doc)
            setGen(null)
            toast(`${DOC_TYPES[doc.type].label} ${doc.number} généré`)
            navigate(`/documents/${doc.id}`)
          }}
        />
      )}
    </div>
  )
}

/** « Appliquer un modèle de projet » : ajoute le matériel, les fonctions et les coûts d'un modèle au sous-projet. */
function ApplyTemplateModal({ project, sub, subs, onClose }) {
  const { settings, applyProjectTemplate, addEquipmentGroup, equipmentGroups, patch, equipment } = useStore()
  const templates = settings.projectTemplates || []
  const [id, setId] = useState(templates[0]?.id || '')
  const [target, setTarget] = useState(sub.id)
  const tpl = templates.find((t) => t.id === id)
  const apply = () => {
    if (!tpl) return
    if (tpl.items.length && !equipmentGroups.some((g) => g.subprojectId === target)) addEquipmentGroup(project.id, target, 'Matériel')
    applyProjectTemplate(project.id, target, tpl)
    // Les informations vides du projet sont complétées par le modèle
    const fill = {}
    if (!project.typeId && tpl.typeId) fill.typeId = tpl.typeId
    if (!project.venueId && tpl.venueId) fill.venueId = tpl.venueId
    if (!project.color && tpl.color) fill.color = tpl.color
    if (Object.keys(fill).length) patch('projects', project.id, fill)
    toast(`Modèle « ${tpl.name} » appliqué`)
    onClose()
  }
  return (
    <Modal title="Appliquer un modèle de projet" size="sm" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn btn-primary" onClick={apply} disabled={!tpl}>Appliquer</button></>}>
      {templates.length ? (
        <div className="stack" style={{ gap: 14 }}>
          <div className="stack" style={{ gap: 4 }}>
            {templates.map((t) => (
              <label key={t.id} className="npt-option">
                <input type="radio" checked={id === t.id} onChange={() => setId(t.id)} />
                <span>{t.name} <span className="muted small">· {t.items.length} équipement(s), {t.functions.length} fonction(s){(t.costs || []).length ? `, ${t.costs.length} coût(s)` : ''}</span></span>
              </label>
            ))}
          </div>
          {subs.length > 1 && (
            <Field label="Sous-projet">
              <select className="select" value={target} onChange={(e) => setTarget(e.target.value)}>
                {subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          )}
          {tpl && <p className="muted small" style={{ margin: 0 }}>Ajouté au projet : {tpl.items.map((it) => `${it.quantity} × ${equipment.find((e) => e.id === it.equipmentId)?.name || 'article'}`).join(', ') || 'aucun matériel'}.</p>}
        </div>
      ) : (
        <p className="muted" style={{ margin: 0 }}>Aucun modèle de projet. <Link to="/configuration?s=modeles-projets" onClick={onClose}>Créez-en un dans la configuration</Link>.</p>
      )}
    </Modal>
  )
}

function NotesFiles({ project, idx, setQuery }) {
  const { upsert, remove, settings } = useStore()
  const [tab, setTab] = useState('notes')
  const [text, setText] = useState('')
  const [scope, setScope] = useState('interne')
  const [uploading, setUploading] = useState(false)
  const notes = idx.d.notes.filter((n) => n.projectId === project.id).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  const files = idx.d.files.filter((f) => f.projectId === project.id)
  const tasks = idx.tasksByProject[project.id] || []
  const scopes = { interne: 'Interne', externe: 'Externe', entrepot: 'Entrepôt' }

  const onUpload = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const { path } = await uploadFile(file, `projets/${project.id}`)
      upsert('files', { id: uid('f_'), projectId: project.id, equipmentId: null, name: file.name, path, size: file.size, mime: file.type, author: currentUserName(), createdAt: new Date().toISOString() })
      toast('Fichier ajouté')
    } catch (err) {
      toast(`Envoi impossible : ${err.message}`, 'error')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="card">
      <div className="card-header" style={{ gap: 0, padding: '0 8px' }}>
        {[
          ['taches', `Tâches (${tasks.length})`],
          ['notes', `Notes (${notes.length})`],
          ['fichiers', `Fichiers (${files.length})`],
        ].map(([k, l]) => (
          <button key={k} className={`mini-tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      <div className="card-body">
        {tab === 'taches' && (
          <div className="stack" style={{ gap: 6 }}>
            {tasks.length === 0 && <span className="muted">Aucune tâche.</span>}
            {tasks.map((t) => (
              <div key={t.id} className="row">
                <Icon name={t.status === 'termine' ? 'check_box' : 'check_box_outline_blank'} size={19} style={{ color: t.status === 'termine' ? 'var(--success)' : 'var(--muted)' }} />
                <span style={{ textDecoration: t.status === 'termine' ? 'line-through' : 'none' }}>{t.title}</span>
              </div>
            ))}
            <button className="btn-link" onClick={() => setQuery({ tab: 'taches' })}><Icon name="add" size={17} /> Gérer les tâches</button>
          </div>
        )}
        {tab === 'notes' && (
          <div className="stack" style={{ gap: 10 }}>
            <form
              className="stack"
              style={{ gap: 6 }}
              onSubmit={(e) => {
                e.preventDefault()
                if (!text.trim()) return
                upsert('notes', { id: uid('nt_'), projectId: project.id, subprojectId: null, scope, text: text.trim(), author: currentUserName(), createdAt: new Date().toISOString() })
                setText('')
              }}
            >
              <textarea className="textarea" style={{ minHeight: 60 }} placeholder="Ajouter une note…" value={text} onChange={(e) => setText(e.target.value)} />
              <div className="row">
                <select className="select input-sm" style={{ width: 140 }} value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Visibilité">
                  {Object.entries(scopes).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <span className="spacer" />
                <button className="btn btn-sm btn-primary" type="submit">Ajouter</button>
              </div>
            </form>
            {notes.map((n) => (
              <div key={n.id} className="note">
                <div className="who row">
                  <span>{n.author} · {fmtDateTime(n.createdAt?.slice(0, 16))}</span>
                  <span className="tag">{scopes[n.scope] || n.scope}</span>
                  <span className="spacer" />
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => remove('notes', n.id)} aria-label="Supprimer la note"><Icon name="delete" size={16} /></button>
                </div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{n.text}</div>
              </div>
            ))}
          </div>
        )}
        {tab === 'fichiers' && (
          <div className="stack" style={{ gap: 8 }}>
            {DB_ENABLED ? (
              <label className="btn btn-sm" style={{ alignSelf: 'flex-start' }}>
                <Icon name={uploading ? 'sync' : 'cloud_upload'} size={18} className={uploading ? 'spin' : ''} /> {uploading ? 'Envoi…' : 'Ajouter un fichier'}
                <input type="file" hidden onChange={onUpload} disabled={uploading} />
              </label>
            ) : (
              <span className="muted small">Les fichiers nécessitent la base Supabase.</span>
            )}
            {files.length === 0 && <span className="muted">Aucun fichier.</span>}
            {files.map((f) => (
              <div key={f.id} className="row file-row">
                <Icon name={f.mime?.startsWith('image/') ? 'image' : f.mime === 'application/pdf' ? 'picture_as_pdf' : 'insert_drive_file'} size={20} style={{ color: 'var(--primary)' }} />
                <a href={fileUrl(f.path)} target="_blank" rel="noreferrer" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</a>
                <span className="muted small">{f.size ? `${fmtNumber(f.size / 1024)} Ko` : ''}</span>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => remove('files', f.id)} aria-label="Supprimer le fichier"><Icon name="delete" size={16} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
