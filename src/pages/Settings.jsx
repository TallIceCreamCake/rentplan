import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CONFIG_COLLECTIONS, replaceAllData, resetToEmpty, useIdx, useStore, toast } from '../store'
import { Avatar, Badge, ColorPicker, Field, Icon, Menu, Modal, NumInput, Section, Toggle } from '../components/ui'
import { DB_ENABLED, uploadFile, useSyncStatus } from '../lib/db'
import { FUNCTION_PRICE_TYPES } from '../lib/model'
import { LEVELS, MODULES } from '../lib/permissions'
import { changePassword, createAccount, deleteAccount, deleteRole, fetchAccounts, saveRole, setAccountPassword, setPreference, updateAccount, updateMyProfile, useAccess, useAuth } from '../lib/auth'
import { fmtRelative } from './dashboard/widgets'
import { configMenuFor, defaultSection, sectionOf } from './settings/menu'
import * as P from './settings/panels'
import { DocumentTemplatesPanel, LetterheadsPanel } from './settings/DocumentLayouts'
import { HeaderSlot } from './settings/slot'
import { UpdatesSection } from './settings/Updates'
import { downloadFile, durationFactor, fmtNumber, personName, toDateInput, uid } from '../lib/utils'

const PANELS = {
  profil: ProfilePanel,
  utilisateurs: UsersPanel,
  roles: RolesPanel,
  entreprise: Company,
  paiement: P.PaymentInfo,
  'mes-factures': P.MyInvoices,
  extensions: P.Extensions,
  donnees: DataPanel,
  'heure-lieu': P.TimeAndPlace,
  series: Series,
  types: ProjectTypes,
  'modeles-projets': P.ProjectTemplates,
  inspections: P.InspectionTypes,
  heures: P.TimeSettings,
  'statuts-entrepot': P.WarehouseStatuses,
  champs: P.CustomFieldsSettings,
  fonctions: DefaultFunctions,
  couts: DefaultCosts,
  dossiers: Folders,
  competences: Skills,
  communication: P.Communication,
  'modeles-documents': DocumentTemplatesPanel,
  entete: LetterheadsPanel,
  formule: P.Salutation,
  finance: FinanceSettings,
  'facturation-numerique': P.EInvoicing,
  tva: P.VatRegimes,
  'conditions-paiement': P.PaymentTerms,
  coefficients: Staffel,
  conditions: P.ExtraConditions,
}

/** Configuration : la rubrique est choisie dans le panneau de gauche (voir ConfigMenu dans Layout). */
export default function Settings() {
  const access = useAccess()
  const [params] = useSearchParams()
  const allowed = configMenuFor(access).flatMap((g) => g.items.map((i) => i.id))
  const wanted = params.get('s') || defaultSection(access)
  const section = allowed.includes(wanted) ? wanted : 'profil'
  const info = sectionOf(section)
  const Panel = PANELS[section]
  // Les rubriques peuvent placer leurs boutons à droite du titre (Fermer, Sauvegarder)
  const [slot, setSlot] = useState(null)
  return (
    <>
      <div className="page-header settings-header">
        <div>
          <div className="crumbs">Configuration <Icon name="chevron_right" size={15} /> {info.group}</div>
          <h1>{info.label}</h1>
        </div>
        <div className="actions" ref={setSlot} />
      </div>
      <HeaderSlot.Provider value={slot}>
        <div className="settings-body" key={section}>
          <Panel />
        </div>
      </HeaderSlot.Provider>
    </>
  )
}

function useSettings() {
  const { settings, updateSettings } = useStore()
  const text = (k) => ({ value: settings[k] ?? '', onChange: (e) => updateSettings({ [k]: e.target.value }) })
  const number = (k) => ({ value: settings[k], onChange: (v) => updateSettings({ [k]: v }) })
  return { settings, updateSettings, text, number }
}

function Company() {
  const { settings, updateSettings, text } = useSettings()
  const [busy, setBusy] = useState(false)
  // Logo : imprimé par l'en-tête de documents généré et disponible en variable {$company.logo}
  const pickLogo = async (file) => {
    if (!file) return
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) return toast('Choisissez une image PNG, JPEG, WebP ou GIF', 'error')
    setBusy(true)
    try {
      if (DB_ENABLED) updateSettings({ logoUrl: (await uploadFile(file, 'logo')).url })
      else {
        if (file.size > 1e6) throw new Error('image trop lourde pour le mode local (1 Mo maximum)')
        updateSettings({ logoUrl: await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file) }) })
      }
    } catch (e) {
      toast(`Envoi impossible : ${e.message}`, 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="stack">
      <Section title="Informations de l'entreprise">
        <div className="form-grid">
          <Field label="Raison sociale" className="full"><input className="input" {...text('companyName')} /></Field>
          <Field label="Adresse" className="full"><input className="input" {...text('address')} /></Field>
          <Field label="Code postal"><input className="input" {...text('zip')} /></Field>
          <Field label="Ville"><input className="input" {...text('city')} /></Field>
          <Field label="Téléphone"><input className="input" {...text('phone')} /></Field>
          <Field label="E-mail"><input className="input" {...text('email')} /></Field>
          <Field label="Site web"><input className="input" {...text('website')} /></Field>
          <Field label="SIRET"><input className="input" {...text('siret')} /></Field>
          <Field label="N° TVA"><input className="input" {...text('vatNumber')} /></Field>
        </div>
      </Section>
      <Section title="Logo">
        <div className="logo-field">
          <div className="logo-preview">{settings.logoUrl ? <img src={settings.logoUrl} alt="Logo" /> : <span className="muted small">Aucun logo</span>}</div>
          <div className="stack" style={{ gap: 10, flex: 1 }}>
            <div className="row" style={{ gap: 8 }}>
              <label className={`btn ${busy ? 'disabled' : ''}`}>
                <Icon name="upload" size={18} /> {busy ? 'Envoi…' : 'Choisir une image'}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => pickLogo(e.target.files?.[0])} />
              </label>
              {settings.logoUrl && <button className="btn btn-ghost" onClick={() => updateSettings({ logoUrl: '' })}><Icon name="delete" size={18} /> Retirer</button>}
            </div>
            <Field label="Ou adresse d’une image" hint="Imprimé par l’en-tête de documents « généré » et disponible dans les modèles avec la variable {$company.logo}">
              <input className="input" value={settings.logoUrl?.startsWith('data:') ? '' : settings.logoUrl || ''} onChange={(e) => updateSettings({ logoUrl: e.target.value })} placeholder="https://…/logo.png" />
            </Field>
          </div>
        </div>
      </Section>
    </div>
  )
}

