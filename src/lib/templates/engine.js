// Moteur des modèles de documents : variables et conditions au format Rentman (Smarty).
//   {$f.number}   {$p.usageperiod_start|formatDate}   {$DATE,Y}   {$f.price_invat|formatPrice}
//   {iff $f.version > 1} v{$f.version}{elseif …}…{else}…{/iff}   (« if » est accepté aussi)
//   {round(…)}   {sumprice(a,b)}   {multiplyprice(a,b)}   {math equation="…"}   {assign var="x" value=…}

// ---------- Valeurs typées ----------
// Les feuilles du contexte portent leur type pour être formatées : prix, date, html…
export const typed = (t, v) => ({ $t: t, v })
const isTyped = (x) => x != null && typeof x === 'object' && '$t' in x
export const rawOf = (x) => (isTyped(x) ? x.v : x)

export const LOCALES = {
  France: 'fr-FR', Belgique: 'fr-BE', Luxembourg: 'fr-LU', Suisse: 'fr-CH', Canada: 'fr-CA', Monaco: 'fr-MC',
  'Pays-Bas': 'nl-NL', Allemagne: 'de-DE', 'Royaume-Uni': 'en-GB', 'États-Unis': 'en-US', Espagne: 'es-ES', Italie: 'it-IT',
}
export const fmtOptions = ({ country = 'France', currency = 'EUR', language = 'fr' } = {}) => ({
  locale: LOCALES[country] || 'fr-FR', currency, yes: language === 'en' ? 'Yes' : 'Oui', no: language === 'en' ? 'No' : 'Non',
})

