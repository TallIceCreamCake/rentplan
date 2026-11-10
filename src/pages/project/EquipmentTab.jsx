import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore, toast } from '../../store'
import { useAccess } from '../../lib/auth'
import { Empty, Field, Icon, Menu, Modal, NumInput, QtyStepper, SelectionBar } from '../../components/ui'
import { DateRangeField } from '../../components/DatePicker'
import SerialStateBadge from '../../components/SerialStateBadge'
import { availableSerials, serialIssue, serialState } from '../../lib/serials'
import EquipmentTimeline from '../../components/EquipmentTimeline'
import BookingScreen from '../../components/BookingScreen'
import { autoReserved, defaultPeriods, groupTimes, lineFactor, lineTotal, lineUnitPrice, statusOf, stockSituation, subEquipmentStatus, subTimes } from '../../lib/model'
import { fmtMoney, fmtNumber, fmtPeriod, matches } from '../../lib/utils'

export default function EquipmentTab({ project, sub, idx }) {
  const store = useStore()
  // Sans « visibilité des finances » : ni prix, ni totaux
  const money = useAccess().finances
  const { patch } = store
  const cur = idx.settings.currency
  const groups = idx.groupsBySub[sub.id] || []
  const lines = idx.linesBySub[sub.id] || []
  const [selected, setSelected] = useState([])
  const [collapsed, setCollapsed] = useState([])
  const [timelineEq, setTimelineEq] = useState(null)
  const [showCatalog, setShowCatalog] = useState(true)
  const [pricesOn, setShowPrices] = useState(false)
  const showPrices = pricesOn && money
  const [target, setTarget] = useState(groups[0]?.id || null)
  const [dropOn, setDropOn] = useState(null)
  const [modal, setModal] = useState(null)
  const targetId = groups.some((g) => g.id === target) ? target : groups[0]?.id || null

  const status = useMemo(() => Object.fromEntries(subEquipmentStatus(sub.id, idx).map((s) => [s.equipmentId, s])), [sub.id, idx])
  const reserved = autoReserved(sub.status)
  const lineIds = lines.map((l) => l.id)

  const ensureGroup = () => targetId || store.addEquipmentGroup(project.id, sub.id, 'Matériel').id
  const add = (eqIds, gid = null, qty = 1) => {
    const g = gid || ensureGroup()
    // Ce qu'il reste avant l'ajout, pour prévenir d'une pénurie (l'ajout reste possible, comme dans Rentman)
    const t = subTimes(sub.id, idx)
    const short = eqIds
      .map((id) => {
        const st = stockSituation(idx, id, t.planStart, t.planEnd, sub.id)
        const left = Math.max(0, st?.remaining ?? 0)
        return st && qty > left ? { name: idx.eq[id].name, left, missing: qty - left } : null
      })
      .filter(Boolean)
    for (const e of eqIds) store.addEquipmentLine(g, e, qty)
    setTarget(g)
    if (eqIds.length === 1 && short.length) toast(`${qty} × ${short[0].name} ajouté — stock insuffisant : ${short[0].left} disponible${short[0].left > 1 ? 's' : ''}, il en manque ${short[0].missing}`, 'error')
    else if (short.length) toast(`${eqIds.length} équipements ajoutés — pénurie : ${short.map((x) => `${x.name} (−${x.missing})`).join(', ')}`, 'error')
    else toast(eqIds.length === 1 ? `${qty} × ${idx.eq[eqIds[0]]?.name} ajouté` : `${eqIds.length} équipements ajoutés`)
  }

  const statusCell = (l) => {
    const eq = idx.eq[l.equipmentId]
    if (!eq) return <span className="eq-status sale">Temporaire</span>
    if (l.isOptional) return <span className="eq-status sale">Optionnel</span>
    const st = status[l.equipmentId]
    const tip = st && `${Math.max(0, st.available)} disponible${st.available > 1 ? 's' : ''} pour ce projet · ${st.needed} planifié${st.needed > 1 ? 's' : ''}`
    if (eq.kind === 'vente') return st?.shortage > 0 ? <span className="eq-status short" title={tip}>Stock insuffisant (−{st.shortage})</span> : <span className="eq-status sale" title={tip}>Vente</span>
    if (eq.type === 'kit' && l.relation === 'principal') {
      const kidsShort = lines.some((c) => c.parentId === l.id && status[c.equipmentId]?.shortage > 0)
      return kidsShort ? <span className="eq-status short">Pénurie dans le contenu</span> : <span className="eq-status ok">{reserved ? 'Entièrement réservé' : 'Disponible'}</span>
    }
    if (st?.shortage > 0) return <span className="eq-status short" title={tip}>Pénurie (−{st.shortage})</span>
    if (st?.pendingSubrent > 0) return <span className="eq-status warn" title={`${tip} · ${st.pendingSubrent} couvert(s) par une sous-location encore « Demande » : confirmez-la auprès du fournisseur`}>Sous-location à confirmer</span>
    if (reserved) return <span className="eq-status ok" title={tip}>Entièrement réservé</span>
    if (l.reservedQty >= l.quantity) return <span className="eq-status ok" title={tip}>Réservé</span>
    if (l.reservedQty > 0) return <span className="eq-status warn" title={tip}>Partiellement réservé</span>
    return <span className="eq-status planned" title={tip}>Planifié</span>
  }

  const moveTo = (gid) => {
    const ids = new Set(selected)
    useStore.setState({ plannedEquipment: useStore.getState().plannedEquipment.map((l) => (ids.has(l.id) || ids.has(l.parentId) ? { ...l, groupId: gid } : l)) })
    setSelected([])
    toast('Équipement déplacé')
  }
  const toDefaultGroups = (ids) => {
    let moved = 0
    for (const id of ids) {
      const l = idx.line[id]
      const name = idx.eq[l?.equipmentId]?.defaultGroup
      if (!name || l.relation !== 'principal') continue
      const g = (idx.groupsBySub[sub.id] || []).find((x) => x.name === name) || useStore.getState().equipmentGroups.find((x) => x.subprojectId === sub.id && x.name === name) || store.addEquipmentGroup(project.id, sub.id, name)
      useStore.setState({ plannedEquipment: useStore.getState().plannedEquipment.map((x) => (x.id === id || x.parentId === id ? { ...x, groupId: g.id } : x)) })
      moved++
    }
    toast(moved ? `${moved} équipement(s) placé(s) dans leur groupe par défaut` : 'Aucun groupe par défaut défini pour ces équipements', moved ? undefined : 'error')
    setSelected([])
  }
  const firstEq = idx.line[selected[0]]?.equipmentId

  return (
    <>
      <div className={`eq-workspace ${showCatalog ? '' : 'no-catalog'}`}>
        {showCatalog && <Catalog project={project} sub={sub} idx={idx} targetId={targetId} setTarget={setTarget} groups={groups} onAdd={add} onHide={() => setShowCatalog(false)} />}

        <div className={`card eq-panel ${timelineEq ? 'with-timeline' : ''}`}>
          {selected.length > 0 ? (
            <SelectionBar
              count={selected.length}
              onClear={() => setSelected([])}
              right={
                <>
                  <button className="btn btn-primary" onClick={() => setModal({ type: 'group' })}><Icon name="add" /> Groupe d'équipements</button>
                  <Menu
                    trigger={<button className="btn btn-icon" aria-label="Plus d'options"><Icon name="more_vert" /></button>}
                    items={[
                      { icon: 'toggle_on', label: 'Planifier comme option / retirer l’option', onClick: () => { selected.forEach((id) => patch('plannedEquipment', id, { isOptional: !idx.line[id]?.isOptional })); setSelected([]) } },
                      selected.length === 1 && idx.eq[firstEq]?.serialized && { icon: 'qr_code', label: 'Attribuer des numéros de série', onClick: () => setModal({ type: 'serials', lineId: selected[0] }) },
                      { icon: 'drive_file_move', label: 'Placer dans le groupe par défaut', onClick: () => toDefaultGroups(selected) },
                      ...groups.map((g) => ({ icon: 'folder', label: `Déplacer vers « ${g.name} »`, onClick: () => moveTo(g.id) })),
                      '-',
                      { icon: 'delete', label: 'Supprimer', danger: true, onClick: () => { store.removeLines(selected); setSelected([]) } },
                    ]}
                  />
                </>
              }
            >
              <button className="btn-link" onClick={() => setModal({ type: 'bulk' })}><Icon name="edit" size={17} /> Modifier</button>
              <button className="btn-link" onClick={() => setTimelineEq(timelineEq ? null : firstEq)} disabled={!firstEq}>
                <Icon name="watch_later" size={17} /> {timelineEq ? 'Fermer la chronologie' : 'Ouvrir la chronologie'}
              </button>
            </SelectionBar>
          ) : (
            <div className="grid-toolbar">
              {!showCatalog && <button className="btn btn-sm" onClick={() => setShowCatalog(true)}><Icon name="menu_open" size={18} /> Base de données</button>}
              <button
                className="btn-link"
                disabled={reserved}
                title={reserved ? 'Le matériel est réservé automatiquement pour les projets confirmés' : 'Réserver le matériel pour ce projet en option'}
                onClick={() => {
                  useStore.setState({ plannedEquipment: useStore.getState().plannedEquipment.map((l) => (l.subprojectId === sub.id ? { ...l, reservedQty: l.quantity } : l)) })
                  toast('Équipement réservé pour ce projet')
                }}
              >
                <Icon name="lock" size={17} /> {reserved ? 'Réservé automatiquement' : 'Réserver équipement'}
              </button>
              <button className="btn-link" onClick={() => setModal({ type: 'booking' })} disabled={!['confirme', 'pret', 'sur_site', 'retourne'].includes(sub.status)} title="Enregistrer le matériel dans l'entrepôt (projets confirmés)">
                <Icon name="qr_code_scanner" size={17} /> Enregistrer
              </button>
              {timelineEq && <button className="btn-link" onClick={() => setTimelineEq(null)}><Icon name="watch_later" size={17} /> Fermer la chronologie</button>}
              <span className="spacer" />
              <button className="btn btn-primary" onClick={() => setModal({ type: 'group' })}><Icon name="add" /> Groupe d'équipements</button>
              <Menu
                trigger={<button className="btn btn-icon" aria-label="Plus d'options"><Icon name="more_vert" /></button>}
                items={[
                  { icon: 'add_box', label: 'Ajouter un équipement temporaire', onClick: () => setModal({ type: 'temp' }) },
                  lines.some((l) => idx.eq[l.equipmentId]?.serialized) && {
                    icon: 'qr_code',
                    label: 'Attribuer les numéros de série manquants',
                    onClick: () => {
                      const n = store.autoAssignSerials(lines.map((l) => l.id))
                      toast(n ? `${n} numéro${n > 1 ? 's' : ''} de série attribué${n > 1 ? 's' : ''}` : 'Aucun numéro libre à attribuer sur cette période', n ? undefined : 'error')
                    },
                  },
                  { icon: 'drive_file_move', label: 'Tout placer dans les groupes par défaut', onClick: () => toDefaultGroups(lines.filter((l) => l.relation === 'principal').map((l) => l.id)) },
                  money && { icon: showPrices ? 'money_off' : 'euro', label: showPrices ? 'Masquer les prix' : 'Afficher les prix', onClick: () => setShowPrices(!showPrices) },
                ]}
              />
            </div>
          )}

          <div className="eq-scroll">
            {groups.length === 0 ? (
              <Empty icon="category" title="Aucun équipement planifié" text="Ajoutez des équipements depuis la liste de gauche, ou créez un groupe d'équipements." action={<button className="btn btn-primary" onClick={() => setModal({ type: 'group' })}><Icon name="add" /> Groupe d'équipements</button>} />
            ) : (
              <table className="tree-table">
                <thead>
                  <tr>
                    <th className="cb"><input type="checkbox" checked={lineIds.length > 0 && lineIds.every((i) => selected.includes(i))} onChange={(e) => setSelected(e.target.checked ? lineIds : [])} aria-label="Tout sélectionner" /></th>
                    <th className="caret" />
                    <th style={{ width: 90 }}>Location/vente</th>
                    <th>Nom</th>
                    <th>Quantité</th>
                    <th>Type</th>
                    <th>Statut de l'équipement</th>
                    {showPrices && <th className="num">Prix</th>}
                    {showPrices && <th className="num">Facteur</th>}
                    {showPrices && <th className="num">Remise</th>}
                    {money && <th className="num">Total</th>}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => {
                    const gl = idx.linesByGroup[g.id] || []
                    const t = groupTimes(g, idx)
                    const isCollapsed = collapsed.includes(g.id)
                    const total = gl.reduce((s, l) => s + lineTotal(l, idx), 0)
                    const drop = {
                      onDragOver: (e) => {
                        e.preventDefault()
                        setDropOn(g.id)
                      },
                      onDragLeave: () => setDropOn((d) => (d === g.id ? null : d)),
                      onDrop: (e) => {
                        e.preventDefault()
                        setDropOn(null)
                        const id = e.dataTransfer.getData('text/plain')
                        if (idx.eq[id]) add([id], g.id)
                      },
                    }
                    return [
                      <tr key={g.id} className={`folder ${dropOn === g.id ? 'drop-target' : ''} ${targetId === g.id ? 'target' : ''}`} {...drop} onClick={() => setTarget(g.id)} onDoubleClick={() => setModal({ type: 'group', group: g })} title="Double-cliquez pour modifier le groupe">
                        <td className="cb"><input type="checkbox" checked={gl.length > 0 && gl.every((l) => selected.includes(l.id))} onChange={(e) => setSelected(e.target.checked ? [...new Set([...selected, ...gl.map((l) => l.id)])] : selected.filter((x) => !gl.some((l) => l.id === x)))} aria-label={`Sélectionner ${g.name}`} /></td>
                        <td className="caret">
                          <button className="caret-btn" onClick={(e) => { e.stopPropagation(); setCollapsed(isCollapsed ? collapsed.filter((x) => x !== g.id) : [...collapsed, g.id]) }} aria-label={isCollapsed ? 'Déplier' : 'Replier'}>
                            <Icon name={isCollapsed ? 'arrow_right' : 'arrow_drop_down'} />
                          </button>
                        </td>
                        <td colSpan={showPrices ? 8 : 5}>
                          <Icon name="folder" size={19} className="folder-ico" />
                          <strong>{g.name}</strong>
                          <span className="sub">{fmtPeriod(t.planStart, t.planEnd)}{targetId === g.id && showCatalog ? ' · reçoit les ajouts' : ''}</span>
                        </td>
                        {money && <td className="num mono">{fmtMoney(total, cur)}</td>}
                        <td className="right">
                          <Menu
                            trigger={<button className="btn btn-ghost btn-icon btn-sm" aria-label="Options du groupe" onClick={(e) => e.stopPropagation()}><Icon name="more_vert" size={18} /></button>}
                            items={[
                              { icon: 'edit', label: 'Modifier le groupe', onClick: () => setModal({ type: 'group', group: g }) },
                              { icon: 'delete', label: 'Supprimer le groupe', danger: true, onClick: () => { if (!gl.length || confirm(`Supprimer « ${g.name} » et son contenu ?`)) { store.removeWhere('plannedEquipment', (l) => l.groupId === g.id); store.remove('equipmentGroups', g.id) } } },
                            ]}
                          />
                        </td>
                      </tr>,
                      ...(isCollapsed
                        ? []
                        : gl.length === 0
                          ? [<tr key={`${g.id}-empty`} className={dropOn === g.id ? 'drop-target' : ''} {...drop}><td colSpan={12} className="muted small" style={{ paddingLeft: 92 }}>Glissez des équipements ici, ou double-cliquez dans la liste de gauche.</td></tr>]
                          : gl.map((l) => {
                              const eq = idx.eq[l.equipmentId]
                              const short = status[l.equipmentId]?.shortage > 0 && l.relation !== 'contenu' && eq?.type !== 'kit'
                              const isSale = eq?.kind === 'vente'
                              return (
                                <tr key={l.id} className={`item ${short ? 'shortage' : ''} ${selected.includes(l.id) && !short ? 'selected' : ''} ${l.isOptional ? 'optional' : ''}`} {...drop}>
                                  <td className="cb"><input type="checkbox" checked={selected.includes(l.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, l.id] : selected.filter((x) => x !== l.id))} aria-label={`Sélectionner ${eq?.name || l.name}`} /></td>
                                  <td className="caret" />
                                  <td><span className="type-cell small"><Icon name={isSale ? 'sell' : 'sync_alt'} size={17} style={{ color: 'var(--primary)' }} /> {isSale ? 'Vente' : 'Location'}</span></td>
                                  <td className={l.relation !== 'principal' ? 'child-name' : ''} style={{ minWidth: 220 }}>
                                    {eq ? (
                                      <button className="link-name" onClick={() => setTimelineEq(timelineEq === eq.id ? null : eq.id)} title="Afficher la chronologie">
                                        {l.relation !== 'principal' && <Icon name="subdirectory_arrow_right" size={15} />} {eq.name}
                                      </button>
                                    ) : (
                                      <span>{l.name} <span className="tag">Temporaire</span></span>
                                    )}
                                    {l.isOptional && <span className="tag" style={{ marginLeft: 6 }}>Option</span>}
                                    {eq?.serialized && l.relation !== 'contenu' && !l.isOptional && <SerialChips line={l} idx={idx} onOpen={() => setModal({ type: 'serials', lineId: l.id })} />}
                                  </td>
                                  <td>{l.relation === 'contenu' ? <span className="mono">{l.quantity}</span> : <QtyStepper value={l.quantity} onChange={(v) => store.setLineQuantity(l.id, v)} />}</td>
                                  <td><span className="type-cell">{eq?.type === 'kit' ? <><Icon name="grid_view" size={17} style={{ color: 'var(--primary)' }} /> Kit</> : eq?.type === 'case' ? <><Icon name="inventory_2" size={17} style={{ color: 'var(--primary)' }} /> Case</> : <><span className="sq" /> {l.relation === 'accessoire' ? 'Accessoire' : l.relation === 'contenu' ? 'Contenu' : 'Article'}</>}</span></td>
                                  <td>{statusCell(l)}</td>
                                  {showPrices && <td className="num">{l.relation === 'contenu' ? '—' : <NumInput style={{ width: 76 }} value={lineUnitPrice(l, eq)} onChange={(v) => patch('plannedEquipment', l.id, { price: v })} />}</td>}
                                  {showPrices && <td className="num muted">×{fmtNumber(lineFactor(l, idx), 2)}</td>}
                                  {showPrices && <td className="num">{l.relation === 'contenu' ? '—' : <span className="input-group" style={{ justifyContent: 'flex-end' }}><NumInput style={{ width: 48 }} value={l.discount || 0} max={100} onChange={(v) => patch('plannedEquipment', l.id, { discount: v })} /><span className="addon">%</span></span>}</td>}
                                  {money && <td className="num mono">{l.relation === 'contenu' ? '' : fmtMoney(lineTotal(l, idx), cur)}</td>}
                                  <td className="right">
                                    {l.relation !== 'contenu' && <button className="btn btn-ghost btn-icon btn-sm row-action" onClick={() => store.removeLines([l.id])} aria-label="Retirer"><Icon name="delete" size={17} /></button>}
                                  </td>
                                </tr>
                              )
                            })),
                    ]
                  })}
                </tbody>
              </table>
            )}
          </div>
          <EquipmentFooter project={project} sub={sub} idx={idx} />
        </div>
      </div>

      {timelineEq && idx.eq[timelineEq] && <EquipmentTimeline equipmentId={timelineEq} subprojectId={sub.id} start={subTimes(sub.id, idx).planStart} onClose={() => setTimelineEq(null)} />}

      {modal?.type === 'group' && <GroupModal project={project} sub={sub} idx={idx} group={modal.group} onClose={() => setModal(null)} onCreated={(g) => setTarget(g.id)} />}
      {modal?.type === 'bulk' && <BulkEditModal ids={selected} onClose={() => { setModal(null); setSelected([]) }} />}
      {modal?.type === 'serials' && <SerialModal line={idx.line[modal.lineId]} idx={idx} onClose={() => setModal(null)} />}
      {modal?.type === 'temp' && <TempItemModal groupId={targetId} ensureGroup={ensureGroup} onClose={() => setModal(null)} />}
      {modal?.type === 'booking' && (
        <Modal title={`Enregistrer — ${project.name}${idx.subsByProject[project.id]?.length > 1 ? ` · ${sub.name}` : ''}`} size="xl" onClose={() => setModal(null)}>
          <BookingScreen subprojectId={sub.id} />
        </Modal>
      )}
    </>
  )
}

