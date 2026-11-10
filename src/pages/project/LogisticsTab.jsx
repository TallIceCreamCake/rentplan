import { useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useStore, toast } from '../../store'
import { currentUserName, useAccess } from '../../lib/auth'
import { Badge, Empty, Icon, Menu, NumInput, QtyStepper } from '../../components/ui'
import GenerateDocModal, { afterGenerate } from '../../components/doc/GenerateDocModal'
import { CHARGE_KINDS, CHARGE_STATUSES, chargeStatus, chargeSuggestions, chargeTotal, feeSettings, lateDays, logisticsOf, logisticsStep } from '../../lib/logistics'
import { statusOf, subTimes } from '../../lib/model'
import { serialIssue } from '../../lib/serials'
import { fmtDateTime, fmtMoney } from '../../lib/utils'

const VIEWS = [
  { id: 'preparation', label: 'Préparation', icon: 'inventory' },
  { id: 'retour', label: 'Retour', icon: 'assignment_return' },
  { id: 'frais', label: 'Frais de retour', icon: 'receipt_long' },
]
const stamp = () => ({ at: new Date().toISOString(), by: currentUserName() })
const when = (x) => (x?.at || x?.doneAt ? `le ${fmtDateTime(x.at || x.doneAt)}${x.by ? ` par ${x.by}` : ''}` : '')

/** Préparation du matériel, départ, retour (état, pertes, réparations) et frais de retour facturables. */
export default function LogisticsTab({ project, sub, idx, setQuery }) {
  const [params] = useSearchParams()
  const access = useAccess()
  const canEdit = access.can('entrepot', 'modification') || access.can('projets', 'modification')
  const data = logisticsOf(sub.id, idx)
  const step = logisticsStep(sub, data.totals)
  const view = VIEWS.some((v) => v.id === params.get('vue')) ? params.get('vue') : step === 'retour' || step === 'cloture' ? 'retour' : 'preparation'
  const go = (v) => setQuery({ vue: v })
  const charges = idx.chargesBySub[sub.id] || []
  const suggestions = chargeSuggestions(sub, idx)

  if (!data.rows.length) {
    return (
      <div className="card">
        <Empty icon="inventory_2" title="Aucun matériel à préparer" text="Planifiez du matériel de location ou de vente dans l’onglet Équipement : il apparaîtra ici pour la préparation et le retour." action={<button className="btn btn-primary" onClick={() => setQuery({ tab: 'equipement' })}><Icon name="category" /> Onglet Équipement</button>} />
      </div>
    )
  }
  const props = { project, sub, idx, data, canEdit, go }
  return (
    <div className="stack">
      <Steps sub={sub} idx={idx} data={data} step={step} view={view} go={go} charges={charges} suggestions={suggestions} access={access} />
      {view === 'preparation' && <Preparation {...props} />}
      {view === 'retour' && <ReturnView {...props} suggestions={suggestions} />}
      {view === 'frais' && <Charges {...props} charges={charges} suggestions={suggestions} access={access} />}
    </div>
  )
}