function Series() {
  const { text, number } = useSettings()
  const rows = [
    ['Projets', null, 'nextProjectNumber'],
    ['Devis', 'quotePrefix', 'nextQuoteNumber'],
    ['Contrats', 'contractPrefix', 'nextContractNumber'],
    ['Factures', 'invoicePrefix', 'nextInvoiceNumber'],
    ['Notes de crédit', 'creditPrefix', 'nextCreditNumber'],
    ['Bons de commande', 'poPrefix', 'nextPoNumber'],
    ['Sous-locations', 'subrentPrefix', 'nextSubrentNumber'],
    ['Réparations', 'repairPrefix', 'nextRepairNumber'],
  ]
  return (
    <Section title="Séries de numéros" bodyClass="card-body tight">
      <p className="muted small" style={{ margin: '12px 16px' }}>Le prochain numéro de chaque série est attribué au prochain élément créé. Les documents suivent le format préfixe + année + numéro.</p>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Série</th><th>Préfixe</th><th className="num">Prochain numéro</th></tr></thead>
          <tbody>
            {rows.map(([label, prefix, counter]) => (
              <tr key={counter}>
                <td className="strong">{label}</td>
                <td>{prefix ? <input className="input input-sm" style={{ maxWidth: 120 }} {...text(prefix)} aria-label={`Préfixe ${label}`} /> : <span className="muted">—</span>}</td>
                <td className="num"><NumInput style={{ width: 100 }} {...number(counter)} onChange={(v) => number(counter).onChange(Math.max(1, Math.round(v)))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

function FinanceSettings() {
  const { settings, text, number } = useSettings()
  const regime = (settings.vatRegimes || []).find((r) => r.id === settings.vatRegimeId)
  const term = (settings.paymentTerms || []).find((t) => t.id === settings.paymentTermId)
  return (
    <div className="stack">
      <Section title="Finance">
        <div className="form-grid form-grid-3">
          <Field label="Devise">
            <select className="select" {...text('currency')}><option value="EUR">Euro (€)</option><option value="CHF">Franc suisse (CHF)</option><option value="USD">Dollar (US$)</option><option value="GBP">Livre (£)</option><option value="CAD">Dollar canadien</option></select>
          </Field>
          <Field label="Expiration par défaut des devis / contrats (jours)"><NumInput className="input input-num" {...number('quoteValidityDays')} /></Field>
          <div />
          <Field label="Régime de TVA par défaut" hint="Modifiable dans « Régimes de TVA »"><input className="input" value={regime ? `${regime.name} (${regime.rate} %)` : `${settings.vatRate} %`} disabled /></Field>
          <Field label="Conditions de paiement par défaut" hint="Modifiables dans « Conditions de paiement »"><input className="input" value={term ? term.name : `${settings.paymentTermDays} jours`} disabled /></Field>
        </div>
      </Section>
    </div>
  )
}

function Staffel() {
  const { settings, updateSettings } = useSettings()
  const rows = settings.staffel || []
  const setRows = (staffel) => updateSettings({ staffel })
  const sortRows = () => setRows([...rows].sort((a, b) => a.days - b.days))
  return (
    <div className="stack">
      <div className="alert alert-info"><Icon name="info" size={18} /><span>Le coefficient détermine combien de jours sont facturés selon la durée d'utilisation. Exemple : un coefficient de 2 pour 3 jours facture 3 jours au prix de 2.</span></div>
      <div className="grid grid-2">
        <Section title="Grille" action={<button className="btn-link" onClick={() => { const last = [...rows].sort((a, b) => a.days - b.days).pop() || { days: 0, factor: 0 }; setRows([...rows, { days: last.days + 1, factor: last.factor + 0.5 }]) }}><Icon name="add" size={17} /> Ligne</button>} bodyClass="card-body tight">
          <div className="table-wrap">
            <table className="table table-compact">
              <thead><tr><th>À partir de (jours)</th><th>Coefficient</th><th /></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    {/* Pas de tri pendant la saisie : la ligne ne change pas de place sous le curseur */}
                    <td><NumInput value={r.days} onBlur={sortRows} onChange={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, days: Math.max(1, Math.round(v)) } : x)))} /></td>
                    <td><NumInput value={r.factor} onChange={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, factor: v } : x)))} /></td>
                    <td className="right"><button className="btn btn-ghost btn-icon btn-sm" disabled={rows.length <= 1} onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Supprimer"><Icon name="delete" size={17} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card-body">
            <Field label="Coefficient ajouté par jour au-delà de la grille"><NumInput className="input input-num" style={{ maxWidth: 140 }} value={settings.staffelExtra} onChange={(v) => updateSettings({ staffelExtra: v })} /></Field>
          </div>
        </Section>
        <Section title="Aperçu (pour 100 € / jour)" bodyClass="card-body tight">
          <div className="table-wrap">
            <table className="table table-compact">
              <thead><tr><th>Durée</th><th className="num">Coefficient</th><th className="num">Prix</th><th className="num">Prix / jour effectif</th></tr></thead>
              <tbody>
                {Array.from({ length: 14 }, (_, i) => i + 1).map((d) => {
                  const f = durationFactor(d, rows, settings.staffelExtra)
                  return <tr key={d}><td>{d} jour{d > 1 ? 's' : ''}</td><td className="num">×{fmtNumber(f, 2)}</td><td className="num strong">{fmtNumber(f * 100, 2)} €</td><td className="num muted">{fmtNumber((f * 100) / d, 2)} €</td></tr>
                })}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </div>
  )
}