function EquipmentFooter({ sub, idx }) {
  const money = useAccess().finances
  const lines = idx.linesBySub[sub.id] || []
  const total = lines.reduce((s, l) => s + lineTotal(l, idx), 0)
  const weight = lines.reduce((s, l) => s + (l.relation === 'contenu' && idx.eq[idx.line[l.parentId]?.equipmentId]?.type === 'case' ? 0 : (Number(idx.eq[l.equipmentId]?.weight) || 0) * (Number(l.quantity) || 0)), 0)
  const st = statusOf(sub.status)
  return (
    <div className="grid-footer">
      <span>Statut : <strong style={{ color: st.color }}>{st.label}</strong></span>
      <span>Poids : <strong>{fmtNumber(weight)} kg</strong></span>
      <span className="spacer" />
      {money && <span>Total équipement : <strong>{fmtMoney(total, idx.settings.currency)}</strong></span>}
    </div>
  )
}

/** Détail du stock affiché au survol de la disponibilité. */
function stockTip(st, withPeriod) {
  const pl = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`
  if (st.kit) return [`Combinaison : ${pl(st.remaining, 'disponible')} d’après son contenu`, st.here && `Planifié ici : ${st.here}`].filter(Boolean).join('\n')
  const lines = [`Stock : ${st.stock}`]
  if (st.sale) {
    if (st.others) lines.push(`Réservé par d’autres projets : −${st.others}`)
  } else {
    if (st.subrented) lines.push(`Sous-loué : +${st.subrented}${st.subrentPending ? ` (dont ${st.subrentPending} à confirmer)` : ''}`)
    if (st.others) lines.push(`Autres projets : −${st.others}`)
    if (st.repairs) lines.push(`En réparation : −${st.repairs}`)
    if (st.late) lines.push(`Pas encore rentré : −${st.late}`)
  }
  if (st.here) lines.push(`Planifié dans ce projet : −${st.here}`)
  lines.push(`Reste : ${st.remaining}${st.sale ? '' : withPeriod ? ' (au moment le plus chargé de la période)' : ' (sans période : autres projets non comptés)'}`)
  if (st.remaining < 0) lines.push(`Pénurie de ${-st.remaining}`)
  return lines.join('\n')
}

/* ---------- Base de données des équipements (panneau de gauche) ---------- */
function Catalog({ sub, idx, targetId, setTarget, groups, onAdd, onHide }) {
  const [q, setQ] = useState('')
  const [tags, setTags] = useState([])
  const [open, setOpen] = useState(() => idx.d.categories.filter((c) => !c.parentId).slice(0, 1).map((c) => c.id))
  const [qty, setQty] = useState({})
  const [sel, setSel] = useState([])
  const [smart, setSmart] = useState(true)
  const t = subTimes(sub.id, idx)
  const allTags = [...new Set(idx.d.equipment.flatMap((e) => e.tags || []))]
  const list = idx.d.equipment.filter((e) => !e.archived && matches(q, e.name, e.code) && (!tags.length || tags.some((g) => e.tags?.includes(g))))
  const inSub = new Set((idx.linesBySub[sub.id] || []).map((l) => l.equipmentId))

  const suggestions = useMemo(() => {
    const counts = {}
    for (const s of idx.d.subprojects) {
      if (s.id === sub.id) continue
      const eqs = new Set((idx.linesBySub[s.id] || []).filter((l) => l.relation === 'principal').map((l) => l.equipmentId))
      if (![...inSub].some((e) => eqs.has(e))) continue
      for (const e of eqs) if (!inSub.has(e)) counts[e] = (counts[e] || 0) + 1
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => idx.eq[id]).filter(Boolean)
  }, [idx, sub.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const situation = (e) => stockSituation(idx, e.id, t.planStart, t.planEnd, sub.id)
  const children = (pid) => idx.d.categories.filter((c) => (c.parentId || null) === pid).sort((a, b) => a.sort - b.sort)
  const countIn = (cid) => list.filter((e) => e.categoryId === cid).length + children(cid).reduce((s, c) => s + countIn(c.id), 0)
  const searching = q.trim().length > 0 || tags.length > 0

  const itemRow = (e, depth) => {
    const st = situation(e)
    const n = st.remaining
    return (
      <tr
        key={e.id}
        className={`item ${sel.includes(e.id) ? 'selected' : ''}`}
        draggable
        onDragStart={(ev) => {
          ev.dataTransfer.setData('text/plain', e.id)
          ev.dataTransfer.effectAllowed = 'copy'
        }}
        onDoubleClick={() => onAdd([e.id])}
        title="Double-cliquez pour ajouter, ou glissez vers un groupe"
      >
        <td className="cb"><input type="checkbox" checked={sel.includes(e.id)} onChange={(ev) => setSel(ev.target.checked ? [...sel, e.id] : sel.filter((x) => x !== e.id))} aria-label={`Sélectionner ${e.name}`} /></td>
        <td className="caret" />
        <td className="name" style={{ paddingLeft: 8 + depth * 12 }} title={e.name}>
          <div className="row" style={{ gap: 6, minWidth: 0 }}>
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</span>
            {e.type === 'kit' && <Icon name="grid_view" size={15} style={{ color: 'var(--primary)' }} title="Combinaison virtuelle (kit)" />}
            {e.type === 'case' && <Icon name="inventory_2" size={15} style={{ color: 'var(--primary)' }} title="Combinaison physique (case)" />}
            {e.kind === 'vente' && <Icon name="sell" size={15} style={{ color: 'var(--muted)' }} title="Vente" />}
            {st.here > 0 && <span className="eq-here" title={`${st.here} déjà planifié${st.here > 1 ? 's' : ''} dans ce sous-projet`}>×{st.here}</span>}
          </div>
        </td>
        <td style={{ textAlign: 'right' }}>
          <span className={`avail-pill tl-seg ${n < 0 ? 'short' : n === 0 ? 'zero' : 'ok'}`} style={{ position: 'static', borderLeft: 0 }} title={stockTip(st, !!t.planStart)}>{n}</span>
        </td>
        <td className="qty-col">
          <input
            className="qty-input"
            placeholder="+"
            value={qty[e.id] ?? ''}
            inputMode="numeric"
            onChange={(ev) => setQty({ ...qty, [e.id]: ev.target.value.replace(/\D/g, '') })}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter' && Number(qty[e.id]) > 0) {
                onAdd([e.id], null, Number(qty[e.id]))
                setQty({ ...qty, [e.id]: '' })
              }
            }}
            aria-label={`Quantité de ${e.name} à planifier`}
          />
        </td>
      </tr>
    )
  }
  const folder = (c, depth) => {
    const n = countIn(c.id)
    if (!n) return []
    const isOpen = searching || open.includes(c.id)
    return [
      <tr key={c.id} className="folder" style={{ cursor: 'pointer' }} onClick={() => setOpen(isOpen ? open.filter((x) => x !== c.id) : [...open, c.id])}>
        <td className="cb" />
        <td className="caret"><Icon name={isOpen ? 'arrow_drop_down' : 'arrow_right'} /></td>
        <td colSpan={3} style={{ paddingLeft: 6 + depth * 12 }}>
          <Icon name="folder" size={19} className="folder-ico" /> {c.name} <span className="muted" style={{ fontWeight: 400 }}>({n})</span>
        </td>
      </tr>,
      ...(isOpen ? [...children(c.id).flatMap((x) => folder(x, depth + 1)), ...list.filter((e) => e.categoryId === c.id).map((e) => itemRow(e, depth + 1))] : []),
    ]
  }

  return (
    <div className="card eq-panel eq-catalog">
      {sel.length > 0 ? (
        <SelectionBar count={sel.length} onClear={() => setSel([])}>
          <button className="btn-link" onClick={() => { onAdd(sel); setSel([]) }}><Icon name="add" size={17} /> Ajouter</button>
        </SelectionBar>
      ) : (
        <div className="eq-search">
          <div className="search underline" style={{ flex: 1 }}>
            <Icon name="search" size={19} className="icon" />
            <input className="input" placeholder="Rechercher" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Menu width={260} trigger={<button className={`btn btn-ghost btn-icon btn-sm ${tags.length ? 'on' : ''}`} title="Filtrer par étiquettes" aria-label="Filtrer par étiquettes"><Icon name="label" /></button>}>
            <div className="popover-head">Filtrer par étiquettes</div>
            <div style={{ padding: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {allTags.map((g) => (
                <button key={g} className={`chip ${tags.includes(g) ? 'on' : ''}`} onClick={() => setTags(tags.includes(g) ? tags.filter((x) => x !== g) : [...tags, g])}>{g}</button>
              ))}
              {tags.length > 0 && <button className="btn-link" onClick={() => setTags([])}>Désélectionner tout</button>}
            </div>
          </Menu>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onHide} title="Masquer la base de données" aria-label="Masquer la base de données"><Icon name="first_page" /></button>
        </div>
      )}
      <div className="eq-search" style={{ padding: '6px 16px', gap: 8 }}>
        <span className="small muted nowrap">Ajouter dans</span>
        <select className="select input-sm" value={targetId || ''} onChange={(e) => setTarget(e.target.value)} aria-label="Groupe de destination">
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          {!groups.length && <option value="">Nouveau groupe « Matériel »</option>}
        </select>
      </div>
      <div className="eq-scroll">
        <table className="tree-table">
          <thead>
            <tr>
              <th className="cb" />
              <th className="caret" />
              <th className="sorted">Nom <Icon name="arrow_upward" size={14} /></th>
              <th style={{ textAlign: 'right' }} title="Ce qu’il reste sur la période du projet, une fois ce projet et les autres servis">Dispo.</th>
              <th title="Quantité à planifier">Quantité</th>
            </tr>
          </thead>
          <tbody>
            {children(null).flatMap((c) => folder(c, 0))}
            {list.filter((e) => !e.categoryId).map((e) => itemRow(e, 0))}
          </tbody>
        </table>
        {list.length === 0 && <div className="empty">Aucun équipement trouvé.</div>}
      </div>
      <div className="smart">
        <button className="smart-head" onClick={() => setSmart(!smart)}>
          SUGGESTIONS INTELLIGENTES <Icon name={smart ? 'expand_more' : 'expand_less'} />
        </button>
        {smart && (
          <div>
            {suggestions.length === 0 && <div className="muted small" style={{ padding: '6px 16px 10px' }}>Ajoutez des équipements pour obtenir des suggestions.</div>}
            {suggestions.map((e) => (
              <div key={e.id} className="smart-item" onDoubleClick={() => onAdd([e.id])}>
                <Icon name="lightbulb" size={17} style={{ color: 'var(--primary)' }} />
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => onAdd([e.id])} aria-label={`Ajouter ${e.name}`}><Icon name="add" size={18} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function GroupModal({ project, sub, idx, group, onClose, onCreated }) {
  const store = useStore()
  const periods = idx.periodsByProject[project.id] || []
  const [f, setF] = useState(() => {
    if (group) return group
    const d = defaultPeriods(project.id, sub.id, idx)
    return { name: '', remark: '', planningPeriodId: d.planning?.id || null, usagePeriodId: d.usage?.id || null }
  })
  const created = !group
  const save = () => {
    if (!f.name.trim()) return toast('Le nom est obligatoire', 'error')
    const fields = { name: f.name, remark: f.remark || '', planningPeriodId: f.planningPeriodId || null, usagePeriodId: f.usagePeriodId || null, planStart: f.planStart || null, planEnd: f.planEnd || null, useStart: f.useStart || null, useEnd: f.useEnd || null }
    if (created) {
      const g = store.addEquipmentGroup(project.id, sub.id, f.name)
      store.patch('equipmentGroups', g.id, fields)
      onCreated?.(g)
    } else store.patch('equipmentGroups', group.id, fields)
    onClose()
  }
  const periodSelect = (key, label, startKey, endKey) => (
    <Field label={label} className="full">
      <select className="select" value={f[key] || ''} onChange={(e) => setF({ ...f, [key]: e.target.value || null })}>
        <option value="">Horaires propres au groupe</option>
        {periods.map((p) => <option key={p.id} value={p.id}>{p.name} — {fmtPeriod(p.startsAt, p.endsAt)}</option>)}
      </select>
      {!f[key] && (
        <div style={{ marginTop: 6 }}>
          <DateRangeField start={f[startKey]} end={f[endKey]} onChange={({ start, end }) => setF({ ...f, [startKey]: start, [endKey]: end })} aria-label={label} />
        </div>
      )}
    </Field>
  )
  return (
    <Modal
      title={created ? "Nouveau groupe d'équipements" : `Groupe « ${group.name} »`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={save}>Enregistrer</button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Nom *" className="full"><input className="input" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex. Son, Lumière, Scène A, Jour 1…" /></Field>
        {periodSelect('planningPeriodId', 'Période de planification (immobilisation du matériel)', 'planStart', 'planEnd')}
        {periodSelect('usagePeriodId', "Période d'utilisation (facturée)", 'useStart', 'useEnd')}
        <Field label="Remarque" className="full" hint="Peut être affichée sur le devis pour décrire le groupe au client">
          <textarea className="textarea" value={f.remark || ''} onChange={(e) => setF({ ...f, remark: e.target.value })} />
        </Field>
      </div>
    </Modal>
  )
}

function BulkEditModal({ ids, onClose }) {
  const [discount, setDiscount] = useState('')
  const [price, setPrice] = useState('')
  const apply = () => {
    useStore.setState({
      plannedEquipment: useStore.getState().plannedEquipment.map((l) =>
        ids.includes(l.id) && l.relation !== 'contenu' ? { ...l, ...(discount !== '' ? { discount: Number(discount) } : {}), ...(price !== '' ? { price: Number(price) } : {}) } : l,
      ),
    })
    toast(`${ids.length} ligne(s) modifiée(s)`)
    onClose()
  }
  return (
    <Modal title={`Modifier ${ids.length} élément(s)`} size="sm" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn btn-primary" onClick={apply}>Appliquer</button></>}>
      <div className="form-grid">
        <Field label="Remise (%)" hint="Laisser vide pour ne pas modifier"><input className="input input-num" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value.replace(',', '.'))} /></Field>
        <Field label="Prix unitaire (€)" hint="Laisser vide pour ne pas modifier"><input className="input input-num" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(',', '.'))} /></Field>
      </div>
    </Modal>
  )
}

/** Numéros de série d'une ligne : attribués (avec conflits éventuels) et manquants, attribution en un clic. */
function SerialChips({ line, idx, onOpen }) {
  const autoAssign = useStore((s) => s.autoAssignSerials)
  const ids = line.serialIds || []
  const missing = Math.max(0, (Number(line.quantity) || 0) - ids.length)
  return (
    <div className="sn-chips">
      {ids.map((id) => {
        const sn = idx.d.serials.find((x) => x.id === id)
        if (!sn) return null
        const issue = serialIssue(sn, line, idx)
        return (
          <button key={id} type="button" className={`sn-chip ${issue ? 'bad' : ''}`} onClick={onOpen} title={issue || 'Numéro attribué'}>
            {issue && <Icon name="warning" size={13} />}{sn.serial}
          </button>
        )
      })}
      {missing > 0 && (
        <>
          <button type="button" className="sn-chip missing" onClick={onOpen} title="Choisir les numéros de série">{missing} à attribuer</button>
          <button
            type="button"
            className="btn-link small"
            onClick={() => {
              const n = autoAssign([line.id])
              toast(n ? `${n} numéro${n > 1 ? 's' : ''} attribué${n > 1 ? 's' : ''}` : 'Aucun numéro libre sur cette période', n ? undefined : 'error')
            }}
          >
            Auto
          </button>
        </>
      )}
    </div>
  )
}

function SerialModal({ line, idx, onClose }) {
  const { patch } = useStore()
  const [sel, setSel] = useState(line?.serialIds || [])
  const [code, setCode] = useState('')
  if (!line) return null
  const qty = Number(line.quantity) || 0
  const serials = (idx.serialsByEq[line.equipmentId] || [])
    .map((s) => ({ ...s, state: serialState(s, idx), issue: serialIssue(s, line, idx) }))
    .sort((a, b) => (a.issue ? 1 : 0) - (b.issue ? 1 : 0) || String(a.serial).localeCompare(String(b.serial), 'fr', { numeric: true }))
  const free = availableSerials({ ...line, serialIds: sel }, idx)
  const toggle = (s, on) => setSel(on ? [...sel, s.id] : sel.filter((x) => x !== s.id))
  const scan = (e) => {
    e.preventDefault()
    const s = serials.find((x) => x.serial.toLowerCase() === code.trim().toLowerCase())
    setCode('')
    if (!s) return toast(`« ${code} » n’est pas un numéro de ${idx.eq[line.equipmentId]?.name}`, 'error')
    if (sel.includes(s.id)) return toast(`${s.serial} est déjà attribué`)
    if (s.issue) return toast(`${s.serial} : ${s.issue}`, 'error')
    if (sel.length >= qty) return toast(`Déjà ${qty} numéro(s) pour ${qty} unité(s)`, 'error')
    toggle(s, true)
  }
  return (
    <Modal
      title={`Numéros de série — ${idx.eq[line.equipmentId]?.name}`}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <span className="small muted" style={{ marginRight: 'auto' }}>{sel.length} / {qty} attribué{sel.length > 1 ? 's' : ''}</span>
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={() => { patch('plannedEquipment', line.id, { serialIds: sel }); toast('Numéros de série attribués'); onClose() }}>Confirmer</button>
        </>
      }
    >
      <div className="row wrap" style={{ gap: 10, marginBottom: 12 }}>
        <form className="lg-scan" style={{ flex: '1 1 260px' }} onSubmit={scan}>
          <Icon name="qr_code_scanner" size={19} />
          <input className="lg-scan-input" placeholder="Scanner ou saisir un numéro de série" value={code} onChange={(e) => setCode(e.target.value)} autoFocus aria-label="Numéro à attribuer" />
        </form>
        <button className="btn" disabled={sel.length >= qty || !free.length} onClick={() => setSel([...sel, ...free.slice(0, qty - sel.length).map((x) => x.id)])}><Icon name="auto_fix_high" size={18} /> Compléter automatiquement</button>
        {sel.length > 0 && <button className="btn btn-ghost" onClick={() => setSel([])}>Tout retirer</button>}
      </div>
      <p className="muted small" style={{ marginTop: 0 }}>Jusqu’à {qty} numéro(s). Les numéros en réparation, hors service, perdus ou déjà pris sur un projet qui se chevauche ne peuvent pas être choisis. Le dépôt du projet est proposé en premier.</p>
      <div className="table-wrap">
        <table className="table table-compact">
          <thead><tr><th className="check-col" /><th>Numéro de série</th><th>Référence interne</th><th>Emplacement de stock</th><th>État actuel</th><th>Pour ce projet</th></tr></thead>
          <tbody>
            {serials.map((s) => {
              const on = sel.includes(s.id)
              return (
                <tr key={s.id} className={on ? 'selected' : s.issue ? 'muted-row' : ''}>
                  <td className="check-col"><input type="checkbox" checked={on} disabled={!on && (sel.length >= qty || Boolean(s.issue))} onChange={(e) => toggle(s, e.target.checked)} aria-label={s.serial} /></td>
                  <td className="mono strong">{s.serial}</td>
                  <td>{s.internalRef || '—'}</td>
                  <td>{idx.location[s.stockLocationId]?.name || '—'}</td>
                  <td><SerialStateBadge state={s.state} compact /></td>
                  <td>{on && s.issue ? <span className="danger-text small">{s.issue}</span> : s.issue ? <span className="muted small">{s.issue}</span> : on ? <span className="success-text">Attribué</span> : <span className="muted">Libre</span>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {!serials.length && <Empty title="Aucun numéro de série" action={<Link className="btn" to={`/equipements/${line.equipmentId}?tab=series`}>Gérer les numéros de série</Link>} />}
    </Modal>
  )
}

function TempItemModal({ groupId, ensureGroup, onClose }) {
  const store = useStore()
  const [name, setName] = useState('')
  const [price, setPrice] = useState(0)
  return (
    <Modal
      title="Équipement temporaire"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={() => { if (!name.trim()) return toast('Le nom est obligatoire', 'error'); store.addTemporaryLine(groupId || ensureGroup(), name.trim(), price); onClose() }}>Ajouter</button>
        </>
      }
    >
      <p className="muted small" style={{ marginTop: 0 }}>Un article qui n'existe pas dans votre base de données (ex. matériel acheté pour l'occasion). Il n'influence pas les disponibilités.</p>
      <div className="form-grid">
        <Field label="Nom" className="full"><input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Prix unitaire (€)"><NumInput className="input input-num" value={price} onChange={setPrice} /></Field>
      </div>
    </Modal>
  )
}
