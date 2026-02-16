import * as React from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { getDefaultSpecDoc, resolveSpecLink } from '../../lib/spec'
import { marked } from 'marked'

export const Route = createFileRoute('/spec/')({
  component: SpecIntro,
})

function SpecIntro() {
  const doc = getDefaultSpecDoc()

  if (!doc) {
    return (
      <div>
        <h1>Not found</h1>
        <p>Introduction document not found.</p>
        <p><Link to="/">Back home</Link></p>
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

  React.useEffect(() => {
    document.title = `${doc.title} | AgentPass`
  }, [doc.title])

  return (
    <article>
      <div className="markdown-content" dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  )
}
