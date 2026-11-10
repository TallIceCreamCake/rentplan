import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { compareValues, display, isEmptyValue, rawOf, renderTemplate } from '../../lib/templates/engine'
import { sanitizeHtml, scopedCss, splitTopLevel, styleObject } from '../../lib/templates/sanitize'
import { makeEnv, resolveIn, withEnv } from '../../lib/templates/schema'
import { LABEL_FIELDS, loadDocFont, MODULES } from '../../lib/templates/defaults'
import { Icon } from '../ui'
import { docTexts } from '../../lib/templates'
import { buildContent, documentAmounts } from '../../lib/documents'
import { paidAmount } from '../../lib/model'

// Rendu d'un modèle : chaque bloc donne des « morceaux » (lignes de tableau, paragraphes…)
// mesurés puis répartis sur les pages du papier à en-tête, en-tête de tableau répété.

const CM = 37.7953 // px par cm (96 dpi)

const TXT = {
  fr: {
    empty: 'Dans cet exemple, ce module est vide. Cela peut être dû au fait que les données n’ont pas été saisies pour l’élément correspondant.',
    total: 'Total', totalOf: (x) => `Total ${x}:`, page: (n, t) => `Page ${n} / ${t}`,
    cat: { location: 'Total équipement de location', vente: 'Total articles de vente', personnel: 'Total équipe', transport: 'Total transport', autres: 'Total coûts supplémentaires' },
    disc: { location: 'Remise équipement de location', vente: 'Remise articles de vente', personnel: 'Remise équipe', transport: 'Remise transport', autres: 'Remise coûts supplémentaires' },
    insurance: 'Assurance', projectDiscount: 'Remise projet', exVat: 'Prix hors TVA :', vat: (r) => `${r}% TVA:`, inVat: 'Prix TTC:', deposit: 'Caution:', paid: 'Déjà payé:', balance: 'Reste à payer:',
    partial: (p) => `Facture partielle (${p} %):`, signedBy: (n, d) => `Signé numériquement par ${n} le ${d}`, comment: 'Commentaire :', iban: 'IBAN', bic: 'BIC', holder: 'Titulaire', bank: 'Banque',
    byTransfer: 'Règlement par virement', reference: 'Référence à indiquer', methods: 'Moyens de paiement acceptés', noPayment: 'Aucun paiement reçu pour le moment.', optional: 'optionnel',
    approval: 'Bon pour accord — date, nom et signature', from: 'Depuis', to: 'À', author: 'Par',
  },
  en: {
    empty: 'In this example, this module is empty. This may be because no data has been entered for the corresponding item.',
    total: 'Total', totalOf: (x) => `Total ${x}:`, page: (n, t) => `Page ${n} / ${t}`,
    cat: { location: 'Total rental equipment', vente: 'Total sale items', personnel: 'Total crew', transport: 'Total transport', autres: 'Total additional costs' },
    disc: { location: 'Rental equipment discount', vente: 'Sale items discount', personnel: 'Crew discount', transport: 'Transport discount', autres: 'Additional costs discount' },
    insurance: 'Insurance', projectDiscount: 'Project discount', exVat: 'Price excl. VAT:', vat: (r) => `${r}% VAT:`, inVat: 'Price incl. VAT:', deposit: 'Deposit:', paid: 'Already paid:', balance: 'Balance due:',
    partial: (p) => `Partial invoice (${p} %):`, signedBy: (n, d) => `Digitally signed by ${n} on ${d}`, comment: 'Comment:', iban: 'IBAN', bic: 'BIC', holder: 'Account holder', bank: 'Bank',
    byTransfer: 'Payment by bank transfer', reference: 'Payment reference', methods: 'Accepted payment methods', noPayment: 'No payment received yet.', optional: 'optional',
    approval: 'Approved — date, name and signature', from: 'From', to: 'To', author: 'By',
  },
}
const tr = (rctx) => TXT[rctx.env.language] || TXT.fr

