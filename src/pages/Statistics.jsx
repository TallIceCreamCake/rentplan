import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useIdx } from '../store'
import { Icon, Kpi } from '../components/ui'
import { assignmentSlots, assignmentTimes, groupTimes, isConfirmed, lineConsumes, lineTotal, projectStatus, projectTimes, projectTotals, stockOf } from '../lib/model'
import { contactName, fmtMoney, fmtNumber, hoursSpan, overlaps, parse, personName, round2 } from '../lib/utils'

const PERIODS = [
  { id: '12m', label: '12 derniers mois' },
  { id: 'annee', label: 'Année en cours' },
  { id: '3m', label: '3 prochains mois' },
]

function range(id) {
  const now = new Date()
  if (id === 'annee') return [new Date(now.getFullYear(), 0, 1), new Date(now.getFullYear() + 1, 0, 1)]
  if (id === '3m') return [new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 3, 1)]
  return [new Date(now.getFullYear(), now.getMonth() - 11, 1), new Date(now.getFullYear(), now.getMonth() + 1, 1)]
}

function Bars({ rows, format = (v) => fmtMoney(v), color = '#4f46c8' }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  if (!rows.length) return <div className="muted small" style={{ padding: 12 }}>Aucune donnée sur la période.</div>
  return (
    <div className="hbars">
      {rows.map((r) => (
        <div key={r.key} className="hbar-row" title={`${r.label} : ${format(r.value)}`}>
          <span className="hbar-label">{r.to ? <Link to={r.to}>{r.label}</Link> : r.label}</span>
          <span className="hbar-track"><span className="hbar" style={{ width: `${(r.value / max) * 100}%`, background: color }} /></span>
          <span className="hbar-value mono">{format(r.value)}</span>
        </div>
      ))}
    </div>
  )
}

