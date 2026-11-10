import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useIdx, useStore, toast } from '../../store'
import { useAccess } from '../../lib/auth'
import { Badge, Empty, Icon } from '../../components/ui'
import SerialStateBadge from '../../components/SerialStateBadge'
import { SERIAL_STATES, serialState } from '../../lib/serials'
import { stockOf } from '../../lib/model'
import { fmtDate, matches, uid } from '../../lib/utils'

const Header = ({ title, help, children }) => (
  <div className="page-header">
    <h1>{title} <span className="help-dot" title={help}><Icon name="help_outline" size={20} /></span></h1>
    {children && <div className="actions">{children}</div>}
  </div>
)

/** Équipements › Numéros de série : tous les numéros de série, leur état réel et l'impression d'étiquettes. */
export function SerialNumbers() {
  const idx = useIdx()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [state, setState] = useState('')
  const [location, setLocation] = useState('')
  const [sel, setSel] = useState([])
  const all = idx.d.serials.map((s) => ({ ...s, state: serialState(s, idx) }))
  const list = all
    .filter((s) => (!state || s.state.id === state) && (!location || s.stockLocationId === location) && matches(q, s.serial, s.internalRef, idx.eq[s.equipmentId]?.name, idx.eq[s.equipmentId]?.code, s.state.project?.name))
    .sort((a, b) => String(idx.eq[a.equipmentId]?.name).localeCompare(String(idx.eq[b.equipmentId]?.name), 'fr') || String(a.serial).localeCompare(String(b.serial), 'fr', { numeric: true }))
  const counts = all.reduce((m, s) => ({ ...m, [s.state.id]: (m[s.state.id] || 0) + 1 }), {})
  const checked = list.length > 0 && list.every((s) => sel.includes(s.id))
  return (
    <>
      <Header title="Numéros de série" help="Tous les numéros de série de l'espace de travail : où se trouve chaque unité (disponible, réservée, prête, sur site, en réparation…) et impression des étiquettes QR">
        <button className="btn" disabled={!list.length} onClick={() => navigate(`/etiquettes?sn=${(sel.length ? sel : list.map((s) => s.id)).join(',')}`)}>
          <Icon name="qr_code_2" size={18} /> {sel.length ? `Imprimer ${sel.length} étiquette${sel.length > 1 ? 's' : ''}` : `Imprimer les étiquettes (${list.length})`}
        </button>
      </Header>
      <div className="card">
        <div className="grid-toolbar">
          <div className="search underline" style={{ width: 300 }}>
            <Icon name="search" size={19} className="icon" />
            <input className="input" placeholder="Numéro, référence, équipement, projet…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="select input-sm" style={{ width: 200 }} value={location} onChange={(e) => setLocation(e.target.value)} aria-label="Emplacement">
            <option value="">Tous les emplacements</option>
            {idx.d.stockLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <span className="spacer" />
          <span className="muted small">{list.length} numéro(s)</span>
        </div>
        {all.length > 0 && (
          <div className="chips sn-filters">
            <button className={`chip ${!state ? 'on' : ''}`} onClick={() => setState('')}>Tous <span className="n">{all.length}</span></button>
            {Object.entries(SERIAL_STATES).filter(([k]) => counts[k]).map(([k, v]) => (
              <button key={k} className={`chip ${state === k ? 'on' : ''}`} onClick={() => setState(k)}><span className="sn-dot" style={{ background: v.color }} /> {v.label} <span className="n">{counts[k]}</span></button>
            ))}
          </div>
        )}
        {list.length === 0 ? (
          <Empty icon="qr_code" title="Aucun numéro de série" text="Activez le suivi par numéro de série dans la fiche d'un équipement." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="check-col"><input type="checkbox" checked={checked} onChange={(e) => setSel(e.target.checked ? list.map((s) => s.id) : [])} aria-label="Tout sélectionner" /></th>
                  <th>Numéro de série</th><th>Référence interne</th><th>Équipement</th><th>Emplacement de stock</th><th>État actuel</th><th>Date d'achat</th><th />
                </tr>
              </thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id} className={sel.includes(s.id) ? 'selected' : ''}>
                    <td className="check-col"><input type="checkbox" checked={sel.includes(s.id)} onChange={(e) => setSel(e.target.checked ? [...sel, s.id] : sel.filter((x) => x !== s.id))} aria-label={`Sélectionner ${s.serial}`} /></td>
                    <td className="mono strong"><Link to={`/equipements/${s.equipmentId}?tab=series&sn=${encodeURIComponent(s.serial)}`} style={{ color: 'var(--text)' }}>{s.serial}</Link></td>
                    <td className="mono">{s.internalRef || '—'}</td>
                    <td><Link to={`/equipements/${s.equipmentId}?tab=series`}>{idx.eq[s.equipmentId]?.name}</Link><div className="small muted">{idx.eq[s.equipmentId]?.code}</div></td>
                    <td>{idx.location[s.stockLocationId]?.name || '—'}</td>
                    <td style={{ minWidth: 220 }}><SerialStateBadge state={s.state} /></td>
                    <td>{s.purchaseDate ? fmtDate(s.purchaseDate) : '—'}</td>
                    <td className="right"><button className="btn btn-ghost btn-icon btn-sm" onClick={() => navigate(`/etiquettes?sn=${s.id}`)} title="Étiquette" aria-label={`Étiquette ${s.serial}`}><Icon name="qr_code_2" size={17} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

/** Équipements › Emplacements de stock (et Emplacements de stock archivés). */
export function StockLocations({ archived = false }) {
  const idx = useIdx()
  const store = useStore()
  const canEdit = useAccess().canEditCollection('stockLocations')
  const list = idx.d.stockLocations.filter((l) => Boolean(l.archived) === archived)
  const serials = (id) => idx.d.serials.filter((s) => s.stockLocationId === id).length
  const projects = (id) => idx.d.projects.filter((p) => p.stockLocationId === id).length
  const setDefault = (id) => useStore.setState({ stockLocations: useStore.getState().stockLocations.map((l) => ({ ...l, isDefault: l.id === id })) })
  const archive = (l, value) => {
    if (value && l.isDefault) return toast('Choisissez d’abord un autre emplacement par défaut', 'error')
    store.patch('stockLocations', l.id, { archived: value })
    toast(value ? `« ${l.name} » archivé` : `« ${l.name} » restauré`)
  }
  return (
    <>
      <Header title={archived ? 'Emplacements de stock archivés' : 'Emplacements de stock'} help={archived ? 'Emplacements qui ne sont plus utilisés : restaurez-les pour les proposer à nouveau' : 'Entrepôts depuis lesquels les projets sont préparés et où sont rangés les numéros de série'}>
        {!archived && canEdit && <button className="btn btn-primary" onClick={() => store.upsert('stockLocations', { id: uid('sl_'), name: 'Nouvel emplacement', address: '', kind: 'entrepot', isDefault: false, archived: false })}><Icon name="add" /> Emplacement de stock</button>}
      </Header>
      <div className="card">
        {list.length === 0 ? (
          <Empty icon="warehouse" title={archived ? 'Aucun emplacement archivé' : 'Aucun emplacement de stock'} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Nom</th><th>Adresse</th>{!archived && <th className="center">Par défaut</th>}<th className="num">Numéros de série</th><th className="num">Projets</th><th /></tr></thead>
              <tbody>
                {list.map((l) => (
                  <tr key={l.id}>
                    <td>{canEdit && !archived ? <input className="input input-sm" style={{ maxWidth: 260 }} value={l.name} onChange={(e) => store.patch('stockLocations', l.id, { name: e.target.value })} aria-label="Nom" /> : <span className="strong">{l.name}</span>}</td>
                    <td>{canEdit && !archived ? <input className="input input-sm" style={{ maxWidth: 'none' }} value={l.address || ''} onChange={(e) => store.patch('stockLocations', l.id, { address: e.target.value })} aria-label="Adresse" /> : l.address || '—'}</td>
                    {!archived && <td className="center"><input type="radio" name="defaultLocation" checked={!!l.isDefault} disabled={!canEdit} onChange={() => setDefault(l.id)} aria-label={`${l.name} par défaut`} /></td>}
                    <td className="num">{serials(l.id)}</td>
                    <td className="num">{projects(l.id)}</td>
                    <td className="right nowrap">
                      {canEdit && (archived ? (
                        <button className="btn-link" onClick={() => archive(l, false)}><Icon name="unarchive" size={17} /> Restaurer</button>
                      ) : (
                        <button className="btn-link" onClick={() => archive(l, true)}><Icon name="archive" size={17} /> Archiver</button>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

/** Équipements › Équipements archivés : articles retirés du catalogue, qu'on peut restaurer. */
export function ArchivedEquipment() {
  const idx = useIdx()
  const store = useStore()
  const canEdit = useAccess().canEditCollection('equipment')
  const [q, setQ] = useState('')
  const list = idx.d.equipment.filter((e) => e.archived && matches(q, e.name, e.code)).sort((a, b) => String(a.code).localeCompare(String(b.code), 'fr', { numeric: true }))
  return (
    <>
      <Header title="Équipements archivés" help="Les équipements archivés ne peuvent plus être planifiés ; leur historique est conservé" />
      <div className="card">
        <div className="grid-toolbar">
          <div className="search underline" style={{ width: 300 }}>
            <Icon name="search" size={19} className="icon" />
            <input className="input" placeholder="Nom ou code…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <span className="spacer" />
          <span className="muted small">{list.length} équipement(s)</span>
        </div>
        {list.length === 0 ? (
          <Empty icon="archive" title="Aucun équipement archivé" text="Archivez un équipement depuis sa fiche ou depuis la liste des équipements." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Code</th><th>Nom</th><th>Dossier</th><th className="num">Stock</th><th className="num">Projets planifiés</th><th /></tr></thead>
              <tbody>
                {list.map((e) => (
                  <tr key={e.id}>
                    <td className="mono">{e.code}</td>
                    <td><Link to={`/equipements/${e.id}`} className="strong">{e.name}</Link></td>
                    <td>{idx.cat[e.categoryId]?.name || '—'}</td>
                    <td className="num">{stockOf(e, idx)}</td>
                    <td className="num">{new Set((idx.linesByEq[e.id] || []).map((l) => l.projectId)).size}</td>
                    <td className="right">{canEdit && <button className="btn-link" onClick={() => { store.patch('equipment', e.id, { archived: false }); toast(`« ${e.name} » restauré dans le catalogue`) }}><Icon name="unarchive" size={17} /> Désarchiver</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
