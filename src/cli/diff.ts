/** Unified diff of two texts, 3 lines of context. Line-based LCS after
 *  trimming the common head and tail; returns '' when the texts are equal. */
export function unifiedDiff(label: string, before: string, after: string, context = 3): string {
  if (before === after) return ''
  const a = before === '' ? [] : before.split('\n')
  const b = after === '' ? [] : after.split('\n')

  let head = 0
  while (head < a.length && head < b.length && a[head] === b[head]) head++
  let tail = 0
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++
  const am = a.slice(head, a.length - tail)
  const bm = b.slice(head, b.length - tail)

  // lcs[i][j] = LCS length of am[i..] and bm[j..]
  const lcs: Uint32Array[] = Array.from({ length: am.length + 1 }, () => new Uint32Array(bm.length + 1))
  for (let i = am.length - 1; i >= 0; i--) {
    for (let j = bm.length - 1; j >= 0; j--) {
      lcs[i][j] = am[i] === bm[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  type Op = { tag: ' ' | '-' | '+'; text: string }
  const ops: Op[] = a.slice(0, head).map((text) => ({ tag: ' ', text }))
  let i = 0
  let j = 0
  while (i < am.length || j < bm.length) {
    if (i < am.length && j < bm.length && am[i] === bm[j]) {
      ops.push({ tag: ' ', text: am[i] })
      i++
      j++
    } else if (j < bm.length && (i === am.length || lcs[i][j + 1] >= lcs[i + 1][j])) {
      ops.push({ tag: '+', text: bm[j++] })
    } else {
      ops.push({ tag: '-', text: am[i++] })
    }
  }
  for (const text of a.slice(a.length - tail)) ops.push({ tag: ' ', text })

  const out = [`--- a/${label}`, `+++ b/${label}`]
  const changed = ops.flatMap((op, idx) => (op.tag === ' ' ? [] : [idx]))
  let k = 0
  while (k < changed.length) {
    let start = Math.max(changed[k] - context, 0)
    let end = Math.min(changed[k] + context, ops.length - 1)
    while (k + 1 < changed.length && changed[k + 1] - context <= end + 1) {
      k++
      end = Math.min(changed[k] + context, ops.length - 1)
    }
    k++
    start = Math.max(start, 0)
    const hunk = ops.slice(start, end + 1)
    const oldStart = ops.slice(0, start).filter((o) => o.tag !== '+').length + 1
    const newStart = ops.slice(0, start).filter((o) => o.tag !== '-').length + 1
    const oldLen = hunk.filter((o) => o.tag !== '+').length
    const newLen = hunk.filter((o) => o.tag !== '-').length
    out.push(`@@ -${oldStart},${oldLen} +${newStart},${newLen} @@`)
    for (const op of hunk) out.push(op.tag + op.text)
  }
  return out.join('\n') + '\n'
}