/** Tableau éditable générique pour les listes de configuration. */
function EditableList({ title, collection, columns, make, help }) {
  const store = useStore()
  const rows = store[collection]
  return (
    <Section title={title} action={<button className="btn btn-sm btn-primary" onClick={() => store.upsert(collection, make())}><Icon name="add" size={17} /> Ajouter</button>} bodyClass="card-body tight">
      {help && <p className="muted small" style={{ margin: '12px 16px' }}>{help}</p>}
      <div className="table-wrap">
        <table className="table table-compact">
          <thead><tr>{columns.map((c) => <th key={c.key} className={c.num ? 'num' : ''}>{c.label}</th>)}<th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                {columns.map((c) => (
                  <td key={c.key} className={c.num ? 'num' : ''}>
                    {c.render ? c.render(r, (patch) => store.patch(collection, r.id, patch)) : c.num ? (
                      <NumInput style={{ width: 90 }} value={r[c.key]} onChange={(v) => store.patch(collection, r.id, { [c.key]: v })} />
                    ) : (
                      <input className="input input-sm" style={{ maxWidth: 'none' }} value={r[c.key] || ''} onChange={(e) => store.patch(collection, r.id, { [c.key]: e.target.value })} aria-label={c.label} />
                    )}
                  </td>
                ))}
                <td className="right"><button className="btn btn-ghost btn-icon btn-sm" onClick={() => store.remove(collection, r.id)} aria-label="Supprimer"><Icon name="delete" size={17} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

function ProjectTypes() {
  return (
    <EditableList
      title="Types de projet"
      collection="projectTypes"
      help="La couleur du type est utilisée dans la chronologie et le calendrier des projets."
      make={() => ({ id: uid('pt_'), name: 'Nouveau type', color: '#1f87e5' })}
      columns={[
        { key: 'name', label: 'Nom' },
        { key: 'color', label: 'Couleur', render: (r, patch) => <ColorPicker value={r.color} onChange={(color) => patch({ color: color || '#8a929c' })} /> },
      ]}
    />
  )
}

function DefaultFunctions() {
  const typeSelect = (key) => (r, patch) => (
    <select className="select input-sm" style={{ width: 120 }} value={r[key]} onChange={(e) => patch({ [key]: e.target.value })} aria-label="Type">
      {FUNCTION_PRICE_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
    </select>
  )
  return (
    <EditableList
      title="Fonctions par défaut"
      collection="defaultFunctions"
      help="Fonctions réutilisables dans l'onglet « Équipe et transport » des projets."
      make={() => ({ id: uid('df_'), kind: 'equipe', name: 'Nouvelle fonction', internalName: 'Nouvelle fonction', price: 40, priceType: 'heure', cost: 25, costType: 'heure', breakMinutes: 30, tags: [] })}
      columns={[
        { key: 'kind', label: 'Type', render: (r, patch) => <select className="select input-sm" style={{ width: 120 }} value={r.kind} onChange={(e) => patch({ kind: e.target.value })} aria-label="Type"><option value="equipe">Équipe</option><option value="transport">Transport</option></select> },
        { key: 'name', label: 'Nom' },
        { key: 'price', label: 'Prix', num: true },
        { key: 'priceType', label: 'Facturation', render: typeSelect('priceType') },
        { key: 'cost', label: 'Coût', num: true },
        { key: 'costType', label: 'Coût par', render: typeSelect('costType') },
        { key: 'breakMinutes', label: 'Pause (min)', num: true },
      ]}
    />
  )
}

function DefaultCosts() {
  return (
    <EditableList
      title="Coûts supplémentaires par défaut"
      collection="defaultCosts"
      make={() => ({ id: uid('dc_'), name: 'Nouveau coût', quantity: 1, price: 0, cost: 0 })}
      columns={[
        { key: 'name', label: 'Nom' },
        { key: 'quantity', label: 'Quantité', num: true },
        { key: 'price', label: 'Prix de vente', num: true },
        { key: 'cost', label: "Prix d'achat", num: true },
      ]}
    />
  )
}

function Folders() {
  const store = useStore()
  return (
    <EditableList
      title="Dossiers d'équipements"
      collection="categories"
      help="Organisez la base de données des équipements en dossiers et sous-dossiers."
      make={() => ({ id: uid('cat_'), name: 'Nouveau dossier', color: null, parentId: null, sort: store.categories.length })}
      columns={[
        { key: 'name', label: 'Nom' },
        {
          key: 'parentId',
          label: 'Dossier parent',
          render: (r, patch) => (
            <select className="select input-sm" style={{ width: 200 }} value={r.parentId || ''} onChange={(e) => patch({ parentId: e.target.value || null })} aria-label="Dossier parent">
              <option value="">— Racine —</option>
              {store.categories.filter((c) => c.id !== r.id && !c.parentId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          ),
        },
        { key: 'count', label: 'Équipements', render: (r) => <span className="muted">{store.equipment.filter((e) => e.categoryId === r.id).length}</span> },
        { key: 'color', label: 'Couleur', render: (r, patch) => <ColorPicker value={r.color} onChange={(color) => patch({ color })} /> },
      ]}
    />
  )
}

function Skills() {
  const { settings, updateSettings } = useSettings()
  const [name, setName] = useState('')
  const skills = settings.crewSkills || []
  return (
    <Section title="Compétences du personnel">
      <p className="muted small" style={{ marginTop: 0 }}>Fonctions que peuvent occuper les membres du personnel ; elles servent d'étiquettes pour trouver la bonne personne.</p>
      <div className="chips" style={{ marginBottom: 14 }}>
        {skills.map((s) => (
          <span key={s} className="chip" style={{ cursor: 'default' }}>
            {s}
            <button className="btn btn-ghost btn-icon" style={{ width: 20, height: 20 }} onClick={() => updateSettings({ crewSkills: skills.filter((x) => x !== s) })} aria-label={`Retirer ${s}`}><Icon name="close" size={14} /></button>
          </span>
        ))}
      </div>
      <form className="row" onSubmit={(e) => { e.preventDefault(); if (!name.trim() || skills.includes(name.trim())) return; updateSettings({ crewSkills: [...skills, name.trim()] }); setName('') }}>
        <input className="input input-sm" style={{ maxWidth: 280 }} placeholder="Nouvelle compétence" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn-sm" type="submit"><Icon name="add" size={17} /> Ajouter</button>
      </form>
    </Section>
  )
}

function DataPanel() {
  const { exportData } = useStore()
  const access = useAccess()
  const canWrite = access.can('configuration', 'modification')
  const [wipe, setWipe] = useState(false)
  const exportNow = () => downloadFile(`rentplan-${toDateInput(new Date())}.json`, JSON.stringify(exportData(), null, 2))
  const sync = useSyncStatus()
  const fileRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const run = async (fn, msg) => {
    setBusy(true)
    try {
      await fn()
      toast(msg)
    } catch (e) {
      toast(`Échec : ${e.message}`, 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="stack">
      <Section title="Base de données">
        {DB_ENABLED ? (
          <div className="stack" style={{ gap: 6 }}>
            <div className="row"><Icon name="cloud_done" size={19} style={{ color: 'var(--success)' }} /> Les données sont enregistrées dans <strong>Supabase</strong> (Postgres local dans Docker) et synchronisées en temps réel.</div>
            <div className="small muted">API : {import.meta.env.VITE_SUPABASE_URL} · état : {sync.state}{sync.savedAt ? ` · dernier enregistrement ${sync.savedAt.toLocaleTimeString('fr-FR')}` : ''}</div>
            <div className="small">Supabase Studio : <a href="http://127.0.0.1:54523" target="_blank" rel="noreferrer">http://127.0.0.1:54523</a> · commandes : <code>npm run db:start</code>, <code>npm run db:stop</code>, <code>npm run db:reset</code></div>
          </div>
        ) : (
          <div className="row"><Icon name="cloud_off" size={19} /> Les données sont enregistrées dans ce navigateur. Renseignez <code>.env.local</code> pour utiliser Supabase.</div>
        )}
      </Section>
      <Section title="Sauvegarde">
        <div className="row wrap">
          <button className="btn" onClick={exportNow}><Icon name="download" size={18} /> Exporter (JSON)</button>
          <button className="btn" onClick={() => fileRef.current?.click()} disabled={busy || !canWrite}><Icon name="upload" size={18} /> Importer</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file) return
              try {
                const json = JSON.parse(await file.text())
                if (!json.projects || !json.equipment || !json.subprojects) throw new Error('Format de fichier non reconnu')
                if (confirm('Remplacer toutes les données actuelles par celles du fichier ?')) run(() => replaceAllData(json), 'Données importées')
              } catch (err) {
                toast(`Fichier invalide : ${err.message}`, 'error')
              }
            }}
          />
        </div>
      </Section>
      <UpdatesSection canWrite={canWrite} />
      <Section title="Réinitialisation">
        <div className="reset-list">
          <div className="reset-row">
            <Icon name="delete_forever" size={22} style={{ color: 'var(--danger)' }} />
            <div>
              <strong>Repartir de zéro</strong>
              <span>Efface toutes les données pour démarrer avec un espace vide. Les comptes utilisateurs et les rôles sont conservés.</span>
            </div>
            <button className="btn btn-danger-fill" disabled={busy || !canWrite || !access.admin} title={access.admin ? '' : 'Réservé aux administrateurs'} onClick={() => setWipe(true)}>
              <Icon name="delete_forever" size={18} /> Repartir de zéro
            </button>
          </div>
        </div>
        {!access.admin && <p className="muted small" style={{ marginBottom: 0 }}>« Repartir de zéro » est réservé aux rôles qui gèrent les comptes.</p>}
      </Section>
      {wipe && <WipeModal onClose={() => setWipe(false)} onExport={exportNow} onDone={() => setWipe(false)} />}
    </div>
  )
}

// Libellés des données effacées par « Repartir de zéro »
const WIPED = [
  ['projects', 'projet'], ['equipment', 'équipement'], ['contacts', 'contact'], ['crew', 'membre du personnel', 'membres du personnel'], ['vehicles', 'véhicule'],
  ['documents', 'document'], ['tasks', 'tâche'], ['timeEntries', 'pointage'], ['repairs', 'réparation'], ['subrents', 'sous-location'], ['purchaseOrders', 'bon de commande', 'bons de commande'],
  ['requests', 'demande'], ['files', 'fichier'],
]

/** « Repartir de zéro » : options, récapitulatif et confirmation en tapant SUPPRIMER. */
function WipeModal({ onClose, onExport, onDone }) {
  const data = useStore()
  const [keepConfig, setKeepConfig] = useState(true)
  const [resetCounters, setResetCounters] = useState(true)
  const [removeFiles, setRemoveFiles] = useState(true)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const counts = WIPED.map(([k, one, many]) => [data[k]?.length || 0, one, many || `${one}s`]).filter(([n]) => n)
  const configCounts = CONFIG_COLLECTIONS.reduce((n, c) => n + (data[c]?.length || 0), 0)
  const go = async () => {
    setBusy(true)
    try {
      await resetToEmpty({ keepConfig, resetCounters, removeFiles })
      toast('Toutes les données ont été effacées : vous repartez de zéro')
      onDone()
    } catch (e) {
      toast(`Échec : ${e.message}`, 'error')
      setBusy(false)
    }
  }
  return (
    <Modal
      title="Repartir de zéro"
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <button className="btn" onClick={onExport} disabled={busy}><Icon name="download" size={18} /> Exporter une sauvegarde</button>
          <span className="spacer" />
          <button className="btn" onClick={onClose} disabled={busy}>Annuler</button>
          <button className="btn btn-danger-fill" disabled={busy || typed.trim().toUpperCase() !== 'SUPPRIMER'} onClick={go}>
            <Icon name={busy ? 'sync' : 'delete_forever'} size={18} className={busy ? 'spin' : ''} /> {busy ? 'Effacement…' : 'Tout effacer'}
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 16 }}>
        <div className="alert alert-danger">
          <Icon name="warning" size={18} />
          <div>
            <strong>Action définitive.</strong> Seront supprimés : {counts.length ? counts.map(([n, one, many]) => `${n} ${n > 1 ? many : one}`).join(', ') : 'aucune donnée'}, ainsi que les sous-projets, le matériel planifié, les affectations, les notes et le registre.
            <div style={{ marginTop: 4 }}>Les comptes utilisateurs et les rôles sont conservés.</div>
          </div>
        </div>
        <div className="stack" style={{ gap: 12 }}>
          <Toggle checked={keepConfig} onChange={setKeepConfig} label="Conserver la configuration" />
          <p className="muted small reset-hint">{keepConfig ? `Détails et logo de l’entreprise, modèles et en-têtes de documents, séries de numéros, TVA et conditions de paiement, champs supplémentaires, ainsi que ${configCounts} élément${configCounts > 1 ? 's' : ''} de configuration (dossiers d’équipements, emplacements de stock, types de projets, fonctions et coûts par défaut).` : 'La configuration revient aux réglages par défaut et les informations de l’entreprise sont vidées.'}</p>
          <Toggle checked={resetCounters} onChange={setResetCounters} label="Remettre les compteurs de numéros à 1" />
          <p className="muted small reset-hint">Le prochain projet portera le n° 1, le prochain devis {`${data.settings.quotePrefix || ''}${new Date().getFullYear()}-0001`}, etc.</p>
          {DB_ENABLED && (
            <>
              <Toggle checked={removeFiles} onChange={setRemoveFiles} label="Supprimer aussi les fichiers stockés" />
              <p className="muted small reset-hint">Images des équipements et fichiers joints aux projets{keepConfig ? '' : ', logo et fonds des en-têtes'}.</p>
            </>
          )}
        </div>
        <Field label={<>Pour confirmer, tapez <strong>SUPPRIMER</strong></>}>
          <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="SUPPRIMER" autoComplete="off" disabled={busy} />
        </Field>
      </div>
    </Modal>
  )
}

// ---------- Mon profil (tous les comptes) ----------
function ProfilePanel() {
  const profile = useAuth((s) => s.profile)
  const access = useAccess()
  const idx = useIdx()
  const [name, setName] = useState(profile.fullName)
  const [pw, setPw] = useState({ a: '', b: '' })
  const [busy, setBusy] = useState(false)
  const crew = idx.crew[profile.crewId]
  const savePassword = async (e) => {
    e.preventDefault()
    if (pw.a.length < 6) return toast('Le mot de passe doit contenir au moins 6 caractères', 'error')
    if (pw.a !== pw.b) return toast('Les deux mots de passe ne correspondent pas', 'error')
    setBusy(true)
    try {
      await changePassword(pw.a)
      setPw({ a: '', b: '' })
      toast('Mot de passe modifié')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="stack">
      <Section title="Mon profil">
        <div className="profile-head">
          <Avatar person={{ firstName: profile.fullName.split(' ')[0], lastName: profile.fullName.split(' ').slice(1).join(' '), color: crew?.color || '#59616d' }} size="lg" />
          <div>
            <div className="strong" style={{ fontSize: 18 }}>{profile.fullName}</div>
            <div className="muted">{profile.email || 'Compte local (sans Supabase)'}</div>
          </div>
        </div>
        <div className="form-grid">
          <Field label="Nom complet" hint="Affiché en haut à droite, comme gestionnaire de compte et dans le registre">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name.trim() !== profile.fullName && (updateMyProfile({ fullName: name.trim() }), toast('Nom enregistré'))} />
          </Field>
          <Field label="Adresse e-mail"><input className="input" value={profile.email || '—'} disabled /></Field>
          <Field label="Rôle utilisateur" hint={access.admin ? 'Modifiable dans « Utilisateurs »' : 'Modifiable par un administrateur'}><input className="input" value={access.roleName} disabled /></Field>
          <Field label="Membre du personnel lié" hint="Votre agenda, vos invitations et vos heures à enregistrer"><input className="input" value={crew ? personName(crew) : 'Aucun'} disabled /></Field>
          <Field label="Affichage"><Toggle checked={profile.preferences?.compact} onChange={(v) => setPreference('compact', v)} label="Mode compact" /></Field>
          <Field label="Documents"><Toggle checked={!profile.preferences?.docDialog?.skip} onChange={(v) => setPreference('docDialog', { ...(profile.preferences?.docDialog || {}), skip: !v })} label="Afficher la fenêtre « Générer » avant chaque devis ou facture" /></Field>
        </div>
      </Section>
      {DB_ENABLED && (
        <Section title="Mot de passe">
          <form className="form-grid" onSubmit={savePassword}>
            <Field label="Nouveau mot de passe"><input className="input" type="password" autoComplete="new-password" value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} /></Field>
            <Field label="Confirmer le mot de passe"><input className="input" type="password" autoComplete="new-password" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} /></Field>
            <div className="full"><button className="btn btn-primary" type="submit" disabled={busy || !pw.a}><Icon name="lock_reset" size={18} /> Changer le mot de passe</button></div>
          </form>
        </Section>
      )}
    </div>
  )
}

