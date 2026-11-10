import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore, toast } from '../store'
import { Field, Icon, NumInput, Toggle } from '../components/ui'
import { DB_ENABLED, uploadFile } from '../lib/db'
import { useAuth } from '../lib/auth'
import { EXTENSIONS, settingObject } from './settings/panels'

// L'étape « Compte » est faite sur l'écran de connexion (création du compte administrateur)
const STEPS = [
  { id: 'compte', label: 'Compte' },
  { id: 'entreprise', label: 'Entreprise', title: 'Votre entreprise', sub: 'Ces informations figurent sur vos devis, contrats et factures.' },
  { id: 'facturation', label: 'Facturation', title: 'Facturation', sub: 'Valeurs par défaut de vos documents financiers. Tout reste modifiable ensuite dans Configuration › Finance.' },
  { id: 'entrepot', label: 'Entrepôt', title: 'Votre entrepôt', sub: 'L’emplacement de stock principal, d’où part et revient le matériel. D’autres emplacements pourront être ajoutés.' },
  { id: 'modules', label: 'Modules', title: 'Modules', sub: 'Choisissez les modules utiles à votre activité. Ils peuvent être activés ou désactivés à tout moment dans Configuration › Extensions.' },
  { id: 'fin', label: 'Terminé', title: 'RentPlan est prêt', sub: 'Votre espace de travail est configuré. Voici par où commencer :' },
]

const COMPANY_KEYS = ['companyName', 'address', 'zip', 'city', 'country', 'phone', 'email', 'website', 'siret', 'vatNumber', 'logoUrl']
const BILLING_KEYS = ['currency', 'vatRate', 'paymentTermDays', 'quoteValidityDays', 'iban', 'bic', 'bankName', 'accountHolder', 'quotePrefix', 'nextQuoteNumber', 'invoicePrefix', 'nextInvoiceNumber', 'nextProjectNumber']
const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj[k] ?? '']))

const NEXT_ACTIONS = [
  ['category', 'Ajouter votre matériel', 'Catalogue, quantités, numéros de série et tarifs.', '/equipements'],
  ['contacts', 'Importer vos clients', 'Sociétés, interlocuteurs et conditions commerciales.', '/contacts'],
  ['groups', 'Inviter votre équipe', 'Créez les comptes de vos collaborateurs et leurs rôles.', '/configuration?s=utilisateurs'],
  ['description', 'Personnaliser vos documents', 'En-tête, logo et modèles de devis et factures.', '/configuration?s=entete'],
  ['event', 'Créer votre premier projet', 'Dates, matériel, équipe, transport et devis.', '/projets'],
]