const ENT = { '&gt;': '>', '&lt;': '<', '&amp;': '&', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ', '&#160;': ' ' }
const decode = (s) => s.replace(/&(gt|lt|amp|quot|#39|apos|nbsp|#160);/g, (m) => ENT[m])
export const escapeHtml = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export const toDate = (v) => {
  if (v == null || v === '') return null
  if (v instanceof Date) return v
  if (typeof v === 'number') return new Date(v)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  if (m) return new Date(+m[1], +m[2] - 1, +m[3])
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Montant lu dans un prix déjà formaté (« 1 000,00 € », « € 1.000,00 »). */
export const removePrice = (v) => {
  if (typeof v === 'number') return v
  let s = String(v ?? '').replace(/[^\d,.-]/g, '')
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.')
  else s = s.replace(/,/g, '')
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

export const formatPrice = (v, f) => new Intl.NumberFormat(f.locale, { style: 'currency', currency: f.currency || 'EUR' }).format(Number(v) || 0)
export const formatDate = (v, f) => {
  const d = toDate(v)
  return d ? new Intl.DateTimeFormat(f.locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d) : ''
}
export const formatTime = (v, f) => {
  const d = toDate(v)
  return d ? new Intl.DateTimeFormat(f.locale, { hour: '2-digit', minute: '2-digit' }).format(d) : ''
}
export const formatDateTime = (v, f) => (toDate(v) ? `${formatDate(v, f)} ${formatTime(v, f)}` : '')
const formatNumber = (v, f, digits = 2) => new Intl.NumberFormat(f.locale, { maximumFractionDigits: digits }).format(Number(v) || 0)

/** Texte affiché d'une valeur (typée ou non). */
export function display(x, f) {
  if (!isTyped(x)) return x == null || typeof x === 'object' ? '' : String(x)
  const v = x.v
  if (v == null || v === '') return ''
  switch (x.$t) {
    case 'price': return formatPrice(v, f)
    case 'number': return formatNumber(v, f)
    case 'pct': return `${formatNumber(v, f)} %`
    case 'date': return formatDate(v, f)
    case 'datetime': return formatDateTime(v, f)
    case 'bool': return v ? f.yes : f.no
    default: return String(v)
  }
}

/** La valeur est-elle « vide » (masquer les valeurs nulles, modules vides…) ? */
export const isEmptyValue = (x) => {
  const v = rawOf(x)
  return v == null || v === '' || v === 0 || v === false || (Array.isArray(v) && !v.length)
}

// ---------- Dates façon PHP ({$DATE,Y}) et strftime (|date_format:"%d/%m") ----------
const pad2 = (n) => String(n).padStart(2, '0')
function phpDate(d, fmt, f) {
  const name = (opt) => new Intl.DateTimeFormat(f.locale, opt).format(d)
  const map = {
    d: () => pad2(d.getDate()), j: () => String(d.getDate()), D: () => name({ weekday: 'short' }), l: () => name({ weekday: 'long' }),
    N: () => String(((d.getDay() + 6) % 7) + 1), w: () => String(d.getDay()), m: () => pad2(d.getMonth() + 1), n: () => String(d.getMonth() + 1),
    F: () => name({ month: 'long' }), M: () => name({ month: 'short' }), Y: () => String(d.getFullYear()), y: () => String(d.getFullYear()).slice(2),
    H: () => pad2(d.getHours()), G: () => String(d.getHours()), h: () => pad2(d.getHours() % 12 || 12), g: () => String(d.getHours() % 12 || 12),
    i: () => pad2(d.getMinutes()), s: () => pad2(d.getSeconds()), a: () => (d.getHours() < 12 ? 'am' : 'pm'), A: () => (d.getHours() < 12 ? 'AM' : 'PM'),
    U: () => String(Math.floor(d.getTime() / 1000)),
  }
  let out = ''
  for (let i = 0; i < fmt.length; i++) {
    const c = fmt[i]
    if (c === '\\') out += fmt[++i] ?? ''
    else out += map[c] ? map[c]() : c
  }
  return out
}
function strftime(d, fmt, f) {
  const name = (opt) => new Intl.DateTimeFormat(f.locale, opt).format(d)
  const map = {
    d: pad2(d.getDate()), e: String(d.getDate()), m: pad2(d.getMonth() + 1), Y: String(d.getFullYear()), y: String(d.getFullYear()).slice(2),
    H: pad2(d.getHours()), M: pad2(d.getMinutes()), S: pad2(d.getSeconds()), A: name({ weekday: 'long' }), a: name({ weekday: 'short' }),
    B: name({ month: 'long' }), b: name({ month: 'short' }), '%': '%',
  }
  return fmt.replace(/%([a-zA-Z%])/g, (m, c) => map[c] ?? m)
}

// ---------- Modificateurs ----------
const str = (x, f) => (isTyped(x) ? display(x, f) : x == null ? '' : String(x))
const num = (x) => removePrice(rawOf(x))
const MODS = {
  formatPrice: (x, f) => formatPrice(num(x), f),
  formatDate: (x, f) => formatDate(rawOf(x), f),
  formatDateTime: (x, f) => formatDateTime(rawOf(x), f),
  formatTime: (x, f) => formatTime(rawOf(x), f),
  formatNumber: (x, f, digits = 2) => formatNumber(num(x), f, Number(digits)),
  number_format: (x, f, digits = 2) => new Intl.NumberFormat(f.locale, { minimumFractionDigits: Number(digits), maximumFractionDigits: Number(digits) }).format(num(x)),
  round: (x, f, digits = 0) => {
    const p = 10 ** Number(digits)
    return Math.round(num(x) * p) / p
  },
  abs: (x) => Math.abs(num(x)),
  ucfirst: (x, f) => str(x, f).charAt(0).toUpperCase() + str(x, f).slice(1),
  ucwords: (x, f) => str(x, f).replace(/(^|\s)(\p{L})/gu, (m, a, b) => a + b.toUpperCase()),
  capitalize: (x, f) => MODS.ucwords(x, f),
  upper: (x, f) => str(x, f).toUpperCase(),
  lower: (x, f) => str(x, f).toLowerCase(),
  strtoupper: (x, f) => str(x, f).toUpperCase(),
  strtolower: (x, f) => str(x, f).toLowerCase(),
  trim: (x, f) => str(x, f).trim(),
  default: (x, f, d = '') => (isEmptyValue(x) ? d : x),
  nl2br: (x, f) => typed('html', escapeHtml(str(x, f)).replace(/\r?\n/g, '<br>')),
  strip_tags: (x, f) => str(x, f).replace(/<[^>]*>/g, ''),
  substr: (x, f, start = 0, len) => {
    const s = str(x, f)
    const a = Number(start) < 0 ? Math.max(0, s.length + Number(start)) : Number(start)
    return len == null ? s.slice(a) : s.substr(a, Number(len))
  },
  str_pad: (x, f, len = 0, ch = ' ', type = 'STR_PAD_RIGHT') => {
    const s = str(x, f)
    return type === 'STR_PAD_LEFT' ? s.padStart(Number(len), ch || ' ') : type === 'STR_PAD_BOTH' ? s.padStart(Math.floor((Number(len) + s.length) / 2), ch || ' ').padEnd(Number(len), ch || ' ') : s.padEnd(Number(len), ch || ' ')
  },
  replace: (x, f, a = '', b = '') => str(x, f).split(String(a)).join(String(b)),
  truncate: (x, f, n = 80, etc = '…') => {
    const s = str(x, f)
    return s.length > Number(n) ? s.slice(0, Math.max(0, Number(n) - String(etc).length)) + etc : s
  },
  date_format: (x, f, fmt = '%d/%m/%Y') => {
    const d = toDate(rawOf(x))
    return d ? strftime(d, String(fmt), f) : ''
  },
  urlencode: (x, f) => encodeURIComponent(str(x, f)),
  escape: (x, f) => str(x, f),
  count: (x) => (Array.isArray(rawOf(x)) ? rawOf(x).length : 0),
}
export const MODIFIER_NAMES = Object.keys(MODS)

// ---------- Découpage du texte en balises ----------
const TAG_START = /[$a-zA-Z/]/
const KEYWORD = /^(iff|if|elseif|else|\/iff|\/if|assign|math)\b/

function matchBrace(s, start) {
  let depth = 0
  for (let i = start; i < s.length && i - start < 2000; i++) {
    if (s[i] === '{') depth++
    else if (s[i] === '}' && --depth === 0) return i
  }
  return -1
}

const isTagBody = (raw) => {
  const b = decode(raw).trim()
  return b.startsWith('$') || KEYWORD.test(b) || /^[a-zA-Z_]\w*\s*\(/.test(b)
}

function scan(src) {
  const out = []
  let text = ''
  let i = 0
  while (i < src.length) {
    if (src[i] === '{' && TAG_START.test(src[i + 1] || '')) {
      const end = matchBrace(src, i)
      if (end > 0 && isTagBody(src.slice(i + 1, end))) {
        if (text) out.push({ t: 'text', v: text })
        text = ''
        out.push({ t: 'tag', v: decode(src.slice(i + 1, end)).trim() })
        i = end + 1
        continue
      }
    }
    text += src[i++]
  }
  if (text) out.push({ t: 'text', v: text })
  return out
}

function parseTree(tokens) {
  const root = { children: [] }
  const stack = [root]
  let cur = root.children
  const branchOf = (node) => node.branches[node.branches.length - 1].children
  for (const tk of tokens) {
    if (tk.t === 'text') {
      cur.push(tk)
      continue
    }
    const b = tk.v
    let m
    if ((m = /^(?:iff|if)\s+([\s\S]+)$/.exec(b))) {
      const node = { t: 'if', branches: [{ cond: m[1], children: [] }] }
      cur.push(node)
      stack.push(node)
      cur = branchOf(node)
    } else if ((m = /^elseif\s+([\s\S]+)$/.exec(b)) && stack.length > 1) {
      stack[stack.length - 1].branches.push({ cond: m[1], children: [] })
      cur = branchOf(stack[stack.length - 1])
    } else if (b === 'else' && stack.length > 1) {
      stack[stack.length - 1].branches.push({ cond: null, children: [] })
      cur = branchOf(stack[stack.length - 1])
    } else if (/^\/(iff|if)$/.test(b)) {
      if (stack.length > 1) stack.pop()
      const top = stack[stack.length - 1]
      cur = top === root ? root.children : branchOf(top)
    } else cur.push({ t: 'tag', v: b })
  }
  return root.children
}

const cache = new Map()
function compile(src) {
  let tree = cache.get(src)
  if (!tree) {
    tree = parseTree(scan(src))
    if (cache.size > 500) cache.clear()
    cache.set(src, tree)
  }
  return tree
}

// ---------- Expressions (conditions, fonctions, math) ----------
function splitArgs(s, sep) {
  const out = []
  let cur = ''
  let quote = null
  let depth = 0
  for (const c of s) {
    if (quote) {
      if (c === quote) quote = null
      cur += c
    } else if (c === '"' || c === "'") {
      quote = c
      cur += c
    } else if (c === '(' || c === '{') {
      depth++
      cur += c
    } else if (c === ')' || c === '}') {
      depth--
      cur += c
    } else if (c === sep && depth === 0) {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out
}
const unquote = (a) => {
  const s = a.trim()
  return /^(["']).*\1$/s.test(s) ? s.slice(1, -1) : s
}

function tokenize(src) {
  const toks = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) {
      i++
      continue
    }
    const rest = src.slice(i)
    let m
    if ((m = /^(===|!==|==|!=|>=|<=|&&|\|\||[-+*/%()<>!,])/.exec(rest))) {
      toks.push({ k: 'op', v: m[1] })
      i += m[1].length
    } else if ((m = /^\d+(\.\d+)?/.exec(rest))) {
      toks.push({ k: 'num', v: parseFloat(m[0]) })
      i += m[0].length
    } else if (c === '"' || c === "'") {
      const end = src.indexOf(c, i + 1)
      const j = end < 0 ? src.length : end
      toks.push({ k: 'str', v: src.slice(i + 1, j) })
      i = j + 1
    } else if ((m = /^\$[\w.]+(,[^\s|)]+)?(\|[\w]+(:("[^"]*"|'[^']*'|[^\s:|)]+))*)*/.exec(rest))) {
      toks.push({ k: 'var', v: m[0] })
      i += m[0].length
    } else if ((m = /^[a-zA-Z_]\w*/.exec(rest))) {
      toks.push({ k: 'id', v: m[0] })
      i += m[0].length
    } else i++
  }
  return toks
}

const FUNCS = {
  round: (x, d = 0) => {
    const p = 10 ** Number(d)
    return Math.round(removePrice(x) * p) / p
  },
  floor: (x) => Math.floor(removePrice(x)),
  ceil: (x) => Math.ceil(removePrice(x)),
  abs: (x) => Math.abs(removePrice(x)),
  min: (...a) => Math.min(...a.map(removePrice)),
  max: (...a) => Math.max(...a.map(removePrice)),
  sumprice: (...a) => a.reduce((s, x) => s + removePrice(x), 0),
  multiplyprice: (...a) => a.reduce((s, x) => s * removePrice(x), 1),
  removePrice: (x) => removePrice(x),
  toDate: (x, fmt) => {
    const d = toDate(x)
    if (!d) return 0
    return fmt === 'U' ? Math.floor(d.getTime() / 1000) : d.toISOString()
  },
  count: (x) => (Array.isArray(x) ? x.length : 0),
  strlen: (x) => String(x ?? '').length,
}

const numeric = (v) => typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)))
export const truthy = (v) => !(v == null || v === false || v === '' || v === 0 || v === '0' || (Array.isArray(v) && !v.length))
function compare(op, a, b) {
  const bothNum = numeric(a) && numeric(b)
  const x = bothNum ? Number(a) : String(a ?? '')
  const y = bothNum ? Number(b) : String(b ?? '')
  switch (op) {
    case '==': case '===': case 'eq': return x === y
    case '!=': case '!==': case 'ne': case 'neq': return x !== y
    case '>': case 'gt': return x > y
    case '<': case 'lt': return x < y
    case '>=': case 'gte': case 'ge': return x >= y
    case '<=': case 'lte': case 'le': return x <= y
    default: return false
  }
}
export const compareValues = (op, a, b) => compare(op, a, b)
const CMP = new Set(['==', '===', '!=', '!==', '>', '<', '>=', '<=', 'eq', 'ne', 'neq', 'gt', 'lt', 'gte', 'ge', 'lte', 'le'])

const PURE_VAR = /^\$[\w.]+(,[^\s|]+)?(\|[\s\S]*)?$/
const MATH = /^math\s+equation\s*=\s*(["'])([\s\S]*)\1/

function tagValue(inner, env) {
  const m = MATH.exec(inner)
  if (m) return evaluate(m[2], env)
  if (PURE_VAR.test(inner) && !/\s[-+*/%<>=!&|]+\s/.test(inner)) return rawOf(evalVar(inner, env))
  return evaluate(inner, env)
}

function evaluate(src, env) {
  // Les balises imbriquées ({$x}, {round(…)}, {math …}) sont remplacées par leur valeur, des plus internes aux plus externes
  let flat = src
  for (let k = 0, prev = null; k < 8 && flat !== prev; k++) {
    prev = flat
    flat = flat.replace(/\{[^{}]*\}/g, (m) => {
      const inner = m.slice(1, -1).trim()
      if (!isTagBody(inner)) return m
      const v = tagValue(inner, env)
      return numeric(v) ? String(Number(v)) : JSON.stringify(v ?? '')
    })
  }
  const toks = tokenize(flat)
  let p = 0
  const peek = () => toks[p]
  const isOp = (...ops) => peek() && ((peek().k === 'op' && ops.includes(peek().v)) || (peek().k === 'id' && ops.includes(peek().v)))
  const primary = () => {
    const t = toks[p++]
    if (!t) return ''
    if (t.k === 'num' || t.k === 'str') return t.v
    if (t.k === 'var') return rawOf(evalVar(t.v, env))
    if (t.k === 'op' && t.v === '(') {
      const v = or()
      if (isOp(')')) p++
      return v
    }
    if (t.k === 'id') {
      if (t.v === 'true') return true
      if (t.v === 'false') return false
      if (t.v === 'null') return null
      if (isOp('(')) {
        p++
        const args = []
        while (peek() && !isOp(')')) {
          args.push(or())
          if (isOp(',')) p++
        }
        p++
        const fn = FUNCS[t.v]
        return fn ? fn(...args) : ''
      }
      return t.v
    }
    return ''
  }
  const unary = () => {
    if (isOp('!', 'not')) {
      p++
      return !truthy(unary())
    }
    if (isOp('-')) {
      p++
      return -removePrice(unary())
    }
    return primary()
  }
  const mul = () => {
    let v = unary()
    while (isOp('*', '/', '%')) {
      const op = toks[p++].v
      const r = removePrice(unary())
      const l = removePrice(v)
      v = op === '*' ? l * r : op === '/' ? (r ? l / r : 0) : r ? l % r : 0
    }
    return v
  }
  const add = () => {
    let v = mul()
    while (isOp('+', '-')) {
      const op = toks[p++].v
      const r = mul()
      v = op === '+' ? removePrice(v) + removePrice(r) : removePrice(v) - removePrice(r)
    }
    return v
  }
  const cmp = () => {
    const v = add()
    if (peek() && CMP.has(peek().v)) {
      const op = toks[p++].v
      return compare(op, v, add())
    }
    return v
  }
  const and = () => {
    let v = cmp()
    while (isOp('&&', 'and')) {
      p++
      const r = cmp()
      v = truthy(v) && truthy(r)
    }
    return v
  }
  const or = () => {
    let v = and()
    while (isOp('||', 'or')) {
      p++
      const r = and()
      v = truthy(v) || truthy(r)
    }
    return v
  }
  try {
    return or()
  } catch {
    return ''
  }
}

// ---------- Variables ----------
/** « $f.number,Y|substr:0:4|upper » → valeur (typée) après formats et modificateurs. */
function evalVar(expr, env) {
  const [head, ...mods] = splitArgs(expr.trim().slice(1), '|')
  const [rawPath, fmt] = head.split(',')
  const path = rawPath.trim()
  let v = env.vars && path in env.vars ? env.vars[path] : env.resolve(path)
  if (fmt) {
    const d = toDate(rawOf(v))
    v = d ? phpDate(d, fmt.trim(), env.fmt) : ''
  }
  for (const m of mods) {
    const [name, ...args] = splitArgs(m, ':')
    const fn = MODS[name.trim()]
    if (fn) v = fn(v, env.fmt, ...args.map(unquote))
  }
  return v
}

function renderTag(body, env, html) {
  let m
  if ((m = /^assign\s+([\s\S]*)$/.exec(body))) {
    const name = /var\s*=\s*["']?(\w+)/.exec(m[1])?.[1]
    const value = /value\s*=\s*([\s\S]*)$/.exec(m[1])?.[1]?.trim() ?? ''
    if (name) {
      env.vars[name] = /^".*"$/s.test(value)
        ? renderTemplate(value.slice(1, -1).replace(/\$(\w+)/g, (x, n) => (n in env.vars ? display(env.vars[n], env.fmt) : x)), env, { html: false })
        : /^'.*'$/s.test(value)
          ? value.slice(1, -1)
          : /^\$[\w.,]+(\|.*)?$/.test(value)
            ? evalVar(value, env)
            : evaluate(value, env)
    }
    return ''
  }
  let v
  if ((m = MATH.exec(body))) v = evaluate(m[2], env)
  else if (PURE_VAR.test(body) && !/\s[-+*/%<>=!&|]+\s/.test(body)) v = evalVar(body, env)
  else v = evaluate(body, env)
  if (typeof v === 'number') v = Math.round(v * 1e6) / 1e6
  // Les fonctions de prix de Rentman renvoient un prix formaté
  if (/^(sumprice|multiplyprice)\s*\(/.test(body)) v = typed('price', removePrice(v))
  if (isTyped(v) && v.$t === 'html') return html ? String(v.v ?? '') : String(v.v ?? '').replace(/<[^>]*>/g, '')
  const s = isTyped(v) ? display(v, env.fmt) : typeof v === 'boolean' ? (v ? '1' : '') : v == null ? '' : String(v)
  return html ? escapeHtml(s) : s
}

function run(nodes, env, html, out) {
  for (const n of nodes) {
    if (n.t === 'text') out.push(n.v)
    else if (n.t === 'if') {
      const br = n.branches.find((b) => b.cond == null || truthy(evaluate(b.cond, env)))
      if (br) run(br.children, env, html, out)
    } else out.push(renderTag(n.v, env, html))
  }
  return out
}

/**
 * Remplace variables et conditions dans un texte.
 * env : { resolve(path) → valeur typée, fmt: fmtOptions(), vars: {} } — html : échappe les valeurs insérées.
 */
export function renderTemplate(src, env, { html = true } = {}) {
  if (!src) return ''
  env.vars ||= {}
  return run(compile(String(src)), env, html, []).join('')
}

/** Valeur brute d'une condition seule (mise en forme conditionnelle). */
export const evalCondition = (expr, env) => truthy(evaluate(expr, { vars: {}, ...env }))