export default function Statistics() {
  const idx = useIdx()
  const [period, setPeriod] = useState('12m')
  const [from, to] = range(period)
  const cur = idx.settings.currency

  const stats = useMemo(() => {
    const projects = idx.d.projects
      .map((p) => ({ p, t: projectTimes(p.id, idx), st: projectStatus(p.id, idx).id }))
      .filter((x) => x.t.useStart && parse(x.t.useStart) >= from && parse(x.t.useStart) < to)
    const confirmed = projects.filter((x) => isConfirmed(x.st))
    const totals = Object.fromEntries(confirmed.map((x) => [x.p.id, projectTotals(x.p.id, idx)]))
    const revenue = confirmed.reduce((s, x) => s + totals[x.p.id].totalExVat, 0)
    const profit = confirmed.reduce((s, x) => s + totals[x.p.id].profit, 0)

    const months = []
    for (let d = new Date(from); d < to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      const e = new Date(d.getFullYear(), d.getMonth() + 1, 1)
      months.push({ key: d.toISOString(), label: d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }), value: round2(confirmed.filter((x) => parse(x.t.useStart) >= d && parse(x.t.useStart) < e).reduce((s, x) => s + totals[x.p.id].totalExVat, 0)) })
    }
    const group = (keyFn, labelFn, toFn) => {
      const m = new Map()
      for (const x of confirmed) {
        const k = keyFn(x)
        const cur0 = m.get(k) || { key: k, label: labelFn(x), value: 0, to: toFn?.(x) }
        cur0.value = round2(cur0.value + totals[x.p.id].totalExVat)
        m.set(k, cur0)
      }
      return [...m.values()].sort((a, b) => b.value - a.value)
    }
    const byType = group((x) => x.p.typeId || '-', (x) => idx.type[x.p.typeId]?.name || 'Sans type')
    const byClient = group((x) => x.p.clientId || '-', (x) => contactName(idx.contact[x.p.clientId]), (x) => x.p.clientId && `/contacts/${x.p.clientId}`).slice(0, 10)

    // Équipements : CA et taux d'occupation sur la période
    const days = Math.max(1, (to - from) / 86400000)
    const eqRevenue = {}
    const eqUse = {}
    for (const l of idx.d.plannedEquipment) {
      const sub = idx.sub[l.subprojectId]
      if (!sub || !l.equipmentId) continue
      const t = groupTimes(idx.group[l.groupId], idx)
      if (!t.planStart || !overlaps(parse(t.planStart), parse(t.planEnd), from, to)) continue
      if (isConfirmed(sub.status)) eqRevenue[l.equipmentId] = (eqRevenue[l.equipmentId] || 0) + lineTotal(l, idx)
      if (sub.status !== 'annule' && lineConsumes(l, idx)) {
        const s = Math.max(parse(t.planStart), from)
        const e = Math.min(parse(t.planEnd), to)
        eqUse[l.equipmentId] = (eqUse[l.equipmentId] || 0) + (Number(l.quantity) || 0) * Math.max(0, (e - s) / 86400000)
      }
    }
    const topEq = Object.entries(eqRevenue).map(([id, v]) => ({ key: id, label: idx.eq[id]?.name || id, value: round2(v), to: `/equipements/${id}` })).sort((a, b) => b.value - a.value).slice(0, 10)
    const utilization = Object.entries(eqUse)
      .map(([id, u]) => {
        const stock = stockOf(idx.eq[id], idx)
        return { key: id, label: idx.eq[id]?.name || id, value: stock ? Math.min(100, round2((u / (stock * days)) * 100)) : 0, to: `/equipements/${id}` }
      })
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
    const avgUtil = utilization.length ? round2(utilization.reduce((s, x) => s + x.value, 0) / utilization.length) : 0

    const crewHours = idx.d.crew
      .map((c) => ({
        key: c.id,
        label: personName(c),
        to: `/personnel/${c.id}`,
        value: round2(
          (idx.asgByCrew[c.id] || [])
            .filter((a) => isConfirmed(idx.sub[a.subprojectId]?.status))
            .flatMap((a) => assignmentSlots(a, idx))
            .filter((x) => parse(x.start) >= from && parse(x.start) < to)
            .reduce((s, x) => s + hoursSpan(x.start, x.end), 0),
        ),
      }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value)
    return { projects, confirmed, revenue, profit, months, byType, byClient, topEq, utilization, avgUtil, crewHours }
  }, [idx, from, to])

  return (
    <>
      <div className="page-header">
        <h1>Statistiques <span className="help-dot" title="Chiffre d'affaires des projets confirmés, utilisation du matériel et du personnel"><Icon name="help_outline" size={20} /></span></h1>
        <div className="actions">
          <div className="btn-group">
            {PERIODS.map((p) => <button key={p.id} className={`btn ${period === p.id ? 'on' : ''}`} onClick={() => setPeriod(p.id)}>{p.label}</button>)}
          </div>
        </div>
      </div>
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Kpi icon="euro" color="#4f46c8" label="Chiffre d'affaires HT (confirmé)" value={fmtMoney(stats.revenue, cur)} sub={`${stats.confirmed.length} projet(s) confirmé(s)`} />
        <Kpi icon="table_chart" color="#1f87e5" label="Projets sur la période" value={stats.projects.length} sub={`${stats.projects.length - stats.confirmed.length} non confirmé(s) ou annulé(s)`} />
        <Kpi icon="trending_up" color="#19b26b" label="Bénéfice estimé" value={fmtMoney(stats.profit, cur)} sub={stats.revenue ? `Marge ${round2((stats.profit / stats.revenue) * 100)} %` : undefined} />
        <Kpi icon="category" color="#f08c00" label="Occupation moyenne du parc" value={`${fmtNumber(stats.avgUtil, 1)} %`} sub="Top 10 du matériel utilisé" />
      </div>
      <div className="grid grid-2">
        <div className="card"><div className="card-header"><span className="section-title">Chiffre d'affaires par mois (HT)</span></div><div className="card-body"><MonthBars months={stats.months} cur={cur} /></div></div>
        <div className="card"><div className="card-header"><span className="section-title">Chiffre d'affaires par type de projet</span></div><div className="card-body"><Bars rows={stats.byType} format={(v) => fmtMoney(v, cur)} /></div></div>
        <div className="card"><div className="card-header"><span className="section-title">Meilleurs clients</span></div><div className="card-body"><Bars rows={stats.byClient} format={(v) => fmtMoney(v, cur)} /></div></div>
        <div className="card"><div className="card-header"><span className="section-title">Équipements les plus rentables</span></div><div className="card-body"><Bars rows={stats.topEq} format={(v) => fmtMoney(v, cur)} /></div></div>
        <div className="card"><div className="card-header"><span className="section-title">Taux d'occupation du matériel</span></div><div className="card-body"><Bars rows={stats.utilization} format={(v) => `${fmtNumber(v, 1)} %`} color="#f08c00" /></div></div>
        <div className="card"><div className="card-header"><span className="section-title">Heures planifiées par membre du personnel</span></div><div className="card-body"><Bars rows={stats.crewHours} format={(v) => `${fmtNumber(v, 1)} h`} color="#0e9f9a" /></div></div>
      </div>
    </>
  )
}

function MonthBars({ months, cur }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(1, ...months.map((m) => m.value))
  return (
    <div className="chart" role="img" aria-label="Chiffre d'affaires par mois">
      {months.map((m, i) => (
        <div key={m.key} className="chart-col" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
          <div className="chart-plot">
            <div className={`chart-bar ${hover === i ? 'hover' : ''}`} style={{ height: `${(m.value / max) * 100}%` }}>
              {hover === i && <div className="chart-tip"><div className="strong">{m.label}</div><div>{fmtMoney(m.value, cur)} HT</div></div>}
            </div>
          </div>
          <div className="chart-lbl">{m.label}</div>
        </div>
      ))}
    </div>
  )
}