/** Assistant de première configuration, affiché au premier administrateur d'une base neuve. */
export default function FirstSetup() {
  const navigate = useNavigate()
  const { settings, stockLocations, updateSettings, upsert } = useStore()
  const profile = useAuth((s) => s.profile)
  const [step, setStep] = useState(1)
  const [company, setCompany] = useState(() => pick(settings, COMPANY_KEYS))
  const [billing, setBilling] = useState(() => pick(settings, BILLING_KEYS))
  const mainLocation = stockLocations.find((l) => l.isDefault && !l.archived) || stockLocations.find((l) => !l.archived)
  const [warehouse, setWarehouse] = useState(() => ({ name: mainLocation?.name || 'Entrepôt principal', address: mainLocation?.address || '' }))
  const [modules, setModules] = useState(() => settingObject(settings, 'extensions'))
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const current = STEPS[step]

  const field = (state, setState) => (k) => ({ value: state[k] ?? '', onChange: (e) => setState({ ...state, [k]: e.target.value }) })
  const co = field(company, setCompany)
  const bi = field(billing, setBilling)
  const companyAddress = [company.address, [company.zip, company.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')

  const pickLogo = async (file) => {
    if (!file) return
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) return toast('Choisissez une image PNG, JPEG, WebP ou GIF', 'error')
    setUploading(true)
    try {
      let url
      if (DB_ENABLED) url = (await uploadFile(file, 'logo')).url
      else {
        if (file.size > 1e6) throw new Error('image trop lourde pour le mode local (1 Mo maximum)')
        url = await new Promise((res, rej) => {
          const r = new FileReader()
          r.onload = () => res(r.result)
          r.onerror = rej
          r.readAsDataURL(file)
        })
      }
      setCompany((c) => ({ ...c, logoUrl: url }))
    } catch (e) {
      toast(`Envoi impossible : ${e.message}`, 'error')
    } finally {
      setUploading(false)
    }
  }

  /** Enregistre l'étape affichée ; renvoie false si elle est incomplète. */
  const saveStep = () => {
    if (current.id === 'entreprise') {
      if (!company.companyName.trim()) {
        setError('Indiquez le nom de votre entreprise.')
        return false
      }
      const email = settingObject(settings, 'emailSettings')
      updateSettings({
        ...company,
        companyName: company.companyName.trim(),
        // E-mails envoyés aux clients : expéditeur et signature au nom de l'entreprise
        emailSettings: {
          ...email,
          senderName: email.senderName || company.companyName.trim(),
          replyTo: email.replyTo || company.email,
          signature: email.signature || [`L’équipe ${company.companyName.trim()}`, company.phone].filter(Boolean).join('\n'),
        },
      })
      if (!billing.accountHolder) setBilling((b) => ({ ...b, accountHolder: company.companyName.trim() }))
    }
    if (current.id === 'facturation') {
      const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' ? Number(v) : d)
      updateSettings({
        ...billing,
        vatRate: num(billing.vatRate, 20),
        paymentTermDays: num(billing.paymentTermDays, 30),
        quoteValidityDays: num(billing.quoteValidityDays, 14),
        nextQuoteNumber: Math.max(1, num(billing.nextQuoteNumber, 1)),
        nextInvoiceNumber: Math.max(1, num(billing.nextInvoiceNumber, 1)),
        nextProjectNumber: Math.max(1, num(billing.nextProjectNumber, 1)),
      })
    }
    if (current.id === 'entrepot') {
      if (!warehouse.name.trim()) {
        setError('Donnez un nom à votre entrepôt.')
        return false
      }
      const loc = { ...(mainLocation || { id: 'sl_principal', kind: 'entrepot', archived: false }), name: warehouse.name.trim(), address: warehouse.address.trim(), isDefault: true }
      upsert('stockLocations', loc)
    }
    if (current.id === 'modules') updateSettings({ extensions: modules })
    return true
  }

  const next = () => {
    setError('')
    if (saveStep()) setStep(step + 1)
  }
  const back = () => {
    setError('')
    setStep(Math.max(1, step - 1))
  }
  const finish = (to = '/') => {
    updateSettings({ setupPending: false })
    toast('Configuration terminée : bienvenue dans RentPlan !')
    navigate(to)
  }

  return (
    <div className="setup-page">
      <div className="setup-card">
        <div className="setup-head">
          <div className="login-brand">
            <span className="login-logo">R</span> RentPlan
          </div>
          <ol className="setup-steps">
            {STEPS.map((s, i) => (
              <li key={s.id} className={i < step ? 'done' : i === step ? 'current' : ''}>
                <span className="setup-dot">{i < step ? <Icon name="check" size={16} /> : i + 1}</span>
                <span className="setup-label">{s.label}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="setup-body">
          {step === 1 && <p className="setup-hello">Bienvenue{profile?.fullName ? `, ${profile.fullName.split(' ')[0]}` : ''} ! Quelques informations pour préparer votre espace de travail.</p>}
          <h1>{current.title}</h1>
          <p className="login-sub">{current.sub}</p>

          {current.id === 'entreprise' && (
            <div className="stack" style={{ gap: 18 }}>
              <div className="form-grid">
                <Field label="Raison sociale *" className="full"><input className="input" autoFocus {...co('companyName')} /></Field>
                <Field label="Adresse" className="full"><input className="input" {...co('address')} /></Field>
                <Field label="Code postal"><input className="input" {...co('zip')} /></Field>
                <Field label="Ville"><input className="input" {...co('city')} /></Field>
                <Field label="Pays"><input className="input" {...co('country')} /></Field>
                <Field label="Téléphone"><input className="input" {...co('phone')} /></Field>
                <Field label="E-mail"><input className="input" type="email" {...co('email')} /></Field>
                <Field label="Site web"><input className="input" {...co('website')} /></Field>
                <Field label="SIRET"><input className="input" {...co('siret')} /></Field>
                <Field label="N° TVA intracommunautaire"><input className="input" {...co('vatNumber')} /></Field>
              </div>
              <div className="logo-field">
                <div className="logo-preview">{company.logoUrl ? <img src={company.logoUrl} alt="Logo" /> : <span className="muted small">Aucun logo</span>}</div>
                <div className="stack" style={{ gap: 8 }}>
                  <label className="btn" style={{ alignSelf: 'flex-start' }}>
                    <Icon name={uploading ? 'sync' : 'upload'} size={18} className={uploading ? 'spin' : ''} /> {company.logoUrl ? 'Changer le logo' : 'Ajouter votre logo'}
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden disabled={uploading} onChange={(e) => pickLogo(e.target.files?.[0])} />
                  </label>
                  <span className="muted small">Facultatif. Imprimé en haut de vos documents.</span>
                </div>
              </div>
            </div>
          )}

          {current.id === 'facturation' && (
            <div className="stack" style={{ gap: 18 }}>
              <div className="form-grid form-grid-4">
                <Field label="Devise">
                  <select className="select" {...bi('currency')}>
                    <option value="EUR">Euro (€)</option>
                    <option value="CHF">Franc suisse (CHF)</option>
                    <option value="USD">Dollar (US$)</option>
                    <option value="GBP">Livre (£)</option>
                    <option value="CAD">Dollar canadien</option>
                  </select>
                </Field>
                <Field label="TVA par défaut (%)"><NumInput className="input" value={billing.vatRate} onChange={(v) => setBilling({ ...billing, vatRate: v })} /></Field>
                <Field label="Délai de paiement (jours)"><NumInput className="input" value={billing.paymentTermDays} onChange={(v) => setBilling({ ...billing, paymentTermDays: v })} /></Field>
                <Field label="Validité des devis (jours)"><NumInput className="input" value={billing.quoteValidityDays} onChange={(v) => setBilling({ ...billing, quoteValidityDays: v })} /></Field>
              </div>
              <div className="form-grid">
                <Field label="IBAN" className="full"><input className="input" {...bi('iban')} placeholder="FR76 …" /></Field>
                <Field label="BIC"><input className="input" {...bi('bic')} /></Field>
                <Field label="Banque"><input className="input" {...bi('bankName')} /></Field>
                <Field label="Titulaire du compte" className="full"><input className="input" {...bi('accountHolder')} /></Field>
              </div>
              <div>
                <div className="setup-subtitle">Numérotation</div>
                <p className="muted small" style={{ margin: '0 0 10px' }}>Vous reprenez une activité existante ? Indiquez les prochains numéros pour continuer votre série.</p>
                <div className="form-grid form-grid-3">
                  <Field label="Préfixe des devis"><input className="input" {...bi('quotePrefix')} /></Field>
                  <Field label="Prochain n° de devis"><NumInput className="input" value={billing.nextQuoteNumber} onChange={(v) => setBilling({ ...billing, nextQuoteNumber: v })} /></Field>
                  <Field label="Prochain n° de projet"><NumInput className="input" value={billing.nextProjectNumber} onChange={(v) => setBilling({ ...billing, nextProjectNumber: v })} /></Field>
                  <Field label="Préfixe des factures"><input className="input" {...bi('invoicePrefix')} /></Field>
                  <Field label="Prochain n° de facture"><NumInput className="input" value={billing.nextInvoiceNumber} onChange={(v) => setBilling({ ...billing, nextInvoiceNumber: v })} /></Field>
                </div>
              </div>
            </div>
          )}

          {current.id === 'entrepot' && (
            <div className="form-grid">
              <Field label="Nom *" className="full"><input className="input" autoFocus value={warehouse.name} onChange={(e) => setWarehouse({ ...warehouse, name: e.target.value })} /></Field>
              <Field label="Adresse" className="full">
                <input className="input" value={warehouse.address} onChange={(e) => setWarehouse({ ...warehouse, address: e.target.value })} />
              </Field>
              {companyAddress && warehouse.address !== companyAddress && (
                <button type="button" className="btn-link full" style={{ justifySelf: 'start' }} onClick={() => setWarehouse({ ...warehouse, address: companyAddress })}>
                  <Icon name="content_copy" size={16} /> Utiliser l’adresse de l’entreprise
                </button>
              )}
            </div>
          )}

          {current.id === 'modules' && (
            <div className="setup-modules">
              {EXTENSIONS.map((e) => (
                <div key={e.id} className={`card ext-card ${modules[e.id] ? 'on' : ''}`}>
                  <span className="ext-icon"><Icon name={e.icon} size={24} /></span>
                  <div style={{ flex: 1 }}>
                    <div className="strong">{e.name}</div>
                    <div className="muted small">{e.text}</div>
                  </div>
                  <Toggle checked={modules[e.id]} onChange={(v) => setModules({ ...modules, [e.id]: v })} />
                </div>
              ))}
            </div>
          )}

          {current.id === 'fin' && (
            <div className="setup-next">
              {NEXT_ACTIONS.map(([icon, title, text, to]) => (
                <button key={to} type="button" className="setup-next-item" onClick={() => finish(to)}>
                  <span className="ext-icon"><Icon name={icon} size={22} /></span>
                  <span>
                    <strong>{title}</strong>
                    <span className="muted small">{text}</span>
                  </span>
                  <Icon name="chevron_right" size={22} />
                </button>
              ))}
            </div>
          )}

          {error && (
            <div className="alert alert-danger" role="alert" style={{ marginTop: 16 }}>
              <Icon name="error" size={18} />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="setup-foot">
          {step > 1 && (
            <button className="btn" onClick={back}>
              <Icon name="arrow_back" size={18} /> Précédent
            </button>
          )}
          <span className="spacer" />
          {current.id === 'fin' ? (
            <button className="btn btn-primary" onClick={() => finish('/')}>
              Accéder à RentPlan <Icon name="arrow_forward" size={18} />
            </button>
          ) : (
            <>
              {['facturation', 'modules'].includes(current.id) && (
                <button className="btn btn-ghost" onClick={() => setStep(step + 1)}>Passer</button>
              )}
              <button className="btn btn-primary" onClick={next} disabled={uploading}>
                Suivant <Icon name="arrow_forward" size={18} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
