import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useIdx, useRecent, useStore, toast } from '../store'
import { Badge, Empty, Field, Icon, Kpi, Menu, Modal, NumInput, Section, Tabs, TagInput, Toggle } from '../components/ui'
import NotFound from './NotFound'
import QrCode from '../components/QrCode'
import EquipmentTimeline from '../components/EquipmentTimeline'
import CustomFields from '../components/CustomFields'
import EquipmentImages from '../components/EquipmentImages'
import { useAccess } from '../lib/auth'
import { removeStoredFiles } from '../lib/db'
import { useTrackRecent } from '../components/useTrackRecent'
import { EQUIPMENT_TYPES } from './Equipment'
import { available, groupTimes, stockOf, statusOf, subWarehouse } from '../lib/model'
import { SERIAL_STATES, SERIAL_STATUSES, serialHistory, serialState } from '../lib/serials'
import SerialStateBadge from '../components/SerialStateBadge'
import { addDays, contactName, fmtDate, fmtMoney, fmtRange, parse, startOfDay, toDateInput, toLocalInput, uid } from '../lib/utils'

export { SERIAL_STATUSES }

export default function EquipmentDetail() {
  const { id } = useParams()
  const idx = useIdx()
  const store = useStore()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const eq = idx.eq[id]
  useTrackRecent('materiel', id, !!eq)
  if (!eq) return <NotFound what="Cet équipement" />
  const tab = params.get('tab') || 'apercu'
  const isCombo = eq.type === 'kit' || eq.type === 'case'
  const tabs = [
    { id: 'apercu', label: 'Aperçu' },
    { id: 'general', label: 'Général' },
    eq.serialized && { id: 'series', label: 'Numéros de série', count: (idx.serialsByEq[eq.id] || []).length },
    isCombo && { id: 'contenu', label: 'Contenu par défaut', count: (eq.contents || []).length },
    eq.type !== 'kit' && { id: 'stock', label: 'Stock' },
    { id: 'accessoires', label: 'Accessoires', count: (eq.accessories || []).length },
    { id: 'alternatives', label: 'Alternatives', count: (eq.alternatives || []).length },
    { id: 'fournisseurs', label: 'Fournisseurs', count: (eq.supplierIds || []).length },
    { id: 'inspections', label: 'Inspections périodiques', count: idx.d.inspections.filter((i) => i.equipmentId === eq.id).length },
    { id: 'reparations', label: 'Réparations', count: idx.d.repairs.filter((r) => r.equipmentId === eq.id && r.status === 'en_cours').length },
    { id: 'historique', label: 'Historique de projets' },
    { id: 'chronologie', label: 'Chronologie' },
  ].filter(Boolean)
  const update = (patch) => store.patch('equipment', eq.id, patch)

  return (
    <>
      <div className="record-header">
        <div className="title-row">
          {eq.imageUrl && (
            <button type="button" className="eq-head-img" onClick={() => setParams({ tab: 'general' }, { replace: true })} title="Images de l’équipement">
              <img src={eq.imageUrl} alt="" />
            </button>
          )}
          <h1><span className="muted" style={{ fontWeight: 500 }}>{eq.code}</span> {eq.name}</h1>
          {eq.archived && <span className="tag">Archivé</span>}
          <div className="actions">
            <button className="btn" onClick={() => { useRecent.getState().close(`materiel:${id}`); navigate('/equipements') }}>Fermer</button>
            <Menu
              trigger={<button className="btn btn-icon" aria-label="Plus d'options"><Icon name="more_vert" /></button>}
              items={[
                { icon: 'file_copy', label: 'Dupliquer', onClick: () => { const nid = uid('e_'); store.upsert('equipment', { ...eq, id: nid, name: `${eq.name} (copie)`, code: `${eq.code || ''}-2`, createdAt: new Date().toISOString() }); navigate(`/equipements/${nid}`) } },
                { icon: 'archive', label: eq.archived ? 'Désarchiver' : 'Archiver', onClick: () => update({ archived: !eq.archived }) },
                '-',
                {
                  icon: 'delete',
                  label: 'Supprimer',
                  danger: true,
                  onClick: () => {
                    if (!confirm(`Supprimer « ${eq.name} » ?`)) return
                    // Les images de la fiche partent avec elle (lignes et fichiers stockés)
                    const imgs = store.files.filter((f) => f.equipmentId === eq.id)
                    store.removeWhere('files', (f) => f.equipmentId === eq.id)
                    store.remove('equipment', eq.id)
                    removeStoredFiles(imgs.map((f) => f.path)).catch(() => {})
                    navigate('/equipements')
                  },
                },
              ]}
            />
          </div>
        </div>
        <Tabs tabs={tabs} value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} />
      </div>
      {tab === 'apercu' && <Overview eq={eq} idx={idx} />}
      {tab === 'general' && <General eq={eq} idx={idx} update={update} />}
      {tab === 'series' && <Serials eq={eq} idx={idx} />}
      {tab === 'contenu' && <RefList title="Contenu par défaut" eq={eq} idx={idx} field="contents" withQty help={eq.type === 'kit' ? 'Une combinaison virtuelle est composée de ces articles au moment de la préparation ; sa disponibilité dépend de leur stock.' : 'Le contenu fixe de la combinaison physique (case), qui a son propre stock.'} />}
      {tab === 'stock' && <Stock eq={eq} idx={idx} update={update} />}
      {tab === 'accessoires' && <RefList title="Accessoires" eq={eq} idx={idx} field="accessories" withQty withFree help="Les accessoires sont ajoutés automatiquement au projet avec l'équipement (gratuitement ou non)." />}
      {tab === 'alternatives' && <RefList title="Alternatives" eq={eq} idx={idx} field="alternatives" help="Proposées pour résoudre les pénuries de cet équipement." />}
      {tab === 'fournisseurs' && <Suppliers eq={eq} idx={idx} update={update} />}
      {tab === 'inspections' && <Inspections eq={eq} idx={idx} />}
      {tab === 'reparations' && <Repairs eq={eq} idx={idx} />}
      {tab === 'historique' && <History eq={eq} idx={idx} />}
      {tab === 'chronologie' && <EquipmentTimeline equipmentId={eq.id} start={toLocalInput(new Date())} />}
    </>
  )
}

