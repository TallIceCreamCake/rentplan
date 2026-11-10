// Nettoyage du HTML des modèles (texte riche, en-têtes, pieds de page) : liste blanche de balises
// et d'attributs, pour qu'un modèle ne puisse pas injecter de script dans l'application.

const ALLOWED = new Set(
  'a b i em strong u s strike del ins sub sup small big span div p br hr h1 h2 h3 h4 h5 h6 ul ol li table thead tbody tfoot tr td th colgroup col caption blockquote pre code img font center figure figcaption mark'.split(' '),
)
// Retirées avec tout leur contenu
const DROP = new Set('script style iframe object embed form input button textarea select option noscript template link meta base svg math frame frameset applet audio video source track canvas title head'.split(' '))
const ATTRS = new Set('style class href src alt title width height colspan rowspan align valign color size face target rel border cellpadding cellspacing'.split(' '))

const safeUrl = (u, img) => {
  // eslint-disable-next-line no-control-regex
  const v = String(u).trim().replace(/[\u0000-\u001f\u007f\s]+/g, '').toLowerCase()
  if (/^(https?:|mailto:|tel:|#)/.test(v)) return true
  if (img && /^data:image\/(png|jpe?g|gif|webp);base64,/.test(v)) return true
  if (/^\/\//.test(v)) return false
  return !/^[a-z][a-z0-9+.-]*:/.test(v) // chemin relatif
}

/** Déclarations CSS en ligne sans chargement externe ni sortie du document. */
export const safeStyle = (s) =>
  String(s || '')
    .split(';')
    .map((d) => d.trim())
    .filter((d) => d && /^[a-z-]+\s*:/i.test(d) && !/expression\s*\(|javascript:|url\s*\(|@import|behavior\s*:|-moz-binding|position\s*:\s*(fixed|sticky)/i.test(d))
    .join('; ')

function clean(node) {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === 8) {
      child.remove()
      continue
    }
    if (child.nodeType !== 1) continue
    const tag = child.tagName.toLowerCase()
    if (DROP.has(tag)) {
      child.remove()
      continue
    }
    clean(child)
    if (!ALLOWED.has(tag)) {
      child.replaceWith(...child.childNodes)
      continue
    }
    for (const a of [...child.attributes]) {
      const n = a.name.toLowerCase()
      if (!ATTRS.has(n)) child.removeAttribute(a.name)
      else if (n === 'href' && !safeUrl(a.value, false)) child.removeAttribute(a.name)
      else if (n === 'src' && !safeUrl(a.value, true)) child.removeAttribute(a.name)
      else if (n === 'style') {
        const st = safeStyle(a.value)
        if (st) child.setAttribute('style', st)
        else child.removeAttribute('style')
      }
    }
    if (tag === 'a') {
      child.setAttribute('rel', 'noopener noreferrer')
      if (child.getAttribute('target') && child.getAttribute('target') !== '_blank') child.removeAttribute('target')
    }
  }
}

const cache = new Map()
export function sanitizeHtml(html) {
  if (!html) return ''
  const key = String(html)
  if (cache.has(key)) return cache.get(key)
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${key}</body>`, 'text/html')
  clean(doc.body)
  const out = doc.body.innerHTML
  if (cache.size > 800) cache.clear()
  cache.set(key, out)
  return out
}

/** Fragments de premier niveau (pour répartir un long texte sur plusieurs pages). */
export function splitTopLevel(html) {
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${html}</body>`, 'text/html')
  const parts = []
  let inline = ''
  for (const n of doc.body.childNodes) {
    const block = n.nodeType === 1 && /^(p|div|h[1-6]|ul|ol|table|blockquote|pre|hr|figure|center)$/i.test(n.tagName)
    if (block) {
      if (inline.trim()) parts.push(`<p>${inline}</p>`)
      inline = ''
      parts.push(n.outerHTML)
    } else inline += n.nodeType === 1 ? n.outerHTML : (n.textContent || '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  }
  if (inline.trim()) parts.push(inline.includes('<') ? `<div>${inline}</div>` : `<p>${inline}</p>`)
  return parts
}

/** Déclarations « prop: valeur; … » → objet style React (CSS personnalisé des colonnes). */
export function styleObject(css) {
  const out = {}
  for (const d of safeStyle(css).split(';')) {
    const i = d.indexOf(':')
    if (i < 0) continue
    const prop = d.slice(0, i).trim().toLowerCase()
    const value = d.slice(i + 1).trim()
    if (!prop || !value) continue
    out[prop.startsWith('--') ? prop : prop.replace(/-([a-z])/g, (m, c) => c.toUpperCase())] = value
  }
  return out
}

/** CSS personnalisé d'un modèle ou d'un module, limité à son conteneur (imbrication CSS). */
export function scopedCss(scope, css) {
  const src = String(css || '').replace(/<\/?style/gi, '').replace(/@import[^;]*;?/gi, '').replace(/url\s*\([^)]*\)/gi, 'none')
  return src.trim() ? `${scope} { ${src} }` : ''
}