// ---------- Thème ----------
const safeFont = (f) => String(f || '').replace(/['"\\;{}]/g, '')
export function themeStyle(template) {
  const s = template.style
  return {
    '--d-font': `'${safeFont(s.font)}', 'Source Sans 3', Arial, sans-serif`,
    '--d-hfont': s.headingFont ? `'${safeFont(s.headingFont)}', 'Source Sans 3', Arial, sans-serif` : 'var(--d-font)',
    '--d-size': `${Number(s.size) || 9}pt`,
    '--d-lh': Number(s.lineHeight) || 1.35,
    '--d-color': s.color,
    '--d-hcolor': s.headingColor,
    '--d-h1': `${Number(s.h1Size) || 19}pt`,
    '--d-h2': `${Number(s.h2Size) || 13}pt`,
    '--d-accent': s.accent,
    '--d-line': template.thinLines ? '0.6px' : '1px',
    '--d-linec': s.lineColor,
    '--d-headbg': s.headerBg,
  }
}

function collectBlocks(blocks, out = []) {
  for (const b of blocks || []) {
    out.push(b)
    if (b.type === 'section') for (const c of b.columns || []) collectBlocks(c, out)
    if (b.type === 'subprojects') collectBlocks(b.children, out)
  }
  return out
}

/** CSS personnalisé du modèle (Styles) et des modules (Style du module), limité au document. */
export function DocStyles({ template }) {
  const css = [scopedCss(`.tpl-${template.id}`, template.style.css), ...collectBlocks(template.blocks).map((b) => scopedCss(`.tpl-${template.id} .b-${b.id}`, b.style?.css))].filter(Boolean).join('\n')
  useEffect(() => {
    loadDocFont(template.style.font)
    if (template.style.headingFont) loadDocFont(template.style.headingFont)
  }, [template.style.font, template.style.headingFont])
  return css ? <style>{css}</style> : null
}

// ---------- Cellules et lignes de tableau ----------
const gridOf = (cols) => cols.map((c) => `minmax(0, ${Math.max(0.5, Number(c.width) || 1)}fr)`).join(' ')
const LABEL_PATHS = ['name', 'title', 'vehicle', 'date']
const PRICE_PATHS = new Set(['unit_price', 'factor', 'discount', 'price'])
const labelIndex = (cols) => Math.max(0, cols.findIndex((c) => LABEL_PATHS.includes(c.path)))
const valueIndex = (cols) => {
  const i = cols.map((c) => c.path).lastIndexOf('price')
  if (i >= 0) return i
  const j = cols.map((c) => c.path).lastIndexOf('amount')
  return j >= 0 ? j : cols.length - 1
}
const cellPad = (c, extra = 0) => ({ paddingLeft: (Number(c.marginLeft) || 0) + extra, paddingRight: Number(c.marginRight) || 0 })

function Row({ cols, className = '', style, children }) {
  return (
    <div className={`dt-row ${className}`} style={{ gridTemplateColumns: gridOf(cols), ...style }}>
      {children}
    </div>
  )
}

function cellContent(v, env) {
  if (v && v.$t === 'html') return <span dangerouslySetInnerHTML={{ __html: sanitizeHtml(rawOf(v)) }} />
  return display(v, env.fmt)
}

/** Mise en forme conditionnelle d'une ligne (Style du module). */
function conditional(block, node, src, env) {
  const style = {}
  let hide = false
  for (const r of block.style?.conditional || []) {
    if (!r.path) continue
    const v = rawOf(resolveIn(node, src, String(r.path).split('.'), env))
    if (!compareValues(r.op || '==', v ?? '', r.value ?? '')) continue
    if (r.hide) hide = true
    if (r.bold) style.fontWeight = 700
    if (r.italic) style.fontStyle = 'italic'
    if (r.color) style.color = r.color
    if (r.background) style.background = r.background
  }
  return { style, hide }
}

const headerText = (c, o) => c.header || (LABEL_PATHS.includes(c.path) ? o.title || '' : '')

/**
 * Tableau générique : en-tête, sections (titre, lignes, sous-total) et total.
 * sections : [{ key, title, rows: [{ key, src, depth, className, blank }], subtotal }]
 */
function tableParts(block, rctx, node, sections, { total, totalLabel } = {}) {
  const cols = (block.columns || []).filter((c) => c.path)
  if (!cols.length) return []
  const env = rctx.env
  const o = block.options || {}
  const st = block.style || {}
  const headStyle = o.headerStyle || st.headerStyle || rctx.template.style.tableHeader || 'encadre'
  const li = labelIndex(cols)
  const vi = valueIndex(cols)
  const out = []
  const head =
    headStyle === 'titre'
      ? { key: 'head', head: true, keepWithNext: true, el: o.title ? <h3 className="dm-title">{o.title}</h3> : <span /> }
      : {
          key: 'head',
          head: true,
          keepWithNext: true,
          el: (
            <div className={`dt-head hs-${headStyle}`} style={st.headerBg ? { background: st.headerBg } : null}>
              <Row cols={cols}>
                {cols.map((c) => (
                  <div key={c.id || c.path} className={`dt-cell a-${c.align}`} style={{ ...cellPad(c), ...styleObject(c.css) }}>{headerText(c, o)}</div>
                ))}
              </Row>
            </div>
          ),
        }
  out.push(head)
  const sumRow = (key, label, value, className) => ({
    key,
    repeat: head,
    el: (
      <Row cols={cols} className={className}>
        {li > 0 && <div style={{ gridColumn: `1 / ${li + 1}` }} />}
        <div className="dt-cell" style={{ gridColumn: `${li + 1} / ${Math.max(li + 2, vi + 1)}`, ...cellPad(cols[li]) }}>{label}</div>
        <div className={`dt-cell a-${cols[vi].align}`} style={{ gridColumn: `${Math.max(li + 2, vi + 1)} / -1`, ...cellPad(cols[vi]) }}>{value}</div>
      </Row>
    ),
  })
  let n = 0
  for (const sec of sections) {
    if (sec.title) {
      out.push({
        key: `g-${sec.key}`,
        repeat: head,
        keepWithNext: true,
        el: (
          <Row cols={cols} className="dt-group" style={st.groupColor ? { color: st.groupColor } : null}>
            {li > 0 && <div style={{ gridColumn: `1 / ${li + 1}` }} />}
            <div className="dt-cell" style={{ gridColumn: `${li + 1} / -1`, ...cellPad(cols[li]), fontWeight: st.groupBold === false ? 400 : 700 }}>
              {sec.title}
              {sec.subtitle && <span className="dt-group-sub"> {sec.subtitle}</span>}
            </div>
          </Row>
        ),
      })
      if (sec.remark) out.push({ key: `gr-${sec.key}`, repeat: head, el: <Row cols={cols} className="dt-remark">{li > 0 && <div style={{ gridColumn: `1 / ${li + 1}` }} />}<div className="dt-cell" style={{ gridColumn: `${li + 1} / -1`, ...cellPad(cols[li]) }}>{sec.remark}</div></Row> })
    }
    for (const r of sec.rows) {
      const cond = conditional(block, node, r.src, env)
      if (cond.hide) continue
      const indent = (r.depth || 0) * 12
      out.push({
        key: `r-${r.key}`,
        repeat: head,
        el: (
          <>
            <Row cols={cols} className={`${r.className || ''} ${r.depth ? 'dt-child' : ''} ${n++ % 2 ? 'odd' : ''}`} style={{ ...(r.depth && r.contents ? { fontStyle: st.contentsItalic ? 'italic' : undefined, color: st.contentsColor || undefined } : null), ...cond.style }}>
              {cols.map((c) => {
                const v = resolveIn(node, r.src, c.path.split('.'), env)
                const blank = (r.blank && PRICE_PATHS.has(c.path)) || ((c.hideZero === true || c.hideZero === 'oui') && isEmptyValue(v))
                return (
                  <div key={c.id || c.path} className={`dt-cell a-${c.align}`} style={{ ...cellPad(c, c.path === 'quantity' || c.path === 'name' ? indent : 0), ...styleObject(c.css) }}>
                    {blank ? '' : cellContent(v, env)}
                  </div>
                )
              })}
            </Row>
            {r.note && (
              <Row cols={cols} className="dt-note">
                {li > 0 && <div style={{ gridColumn: `1 / ${li + 1}` }} />}
                <div className="dt-cell" style={{ gridColumn: `${li + 1} / -1`, ...cellPad(cols[li], indent) }}>{r.note}</div>
              </Row>
            )}
          </>
        ),
      })
    }
    if (sec.subtotal != null) out.push(sumRow(`t-${sec.key}`, tr(rctx).totalOf(sec.subtotalLabel || sec.title || ''), display({ $t: 'price', v: sec.subtotal }, env.fmt), 'dt-sum'))
  }
  if (total != null) out.push(sumRow('total', totalLabel, display({ $t: 'price', v: total }, env.fmt), 'dt-sum dt-total'))
  return out
}

const lcFirst = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s)
const sum = (list, f) => list.reduce((s, x) => s + (Number(f(x)) || 0), 0)

// ---------- Modules ----------
function equipmentParts(block, rctx) {
  const o = block.options
  const prefix = o.subprojectTitle === 'oui' || (o.subprojectTitle === 'auto' && rctx.subs.length > 1 && !rctx.inSub)
  const keep = (l) => {
    if (l.depth > 0) return !((l.relation === 'contenu' && !o.showContents) || (l.relation === 'accessoire' && !o.showAccessories))
    if (o.optional === 'sans' && l.optional) return false
    if (o.optional === 'uniquement' && !l.optional) return false
    if (o.kind && o.kind !== 'tous' && l.kind !== o.kind) return false
    if (o.warehouse === 'prets' && !(l.ready + l.onSite > 0)) return false
    if (o.warehouse === 'a_preparer' && !(l.toPrepare > 0)) return false
    if (o.hideZeroLines && !Number(l.total)) return false
    return true
  }
  const filter = (lines) => {
    const out = []
    let skip = Infinity
    for (const l of lines) {
      if (l.depth > skip) continue
      skip = Infinity
      if (!keep(l)) {
        skip = l.depth
        continue
      }
      out.push(l)
    }
    return out
  }
  const fmt = rctx.env.fmt
  let groups = rctx.subs.flatMap((sp) =>
    sp.groups.map((g) => ({
      key: `${sp.id}-${g.id}`,
      title: prefix ? `${sp.name} — ${g.name}` : g.name,
      subtitle: o.showGroupPeriod && g.start ? `(${display({ $t: 'datetime', v: g.start }, fmt)} – ${display({ $t: 'datetime', v: g.end }, fmt)})` : '',
      remark: o.showGroupRemark ? g.remark : '',
      lines: filter(g.lines),
    })),
  )
  if (o.groupBy === 'categorie' || o.groupBy === 'aucun') {
    const all = groups.flatMap((g) => g.lines)
    const map = new Map()
    let cur = null
    for (const l of all) {
      if (!l.depth) cur = o.groupBy === 'aucun' ? '' : l.category || 'Sans catégorie'
      if (!map.has(cur)) map.set(cur, [])
      map.get(cur).push(l)
    }
    groups = [...map].map(([k, lines]) => ({ key: `c-${k}`, title: k, lines }))
  }
  const sections = groups
    .filter((g) => g.lines.length)
    .map((g) => ({
      key: g.key,
      title: o.showGroupTitle && g.title ? g.title : '',
      subtitle: g.subtitle,
      remark: g.remark,
      subtotal: o.showSubtotals && g.title ? sum(g.lines.filter((l) => !l.depth), (l) => l.total) : null,
      subtotalLabel: g.title,
      rows: g.lines.map((l) => ({
        key: `${g.key}-${l.id}`,
        src: l,
        depth: l.depth,
        contents: l.relation === 'contenu',
        blank: l.depth > 0 && !Number(l.total) && !Number(l.unitPrice),
        className: l.optional ? 'dt-optional' : '',
        note: o.showLineRemark && l.remark ? l.remark : '',
      })),
    }))
  return sections.length ? tableParts(block, rctx, 'line', sections) : []
}

function functionRows(fns, o) {
  return fns
    .filter((f) => !(o.hideZeroLines && !Number(f.total)))
    .map((f) => ({ key: f.id, src: f, note: o.showAssigned && f.assigned?.length ? f.assigned.map((a) => a.name).filter(Boolean).join(', ') : '' }))
}

function functionGroupParts(block, rctx) {
  const o = block.options
  const sections = rctx.subs.flatMap((sp) =>
    sp.functionGroups
      .map((g) => ({ ...g, functions: g.functions.filter((f) => o.include === 'tous' || !o.include || f.kind === o.include) }))
      .filter((g) => g.functions.length)
      .map((g) => ({ key: `${sp.id}-${g.id}`, title: o.showGroupTitle ? g.name : '', subtotal: o.showSubtotals ? sum(g.functions, (f) => f.total) : null, subtotalLabel: g.name, rows: functionRows(g.functions, o) })),
  )
  return sections.length ? tableParts(block, rctx, 'fn', sections) : []
}

function kindFunctionParts(block, rctx, kind) {
  const o = block.options
  const fns = rctx.subs.flatMap((sp) => sp.functionGroups.flatMap((g) => g.functions)).filter((f) => f.kind === kind)
  if (!fns.length) return []
  return tableParts(block, rctx, 'fn', [{ key: kind, rows: functionRows(fns, o) }], o.showTotal ? { total: sum(fns, (f) => f.total), totalLabel: tr(rctx).totalOf(lcFirst(o.title)) } : {})
}

function planningParts(block, rctx, vehicles) {
  const rows = rctx.subs
    .flatMap((sp) => sp.functionGroups.flatMap((g) => g.functions))
    .flatMap((f) => (f.assigned || []).filter((a) => Boolean(a.isVehicle) === vehicles).map((a, i) => ({ key: `${f.id}-${i}`, src: { ...a, function: f.name } })))
  return rows.length ? tableParts(block, rctx, 'asg', [{ key: 'asg', rows }]) : []
}

function costParts(block, rctx) {
  const o = block.options
  const costs = rctx.subs.flatMap((sp) => sp.costs.map((c, i) => ({ ...c, key: `${sp.id}-${i}` }))).filter((c) => !(o.hideZeroLines && !Number(c.total)))
  if (!costs.length) return []
  return tableParts(block, rctx, 'cost', [{ key: 'costs', rows: costs.map((c) => ({ key: c.key, src: c })) }], o.showTotal ? { total: sum(costs, (c) => c.total), totalLabel: tr(rctx).totalOf(lcFirst(o.title)) } : {})
}

function periodParts(block, rctx) {
  const o = block.options
  const ids = new Set(rctx.subs.map((s) => s.id))
  const list = (rctx.content.periods || []).filter((p) => (!p.subprojectId || ids.has(p.subprojectId)) && (!o.onlyExternal || p.external))
  return list.length ? tableParts(block, rctx, 'period', [{ key: 'periods', rows: list.map((p) => ({ key: p.id, src: p })) }]) : []
}

function groupParts(block, rctx) {
  const o = block.options
  const groups = rctx.subs.flatMap((sp) => sp.groups.map((g) => ({ ...g, key: `${sp.id}-${g.id}` }))).filter((g) => g.lines.length)
  if (!groups.length) return []
  return tableParts(block, rctx, 'group', [{ key: 'groups', rows: groups.map((g) => ({ key: g.key, src: g })) }], o.showTotal ? { total: sum(groups, (g) => sum(g.lines.filter((l) => !l.depth && !l.optional), (l) => l.total)), totalLabel: tr(rctx).totalOf(lcFirst(o.title)) } : {})
}

function taskParts(block, rctx) {
  const list = (rctx.content.tasks || []).filter((t) => !(block.options.hideDone && t.status === 'termine'))
  return list.length ? tableParts(block, rctx, 'task', [{ key: 'tasks', rows: list.map((t, i) => ({ key: String(i), src: t })) }]) : []
}

function paymentParts(block, rctx) {
  const doc = rctx.doc
  const o = block.options
  const t = tr(rctx)
  const list = doc.payments || []
  if (!list.length && !rctx.editor) return []
  const parts = tableParts(block, rctx, 'payment', [{ key: 'pay', rows: list.map((p, i) => ({ key: String(i), src: p })) }])
  if (!list.length) parts.push({ key: 'none', el: <p className="dm-muted">{t.noPayment}</p> })
  if (o.showBalance) {
    const fmt = rctx.env.fmt
    parts.push({
      key: 'bal',
      el: (
        <div className="dm-kv">
          <div className="kv-row"><span>{t.paid}</span><span>{display({ $t: 'price', v: paidAmount(doc) }, fmt)}</span></div>
          <div className="kv-row strong"><span>{t.balance}</span><span>{display({ $t: 'price', v: documentAmounts(doc).total - paidAmount(doc) }, fmt)}</span></div>
        </div>
      ),
    })
  }
  return parts
}

/** Somme : totaux par catégorie, remises, TVA, caution et paiements (options de Rentman). */
function totalsParts(block, rctx) {
  const o = block.options
  const t = tr(rctx)
  const fmt = rctx.env.fmt
  const doc = rctx.doc
  const price = (v) => display({ $t: 'price', v }, fmt)
  const sp = rctx.inSub ? rctx.subs[0] : null
  const totals = sp ? sp.totals : doc.totals || {}
  const cats = totals.categories || {}
  const am = sp ? { exVat: totals.totalExVat, vat: totals.vat, total: totals.total } : documentAmounts(doc)
  const vatRate = doc.totals?.vatRate ?? 0
  const neg = doc.type === 'avoir' && o.extendNegative ? -1 : 1
  const shown = (o.categories || []).filter((k) => cats[k] && (o.emptyCategories === 'afficher' || Number(cats[k].revenue)))
  const rows = []
  let gross = 0
  let catDisc = 0
  for (const k of Object.keys(cats)) {
    gross += Number(cats[k].revenue) || 0
    catDisc += Number(cats[k].discount) || 0
  }
  if (o.showCategories) {
    for (const k of shown) {
      rows.push({ k: `c-${k}`, label: `${t.cat[k]}:`, value: price(neg * cats[k].revenue) })
      if (o.showGroupDiscount && Number(cats[k].discount)) {
        const pct = cats[k].revenue ? Math.round((cats[k].discount / cats[k].revenue) * 1000) / 10 : 0
        rows.push({ k: `d-${k}`, label: `${t.disc[k]}:`, value: o.groupDiscountFormat === 'montant' ? `- ${price(cats[k].discount)}` : `- ${pct} %`, muted: true })
      }
    }
  }
  const insurance = Number(totals.insurance) || 0
  if (o.showInsurance && insurance) rows.push({ k: 'ins', label: `${t.insurance}:`, value: price(neg * insurance) })
  const projectDisc = Number(totals.discountTotal) || 0
  // « Total » : avant les remises qu'affiche la ligne « Remise projet »
  const groupShown = o.showCategories && o.showGroupDiscount
  const subtotal = gross + (o.showInsurance ? insurance : 0) - (groupShown ? catDisc : 0)
  const discount = (groupShown ? 0 : catDisc) + projectDisc
  if (rows.length) rows.push({ k: 'sub', label: `${t.total}:`, value: price(neg * subtotal), line: true, strong: true })
  if (o.showTotalDiscount && discount > 0.004) {
    const base = gross + insurance
    rows.push({ k: 'disc', label: `${t.projectDiscount}:`, value: o.totalDiscountFormat === 'pourcentage' && base ? `- ${Math.round((discount / base) * 1000) / 10} %` : `- ${price(discount)}` })
  }
  if (!sp && doc.partialPct != null) rows.push({ k: 'partial', label: t.partial(doc.partialPct), value: price((doc.totals?.totalExVat || 0) * (doc.partialPct / 100) * (doc.type === 'avoir' ? -1 : 1)) })
  if (!sp) for (const [i, l] of (doc.extraLines || []).entries()) rows.push({ k: `x${i}`, label: `${l.label}:`, value: price(l.amount) })
  rows.push({ k: 'ex', label: t.exVat, value: price(am.exVat), line: true, strong: true })
  if (o.showVat) rows.push({ k: 'vat', label: t.vat(vatRate), value: price(am.vat) })
  rows.push({ k: 'in', label: t.inVat, value: price(am.total), line: true, strong: true })
  if (o.showDeposit) {
    const dep = sp ? sp.deposit : rctx.subs.reduce((s, x) => s + (Number(x.deposit) || 0), 0)
    if (dep) rows.push({ k: 'dep', label: t.deposit, value: price(dep) })
  }
  if (o.showPayments && !sp && (doc.payments || []).length) {
    rows.push({ k: 'paid', label: t.paid, value: `- ${price(paidAmount(doc))}` })
    rows.push({ k: 'bal', label: t.balance, value: price(am.total - paidAmount(doc)), strong: true })
  }
  return [
    {
      key: 'sum',
      el: (
        <div className="dm-sum">
          {o.title && <h3 className="dm-title">{o.title}</h3>}
          {rows.map((r) => (
            <div key={r.k} className={`kv-row ${r.line ? 'line' : ''} ${r.strong ? 'strong' : ''} ${r.muted ? 'muted' : ''}`} style={{ justifyContent: o.labelAlign === 'droite' ? 'flex-end' : undefined }}>
              <span style={o.labelAlign === 'droite' ? { flex: 1, textAlign: 'right', paddingRight: 24 } : null}>{r.label}</span>
              <span className="v">{r.value}</span>
            </div>
          ))}
        </div>
      ),
    },
  ]
}

function signatureParts(block, rctx) {
  const doc = rctx.doc
  const o = block.options
  const t = tr(rctx)
  const sig = rctx.template.signature || {}
  const title = renderTemplate(o.title || '', rctx.env, { html: false })
  if (o.mode === 'manuscrite') {
    return [{ key: 'sig', el: <div className="dm-sign">{title && <h3 className="dm-title">{title}</h3>}<div className="dm-sign-box" style={{ width: `${o.width || 60}%` }}>{t.approval}</div></div> }]
  }
  const s = doc.signature
  const signed = s && sig.showSigned !== false
  const url = `${window.location.origin}/signer/${doc.id}`
  return [
    {
      key: 'sig',
      el: (
        <div className="dm-sign" style={{ textAlign: o.align === 'center' ? 'center' : o.align === 'right' ? 'right' : 'left' }}>
          {title && <h3 className="dm-title">{title}</h3>}
          {signed ? (
            <div className="dm-signed">
              {s.image && <img src={s.image} alt="" />}
              <div>{t.signedBy(s.name, display({ $t: 'datetime', v: doc.signedAt || s.signedAt }, rctx.env.fmt))}</div>
              {s.comment && <div className="dm-muted">{t.comment} {s.comment}</div>}
            </div>
          ) : (
            <a
              className={`dm-sign-btn ${sig.size === 'grand' ? 'big' : ''}`}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={rctx.editor ? (e) => e.preventDefault() : undefined}
              style={{ background: sig.buttonColor, color: sig.textColor, width: `${o.width || 60}%` }}
            >
              {sig.buttonText}
            </a>
          )}
        </div>
      ),
    },
  ]
}

function conditionParts(block, rctx) {
  const o = block.options
  const texts = []
  if (o.document && rctx.doc.notes) texts.push(rctx.doc.notes)
  if (o.subprojects) for (const sp of rctx.subs) if (sp.conditions) texts.push(sp.conditions)
  if (!texts.length) return []
  return [
    { key: 't', keepWithNext: true, el: o.title ? <h3 className="dm-title">{o.title}</h3> : <span /> },
    ...texts.map((x, i) => ({ key: `p${i}`, el: <p className="dm-text">{x}</p> })),
  ]
}

function noteParts(block, rctx) {
  const o = block.options
  const t = tr(rctx)
  const ids = new Set(rctx.subs.map((s) => s.id))
  const list = (rctx.content.notes || []).filter((n) => (o.scope === 'toutes' || n.scope === o.scope) && (!n.subprojectId || ids.has(n.subprojectId)))
  const remark = o.projectRemark ? rctx.idx.project[rctx.doc.projectId]?.externalNotes : ''
  if (!list.length && !remark) return []
  return [
    { key: 't', keepWithNext: true, el: o.title ? <h3 className="dm-title">{o.title}</h3> : <span /> },
    ...(remark ? [{ key: 'remark', el: <p className="dm-text">{remark}</p> }] : []),
    ...list.map((n, i) => ({ key: `n${i}`, el: <p className="dm-text">{n.text}{o.showAuthor && n.author ? <span className="dm-muted"> — {t.author} {n.author}</span> : null}</p> })),
  ]
}

function insuranceParts(block, rctx) {
  const o = block.options
  const amount = rctx.inSub ? rctx.subs[0].totals.insurance : rctx.doc.totals?.insurance
  if (!Number(amount)) return []
  return [
    {
      key: 'ins',
      el: (
        <div>
          {o.title && <h3 className="dm-title">{o.title}</h3>}
          <p className="dm-text">
            {renderTemplate(o.text || '', rctx.env, { html: false })}
            {o.showAmount && <> ({display({ $t: 'price', v: amount }, rctx.env.fmt)})</>}
          </p>
        </div>
      ),
    },
  ]
}

function bankParts(block, rctx) {
  const s = rctx.settings
  const o = block.options
  const t = tr(rctx)
  if (!s.iban) return []
  return [
    {
      key: 'bank',
      el: (
        <div className="dm-bank">
          {o.title && <h3 className="dm-title">{o.title}</h3>}
          <div>{t.byTransfer} — {t.iban} : <strong>{s.iban}</strong>{s.bic && <> · {t.bic} : {s.bic}</>}</div>
          <div>{t.holder} : {s.accountHolder || s.companyName}{s.bankName && <> · {t.bank} : {s.bankName}</>}</div>
          {o.showReference && <div>{t.reference} : <strong>{rctx.doc.number}</strong></div>}
          {o.showMethods && (s.paymentMethods || []).length > 0 && <div>{t.methods} : {s.paymentMethods.join(', ')}</div>}
        </div>
      ),
    },
  ]
}

/** QR « EPC » (SEPA) : montant et référence pré-remplis dans l'application bancaire. */
export function epcPayload(settings, doc) {
  const iban = String(settings.iban || '').replace(/\s+/g, '')
  const total = documentAmounts(doc).total - paidAmount(doc)
  if (!iban || (settings.currency || 'EUR') !== 'EUR' || total <= 0) return ''
  return ['BCD', '002', '1', 'SCT', String(settings.bic || '').replace(/\s+/g, ''), String(settings.accountHolder || settings.companyName || '').slice(0, 70), iban, `EUR${total.toFixed(2)}`, '', '', String(doc.number || '').slice(0, 140)].join('\n')
}

function QrImage({ text, size, alt = 'QR de paiement' }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let alive = true
    if (text) QRCode.toDataURL(text, { errorCorrectionLevel: 'M', margin: 0, width: 360 }).then((url) => alive && setSrc(url)).catch(() => {})
    return () => {
      alive = false
    }
  }, [text])
  return <span className="dm-qr" style={{ width: `${size}cm`, height: `${size}cm` }}>{src && <img src={src} alt={alt} />}</span>
}