const LocalOnly = () => (
  <div className="card"><div className="card-body"><div className="row"><Icon name="cloud_off" size={19} /> Les comptes utilisateurs et les rôles nécessitent la base Supabase (<code>npm run db:start</code>).</div></div></div>
)

/** Comptes et rôles chargés depuis la base, rechargés à chaque action. */
function useAccounts() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const load = useCallback(() => fetchAccounts().then((d) => { setData(d); setError('') }).catch((e) => setError(e.message)), [])
  useEffect(() => {
    if (DB_ENABLED) load()
  }, [load])
  return { data, error, load }
}

const randomPassword = () => {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from(crypto.getRandomValues(new Uint32Array(10)), (n) => chars[n % chars.length]).join('')
}

// ---------- Utilisateurs (administrateurs) ----------
function UsersPanel() {
  const idx = useIdx()
  const me = useAuth((s) => s.profile)
  const { data, error, load } = useAccounts()
  const [creating, setCreating] = useState(false)
  const [pwFor, setPwFor] = useState(null)
  if (!DB_ENABLED) return <LocalOnly />
  const run = async (fn, msg) => {
    try {
      await fn()
      if (msg) toast(msg)
    } catch (e) {
      toast(e.message, 'error')
    }
    load()
  }
  const roleName = (id) => data?.roles.find((r) => r.id === id)?.name || id
  const pending = data?.profiles.filter((p) => !p.active) || []
  return (
    <div className="stack">
      {pending.length > 0 && (
        <div className="alert alert-warning">
          <Icon name="hourglass_top" size={18} />
          <span>{pending.length} compte(s) en attente : activez-les en leur attribuant un rôle.</span>
        </div>
      )}
      <Section title="Utilisateurs" action={<button className="btn btn-sm btn-primary" onClick={() => setCreating(true)}><Icon name="person_add" size={17} /> Ajouter un utilisateur</button>} bodyClass="card-body tight">
        {error && <div className="alert alert-danger" style={{ margin: 12 }}><Icon name="error" size={18} /> {error}</div>}
        {!data ? (
          <div className="muted" style={{ padding: 16 }}>Chargement…</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Nom</th><th>Rôle utilisateur</th><th>Membre du personnel</th><th>Statut</th><th>Dernière connexion</th><th /></tr></thead>
              <tbody>
                {data.profiles.map((p) => {
                  const self = p.id === me.id
                  return (
                    <tr key={p.id} className={p.active ? '' : 'pending-row'}>
                      <td>
                        <div className="strong">{p.fullName}{self && <span className="tag" style={{ marginLeft: 6 }}>Vous</span>}</div>
                        <div className="small muted">{p.email}</div>
                      </td>
                      <td>
                        <select className="select input-sm" style={{ maxWidth: 190 }} value={p.roleId} disabled={self} onChange={(e) => run(() => updateAccount(p.id, { roleId: e.target.value }), 'Rôle modifié')} aria-label={`Rôle de ${p.fullName}`}>
                          {data.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                      </td>
                      <td>
                        <select className="select input-sm" style={{ maxWidth: 200 }} value={p.crewId || ''} onChange={(e) => run(() => updateAccount(p.id, { crewId: e.target.value }), 'Membre du personnel lié')} aria-label={`Membre du personnel de ${p.fullName}`}>
                          <option value="">— Aucun —</option>
                          {idx.d.crew.map((c) => <option key={c.id} value={c.id}>{personName(c)}</option>)}
                        </select>
                      </td>
                      <td>
                        {p.active ? (
                          <Badge color="#19b26b">Actif</Badge>
                        ) : (
                          <button className="btn btn-sm btn-primary" onClick={() => run(() => updateAccount(p.id, { active: true, roleId: p.roleId }), `Compte de ${p.fullName} activé (${roleName(p.roleId)})`)}>Activer</button>
                        )}
                      </td>
                      <td className="small muted nowrap">{p.lastSeenAt ? fmtRelative(p.lastSeenAt) : 'Jamais'}</td>
                      <td className="right">
                        <Menu
                          trigger={<button className="btn btn-ghost btn-icon btn-sm" aria-label={`Options de ${p.fullName}`}><Icon name="more_vert" size={18} /></button>}
                          items={[
                            { icon: 'lock_reset', label: 'Définir un nouveau mot de passe', onClick: () => setPwFor(p) },
                            !self && p.active && { icon: 'block', label: 'Désactiver le compte', onClick: () => run(() => updateAccount(p.id, { active: false }), 'Compte désactivé') },
                            !self && '-',
                            !self && { icon: 'delete', label: 'Supprimer le compte', danger: true, onClick: () => confirm(`Supprimer définitivement le compte de ${p.fullName} ?`) && run(() => deleteAccount(p.id), 'Compte supprimé') },
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
      </Section>
      <p className="muted small" style={{ margin: 0 }}>Chaque compte a son propre tableau de bord, ses préférences et ses onglets récents. Les droits dépendent du rôle utilisateur.</p>
      {creating && data && <CreateUserModal roles={data.roles} idx={idx} onClose={() => setCreating(false)} onCreated={load} />}
      {pwFor && <PasswordModal account={pwFor} onClose={() => setPwFor(null)} />}
    </div>
  )
}

function CreateUserModal({ roles, idx, onClose, onCreated }) {
  const [f, setF] = useState({ fullName: '', email: '', password: randomPassword(), roleId: 'bureau', crewId: '' })
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const save = async () => {
    if (!f.fullName.trim() || !f.email.trim()) return toast('Indiquez le nom et l’adresse e-mail', 'error')
    if (f.password.length < 6) return toast('Le mot de passe doit contenir au moins 6 caractères', 'error')
    setBusy(true)
    try {
      await createAccount(f)
      toast(`Compte créé pour ${f.fullName} : communiquez-lui son mot de passe provisoire`)
      onCreated()
      onClose()
    } catch (e) {
      toast(e.message, 'error')
      setBusy(false)
    }
  }
  return (
    <Modal title="Ajouter un utilisateur" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn btn-primary" onClick={save} disabled={busy}>{busy && <Icon name="sync" size={18} className="spin" />} Créer le compte</button></>}>
      <div className="form-grid">
        <Field label="Nom complet *"><input className="input" value={f.fullName} onChange={set('fullName')} autoFocus /></Field>
        <Field label="Adresse e-mail *"><input className="input" type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Mot de passe provisoire" hint="L’utilisateur pourra le changer dans « Mon profil »">
          <div className="input-group">
            <input className="input mono" value={f.password} onChange={set('password')} />
            <button type="button" className="addon btn-addon" onClick={() => setF({ ...f, password: randomPassword() })} title="Générer un autre mot de passe"><Icon name="refresh" size={17} /></button>
          </div>
        </Field>
        <Field label="Rôle utilisateur">
          <select className="select" value={f.roleId} onChange={set('roleId')}>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
        </Field>
        <Field label="Membre du personnel lié" className="full" hint="Donne accès à son agenda, ses invitations et ses heures">
          <select className="select" value={f.crewId} onChange={(e) => {
            const c = idx.crew[e.target.value]
            setF({ ...f, crewId: e.target.value, fullName: f.fullName || (c ? personName(c) : ''), email: f.email || c?.email || '' })
          }}>
            <option value="">— Aucun —</option>
            {idx.d.crew.map((c) => <option key={c.id} value={c.id}>{personName(c)}</option>)}
          </select>
        </Field>
      </div>
    </Modal>
  )
}

function PasswordModal({ account, onClose }) {
  const [pw, setPw] = useState(randomPassword())
  const save = async () => {
    try {
      await setAccountPassword(account.id, pw)
      toast(`Nouveau mot de passe défini pour ${account.fullName}`)
      onClose()
    } catch (e) {
      toast(e.message, 'error')
    }
  }
  return (
    <Modal title={`Mot de passe de ${account.fullName}`} size="sm" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn btn-primary" onClick={save} disabled={pw.length < 6}>Définir</button></>}>
      <Field label="Nouveau mot de passe" hint="Communiquez-le à l’utilisateur : il pourra le changer dans « Mon profil »">
        <div className="input-group">
          <input className="input mono" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
          <button type="button" className="addon btn-addon" onClick={() => setPw(randomPassword())} title="Générer"><Icon name="refresh" size={17} /></button>
        </div>
      </Field>
    </Modal>
  )
}

// ---------- Rôles utilisateur (administrateurs) ----------
function RolesPanel() {
  const { data, error, load } = useAccounts()
  const [selId, setSelId] = useState(null)
  const [draft, setDraft] = useState(null)
  if (!DB_ENABLED) return <LocalOnly />
  if (!data) return <div className="card"><div className="card-body muted">{error || 'Chargement…'}</div></div>
  const roles = data.roles
  const sel = draft || roles.find((r) => r.id === selId) || roles[0]
  const users = (id) => data.profiles.filter((p) => p.roleId === id).length
  const edit = (patch) => setDraft({ ...sel, ...patch })
  const setLevel = (m, level) => edit({ permissions: { ...sel.permissions, modules: { ...(sel.permissions.modules || {}), [m]: level } } })
  const setAll = (level) => edit({ permissions: { ...sel.permissions, modules: Object.fromEntries(MODULES.map((m) => [m.id, level])) } })
  const dirty = Boolean(draft)
  const choose = (id) => {
    if (dirty && !confirm('Abandonner les modifications de ce rôle ?')) return
    setDraft(null)
    setSelId(id)
  }
  const save = async () => {
    try {
      await saveRole(sel)
      toast(`Rôle « ${sel.name} » enregistré`)
      setDraft(null)
      setSelId(sel.id)
      load()
    } catch (e) {
      toast(e.message, 'error')
    }
  }
  const add = () => {
    if (dirty && !confirm('Abandonner les modifications de ce rôle ?')) return
    setDraft({ id: uid('role_'), name: 'Nouveau rôle', isSystem: false, sort: roles.length + 1, permissions: { finances: false, manageUsers: false, modules: { dashboard: 'modification', agenda: 'lecture' } } })
  }
  const remove = async () => {
    if (!confirm(`Supprimer le rôle « ${sel.name} » ?`)) return
    try {
      await deleteRole(sel.id)
      toast('Rôle supprimé')
      setDraft(null)
      setSelId(null)
      load()
    } catch (e) {
      toast(e.message, 'error')
    }
  }
  const isNew = !roles.some((r) => r.id === sel.id)
  return (
    <div className="split" style={{ gridTemplateColumns: '260px minmax(0, 1fr)' }}>
      <div className="card">
        <div className="card-header"><span className="section-title">Rôles</span><div className="actions"><button className="btn-link" onClick={add}><Icon name="add" size={17} /> Ajouter</button></div></div>
        <div className="list">
          {roles.map((r) => (
            <div key={r.id} className={`list-item clickable ${sel.id === r.id ? 'active-item' : ''}`} onClick={() => choose(r.id)}>
              <Icon name={r.permissions.manageUsers ? 'admin_panel_settings' : 'badge'} size={19} style={{ color: 'var(--muted)' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="title">{r.name}</div>
                <div className="meta">{users(r.id)} utilisateur(s){r.isSystem ? ' · rôle par défaut' : ''}</div>
              </div>
            </div>
          ))}
          {isNew && <div className="list-item active-item"><Icon name="badge" size={19} /><div className="title">{sel.name}</div></div>}
        </div>
      </div>
      <div className="card">
        <div className="card-header">
          <input className="input group-title" style={{ fontSize: 17, maxWidth: 360 }} value={sel.name} onChange={(e) => edit({ name: e.target.value })} aria-label="Nom du rôle" />
          <div className="actions">
            {!sel.isSystem && !isNew && <button className="btn btn-sm btn-danger" onClick={remove}><Icon name="delete" size={17} /> Supprimer</button>}
            {dirty && <button className="btn btn-sm" onClick={() => setDraft(null)}>Annuler</button>}
            <button className="btn btn-sm btn-primary" onClick={save} disabled={!dirty}><Icon name="save" size={17} /> Enregistrer</button>
          </div>
        </div>
        <div className="card-body stack" style={{ gap: 10 }}>
          <Toggle checked={sel.permissions.finances} onChange={(v) => edit({ permissions: { ...sel.permissions, finances: v } })} label="Visibilité des finances (prix, totaux, devis, factures, statistiques)" />
          <Toggle checked={sel.permissions.manageUsers} onChange={(v) => edit({ permissions: { ...sel.permissions, manageUsers: v } })} label="Gérer les comptes utilisateurs et les rôles" />
          {sel.id === 'poweruser' && <div className="small muted">Le rôle PowerUser donne normalement tous les droits. Il doit toujours rester au moins un administrateur actif.</div>}
        </div>
        <div className="table-wrap">
          <table className="table table-compact perm-table">
            <thead>
              <tr>
                <th>Module</th>
                {LEVELS.map((l) => <th key={l.id} className="center"><button className="btn-link" onClick={() => setAll(l.id)} title={`Tout mettre en « ${l.label} »`}>{l.label}</button></th>)}
              </tr>
            </thead>
            <tbody>
              {MODULES.map((m) => {
                const level = sel.permissions.modules?.[m.id] || 'aucun'
                return (
                  <tr key={m.id}>
                    <td><span className="row" style={{ gap: 8 }}><Icon name={m.icon} size={18} style={{ color: 'var(--muted)' }} /> {m.label}</span></td>
                    {LEVELS.map((l) => (
                      <td key={l.id} className="center">
                        <input type="radio" name={`perm-${m.id}`} checked={level === l.id} onChange={() => setLevel(m.id, l.id)} aria-label={`${m.label} : ${l.label}`} />
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
