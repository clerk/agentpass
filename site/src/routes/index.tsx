import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { HomeLayout } from 'fumadocs-ui/layouts/home'
import { Building2, Cog, Hash, KeyRound, Link, RefreshCw, Target } from 'lucide-react'
import { baseOptions } from '../lib/layout.shared'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <HomeLayout
      {...baseOptions()}
      links={[{ text: 'Specification', url: '/spec' }]}
      searchToggle={{ enabled: false }}
    >
      {/* Hero */}
      <section className="py-16 md:py-24">
        <div className="max-w-3xl mx-auto px-6">
          <span className="inline-block rounded-full border border-fd-border px-3 py-1 text-xs text-fd-muted-foreground mb-6">
            v0.1 Draft
          </span>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-fd-foreground">
            AgentPass: an open protocol for agent authorization
          </h1>
          <p className="mt-6 text-lg text-fd-muted-foreground">
            A <strong>Harness</strong> obtains an <strong>AgentPass</strong> from an{' '}
            <strong>Authority</strong>, then presents it to a <strong>Service</strong> to redeem
            a minimally-scoped browser session or bearer token.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <a
              href="/spec"
              className="inline-flex items-center rounded-lg bg-fd-primary px-5 py-2.5 text-sm font-medium text-fd-primary-foreground hover:opacity-90 transition-opacity"
            >
              Read the specification &rarr;
            </a>
          </div>
        </div>
      </section>

      {/* Enterprise Trust Model */}
      <section className="py-16 md:py-24 border-t border-fd-border">
        <div className="max-w-5xl mx-auto px-6">
          <div className="max-w-3xl mx-auto px-6">
            <h2 className="text-2xl md:text-3xl font-bold text-fd-foreground">
              What is an Authority?
            </h2>
            <p className="mt-4 text-lg text-fd-muted-foreground">
              An Authority is the trusted party responsible for approving and authorizing agent
              tasks, defining how approvals occur and if a human must be involved. AgentPass
              supports three types of Authority, each with a different trust model:
            </p>
          </div>
          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="rounded-lg border border-fd-border bg-fd-card p-6">
              <Building2 className="h-8 w-8 text-fd-primary mb-4" />
              <h3 className="text-lg font-semibold text-fd-foreground">Enterprise</h3>
              <p className="mt-2 text-sm text-fd-muted-foreground">
                Declared via a DNS TXT record at{' '}
                <code className="text-xs bg-fd-accent px-1 py-0.5 rounded">
                  _agentpass.{'{'}&zwj;domain{'}'}
                </code>
                . When present, it is the exclusive Authority for that domain's users and agents.
              </p>
            </div>
            <div className="rounded-lg border border-fd-border bg-fd-card p-6">
              <Cog className="h-8 w-8 text-fd-primary mb-4" />
              <h3 className="text-lg font-semibold text-fd-foreground">Service</h3>
              <p className="mt-2 text-sm text-fd-muted-foreground">
                A Service can embed an Authority within its application. It's available to users
                with no Enterprise Authority, or as an alternative when policy allows.
              </p>
            </div>
            <div className="rounded-lg border border-fd-border bg-fd-card p-6">
              <Link className="h-8 w-8 text-fd-primary mb-4" />
              <h3 className="text-lg font-semibold text-fd-foreground">Federated</h3>
              <p className="mt-2 text-sm text-fd-muted-foreground">
                With explicit opt-in, a Service may trust a third-party Federated Authority,
                which may be operated by a Harness or an independent identity provider.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Security by Design */}
      <section className="py-16 md:py-24 border-t border-fd-border">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-2xl md:text-3xl font-bold text-fd-foreground">
            Security by design
          </h2>
          <p className="mt-4 text-lg text-fd-muted-foreground mb-12">
            AgentPass credentials are designed around zero-trust principles.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="rounded-lg border border-fd-border bg-fd-card p-6">
              <Target className="h-8 w-8 text-fd-primary mb-4" />
              <h3 className="text-lg font-semibold text-fd-foreground">Task-scoped</h3>
              <p className="mt-2 text-sm text-fd-muted-foreground">
                Each AgentPass is issued for a single task. The task description and scope are
                bound at issuance.
              </p>
            </div>
            <div className="rounded-lg border border-fd-border bg-fd-card p-6">
              <Hash className="h-8 w-8 text-fd-primary mb-4" />
              <h3 className="text-lg font-semibold text-fd-foreground">Single-use</h3>
              <p className="mt-2 text-sm text-fd-muted-foreground">
                AgentPasses are consumed atomically on first use. Replay is impossible.
              </p>
            </div>
            <div className="rounded-lg border border-fd-border bg-fd-card p-6">
              <KeyRound className="h-8 w-8 text-fd-primary mb-4" />
              <h3 className="text-lg font-semibold text-fd-foreground">Holder-bound</h3>
              <p className="mt-2 text-sm text-fd-muted-foreground">
                Cryptographic proof-of-possession ensures only the requesting Harness can redeem
                an AgentPass.
              </p>
            </div>
            <div className="rounded-lg border border-fd-border bg-fd-card p-6">
              <RefreshCw className="h-8 w-8 text-fd-primary mb-4" />
              <h3 className="text-lg font-semibold text-fd-foreground">Continuously validated</h3>
              <p className="mt-2 text-sm text-fd-muted-foreground">
                Services verify delegation validity throughout the session. Revocation takes
                effect immediately.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 md:py-24 border-t border-fd-border">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-2xl md:text-3xl font-bold text-fd-foreground mb-12">
            How it works
          </h2>
          <ol className="space-y-6">
            {[
              'A Harness is executing a task that requires authorization from a Service.',
              'The Harness discovers the Service\u2019s AgentPass configuration via DNS.',
              'The Harness provides the email of the user or agent it\u2019s acting on behalf of.',
              'The Service resolves the Authority using the email domain.',
              'The Harness requests an AgentPass from the Authority that is scoped to the email and task.',
              'The Authority discovers the available scopes from the Service.',
              'The Authority obtains approval for the task, determining which scopes are granted and whether a human-in-the-loop is required.',
              'The Authority issues a single-use AgentPass to the Harness.',
              'The Harness presents the AgentPass to the Service.',
              'The Service validates the AgentPass with the Authority.',
              'The Service establishes a browser session or bearer token with the approved scopes.',
            ].map((step, i) => (
              <li key={i} className="flex gap-4 items-start">
                <span className="flex-none flex items-center justify-center h-8 w-8 rounded-full bg-fd-primary text-fd-primary-foreground text-sm font-bold">
                  {i + 1}
                </span>
                <span className="text-fd-foreground pt-1">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="py-16 md:py-24 border-t border-fd-border">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <p className="text-lg text-fd-muted-foreground">
            AgentPass is an open specification. Read the spec or build an integration.
          </p>
        </div>
      </section>
    </HomeLayout>
  )
}
