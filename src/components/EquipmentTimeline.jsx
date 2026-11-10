import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useIdx } from '../store'
import { Icon, Menu } from './ui'
import { available, groupTimes, lineConsumes, peakOf, stockOf, SUBRENT_COUNTS, subtractsAvailability, statusOf } from '../lib/model'
import { addDays, overlaps, parse, startOfDay } from '../lib/utils'

const ZOOMS = [7, 14, 28, 56]

/** Chronologie d'un équipement : disponibilité, stock entrepôt, projets, sous-locations, réparations. */
export default function EquipmentTimeline({ equipmentId, subprojectId, start, onClose }) {
  const idx = useIdx()
  const eq = idx.eq[equipmentId]
  const [zoom, setZoom] = useState(1)
  const span = ZOOMS[zoom]
  const [from, setFrom] = useState(() => addDays(startOfDay(start ? parse(start) : new Date()), -2))
  const ref = useRef(null)
  // Accolades obligatoires : scrollIntoView renvoie une promesse dans les navigateurs récents
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [equipmentId])

  const to = addDays(from, span)
  const days = useMemo(() => Array.from({ length: span }, (_, i) => addDays(from, i)), [from, span])
  const pct = (d) => Math.max(0, Math.min(100, ((d - from) / (to - from)) * 100))

  const rows = useMemo(() => {
    if (!eq) return null
    const own = (idx.events[equipmentId] || []).filter((e) => e.kind !== 'souslocation')
    const perDay = days.map((d) => {
      const n = addDays(d, 1)
      return { total: available(idx, equipmentId, d, n), stock: stockOf(eq, idx) - peakOf(own, d, n) }
    })
    const seg = (key) => {
      const out = []
      perDay.forEach((v, i) => {
        const last = out[out.length - 1]
        if (last && last.value === v[key]) last.to = i + 1
        else out.push({ from: i, to: i + 1, value: v[key] })
      })
      return out
    }
    // Projets : quantité par sous-projet sur sa période de planification
    const bySub = {}
    for (const l of idx.linesByEq[equipmentId] || []) {
      if (!lineConsumes(l, idx)) continue
      const sub = idx.sub[l.subprojectId]
      if (!sub || (!subtractsAvailability(sub.status) && sub.id !== subprojectId)) continue
      const t = groupTimes(idx.group[l.groupId], idx)
      if (!t.planStart) continue
      const b = (bySub[sub.id] ||= { sub, qty: 0, s: parse(t.planStart), e: parse(t.planEnd) })
      b.qty += Number(l.quantity) || 0
      if (parse(t.planStart) < b.s) b.s = parse(t.planStart)
      if (parse(t.planEnd) > b.e) b.e = parse(t.planEnd)
    }
    const lanes = (items) => {
      const ends = []
      return items
        .sort((a, b) => a.s - b.s)
        .map((it) => {
          let lane = ends.findIndex((e) => e <= it.s)
          if (lane === -1) {
            lane = ends.length
            ends.push(it.e)
          } else ends[lane] = it.e
          return { ...it, lane }
        })
    }
    const projects = lanes(Object.values(bySub).filter((b) => overlaps(b.s, b.e, from, to)))
    const subrents = lanes(
      idx.d.subrents
        .filter((sr) => SUBRENT_COUNTS.includes(sr.status) && sr.startsAt)
        .flatMap((sr) => (sr.lines || []).filter((l) => l.equipmentId === equipmentId).map((l) => ({ sr, qty: l.quantity, s: parse(sr.startsAt), e: parse(sr.endsAt) })))
        .filter((x) => overlaps(x.s, x.e, from, to)),
    )
    const repairs = lanes(
      idx.d.repairs
        .filter((r) => r.equipmentId === equipmentId && r.status === 'en_cours' && r.unavailable)
        .map((r) => ({ r, qty: r.quantity, s: parse(r.startsAt) || from, e: parse(r.endsAt) || to }))
        .filter((x) => overlaps(x.s, x.e, from, to)),
    )
    return { total: seg('total'), stock: seg('stock'), projects, subrents, repairs }
  }, [idx, eq, equipmentId, subprojectId, days, from, to])

  if (!eq) return null
  const cols = `repeat(${span}, 1fr)`
  const grid = (
    <div className="tl-grid" style={{ gridTemplateColumns: cols }}>
      {days.map((d) => <div key={d.toISOString()} className={[0, 6].includes(d.getDay()) ? 'we' : ''} />)}
    </div>
  )
  const segRow = (segs) => (
    <div className="tl-track">
      {grid}
      {segs.map((s, i) => (
        <div key={i} className={`tl-seg ${s.value < 0 ? 'short' : s.value === 0 ? 'zero' : 'ok'}`} style={{ left: `${(s.from / span) * 100}%`, width: `${((s.to - s.from) / span) * 100}%` }} title={`${s.value} disponible(s)`}>
          {s.value}
        </div>
      ))}
    </div>
  )
  const barRow = (items, render) => {
    const n = Math.max(1, ...items.map((x) => x.lane + 1))
    return (
      <div className="tl-track" style={{ minHeight: n * 34 + 8 }}>
        {grid}
        {items.map((x, i) => render(x, i, { left: `${pct(x.s)}%`, width: `${Math.max(1, pct(x.e) - pct(x.s))}%`, top: 6 + x.lane * 34 }))}
      </div>
    )
  }
  const fmtDay = (d) => {
    const w = d.toLocaleDateString('fr-FR', { weekday: 'short' }).slice(0, 2)
    return `${w.charAt(0).toUpperCase()}${w.slice(1)} ${d.getDate()}`
  }

  return (
    <div className="card tl-card" ref={ref}>
      <div className="tl-toolbar">
        <div className="btn-group">
          <button className="btn btn-icon" onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))} aria-label="Dézoomer" disabled={zoom === ZOOMS.length - 1}>
            <Icon name="remove" />
          </button>
          <button className="btn btn-icon" onClick={() => setZoom((z) => Math.max(0, z - 1))} aria-label="Zoomer" disabled={zoom === 0}>
            <Icon name="add" />
          </button>
        </div>
        <span className="spacer" />
        <span className="row muted small" style={{ gap: 6 }}>
          <Icon name="warehouse" size={18} /> Tous les emplacements
        </span>
        <div className="tl-range">
          <button onClick={() => setFrom(addDays(from, -Math.ceil(span / 2)))} aria-label="Période précédente"><Icon name="chevron_left" /></button>
          <span>
            {from.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} – {addDays(to, -1).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
          <button onClick={() => setFrom(addDays(from, Math.ceil(span / 2)))} aria-label="Période suivante"><Icon name="chevron_right" /></button>
        </div>
        <span className="spacer" />
        <Menu
          width={300}
          trigger={<button className="btn btn-icon" title="Légende" aria-label="Légende"><Icon name="map" /></button>}
        >
          <div className="legend-list">
            <div><i className="tl-seg ok" /> Disponible</div>
            <div><i className="tl-seg zero" /> Plus aucun disponible</div>
            <div><i className="tl-seg short" /> Pénurie</div>
            <div><i className="tl-bar current" /> Projet actif</div>
            <div><i className="tl-bar" /> Autres projets</div>
            <div><i className="tl-bar subrent" /> Sous-location</div>
            <div><i className="tl-bar repair" /> Réparation</div>
          </div>
        </Menu>
        <Link to={`/equipements/${equipmentId}`} className="btn btn-icon" title="Ouvrir la fiche équipement"><Icon name="launch" /></Link>
        {onClose && (
          <button className="btn btn-icon" onClick={onClose} aria-label="Fermer la chronologie"><Icon name="close" /></button>
        )}
      </div>
      <div className="tl">
        <div style={{ minWidth: 260 + span * 44 }}>
          <div className="tl-row head">
            <div className="tl-label">Ressources</div>
            <div className="tl-days" style={{ gridTemplateColumns: cols }}>
              {days.map((d) => <div key={d.toISOString()}>{fmtDay(d)}</div>)}
            </div>
          </div>
          <div className="tl-row">
            <div className="tl-label strong"><Icon name="arrow_drop_down" /> {eq.name}</div>
            {segRow(rows.total)}
          </div>
          <div className="tl-row">
            <div className="tl-label indent">Stock entrepôt</div>
            {segRow(rows.stock)}
          </div>
          <div className="tl-row">
            <div className="tl-label indent">Projets</div>
            {barRow(rows.projects, (b, i, style) => (
              <Link key={i} to={`/projets/${b.sub.projectId}?tab=equipement&sp=${b.sub.id}`} className={`tl-bar ${b.sub.id === subprojectId ? 'current' : ''}`} style={{ ...style, borderLeftColor: statusOf(b.sub.status).color }} title={`${b.qty} × ${eq.name} · ${idx.project[b.sub.projectId]?.name} (${statusOf(b.sub.status).label})`}>
                {b.qty} | {idx.project[b.sub.projectId]?.name}
                {(idx.subsByProject[b.sub.projectId] || []).length > 1 ? ` — ${b.sub.name}` : ''}
              </Link>
            ))}
          </div>
          {rows.subrents.length > 0 && (
            <div className="tl-row">
              <div className="tl-label indent">Sous-locations</div>
              {barRow(rows.subrents, (b, i, style) => (
                <Link key={i} to="/penuries?tab=souslocations" className="tl-bar subrent" style={style} title={`${b.qty} × sous-loué(s) · ${b.sr.number}`}>
                  {b.qty} | {b.sr.number} — {idx.contact[b.sr.supplierId]?.company || 'Fournisseur'}
                </Link>
              ))}
            </div>
          )}
          {rows.repairs.length > 0 && (
            <div className="tl-row">
              <div className="tl-label indent">Réparations</div>
              {barRow(rows.repairs, (b, i, style) => (
                <Link key={i} to="/maintenance" className="tl-bar repair" style={style} title={b.r.title}>
                  {b.qty} | {b.r.number} — {b.r.title}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
