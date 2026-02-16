import * as React from 'react'
import { createRootRoute, HeadContent, Link, Outlet, Scripts, useRouterState } from '@tanstack/react-router'
import { getSpecSidebarOutline, toSpecUrl, type SpecSidebarNode } from '../lib/spec'
import '../styles.css'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <HeadContent />
      </head>
      <body>
        <AppShell />
        <Scripts />
      </body>
    </html>
  )
}

function AppShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const outline = React.useMemo(() => getSpecSidebarOutline(), [])
  const onSpecPage = pathname === '/spec' || pathname.startsWith('/spec/')
  const [expandedNodes, setExpandedNodes] = React.useState<Record<string, boolean>>({})

  const getDisplayTitle = (title: string) => title.replace(/^\d+(\.\d+)*\.?\s+/, '')

  const nodeOrDescendantIsActive = (node: SpecSidebarNode): boolean => {
    const href = toSpecUrl(node.doc.slug)
    if (pathname === href || pathname.startsWith(`${href}/`)) {
      return true
    }

    return node.children.some((child) => nodeOrDescendantIsActive(child))
  }

  React.useEffect(() => {
    if (!onSpecPage) {
      return
    }

    setExpandedNodes((prev) => {
      const next = { ...prev }

      const walk = (nodes: SpecSidebarNode[], depth: number) => {
        for (const node of nodes) {
          if (node.children.length === 0) {
            continue
          }

          if (depth === 0 || nodeOrDescendantIsActive(node)) {
            next[node.key] = true
          } else if (!(node.key in next)) {
            next[node.key] = false
          }

          walk(node.children, depth + 1)
        }
      }

      walk(outline, 0)
      return next
    })
  }, [onSpecPage, outline, pathname])

  const renderNode = (node: SpecSidebarNode, depth = 0): React.ReactNode => {
    const href = toSpecUrl(node.doc.slug)
    const active = pathname === href || pathname.startsWith(`${href}/`)
    const inActiveBranch = !active && nodeOrDescendantIsActive(node)
    const hasChildren = node.children.length > 0
    const isExpanded = hasChildren
      ? expandedNodes[node.key] ?? (depth === 0 || nodeOrDescendantIsActive(node))
      : false
    const num = node.doc.outlineParts?.join('.') ?? ''
    const levelStyles =
      depth === 0
        ? 'text-[13px] font-semibold tracking-tight'
        : depth === 1
          ? 'text-[13px] font-medium'
          : 'text-[12.5px] font-normal'
    const numberStyles =
      depth === 0
        ? 'text-[11px] text-slate-500'
        : depth === 1
          ? 'text-[11px] text-slate-400'
          : 'text-[10.5px] text-slate-400'

    const linkStyles = active
      ? 'bg-slate-100 text-slate-900'
      : inActiveBranch
        ? 'text-slate-700'
        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'

    const itemSpacing = depth === 0 ? 'py-2' : 'py-1'

    return (
      <li key={node.key}>
        <div className="relative">
          <a
            href={href}
            className={`block min-w-0 rounded-md pl-1 pr-8 leading-[1.2] ${linkStyles} ${levelStyles} ${itemSpacing}`}
          >
            <span className="grid grid-cols-[max-content_minmax(0,1fr)] items-baseline gap-1.5">
              <span
                className={`shrink-0 text-left font-mono tabular-nums leading-none ${numberStyles}`}
              >
                {num}
              </span>
              <span className="inline-block min-w-0 leading-[1.2]">
                {getDisplayTitle(node.doc.navTitle ?? node.doc.title)}
              </span>
            </span>
          </a>
          {hasChildren ? (
            <button
              type="button"
              onClick={() => setExpandedNodes((prev) => ({ ...prev, [node.key]: !isExpanded }))}
              className="absolute right-1 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label={isExpanded ? 'Collapse section' : 'Expand section'}
              aria-expanded={isExpanded}
            >
              <svg
                viewBox="0 0 12 12"
                className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                aria-hidden="true"
              >
                <path d="M4 2.5L8 6L4 9.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : null}
        </div>
        {hasChildren && isExpanded ? (
          <ul className="mt-1 space-y-0.5">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </ul>
        ) : null}
      </li>
    )
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-3">
          <div className="text-lg font-semibold text-slate-900">AgentPass</div>
          <nav className="flex items-center gap-2">
            <Link
              to="/"
              className="rounded px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-900"
              activeProps={{ style: { backgroundColor: '#f1f5f9', fontWeight: 600, color: '#0f172a' } }}
            >
              Home
            </Link>
            <Link
              to="/spec"
              className="rounded px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-900"
              activeProps={{ style: { backgroundColor: '#f1f5f9', fontWeight: 600, color: '#0f172a' } }}
            >
              Specification
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl">
        {onSpecPage ? (
          <aside className="sticky top-[53px] h-[calc(100vh-53px)] w-80 shrink-0 overflow-y-auto border-r border-slate-200 bg-white px-2 py-5">
            <nav className="pb-8">
              <ul className="space-y-1.5">
                {outline.map((node) => renderNode(node))}
              </ul>
            </nav>
          </aside>
        ) : null}

        <main className={`w-full flex-1 px-8 py-6 ${onSpecPage ? 'max-w-5xl' : 'max-w-6xl'}`}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
