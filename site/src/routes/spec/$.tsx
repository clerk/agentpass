import * as React from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { getPreviousNext, getSpecDocBySlug, resolveSpecLink, toSpecUrl } from '../../lib/spec'
import { marked } from 'marked'

export const Route = createFileRoute('/spec/$')({
  component: SpecDoc,
})

function SpecDoc() {
  const { _splat } = Route.useParams()
  const doc = getSpecDocBySlug(_splat)

  if (!doc) {
    return (
      <div>
        <h1>Not found</h1>
        <p>Spec document not found: <code>{_splat}</code></p>
        <p><Link to="/spec">Back to index</Link></p>
      </div>
    )
  }

  const renderer = React.useMemo(() => {
    const r = new marked.Renderer()
    const orig = r.link.bind(r)
    r.link = (href: string | null | undefined, title: string | null | undefined, text: string) =>
      orig(resolveSpecLink(doc.path, href), title, text)
    return r
  }, [doc.path])

  const html = React.useMemo(
    () => marked.parse(doc.body, { renderer }) as string,
    [doc.body, renderer],
  )

  const githubEditUrl = `https://github.com/clerk/agentpass/blob/main/spec/${doc.path}`
  const { previous, next } = getPreviousNext(doc.slug)

  React.useEffect(() => {
    document.title = `${doc.title} | AgentPass`
  }, [doc.title])

  return (
    <article>
      <div
        className="markdown-content"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <div className="mt-4">
        <a href={githubEditUrl} target="_blank" rel="noreferrer">
          Edit on GitHub
        </a>
      </div>
      <div className="mt-5 flex justify-between gap-4">
        <div>
          {previous ? (
            <a href={toSpecUrl(previous.slug)}>← {previous.title}</a>
          ) : null}
        </div>
        <div>
          {next ? (
            <a href={toSpecUrl(next.slug)}>{next.title} →</a>
          ) : null}
        </div>
      </div>
      <div className="mt-6 text-xs text-slate-500">
        Source: <code>/spec/{doc.path}</code>
      </div>
    </article>
  )
}