// ---------- Étiquettes de matériel ----------
/** Équipement et numéro de série d'une étiquette. */
const labelOf = (rctx) => {
  const l = rctx.doc.label || {}
  const serial = l.serialId ? rctx.idx.d.serials.find((x) => x.id === l.serialId) : null
  return { eq: rctx.idx.eq[l.equipmentId || serial?.equipmentId], serial }
}

/** Contenu du QR : le numéro de série (lu par la douchette de l'entrepôt), le lien vers la fiche ou le code. */
export function labelQrPayload(content, eq, serial) {
  if (!eq) return ''
  if (content === 'lien') return `${window.location.origin}/equipements/${eq.id}${serial ? `?tab=series&sn=${encodeURIComponent(serial.serial)}` : ''}`
  if (content === 'code') return eq.code || eq.name
  return serial?.serial || eq.code || eq.name
}

function labelQrParts(block, rctx) {
  const o = block.options
  const { eq, serial } = labelOf(rctx)
  const payload = labelQrPayload(o.content, eq, serial)
  if (!payload) return []
  const caption = o.caption ? renderTemplate(o.caption, rctx.env, { html: false }).trim() : ''
  return [{
    key: 'qr',
    el: (
      <div className={`dm-qrbox dm-label-qr a-${o.align || 'left'}`}>
        <QrImage text={payload} size={Number(o.size) || 2.4} alt={`QR ${payload}`} />
        {caption && <div className="dm-label-caption">{caption}</div>}
      </div>
    ),
  }]
}

