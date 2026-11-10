import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useIdx, useRecent, useStore, toast } from '../store'
import CustomFields from '../components/CustomFields'
import { Badge, Empty, Field, Icon, Menu, Modal, NumInput, Section, SortTh, Tabs, TagInput, sortBy } from '../components/ui'
import NewProjectModal from '../components/NewProjectModal'
import NotFound from './NotFound'
import { useTrackRecent } from '../components/useTrackRecent'
import { DOC_TYPES, docStatusOf, projectStatus, projectTimes, projectTotals, statusOf, isFinancialDoc } from '../lib/model'
import { documentAmounts } from '../lib/documents'
import { contactName, fmtDate, fmtMoney, fmtRange, matches, personName, uid } from '../lib/utils'

const TYPES = [
  { id: 'client', label: 'Clients', single: 'Client', icon: 'business' },
  { id: 'lieu', label: 'Lieux de prestation', single: 'Lieu de prestation', icon: 'place' },
  { id: 'fournisseur', label: 'Fournisseurs', single: 'Fournisseur', icon: 'store' },
]

export default function Contacts() {
  const { id } = useParams()
  return id ? <ContactDetail id={id} /> : <ContactList />
}

function ContactList() {
  const idx = useIdx()
  const navigate = useNavigate()
  const [type, setType] = useState('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState({ key: 'displayName', dir: 'asc' })
  const [creating, setCreating] = useState(false)
  const rows = sortBy(
    idx.d.contacts
      .filter((c) => (type === 'all' || c.type === type) && matches(q, contactName(c), c.firstName, c.lastName, c.email, c.city, (c.tags || []).join(' ')))
      .map((c) => ({ ...c, displayName: contactName(c), persons: idx.personsByContact[c.id] || [], projects: idx.d.projects.filter((p) => p.clientId === c.id || p.venueId === c.id).length })),
    sort,
  )
  return (
    <>
      <div className="page-header">
        <h1>Contacts <span className="help-dot" title="Clients, lieux de prestation et fournisseurs"><Icon name="help_outline" size={20} /></span></h1>
        <div className="actions"><button className="btn btn-primary" onClick={() => setCreating(true)}><Icon name="add" /> Contact</button></div>
      </div>
      <div className="split">
        <div className="card filter-panel">
          <div className="panel-title">Dossiers</div>
          <div className="tree">
            <button className={type === 'all' ? 'on' : ''} onClick={() => setType('all')}><Icon name="contact_phone" size={18} /> Tous les contacts <span className="n">{idx.d.contacts.length}</span></button>
            {TYPES.map((t) => (
              <button key={t.id} className={type === t.id ? 'on' : ''} onClick={() => setType(t.id)}><Icon name={t.icon} size={18} /> {t.label} <span className="n">{idx.d.contacts.filter((c) => c.type === t.id).length}</span></button>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="grid-toolbar">
            <div className="search underline" style={{ width: 300 }}>
              <Icon name="search" size={19} className="icon" />
              <input className="input" placeholder="Nom, e-mail, ville, étiquette…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <span className="spacer" />
            <span className="muted small">{rows.length} contact(s)</span>
          </div>
          {rows.length === 0 ? <Empty icon="contact_phone" title="Aucun contact" /> : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <SortTh label="Nom" k="displayName" sort={sort} setSort={setSort} />
                    <th>Type</th>
                    <th>Personne de contact</th>
                    <SortTh label="Ville" k="city" sort={sort} setSort={setSort} />
                    <th>Téléphone</th>
                    <th>E-mail</th>
                    <SortTh label="Projets" k="projects" sort={sort} setSort={setSort} className="num" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id} className="clickable" onClick={() => navigate(`/contacts/${c.id}`)}>
                      <td><span className="row"><Icon name={c.isCompany ? 'business' : 'person'} size={18} style={{ color: 'var(--muted)' }} /><span className="strong">{c.displayName}</span>{(c.tags || []).map((t) => <span key={t} className="tag">{t}</span>)}</span></td>
                      <td>{TYPES.find((t) => t.id === c.type)?.single}</td>
                      <td>{c.persons[0] ? personName(c.persons[0]) : c.isCompany ? '—' : personName(c)}</td>
                      <td>{c.city || '—'}</td>
                      <td className="nowrap">{c.phone || '—'}</td>
                      <td>{c.email || '—'}</td>
                      <td className="num">{c.projects}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {creating && <NewContactModal defaultType={type === 'all' ? 'client' : type} onClose={() => setCreating(false)} onCreated={(cid) => navigate(`/contacts/${cid}`)} />}
    </>
  )
}

function NewContactModal({ defaultType, onClose, onCreated }) {
  const store = useStore()
  const [f, setF] = useState({ type: defaultType, isCompany: true, company: '', firstName: '', lastName: '', email: '', phone: '', city: '' })
  const create = () => {
    if (f.isCompany ? !f.company.trim() : !(f.firstName.trim() || f.lastName.trim())) return toast('Le nom est obligatoire', 'error')
    const id = uid('c_')
    store.upsert('contacts', { id, ...f, company: f.isCompany ? f.company : null, website: '', address: '', zip: '', country: 'France', vatNumber: '', discountEquipment: 0, discountCrew: 0, paymentTermDays: null, notes: '', tags: [], createdAt: new Date().toISOString() })
    toast('Contact créé')
    onClose()
    onCreated(id)
  }
  return (
    <Modal title="Nouveau contact" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn btn-primary" onClick={create}>Créer</button></>}>
      <div className="form-grid">
        <Field label="Type">
          <select className="select" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{TYPES.map((t) => <option key={t.id} value={t.id}>{t.single}</option>)}</select>
        </Field>
        <Field label="Il s'agit">
          <div className="btn-group">
            <button type="button" className={`btn btn-sm ${f.isCompany ? 'on' : ''}`} onClick={() => setF({ ...f, isCompany: true })}>d'une entreprise</button>
            <button type="button" className={`btn btn-sm ${!f.isCompany ? 'on' : ''}`} onClick={() => setF({ ...f, isCompany: false })}>d'un particulier</button>
          </div>
        </Field>
        {f.isCompany && <Field label="Nom de l'entreprise *" className="full"><input className="input" autoFocus value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></Field>}
        <Field label={f.isCompany ? 'Prénom du contact' : 'Prénom *'}><input className="input" value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} /></Field>
        <Field label={f.isCompany ? 'Nom du contact' : 'Nom *'}><input className="input" value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} /></Field>
        <Field label="E-mail"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Téléphone"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Ville"><input className="input" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field>
      </div>
    </Modal>
  )
}

function ContactDetail({ id }) {
  const idx = useIdx()
  const store = useStore()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [newProject, setNewProject] = useState(false)
  const c = idx.contact[id]
  useTrackRecent('contact', id, !!c)
  if (!c) return <NotFound what="Ce contact" />
  const tab = params.get('tab') || 'general'
  const persons = idx.personsByContact[id] || []
  const projects = idx.d.projects.filter((p) => p.clientId === id || p.venueId === id).sort((a, b) => String(projectTimes(b.id, idx).planStart).localeCompare(String(projectTimes(a.id, idx).planStart)))
  const docs = idx.d.documents.filter((d) => d.clientId === id && isFinancialDoc(d)).sort((a, b) => String(b.date).localeCompare(String(a.date)))
  const set = (k) => (e) => store.patch('contacts', id, { [k]: e.target.value })
  const revenue = projects.filter((p) => p.clientId === id).reduce((s, p) => s + projectTotals(p.id, idx).totalExVat, 0)

  return (
    <>
      <div className="record-header">
        <div className="title-row">
          <h1>{contactName(c)}</h1>
          <span className="status-text muted">{TYPES.find((t) => t.id === c.type)?.single}</span>
          <div className="actions">
            {c.type === 'client' && <button className="btn btn-outline" onClick={() => setNewProject(true)}><Icon name="add" size={18} /> Projet</button>}
            <button className="btn" onClick={() => { useRecent.getState().close(`contact:${id}`); navigate('/contacts') }}>Fermer</button>
            <Menu
              trigger={<button className="btn btn-icon" aria-label="Plus d'options"><Icon name="more_vert" /></button>}
              items={[{ icon: 'delete', label: 'Supprimer', danger: true, onClick: () => { if (projects.length && !confirm(`Ce contact est lié à ${projects.length} projet(s). Supprimer quand même ?`)) return; if (!projects.length && !confirm('Supprimer ce contact ?')) return; store.remove('contacts', id); store.removeWhere('contactPersons', (p) => p.contactId === id); navigate('/contacts') } }]}
            />
          </div>
        </div>
        <Tabs
          value={tab}
          onChange={(t) => setParams({ tab: t }, { replace: true })}
          tabs={[
            { id: 'general', label: 'Général' },
            { id: 'personnes', label: 'Personnes de contact', count: persons.length },
            c.type === 'client' && { id: 'remises', label: 'Remises' },
            { id: 'projets', label: 'Projets', count: projects.length },
            c.type === 'client' && { id: 'factures', label: 'Factures', count: docs.length },
          ].filter(Boolean)}
        />
      </div>

      {tab === 'general' && (
        <div className="grid grid-side" style={{ gridTemplateColumns: 'minmax(0,1fr) 340px' }}>
          <Section title="Coordonnées">
            <div className="form-grid">
              <Field label="Type">
                <select className="select" value={c.type} onChange={set('type')}>{TYPES.map((t) => <option key={t.id} value={t.id}>{t.single}</option>)}</select>
              </Field>
              <Field label="Entreprise ou particulier">
                <select className="select" value={c.isCompany ? 'e' : 'p'} onChange={(e) => store.patch('contacts', id, { isCompany: e.target.value === 'e' })}><option value="e">Entreprise</option><option value="p">Particulier</option></select>
              </Field>
              {c.isCompany && <Field label="Nom de l'entreprise" className="full"><input className="input" value={c.company || ''} onChange={set('company')} /></Field>}
              <Field label="Prénom"><input className="input" value={c.firstName || ''} onChange={set('firstName')} /></Field>
              <Field label="Nom"><input className="input" value={c.lastName || ''} onChange={set('lastName')} /></Field>
              <Field label="E-mail"><input className="input" type="email" value={c.email || ''} onChange={set('email')} /></Field>
              <Field label="Téléphone"><input className="input" value={c.phone || ''} onChange={set('phone')} /></Field>
              <Field label="Site web"><input className="input" value={c.website || ''} onChange={set('website')} /></Field>
              <Field label="N° TVA intracommunautaire"><input className="input" value={c.vatNumber || ''} onChange={set('vatNumber')} /></Field>
              <Field label="Adresse" className="full"><input className="input" value={c.address || ''} onChange={set('address')} /></Field>
              <Field label="Code postal"><input className="input" value={c.zip || ''} onChange={set('zip')} /></Field>
              <Field label="Ville"><input className="input" value={c.city || ''} onChange={set('city')} /></Field>
              <Field label="Pays"><input className="input" value={c.country || ''} onChange={set('country')} /></Field>
              <Field label="Délai de paiement (jours)" hint="Vide = délai par défaut"><input className="input" type="number" min={0} value={c.paymentTermDays ?? ''} onChange={(e) => store.patch('contacts', id, { paymentTermDays: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
              <Field label="Notes" className="full"><textarea className="textarea" value={c.notes || ''} onChange={set('notes')} /></Field>
            </div>
          </Section>
          <div className="stack">
            <Section title="Résumé" icon="insights">
              <div className="stat-row"><span>Projets</span><strong>{projects.length}</strong></div>
              {c.type === 'client' && <div className="stat-row"><span>Chiffre d'affaires HT</span><strong className="mono">{fmtMoney(revenue)}</strong></div>}
              {c.type === 'client' && <div className="stat-row"><span>Factures impayées</span><strong className="mono">{fmtMoney(docs.filter((d) => d.type === 'facture' && ['envoye', 'partiel'].includes(d.status)).reduce((s, d) => s + documentAmounts(d).total, 0))}</strong></div>}
            </Section>
            <CustomFields entity="contact" values={c.customFields} onChange={(customFields) => store.patch('contacts', id, { customFields })} />
            <Section title="Étiquettes" icon="label"><TagInput value={c.tags || []} onChange={(tags) => store.patch('contacts', id, { tags })} /></Section>
            {c.address && (
              <Section title="Carte" icon="map">
                <a className="btn-link" href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(`${c.address} ${c.zip} ${c.city}`)}`} target="_blank" rel="noreferrer"><Icon name="place" size={17} /> {c.address}, {c.zip} {c.city}</a>
              </Section>
            )}
          </div>
        </div>
      )}

      {tab === 'personnes' && (
        <div className="card">
          <div className="grid-toolbar">
            <span className="spacer" />
            <button className="btn btn-primary" onClick={() => store.upsert('contactPersons', { id: uid('cp_'), contactId: id, firstName: '', lastName: '', email: '', phone: '', role: '' })}><Icon name="add" /> Personne de contact</button>
          </div>
          {persons.length === 0 ? <Empty icon="person" title="Aucune personne de contact" /> : (
            <div className="table-wrap">
              <table className="table table-compact">
                <thead><tr><th>Prénom</th><th>Nom</th><th>Fonction</th><th>E-mail</th><th>Téléphone</th><th /></tr></thead>
                <tbody>
                  {persons.map((p) => (
                    <tr key={p.id}>
                      {['firstName', 'lastName', 'role', 'email', 'phone'].map((k) => (
                        <td key={k}><input className="input input-sm" style={{ maxWidth: 'none' }} value={p[k] || ''} onChange={(e) => store.patch('contactPersons', p.id, { [k]: e.target.value })} aria-label={k} /></td>
                      ))}
                      <td className="right"><button className="btn btn-ghost btn-icon btn-sm" onClick={() => store.remove('contactPersons', p.id)} aria-label="Supprimer"><Icon name="delete" size={17} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'remises' && (
        <Section title="Remises client">
          <p className="muted small" style={{ marginTop: 0 }}>Appliquées automatiquement aux nouveaux projets de ce client (onglet Finances du projet).</p>
          <div className="form-grid" style={{ maxWidth: 520 }}>
            <Field label="Remise sur la location de matériel (%)"><NumInput className="input input-num" value={c.discountEquipment} max={100} onChange={(v) => store.patch('contacts', id, { discountEquipment: v })} /></Field>
            <Field label="Remise sur le personnel (%)"><NumInput className="input input-num" value={c.discountCrew} max={100} onChange={(v) => store.patch('contacts', id, { discountCrew: v })} /></Field>
          </div>
        </Section>
      )}

      {tab === 'projets' && (
        <div className="card">
          {projects.length === 0 ? <Empty icon="table_chart" title="Aucun projet" /> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Numéro</th><th>Projet</th><th>Rôle</th><th>Période</th><th>Statut</th><th className="num">Total HT</th></tr></thead>
                <tbody>
                  {projects.map((p) => {
                    const t = projectTimes(p.id, idx)
                    const st = statusOf(projectStatus(p.id, idx).id)
                    return (
                      <tr key={p.id} className="clickable" onClick={() => navigate(`/projets/${p.id}`)}>
                        <td className="mono">{p.number}</td>
                        <td className="strong">{p.name}</td>
                        <td>{p.clientId === id ? 'Client' : 'Lieu'}</td>
                        <td className="nowrap">{fmtRange(t.planStart, t.planEnd)}</td>
                        <td><Badge color={st.color}>{st.label}</Badge></td>
                        <td className="num mono">{fmtMoney(projectTotals(p.id, idx).totalExVat)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'factures' && (
        <div className="card">
          {docs.length === 0 ? <Empty icon="receipt" title="Aucun document" /> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Numéro</th><th>Type</th><th>Projet</th><th>Date</th><th className="num">Total TTC</th><th>Statut</th></tr></thead>
                <tbody>
                  {docs.map((d) => {
                    const st = docStatusOf(d)
                    return (
                      <tr key={d.id} className="clickable" onClick={() => navigate(`/documents/${d.id}`)}>
                        <td className="mono strong">{d.number}</td>
                        <td>{DOC_TYPES[d.type].label}</td>
                        <td>{d.projectId ? <Link to={`/projets/${d.projectId}`} onClick={(e) => e.stopPropagation()}>{idx.project[d.projectId]?.name}</Link> : '—'}</td>
                        <td>{fmtDate(d.date)}</td>
                        <td className="num mono">{fmtMoney(documentAmounts(d).total)}</td>
                        <td><Badge color={st.color}>{st.label}</Badge></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {newProject && <NewProjectModal defaults={{ clientId: id }} onClose={() => setNewProject(false)} />}
    </>
  )
}
