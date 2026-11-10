import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useIdx, useStore, toast } from '../store'
import { currentUserName } from '../lib/auth'
import { Avatar, Empty, Icon, Menu, Modal } from '../components/ui'
import BookingScreen from '../components/BookingScreen'
import QrCode from '../components/QrCode'
import { assignmentSlots, assignmentTimes, PROJECT_STATUSES, statusOf, subShortages, subTimes, subWarehouse, warehouseColumn } from '../lib/model'
import { addDays, contactName, fmtDate, fmtDateTime, fmtTime, matches, overlaps, parse, personName, startOfDay, toDateInput, uid } from '../lib/utils'

const COLUMNS = [
  { id: 'a_preparer', label: 'À préparer' },
  { id: 'pret', label: 'Prêt' },
  { id: 'site', label: 'Sur site' },
  { id: 'retarde', label: 'Retardé' },
]

export default function WarehousePage() {
  const idx = useIdx()
  const [day, setDay] = useState(() => startOfDay(new Date()))
  const [view, setView] = useState('tuiles')
  const [q, setQ] = useState('')
  const [siteTab, setSiteTab] = useState('sur_site')
  const [locations, setLocations] = useState([])
  const [open, setOpen] = useState([])
  const [booking, setBooking] = useState(null)
  const [scanOpen, setScanOpen] = useState(false)
  const today = startOfDay(new Date())

  const boxes = useMemo(() => {
    const out = { a_preparer: [], pret: [], sur_site: [], retour_attendu: [], retarde: [] }
    for (const sub of idx.d.subprojects) {
      const p = idx.project[sub.projectId]
      if (!p) continue
      if (locations.length && !locations.includes(p.stockLocationId)) continue
      if (!matches(q, p.name, p.number, sub.name, contactName(idx.contact[p.clientId]))) continue
      const col = warehouseColumn(sub, idx, day)
      if (col) out[col].push(sub)
    }
    return out
  }, [idx, day, q, locations])

  const d1 = addDays(day, 1)
  const trips = idx.d.assignments.filter((a) => a.vehicleId && idx.sub[a.subprojectId]?.status !== 'annule').flatMap((a) => assignmentSlots(a, idx).map((t) => ({ a, ...t }))).filter((x) => overlaps(parse(x.start), parse(x.end), day, d1))
  const crew = idx.d.assignments.filter((a) => a.crewId && idx.sub[a.subprojectId]?.status !== 'annule').flatMap((a) => assignmentSlots(a, idx).map((t) => ({ a, ...t }))).filter((x) => overlaps(parse(x.start), parse(x.end), day, d1))
  const toggle = (k) => setOpen(open.includes(k) ? open.filter((x) => x !== k) : [...open, k])
  const pctDay = (s) => Math.max(0, Math.min(100, ((parse(s) - day) / 86400000) * 100))
  const isToday = day.getTime() === today.getTime()
  const isTomorrow = day.getTime() === addDays(today, 1).getTime()
  const card = (sub) => <BoxCard key={sub.id} sub={sub} idx={idx} onBook={() => setBooking(sub.id)} />

  const dayTimeline = (items, label) => (
    <div className="tl">
      <div style={{ minWidth: 900 }}>
        <div className="tl-row head">
          <div className="tl-label">{label}</div>
          <div className="tl-days" style={{ gridTemplateColumns: 'repeat(24, 1fr)' }}>{Array.from({ length: 24 }, (_, h) => <div key={h}>{String(h).padStart(2, '0')}:00</div>)}</div>
        </div>
        {items.length === 0 && <div className="muted small" style={{ padding: 14 }}>Aucun élément sélectionné pour ce jour.</div>}
        {items.map(({ key, name, bars }) => (
          <div key={key} className="tl-row">
            <div className="tl-label">{name}</div>
            <div className="tl-track">
              <div className="tl-grid" style={{ gridTemplateColumns: 'repeat(24, 1fr)' }}>{Array.from({ length: 24 }, (_, h) => <div key={h} />)}</div>
              {bars.map((b) => (
                <div key={b.id} className="tl-bar subrent" style={{ left: `${pctDay(b.start)}%`, width: `${Math.max(1, pctDay(b.end) - pctDay(b.start))}%`, top: 6 }} title={b.label}>{b.label}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
  const group = (list, keyFn, nameFn, labelFn) => {
    const m = new Map()
    for (const x of list) {
      const k = keyFn(x)
      if (!m.has(k)) m.set(k, { key: k, name: nameFn(x), bars: [] })
      m.get(k).bars.push({ id: `${x.a.id}-${x.start}`, start: x.start, end: x.end, label: labelFn(x) })
    }
    return [...m.values()]
  }

  return (
    <>
      <div className="wh-toolbar">
        <div className="tl-range" style={{ height: 40 }}>
          <button onClick={() => setDay(addDays(day, -1))} aria-label="Jour précédent"><Icon name="chevron_left" /></button>
          <label className="date-picker" onClick={(e) => { try { e.currentTarget.querySelector('input')?.showPicker?.() } catch { /* sélecteur déjà ouvert */ } }}>
            {day.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
            <input type="date" value={toDateInput(day)} onChange={(e) => e.target.value && setDay(startOfDay(new Date(`${e.target.value}T00:00`)))} aria-label="Date" />
          </label>
          <button onClick={() => setDay(addDays(day, 1))} aria-label="Jour suivant"><Icon name="chevron_right" /></button>
        </div>
        <div className="btn-group">
          <button className={`btn ${isToday ? 'on' : ''}`} onClick={() => setDay(today)}>Aujourd'hui</button>
          <button className={`btn ${isTomorrow ? 'on' : ''}`} onClick={() => setDay(addDays(today, 1))}>Demain</button>
        </div>
        <Menu
          width={280}
          trigger={<button className="btn btn-outline"><Icon name="warehouse" size={19} /> {locations.length ? `${locations.length} emplacement(s)` : 'Tous les emplacements de stock'} <Icon name="arrow_drop_down" /></button>}
        >
          <div className="popover-head">Filtrer par emplacement de stock</div>
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {idx.d.stockLocations.filter((l) => !l.archived).map((l) => (
              <label key={l.id} className="check"><input type="checkbox" checked={!locations.length || locations.includes(l.id)} onChange={(e) => { const all = locations.length ? locations : idx.d.stockLocations.map((x) => x.id); setLocations(e.target.checked ? [...new Set([...all, l.id])] : all.filter((x) => x !== l.id)) }} /> {l.name}</label>
            ))}
            <button className="btn-link" onClick={() => setLocations([])}>Tout sélectionner</button>
          </div>
        </Menu>
        <span className="spacer" />
        <Menu
          trigger={<button className="btn"><Icon name="list" size={19} /> Ajuster l'affichage <Icon name="arrow_drop_down" /></button>}
          items={[
            { icon: 'view_column', label: 'Tuiles', onClick: () => setView('tuiles') },
            { icon: 'list', label: 'Liste', onClick: () => setView('liste') },
          ]}
        />
        <div className="search underline" style={{ width: 200 }}>
          <Icon name="search" size={18} className="icon" />
          <input className="input" placeholder="Rechercher un projet" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={() => setScanOpen(true)}><Icon name="qr_code_scanner" size={19} /> Scanner retour</button>
      </div>

      <div className="card collapse-card">
        <div className="collapse-head" onClick={() => toggle('transports')}>Transports <span className="muted count-inline">({trips.length})</span><Icon name={open.includes('transports') ? 'expand_less' : 'expand_more'} /></div>
        {open.includes('transports') && dayTimeline(group(trips, (x) => x.a.vehicleId, (x) => `${idx.vehicle[x.a.vehicleId]?.name} · ${idx.vehicle[x.a.vehicleId]?.plate}`, (x) => `${idx.project[x.a.projectId]?.name} (${fmtTime(x.start)}–${fmtTime(x.end)})`), 'Véhicules')}
      </div>
      <div className="card collapse-card">
        <div className="collapse-head" onClick={() => toggle('crew')}>Personnel planifié <span className="muted count-inline">({crew.length})</span><Icon name={open.includes('crew') ? 'expand_less' : 'expand_more'} /></div>
        {open.includes('crew') && dayTimeline(group(crew, (x) => x.a.crewId, (x) => personName(idx.crew[x.a.crewId]), (x) => `${idx.fn[x.a.functionId]?.name} · ${idx.project[x.a.projectId]?.name}`), 'Membres du personnel')}
      </div>

      {view === 'tuiles' ? (
        <div className="kanban">
          <div>
            <div className="kan-head">À préparer ({boxes.a_preparer.length})</div>
            <div className="kan-col">{boxes.a_preparer.length ? boxes.a_preparer.map(card) : <div className="kan-empty"><Icon name="info" size={18} /> Aucun projet</div>}</div>
          </div>
          <div>
            <div className="kan-head">Prêt ({boxes.pret.length})</div>
            <div className="kan-col">{boxes.pret.length ? boxes.pret.map(card) : <div className="kan-empty"><Icon name="info" size={18} /> Aucun projet</div>}</div>
          </div>
          <div>
            <div className="kan-head">
              <button className={siteTab === 'sur_site' ? 'on' : ''} onClick={() => setSiteTab('sur_site')}>Sur site ({boxes.sur_site.length})</button>
              <button className={siteTab === 'retour_attendu' ? 'on' : ''} onClick={() => setSiteTab('retour_attendu')}>Retour attendu ({boxes.retour_attendu.length})</button>
            </div>
            <div className="kan-col">{boxes[siteTab].length ? boxes[siteTab].map(card) : <div className="kan-empty"><Icon name="info" size={18} /> Aucun projet</div>}</div>
          </div>
          <div>
            <div className="kan-head">Retardé ({boxes.retarde.length})</div>
            <div className="kan-col">{boxes.retarde.length ? boxes.retarde.map(card) : <div className="kan-empty"><Icon name="info" size={18} /> Aucun retard</div>}</div>
          </div>
        </div>
      ) : (
        <WarehouseList boxes={boxes} idx={idx} onBook={setBooking} />
      )}

      {booking && (
        <Modal title={`Enregistrer — ${idx.project[idx.sub[booking]?.projectId]?.name}`} size="xl" onClose={() => setBooking(null)}>
          <BookingScreen subprojectId={booking} />
        </Modal>
      )}
      {scanOpen && <ScanReturn idx={idx} onClose={() => setScanOpen(false)} />}
    </>
  )
}

function BoxCard({ sub, idx, onBook }) {
  const store = useStore()
  const navigate = useNavigate()
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const p = idx.project[sub.projectId]
  const t = subTimes(sub.id, idx)
  const wh = subWarehouse(sub.id, idx).totals
  const short = subShortages(sub.id, idx).length > 0
  const back = ['sur_site'].includes(sub.status)
  const progress = wh.needed ? (back ? wh.retourne : wh.pret + wh.surSite + wh.retourne) / wh.needed : 0
  const notes = idx.d.notes.filter((n) => n.projectId === p.id && (!n.subprojectId || n.subprojectId === sub.id) && n.scope === 'entrepot').sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  const manager = idx.d.crew.find((c) => personName(c) === p.accountManager)
  const multi = (idx.subsByProject[p.id] || []).length > 1
  return (
    <div className="kan-card">
      <div className="kan-card-head">
        <Icon name="category" size={18} style={{ color: short ? 'var(--danger)' : 'var(--success)' }} title={short ? 'Pénurie de matériel de location' : 'Tout le matériel de location est réservé'} />
        <span className="t" title={p.name}>{p.name}{multi ? ` — ${sub.name}` : ''}</span>
        <button className="btn btn-ghost btn-icon btn-sm" title="Créer un bon de préparation" onClick={onBook} aria-label="Imprimer"><Icon name="print" size={18} /></button>
        <button className="btn btn-ghost btn-icon btn-sm" title="Ouvrir le projet" onClick={() => navigate(`/projets/${p.id}?sp=${sub.id}&tab=equipement`)} aria-label="Ouvrir le projet"><Icon name="launch" size={18} /></button>
      </div>
      <div className="kan-progress"><div style={{ width: `${Math.round(progress * 100)}%` }} /></div>
      <div className="kan-body">
        <div className="info">
          <div>{p.number} · <Icon name="warehouse" size={14} style={{ color: 'var(--primary)', verticalAlign: -2 }} /> {idx.location[p.stockLocationId]?.name || 'Entrepôt'}</div>
          <div>{contactName(idx.contact[p.clientId])}</div>
          <div style={{ marginTop: 8 }}><strong>{back ? 'Fin de la période de planification' : 'Début de la période de planification'}</strong></div>
          <div className="mono" style={{ color: 'var(--text)' }}>{fmtDate(back ? t.planEnd : t.planStart)} &nbsp; {fmtTime(back ? t.planEnd : t.planStart)}</div>
        </div>
        <QrCode text={`RENTPLAN:${p.number}:${sub.id}`} />
      </div>
      <div className="kan-notes">
        <div className="head">
          <span className={`n ${notes.length ? 'has' : ''}`}>{notes.length}</span> Notes
          <span className="spacer" />
          <button className="btn-link" onClick={() => setAdding(!adding)}><Icon name="add" size={16} /> Ajouter une note</button>
        </div>
        {adding && (
          <form
            style={{ marginTop: 8 }}
            onSubmit={(e) => {
              e.preventDefault()
              if (!text.trim()) return
              store.upsert('notes', { id: uid('nt_'), projectId: p.id, subprojectId: sub.id, scope: 'entrepot', text: text.trim(), author: currentUserName(), createdAt: new Date().toISOString() })
              setText('')
              setAdding(false)
            }}
          >
            <textarea className="textarea" style={{ minHeight: 60 }} autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Ex. vérifier l'état des câbles au retour" />
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 6 }}>
              <button type="button" className="btn btn-sm" onClick={() => setAdding(false)}>Annuler</button>
              <button type="submit" className="btn btn-sm btn-primary">Enregistrer</button>
            </div>
          </form>
        )}
        {notes[0] && (
          <div className="note">
            <div className="who">{notes[0].author}</div>
            <div>{notes[0].text}</div>
            <div className="who">{p.name}</div>
          </div>
        )}
      </div>
      <div className="kan-foot">
        {manager ? <Avatar person={manager} /> : <span className="avatar" style={{ background: '#c2c7ce' }}>?</span>}
        <span className="spacer" />
        <Menu
          trigger={<button className="btn-link">Changer le statut</button>}
          items={PROJECT_STATUSES.filter((s) => s.id !== sub.status).map((s) => ({ icon: 'fiber_manual_record', label: s.label, onClick: () => { store.setSubStatus(sub.id, s.id); toast(`« ${p.name} » → ${s.label}`) } }))}
        />
        <button className="btn-link" onClick={onBook}>Enregistrer</button>
      </div>
    </div>
  )
}

function WarehouseList({ boxes, idx, onBook }) {
  const navigate = useNavigate()
  const groups = [
    ['À préparer', boxes.a_preparer],
    ['Prêt', boxes.pret],
    ['Sur site', boxes.sur_site],
    ['Retour attendu', boxes.retour_attendu],
    ['Retardé', boxes.retarde],
  ]
  const all = groups.reduce((n, [, l]) => n + l.length, 0)
  if (!all) return <div className="card" style={{ marginTop: 10 }}><Empty icon="warehouse" title="Aucun projet pour ce jour" /></div>
  return (
    <div className="card" style={{ marginTop: 10 }}>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th style={{ width: 54 }}>Couleur</th><th style={{ width: 60 }}>Pénurie</th><th>Nom</th><th>Numéro</th><th>Statut d'entrepôt de l'équipement</th><th>Emplacement de stock</th><th>Client</th><th>Début de planification</th><th /></tr>
          </thead>
          <tbody>
            {groups.map(([label, list]) =>
              list.length
                ? [
                    <tr key={label} className="group-row"><td colSpan={9}>{label} ({list.length})</td></tr>,
                    ...list.map((sub) => {
                      const p = idx.project[sub.projectId]
                      const wh = subWarehouse(sub.id, idx).totals
                      const st = statusOf(sub.status)
                      const target = { confirme: 'aPreparer', pret: 'pret', sur_site: 'surSite', retourne: 'retourne' }[sub.status]
                      const synced = target && wh[target === 'aPreparer' ? 'aPreparer' : target] === wh.needed
                      const sync = synced ? '#19b26b' : label === 'Retardé' ? '#e2284f' : '#f0a000'
                      return (
                        <tr key={sub.id} className="clickable" onClick={() => onBook(sub.id)}>
                          <td><span className="color-dot big" style={{ background: sync }} title={synced ? 'Tout le matériel est synchronisé avec le statut du projet' : label === 'Retardé' ? 'Du matériel a été oublié' : 'Une partie du matériel a un autre statut'} /></td>
                          <td>{subShortages(sub.id, idx).length ? <Icon name="category" size={19} style={{ color: 'var(--danger)' }} title="Pénurie" /> : <Icon name="category" size={19} style={{ color: 'var(--success)' }} title="Tout est réservé" />}</td>
                          <td className="strong">{p.name}{(idx.subsByProject[p.id] || []).length > 1 ? ` — ${sub.name}` : ''}</td>
                          <td className="mono">{p.number}</td>
                          <td>
                            <span className="wh-pills">
                              <span className="wh-pill" title="À préparer">{wh.aPreparer}</span>
                              <span className="wh-pill blue" title="Prêt">{wh.pret}</span>
                              <span className="wh-pill yellow" title="Sur site">{wh.surSite}</span>
                              <span className="wh-pill green" title="Retourné">{wh.retourne}</span>
                            </span>
                          </td>
                          <td>{idx.location[p.stockLocationId]?.name}</td>
                          <td>{contactName(idx.contact[p.clientId])}</td>
                          <td className="nowrap">{fmtDateTime(subTimes(sub.id, idx).planStart)}</td>
                          <td className="right" onClick={(e) => e.stopPropagation()}>
                            <span className="badge" style={{ color: st.color }}><span className="dot" />{st.label}</span>
                            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => navigate(`/projets/${p.id}?sp=${sub.id}`)} aria-label="Ouvrir le projet"><Icon name="launch" size={17} /></button>
                          </td>
                        </tr>
                      )
                    }),
                  ]
                : null,
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** « Scanner retour » : renvoie du matériel de plusieurs projets sans ouvrir chacun d'eux. */
function ScanReturn({ idx, onClose }) {
  const store = useStore()
  const [code, setCode] = useState('')
  const [log, setLog] = useState([])
  const ref = useRef(null)
  const scan = (e) => {
    e.preventDefault()
    const c = code.trim().toLowerCase()
    setCode('')
    if (!c) return
    const serial = idx.d.serials.find((s) => s.serial.toLowerCase() === c)
    const eq = serial ? idx.eq[serial.equipmentId] : idx.d.equipment.find((x) => x.code?.toLowerCase() === c)
    if (!eq) {
      setLog([{ ok: false, text: `« ${code} » : code inconnu` }, ...log])
      return
    }
    // Le projet sur site qui a ce matériel depuis le plus longtemps
    const candidates = idx.d.bookings.filter((b) => b.equipmentId === eq.id && Number(b.surSite) > 0).sort((a, b) => String(subTimes(a.subprojectId, idx).planEnd).localeCompare(String(subTimes(b.subprojectId, idx).planEnd)))
    const bk = candidates[0]
    if (!bk) {
      setLog([{ ok: false, text: `${eq.name} : aucun projet sur site avec cet équipement` }, ...log])
      return
    }
    store.book(bk.subprojectId, eq.id, 'retourne', 1)
    setLog([{ ok: true, text: `${eq.name}${serial ? ` (${serial.serial})` : ''} retourné depuis « ${idx.project[bk.projectId]?.name} »` }, ...log])
    ref.current?.focus()
  }
  return (
    <Modal title="Scanner retour" onClose={onClose}>
      <p className="muted small" style={{ marginTop: 0 }}>Scannez les équipements qui reviennent : ils sont retournés automatiquement sur le bon projet.</p>
      <form className="scan" onSubmit={scan}>
        <div className="search" style={{ flex: 1 }}>
          <Icon name="qr_code_scanner" size={19} className="icon" />
          <input ref={ref} className="input" autoFocus placeholder="Code équipement ou numéro de série (ex. SON-020, CL5-1001)" value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
        <button className="btn btn-primary" type="submit">Valider</button>
      </form>
      <div className="list" style={{ marginTop: 12, maxHeight: 300, overflow: 'auto' }}>
        {log.map((l, i) => (
          <div key={i} className="list-item">
            <Icon name={l.ok ? 'check_circle' : 'error'} size={19} style={{ color: l.ok ? 'var(--success)' : 'var(--danger)' }} />
            {l.text}
          </div>
        ))}
      </div>
    </Modal>
  )
}
