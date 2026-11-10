import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useIdx, useStore, toast } from '../store'
import { Empty, Icon, QtyStepper } from './ui'
import { statusOf, subTimes, subWarehouse } from '../lib/model'
import { serialIssue } from '../lib/serials'
import { fmtDateTime } from '../lib/utils'

const TARGET_IDS = [
  { id: 'pret', status: 'pret' },
  { id: 'surSite', status: 'sur_site' },
  { id: 'retourne', status: 'retourne' },
]
const DEFAULT_LABELS = { aPreparer: 'À préparer', pret: 'Prêt', surSite: 'Sur site', retourne: 'Retourné', perdu: 'Perdu' }

/** Écran de réservation d'un sous-projet dans l'entrepôt. */
export default function BookingScreen({ subprojectId, defaultTarget }) {
  const idx = useIdx()
  const { book, bookAll, setBooking, setBookingDetails, setSubStatus } = useStore()
  // Configuration › Statuts d'entrepôt
  const L = { ...DEFAULT_LABELS, ...(idx.settings.warehouseLabels || {}) }
  const TARGETS = TARGET_IDS.map((x) => ({ ...x, label: L[x.id] }))
  const auto = Boolean(idx.settings.autoWarehouseStatus)
  const sub = idx.sub[subprojectId]
  const [target, setTarget] = useState(defaultTarget || (sub?.status === 'sur_site' ? 'retourne' : sub?.status === 'pret' ? 'surSite' : 'pret'))
  const [code, setCode] = useState('')
  const scanRef = useRef(null)
  // Statut proposé quand tout le matériel est prêt, sur site ou retourné
  const totalsAll = sub ? subWarehouse(subprojectId, idx).totals : null
  const allDone = (k) => totalsAll?.needed > 0 && totalsAll[k] >= totalsAll.needed
  const suggestion = !sub ? null : allDone('retourne') && sub.status !== 'retourne' ? 'retourne' : allDone('surSite') && !['sur_site', 'retourne'].includes(sub.status) ? 'sur_site' : allDone('pret') && sub.status === 'confirme' ? 'pret' : null
  useEffect(() => {
    if (!auto || !suggestion) return
    setSubStatus(subprojectId, suggestion)
    toast(`Statut du projet : ${statusOf(suggestion).label} (automatique)`)
  }, [auto, suggestion, subprojectId, setSubStatus])
  if (!sub) return null
  const wh = subWarehouse(subprojectId, idx)
  const t = subTimes(subprojectId, idx)
  const rows = wh.rows
    .map((r) => ({ ...r, eq: idx.eq[r.equipmentId] }))
    .sort((a, b) => (a.eq?.location || 'zzz').localeCompare(b.eq?.location || 'zzz', 'fr', { numeric: true }))

  if (!rows.length) return <Empty icon="inventory_2" title="Rien à réserver" text="Ce sous-projet ne contient pas de matériel de location." />

  const scan = (e) => {
    e.preventDefault()
    // Le QR de la fiche équipement porte « RENTPLAN-EQ:code »
    const c = code.trim().replace(/^rentplan-eq:/i, '').toLowerCase()
    if (!c) return
    const serial = idx.d.serials.find((s) => s.serial.toLowerCase() === c)
    const row = rows.find((r) => r.eq?.code?.toLowerCase() === c || r.equipmentId === serial?.equipmentId)
    const line = row && (idx.linesBySub[subprojectId] || []).find((l) => l.equipmentId === row.equipmentId && !l.isOptional)
    const issue = serial && line && target !== 'retourne' ? serialIssue(serial, { ...line, serialIds: [] }, idx) : null
    if (!row) toast(`« ${code} » ne fait pas partie de ce projet`, 'error')
    else if (issue) toast(`${serial.serial} : ${issue}`, 'error')
    else {
      const movable = { pret: row.aPreparer, surSite: row.pret + row.aPreparer, retourne: row.surSite }[target]
      if (movable <= 0) toast(`${row.eq.name} : rien à enregistrer vers « ${TARGETS.find((x) => x.id === target).label} »`, 'error')
      else {
        book(subprojectId, row.equipmentId, target, 1)
        // Le numéro scanné est suivi comme dans l'onglet Préparation & retour du projet
        if (serial) {
          const det = row.booking?.details || {}
          const add = (list) => [...new Set([...(list || []), serial.id])]
          if (target === 'pret') setBookingDetails(subprojectId, row.equipmentId, 'prep', { serials: add(det.prep?.serials) })
          if (target === 'surSite') {
            setBookingDetails(subprojectId, row.equipmentId, 'prep', { serials: add(det.prep?.serials) })
            setBookingDetails(subprojectId, row.equipmentId, 'out', { serials: add(det.out?.serials) })
          }
          if (target === 'retourne') setBookingDetails(subprojectId, row.equipmentId, 'ret', { serialStates: { ...(det.ret?.serialStates || {}), [serial.id]: 'ok' } })
        }
        toast(`${row.eq.name}${serial ? ` (${serial.serial})` : ''} → ${TARGETS.find((x) => x.id === target).label}`)
      }
    }
    setCode('')
    scanRef.current?.focus()
  }

  const total = wh.totals

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="row wrap" style={{ gap: 18 }}>
        <span className="muted small">
          Planification : {fmtDateTime(t.planStart)} → {fmtDateTime(t.planEnd)}
        </span>
        <span className="spacer" />
        {[
          [L.aPreparer, total.aPreparer, '#8a929c'],
          [L.pret, total.pret, '#1f87e5'],
          [L.surSite, total.surSite, '#0e9f9a'],
          [L.retourne, total.retourne, '#5f6b7a'],
          [L.perdu, total.perdu, '#e2284f'],
        ].map(([l, n, c]) => (
          <span key={l} className="wh-count" style={{ borderColor: c, color: c }}>
            <strong>{n}</strong> {l}
          </span>
        ))}
      </div>

      {suggestion && !auto && (
        <div className="alert alert-success">
          <Icon name="check_circle" size={18} />
          <div style={{ flex: 1 }}>Tout le matériel est synchronisé. Passer le sous-projet au statut « {statusOf(suggestion).label} » ?</div>
          <button
            className="btn btn-sm btn-primary"
            onClick={() => {
              setSubStatus(subprojectId, suggestion)
              toast(`Statut : ${statusOf(suggestion).label}`)
            }}
          >
            Changer le statut
          </button>
        </div>
      )}

      <div className="row wrap" style={{ gap: 10 }}>
        <span className="small strong">Enregistrer vers</span>
        <div className="btn-group">
          {TARGETS.map((x) => (
            <button key={x.id} className={`btn btn-sm ${target === x.id ? 'on' : ''}`} onClick={() => setTarget(x.id)}>
              {x.label}
            </button>
          ))}
        </div>
        <form className="scan" onSubmit={scan}>
          <div className="search" style={{ width: 300 }}>
            <Icon name="qr_code_scanner" size={19} className="icon" />
            <input ref={scanRef} className="input input-sm" placeholder="Scanner un code ou un n° de série…" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Code à scanner" />
          </div>
          <button className="btn btn-sm" type="submit">Valider</button>
        </form>
        <span className="spacer" />
        <button className="btn-link" onClick={() => bookAll(subprojectId, target)}>
          <Icon name="done_all" size={18} /> Tout enregistrer
        </button>
        <button className="btn btn-sm btn-icon" title="Imprimer le bon de préparation" onClick={() => window.print()}>
          <Icon name="print" size={18} />
        </button>
      </div>

      <div className="table-wrap card">
        <table className="table table-compact">
          <thead>
            <tr>
              <th>Emplacement</th>
              <th>Équipement</th>
              <th className="num">Prévu</th>
              <th className="num">{L.aPreparer}</th>
              <th>{L.pret}</th>
              <th>{L.surSite}</th>
              <th>{L.retourne}</th>
              <th>{L.perdu}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const synced = r[target] >= r.needed
              return (
                <tr key={r.equipmentId} className={synced ? 'pack-row done' : ''}>
                  <td className="nowrap"><span className="tag"><Icon name="place" size={13} /> {r.eq?.location || '—'}</span></td>
                  <td>
                    <Link to={`/equipements/${r.equipmentId}`} className="strong" style={{ color: 'var(--text)' }}>{r.eq?.name}</Link>
                    <div className="small muted">{r.eq?.code}</div>
                  </td>
                  <td className="num strong">{r.needed}</td>
                  <td className="num">{r.aPreparer}</td>
                  {['pret', 'surSite', 'retourne', 'perdu'].map((k) => (
                    <td key={k}>
                      <QtyStepper value={r[k]} onChange={(v) => setBooking(subprojectId, r.equipmentId, { [k]: v })} />
                    </td>
                  ))}
                  <td className="right nowrap">
                    <button className="btn btn-ghost btn-sm" onClick={() => book(subprojectId, r.equipmentId, target, r.needed)} title="Tout enregistrer pour cette ligne">
                      <Icon name="arrow_forward" size={17} /> {TARGETS.find((x) => x.id === target).label}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