function labelDetailsParts(block, rctx) {
  const o = block.options
  const { eq, serial } = labelOf(rctx)
  if (!eq) return []
  const s = rctx.settings
  const fmtDate = (v) => (v ? display({ $t: 'date', v }, rctx.env.fmt) : '')
  const values = {
    name: eq.name,
    serial: serial?.serial,
    code: eq.code,
    internalRef: serial?.internalRef,
    category: rctx.idx.cat[eq.categoryId]?.name,
    location: eq.location,
    stockLocation: rctx.idx.location[serial?.stockLocationId]?.name,
    purchaseDate: fmtDate(serial?.purchaseDate),
    weight: Number(eq.weight) ? `${eq.weight} kg` : '',
    power: Number(eq.power) ? `${eq.power} W` : '',
    company: s.companyName,
    phone: s.phone,
  }
  const labels = Object.fromEntries(LABEL_FIELDS)
  const short = { serial: 'N° de série', internalRef: 'Réf.', location: 'Emplacement', stockLocation: 'Dépôt', purchaseDate: 'Achat', company: 'Propriétaire', phone: 'Tél.' }
  const fields = (o.fields || []).filter((k) => values[k])
  if (!fields.length) return []
  return [{
    key: 'details',
    el: (
      <div className="dm-label-details">
        {fields.map((k) =>
          k === 'name' ? (
            <div key={k} className="dm-label-name" style={{ fontSize: `${Number(o.nameSize) || 10}pt` }}>{values.name}</div>
          ) : (
            <div key={k} className={`dm-label-row k-${k}`}>
              {o.showLabels && <span className="dm-label-key">{short[k] || labels[k]} :</span>}
              <span className={k === 'serial' || k === 'code' ? 'dm-label-val mono' : 'dm-label-val'}>{values[k]}</span>
            </div>
          ),
        )}
      </div>
    ),
  }]
}

