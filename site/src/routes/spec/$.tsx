import { createFileRoute, Link, redirect } from '@tanstack/react-router'

const LEGACY_SLUG_TO_ANCHOR: Record<string, string | null> = {
  '': null,
  index: null,
  '0-spec-index': null,
  '1-introduction': 's-1',
  '2-notational-conventions/2-notational-conventions': 's-2',
  '2-notational-conventions/2.1-definitions': 's-2-1',
  '3-operating-agentpass': 's-3',
  '3-operating-agentpass/3-operating-agentpass': 's-3',
  '3-operating-agentpass/3.1-authoritative-vs-federated': 's-3-1',
  '3-operating-agentpass/3.2-discovery': 's-3-2',
  '3-operating-agentpass/3.3-configuration': 's-3-3',
  '3-operating-agentpass/3.6-endpoints': 's-3-6',
  '3-operating-agentpass/3.6-endpoints/3.6.2-post-requests': 's-3-6-2',
  '3-operating-agentpass/3.6-endpoints/3.6.3-get-request-status': 's-3-6-3',
  '3-operating-agentpass/3.6-endpoints/3.6.4-get-request-events': 's-3-6-4',
  '4-integrating-agentpass-for-runtimes': 's-4',
  '4-integrating-agentpass-for-runtimes/4-integrating-agentpass-for-runtimes': 's-4',
  '4-integrating-agentpass-for-runtimes/4.1-agentpass-browser-sessions': 's-4-1',
  '4-integrating-agentpass-for-runtimes/4.2-agentpass-bearer-tokens': 's-4-2',
  '5-integrating-agentpass-for-service-providers': 's-5',
  '5-integrating-agentpass-for-service-providers/5-integrating-agentpass-for-service-providers': 's-5',
  '5-integrating-agentpass-for-service-providers/5.1-discovery': 's-5-1',
  '5-integrating-agentpass-for-service-providers/5.2-configuration': 's-5-2',
  '5-integrating-agentpass-for-service-providers/5.3-service-spec': 's-5-3',
  '5-integrating-agentpass-for-service-providers/5.4-agentpass-browser-sessions': 's-5-4',
  '5-integrating-agentpass-for-service-providers/5.5-agentpass-bearer-tokens': 's-5-5',
  '5-integrating-agentpass-for-service-providers/5.6-endpoints': 's-5-6',
  '5-integrating-agentpass-for-service-providers/5.6-endpoints/5.6.1-discovery': 's-5-6-1',
  '5-integrating-agentpass-for-service-providers/5.6-endpoints/5.6.2-get-configuration': 's-5-6-2',
  '5-integrating-agentpass-for-service-providers/5.6-endpoints/5.6.3-post-init': 's-5-6-3',
  '5-integrating-agentpass-for-service-providers/5.6-endpoints/5.6.4-get-initialize': 's-5-6-4',
  '5-integrating-agentpass-for-service-providers/5.6-endpoints/5.6.5-post-resolve-authority': 's-5-6-5',
}

function normalizeLegacySlug(input: string) {
  let slug = String(input ?? '').trim()

  try {
    slug = decodeURIComponent(slug)
  } catch {
    // keep original when malformed encoding is provided
  }

  slug = slug.replace(/^\/+/, '')
  slug = slug.replace(/\/+/g, '/')
  slug = slug.replace(/^spec\//, '')
  slug = slug.replace(/\.md$/i, '')
  slug = slug.replace(/\/+$/, '')

  return slug
}

function resolveLegacyAnchor(normalizedSlug: string): string | null | undefined {
  return LEGACY_SLUG_TO_ANCHOR[normalizedSlug]
}

export const Route = createFileRoute('/spec/$')({
  loader: ({ params }) => {
    const normalized = normalizeLegacySlug(params._splat)
    const anchor = resolveLegacyAnchor(normalized)

    if (anchor === null) {
      throw redirect({ to: '/spec', replace: true })
    }

    if (anchor) {
      throw redirect({ to: '/spec', hash: anchor, replace: true })
    }

    return { normalized }
  },
  component: LegacySpecNotFound,
})

function LegacySpecNotFound() {
  const { normalized } = Route.useLoaderData()

  return (
    <div>
      <h1>Not found</h1>
      <p>Legacy spec page not found: <code>{normalized}</code></p>
      <p><Link to="/spec">Back to specification</Link></p>
    </div>
  )
}
