type Frontmatter = {
  title?: string
  navTitle?: string
  section?: string
  order?: number
}

type OutlineParts = number[]

export type SpecDoc = {
  path: string
  slug: string
  title: string
  navTitle: string | null
  body: string
  section: string
  order: number | null
  outlineParts: OutlineParts | null
}

export type SpecSection = {
  key: string
  title: string
  items: SpecDoc[]
}

export type SpecSidebarNode = {
  key: string
  doc: SpecDoc
  children: SpecSidebarNode[]
}

export type SpecSidebarSection = {
  key: string
  title: string
  nodes: SpecSidebarNode[]
}

type SpecCatalog = {
  docs: SpecDoc[]
  sections: SpecSection[]
  sidebarSections: SpecSidebarSection[]
  outlineRoots: SpecSidebarNode[]
  docsBySlug: Map<string, SpecDoc>
  docsByPath: Map<string, SpecDoc>
}

const modules = import.meta.glob('../../../spec/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

function normalizePath(file: string) {
  const idx = file.indexOf('/spec/')
  return idx >= 0 ? file.slice(idx + '/spec/'.length) : file
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function normalizeSlug(slug: string) {
  let s = safeDecodeURIComponent(String(slug ?? '').trim())
  s = s.replace(/^https?:\/\/[^/]+/i, '')
  s = s.replace(/^\/+|\/+$/g, '')
  s = s.replace(/^spec\//, '')
  s = s.replace(/^\/spec\//, '')
  if (s.endsWith('/README.md')) s = s.slice(0, -'/README.md'.length)
  if (s.endsWith('.md')) s = s.slice(0, -'.md'.length)
  return s
}

function splitPath(path: string) {
  return path.split('/').filter(Boolean)
}

function dirname(path: string) {
  const parts = splitPath(path)
  parts.pop()
  return parts.join('/')
}

function resolveRelativePath(baseDir: string, target: string) {
  const out = splitPath(baseDir)
  for (const segment of splitPath(target)) {
    if (segment === '.') continue
    if (segment === '..') {
      out.pop()
      continue
    }
    out.push(segment)
  }
  return out.join('/')
}

function pathToSlug(path: string) {
  if (path === 'README.md') return 'readme'
  if (path.endsWith('/README.md')) return path.slice(0, -'/README.md'.length)
  if (path.endsWith('.md')) return path.slice(0, -'.md'.length)
  return path
}

function firstH1(markdown: string) {
  const m = markdown.match(/^#\s+(.+)\s*$/m)
  return m?.[1]?.trim() ?? null
}

function parseFrontmatter(raw: string): { frontmatter: Frontmatter; body: string } {
  if (!raw.startsWith('---\n')) return { frontmatter: {}, body: raw }
  const end = raw.indexOf('\n---\n', 4)
  if (end < 0) return { frontmatter: {}, body: raw }

  const fmBlock = raw.slice(4, end)
  const body = raw.slice(end + '\n---\n'.length)
  const frontmatter: Frontmatter = {}

  for (const line of fmBlock.split('\n')) {
    const m = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.+)\s*$/)
    if (!m) continue
    const key = m[1]
    const rawValue = m[2].trim()
    const value = rawValue.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1')
    if (key === 'title') frontmatter.title = value
    if (key === 'nav_title' || key === 'navTitle') frontmatter.navTitle = value
    if (key === 'section') frontmatter.section = value
    if (key === 'order') {
      const n = Number(value)
      if (!Number.isNaN(n)) frontmatter.order = n
    }
  }

  return { frontmatter, body }
}

function parseOutlinePartsFromTitle(title: string): OutlineParts | null {
  const m = title.match(/^(\d+(?:\.\d+)*)\.?\s+/)
  if (!m) return null
  const parts = m[1].split('.').map((p) => Number(p))
  if (parts.some((p) => Number.isNaN(p))) return null
  return parts
}

function parseOutlinePartsFromPath(path: string): OutlineParts | null {
  const file = splitPath(path).pop() ?? ''
  const stem = file.replace(/\.md$/, '')
  const m = stem.match(/^(\d+(?:\.\d+)*)(?:[-.].*)?$/)
  if (!m) return null
  const parts = m[1].split('.').map((p) => Number(p))
  if (parts.some((p) => Number.isNaN(p))) return null
  return parts
}

function compareOutlineParts(a: OutlineParts, b: OutlineParts) {
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? -1
    const bv = b[i] ?? -1
    if (av !== bv) return av - bv
  }
  return 0
}

function outlineKey(parts: OutlineParts) {
  return parts.join('.')
}

function titleFromSectionKey(sectionKey: string) {
  if (/^\d+$/.test(sectionKey)) return `Section ${sectionKey}`
  const stripped = sectionKey.replace(/^\d+(?:\.\d+)?-/, '')
  if (stripped === 'operating-agentpass') return 'Operating AgentPass'
  if (stripped === 'integrating-agentpass-for-runtimes') return 'Integrating AgentPass for Runtimes'
  if (stripped === 'integrating-agentpass-for-service-providers') return 'Integrating AgentPass for Service Providers'
  return stripped
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

function sortOutlineTree(nodes: SpecSidebarNode[]) {
  nodes.sort((a, b) => {
    const aa = a.doc.outlineParts ?? []
    const bb = b.doc.outlineParts ?? []
    const cmp = compareOutlineParts(aa, bb)
    if (cmp !== 0) return cmp
    return a.doc.path.localeCompare(b.doc.path)
  })
  for (const node of nodes) sortOutlineTree(node.children)
}

function buildOutlineRoots(docs: SpecDoc[]): SpecSidebarNode[] {
  const numbered = docs.filter((doc) => doc.outlineParts && doc.outlineParts[0] > 0)
  const nodeByNumber = new Map<string, SpecSidebarNode>()

  for (const doc of numbered) {
    const key = outlineKey(doc.outlineParts!)
    if (!nodeByNumber.has(key)) {
      nodeByNumber.set(key, { key: doc.path, doc, children: [] })
    }
  }

  const roots: SpecSidebarNode[] = []
  for (const doc of numbered) {
    const parts = doc.outlineParts!
    const key = outlineKey(parts)
    const node = nodeByNumber.get(key)!
    const parentKey = parts.length > 1 ? outlineKey(parts.slice(0, -1)) : null

    if (parentKey && nodeByNumber.has(parentKey)) {
      nodeByNumber.get(parentKey)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  sortOutlineTree(roots)
  return roots
}

function buildSpecCatalog(): SpecCatalog {
  const docsByPath = new Map<string, SpecDoc>()
  const docsBySlug = new Map<string, SpecDoc>()

  for (const [key, raw] of Object.entries(modules)) {
    const path = normalizePath(key)
    const slug = pathToSlug(path)
    const { frontmatter, body } = parseFrontmatter(raw)
    const title = frontmatter.title ?? firstH1(body) ?? path.split('/').pop() ?? path
    const navTitle = frontmatter.navTitle ?? null
    const outlineParts = parseOutlinePartsFromTitle(title) ?? parseOutlinePartsFromPath(path)
    const defaultSection = outlineParts ? String(outlineParts[0]) : splitPath(path)[0] ?? 'spec'
    const section = frontmatter.section ?? defaultSection
    const order = frontmatter.order ?? null

    const doc: SpecDoc = { path, slug, title, navTitle, body, section, order, outlineParts }
    docsByPath.set(path, doc)
    docsBySlug.set(slug, doc)
  }

  const docs = Array.from(docsByPath.values()).sort((a, b) => {
    if (a.outlineParts && b.outlineParts) {
      const cmp = compareOutlineParts(a.outlineParts, b.outlineParts)
      if (cmp !== 0) return cmp
    } else if (a.outlineParts) {
      return -1
    } else if (b.outlineParts) {
      return 1
    }

    if (a.order != null || b.order != null) {
      const ao = a.order ?? Number.MAX_SAFE_INTEGER
      const bo = b.order ?? Number.MAX_SAFE_INTEGER
      if (ao !== bo) return ao - bo
    }

    return a.path.localeCompare(b.path)
  })

  const topTitleBySection = new Map<string, string>()
  for (const doc of docs) {
    if (!doc.outlineParts || doc.outlineParts.length !== 1) continue
    topTitleBySection.set(String(doc.outlineParts[0]), doc.title)
  }

  const sectionsByKey = new Map<string, SpecSection>()
  for (const doc of docs) {
    if (!sectionsByKey.has(doc.section)) {
      sectionsByKey.set(doc.section, {
        key: doc.section,
        title: topTitleBySection.get(doc.section) ?? titleFromSectionKey(doc.section),
        items: [],
      })
    }
    sectionsByKey.get(doc.section)!.items.push(doc)
  }

  const sections = Array.from(sectionsByKey.values()).sort((a, b) => {
    const an = Number(a.key)
    const bn = Number(b.key)
    if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn
    if (!Number.isNaN(an)) return -1
    if (!Number.isNaN(bn)) return 1
    return a.title.localeCompare(b.title)
  })

  const outlineRoots = buildOutlineRoots(docs)
  const sidebarSections: SpecSidebarSection[] = [
    {
      key: 'outline',
      title: 'Spec Outline',
      nodes: outlineRoots,
    },
  ]

  return { docs, sections, sidebarSections, outlineRoots, docsBySlug, docsByPath }
}

const catalog = buildSpecCatalog()
const orderedBySlug = new Map(catalog.docs.map((doc, idx) => [doc.slug, idx]))

export function getSpecCatalog() {
  return catalog
}

export function getSpecDocBySlug(slug: string): SpecDoc | null {
  const normalized = normalizeSlug(slug)

  const bySlug = catalog.docsBySlug.get(normalized)
  if (bySlug) return bySlug

  const pathCandidates = [
    normalized,
    `${normalized}.md`,
    `${normalized}/README.md`,
  ]

  for (const path of pathCandidates) {
    const byPath = catalog.docsByPath.get(path)
    if (byPath) return byPath
  }

  return null
}

export function getSpecSections() {
  return catalog.sections
}

export function getDefaultSpecDoc() {
  return (
    getSpecDocBySlug('1-introduction')
    ?? catalog.docs.find((doc) => doc.outlineParts?.[0] === 1)
    ?? catalog.docs[0]
    ?? null
  )
}

export function getSpecSidebarSections() {
  return catalog.sidebarSections
}

export function getSpecSidebarOutline() {
  return catalog.outlineRoots
}

export function getPreviousNext(slug: string) {
  const idx = orderedBySlug.get(normalizeSlug(slug))
  if (idx == null) return { previous: null, next: null }
  return {
    previous: idx > 0 ? catalog.docs[idx - 1] : null,
    next: idx < catalog.docs.length - 1 ? catalog.docs[idx + 1] : null,
  }
}

export function toSpecUrl(slug: string) {
  const s = normalizeSlug(slug)
  return s ? `/spec/${s}` : '/spec'
}

export function resolveSpecLink(currentDocPath: string, href: string | null | undefined) {
  const raw = (href ?? '').trim()
  if (!raw) return raw
  if (raw.startsWith('#')) return `${toSpecUrl(pathToSlug(currentDocPath))}${raw}`
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(raw) || raw.startsWith('//')) return raw

  const [rawPath, hash = ''] = raw.split('#', 2)
  let candidate = rawPath

  if (rawPath.startsWith('/')) {
    if (rawPath.startsWith('/spec/')) {
      candidate = rawPath.slice('/spec/'.length)
    } else {
      return raw
    }
  } else {
    candidate = resolveRelativePath(dirname(currentDocPath), rawPath)
  }

  if (!candidate) return raw
  if (candidate.endsWith('/')) candidate = `${candidate}README.md`

  const tryPaths: string[] = []
  if (candidate.endsWith('.md')) {
    tryPaths.push(candidate)
  } else {
    tryPaths.push(`${candidate}.md`)
    tryPaths.push(`${candidate}/README.md`)
  }

  for (const path of tryPaths) {
    const doc = catalog.docsByPath.get(path)
    if (!doc) continue
    return `${toSpecUrl(doc.slug)}${hash ? `#${hash}` : ''}`
  }

  return raw
}