function labelImageParts(block, rctx) {
  const o = block.options
  const { eq } = labelOf(rctx)
  if (!eq?.imageUrl) return []
  return [{ key: 'img', el: <div className={`dm-label-img a-${o.align || 'left'}`}><img src={eq.imageUrl} alt="" style={{ height: `${Number(o.height) || 1.8}cm` }} /></div> }]
}

function qrParts(block, rctx) {
  const o = block.options
  const payload = epcPayload(rctx.settings, rctx.doc)
  if (!payload) return []
  return [
    {
      key: 'qr',
      el: (
        <div className={`dm-qrbox a-${o.align || 'left'}`}>
          <QrImage text={payload} size={Number(o.size) || 3.2} />
          {o.caption && <div className="dm-muted">{o.caption}</div>}
        </div>
      ),
    },
  ]
}

function htmlParts(html, rctx, split) {
  const clean = sanitizeHtml(renderTemplate(html || '', rctx.env))
  if (!clean.replace(/<[^>]*>/g, '').trim() && !/<(img|hr|table)/i.test(clean)) return []
  const parts = split ? splitTopLevel(clean) : [clean]
  return parts.map((h, i) => ({ key: `h${i}`, el: <div className="doc-rich" dangerouslySetInnerHTML={{ __html: h }} /> }))
}