/* ---------- En-tête : étapes ---------- */
function Steps({ sub, idx, data, step, view, go, charges, suggestions, access }) {
  const t = subTimes(sub.id, idx)
  const { totals } = data
  const late = lateDays(sub, idx, totals)
  const toBill = charges.filter((c) => chargeStatus(c, idx, access.finances) === 'a_facturer')
  const lg = sub.logistics || {}
  const pct = (a, b) => (b ? Math.min(100, Math.round((a / b) * 100)) : 0)
  const back = totals.retourne + totals.perdu
  const items = [
    { id: 'preparation', n: 1, title: 'Préparation', value: `${totals.prepared} / ${totals.needed}`, hint: lg.prep?.doneAt ? `Validée ${when({ doneAt: lg.prep.doneAt, by: lg.prep.by })}` : 'articles préparés', pct: pct(totals.prepared, totals.needed), done: totals.prepared >= totals.needed, view: 'preparation' },
    { id: 'depart', n: 2, title: 'Départ', value: `${totals.out} / ${totals.needed}`, hint: lg.out?.at ? `Parti ${when(lg.out)}` : `sortie prévue ${fmtDateTime(t.planStart)}`, pct: pct(totals.out, totals.needed), done: totals.out >= totals.needed, view: 'preparation' },
    { id: 'retour', n: 3, title: 'Retour', value: `${back} / ${totals.out || totals.needed}`, hint: lg.ret?.doneAt ? `Clôturé ${when({ doneAt: lg.ret.doneAt, by: lg.ret.by })}` : late ? `en retard de ${late} jour${late > 1 ? 's' : ''}` : `retour prévu ${fmtDateTime(t.planEnd)}`, pct: pct(back, totals.out), done: Boolean(lg.ret?.doneAt) || (totals.out > 0 && totals.surSite === 0), warn: late > 0 && !lg.ret?.doneAt, view: 'retour' },
    { id: 'frais', n: 4, title: 'Frais de retour', value: toBill.length ? fmtMoney(toBill.reduce((s, c) => s + chargeTotal(c), 0), idx.settings.currency) : String(charges.length), hint: toBill.length ? `${toBill.length} à facturer` : suggestions.length ? `${suggestions.length} proposé${suggestions.length > 1 ? 's' : ''}` : charges.length ? 'tout est traité' : 'aucun frais', pct: charges.length ? pct(charges.length - toBill.length, charges.length) : 0, done: charges.length > 0 && !toBill.length && !suggestions.length, warn: suggestions.length > 0, view: 'frais' },
  ]
  const current = { preparation: 0, depart: 1, retour: 2, cloture: 3 }[step] ?? 0
  return (
    <div className="card lg-steps">
      <div className="lg-steps-row">
        {items.map((it, i) => (
          <button key={it.id} type="button" className={`lg-step ${view === it.view && (it.view !== 'preparation' || i <= 1) ? 'on' : ''} ${it.done ? 'done' : ''} ${i === current ? 'current' : ''} ${it.warn ? 'warn' : ''}`} onClick={() => go(it.view)}>
            <span className="lg-step-n">{it.done ? <Icon name="check" size={16} /> : it.n}</span>
            <span className="lg-step-body">
              <span className="lg-step-title">{it.title}</span>
              <strong className="lg-step-value">{it.value}</strong>
              <span className="lg-step-hint">{it.hint}</span>
              <span className="lg-bar"><i style={{ width: `${it.pct}%` }} /></span>
            </span>
          </button>
        ))}
      </div>
      <div className="lg-steps-foot">
        <span>Statut : <strong style={{ color: statusOf(sub.status).color }}>{statusOf(sub.status).label}</strong></span>
        <span>Sortie : <strong>{fmtDateTime(t.planStart)}</strong></span>
        <span>Retour prévu : <strong>{fmtDateTime(t.planEnd)}</strong></span>
        <span className="spacer" />
        <div className="btn-group">
          {VIEWS.map((v) => (
            <button key={v.id} className={`btn btn-sm ${view === v.id ? 'on' : ''}`} onClick={() => go(v.id)}>
              <Icon name={v.icon} size={17} /> {v.label}
              {v.id === 'frais' && toBill.length + suggestions.length > 0 && <span className="lg-count">{toBill.length + suggestions.length}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ---------- Scan d'un code ou d'un numéro de série ---------- */
function ScanField({ rows, idx, onHit, placeholder }) {
  const [code, setCode] = useState('')
  const ref = useRef(null)
  const submit = (e) => {
    e.preventDefault()
    // Le QR de la fiche équipement porte « RENTPLAN-EQ:code »
    const c = code.trim().replace(/^rentplan-eq:/i, '').toLowerCase()
    if (!c) return
    const serial = idx.d.serials.find((s) => s.serial.toLowerCase() === c)
    const row = rows.find((r) => r.eq?.code?.toLowerCase() === c || r.equipmentId === serial?.equipmentId || r.eq?.name?.toLowerCase() === c)
    if (!row) toast(`« ${code} » ne fait pas partie de ce projet`, 'error')
    else onHit(row, serial)
    setCode('')
    ref.current?.focus()
  }
  return (
    <form className="lg-scan" onSubmit={submit}>
      <Icon name="qr_code_scanner" size={19} />
      <input ref={ref} className="lg-scan-input" placeholder={placeholder} value={code} onChange={(e) => setCode(e.target.value)} aria-label="Code à scanner" />
      <button className="btn btn-sm" type="submit">Valider</button>
    </form>
  )
}

const sorters = {
  emplacement: (a, b) => (a.eq?.location || 'zzz').localeCompare(b.eq?.location || 'zzz', 'fr', { numeric: true }) || (a.eq?.name || '').localeCompare(b.eq?.name || '', 'fr'),
  groupe: (a, b) => (a.groups[0] || '').localeCompare(b.groups[0] || '', 'fr') || (a.eq?.name || '').localeCompare(b.eq?.name || '', 'fr'),
  nom: (a, b) => (a.eq?.name || '').localeCompare(b.eq?.name || '', 'fr'),
}

function ItemName({ r }) {
  return (
    <div className="lg-item">
      <Link to={`/equipements/${r.equipmentId}`} className="lg-item-name">{r.eq?.name || 'Article'}</Link>
      <div className="lg-item-meta">
        {r.eq?.code && <span>{r.eq.code}</span>}
        {r.groups.length > 0 && <span>{r.groups.join(', ')}</span>}
        {r.eq?.kind === 'vente' && <span className="tag">Vente</span>}
        {r.eq?.type === 'case' && <span className="tag">Case</span>}
      </div>
      {r.contents.length > 0 && <div className="lg-item-contents"><Icon name="inventory_2" size={14} /> {r.contents.map((c) => `${c.qty} × ${c.name}`).join(', ')}</div>}
    </div>
  )
}

/* ---------- Préparation ---------- */
function Preparation({ project, sub, idx, data, canEdit, go }) {
  const { setBooking, setBookingDetails, book, setLogistics, setSubStatus, patch, autoAssignSerials } = useStore()
  const navigate = useNavigate()
  const [sort, setSort] = useState('emplacement')
  const [gen, setGen] = useState(false)
  const rows = [...data.rows].sort(sorters[sort])
  const { totals } = data
  const lg = sub.logistics || {}
  const allPrepared = totals.prepared >= totals.needed

  // Quantité préparée = ce qui n'est plus « à préparer » (prêt, parti ou revenu)
  const setPrepared = (r, v) => setBooking(sub.id, r.equipmentId, { pret: Math.max(0, Math.min(v, r.needed) - r.out) })
  const linesOf = (r) => (idx.linesBySub[sub.id] || []).filter((l) => l.equipmentId === r.equipmentId && !l.isOptional && l.relation !== 'contenu')
  // Un numéro inutilisable (réparation, perdu…) ou pris par un autre projet en même temps ne peut pas être préparé
  const issueOf = (r, serial) => {
    const line = linesOf(r)[0]
    return line ? serialIssue(serial, { ...line, serialIds: [] }, idx) : null
  }
  // Numéro scanné sans être prévu : il rejoint une ligne qui a de la place, sinon il remplace un numéro pas encore préparé
  const attach = (r, serial) => {
    const lines = linesOf(r)
    if (lines.some((l) => (l.serialIds || []).includes(serial.id))) return null
    const roomy = lines.find((l) => (l.serialIds || []).length < (Number(l.quantity) || 0))
    if (roomy) {
      patch('plannedEquipment', roomy.id, { serialIds: [...(roomy.serialIds || []), serial.id] })
      return null
    }
    for (const l of lines) {
      const victim = (l.serialIds || []).find((id) => !r.checkedSerials.includes(id))
      if (victim) {
        patch('plannedEquipment', l.id, { serialIds: l.serialIds.map((x) => (x === victim ? serial.id : x)) })
        return idx.d.serials.find((x) => x.id === victim)?.serial || null
      }
    }
    return null
  }
  const toggleSerial = (r, s) => {
    const on = r.checkedSerials.includes(s.id)
    if (!on) {
      const issue = issueOf(r, s)
      if (issue) return toast(`${s.serial} : ${issue}`, 'error')
      if (r.prepared >= r.needed) return toast(`${r.eq.name} : tout est déjà préparé (${r.needed})`, 'error')
    }
    setBookingDetails(sub.id, r.equipmentId, 'prep', { serials: on ? r.checkedSerials.filter((x) => x !== s.id) : [...r.checkedSerials, s.id] })
    if (!on) setPrepared(r, r.prepared + 1)
    if (on && r.pret > 0) setPrepared(r, r.prepared - 1)
  }
  const scan = (r, serial) => {
    if (serial && r.checkedSerials.includes(serial.id)) return toast(`${serial.serial} est déjà préparé`, 'error')
    if (r.prepared >= r.needed) return toast(`${r.eq.name} : tout est déjà préparé (${r.needed})`, 'error')
    if (r.serialized && !serial) return toast(`${r.eq.name} est suivi par numéro de série : scannez l’étiquette du numéro`, 'error')
    let replaced = null
    if (serial) {
      const issue = issueOf(r, serial)
      if (issue) return toast(`${serial.serial} : ${issue}`, 'error')
      replaced = attach(r, serial)
      setBookingDetails(sub.id, r.equipmentId, 'prep', { serials: [...r.checkedSerials, serial.id] })
    }
    setPrepared(r, r.prepared + 1)
    toast(`${r.eq.name}${serial ? ` (${serial.serial})` : ''} préparé · ${r.prepared + 1} / ${r.needed}${replaced ? ` · remplace ${replaced}` : ''}`)
  }
  const prepareAll = () => {
    for (const r of data.rows) {
      if (r.aPreparer > 0) book(sub.id, r.equipmentId, 'pret', r.aPreparer)
      // Numéros attribués cochés d'office
      if (r.serialized) setBookingDetails(sub.id, r.equipmentId, 'prep', { serials: [...new Set([...r.checkedSerials, ...r.serials.map((x) => x.id)])].slice(0, r.needed) })
    }
    toast('Tout le matériel est marqué comme préparé')
  }
  const validate = () => {
    setLogistics(sub.id, 'prep', { doneAt: new Date().toISOString(), by: currentUserName() })
    if (['concept', 'demande', 'option', 'confirme'].includes(sub.status)) setSubStatus(sub.id, 'pret')
    toast('Préparation validée · projet « Prêt »')
  }
  const depart = () => {
    const missing = totals.needed - totals.prepared
    if (missing > 0 && !confirm(`${missing} article(s) ne sont pas préparés. Faire partir uniquement le matériel prêt ?`)) return
    for (const r of data.rows) {
      if (r.pret > 0) book(sub.id, r.equipmentId, 'surSite', r.pret)
      // Les numéros préparés partent avec le matériel
      if (r.serialized && r.checkedSerials.length) setBookingDetails(sub.id, r.equipmentId, 'out', { serials: [...new Set([...r.outSerials, ...r.checkedSerials])] })
    }
    setLogistics(sub.id, 'out', stamp())
    if (['concept', 'demande', 'option', 'confirme', 'pret'].includes(sub.status)) setSubStatus(sub.id, 'sur_site')
    toast('Départ enregistré · projet « Sur site »')
    go('retour')
  }
  const readyToLeave = data.rows.reduce((s, r) => s + r.pret, 0)

  return (
    <div className="card">
      <div className="grid-toolbar lg-toolbar">
        {canEdit && <ScanField rows={data.rows} idx={idx} onHit={scan} placeholder="Scanner un code ou un n° de série à préparer…" />}
        <div className="btn-group" role="group" aria-label="Trier">
          {[['emplacement', 'Emplacement'], ['groupe', 'Groupe'], ['nom', 'Nom']].map(([k, l]) => <button key={k} className={`btn btn-sm ${sort === k ? 'on' : ''}`} onClick={() => setSort(k)}>{l}</button>)}
        </div>
        <span className="spacer" />
        <button className="btn-link" onClick={() => setGen(true)}><Icon name="print" size={18} /> Bon de préparation</button>
        {canEdit && !allPrepared && <button className="btn-link" onClick={prepareAll}><Icon name="done_all" size={18} /> Tout préparer</button>}
      </div>
      {lg.prep?.doneAt && <div className="lg-banner ok"><Icon name="task_alt" size={18} /> Préparation validée {when({ doneAt: lg.prep.doneAt, by: lg.prep.by })}{canEdit && <button className="btn-link" onClick={() => setLogistics(sub.id, 'prep', null)}>Annuler la validation</button>}</div>}
      <div className="table-wrap">
        <table className="table lg-table">
          <thead>
            <tr>
              <th className="check-col" />
              <th>Emplacement</th>
              <th>Équipement</th>
              <th>Numéros de série</th>
              <th className="num">Prévu</th>
              <th>Préparé</th>
              <th>Note de préparation</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const done = r.prepared >= r.needed
              return (
                <tr key={r.equipmentId} className={`lg-row ${done ? 'done' : r.prepared > 0 ? 'partial' : ''}`}>
                  <td className="check-col">
                    <input
                      type="checkbox"
                      checked={done}
                      disabled={!canEdit || (done && r.pret === 0)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          book(sub.id, r.equipmentId, 'pret', r.aPreparer)
                          if (r.serialized) setBookingDetails(sub.id, r.equipmentId, 'prep', { serials: [...new Set([...r.checkedSerials, ...r.serials.map((x) => x.id)])].slice(0, r.needed) })
                        } else {
                          setBooking(sub.id, r.equipmentId, { pret: 0 })
                          if (r.serialized) setBookingDetails(sub.id, r.equipmentId, 'prep', { serials: r.checkedSerials.filter((id) => r.outSerials.includes(id)) })
                        }
                      }}
                      aria-label={`${r.eq?.name} préparé`}
                    />
                  </td>
                  <td className="nowrap"><span className="tag"><Icon name="place" size={13} /> {r.eq?.location || '—'}</span></td>
                  <td><ItemName r={r} /></td>
                  <td>
                    {r.serialized ? (
                      <div className="lg-serials">
                        {r.serials.map((s) => {
                          const on = r.checkedSerials.includes(s.id)
                          const issue = !on && issueOf(r, s)
                          return (
                            <button key={s.id} type="button" className={`lg-serial ${on ? 'on' : ''} ${issue ? 'bad' : ''}`} disabled={!canEdit} onClick={() => toggleSerial(r, s)} title={on ? 'Préparé' : issue || 'Cliquer pour marquer comme préparé'}>
                              <Icon name={on ? 'check_circle' : issue ? 'error' : 'radio_button_unchecked'} size={14} /> {s.serial}
                            </button>
                          )
                        })}
                        {r.serials.length < r.needed && (
                          canEdit ? (
                            <button
                              type="button"
                              className="lg-serial missing"
                              onClick={() => {
                                const n = autoAssignSerials(linesOf(r).map((l) => l.id))
                                toast(n ? `${n} numéro${n > 1 ? 's' : ''} attribué${n > 1 ? 's' : ''}` : 'Aucun numéro libre : scannez ceux que vous prenez', n ? undefined : 'error')
                              }}
                              title="Attribuer des numéros libres (ou scannez directement ceux que vous prenez)"
                            >
                              <Icon name="auto_fix_high" size={14} /> {r.needed - r.serials.length} à attribuer
                            </button>
                          ) : <span className="muted small">{r.needed - r.serials.length} à attribuer</span>
                        )}
                      </div>
                    ) : <span className="muted small">—</span>}
                  </td>
                  <td className="num strong">{r.needed}</td>
                  <td>
                    <div className="row" style={{ gap: 8 }}>
                      {canEdit ? <QtyStepper value={r.prepared} onChange={(v) => setPrepared(r, v)} /> : <span className="mono">{r.prepared}</span>}
                      {r.out > 0 && <span className="muted small nowrap">dont {r.out} parti{r.out > 1 ? 's' : ''}</span>}
                    </div>
                  </td>
                  <td style={{ minWidth: 180 }}>
                    <input className="input input-sm lg-note" value={r.prepNote} disabled={!canEdit} placeholder="Ex. vérifier les câbles" onChange={(e) => setBookingDetails(sub.id, r.equipmentId, 'prep', { note: e.target.value })} aria-label={`Note de préparation : ${r.eq?.name}`} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="lg-foot">
        <div className="lg-foot-progress">
          <strong>{totals.prepared} / {totals.needed}</strong> préparés
          <span className="lg-bar wide"><i style={{ width: `${totals.needed ? Math.round((totals.prepared / totals.needed) * 100) : 0}%` }} /></span>
          {totals.out > 0 && <span className="muted">· {totals.out} parti{totals.out > 1 ? 's' : ''}</span>}
        </div>
        <span className="spacer" />
        {canEdit && (
          <>
            <button className="btn" disabled={!allPrepared || Boolean(lg.prep?.doneAt)} onClick={validate} title={allPrepared ? 'Le projet passe au statut « Prêt »' : 'Tout le matériel doit être préparé'}><Icon name="task_alt" size={18} /> Valider la préparation</button>
            <button className="btn btn-primary" disabled={!readyToLeave} onClick={depart} title="Le matériel préparé part : le projet passe « Sur site »"><Icon name="local_shipping" size={18} /> Départ du matériel{readyToLeave ? ` (${readyToLeave})` : ''}</button>
          </>
        )}
      </div>
      {gen && (
        <GenerateDocModal
          projectId={project.id}
          type="preparation"
          subs={[sub]}
          onClose={() => setGen(false)}
          onDone={(doc) => {
            afterGenerate(doc)
            setGen(false)
            toast(`Bon de préparation ${doc.number} généré`)
            navigate(`/documents/${doc.id}`)
          }}
        />
      )}
    </div>
  )
}

/* ---------- Retour ---------- */
// État de retour d'un numéro de série (null : pas encore revenu)
const SERIAL_RETURN = [
  ['ok', 'Revenu en bon état', 'check_circle', '#19b26b'],
  ['cleaning', 'Revenu à nettoyer', 'cleaning_services', '#b26a00'],
  ['damaged', 'Revenu endommagé (réparation)', 'build', '#e2284f'],
  ['lost', 'Perdu', 'report', '#5f6b7a'],
  [null, 'Pas encore revenu', 'schedule', '#b26a00'],
]

function ReturnView({ project, sub, idx, data, canEdit, go, suggestions }) {
  const { setBooking, setBookingDetails, setLogistics, setSubStatus, createRepair, patch, remove } = useStore()
  const access = useAccess()
  const canRepair = access.can('maintenance', 'modification') || access.can('equipements', 'modification')
  const rows = [...data.rows].sort(sorters.emplacement)
  const { totals } = data
  const lg = sub.logistics || {}
  const late = lateDays(sub, idx, totals)
  const t = subTimes(sub.id, idx)
  const closed = Boolean(lg.ret?.doneAt)

  // Revenu : ce qui est parti (ou prêt sans départ enregistré) revient ; le reste est encore dehors
  const setReturned = (r, v) => {
    const max = r.out + r.pret - r.perdu
    const back = Math.max(0, Math.min(v, max))
    let surSite = r.out - r.perdu - back
    let pret = r.pret
    if (surSite < 0) {
      pret = Math.max(0, pret + surSite)
      surSite = 0
    }
    setBooking(sub.id, r.equipmentId, { retourne: back, surSite, pret })
    const damaged = Math.min(r.damaged, back)
    if (damaged !== r.damaged || r.cleaning > back - damaged) setBookingDetails(sub.id, r.equipmentId, 'ret', { damaged, cleaning: Math.min(r.cleaning, back - damaged) })
  }
  const setLost = (r, v) => {
    const max = r.out + r.pret - r.retourne
    const lost = Math.max(0, Math.min(v, max))
    let surSite = r.out - r.retourne - lost
    let pret = r.pret
    if (surSite < 0) {
      pret = Math.max(0, pret + surSite)
      surSite = 0
    }
    setBooking(sub.id, r.equipmentId, { perdu: lost, surSite, pret })
  }
  // Numéros de série : chaque numéro parti reçoit un état ; les quantités du retour en découlent.
  // Perdu : le numéro passe « Perdu » (hors stock) ; endommagé : une réparation le rend indisponible.
  const setSerialStates = (r, changes) => {
    const states = { ...r.serialStates }
    for (const [id, st] of Object.entries(changes)) {
      if (st) states[id] = st
      else delete states[id]
    }
    const v = Object.values(states)
    const n = (k) => v.filter((x) => x === k).length
    const back = n('ok') + n('cleaning') + n('damaged')
    const lost = n('lost')
    let surSite = r.out - back - lost
    let pret = r.pret
    if (surSite < 0) {
      pret = Math.max(0, pret + surSite)
      surSite = 0
    }
    setBooking(sub.id, r.equipmentId, { retourne: back, perdu: lost, surSite, pret })
    const repairs = { ...r.serialRepairs }
    for (const [id, st] of Object.entries(changes)) {
      const prev = r.serialStates[id] || null
      const sn = idx.d.serials.find((x) => x.id === id)
      if (!sn || prev === st) continue
      if (st === 'lost') patch('serials', id, { status: 'perdu' })
      else if (prev === 'lost' && sn.status === 'perdu') patch('serials', id, { status: 'ok' })
      if (st === 'damaged' && canRepair && !repairs[id]) {
        const rep = createRepair({ equipmentId: r.equipmentId, serialId: id, quantity: 1, title: `Endommagé au retour — ${project.number} ${project.name}`, description: r.retNote || '', projectId: project.id, unavailable: true })
        repairs[id] = rep.id
        toast(`Réparation ${rep.number} créée pour ${sn.serial}`)
      }
      if (prev === 'damaged' && st !== 'damaged' && repairs[id]) {
        const rep = idx.d.repairs.find((x) => x.id === repairs[id])
        if (rep?.status === 'en_cours') remove('repairs', rep.id)
        delete repairs[id]
      }
    }
    setBookingDetails(sub.id, r.equipmentId, 'ret', { serialStates: states, cleaning: n('cleaning'), damaged: n('damaged'), serialRepairs: repairs })
  }
  const pending = (r) => r.tracked.filter((x) => !r.serialStates[x.id])
  const setCondition = (r, key, v) => {
    const other = key === 'damaged' ? r.cleaning : r.damaged
    setBookingDetails(sub.id, r.equipmentId, 'ret', { [key]: Math.max(0, Math.min(v, r.retourne - other)) })
  }
  const scan = (r, serial) => {
    if (r.serialized && serial) {
      if (r.serialStates[serial.id] === 'ok') return toast(`${serial.serial} est déjà revenu`, 'error')
      setSerialStates(r, { [serial.id]: 'ok' })
      return toast(`${r.eq.name} (${serial.serial}) revenu · ${r.retourne + (r.serialStates[serial.id] ? 0 : 1)} / ${r.out || r.needed}`)
    }
    if (r.serialized && r.tracked.length) return toast(`${r.eq.name} est suivi par numéro de série : scannez l’étiquette du numéro`, 'error')
    if (r.surSite + r.pret <= 0) return toast(`${r.eq.name} : tout est déjà revenu`, 'error')
    setReturned(r, r.retourne + 1)
    toast(`${r.eq.name} revenu · ${r.retourne + 1} / ${r.out || r.needed}`)
  }
  const allBack = () => {
    for (const r of data.rows) {
      if (r.serialized && pending(r).length) setSerialStates(r, Object.fromEntries(pending(r).map((x) => [x.id, 'ok'])))
      else if (r.surSite > 0) setReturned(r, r.retourne + r.surSite)
    }
    toast('Tout le matériel sorti est revenu')
  }
  const missingToLost = () => {
    if (!confirm(`Déclarer ${totals.surSite} article(s) encore dehors comme perdus ? Ils seront retirés du stock et un frais de remplacement sera proposé.`)) return
    for (const r of data.rows) {
      if (r.serialized && pending(r).length) setSerialStates(r, Object.fromEntries(pending(r).map((x) => [x.id, 'lost'])))
      else if (r.surSite > 0) setLost(r, r.perdu + r.surSite)
    }
    toast('Articles manquants déclarés perdus')
  }
  const repair = (r) => {
    const rep = createRepair({ equipmentId: r.equipmentId, quantity: r.damaged, title: `Endommagé au retour — ${project.number} ${project.name}`, description: r.retNote || '', projectId: project.id, unavailable: true })
    setBookingDetails(sub.id, r.equipmentId, 'ret', { repairId: rep.id })
    toast(`Réparation ${rep.number} créée · ${r.damaged} × ${r.eq.name} indisponible(s)`)
  }
  const close = () => {
    if (totals.surSite > 0 && !confirm(`${totals.surSite} article(s) ne sont pas revenus. Clôturer le retour quand même ? Ils resteront indisponibles jusqu’à leur retour.`)) return
    setLogistics(sub.id, 'ret', { doneAt: new Date().toISOString(), by: currentUserName() })
    if (sub.status !== 'retourne' && sub.status !== 'annule') setSubStatus(sub.id, 'retourne')
    const n = chargeSuggestions({ ...sub, logistics: { ...lg, ret: { doneAt: new Date().toISOString() } } }, idx).length
    toast(n ? `Retour clôturé · ${n} frais proposé${n > 1 ? 's' : ''}` : 'Retour clôturé · projet « Retourné »')
    if (n) go('frais')
  }

  return (
    <div className="card">
      <div className="grid-toolbar lg-toolbar">
        {canEdit && !closed && <ScanField rows={data.rows} idx={idx} onHit={scan} placeholder="Scanner un code ou un n° de série qui revient…" />}
        <span className="spacer" />
        {canEdit && !closed && totals.surSite > 0 && <button className="btn-link" onClick={allBack}><Icon name="done_all" size={18} /> Tout est revenu en bon état</button>}
      </div>
      {late > 0 && !closed && <div className="lg-banner warn"><Icon name="schedule" size={18} /> Retour en retard de {late} jour{late > 1 ? 's' : ''} : le matériel devait revenir le {fmtDateTime(t.planEnd)}.</div>}
      {totals.out === 0 && totals.prepared === 0 && <div className="lg-banner"><Icon name="info" size={18} /> Le matériel n’est pas encore parti. Préparez-le puis enregistrez le départ.<button className="btn-link" onClick={() => go('preparation')}>Préparation</button></div>}
      {closed && (
        <div className="lg-banner ok">
          <Icon name="task_alt" size={18} /> Retour clôturé {when({ doneAt: lg.ret.doneAt, by: lg.ret.by })}
          {canEdit && <button className="btn-link" onClick={() => setLogistics(sub.id, 'ret', null)}>Rouvrir le retour</button>}
        </div>
      )}
      <div className="table-wrap">
        <table className="table lg-table">
          <thead>
            <tr>
              <th>Équipement</th>
              <th className="num" title="Parti de l’entrepôt">Sorti</th>
              <th>Revenu</th>
              <th title="Parmi les articles revenus">Dont à nettoyer</th>
              <th title="Parmi les articles revenus">Dont endommagé</th>
              <th>Perdu</th>
              <th className="num" title="Ni revenu ni déclaré perdu">Encore dehors</th>
              <th>Constat</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              // Suivi par numéro : les quantités se règlent numéro par numéro (puces sous le nom)
              const bySerial = r.serialized && r.tracked.length > 0
              const edit = canEdit && !closed && !bySerial
              const state = r.surSite > 0 ? 'out' : r.damaged || r.perdu ? 'bad' : r.cleaning ? 'warn' : r.retourne > 0 ? 'done' : ''
              return (
                <tr key={r.equipmentId} className={`lg-row ${state}`}>
                  <td>
                    <ItemName r={r} />
                    {bySerial && (
                      <div className="lg-serials" style={{ marginTop: 6 }}>
                        {r.tracked.map((sn) => {
                          const st = SERIAL_RETURN.find(([k]) => k === (r.serialStates[sn.id] || null))
                          const chip = (
                            <button type="button" className={`lg-serial ret-${st[0] || 'out'}`} disabled={!canEdit || closed} title={st[1]}>
                              <Icon name={st[2]} size={14} /> {sn.serial}
                            </button>
                          )
                          return canEdit && !closed ? (
                            <Menu key={sn.id} align="left" width={250} trigger={chip} items={SERIAL_RETURN.map(([k, label, icon]) => ({ icon, label: k === (r.serialStates[sn.id] || null) ? `${label} ✓` : label, onClick: () => setSerialStates(r, { [sn.id]: k }) }))} />
                          ) : <span key={sn.id}>{chip}</span>
                        })}
                      </div>
                    )}
                  </td>
                  <td className="num strong">{r.out}{r.pret > 0 && <div className="muted small nowrap">+{r.pret} prêt{r.pret > 1 ? 's' : ''}</div>}</td>
                  <td>{edit ? <QtyStepper value={r.retourne} onChange={(v) => setReturned(r, v)} /> : <span className="mono">{r.retourne}</span>}</td>
                  <td>{edit ? <QtyStepper value={r.cleaning} onChange={(v) => setCondition(r, 'cleaning', v)} /> : <span className="mono">{r.cleaning}</span>}</td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      {edit ? <QtyStepper value={r.damaged} onChange={(v) => setCondition(r, 'damaged', v)} /> : <span className="mono">{r.damaged}</span>}
                      {r.damaged > 0 && !bySerial && (r.repairId ? (
                        <Link className="btn-link small nowrap" to="/maintenance" title="Voir la réparation"><Icon name="build" size={16} /> {idx.d.repairs.find((x) => x.id === r.repairId)?.number || 'Réparation'}</Link>
                      ) : canRepair && (
                        <button className="btn btn-sm nowrap" onClick={() => repair(r)} title="Crée une réparation : les articles endommagés deviennent indisponibles"><Icon name="build" size={16} /> Réparation</button>
                      ))}
                    </div>
                  </td>
                  <td>{edit ? <QtyStepper value={r.perdu} onChange={(v) => setLost(r, v)} /> : <span className="mono">{r.perdu}</span>}</td>
                  <td className={`num strong ${r.surSite > 0 ? 'lg-out' : 'muted'}`}>{r.surSite}</td>
                  <td style={{ minWidth: 180 }}>
                    <input className="input input-sm lg-note" value={r.retNote} disabled={!canEdit} placeholder="État, dégâts constatés…" onChange={(e) => setBookingDetails(sub.id, r.equipmentId, 'ret', { note: e.target.value })} aria-label={`Constat au retour : ${r.eq?.name}`} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="lg-foot">
        <div className="lg-chips">
          <span className="lg-chip ok"><strong>{totals.retourne - totals.cleaning - totals.damaged}</strong> en bon état</span>
          <span className="lg-chip warn"><strong>{totals.cleaning}</strong> à nettoyer</span>
          <span className="lg-chip bad"><strong>{totals.damaged}</strong> endommagé{totals.damaged > 1 ? 's' : ''}</span>
          <span className="lg-chip bad"><strong>{totals.perdu}</strong> perdu{totals.perdu > 1 ? 's' : ''}</span>
          <span className={`lg-chip ${totals.surSite ? 'out' : ''}`}><strong>{totals.surSite}</strong> encore dehors</span>
        </div>
        <span className="spacer" />
        {suggestions.length > 0 && <button className="btn-link" onClick={() => go('frais')}><Icon name="receipt_long" size={18} /> {suggestions.length} frais proposé{suggestions.length > 1 ? 's' : ''}</button>}
        {canEdit && !closed && (
          <>
            {totals.surSite > 0 && <button className="btn" onClick={missingToLost}><Icon name="report" size={18} /> Manquants → perdus</button>}
            <button className="btn btn-primary" disabled={totals.out + totals.pret === 0} onClick={close}><Icon name="assignment_turned_in" size={18} /> Clôturer le retour</button>
          </>
        )}
      </div>
    </div>
  )
}

/* ---------- Frais de retour ---------- */
function Charges({ sub, idx, canEdit, charges, suggestions, access }) {
  const { addReturnCharge, patch, remove, chargesToCosts, invoiceCharges } = useStore()
  const navigate = useNavigate()
  const canBill = access.can('projets', 'modification')
  const canInvoice = canBill && access.finances
  const cur = idx.settings.currency
  const fees = feeSettings(idx.settings)
  const list = charges.map((c) => ({ ...c, st: chargeStatus(c, idx, access.finances) })).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
  const open = list.filter((c) => c.st === 'a_facturer')
  const [sel, setSel] = useState(null)
  const selected = (sel || open.map((c) => c.id)).filter((id) => open.some((c) => c.id === id))
  const selTotal = open.filter((c) => selected.includes(c.id)).reduce((s, c) => s + chargeTotal(c), 0)
  const vatRate = Number(idx.settings.vatRate) || 0

  const add = (s) => addReturnCharge(sub.id, { kind: s.kind, equipmentId: s.equipmentId || null, label: s.label, quantity: s.quantity, price: s.price, note: s.reason || '' })
  const addKind = (kind) => {
    const price = { nettoyage: fees.nettoyage, entretien: fees.entretien, maintenance: fees.maintenance }[kind] ?? 0
    addReturnCharge(sub.id, { kind, label: CHARGE_KINDS[kind].label, quantity: 1, price: Number(price) || 0 })
  }
  const toCosts = () => {
    const n = chargesToCosts(selected)
    setSel(null)
    toast(`${n} frais ajouté${n > 1 ? 's' : ''} aux coûts supplémentaires du projet`)
  }
  const invoice = () => {
    const doc = invoiceCharges(sub.id, selected)
    if (!doc) return
    setSel(null)
    toast(`Facture ${doc.number} créée (${fmtMoney(selTotal, cur)} HT)`)
    navigate(`/documents/${doc.id}`)
  }
  const editable = (c) => canEdit && (c.st === 'a_facturer' || c.st === 'offert')
  const eqOptions = [...new Map((idx.linesBySub[sub.id] || []).map((l) => [l.equipmentId, idx.eq[l.equipmentId]]).filter(([, e]) => e)).values()]

  return (
    <div className="stack">
      {suggestions.length > 0 && (
        <div className="card lg-suggest">
          <div className="card-header">
            <Icon name="lightbulb" size={19} style={{ color: '#f08c00' }} />
            <span className="section-title">Frais proposés d’après le retour</span>
            <div className="actions">{canEdit && <button className="btn btn-sm btn-primary" onClick={() => { suggestions.forEach(add); toast(`${suggestions.length} frais ajoutés`) }}><Icon name="playlist_add" size={18} /> Tout ajouter</button>}</div>
          </div>
          <div className="lg-suggest-list">
            {suggestions.map((s) => (
              <div key={`${s.kind}-${s.equipmentId}`} className="lg-suggest-item">
                <span className={`lg-kind k-${s.kind}`}><Icon name={CHARGE_KINDS[s.kind].icon} size={18} /></span>
                <div className="lg-suggest-text"><strong>{s.label}</strong><span>{s.reason}</span></div>
                <span className="mono nowrap">{s.quantity} × {fmtMoney(s.price, cur)}</span>
                <strong className="mono nowrap">{fmtMoney(s.quantity * s.price, cur)}</strong>
                {canEdit && <button className="btn btn-sm" onClick={() => add(s)}><Icon name="add" size={17} /> Ajouter</button>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="grid-toolbar">
          <span className="muted small">Frais constatés au retour : nettoyage, entretien, réparation, remplacement du matériel perdu, retard… Ils sont facturés au client à part ou avec le projet.</span>
          <span className="spacer" />
          {canEdit && (
            <Menu
              width={250}
              trigger={<button className="btn btn-primary"><Icon name="add" /> Ajouter un frais</button>}
              items={Object.entries(CHARGE_KINDS).map(([k, v]) => ({ icon: v.icon, label: v.label, onClick: () => addKind(k) }))}
            />
          )}
        </div>
        {list.length === 0 ? (
          <Empty icon="receipt_long" title="Aucun frais de retour" text={suggestions.length ? 'Ajoutez les frais proposés ci-dessus, ou saisissez-en un.' : 'Les frais apparaissent ici quand du matériel revient sale, endommagé, perdu ou en retard. Vous pouvez aussi en saisir un.'} />
        ) : (
          <div className="table-wrap">
            <table className="table lg-table">
              <thead>
                <tr>
                  <th className="check-col">{canBill && open.length > 0 && <input type="checkbox" checked={open.every((c) => selected.includes(c.id))} onChange={(e) => setSel(e.target.checked ? open.map((c) => c.id) : [])} aria-label="Tout sélectionner" />}</th>
                  <th>Type</th>
                  <th>Libellé</th>
                  <th>Article</th>
                  <th className="num">Quantité</th>
                  <th className="num">Prix unitaire HT</th>
                  <th className="num">Total HT</th>
                  <th>Statut</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((c) => {
                  const st = CHARGE_STATUSES[c.st]
                  const doc = c.st === 'facture' && idx.d.documents.find((d) => d.id === c.invoiceId)
                  const ed = editable(c)
                  return (
                    <tr key={c.id} className={c.st === 'offert' ? 'lg-row muted-row' : 'lg-row'}>
                      <td className="check-col">{canBill && c.st === 'a_facturer' && <input type="checkbox" checked={selected.includes(c.id)} onChange={(e) => setSel(e.target.checked ? [...selected, c.id] : selected.filter((x) => x !== c.id))} aria-label={`Sélectionner ${c.label}`} />}</td>
                      <td><span className="lg-kind-cell"><span className={`lg-kind k-${c.kind}`}><Icon name={CHARGE_KINDS[c.kind]?.icon || 'receipt_long'} size={16} /></span> {CHARGE_KINDS[c.kind]?.label || c.kind}</span></td>
                      <td style={{ minWidth: 220 }}>
                        {ed ? <input className="input input-sm" style={{ maxWidth: 'none' }} value={c.label} onChange={(e) => patch('returnCharges', c.id, { label: e.target.value })} aria-label="Libellé" /> : <strong>{c.label}</strong>}
                        {ed ? <input className="input input-sm lg-note" style={{ marginTop: 4, maxWidth: 'none' }} value={c.note || ''} placeholder="Détail (visible sur la facture)" onChange={(e) => patch('returnCharges', c.id, { note: e.target.value })} aria-label="Détail" /> : c.note && <div className="small muted">{c.note}</div>}
                      </td>
                      <td>
                        {ed ? (
                          <select className="select input-sm" style={{ maxWidth: 200 }} value={c.equipmentId || ''} onChange={(e) => patch('returnCharges', c.id, { equipmentId: e.target.value || null })} aria-label="Article concerné">
                            <option value="">— Tout le projet —</option>
                            {eqOptions.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                          </select>
                        ) : <span className="small">{idx.eq[c.equipmentId]?.name || '—'}</span>}
                      </td>
                      <td className="num">{ed ? <NumInput style={{ width: 70 }} value={c.quantity} onChange={(v) => patch('returnCharges', c.id, { quantity: Math.max(0, v) })} /> : c.quantity}</td>
                      <td className="num">{ed ? <NumInput style={{ width: 90 }} value={c.price} onChange={(v) => patch('returnCharges', c.id, { price: v })} /> : fmtMoney(c.price, cur)}</td>
                      <td className="num mono strong">{c.st === 'offert' ? <s>{fmtMoney(chargeTotal(c), cur)}</s> : fmtMoney(chargeTotal(c), cur)}</td>
                      <td className="nowrap">
                        <Badge color={st.color}>{st.label}</Badge>
                        {doc && <Link to={`/documents/${doc.id}`} className="small" style={{ marginLeft: 6 }}>{doc.number}</Link>}
                      </td>
                      <td className="right">
                        {canEdit && (
                          <Menu
                            trigger={<button className="btn btn-ghost btn-icon btn-sm" aria-label="Plus d'options"><Icon name="more_vert" size={18} /></button>}
                            items={[
                              c.st === 'a_facturer' && { icon: 'redeem', label: 'Offrir (ne pas facturer)', onClick: () => patch('returnCharges', c.id, { status: 'offert' }) },
                              c.st === 'offert' && { icon: 'undo', label: 'Remettre à facturer', onClick: () => patch('returnCharges', c.id, { status: 'a_facturer' }) },
                              c.st === 'ajoute' && canBill && { icon: 'undo', label: 'Retirer des coûts du projet', onClick: () => { if (c.costId) remove('costs', c.costId); patch('returnCharges', c.id, { status: 'a_facturer', costId: null }) } },
                              (c.st === 'a_facturer' || c.st === 'offert') && '-',
                              (c.st === 'a_facturer' || c.st === 'offert') && { icon: 'delete', label: 'Supprimer', danger: true, onClick: () => remove('returnCharges', c.id) },
                            ]}
                          />
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {list.length > 0 && (
          <div className="lg-foot">
            <div className="lg-chips">
              {Object.entries(CHARGE_STATUSES).map(([k, v]) => {
                const items = list.filter((c) => c.st === k)
                return items.length ? <span key={k} className="lg-chip" style={{ borderColor: v.color, color: v.color }}><strong>{fmtMoney(items.reduce((s, c) => s + chargeTotal(c), 0), cur)}</strong> {v.label.toLowerCase()}</span> : null
              })}
            </div>
            <span className="spacer" />
            {open.length > 0 && (canBill ? (
              <>
                <span className="small muted">{selected.length} sélectionné{selected.length > 1 ? 's' : ''} · {fmtMoney(selTotal, cur)} HT · {fmtMoney(selTotal * (1 + vatRate / 100), cur)} TTC</span>
                <button className="btn" disabled={!selected.length} onClick={toCosts} title="Les frais rejoignent les coûts supplémentaires : la prochaine facture du projet les reprend"><Icon name="playlist_add" size={18} /> Ajouter aux coûts du projet</button>
                {canInvoice && <button className="btn btn-primary" disabled={!selected.length} onClick={invoice} title="Crée une facture qui ne contient que ces frais"><Icon name="receipt" size={18} /> Facture complémentaire</button>}
              </>
            ) : <span className="small muted">Une personne de l’équipe projet facturera ces frais.</span>)}
          </div>
        )}
      </div>
    </div>
  )
}
