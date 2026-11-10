import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useIdx, useStore, toast } from '../../store'
import { Badge, ColorPicker, Empty, Field, Icon, NumInput, Section, TagInput, Toggle } from '../../components/ui'
import { DB_ENABLED } from '../../lib/db'
import { fetchAccounts } from '../../lib/auth'
import { DEFAULT_SETTINGS } from '../../lib/seed'
import { PROJECT_STATUSES } from '../../lib/model'
import { uid } from '../../lib/utils'

const useSettings = () => {
  const { settings, updateSettings } = useStore()
  return { settings, set: updateSettings }
}
/** Réglage composé : valeurs par défaut complétées par celles de l'espace de travail. */
export const settingObject = (settings, key) => ({ ...DEFAULT_SETTINGS[key], ...(settings[key] || {}) })

/** Liste éditable enregistrée dans les réglages (régimes de TVA, types d'inspection…). */
function SettingsList({ title, keyName, columns, make, help, defaultKey, onDefault }) {
  const { settings, set } = useSettings()
  const rows = settings[keyName] || []
  const patchRow = (id, patch) => set({ [keyName]: rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) })
  return (
    <Section title={title} action={<button className="btn btn-sm btn-primary" onClick={() => set({ [keyName]: [...rows, make()] })}><Icon name="add" size={17} /> Ajouter</button>} bodyClass="card-body tight">
      {help && <p className="muted small" style={{ margin: '12px 16px' }}>{help}</p>}
      {rows.length === 0 ? (
        <Empty title="Liste vide" text="Ajoutez un premier élément." />
      ) : (
        <div className="table-wrap">
          <table className="table table-compact">
            <thead><tr>{defaultKey && <th className="center">Par défaut</th>}{columns.map((c) => <th key={c.key} className={c.type === 'number' ? 'num' : ''}>{c.label}</th>)}<th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  {defaultKey && <td className="center"><input type="radio" name={`def-${keyName}`} checked={settings[defaultKey] === r.id} onChange={() => set({ [defaultKey]: r.id, ...(onDefault?.(r) || {}) })} aria-label="Par défaut" /></td>}
                  {columns.map((c) => (
                    <td key={c.key} className={c.type === 'number' ? 'num' : ''}>
                      {c.type === 'number' ? (
                        <NumInput style={{ width: 90 }} value={r[c.key]} onChange={(v) => patchRow(r.id, { [c.key]: v, ...(settings[defaultKey] === r.id && onDefault ? onDefault({ ...r, [c.key]: v }) : {}) })} />
                      ) : c.type === 'select' ? (
                        <select className="select input-sm" style={{ width: c.width || 150 }} value={r[c.key]} onChange={(e) => patchRow(r.id, { [c.key]: e.target.value })} aria-label={c.label}>
                          {c.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      ) : (
                        <input className="input input-sm" style={{ maxWidth: 'none', minWidth: c.width || 160 }} value={r[c.key] ?? ''} onChange={(e) => patchRow(r.id, { [c.key]: e.target.value })} aria-label={c.label} />
                      )}
                    </td>
                  ))}
                  <td className="right">
                    <button className="btn btn-ghost btn-icon btn-sm" disabled={defaultKey && settings[defaultKey] === r.id} title={defaultKey && settings[defaultKey] === r.id ? 'Élément par défaut' : 'Supprimer'} onClick={() => set({ [keyName]: rows.filter((x) => x.id !== r.id) })} aria-label="Supprimer"><Icon name="delete" size={17} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  )
}

const text = (settings, set, k) => ({ value: settings[k] ?? '', onChange: (e) => set({ [k]: e.target.value }) })

// ====================================================================== Compte

export function PaymentInfo() {
  const { settings, set } = useSettings()
  return (
    <div className="stack">
      <Section title="Coordonnées bancaires">
        <div className="form-grid">
          <Field label="IBAN" className="full"><input className="input mono" {...text(settings, set, 'iban')} /></Field>
          <Field label="BIC"><input className="input mono" {...text(settings, set, 'bic')} /></Field>
          <Field label="Banque"><input className="input" {...text(settings, set, 'bankName')} /></Field>
          <Field label="Titulaire du compte" className="full"><input className="input" {...text(settings, set, 'accountHolder')} /></Field>
        </div>
      </Section>
      <Section title="Moyens de paiement acceptés">
        <TagInput value={settings.paymentMethods || []} onChange={(paymentMethods) => set({ paymentMethods })} placeholder="Ajouter un moyen de paiement" />
        <p className="muted small" style={{ marginBottom: 0 }}>Proposés lors de l’enregistrement d’un paiement et imprimés en pied de facture avec les coordonnées bancaires.</p>
      </Section>
    </div>
  )
}

export function License() {
  const { settings } = useSettings()
  const [counts, setCounts] = useState(null)
  useEffect(() => {
    if (!DB_ENABLED) return
    fetchAccounts()
      .then(({ profiles, roles }) => {
        const admin = (p) => roles.find((r) => r.id === p.roleId)?.permissions?.manageUsers
        setCounts({ total: profiles.length, active: profiles.filter((p) => p.active).length, power: profiles.filter((p) => p.active && admin(p)).length, pending: profiles.filter((p) => !p.active).length })
      })
      .catch(() => setCounts(null))
  }, [])
  const ext = settingObject(settings, 'extensions')
  const active = EXTENSIONS.filter((e) => ext[e.id])
  return (
    <div className="stack">
      <Section title="Votre licence">
        <div className="license-head">
          <span className="license-badge"><Icon name="verified" size={26} /></span>
          <div>
            <div className="strong" style={{ fontSize: 18 }}>RentPlan — installation auto-hébergée</div>
            <div className="muted">Aucune limite de comptes, de PowerUsers ni de modules.</div>
          </div>
        </div>
        <div className="grid grid-4" style={{ marginTop: 18 }}>
          <div className="stat-tile"><span>Comptes actifs</span><strong>{counts ? counts.active : '—'}</strong></div>
          <div className="stat-tile"><span>Administrateurs</span><strong>{counts ? counts.power : '—'}</strong></div>
          <div className="stat-tile"><span>En attente d’activation</span><strong>{counts ? counts.pending : '—'}</strong></div>
          <div className="stat-tile"><span>Extensions actives</span><strong>{active.length} / {EXTENSIONS.length}</strong></div>
        </div>
      </Section>
      <Section title="Base de données">
        <div className="row"><Icon name={DB_ENABLED ? 'cloud_done' : 'cloud_off'} size={19} style={{ color: DB_ENABLED ? 'var(--success)' : 'var(--muted)' }} /> {DB_ENABLED ? 'Supabase (Postgres local dans Docker), synchronisé en temps réel.' : 'Données enregistrées dans ce navigateur.'}</div>
      </Section>
    </div>
  )
}

export function MyInvoices() {
  return (
    <div className="card">
      <Empty icon="receipt_long" title="Aucune facture d’abonnement" text="RentPlan est installé sur votre propre serveur : aucun abonnement ne vous est facturé." action={<Link className="btn" to="/finances?tab=factures"><Icon name="monetization_on" size={18} /> Voir les factures de vos clients</Link>} />
    </div>
  )
}

export const EXTENSIONS = [
  { id: 'finances', icon: 'monetization_on', name: 'Devis & factures', text: 'Devis, contrats, factures, notes de crédit et bons de commande (module Finances).' },
  { id: 'heures', icon: 'watch_later', name: 'Enregistrement horaire', text: 'Pointage, heures travaillées, activités planifiées et demandes de congé.' },
  { id: 'demandes', icon: 'move_to_inbox', name: 'Demandes de location', text: 'Demandes reçues depuis votre site, transformées en projets en un clic.' },
  { id: 'maintenance', icon: 'build', name: 'Suivi & maintenance du matériel', text: 'Réparations, inspections périodiques et équipements perdus.' },
]

export function Extensions() {
  const { settings, set } = useSettings()
  const ext = settingObject(settings, 'extensions')
  return (
    <div className="stack">
      <p className="muted" style={{ margin: 0 }}>Une extension désactivée disparaît du menu et du tableau de bord pour tous les comptes ; ses données sont conservées.</p>
      <div className="ext-grid">
        {EXTENSIONS.map((e) => (
          <div key={e.id} className={`card ext-card ${ext[e.id] ? 'on' : ''}`}>
            <span className="ext-icon"><Icon name={e.icon} size={24} /></span>
            <div style={{ flex: 1 }}>
              <div className="strong">{e.name}</div>
              <div className="small muted">{e.text}</div>
            </div>
            <Toggle checked={ext[e.id]} onChange={(v) => { set({ extensions: { ...ext, [e.id]: v } }); toast(`${e.name} ${v ? 'activée' : 'désactivée'}`) }} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ====================================================================== Paramètres

const TIMEZONES = ['Europe/Paris', 'Europe/Brussels', 'Europe/Luxembourg', 'Europe/Zurich', 'America/Montreal', 'America/Guadeloupe', 'Indian/Reunion', 'Pacific/Noumea']
const COUNTRIES = ['France', 'Belgique', 'Luxembourg', 'Suisse', 'Canada', 'Monaco']
const hours = Array.from({ length: 24 }, (_, h) => h)

export function TimeAndPlace() {
  const { settings, set } = useSettings()
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000)
    return () => clearInterval(t)
  }, [])
  const now = new Intl.DateTimeFormat('fr-FR', { timeZone: settings.timezone || 'Europe/Paris', dateStyle: 'full', timeStyle: 'short' }).format(new Date())
  return (
    <div className="stack">
      <Section title="Heure et lieu">
        <div className="form-grid">
          <Field label="Fuseau horaire" hint={`Il est actuellement : ${now}`}>
            <select className="select" value={settings.timezone || 'Europe/Paris'} onChange={(e) => set({ timezone: e.target.value })}>{TIMEZONES.map((z) => <option key={z} value={z}>{z.replace('_', ' ')}</option>)}</select>
          </Field>
          <Field label="Pays" hint="Pays par défaut des nouveaux contacts">
            <select className="select" value={settings.country || 'France'} onChange={(e) => set({ country: e.target.value })}>{COUNTRIES.map((c) => <option key={c}>{c}</option>)}</select>
          </Field>
        </div>
      </Section>
      <Section title="Horaires par défaut des nouveaux projets">
        <div className="form-grid">
          <Field label="Début de la période d’utilisation">
            <select className="select" value={settings.defaultStartHour ?? 9} onChange={(e) => set({ defaultStartHour: Number(e.target.value) })}>{hours.map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}</select>
          </Field>
          <Field label="Fin de la période d’utilisation">
            <select className="select" value={settings.defaultEndHour ?? 23} onChange={(e) => set({ defaultEndHour: Number(e.target.value) })}>{hours.map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}</select>
          </Field>
        </div>
        <p className="muted small" style={{ marginBottom: 0 }}>La période de planification commence la veille à 8 h et se termine le lendemain à midi, pour le chargement et le retour du matériel.</p>
      </Section>
    </div>
  )
}

export function ProjectTemplates() {
  const idx = useIdx()
  const { settings, set } = useSettings()
  const list = settings.projectTemplates || []
  const [openId, setOpenId] = useState(list[0]?.id || null)
  const [addEq, setAddEq] = useState('')
  const patch = (id, p) => set({ projectTemplates: list.map((t) => (t.id === id ? { ...t, ...p } : t)) })
  const add = () => {
    const t = { id: uid('tpl_'), name: 'Nouveau modèle', typeId: '', venueId: null, color: null, status: 'concept', days: 1, prepDays: 1, returnDays: 1, items: [], functions: [], costs: [] }
    set({ projectTemplates: [...list, t] })
    setOpenId(t.id)
  }
  return (
    <div className="stack">
      <div className="row">
        <p className="muted" style={{ margin: 0, flex: 1 }}>Un modèle pré-remplit le type, le lieu, la couleur, le planning, le matériel, les fonctions et les coûts d’un nouveau projet. Choisissez-le dans la fenêtre « Modèles de projets » à la création.</p>
        <button className="btn btn-primary" onClick={add}><Icon name="add" /> Modèle de projet</button>
      </div>
      {list.length === 0 && <div className="card"><Empty icon="content_copy" title="Aucun modèle de projet" /></div>}
      {list.map((t) => {
        const open = openId === t.id
        return (
          <div key={t.id} className={`card tpl-card ${open ? 'open' : ''}`}>
            <button className="tpl-head" onClick={() => setOpenId(open ? null : t.id)}>
              <Icon name="content_copy" size={20} style={{ color: 'var(--primary)' }} />
              <span className="strong" style={{ flex: 1 }}>{t.name}</span>
              <span className="small muted">{t.items.length} équipement(s) · {t.functions.length} fonction(s){(t.costs || []).length ? ` · ${t.costs.length} coût(s)` : ''} · {t.days ?? 1} jour(s)</span>
              <Icon name="expand_more" className="tpl-chevron" />
            </button>
            <div className="collapse-anim"><div>
              <div className="card-body stack" style={{ gap: 14, borderTop: '1px solid var(--border)' }}>
                <div className="form-grid">
                  <Field label="Nom du modèle"><input className="input" value={t.name} onChange={(e) => patch(t.id, { name: e.target.value })} /></Field>
                  <Field label="Type de projet">
                    <select className="select" value={t.typeId || ''} onChange={(e) => patch(t.id, { typeId: e.target.value })}>
                      <option value="">— Aucun —</option>
                      {idx.d.projectTypes.map((pt) => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Lieu de la prestation">
                    <select className="select" value={t.venueId || ''} onChange={(e) => patch(t.id, { venueId: e.target.value || null })}>
                      <option value="">— Aucun —</option>
                      {idx.d.contacts.filter((c) => c.type === 'lieu').map((c) => <option key={c.id} value={c.id}>{c.company || `${c.firstName} ${c.lastName}`}</option>)}
                    </select>
                  </Field>
                  <Field label="Statut à la création">
                    <select className="select" value={t.status || 'concept'} onChange={(e) => patch(t.id, { status: e.target.value })}>
                      {PROJECT_STATUSES.map((st) => <option key={st.id} value={st.id}>{st.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Couleur" className="full"><ColorPicker value={t.color || null} onChange={(color) => patch(t.id, { color })} /></Field>
                </div>
                <div>
                  <div className="kpi-label" style={{ marginBottom: 6 }}>Planning (calculé à partir de la date de début choisie à la création)</div>
                  <div className="form-grid form-grid-4">
                    <Field label="Durée d’utilisation" hint="En jours"><NumInput className="input input-num" value={t.days ?? 1} onChange={(v) => patch(t.id, { days: Math.max(1, Math.round(v) || 1) })} /></Field>
                    <Field label="Heure de début"><select className="select" value={t.startHour ?? settings.defaultStartHour ?? 9} onChange={(e) => patch(t.id, { startHour: Number(e.target.value) })}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}</select></Field>
                    <Field label="Heure de fin"><select className="select" value={t.endHour ?? settings.defaultEndHour ?? 23} onChange={(e) => patch(t.id, { endHour: Number(e.target.value) })}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}</select></Field>
                    <Field label="Préparation / retour" hint="Jours avant / après"><span className="row" style={{ gap: 6 }}><NumInput className="input input-num" value={t.prepDays ?? 1} onChange={(v) => patch(t.id, { prepDays: Math.max(0, Math.round(v) || 0) })} /><NumInput className="input input-num" value={t.returnDays ?? 1} onChange={(v) => patch(t.id, { returnDays: Math.max(0, Math.round(v) || 0) })} /></span></Field>
                  </div>
                </div>
                <div>
                  <div className="kpi-label" style={{ marginBottom: 6 }}>Matériel</div>
                  {t.items.map((it, i) => (
                    <div key={it.equipmentId} className="row" style={{ marginBottom: 6 }}>
                      <span style={{ flex: 1 }}>{idx.eq[it.equipmentId]?.name || it.equipmentId}</span>
                      <NumInput style={{ width: 70 }} value={it.quantity} onChange={(v) => patch(t.id, { items: t.items.map((x, j) => (j === i ? { ...x, quantity: Math.max(1, Math.round(v)) } : x)) })} />
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => patch(t.id, { items: t.items.filter((_, j) => j !== i) })} aria-label="Retirer"><Icon name="delete" size={17} /></button>
                    </div>
                  ))}
                  <div className="row">
                    <select className="select input-sm" style={{ maxWidth: 360 }} value={addEq} onChange={(e) => setAddEq(e.target.value)} aria-label="Équipement">
                      <option value="">Ajouter un équipement…</option>
                      {idx.d.equipment.filter((e) => !e.archived && e.type !== 'case' && !t.items.some((x) => x.equipmentId === e.id)).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                    <button className="btn btn-sm" disabled={!addEq} onClick={() => { patch(t.id, { items: [...t.items, { equipmentId: addEq, quantity: 1 }] }); setAddEq('') }}><Icon name="add" size={17} /> Ajouter</button>
                  </div>
                </div>
                <div>
                  <div className="kpi-label" style={{ marginBottom: 6 }}>Fonctions (depuis les fonctions par défaut)</div>
                  <div className="chips">
                    {idx.d.defaultFunctions.map((f) => {
                      const on = t.functions.includes(f.id)
                      return <button key={f.id} className={`chip ${on ? 'on' : ''}`} onClick={() => patch(t.id, { functions: on ? t.functions.filter((x) => x !== f.id) : [...t.functions, f.id] })}><Icon name={f.kind === 'transport' ? 'local_shipping' : 'people'} size={16} /> {f.name}</button>
                    })}
                  </div>
                </div>
                <div>
                  <div className="kpi-label" style={{ marginBottom: 6 }}>Coûts supplémentaires (depuis les coûts par défaut)</div>
                  <div className="chips">
                    {idx.d.defaultCosts.map((c) => {
                      const on = (t.costs || []).includes(c.id)
                      return <button key={c.id} className={`chip ${on ? 'on' : ''}`} onClick={() => patch(t.id, { costs: on ? t.costs.filter((x) => x !== c.id) : [...(t.costs || []), c.id] })}><Icon name="receipt_long" size={16} /> {c.name}</button>
                    })}
                    {!idx.d.defaultCosts.length && <span className="muted small">Aucun coût par défaut (Configuration › Coûts supplémentaires par défaut).</span>}
                  </div>
                </div>
                <div><button className="btn btn-sm btn-danger" onClick={() => confirm(`Supprimer le modèle « ${t.name} » ?`) && set({ projectTemplates: list.filter((x) => x.id !== t.id) })}><Icon name="delete" size={17} /> Supprimer le modèle</button></div>
              </div>
            </div></div>
          </div>
        )
      })}
    </div>
  )
}

export function InspectionTypes() {
  return (
    <SettingsList
      title="Types d’inspection périodique"
      keyName="inspectionTypes"
      help="Proposés lors de la planification d’une inspection (Maintenance › Inspections périodiques) : le nom et la fréquence sont repris automatiquement."
      make={() => ({ id: uid('it_'), name: 'Nouvelle inspection', intervalMonths: 12, description: '' })}
      columns={[{ key: 'name', label: 'Nom', width: 240 }, { key: 'intervalMonths', label: 'Fréquence (mois)', type: 'number' }, { key: 'description', label: 'Description', width: 260 }]}
    />
  )
}

export function TimeSettings() {
  const { settings, set } = useSettings()
  const num = (k) => ({ value: settings[k], onChange: (v) => set({ [k]: Math.max(0, Math.round(v)) }) })
  return (
    <Section title="Enregistrement horaire">
      <div className="form-grid form-grid-3">
        <Field label="Pause par défaut (minutes)" hint="Pré-remplie à chaque nouvel enregistrement"><NumInput className="input input-num" {...num('defaultBreakMinutes')} /></Field>
        <Field label="Temps de trajet par défaut (minutes)"><NumInput className="input input-num" {...num('defaultTravelMinutes')} /></Field>
        <Field label="Congés annuels (jours)" hint="Solde affiché dans les demandes de congé"><NumInput className="input input-num" {...num('annualLeaveDays')} /></Field>
      </div>
    </Section>
  )
}

export const WAREHOUSE_STATUS_INFO = [
  ['aPreparer', '#8a929c', 'Matériel planifié qui n’a pas encore été préparé.'],
  ['pret', '#1f87e5', 'Préparé à l’entrepôt, prêt à partir.'],
  ['surSite', '#0e9f9a', 'Sorti de l’entrepôt et présent sur le lieu du projet.'],
  ['retourne', '#5f6b7a', 'Revenu à l’entrepôt après le projet.'],
  ['perdu', '#e2284f', 'Non revenu : signalé dans Maintenance › Équipements perdus.'],
]

export function WarehouseStatuses() {
  const { settings, set } = useSettings()
  const labels = settingObject(settings, 'warehouseLabels')
  return (
    <div className="stack">
      <Section title="Statuts d’entrepôt" bodyClass="card-body tight">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th style={{ width: 60 }} /><th>Libellé</th><th>Signification</th></tr></thead>
            <tbody>
              {WAREHOUSE_STATUS_INFO.map(([k, color, desc]) => (
                <tr key={k}>
                  <td><span className="color-dot big" style={{ background: color }} /></td>
                  <td><input className="input input-sm" style={{ maxWidth: 220 }} value={labels[k]} onChange={(e) => set({ warehouseLabels: { ...labels, [k]: e.target.value } })} aria-label="Libellé" /></td>
                  <td className="muted">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <Section title="Automatisation">
        <Toggle checked={settings.autoWarehouseStatus} onChange={(v) => set({ autoWarehouseStatus: v })} label="Changer automatiquement le statut du projet quand tout le matériel est prêt, sur site ou retourné" />
      </Section>
      <ReturnFeesSettings />
    </div>
  )
}

/** Frais proposés au retour du matériel (onglet « Préparation & retour » des projets). */
function ReturnFeesSettings() {
  const { settings, set } = useSettings()
  const fees = settingObject(settings, 'returnFees')
  const setFee = (k) => (v) => set({ returnFees: { ...fees, [k]: Math.max(0, Number(v) || 0) } })
  return (
    <Section title="Frais de retour">
      <p className="muted small" style={{ marginTop: 0 }}>Montants proposés quand du matériel revient sale, abîmé, perdu ou en retard. Ils restent modifiables frais par frais avant d’être facturés ; le remplacement d’un article perdu reprend son prix d’achat.</p>
      <div className="form-grid form-grid-3">
        <Field label="Nettoyage (€ HT / unité)"><NumInput className="input input-num" value={fees.nettoyage} onChange={setFee('nettoyage')} /></Field>
        <Field label="Entretien (€ HT / unité)"><NumInput className="input input-num" value={fees.entretien} onChange={setFee('entretien')} /></Field>
        <Field label="Réparation (€ HT / unité)"><NumInput className="input input-num" value={fees.maintenance} onChange={setFee('maintenance')} /></Field>
        <Field label="Retard (% du tarif journalier)" hint="Par jour de retard, sur le matériel sorti"><NumInput className="input input-num" value={fees.retardPct} onChange={setFee('retardPct')} /></Field>
        <Field label="Marge avant retard (heures)" hint="Un retour dans ce délai n’est pas compté en retard"><NumInput className="input input-num" value={fees.graceHours} onChange={setFee('graceHours')} /></Field>
      </div>
    </Section>
  )
}

export function CustomFieldsSettings() {
  return (
    <SettingsList
      title="Champs de saisie supplémentaires"
      keyName="customFields"
      help="Ces champs apparaissent dans l’onglet Général des projets, dans la fiche des équipements et dans celle des contacts."
      make={() => ({ id: uid('cf_'), entity: 'projet', label: 'Nouveau champ', type: 'texte' })}
      columns={[
        { key: 'entity', label: 'Module', type: 'select', options: [['projet', 'Projets'], ['equipement', 'Équipements'], ['contact', 'Contacts']] },
        { key: 'label', label: 'Libellé', width: 240 },
        { key: 'type', label: 'Type', type: 'select', options: [['texte', 'Texte'], ['nombre', 'Nombre'], ['date', 'Date'], ['case', 'Case à cocher']] },
      ]}
    />
  )
}

// ====================================================================== Communication client

const PLACEHOLDERS = '{document} {numéro} {projet} {client} {prénom}'

export function Communication() {
  const { settings, set } = useSettings()
  const m = settingObject(settings, 'emailSettings')
  const f = (k) => ({ value: m[k] ?? '', onChange: (e) => set({ emailSettings: { ...m, [k]: e.target.value } }) })
  return (
    <div className="stack">
      <Section title="E-mails envoyés aux clients">
        <div className="form-grid">
          <Field label="Nom de l’expéditeur"><input className="input" {...f('senderName')} /></Field>
          <Field label="Adresse de réponse"><input className="input" type="email" {...f('replyTo')} /></Field>
          <Field label="Objet" className="full" hint={`Variables : ${PLACEHOLDERS}`}><input className="input" {...f('subject')} /></Field>
          <Field label="Message" className="full"><textarea className="textarea" rows={4} {...f('body')} /></Field>
          <Field label="Signature" className="full"><textarea className="textarea" rows={3} {...f('signature')} /></Field>
        </div>
      </Section>
      <p className="muted small" style={{ margin: 0 }}>Utilisé par « Envoyer par e-mail » sur les devis et factures : votre messagerie s’ouvre avec l’objet du modèle de document, la formule d’appel, le message et la signature.</p>
      <DigitalSignature />
    </div>
  )
}

/** Signature digitale (Rentman : Configuration › Communication client › Communication). */
function DigitalSignature() {
  const { settings, set } = useSettings()
  const d = settingObject(settings, 'digitalSignature')
  const patch = (p) => set({ digitalSignature: { ...d, ...p } })
  const yesNo = (k) => (
    <select className="select" value={d[k] ? '1' : '0'} onChange={(e) => patch({ [k]: e.target.value === '1' })}>
      <option value="1">Oui</option>
      <option value="0">Non</option>
    </select>
  )
  return (
    <Section title="Signature digitale">
      <div className="form-grid">
        <Field label="Laisser le client signer numériquement">{yesNo('enabled')}</Field>
        <Field label="Le client peut ajouter des commentaires">{yesNo('allowComments')}</Field>
        <Field label="Le client peut signer des documents expirés">{yesNo('allowExpired')}</Field>
        <Field label="Logo de la page de signature" hint="URL d’une image ; à défaut, le logo de l’entreprise"><input className="input" value={d.logoUrl || ''} onChange={(e) => patch({ logoUrl: e.target.value })} placeholder="https://…/logo.png" /></Field>
      </div>
      <p className="muted small" style={{ marginBottom: 0 }}>Ajoutez le module « Signature numérique » à un modèle de devis ou de contrat : le client clique sur le bouton, signe en ligne, le document passe à « Accepté » et le projet d’Option à Confirmé.</p>
    </Section>
  )
}

export function Salutation() {
  const { settings, set } = useSettings()
  const s = settingObject(settings, 'salutation')
  const f = (k) => ({ value: s[k] ?? '', onChange: (e) => set({ salutation: { ...s, [k]: e.target.value } }) })
  const sample = s.usePersonal ? s.personal.replace('{prénom}', 'Camille').replace('{nom}', 'Martin') : s.formal
  return (
    <div className="grid grid-side" style={{ gridTemplateColumns: 'minmax(0,1fr) 380px' }}>
      <Section title="Formule d’appel">
        <div className="stack" style={{ gap: 14 }}>
          <Field label="Formule générale"><input className="input" {...f('formal')} /></Field>
          <Field label="Formule personnalisée" hint="Variables : {prénom} {nom} de la personne de contact du projet"><input className="input" {...f('personal')} /></Field>
          <Toggle checked={s.usePersonal} onChange={(v) => set({ salutation: { ...s, usePersonal: v } })} label="Utiliser la formule personnalisée quand une personne de contact est connue" />
          <Field label="Phrase de conclusion"><input className="input" {...f('closing')} /></Field>
          <Field label="Formule de politesse"><input className="input" {...f('politeness')} /></Field>
        </div>
      </Section>
      <div className="card">
        <div className="card-header"><span className="section-title">Aperçu</span></div>
        <div className="card-body salutation-preview">
          <p>{sample}</p>
          <p className="muted">Suite à votre demande, nous avons le plaisir de vous adresser notre proposition.</p>
          <p>{s.closing}</p>
          <p>{s.politeness}<br /><strong>{settings.companyName}</strong></p>
        </div>
      </div>
    </div>
  )
}

// ====================================================================== Finance

export function EInvoicing() {
  const { settings, set } = useSettings()
  const e = settingObject(settings, 'einvoice')
  const patch = (p) => set({ einvoice: { ...e, ...p } })
  return (
    <div className="stack">
      <Section title="Facturation numérique">
        <div className="stack" style={{ gap: 14 }}>
          <Toggle checked={e.enabled} onChange={(v) => patch({ enabled: v })} label="Générer des factures électroniques" />
          <div className="form-grid">
            <Field label="Format"><select className="select" value={e.format} onChange={(ev) => patch({ format: ev.target.value })}><option>UBL 2.1</option></select></Field>
            <Field label="Plateforme de dématérialisation (PDP)" hint="Indiquée dans le fichier exporté"><input className="input" value={e.platform} onChange={(ev) => patch({ platform: ev.target.value })} placeholder="Ex. Chorus Pro" /></Field>
          </div>
          <Toggle checked={e.buyerReference} onChange={(v) => patch({ buyerReference: v })} label="Reprendre la référence externe du projet comme référence acheteur" />
        </div>
      </Section>
      <div className="alert alert-info"><Icon name="info" size={18} /><span>Une fois activée, chaque facture et note de crédit propose « Facture électronique (UBL) » : un fichier XML conforme à la norme européenne EN 16931, à déposer sur votre plateforme.</span></div>
    </div>
  )
}

export function VatRegimes() {
  return (
    <SettingsList
      title="Régimes de TVA"
      keyName="vatRegimes"
      defaultKey="vatRegimeId"
      onDefault={(r) => ({ vatRate: Number(r.rate) || 0 })}
      help="Le régime par défaut fixe le taux de TVA des nouveaux devis et factures ; sa mention légale est imprimée sur les documents concernés."
      make={() => ({ id: uid('tva_'), name: 'Nouveau régime', rate: 20, mention: '' })}
      columns={[{ key: 'name', label: 'Nom', width: 200 }, { key: 'rate', label: 'Taux (%)', type: 'number' }, { key: 'mention', label: 'Mention légale', width: 300 }]}
    />
  )
}

export function PaymentTerms() {
  return (
    <SettingsList
      title="Conditions de paiement"
      keyName="paymentTerms"
      defaultKey="paymentTermId"
      onDefault={(t) => ({ paymentTermDays: Math.max(0, Math.round(Number(t.days) || 0)) })}
      help="Les conditions par défaut fixent l’échéance des nouvelles factures (un contact peut avoir son propre délai)."
      make={() => ({ id: uid('pt_'), name: 'Nouvelles conditions', days: 30 })}
      columns={[{ key: 'name', label: 'Nom', width: 240 }, { key: 'days', label: 'Délai (jours)', type: 'number' }]}
    />
  )
}

export function ExtraConditions() {
  const { settings, set } = useSettings()
  return (
    <Section title="Conditions supplémentaires">
      <div className="form-grid">
        <Field label="Conditions des devis et contrats" className="full"><textarea className="textarea" rows={5} {...text(settings, set, 'quoteTerms')} /></Field>
        <Field label="Conditions des factures" className="full"><textarea className="textarea" rows={5} {...text(settings, set, 'invoiceTerms')} /></Field>
      </div>
      <p className="muted small" style={{ marginBottom: 0 }}>Reprises à la création de chaque document, puis modifiables document par document. <Badge color="#1f87e5" dot={false}>Astuce</Badge> des conditions propres à un projet se saisissent dans son onglet Finances.</p>
    </Section>
  )
}