function moduleParts(block, rctx) {
  switch (block.module) {
    case 'equipment': return equipmentParts(block, rctx)
    case 'equipmentGroups': return groupParts(block, rctx)
    case 'functionGroups': return functionGroupParts(block, rctx)
    case 'crewFunctions': return kindFunctionParts(block, rctx, 'equipe')
    case 'transportFunctions': return kindFunctionParts(block, rctx, 'transport')
    case 'crewPlanning': return planningParts(block, rctx, false)
    case 'vehiclePlanning': return planningParts(block, rctx, true)
    case 'costs': return costParts(block, rctx)
    case 'planning': return periodParts(block, rctx)
    case 'tasks': return taskParts(block, rctx)
    case 'notes': return noteParts(block, rctx)
    case 'totals': return totalsParts(block, rctx)
    case 'signature': return signatureParts(block, rctx)
    case 'conditions': return conditionParts(block, rctx)
    case 'insurance': return insuranceParts(block, rctx)
    case 'documentText': return htmlParts(rctx.doc.body, rctx, !rctx.nested)
    case 'payments': return paymentParts(block, rctx)
    case 'bankDetails': return bankParts(block, rctx)
    case 'paymentQr': return qrParts(block, rctx)
    case 'qrCode': return labelQrParts(block, rctx)
    case 'equipmentDetails': return labelDetailsParts(block, rctx)
    case 'equipmentImage': return labelImageParts(block, rctx)
    default: return []
  }
}

// ---------- Blocs ----------
const blockClass = (b) => {
  const st = b.style || {}
  return ['dk', `dk-${b.type}`, b.type === 'module' ? `dm-${b.module}` : '', `b-${b.id}`, st.className || '', st.stripes ? 'stripes' : '', st.rowLines ? 'row-lines' : ''].filter(Boolean).join(' ')
}
const blockStyle = (b) => {
  const st = b.style || {}
  return { fontSize: st.fontSize ? `${st.fontSize}pt` : undefined, color: st.color || undefined, background: st.background || undefined }
}

/** Morceaux d'un bloc : { key, el, pad, cls, style, keepWithNext, pageBreak, repeat }. */
export function renderBlock(block, rctx) {
  let parts = []
  if (block.type === 'pagebreak') return [{ key: block.id, blockId: block.id, pageBreak: true, el: rctx.editor ? <div className="dk-break"><span>Saut de page</span></div> : null, cls: 'dk dk-pagebreak', pad: {} }]
  if (block.type === 'subprojects') return subprojectChunks(block, rctx)
  if (block.type === 'text') parts = htmlParts(block.html, rctx, !rctx.nested)
  else if (block.type === 'image') parts = block.src ? [{ key: 'img', el: <div style={{ textAlign: block.align || 'left' }}><img className="dk-img" src={block.src} alt="" style={{ width: `${block.width || 35}%` }} /></div> }] : []
  else if (block.type === 'hr') {
    const o = block.options || {}
    parts = [{ key: 'hr', el: <hr className="dk-hr" style={{ borderTop: `${Number(o.thickness) || 1}px ${o.lineStyle || 'solid'} ${o.color || '#1d1f23'}` }} /> }]
  } else if (block.type === 'section') parts = [{ key: 'cols', el: <SectionEl block={block} rctx={rctx} /> }]
  else if (block.type === 'module') parts = moduleParts(block, rctx)
  if (!parts.length && rctx.editor) parts = [{ key: 'empty', el: <div className="dm-empty">{block.type === 'module' ? tr(rctx).empty : block.type === 'image' ? 'Ajoutez une image dans « Module sélectionné ».' : tr(rctx).empty}</div> }]
  const st = block.style || {}
  const cls = blockClass(block)
  const style = blockStyle(block)
  return parts.map((p, i) => ({
    ...p,
    key: `${block.id}:${p.key}`,
    blockId: block.id,
    cls,
    style,
    pad: { top: i === 0 ? Number(st.marginTop) || 0 : 0, bottom: i === parts.length - 1 ? Number(st.marginBottom) || 0 : 0, left: Number(st.marginLeft) || 0, right: Number(st.marginRight) || 0 },
    repeat: p.repeat ? { ...p.repeat, key: `${block.id}:${p.repeat.key}~r`, blockId: block.id, cls, style, pad: { top: 0, bottom: 0, left: Number(st.marginLeft) || 0, right: Number(st.marginRight) || 0 } } : undefined,
  }))
}

export function Chunk({ c, ...rest }) {
  return (
    <div className={c.cls} style={{ ...c.style, paddingTop: c.pad?.top, paddingBottom: c.pad?.bottom, paddingLeft: c.pad?.left, paddingRight: c.pad?.right }} {...rest}>
      {c.el}
    </div>
  )
}

function SectionEl({ block, rctx }) {
  const inner = { ...rctx, nested: true }
  return (
    <div className="dk-cols" style={{ gridTemplateColumns: (block.widths || []).map((w) => `minmax(0, ${Math.max(1, Number(w) || 1)}fr)`).join(' '), columnGap: Number(block.gap) || 0, alignItems: block.valign === 'middle' ? 'center' : block.valign === 'bottom' ? 'end' : 'start' }}>
      {(block.columns || []).map((list, i) => (
        <div key={i} className="dk-col">
          {list.flatMap((b) => renderBlock(b, inner)).filter((c) => !c.pageBreak).map((c) => <Chunk key={c.key} c={c} />)}
        </div>
      ))}
    </div>
  )
}

/** Sous-projets : le contenu du bloc est répété pour chaque sous-projet du document. */
function subprojectChunks(block, rctx) {
  const out = []
  const o = block.options || {}
  const list = rctx.editor ? rctx.content.subprojects.slice(0, 1) : rctx.content.subprojects
  list.forEach((sp, i) => {
    const sub = rctx.idx.sub[sp.id] || { id: sp.id, name: sp.name, status: sp.status, projectId: rctx.doc.projectId }
    const inner = { ...rctx, env: withEnv(rctx.env, { sub }), subs: [sp], inSub: true }
    if (i > 0 && o.pageBreak) out.push({ key: `${block.id}:pb${i}`, blockId: block.id, pageBreak: true, el: null, cls: 'dk', pad: {} })
    if (o.showTitle) out.push({ key: `${block.id}:t${i}`, blockId: block.id, keepWithNext: true, cls: `dk dk-subtitle b-${block.id}`, pad: { top: Number(block.style?.marginTop) || 0 }, el: <h2>{renderTemplate(o.title || '{$sp.name}', inner.env, { html: false })}</h2> })
    for (const child of block.children || []) out.push(...renderBlock(child, inner).map((c) => ({ ...c, key: `${c.key}@${sp.id}`, repeat: c.repeat && { ...c.repeat, key: `${c.repeat.key}@${sp.id}` } })))
  })
  if (!out.length && rctx.editor) out.push({ key: `${block.id}:empty`, blockId: block.id, cls: 'dk', pad: {}, el: <div className="dm-empty">{tr(rctx).empty}</div> })
  return out
}

