// Arbre des blocs d'un modèle : liste principale, colonnes des sections, contenu des sous-projets.

const listsOf = (b) => (b.type === 'section' ? b.columns || [] : b.type === 'subprojects' ? [b.children || []] : null)
const withLists = (b, lists) => (b.type === 'section' ? { ...b, columns: lists } : { ...b, children: lists[0] || [] })

export function findBlock(blocks, id) {
  for (const b of blocks || []) {
    if (b.id === id) return b
    for (const l of listsOf(b) || []) {
      const hit = findBlock(l, id)
      if (hit) return hit
    }
  }
  return null
}

/** Emplacement d'un bloc : { parent, col, index } (parent null = liste principale). */
export function locate(blocks, id, parent = null, col = 0) {
  for (let i = 0; i < (blocks || []).length; i++) {
    const b = blocks[i]
    if (b.id === id) return { parent, col, index: i }
    const lists = listsOf(b) || []
    for (let c = 0; c < lists.length; c++) {
      const hit = locate(lists[c], id, b.id, c)
      if (hit) return hit
    }
  }
  return null
}

export function updateIn(blocks, id, fn) {
  return blocks.map((b) => {
    if (b.id === id) return typeof fn === 'function' ? fn(b) : { ...b, ...fn }
    const lists = listsOf(b)
    return lists ? withLists(b, lists.map((l) => updateIn(l, id, fn))) : b
  })
}

export function removeIn(blocks, id) {
  let removed = null
  const rec = (list) =>
    list
      .filter((b) => {
        if (b.id !== id) return true
        removed = b
        return false
      })
      .map((b) => {
        const lists = listsOf(b)
        return lists ? withLists(b, lists.map(rec)) : b
      })
  return [rec(blocks), removed]
}

export function insertIn(blocks, { parent = null, col = 0, index }, block) {
  if (!parent) {
    const out = [...blocks]
    out.splice(index ?? out.length, 0, block)
    return out
  }
  return updateIn(blocks, parent, (p) => {
    const lists = (listsOf(p) || []).map((l) => [...l])
    while (lists.length <= col) lists.push([])
    lists[col].splice(index ?? lists[col].length, 0, block)
    return withLists(p, lists)
  })
}

/** Le bloc `id` contient-il `inner` (pour ne pas déposer une section dans elle-même) ? */
export const contains = (block, inner) => Boolean(block && (block.id === inner || (listsOf(block) || []).some((l) => l.some((b) => contains(b, inner)))))

export function moveIn(blocks, id, target) {
  const from = locate(blocks, id)
  if (!from) return blocks
  const moving = findBlock(blocks, id)
  if (target.parent && contains(moving, target.parent)) return blocks
  const [rest] = removeIn(blocks, id)
  let index = target.index
  if (from.parent === target.parent && from.col === (target.col || 0) && from.index < index) index -= 1
  return insertIn(rest, { ...target, index }, moving)
}

/** Nombre de colonnes d'une section modifié : les blocs des colonnes retirées passent dans la dernière. */
export function resizeSection(b, cols) {
  const columns = (b.columns || []).map((l) => [...l])
  while (columns.length < cols) columns.push([])
  while (columns.length > cols) {
    const last = columns.pop()
    columns[columns.length - 1].push(...last)
  }
  const widths = Array.from({ length: cols }, () => Math.round(1000 / cols) / 10)
  return { ...b, cols, columns, widths }
}
