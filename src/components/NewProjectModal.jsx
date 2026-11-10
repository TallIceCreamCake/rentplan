import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStore, toast } from '../store'
import { ColorPicker, Field, Icon, Modal } from './ui'
import { PROJECT_STATUSES } from '../lib/model'
import { BLANK_TRANSFER, DEFAULT_PROJECT_TEMPLATES, templatePeriods, transferPeriods } from '../lib/projectTemplates'
import { DateField, DateRangeField, dayDiff, readDate } from './DatePicker'
import { addDays, contactName, fmtDateTime, parse, personName, toDateInput, toLocalInput } from '../lib/utils'

const fmtLong = (s) => (s ? new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(parse(s)) : '—')

/**
 * Nouveau projet, comme dans Rentman : on choisit d'abord le type (standard ou transfert) et un modèle,
 * avec la date de début et l'aperçu du modèle, puis on saisit les informations du projet.
 */
export default function NewProjectModal({ onClose, defaults = {} }) {
  const { contacts, contactPersons, projectTypes, stockLocations, equipment, defaultFunctions, defaultCosts, createProject, applyProjectTemplate, settings } = useStore()
  const navigate = useNavigate()
  const templates = settings.projectTemplates || []
  const [step, setStep] = useState('template')
  const [kind, setKind] = useState('standard')
  const [tplId, setTplId] = useState('blank')
  const [start, setStart] = useState(defaults.useStart ? String(defaults.useStart).slice(0, 10) : toDateInput(new Date()))
  const [planOpen, setPlanOpen] = useState(true)
  const [f, setF] = useState(null)

  const userTpl = templates.find((t) => t.id === tplId)
  const tpl = kind === 'transfert' ? BLANK_TRANSFER : userTpl || DEFAULT_PROJECT_TEMPLATES.find((t) => t.id === tplId) || DEFAULT_PROJECT_TEMPLATES[0]
  const periods = useMemo(() => {
    if (kind === 'transfert') return transferPeriods(start)
    // Depuis l'agenda, le projet vierge reprend les horaires du jour cliqué
    if (tpl.id === 'blank' && defaults.useStart && String(defaults.useStart).slice(0, 10) === start) return { planStart: defaults.planStart, planEnd: defaults.planEnd, useStart: defaults.useStart, useEnd: defaults.useEnd }
    return templatePeriods(tpl, start, settings)
  }, [kind, tpl, start, settings, defaults])
  const regime = (settings.vatRegimes || []).find((r) => r.id === settings.vatRegimeId)
  const venues = contacts.filter((c) => c.type === 'lieu')
  const locations = stockLocations.filter((l) => !l.archived)

  const select = () => {
    if (!start) return toast('Choisissez une date de début', 'error')
    const from = locations.find((l) => l.isDefault) || locations[0]
    setF({
      name: '',
      typeId: userTpl?.typeId || (kind === 'transfert' ? '' : projectTypes[0]?.id || ''),
      clientId: defaults.clientId || '',
      contactPersonId: '',
      venueId: userTpl?.venueId || '',
      status: userTpl?.status || (kind === 'transfert' ? 'confirme' : 'concept'),
      color: userTpl?.color || null,
      externalRef: '',
      stockLocationId: from?.id || '',
      transferToId: locations.find((l) => l.id !== from?.id)?.id || '',
      ...periods,
    })
    setStep('details')
  }

  const create = (e) => {
    e?.preventDefault()
    if (parse(f.planEnd) < parse(f.planStart) || parse(f.useEnd) < parse(f.useStart)) return toast('Une période se termine avant de commencer', 'error')
    if (kind === 'transfert') {
      if (!f.stockLocationId || !f.transferToId) return toast('Choisissez les emplacements de départ et d’arrivée', 'error')
      if (f.stockLocationId === f.transferToId) return toast('Les emplacements de départ et d’arrivée doivent être différents', 'error')
      const a = locations.find((l) => l.id === f.stockLocationId)?.name
      const b = locations.find((l) => l.id === f.transferToId)?.name
      const name = f.name.trim() || `Transfert ${a} → ${b}`
      const { projectId } = createProject({ kind: 'transfert', name, status: f.status, stockLocationId: f.stockLocationId, transferToId: f.transferToId, planStart: f.planStart, planEnd: f.planEnd, useStart: f.planStart, useEnd: f.planEnd, color: f.color, groupName: 'Matériel à transférer' })
      toast(`Transfert « ${name} » créé`)
      onClose()
      navigate(`/projets/${projectId}?tab=equipement`)
      return
    }
    if (!f.name.trim()) return toast('Le nom du projet est obligatoire', 'error')
    const { projectId, subprojectId } = createProject({ ...f, name: f.name.trim(), clientId: f.clientId || null, venueId: f.venueId || null, contactPersonId: f.contactPersonId || null, typeId: f.typeId || null, externalRef: f.externalRef.trim() || null, groupName: tpl.noTimes ? 'Vente' : 'Matériel' })
    if (userTpl) applyProjectTemplate(projectId, subprojectId, userTpl)
    toast(userTpl ? `Projet « ${f.name.trim()} » créé à partir du modèle « ${userTpl.name} »` : `Projet « ${f.name.trim()} » créé`)
    onClose()
    navigate(`/projets/${projectId}`)
  }

  // ---------- Étape 2 : informations du projet ----------
  if (step === 'details' && f) {
    const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
    const persons = contactPersons.filter((p) => p.contactId === f.clientId)
    // La planification suit la période d'utilisation (jours de préparation et de retour conservés)
    const setUsage = ({ start: useStart, end: useEnd }) => {
      const shift = (v, n) => (v && n ? toLocalInput(addDays(readDate(v), n)) : v)
      let planStart = shift(f.planStart, f.useStart ? dayDiff(readDate(useStart), readDate(f.useStart)) : 0) || useStart
      let planEnd = shift(f.planEnd, f.useEnd ? dayDiff(readDate(useEnd), readDate(f.useEnd)) : 0) || useEnd
      if (readDate(planStart) > readDate(useStart)) planStart = useStart
      if (readDate(planEnd) < readDate(useEnd)) planEnd = useEnd
      setF({ ...f, useStart, useEnd, planStart, planEnd })
    }
    return (
      <Modal
        title={kind === 'transfert' ? 'Nouveau transfert' : 'Nouveau projet'}
        size="npt-details"
        onClose={onClose}
        footer={
          <>
            <button className="btn" onClick={() => setStep('template')}><Icon name="arrow_back" size={18} /> Modèles</button>
            <span className="spacer" />
            <button className="btn" onClick={onClose}>Annuler</button>
            <button className="btn btn-primary" onClick={create}>{kind === 'transfert' ? 'Créer le transfert' : 'Créer le projet'}</button>
          </>
        }
      >
        <div className="npt-chosen">
          <span className="npt-ic"><Icon name={kind === 'transfert' ? 'move_down' : userTpl ? 'content_copy' : tpl.icon} size={18} /></span>
          <span>{kind === 'transfert' ? 'Projet de transfert' : 'Projet standard'} · <strong>{tpl.name}</strong> · à partir du {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(readDate(start))}</span>
          <button type="button" className="btn-link" onClick={() => setStep('template')}>Changer</button>
        </div>
        <form className="form-grid" onSubmit={create}>
          {kind === 'transfert' ? (
            <>
              <Field label="Nom" className="full" hint="Laissé vide : « Transfert départ → arrivée »">
                <input className="input" autoFocus value={f.name} onChange={set('name')} placeholder={`Transfert ${locations.find((l) => l.id === f.stockLocationId)?.name || ''} → ${locations.find((l) => l.id === f.transferToId)?.name || ''}`} />
              </Field>
              <Field label="Emplacement de départ">
                <select className="select" value={f.stockLocationId} onChange={set('stockLocationId')}>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </Field>
              <Field label="Emplacement d’arrivée">
                <select className="select" value={f.transferToId} onChange={set('transferToId')}>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </Field>
              <Field label="Départ → arrivée" className="full" hint="Le matériel quitte l’emplacement de départ puis arrive à destination">
                <DateRangeField start={f.planStart} end={f.planEnd} defaultTimes={['08:00', '12:00']} onChange={({ start: a, end: b }) => setF({ ...f, planStart: a, planEnd: b })} aria-label="Départ et arrivée" />
              </Field>
              <Field label="Statut">
                <select className="select" value={f.status} onChange={set('status')}>
                  {PROJECT_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </Field>
              {locations.length < 2 && <div className="alert alert-warning full"><Icon name="info" size={18} /><span>Il faut au moins deux emplacements de stock (Équipements › Emplacements) pour un transfert.</span></div>}
            </>
          ) : (
            <>
              <Field label="Nom *" className="full">
                <input className="input" autoFocus value={f.name} onChange={set('name')} placeholder="Ex. Concert, salon, séminaire…" />
              </Field>
              <Field label="Client">
                <select className="select" value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value, contactPersonId: '' })}>
                  <option value="">— Aucun —</option>
                  {contacts.filter((c) => c.type === 'client').map((c) => <option key={c.id} value={c.id}>{contactName(c)}</option>)}
                </select>
              </Field>
              <Field label="Personne de contact">
                <select className="select" value={f.contactPersonId} onChange={set('contactPersonId')} disabled={!persons.length}>
                  <option value="">— Aucune —</option>
                  {persons.map((p) => <option key={p.id} value={p.id}>{personName(p)}</option>)}
                </select>
              </Field>
              <Field label="Lieu de la prestation">
                <select className="select" value={f.venueId} onChange={set('venueId')}>
                  <option value="">— Aucun —</option>
                  {venues.map((c) => <option key={c.id} value={c.id}>{contactName(c)}</option>)}
                </select>
              </Field>
              <Field label="Type de projet">
                <select className="select" value={f.typeId} onChange={set('typeId')}>
                  <option value="">— Aucun —</option>
                  {projectTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
              <Field label="Statut">
                <select className="select" value={f.status} onChange={set('status')}>
                  {PROJECT_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </Field>
              <Field label="Référence externe (bon de commande client)">
                <input className="input" value={f.externalRef} onChange={set('externalRef')} />
              </Field>
              <Field label="Couleur" className="full"><ColorPicker value={f.color} onChange={(color) => setF({ ...f, color })} /></Field>
              {!tpl.noTimes && (
                <>
                  <Field label="Période d’utilisation" className="full" hint="Quand le matériel est utilisé (montage, événement, démontage)">
                    <DateRangeField start={f.useStart} end={f.useEnd} soft={[f.planStart, f.planEnd]} softLabel="Période de planification" onChange={setUsage} aria-label="Période d’utilisation" />
                  </Field>
                  <Field label="Période de planification" className="full" hint="Le matériel quitte l’entrepôt puis y revient · suit automatiquement la période d’utilisation">
                    <DateRangeField start={f.planStart} end={f.planEnd} soft={[f.useStart, f.useEnd]} softLabel="Période d’utilisation" defaultTimes={['08:00', '12:00']} onChange={({ start: a, end: b }) => setF({ ...f, planStart: a, planEnd: b })} aria-label="Période de planification" />
                  </Field>
                </>
              )}
            </>
          )}
          <button type="submit" hidden />
        </form>
      </Modal>
    )
  }

  // ---------- Étape 1 : type et modèle ----------
  const typeOf = (id) => projectTypes.find((t) => t.id === id)?.name
  const content = userTpl
    ? [
        ['Matériel', (userTpl.items || []).map((it) => `${it.quantity} × ${equipment.find((e) => e.id === it.equipmentId)?.name || 'Article'}`)],
        ['Fonctions', (userTpl.functions || []).map((id) => defaultFunctions.find((d) => d.id === id)?.name).filter(Boolean)],
        ['Coûts supplémentaires', (userTpl.costs || []).map((id) => defaultCosts.find((d) => d.id === id)?.name).filter(Boolean)],
      ].filter(([, l]) => l.length)
    : []
  const radio = (on, onClick, label, icon, key) => (
    <label key={key} className={`npt-option ${on ? 'on' : ''}`}>
      <input type="radio" checked={on} onChange={onClick} />
      {icon && <span className="npt-ic"><Icon name={icon} size={18} /></span>}
      <span>{label}</span>
    </label>
  )
  return (
    <Modal
      title="Modèles de projets"
      size="npt"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Fermer</button>
          <button className="btn btn-primary" onClick={select}>Sélectionner</button>
        </>
      }
    >
      <div className="npt">
        <div className="npt-left">
          <p className="npt-intro">Les modèles de projets vous permettent de saisir vos projets plus rapidement et d’éviter d’effectuer plusieurs fois les mêmes actions.</p>
          <div className="npt-title">Type de projet <Icon name="info" size={15} title="Un projet de transfert déplace du matériel d’un emplacement de stock vers un autre." /></div>
          {radio(kind === 'standard', () => setKind('standard'), 'Projet standard', 'view_quilt', 'k1')}
          {radio(kind === 'transfert', () => setKind('transfert'), 'Projet de transfert', 'move_down', 'k2')}
          <div className="npt-sep" />
          <div className="npt-title">Modèles de projets</div>
          {kind === 'transfert' ? (
            <>
              <div className="npt-sub">Modèles par défaut</div>
              {radio(true, () => {}, BLANK_TRANSFER.name, null, 't0')}
            </>
          ) : (
            <>
              <div className="npt-sub">Modèles par défaut</div>
              {DEFAULT_PROJECT_TEMPLATES.map((t) => radio(tplId === t.id, () => setTplId(t.id), t.name, null, t.id))}
              <div className="npt-sub">Modèles</div>
              {templates.length ? templates.map((t) => radio(tplId === t.id, () => setTplId(t.id), t.name, null, t.id)) : <p className="muted small" style={{ margin: '4px 0 0' }}>Aucun modèle : <Link to="/configuration?s=modeles-projets" onClick={onClose}>créez-en dans la configuration</Link>.</p>}
            </>
          )}
        </div>
        <div className="npt-right">
          <div className="npt-title">Options</div>
          <div className="npt-card">
            <Field label="Date de début"><DateField value={start} onChange={setStart} aria-label="Date de début" /></Field>
          </div>
          {userTpl && (
            <>
              <div className="npt-title">Aperçu</div>
              <div className="npt-card npt-preview">
                <div><span>Régime de TVA</span><strong>{regime?.name || 'Par défaut'}</strong></div>
                <div><span>Type de projet</span><strong>{typeOf(userTpl.typeId) || '—'}</strong></div>
                <div><span>Lieu</span><strong>{contactName(contacts.find((c) => c.id === userTpl.venueId))}</strong></div>
                <div><span>Couleur</span><strong>{userTpl.color ? <><span className="npt-dot" style={{ background: userTpl.color }} />{userTpl.color.toUpperCase()}</> : '—'}</strong></div>
              </div>
            </>
          )}
          <div className="npt-card npt-fold">
            <button type="button" className="npt-fold-head" onClick={() => setPlanOpen(!planOpen)}>
              <span>{kind === 'transfert' ? 'Transfert' : 'Planning'}</span>
              <Icon name={planOpen ? 'expand_less' : 'expand_more'} size={22} />
            </button>
            {planOpen && (
              <div className="npt-fold-body">
                {tpl.noTimes ? (
                  <p className="muted small" style={{ margin: 0 }}>Projet sans horaires (vente) : une seule journée, le {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(readDate(start))}. Le matériel est placé dans le groupe « Vente ».</p>
                ) : kind === 'transfert' ? (
                  <>
                    <div className="npt-period"><span>Départ</span><strong>{fmtLong(periods.planStart)}</strong></div>
                    <div className="npt-period"><span>Arrivée</span><strong>{fmtLong(periods.planEnd)}</strong></div>
                  </>
                ) : (
                  <>
                    <div className="npt-period"><span>Période d’utilisation</span><strong>{fmtDateTime(periods.useStart)} → {fmtDateTime(periods.useEnd)}</strong></div>
                    <div className="npt-period"><span>Période de planification</span><strong>{fmtDateTime(periods.planStart)} → {fmtDateTime(periods.planEnd)}</strong></div>
                  </>
                )}
              </div>
            )}
          </div>
          {content.length > 0 && (
            <div className="npt-card npt-content">
              {content.map(([label, list]) => (
                <div key={label}>
                  <span>{label} ({list.length})</span>
                  <p>{list.slice(0, 6).join(' · ')}{list.length > 6 ? ` · +${list.length - 6}` : ''}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