/** Contexte de rendu d'un document (le compte n'intervient que par son nom, e-mail et rôle). */
export function useRenderContext({ doc, template, idx, user, editor = false }) {
  const userKey = user ? `${user.name}|${user.email}|${user.role}` : ''
  return useMemo(() => {
    const u = userKey ? { name: user.name, email: user.email, role: user.role } : null
    const env = makeEnv({ doc, idx, user: u, template })
    env.subject = docTexts(doc, idx, template, u).subject
    const content = doc.content?.subprojects ? doc.content : buildContent(doc.projectId, doc.subprojectIds || [], idx)
    return { env, doc, idx, settings: idx.settings, content, subs: content.subprojects, inSub: false, editor, template }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, template, idx, userKey, editor])
}

// ---------- Papier à en-tête généré (« Par défaut ») ----------
export function AutoLetterhead({ lh, settings }) {
  const a = { accent: '#1f87e5', tagline: '', showContact: true, logoPosition: 'gauche', footer: true, ...(lh.auto || {}) }
  const m = lh.margins
  const right = a.logoPosition === 'droite'
  const logo = settings.logoUrl
  return (
    <div className="lh-auto" style={{ '--lh-accent': a.accent }}>
      <div className="lh-top" style={{ left: `${m.left}cm`, right: `${m.right}cm`, top: `${Math.max(0.8, Number(m.header) || 0)}cm`, flexDirection: right ? 'row-reverse' : 'row' }}>
        <div className="lh-brand" style={{ textAlign: right ? 'right' : 'left' }}>
          {logo ? <img src={logo} alt="" /> : <div className="lh-name">{settings.companyName}</div>}
          {a.tagline && <div className="lh-tagline">{a.tagline}</div>}
        </div>
        {a.showContact && (
          <div className="lh-contact" style={{ textAlign: right ? 'left' : 'right' }}>
            {settings.address && <div>{settings.address}</div>}
            <div>{[settings.zip, settings.city].filter(Boolean).join(' ')}</div>
            {settings.phone && <div>{settings.phone}</div>}
            {settings.email && <div>{settings.email}</div>}
            {settings.website && <div>{settings.website}</div>}
          </div>
        )}
      </div>
      <div className="lh-rule" style={{ left: `${m.left}cm`, right: `${m.right}cm`, top: `${Math.max(1, Number(m.top) - 0.6)}cm` }} />
      {a.footer && (
        <div className="lh-foot" style={{ left: `${m.left}cm`, right: `${m.right}cm`, bottom: `${Math.max(0.5, (Number(m.footer) || 0) - 0.1)}cm` }}>
          {[settings.companyName, settings.siret && `SIRET ${settings.siret}`, settings.vatNumber && `TVA ${settings.vatNumber}`, settings.iban && `IBAN ${settings.iban}`].filter(Boolean).join(' · ')}
        </div>
      )}
    </div>
  )
}

/** Fond d'une page : papier généré, image ou page de PDF (la 2e page du PDF sert aux pages suivantes). */
export function PageBackground({ lh, settings, n }) {
  const bg = lh.background
  if (!bg) return null
  if (bg.kind === 'auto') return <AutoLetterhead lh={lh} settings={settings} />
  const pages = bg.pages || []
  const src = n === 1 ? pages[0] : pages[1] || pages[0]
  return src ? <img className="pg-bg" src={src} alt="" /> : null
}

// ---------- Document paginé ----------
/**
 * Répartit les morceaux mesurés sur les pages : [[{ id, ref }]] (ref : morceau ou en-tête répété).
 * keepBreaks : l'éditeur garde la marque « Saut de page » en bas de la page qu'elle termine.
 */
export function paginate(chunks, heights, { first, other, firstBlank, keepBreaks = false }) {
  const pages = [[]]
  if (firstBlank) pages.push([])
  let used = 0
  const cap = () => (pages.length === 1 ? first : other)
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i]
    if (c.pageBreak) {
      if (keepBreaks) pages[pages.length - 1].push({ id: c.key, ref: c.key })
      if (pages[pages.length - 1].length) {
        pages.push([])
        used = 0
      }
      continue
    }
    const h = heights[c.key] || 0
    const next = chunks[i + 1]
    const need = h + (c.keepWithNext && next && !next.pageBreak ? heights[next.key] || 0 : 0)
    if (used + need > cap() + 0.5 && pages[pages.length - 1].length) {
      pages.push([])
      used = 0
      // Un tableau qui continue sur la page suivante y répète son en-tête
      if (c.repeat && !c.head) {
        pages[pages.length - 1].push({ id: `${c.repeat.key}~${pages.length}`, ref: c.repeat.key })
        used += heights[c.repeat.key] || 0
      }
    }
    pages[pages.length - 1].push({ id: c.key, ref: c.key })
    used += h
  }
  return pages
}

/** Mesure les morceaux (bloc invisible à la largeur utile de la page) puis calcule les pages. */
export function usePagination(chunks, lh, { keepBreaks = false } = {}) {
  const repeats = useMemo(() => [...new Map(chunks.filter((c) => c.repeat).map((c) => [c.repeat.key, c.repeat])).values()], [chunks])
  const byKey = useMemo(() => new Map([...chunks, ...repeats].map((c) => [c.key, c])), [chunks, repeats])
  const measureRef = useRef(null)
  const [layout, setLayout] = useState(null)
  const m = lh.margins
  const H = Number(lh.height) || 29.7
  const capacity = useMemo(() => ({ first: (H - m.top - m.bottom) * CM, other: (H - m.top - m.bottom) * CM, firstBlank: Boolean(lh.firstPageBlank), keepBreaks }), [H, m.top, m.bottom, lh.firstPageBlank, keepBreaks])

  useLayoutEffect(() => {
    let alive = true
    const calc = () => {
      const root = measureRef.current
      // Pendant l'impression le bloc de mesure est masqué : la pagination reste figée
      if (!alive || !root || window.matchMedia?.('print').matches) return
      const heights = {}
      root.querySelectorAll(':scope > [data-ck]').forEach((el) => {
        heights[el.dataset.ck] = el.getBoundingClientRect().height
      })
      const pages = paginate(chunks, heights, capacity)
      const sig = pages.map((p) => p.map((x) => x.id).join(',')).join('|')
      setLayout((prev) => (prev?.sig === sig ? prev : { sig, pages }))
    }
    calc()
    document.fonts?.ready.then(calc)
    const imgs = [...(measureRef.current?.querySelectorAll('img') || [])].filter((i) => !i.complete)
    imgs.forEach((i) => i.addEventListener('load', calc, { once: true }))
    // Le contenu mesuré peut encore changer de taille (QR code, police chargée tardivement)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => calc()) : null
    if (ro && measureRef.current) for (const el of measureRef.current.children) ro.observe(el)
    return () => {
      alive = false
      ro?.disconnect()
    }
  }, [chunks, capacity])

  const width = `${(Number(lh.width) || 21) - m.left - m.right}cm`
  const pages = layout?.pages || [chunks.filter((c) => keepBreaks || !c.pageBreak).map((c) => ({ id: c.key, ref: c.key }))]
  const measure = (
    <div className="doc-measure" ref={measureRef} style={{ width }} aria-hidden="true">
      {chunks.filter((c) => keepBreaks || !c.pageBreak).map((c) => <Chunk key={c.key} c={c} data-ck={c.key} />)}
      {repeats.map((r) => <Chunk key={r.key} c={r} data-ck={r.key} />)}
    </div>
  )
  return { pages, byKey, measure }
}

