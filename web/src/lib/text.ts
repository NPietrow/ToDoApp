// Plain-text helpers. User text is never rendered as HTML: components draw linkify's
// segments as text nodes and <a> elements only.

export type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'link'; text: string; href: string }

/** Collapse any whitespace run (newlines, tabs included) to one space and trim. */
export function singleLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

const URL_RE = /https?:\/\/[^\s<>"']+/g
const TRAILING = /[.,;:)!?]+$/

export function linkify(s: string): Segment[] {
  const out: Segment[] = []
  let last = 0
  const push = (text: string) => {
    if (text) out.push({ kind: 'text', text })
  }
  for (const m of s.matchAll(URL_RE)) {
    const start = m.index
    const link = m[0].replace(TRAILING, '')
    if (link === 'http://' || link === 'https://') continue
    push(s.slice(last, start))
    out.push({ kind: 'link', text: link, href: link })
    last = start + link.length
  }
  push(s.slice(last))
  return out
}

/**
 * Enter at the end of a "- " or "* " bullet line starts the next bullet; Enter on an empty
 * bullet ends the list. Returns null when the caret isn't at the end of a bullet line.
 */
export function continueBullet(value: string, caret: number): { value: string; caret: number } | null {
  const lineStart = value.lastIndexOf('\n', caret - 1) + 1
  const nl = value.indexOf('\n', caret)
  const lineEnd = nl === -1 ? value.length : nl
  if (caret !== lineEnd) return null
  const m = /^([-*]) (.*)$/.exec(value.slice(lineStart, lineEnd))
  if (!m) return null
  if (m[2] === '') {
    return { value: value.slice(0, lineStart) + value.slice(lineEnd), caret: lineStart }
  }
  const insert = `\n${m[1]} `
  return { value: value.slice(0, caret) + insert + value.slice(caret), caret: caret + insert.length }
}
