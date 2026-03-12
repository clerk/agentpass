import { Suspense } from 'react'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useFumadocsLoader } from 'fumadocs-core/source/client'
import browserCollections from 'fumadocs-mdx:collections/browser'
import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import { DocsBody, DocsPage } from 'fumadocs-ui/layouts/docs/page'
import { baseOptions } from '../../lib/layout.shared'
import { source } from '../../lib/source'
import { mdxComponents } from '../../mdx-components'

export const Route = createFileRoute('/spec/')({
  loader: async () => {
    const data = await serverLoader()
    await clientLoader.preload(data.path)
    return data
  },
  component: SpecPage,
})

const serverLoader = createServerFn({
  method: 'GET',
}).handler(async () => {
  const page = source.getPage([])
  if (!page) throw notFound()

  return {
    path: page.path,
    pageTree: await source.serializePageTree(source.getPageTree()),
  }
})

const clientLoader = browserCollections.docs.createClientLoader({
  component({ toc, default: MDX }, data: { pageTree: Awaited<ReturnType<typeof source.serializePageTree>> }) {
    return (
      <DocsLayout tree={data.pageTree} {...baseOptions()}>
        <DocsPage toc={toc.filter((item) => item.depth <= 3)}>
          <DocsBody>
            <MDX components={mdxComponents} />
          </DocsBody>
        </DocsPage>
      </DocsLayout>
    )
  },
})

function SpecPage() {
  const data = useFumadocsLoader(Route.useLoaderData())
  return (
    <Suspense>
      {clientLoader.useContent(data.path, data)}
    </Suspense>
  )
}