export function Page({ n, total, lh, template, env, showBackground, children, className = '' }) {
  const m = lh.margins
  const W = Number(lh.width) || 21
  const H = Number(lh.height) || 29.7
  const pageEnv = withEnv(env, { page: { number: n, total } })
  const header = template.headerText ? sanitizeHtml(renderTemplate(template.headerText, pageEnv)) : ''
  const footer = template.footerText ? sanitizeHtml(renderTemplate(template.footerText, pageEnv)) : ''
  return (
    <div className={`pg ${className}`} style={{ width: `${W}cm`, height: `${H}cm` }} data-page={n}>
      {showBackground && <PageBackground lh={lh} settings={env.settings} n={n} />}
      {header && <div className="pg-header doc-rich" style={{ top: `${Number(m.header) || 0.4}cm`, left: `${m.left}cm`, right: `${m.right}cm` }} dangerouslySetInnerHTML={{ __html: header }} />}
      <div className="pg-body" style={{ top: `${m.top}cm`, left: `${m.left}cm`, right: `${m.right}cm`, height: `${Math.max(1, H - m.top - m.bottom)}cm` }}>
        {children}
      </div>
      {footer && <div className="pg-footer doc-rich" style={{ bottom: `${Number(m.footer) || 0.4}cm`, left: `${m.left}cm`, right: `${Number(m.right) + (lh.pageNumbers ? 2.6 : 0)}cm` }} dangerouslySetInnerHTML={{ __html: footer }} />}
      {lh.pageNumbers && <div className="pg-num" style={{ bottom: `${Math.max(0.4, Number(m.footer) || 0)}cm`, right: `${m.right}cm` }}>{(TXT[env.language] || TXT.fr).page(n, total)}</div>}
    </div>
  )
}

/** Document réparti en vraies pages (aperçu, impression, PDF). */
export function PagedDocument({ doc, template, letterhead, idx, user, showBackground = true, editor = false, onPages }) {
  const rctx = useRenderContext({ doc, template, idx, user, editor })
  const chunks = useMemo(() => template.blocks.flatMap((b) => renderBlock(b, rctx)), [template.blocks, rctx])
  const { pages, byKey, measure } = usePagination(chunks, letterhead)
  useEffect(() => {
    onPages?.(pages.length)
  }, [pages.length, onPages])
  return (
    <div className={`doc-render tpl-${template.id}`} style={themeStyle(template)}>
      <DocStyles template={template} />
      {measure}
      <div className="doc-pages">
        {pages.map((pg, i) => (
          <Page key={i} n={i + 1} total={pages.length} lh={letterhead} template={template} env={rctx.env} showBackground={showBackground}>
            {pg.map((x) => byKey.get(x.ref) && <Chunk key={x.id} c={byKey.get(x.ref)} />)}
          </Page>
        ))}
      </div>
    </div>
  )
}

const ZOOMS = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 2]

/**
 * Visionneuse façon lecteur PDF : pages séparées sur fond sombre, page courante, zoom, ajuster à la largeur.
 * pageWidth : largeur d'une page en cm (pour « Ajuster »).
 */
export function DocViewer({ pages = 1, pageWidth = 21, actions, children, className = '', initialFit = false, fitMax = 1 }) {
  const area = useRef(null)
  const [zoom, setZoom] = useState(1)
  const [current, setCurrent] = useState(1)
  const fitZoom = useCallback(() => {
    const w = area.current?.clientWidth || 0
    return w ? Math.max(0.3, Math.min(2, Math.floor(((w - 56) / (pageWidth * CM)) * 100) / 100)) : 1
  }, [pageWidth])
  useEffect(() => {
    if (initialFit) setZoom(Math.min(fitMax, fitZoom()))
  }, [initialFit, fitZoom, fitMax])
  useEffect(() => {
    const el = area.current
    if (!el) return undefined
    const onScroll = () => {
      const top = el.getBoundingClientRect().top + el.clientHeight * 0.3
      let n = 1
      el.querySelectorAll('.doc-pages > .pg').forEach((p, i) => {
        if (p.getBoundingClientRect().top <= top) n = i + 1
      })
      setCurrent(n)
    }
    onScroll()
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [pages, zoom])
  const step = (dir) => setZoom((z) => (dir > 0 ? ZOOMS.find((x) => x > z + 0.001) || z : [...ZOOMS].reverse().find((x) => x < z - 0.001) || z))
  const goTo = (n) => area.current?.querySelectorAll('.doc-pages > .pg')[n - 1]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return (
    <div className={`pdfv ${className}`}>
      <div className="pdfv-bar no-print">
        <div className="pdfv-nav">
          <button type="button" onClick={() => goTo(Math.max(1, current - 1))} disabled={current <= 1} aria-label="Page précédente"><Icon name="keyboard_arrow_up" size={20} /></button>
          <button type="button" onClick={() => goTo(Math.min(pages, current + 1))} disabled={current >= pages} aria-label="Page suivante"><Icon name="keyboard_arrow_down" size={20} /></button>
          <span className="pdfv-count">{current} / {pages}</span>
        </div>
        <span className="pdfv-sep" />
        <button type="button" onClick={() => step(-1)} aria-label="Zoom arrière"><Icon name="remove" size={18} /></button>
        <button type="button" className="pdfv-zoom" onClick={() => setZoom(1)} title="Taille réelle">{Math.round(zoom * 100)} %</button>
        <button type="button" onClick={() => step(1)} aria-label="Zoom avant"><Icon name="add" size={18} /></button>
        <button type="button" onClick={() => setZoom(fitZoom())} title="Ajuster à la largeur" aria-label="Ajuster à la largeur"><Icon name="fit_screen" size={19} /></button>
        <span className="spacer" />
        {actions}
      </div>
      <div className="pdfv-area" ref={area} style={{ '--z': zoom }}>
        {children}
      </div>
    </div>
  )
}

export { MODULES }