function Overview({ eq, idx }) {
  const today = startOfDay(new Date())
  const stock = stockOf(eq, idx)
  const avail = available(idx, eq.id, today, addDays(today, 1))
  const out = idx.d.bookings.filter((b) => b.equipmentId === eq.id && Number(b.surSite) > 0).map((b) => ({ b, sub: idx.sub[b.subprojectId], p: idx.project[b.projectId] }))
  const now = new Date()
  const late = out.filter((x) => x.sub && x.sub.status !== 'retourne' && Object.values(idx.groupsBySub[x.sub.id] || []).some((g) => parse(groupTimes(g, idx).planEnd) < now))
  const repairs = idx.d.repairs.filter((r) => r.equipmentId === eq.id && r.status === 'en_cours')
  const lost = idx.d.bookings.filter((b) => b.equipmentId === eq.id && Number(b.perdu) > 0)
  const lostSerials = (idx.serialsByEq[eq.id] || []).filter((s) => s.status === 'perdu')
  return (
    <div className="stack">
      <div className="grid grid-4">
        <Kpi icon="inventory_2" color="#1f87e5" label="En stock" value={eq.type === 'kit' ? '—' : stock} sub={eq.serialized ? 'Numéros en service ou en maintenance' : 'Quantité en vrac'} />
        {eq.kind === 'vente' ? (
          <>
            <Kpi icon="event_available" color="#19b26b" label="Disponible" value={avail} sub="Stock moins les projets en cours" />
            <Kpi icon="shopping_bag" color="#0e9f9a" label="Réservé par les projets" value={stock - avail} sub="Déduit du stock au retour du projet" />
          </>
        ) : (
          <>
            <Kpi icon="event_available" color="#19b26b" label="Disponible aujourd'hui" value={avail} sub={eq.type !== 'kit' && stock !== avail ? `${stock - avail} planifié(s) ou indisponible(s)` : undefined} />
            <Kpi icon="place" color="#0e9f9a" label="Sur un projet" value={out.reduce((s, x) => s + Number(x.b.surSite), 0)} sub={late.length ? `${late.length} projet(s) en retard` : undefined} />
          </>
        )}
        <Kpi icon="build" color="#f08c00" label="En réparation" value={repairs.reduce((s, r) => s + r.quantity, 0)} />
      </div>
      <div className="grid grid-3">
        <Section title="Actuellement sur un projet" bodyClass="card-body tight">
          {out.length === 0 ? <div className="empty" style={{ padding: 20 }}>Aucun</div> : (
            <div className="list">
              {out.map(({ b, sub, p }) => (
                <Link key={b.id} to={`/projets/${p.id}?sp=${sub?.id}&tab=equipement`} className="list-item clickable">
                  <span className="dot-status" style={{ background: late.includes(out.find((x) => x.b === b)) ? 'var(--danger)' : 'var(--success)' }} />
                  <div><div className="title">{b.surSite} · {p.number} {p.name}</div><div className="meta">{statusOf(sub?.status).label}</div></div>
                </Link>
              ))}
            </div>
          )}
        </Section>
        <Section title="Réparations" bodyClass="card-body tight">
          {repairs.length === 0 ? <div className="empty" style={{ padding: 20 }}>Aucune réparation en cours</div> : (
            <div className="list">{repairs.map((r) => <div key={r.id} className="list-item"><Icon name="build" size={18} style={{ color: 'var(--warning)' }} /><div><div className="title">{r.number} · {r.title}</div><div className="meta">{r.quantity} unité(s) · jusqu'au {fmtDate(r.endsAt)}</div></div></div>)}</div>
          )}
        </Section>
        <Section title="Équipements perdus" bodyClass="card-body tight">
          {lost.length + lostSerials.length === 0 ? <div className="empty" style={{ padding: 20 }}>Cet équipement n'est actuellement pas perdu</div> : (
            <div className="list">
              {lost.map((b) => <div key={b.id} className="list-item"><Icon name="report" size={18} style={{ color: 'var(--danger)' }} /><div><div className="title">{b.perdu} perdu(s) sur « {idx.project[b.projectId]?.name || 'projet supprimé'} »</div>{!eq.serialized && <div className="meta">Retiré(s) du stock</div>}</div></div>)}
              {lostSerials.map((s) => <div key={s.id} className="list-item"><Icon name="report" size={18} style={{ color: 'var(--danger)' }} />Numéro {s.serial}</div>)}
            </div>
          )}
        </Section>
      </div>
      <EquipmentTimeline equipmentId={eq.id} start={toLocalInput(new Date())} />
    </div>
  )
}

function General({ eq, idx, update }) {
  const store = useStore()
  const access = useAccess()
  const set = (k) => (e) => update({ [k]: e.target.value })
  const setN = (k) => (v) => update({ [k]: v })
  return (
    <div className="grid grid-side" style={{ gridTemplateColumns: 'minmax(0,1fr) 360px' }}>
      <div className="stack">
        <Section title="Équipement">
          <div className="form-grid form-grid-3">
            <Field label="Nom (dans la base de données)" className="full"><input className="input" value={eq.name} onChange={set('name')} /></Field>
            <Field label="Code"><input className="input" value={eq.code || ''} onChange={set('code')} /></Field>
            <Field label="Dossier">
              <select className="select" value={eq.categoryId || ''} onChange={set('categoryId')}>
                {store.categories.map((c) => <option key={c.id} value={c.id}>{c.parentId ? '— ' : ''}{c.name}</option>)}
              </select>
            </Field>
            <Field label="Emplacement dans l'entrepôt"><input className="input" value={eq.location || ''} onChange={set('location')} /></Field>
            <Field label="Type">
              <select className="select" value={eq.kind === 'vente' ? 'vente' : eq.type} onChange={(e) => update(e.target.value === 'vente' ? { kind: 'vente', type: 'article' } : { kind: 'location', type: e.target.value })}>
                {EQUIPMENT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Groupe d'équipements par défaut" hint="Utilisé par « Placer dans le groupe par défaut »"><input className="input" value={eq.defaultGroup || ''} onChange={set('defaultGroup')} /></Field>
            <Field label="Afficher dans le planificateur">
              <select className="select" value={eq.displayInPlanner ? 'oui' : 'non'} onChange={(e) => update({ displayInPlanner: e.target.value === 'oui' })}><option value="oui">Oui</option><option value="non">Non</option></select>
            </Field>
            <Field label="Numéros de série">
              <Toggle checked={eq.serialized} onChange={(v) => update({ serialized: v })} label={eq.serialized ? 'Suivi par numéro de série' : 'Stock en vrac'} />
            </Field>
          </div>
        </Section>
        <CustomFields entity="equipement" values={eq.customFields} onChange={(customFields) => update({ customFields })} />
        <Section title="Finance">
          <div className="form-grid form-grid-3">
            <Field label={eq.kind === 'vente' ? 'Prix de vente' : 'Prix de location (par jour)'}><NumInput className="input input-num" value={eq.rentalPrice} onChange={setN('rentalPrice')} /></Field>
            <Field label="Coût de sous-location"><NumInput className="input input-num" value={eq.subrentalCost} onChange={setN('subrentalCost')} /></Field>
            <Field label={eq.kind === 'vente' ? "Prix d'achat" : 'Valeur (prix d’achat)'}><NumInput className="input input-num" value={eq.purchasePrice} onChange={setN('purchasePrice')} /></Field>
          </div>
        </Section>
        <Section title="Propriétés physiques">
          <div className="form-grid form-grid-4">
            <Field label="Poids (kg)"><NumInput className="input input-num" value={eq.weight} onChange={setN('weight')} /></Field>
            <Field label="Volume de transport (m³)"><NumInput className="input input-num" value={eq.volume} onChange={setN('volume')} /></Field>
            <Field label="Puissance (W)"><NumInput className="input input-num" value={eq.power} onChange={setN('power')} /></Field>
            <Field label="Courant (A)"><NumInput className="input input-num" value={eq.current} onChange={setN('current')} /></Field>
          </div>
        </Section>
        <Section title="Remarques">
          <div className="form-grid">
            <Field label="Remarque interne"><textarea className="textarea" value={eq.internalRemark || ''} onChange={set('internalRemark')} /></Field>
            <Field label="Remarque externe" hint="Peut apparaître sur les devis"><textarea className="textarea" value={eq.externalRemark || ''} onChange={set('externalRemark')} /></Field>
          </div>
        </Section>
      </div>
      <div className="stack">
        <Section title="Images" icon="photo_library">
          <EquipmentImages eq={eq} update={update} editable={access.can('equipements', 'modification')} />
        </Section>
        <Section
          title="QR code"
          icon="qr_code"
          action={<Link className="btn btn-sm" to={eq.serialized ? `/equipements/${eq.id}?tab=series` : `/etiquettes?eq=${eq.id}`}><Icon name="print" size={16} /> {eq.serialized ? 'Étiquettes des numéros' : 'Imprimer l’étiquette'}</Link>}
        >
          <div className="row" style={{ gap: 16 }}>
            <QrCode text={`RENTPLAN-EQ:${eq.code || eq.id}`} size={96} />
            <div><div className="strong mono">{eq.code || '—'}</div><div className="small muted">{eq.serialized ? 'Suivi par numéro de série : chaque unité a sa propre étiquette, avec son numéro dans le QR code.' : 'À scanner dans l’entrepôt pour préparer ou rentrer cet équipement.'}</div></div>
          </div>
        </Section>
        <Section title="Étiquettes" icon="label">
          <TagInput value={eq.tags || []} onChange={(tags) => update({ tags })} />
        </Section>
      </div>
    </div>
  )
}

function Serials({ eq, idx }) {
  const store = useStore()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [serial, setSerial] = useState('')
  const [gen, setGen] = useState(0)
  const [sel, setSel] = useState([])
  const [filter, setFilter] = useState('tous')
  const [history, setHistory] = useState(null)
  const focus = params.get('sn')
  const list = (idx.serialsByEq[eq.id] || []).map((s) => ({ ...s, state: serialState(s, idx) })).sort((a, b) => String(a.serial).localeCompare(String(b.serial), 'fr', { numeric: true }))
  const counts = list.reduce((m, s) => ({ ...m, [s.state.id]: (m[s.state.id] || 0) + 1 }), {})
  const shown = filter === 'tous' ? list : list.filter((s) => s.state.id === filter)
  const add = (value) => {
    const v = value.trim()
    if (!v) return false
    if (idx.d.serials.some((s) => s.serial.toLowerCase() === v.toLowerCase())) return toast(`Le numéro ${v} existe déjà`, 'error') && false
    store.upsert('serials', { id: uid('sn_'), equipmentId: eq.id, serial: v, internalRef: '', stockLocationId: idx.d.stockLocations.find((l) => l.isDefault)?.id || null, status: 'ok', notes: '', purchaseDate: toDateInput(new Date()) })
    return true
  }
  const generate = () => {
    const prefix = (eq.code || 'SN').replace(/[^A-Z0-9-]/gi, '')
    const taken = new Set(idx.d.serials.map((s) => s.serial))
    let made = 0
    for (let n = list.length + 1; made < gen; n++) {
      const v = `${prefix}-${String(n).padStart(4, '0')}`
      if (taken.has(v)) continue
      add(v)
      made++
    }
    toast(`${made} numéro${made > 1 ? 's' : ''} de série créé${made > 1 ? 's' : ''}`)
    setGen(0)
  }
  const printLabels = (ids) => navigate(`/etiquettes?sn=${ids.join(',')}`)
  const all = shown.length > 0 && shown.every((s) => sel.includes(s.id))
  return (
    <div className="card">
      <div className="grid-toolbar sn-toolbar">
        <form className="row" onSubmit={(e) => { e.preventDefault(); if (add(serial)) setSerial('') }}>
          <input className="input input-sm" style={{ width: 220 }} placeholder="Nouveau numéro (ou scan)" value={serial} onChange={(e) => setSerial(e.target.value)} aria-label="Nouveau numéro de série" />
          <button className="btn btn-sm btn-primary" type="submit"><Icon name="add" size={17} /> Ajouter</button>
        </form>
        <span className="row small" style={{ gap: 6 }}>
          Générer <NumInput style={{ width: 56 }} value={gen} onChange={(v) => setGen(Math.max(0, Math.round(v)))} /> numéros
          <button className="btn btn-sm" onClick={generate} disabled={!gen}>Créer</button>
        </span>
        <span className="spacer" />
        <button className="btn btn-sm" disabled={!list.length} onClick={() => printLabels((sel.length ? sel : shown.map((s) => s.id)))}>
          <Icon name="qr_code_2" size={17} /> {sel.length ? `Imprimer ${sel.length} étiquette${sel.length > 1 ? 's' : ''}` : 'Imprimer les étiquettes'}
        </button>
      </div>
      {list.length > 0 && (
        <div className="chips sn-filters">
          <button className={`chip ${filter === 'tous' ? 'on' : ''}`} onClick={() => setFilter('tous')}>Tous <span className="n">{list.length}</span></button>
          {Object.entries(SERIAL_STATES).filter(([k]) => counts[k]).map(([k, v]) => (
            <button key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}><span className="sn-dot" style={{ background: v.color }} /> {v.label} <span className="n">{counts[k]}</span></button>
          ))}
        </div>
      )}
      {list.length === 0 ? <Empty icon="qr_code" title="Aucun numéro de série" text="Ajoutez les numéros un par un (une douchette fonctionne dans le champ), ou générez-en une série à partir du code de l’équipement." /> : (
        <div className="table-wrap">
          <table className="table table-compact">
            <thead>
              <tr>
                <th className="check-col"><input type="checkbox" checked={all} onChange={(e) => setSel(e.target.checked ? shown.map((x) => x.id) : [])} aria-label="Tout sélectionner" /></th>
                <th>Numéro de série</th><th>Référence interne</th><th>Emplacement de stock</th><th>État actuel</th><th>Statut</th><th>Date d’achat</th><th>Notes</th><th />
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => (
                <tr key={s.id} className={`${sel.includes(s.id) ? 'selected' : ''} ${focus && focus === s.serial ? 'sn-focus' : ''}`} ref={focus && focus === s.serial ? (el) => el?.scrollIntoView({ block: 'center' }) : undefined}>
                  <td className="check-col"><input type="checkbox" checked={sel.includes(s.id)} onChange={(e) => setSel(e.target.checked ? [...sel, s.id] : sel.filter((x) => x !== s.id))} aria-label={`Sélectionner ${s.serial}`} /></td>
                  <td><input className="input input-sm mono" style={{ maxWidth: 160 }} value={s.serial} onChange={(e) => store.patch('serials', s.id, { serial: e.target.value })} aria-label="Numéro" /></td>
                  <td><input className="input input-sm" style={{ maxWidth: 130 }} value={s.internalRef || ''} onChange={(e) => store.patch('serials', s.id, { internalRef: e.target.value })} aria-label="Référence interne" /></td>
                  <td>
                    <select className="select input-sm" style={{ maxWidth: 170 }} value={s.stockLocationId || ''} onChange={(e) => store.patch('serials', s.id, { stockLocationId: e.target.value || null })} aria-label="Emplacement">
                      <option value="">—</option>
                      {idx.d.stockLocations.filter((l) => !l.archived || l.id === s.stockLocationId).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </td>
                  <td style={{ minWidth: 200 }}><SerialStateBadge state={s.state} /></td>
                  <td>
                    <select className="select input-sm" style={{ maxWidth: 150, color: SERIAL_STATUSES.find((x) => x.id === s.status)?.color, fontWeight: 600 }} value={s.status} onChange={(e) => store.patch('serials', s.id, { status: e.target.value })} aria-label="Statut">
                      {SERIAL_STATUSES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                    </select>
                  </td>
                  <td><input type="date" className="input input-sm" style={{ maxWidth: 145 }} value={s.purchaseDate || ''} onChange={(e) => store.patch('serials', s.id, { purchaseDate: e.target.value || null })} aria-label="Date d'achat" /></td>
                  <td><input className="input input-sm" style={{ maxWidth: 'none', minWidth: 120 }} value={s.notes || ''} onChange={(e) => store.patch('serials', s.id, { notes: e.target.value })} aria-label="Notes" /></td>
                  <td className="right nowrap">
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => printLabels([s.id])} title="Étiquette" aria-label={`Étiquette ${s.serial}`}><Icon name="qr_code_2" size={17} /></button>
                    <Menu
                      trigger={<button className="btn btn-ghost btn-icon btn-sm" aria-label="Plus d'options"><Icon name="more_vert" size={17} /></button>}
                      items={[
                        { icon: 'history', label: 'Historique des projets', onClick: () => setHistory(s) },
                        s.state.repair && { icon: 'build', label: `Réparation ${s.state.repair.number}`, onClick: () => navigate('/maintenance') },
                        '-',
                        { icon: 'delete', label: 'Supprimer', danger: true, disabled: ['reserve', 'pret', 'sur_site', 'retard'].includes(s.state.id), onClick: () => { if (confirm(`Supprimer le numéro ${s.serial} ?`)) store.remove('serials', s.id) } },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {history && (
        <Modal title={`Historique — ${history.serial}`} onClose={() => setHistory(null)}>
          {(() => {
            const h = serialHistory(history.id, idx)
            if (!h.length) return <p className="muted" style={{ margin: 0 }}>Ce numéro n’a encore servi sur aucun projet.</p>
            return (
              <div className="table-wrap">
                <table className="table table-compact">
                  <thead><tr><th>Projet</th><th>Période</th><th>Statut</th><th>Retour</th></tr></thead>
                  <tbody>
                    {h.map((x) => (
                      <tr key={x.sub?.id || x.project.id}>
                        <td><Link to={`/projets/${x.project.id}?tab=logistique`} onClick={() => setHistory(null)}>{x.project.number} {x.project.name}</Link></td>
                        <td className="nowrap">{fmtRange(x.start, x.end)}</td>
                        <td>{statusOf(x.sub?.status).label}</td>
                        <td>{{ ok: 'Bon état', cleaning: 'À nettoyer', damaged: 'Endommagé', lost: 'Perdu' }[x.returned] || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })()}
        </Modal>
      )}
    </div>
  )
}

// Colonnes du stock par emplacement : l'état réel des numéros (réservé, sur site, en réparation…)
const STOCK_STATES = ['dispo', 'reserve', 'pret', 'sur_site', 'retard', 'reparation', 'maintenance', 'hs', 'perdu']

function Stock({ eq, idx, update }) {
  const [delta, setDelta] = useState(0)
  const serials = idx.serialsByEq[eq.id] || []
  const states = serials.map((s) => ({ s, st: serialState(s, idx).id }))
  if (eq.serialized) {
    return (
      <Section title="Stock par emplacement" bodyClass="card-body tight">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Emplacement de stock</th>{STOCK_STATES.map((k) => <th key={k} className="num">{SERIAL_STATES[k].label}</th>)}</tr></thead>
            <tbody>
              {idx.d.stockLocations.filter((l) => !l.archived).map((l) => (
                <tr key={l.id}><td className="strong">{l.name}</td>{STOCK_STATES.map((k) => <td key={k} className="num">{states.filter((x) => x.s.stockLocationId === l.id && x.st === k).length || ''}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    )
  }
  return (
    <Section title="Niveau de stock">
      <div className="row wrap" style={{ gap: 24 }}>
        <Field label="Quantité en stock"><NumInput className="input input-num" style={{ width: 140 }} value={eq.stock} onChange={(v) => update({ stock: Math.max(0, Math.round(v)) })} /></Field>
        <Field label="Ajuster le stock (achat, perte…)" hint="Ex. 4 pour ajouter quatre unités, −2 pour en retirer deux">
          <div className="row">
            <NumInput className="input input-num" style={{ width: 100 }} value={delta} onChange={(v) => setDelta(Math.round(v))} />
            <button className="btn" disabled={!delta} onClick={() => { update({ stock: Math.max(0, (Number(eq.stock) || 0) + delta) }); toast(`Stock ajusté de ${delta > 0 ? '+' : ''}${delta}`); setDelta(0) }}>Appliquer</button>
          </div>
        </Field>
      </div>
    </Section>
  )
}

function RefList({ title, eq, idx, field, withQty, withFree, help }) {
  const store = useStore()
  const [addId, setAddId] = useState('')
  const items = (eq[field] || []).map((x) => (typeof x === 'string' ? { equipmentId: x } : x))
  const save = (list) => store.patch('equipment', eq.id, { [field]: field === 'alternatives' ? list.map((x) => x.equipmentId) : list })
  return (
    <Section title={title} bodyClass="card-body tight">
      <p className="muted small" style={{ margin: '12px 16px' }}>{help}</p>
      {items.length > 0 && (
        <div className="table-wrap">
          <table className="table table-compact">
            <thead><tr><th>Équipement</th>{withQty && <th className="num">Quantité</th>}{withFree && <th>Gratuit</th>}<th className="num">Disponible aujourd'hui</th><th /></tr></thead>
            <tbody>
              {items.map((x, i) => (
                <tr key={x.equipmentId}>
                  <td><Link to={`/equipements/${x.equipmentId}`}>{idx.eq[x.equipmentId]?.name || 'Équipement supprimé'}</Link></td>
                  {withQty && <td className="num"><NumInput style={{ width: 70 }} value={x.quantity} onChange={(v) => save(items.map((y, j) => (j === i ? { ...y, quantity: Math.max(1, Math.round(v)) } : y)))} /></td>}
                  {withFree && <td><input type="checkbox" checked={!!x.free} onChange={(e) => save(items.map((y, j) => (j === i ? { ...y, free: e.target.checked } : y)))} aria-label="Gratuit" /></td>}
                  <td className="num">{available(idx, x.equipmentId, startOfDay(new Date()), addDays(startOfDay(new Date()), 1))}</td>
                  <td className="right"><button className="btn btn-ghost btn-icon btn-sm" onClick={() => save(items.filter((_, j) => j !== i))} aria-label="Retirer"><Icon name="delete" size={17} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="row" style={{ padding: 16 }}>
        <select className="select input-sm" style={{ maxWidth: 360 }} value={addId} onChange={(e) => setAddId(e.target.value)} aria-label="Équipement à ajouter">
          <option value="">Choisir un équipement…</option>
          {idx.d.equipment.filter((e) => e.id !== eq.id && !items.some((x) => x.equipmentId === e.id)).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <button className="btn btn-sm" disabled={!addId} onClick={() => { save([...items, { equipmentId: addId, quantity: 1, free: field === 'accessories' }]); setAddId('') }}><Icon name="add" size={17} /> Ajouter</button>
      </div>
    </Section>
  )
}

function Suppliers({ eq, idx, update }) {
  const [addId, setAddId] = useState('')
  const ids = eq.supplierIds || []
  return (
    <Section title="Fournisseurs" bodyClass="card-body tight">
      <p className="muted small" style={{ margin: '12px 16px' }}>Fournisseurs proposés lors de la création d'une sous-location pour cet équipement. Coût de sous-location : {fmtMoney(eq.subrentalCost)}.</p>
      <div className="list">
        {ids.map((sid) => (
          <div key={sid} className="list-item">
            <Icon name="store" size={19} style={{ color: 'var(--primary)' }} />
            <Link to={`/contacts/${sid}`} style={{ flex: 1 }}>{contactName(idx.contact[sid])}</Link>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => update({ supplierIds: ids.filter((x) => x !== sid) })} aria-label="Retirer"><Icon name="delete" size={17} /></button>
          </div>
        ))}
      </div>
      <div className="row" style={{ padding: 16 }}>
        <select className="select input-sm" style={{ maxWidth: 320 }} value={addId} onChange={(e) => setAddId(e.target.value)} aria-label="Fournisseur">
          <option value="">Choisir un fournisseur…</option>
          {idx.d.contacts.filter((c) => c.type === 'fournisseur' && !ids.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{contactName(c)}</option>)}
        </select>
        <button className="btn btn-sm" disabled={!addId} onClick={() => { update({ supplierIds: [...ids, addId] }); setAddId('') }}><Icon name="add" size={17} /> Ajouter</button>
      </div>
    </Section>
  )
}

export function InspectionRows({ list, idx, showEquipment }) {
  const store = useStore()
  const today = startOfDay(new Date())
  return (
    <div className="table-wrap">
      <table className="table table-compact">
        <thead><tr>{showEquipment && <th>Équipement</th>}<th>Inspection</th><th>Numéro de série</th><th className="num">Intervalle</th><th>Dernière</th><th>Prochaine</th><th>Résultat</th><th /></tr></thead>
        <tbody>
          {list.map((i) => {
            const due = i.nextDate && parse(i.nextDate) <= today
            return (
              <tr key={i.id}>
                {showEquipment && <td><Link to={`/equipements/${i.equipmentId}?tab=inspections`}>{idx.eq[i.equipmentId]?.name}</Link></td>}
                <td><input className="input input-sm" style={{ maxWidth: 'none' }} value={i.name} onChange={(e) => store.patch('inspections', i.id, { name: e.target.value })} aria-label="Nom" /></td>
                <td className="mono small">{idx.d.serials.find((s) => s.id === i.serialId)?.serial || '—'}</td>
                <td className="num"><span className="row" style={{ justifyContent: 'flex-end', gap: 4 }}><NumInput style={{ width: 50 }} value={i.intervalMonths} onChange={(v) => store.patch('inspections', i.id, { intervalMonths: Math.round(v) })} /> mois</span></td>
                <td>{fmtDate(i.lastDate)}</td>
                <td className={due && i.result !== 'ok' ? 'danger-text strong' : ''}>{fmtDate(i.nextDate)}</td>
                <td>
                  <select className="select input-sm" style={{ width: 130 }} value={i.result} onChange={(e) => store.patch('inspections', i.id, { result: e.target.value })} aria-label="Résultat">
                    <option value="a_faire">À faire</option>
                    <option value="ok">Conforme</option>
                    <option value="echec">Non conforme</option>
                  </select>
                </td>
                <td className="right nowrap">
                  <button className="btn-link" onClick={() => { const next = new Date(); next.setMonth(next.getMonth() + (i.intervalMonths || 12)); store.patch('inspections', i.id, { lastDate: toDateInput(new Date()), nextDate: toDateInput(next), result: 'ok' }); toast('Inspection enregistrée') }}><Icon name="task_alt" size={17} /> Effectuée</button>
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => store.remove('inspections', i.id)} aria-label="Supprimer"><Icon name="delete" size={17} /></button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Inspections({ eq, idx }) {
  const store = useStore()
  const list = idx.d.inspections.filter((i) => i.equipmentId === eq.id)
  return (
    <div className="card">
      <div className="grid-toolbar">
        <span className="muted small">Contrôles réglementaires et entretiens à intervalles réguliers.</span>
        <span className="spacer" />
        <button className="btn btn-primary" onClick={() => { const next = new Date(); next.setMonth(next.getMonth() + 12); store.upsert('inspections', { id: uid('ins_'), equipmentId: eq.id, serialId: null, name: 'Nouvelle inspection', intervalMonths: 12, lastDate: null, nextDate: toDateInput(next), result: 'a_faire', notes: '' }) }}><Icon name="add" /> Inspection</button>
      </div>
      {list.length ? <InspectionRows list={list} idx={idx} /> : <Empty icon="fact_check" title="Aucune inspection périodique" />}
    </div>
  )
}

export function RepairModal({ repair, equipmentId, onClose }) {
  const store = useStore()
  const idx = useIdx()
  const [f, setF] = useState(repair || { equipmentId: equipmentId || '', title: '', description: '', quantity: 1, serialId: null, unavailable: true, startsAt: toLocalInput(new Date()), endsAt: toLocalInput(addDays(new Date(), 7)), cost: 0, repairer: '', status: 'en_cours' })
  const save = () => {
    if (!f.equipmentId) return toast('Choisissez un équipement', 'error')
    if (!f.title.trim()) return toast('Décrivez le problème', 'error')
    if (repair) store.upsert('repairs', f)
    else store.createRepair(f)
    toast(repair ? 'Réparation enregistrée' : 'Réparation créée')
    onClose()
  }
  const serials = idx.serialsByEq[f.equipmentId] || []
  return (
    <Modal title={repair ? `Réparation ${repair.number}` : 'Signaler un équipement défectueux'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn btn-primary" onClick={save}>Enregistrer</button></>}>
      <div className="form-grid">
        <Field label="Équipement" className="full">
          <select className="select" value={f.equipmentId} onChange={(e) => setF({ ...f, equipmentId: e.target.value, serialId: null })} disabled={!!equipmentId && !repair}>
            <option value="">— Choisir —</option>
            {idx.d.equipment.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </Field>
        <Field label="Problème" className="full"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Ex. moteur pan bruyant" /></Field>
        {serials.length > 0 ? (
          <Field label="Numéro de série">
            <select className="select" value={f.serialId || ''} onChange={(e) => setF({ ...f, serialId: e.target.value || null, quantity: 1 })}>
              <option value="">— Non précisé —</option>
              {serials.map((s) => <option key={s.id} value={s.id}>{s.serial}</option>)}
            </select>
          </Field>
        ) : (
          <Field label="Quantité"><NumInput className="input input-num" value={f.quantity} onChange={(v) => setF({ ...f, quantity: Math.max(1, Math.round(v)) })} /></Field>
        )}
        <Field label="Réparateur"><input className="input" value={f.repairer || ''} onChange={(e) => setF({ ...f, repairer: e.target.value })} placeholder="Atelier interne, SAV…" /></Field>
        <Field label="Début"><input type="datetime-local" className="input" value={f.startsAt || ''} onChange={(e) => setF({ ...f, startsAt: e.target.value })} /></Field>
        <Field label="Fin prévue"><input type="datetime-local" className="input" value={f.endsAt || ''} onChange={(e) => setF({ ...f, endsAt: e.target.value || null })} /></Field>
        <Field label="Coût (€)"><NumInput className="input input-num" value={f.cost} onChange={(v) => setF({ ...f, cost: v })} /></Field>
        <Field label="Statut">
          <select className="select" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="en_cours">En cours</option><option value="terminee">Terminée</option></select>
        </Field>
        <Field label="Disponibilité" className="full"><Toggle checked={f.unavailable} onChange={(v) => setF({ ...f, unavailable: v })} label="Rendre indisponible jusqu'à la fin de la réparation" /></Field>
        <Field label="Description" className="full"><textarea className="textarea" value={f.description || ''} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      </div>
    </Modal>
  )
}

function Repairs({ eq, idx }) {
  const store = useStore()
  const [edit, setEdit] = useState(null)
  const list = idx.d.repairs.filter((r) => r.equipmentId === eq.id).sort((a, b) => String(b.startsAt).localeCompare(String(a.startsAt)))
  return (
    <div className="card">
      <div className="grid-toolbar">
        <span className="spacer" />
        <button className="btn btn-primary" onClick={() => setEdit({})}><Icon name="add" /> Nouvelle réparation</button>
      </div>
      {list.length === 0 ? <Empty icon="build" title="Aucune réparation" /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Numéro</th><th>Problème</th><th className="num">Qté</th><th>Période</th><th>Indisponible</th><th>Statut</th><th className="num">Coût</th><th /></tr></thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} className="clickable" onClick={() => setEdit(r)}>
                  <td className="mono">{r.number}</td>
                  <td className="strong">{r.title}</td>
                  <td className="num">{r.quantity}</td>
                  <td className="nowrap">{fmtRange(r.startsAt, r.endsAt)}</td>
                  <td>{r.unavailable ? 'Oui' : 'Non'}</td>
                  <td><Badge color={r.status === 'en_cours' ? '#f08c00' : '#19b26b'}>{r.status === 'en_cours' ? 'En cours' : 'Terminée'}</Badge></td>
                  <td className="num mono">{fmtMoney(r.cost)}</td>
                  <td className="right" onClick={(e) => e.stopPropagation()}>{r.status === 'en_cours' && <button className="btn-link" onClick={() => store.patch('repairs', r.id, { status: 'terminee', endsAt: toLocalInput(new Date()) })}><Icon name="task_alt" size={17} /> Terminer</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && <RepairModal repair={edit.id ? edit : null} equipmentId={eq.id} onClose={() => setEdit(null)} />}
    </div>
  )
}

function History({ eq, idx }) {
  const navigate = useNavigate()
  const subs = [...new Set((idx.linesByEq[eq.id] || []).map((l) => l.subprojectId))].map((sid) => {
    const sub = idx.sub[sid]
    const lines = (idx.linesByEq[eq.id] || []).filter((l) => l.subprojectId === sid)
    const qty = lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0)
    const t = groupTimes(idx.group[lines[0].groupId], idx)
    const wh = subWarehouse(sid, idx).rows.find((r) => r.equipmentId === eq.id)
    return { sub, qty, t, wh }
  }).filter((x) => x.sub).sort((a, b) => String(b.t.planStart).localeCompare(String(a.t.planStart)))
  if (!subs.length) return <div className="card"><Empty icon="history" title="Jamais planifié" text="Cet équipement n'apparaît dans aucun projet." /></div>
  return (
    <div className="card">
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Projet</th><th>Période de planification</th><th className="num">Quantité</th><th>Statut</th><th>Entrepôt</th></tr></thead>
          <tbody>
            {subs.map(({ sub, qty, t, wh }) => {
              const p = idx.project[sub.projectId]
              const st = statusOf(sub.status)
              return (
                <tr key={sub.id} className="clickable" onClick={() => navigate(`/projets/${p.id}?sp=${sub.id}&tab=equipement`)}>
                  <td className="strong">{p.number} {p.name}{(idx.subsByProject[p.id] || []).length > 1 ? ` — ${sub.name}` : ''}</td>
                  <td className="nowrap">{fmtRange(t.planStart, t.planEnd)}</td>
                  <td className="num">{qty}</td>
                  <td><Badge color={st.color}>{st.label}</Badge></td>
                  <td className="small muted">{wh ? `${wh.pret} prêt · ${wh.surSite} sur site · ${wh.retourne} retourné` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
