import { useState } from 'react'
import { useStore, toast } from '../../store'
import { Empty, Field, Icon, Menu, Modal, NumInput, SelectionBar, TagInput } from '../../components/ui'
import { DateRangeField } from '../../components/DatePicker'
import { defaultPeriods, FUNCTION_PRICE_TYPES, functionCost, functionFill, functionPrice, functionTimes } from '../../lib/model'
import { fmtMoney, fmtPeriod, uid } from '../../lib/utils'

export default function CrewTransportTab({ project, sub, idx }) {
  const store = useStore()
  const cur = idx.settings.currency
  const fgroups = idx.fgroupsBySub[sub.id] || []
  const fns = idx.fnsBySub[sub.id] || []
  const [selected, setSelected] = useState([])
  const [target, setTarget] = useState(fgroups[0]?.id || null)
  const [edit, setEdit] = useState(null)
  const [groupEdit, setGroupEdit] = useState(null)
  const [side, setSide] = useState('equipe')

  const addFromDefault = (def) => {
    const f = store.addFunction(project.id, sub.id, target, def)
    toast(`Fonction « ${def.name} » ajoutée`)
    return f
  }
  const sections = [{ id: null, name: 'Fonctions non groupées' }, ...fgroups]
  const totalPrice = fns.reduce((s, f) => s + functionPrice(f, idx), 0)
  const totalCost = fns.reduce((s, f) => s + functionCost(f, idx), 0)

  return (
    <div className="eq-workspace" style={{ gridTemplateColumns: '300px minmax(0, 1fr)' }}>
      <div className="card eq-panel">
        <div className="eq-search" style={{ gap: 6 }}>
          <div className="btn-group" style={{ flex: 1 }}>
            <button className={`btn btn-sm ${side === 'equipe' ? 'on' : ''}`} style={{ flex: 1 }} onClick={() => setSide('equipe')}><Icon name="people" size={18} /> Équipe</button>
            <button className={`btn btn-sm ${side === 'transport' ? 'on' : ''}`} style={{ flex: 1 }} onClick={() => setSide('transport')}><Icon name="local_shipping" size={18} /> Transport</button>
          </div>
        </div>
        <div className="eq-scroll">
          <div className="side-list-title">Fonctions par défaut</div>
          {idx.d.defaultFunctions.filter((d) => d.kind === side).map((d) => (
            <div key={d.id} className="smart-item" onDoubleClick={() => addFromDefault(d)} title="Double-cliquez pour ajouter">
              <Icon name={side === 'equipe' ? 'people' : 'local_shipping'} size={18} style={{ color: 'var(--primary)' }} />
              <span style={{ flex: 1 }}>{d.name}</span>
              <span className="small muted">{fmtMoney(d.price, cur)}/{FUNCTION_PRICE_TYPES.find((t) => t.id === d.priceType)?.label.replace('par ', '')}</span>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => addFromDefault(d)} aria-label={`Ajouter ${d.name}`}><Icon name="add" size={18} /></button>
            </div>
          ))}
          <div className="muted small" style={{ padding: '10px 16px' }}>Les fonctions par défaut se gèrent dans Configuration.</div>
        </div>
      </div>

      <div className="card eq-panel">
        {selected.length > 0 ? (
          <SelectionBar
            count={selected.length}
            onClear={() => setSelected([])}
            right={
              <Menu
                trigger={<button className="btn btn-icon" aria-label="Plus d'options"><Icon name="more_vert" /></button>}
                items={[
                  ...fgroups.map((g) => ({ icon: 'folder', label: `Déplacer vers « ${g.name} »`, onClick: () => { selected.forEach((id) => store.patch('functions', id, { groupId: g.id })); setSelected([]) } })),
                  { icon: 'folder_off', label: 'Retirer du groupe', onClick: () => { selected.forEach((id) => store.patch('functions', id, { groupId: null })); setSelected([]) } },
                  '-',
                  { icon: 'delete', label: 'Supprimer', danger: true, onClick: () => { selected.forEach((id) => store.removeFunction(id)); setSelected([]) } },
                ]}
              />
            }
          >
            {selected.length === 1 && <button className="btn-link" onClick={() => setEdit(idx.fn[selected[0]])}><Icon name="edit" size={17} /> Éditer</button>}
            <button
              className="btn-link"
              onClick={() => {
                selected.forEach((id) => {
                  const f = idx.fn[id]
                  store.upsert('functions', { ...f, id: uid('fn_'), name: `${f.name} (copie)`, sort: fns.length })
                })
                setSelected([])
              }}
            >
              <Icon name="file_copy" size={17} /> Dupliquer
            </button>
            {selected.length === 1 && (
              <button
                className="btn-link"
                onClick={() => {
                  const f = idx.fn[selected[0]]
                  store.upsert('defaultFunctions', { id: uid('df_'), kind: f.kind, name: f.name, internalName: f.internalName, price: f.price, priceType: f.priceType, cost: f.cost, costType: f.costType, breakMinutes: f.breakMinutes, tags: f.tags })
                  toast('Fonction enregistrée comme fonction par défaut')
                }}
              >
                <Icon name="bookmark_add" size={17} /> Créer une fonction par défaut
              </button>
            )}
          </SelectionBar>
        ) : (
          <div className="grid-toolbar">
            <span className="muted small">Ajouter dans</span>
            <select className="select input-sm" style={{ width: 220 }} value={target || ''} onChange={(e) => setTarget(e.target.value || null)} aria-label="Groupe de fonctions">
              <option value="">Fonctions non groupées</option>
              {fgroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <span className="spacer" />
            <Menu
              trigger={<button className="btn"><Icon name="add" /> Fonction <Icon name="arrow_drop_down" /></button>}
              items={[
                { icon: 'people', label: 'Fonction équipe', onClick: () => setEdit(store.addFunction(project.id, sub.id, target, { kind: 'equipe', name: 'Nouvelle fonction', price: 0, priceType: 'heure', cost: 0, costType: 'heure', breakMinutes: 30 })) },
                { icon: 'local_shipping', label: 'Fonction transport', onClick: () => setEdit(store.addFunction(project.id, sub.id, target, { kind: 'transport', name: 'Transport', price: 0, priceType: 'km', cost: 0, costType: 'km', breakMinutes: 0 })) },
              ]}
            />
            <button className="btn btn-primary" onClick={() => setGroupEdit({})}><Icon name="add" /> Groupe de fonctions</button>
          </div>
        )}
        <div className="eq-scroll">
          {fns.length === 0 && fgroups.length === 0 ? (
            <Empty icon="people" title="Aucune fonction" text="Ajoutez les fonctions d'équipe (technicien, régisseur…) et de transport nécessaires au projet." />
          ) : (
            <table className="tree-table">
              <thead>
                <tr>
                  <th className="cb" />
                  <th className="caret" />
                  <th>Nom (interne)</th>
                  <th>Quantité</th>
                  <th>Période d'utilisation</th>
                  <th>Tarif</th>
                  <th className="num">Coûts totaux</th>
                  <th className="num">Prix total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sections.map((g) => {
                  const list = fns.filter((f) => (f.groupId || null) === g.id)
                  if (g.id === null && !list.length) return null
                  const fg = g.id ? idx.fgroup[g.id] : null
                  const pp = fg && idx.period[fg.usagePeriodId]
                  return [
                    <tr key={g.id || 'none'} className="folder" onDoubleClick={() => fg && setGroupEdit(fg)} title={fg ? 'Double-cliquez pour modifier le groupe' : undefined}>
                      <td className="cb" />
                      <td className="caret"><Icon name="arrow_drop_down" /></td>
                      <td colSpan={4}>
                        <Icon name="folder" size={19} className="folder-ico" />
                        <strong>{g.name}</strong>
                        {pp && <span className="sub">{fmtPeriod(pp.startsAt, pp.endsAt)}</span>}
                      </td>
                      <td className="num mono strong">{fmtMoney(list.reduce((s, f) => s + functionCost(f, idx), 0), cur)}</td>
                      <td className="num mono strong">{fmtMoney(list.reduce((s, f) => s + functionPrice(f, idx), 0), cur)}</td>
                      <td className="right">
                        {fg && (
                          <Menu
                            trigger={<button className="btn btn-ghost btn-icon btn-sm" aria-label="Options du groupe"><Icon name="more_vert" size={18} /></button>}
                            items={[
                              { icon: 'edit', label: 'Modifier le groupe', onClick: () => setGroupEdit(fg) },
                              { icon: 'delete', label: 'Supprimer le groupe', danger: true, onClick: () => { if (confirm(`Supprimer le groupe « ${fg.name} » ? Ses fonctions deviennent non groupées.`)) { useStore.setState({ functions: useStore.getState().functions.map((f) => (f.groupId === fg.id ? { ...f, groupId: null } : f)) }); store.remove('functionGroups', fg.id) } } },
                            ]}
                          />
                        )}
                      </td>
                    </tr>,
                    ...list.map((f) => {
                      const t = functionTimes(f, idx)
                      const fill = functionFill(f, idx)
                      return (
                        <tr key={f.id} className={`item ${selected.includes(f.id) ? 'selected' : ''}`} onDoubleClick={() => setEdit(f)}>
                          <td className="cb"><input type="checkbox" checked={selected.includes(f.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, f.id] : selected.filter((x) => x !== f.id))} aria-label={`Sélectionner ${f.name}`} /></td>
                          <td className="caret" />
                          <td className="name">
                            <span className="row" style={{ gap: 8 }}>
                              <Icon name={f.kind === 'transport' ? 'local_shipping' : 'people'} size={18} style={{ color: fill.full ? 'var(--success)' : 'var(--danger)' }} title={`${fill.planned}/${fill.needed} planifié(s)`} />
                              <button className="link-name" onClick={() => setEdit(f)}>{f.internalName || f.name}</button>
                            </span>
                          </td>
                          <td className="mono">{f.quantity}</td>
                          <td className="small nowrap">{t.useStart ? fmtPeriod(t.useStart, t.useEnd) : <span className="warning-text">Sans horaire</span>}</td>
                          <td className="small nowrap">{fmtMoney(f.price, cur)} {FUNCTION_PRICE_TYPES.find((x) => x.id === f.priceType)?.label}</td>
                          <td className="num mono">{fmtMoney(functionCost(f, idx), cur)}</td>
                          <td className="num mono">{fmtMoney(functionPrice(f, idx), cur)}</td>
                          <td className="right"><button className="btn btn-ghost btn-icon btn-sm row-action" onClick={() => store.removeFunction(f.id)} aria-label="Supprimer"><Icon name="delete" size={17} /></button></td>
                        </tr>
                      )
                    }),
                  ]
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="grid-footer">
          <span>{fns.filter((f) => f.kind === 'equipe').length} fonction(s) d'équipe · {fns.filter((f) => f.kind === 'transport').length} fonction(s) de transport</span>
          <span className="spacer" />
          <span>Coûts : <strong>{fmtMoney(totalCost, cur)}</strong></span>
          <span>Prix : <strong>{fmtMoney(totalPrice, cur)}</strong></span>
        </div>
      </div>

      {edit && <FunctionModal fn={edit} project={project} idx={idx} onClose={() => setEdit(null)} />}
      {groupEdit && <FunctionGroupModal group={groupEdit.id ? groupEdit : null} project={project} sub={sub} idx={idx} onClose={() => setGroupEdit(null)} onCreated={(g) => setTarget(g.id)} />}
    </div>
  )
}

function periodField(f, setF, periods, idKey, startKey, endKey, label) {
  return (
    <Field label={label} className="full">
      <select className="select" value={f[idKey] || ''} onChange={(e) => setF({ ...f, [idKey]: e.target.value || null })}>
        <option value="">Horaires propres à la fonction</option>
        {periods.map((p) => <option key={p.id} value={p.id}>{p.name} — {fmtPeriod(p.startsAt, p.endsAt)}</option>)}
      </select>
      {!f[idKey] && (
        <div style={{ marginTop: 6 }}>
          <DateRangeField start={f[startKey]} end={f[endKey]} onChange={({ start, end }) => setF({ ...f, [startKey]: start, [endKey]: end })} aria-label={label} />
        </div>
      )}
    </Field>
  )
}

function FunctionModal({ fn, project, idx, onClose }) {
  const store = useStore()
  const [f, setF] = useState(fn)
  const periods = idx.periodsByProject[project.id] || []
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const save = () => {
    if (!f.name.trim()) return toast('Le nom externe est obligatoire', 'error')
    store.upsert('functions', { ...f, quantity: Math.max(1, Number(f.quantity) || 1) })
    onClose()
  }
  const asg = idx.asgByFn[fn.id] || []
  return (
    <Modal
      title={f.kind === 'transport' ? 'Fonction de transport' : "Fonction d'équipe"}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" onClick={save}>Enregistrer</button>
        </>
      }
    >
      <div className="form-grid form-grid-3">
        <div className="full section-title">Détails</div>
        <Field label="Nom externe" hint="Affiché sur les devis et factures"><input className="input" value={f.name} onChange={set('name')} /></Field>
        <Field label="Nom interne" hint="Feuilles d'appel et planificateur"><input className="input" value={f.internalName || ''} onChange={set('internalName')} /></Field>
        <Field label={f.kind === 'transport' ? 'Nombre de véhicules' : 'Nombre de personnes'}><NumInput className="input input-num" value={f.quantity} min={1} onChange={(v) => setF({ ...f, quantity: Math.round(v) })} /></Field>
        <div className="full section-title" style={{ marginTop: 6 }}>Planning</div>
        {periodField(f, setF, periods, 'usagePeriodId', 'useStart', 'useEnd', "Période d'utilisation (facturée au client)")}
        {periodField(f, setF, periods, 'planningPeriodId', 'planStart', 'planEnd', 'Période de planification (mobilisation du personnel)')}
        {f.kind === 'equipe' && <Field label="Pause (minutes)"><NumInput className="input input-num" value={f.breakMinutes} onChange={(v) => setF({ ...f, breakMinutes: Math.round(v) })} /></Field>}
        <Field label="Temps de trajet (minutes)"><NumInput className="input input-num" value={f.travelMinutes} onChange={(v) => setF({ ...f, travelMinutes: Math.round(v) })} /></Field>
        {f.kind === 'transport' && <Field label="Distance entrepôt → lieu (km)"><NumInput className="input input-num" value={f.distanceKm} onChange={(v) => setF({ ...f, distanceKm: v })} /></Field>}
        <div className="full section-title" style={{ marginTop: 6 }}>Finance</div>
        <Field label="Prix">
          <div className="row" style={{ gap: 6 }}>
            <NumInput className="input input-num" style={{ width: 100 }} value={f.price} onChange={(v) => setF({ ...f, price: v })} />
            <select className="select" value={f.priceType} onChange={set('priceType')} aria-label="Type de prix">
              {FUNCTION_PRICE_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
        </Field>
        <Field label="Coûts">
          <div className="row" style={{ gap: 6 }}>
            <NumInput className="input input-num" style={{ width: 100 }} value={f.cost} onChange={(v) => setF({ ...f, cost: v })} />
            <select className="select" value={f.costType} onChange={set('costType')} aria-label="Type de coût">
              {FUNCTION_PRICE_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
        </Field>
        <Field label="Prix total"><strong className="mono" style={{ paddingTop: 8 }}>{fmtMoney(functionPrice(f, idx), idx.settings.currency)}</strong></Field>
        <Field label="Étiquettes" className="full" hint="Les membres du personnel avec les mêmes étiquettes apparaissent dans « Étiquettes correspondantes »">
          <TagInput value={f.tags || []} onChange={(tags) => setF({ ...f, tags })} suggestions={idx.settings.crewSkills || []} />
        </Field>
        <Field label="Remarque" className="full"><textarea className="textarea" value={f.remark || ''} onChange={set('remark')} /></Field>
        {asg.length > 0 && <div className="full alert alert-info"><span>{asg.length} ressource(s) déjà planifiée(s) sur cette fonction : leurs horaires suivent la période de planification de la fonction (sauf horaire personnalisé).</span></div>}
      </div>
    </Modal>
  )
}

function FunctionGroupModal({ group, project, sub, idx, onClose, onCreated }) {
  const store = useStore()
  const periods = idx.periodsByProject[project.id] || []
  const [f, setF] = useState(() => {
    if (group) return group
    const d = defaultPeriods(project.id, sub.id, idx)
    return { name: '', planningPeriodId: d.planning?.id || null, usagePeriodId: d.usage?.id || null }
  })
  const save = () => {
    if (!f.name.trim()) return toast('Le nom est obligatoire', 'error')
    if (group) store.patch('functionGroups', group.id, { name: f.name, planningPeriodId: f.planningPeriodId, usagePeriodId: f.usagePeriodId })
    else {
      const g = store.addFunctionGroup(project.id, sub.id, f.name)
      store.patch('functionGroups', g.id, { planningPeriodId: f.planningPeriodId, usagePeriodId: f.usagePeriodId })
      onCreated?.(g)
    }
    onClose()
  }
  return (
    <Modal title={group ? `Groupe « ${group.name} »` : 'Nouveau groupe de fonctions'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn btn-primary" onClick={save}>Enregistrer</button></>}>
      <div className="form-grid">
        <Field label="Nom *" className="full" hint="Ex. Montage, Démontage, Jour 1, Équipe du soir…"><input className="input" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Période de planification" className="full">
          <select className="select" value={f.planningPeriodId || ''} onChange={(e) => setF({ ...f, planningPeriodId: e.target.value || null })}>
            <option value="">— Aucune —</option>
            {periods.map((p) => <option key={p.id} value={p.id}>{p.name} — {fmtPeriod(p.startsAt, p.endsAt)}</option>)}
          </select>
        </Field>
        <Field label="Période d'utilisation" className="full">
          <select className="select" value={f.usagePeriodId || ''} onChange={(e) => setF({ ...f, usagePeriodId: e.target.value || null })}>
            <option value="">— Aucune —</option>
            {periods.map((p) => <option key={p.id} value={p.id}>{p.name} — {fmtPeriod(p.startsAt, p.endsAt)}</option>)}
          </select>
        </Field>
        <p className="full muted small" style={{ margin: 0 }}>Les fonctions du groupe sans horaires propres utilisent ces périodes.</p>
      </div>
    </Modal>
  )
}
