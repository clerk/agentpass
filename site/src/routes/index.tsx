import * as React from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h1 style={{ margin: 0 }}>AgentPass</h1>
      <p style={{ margin: 0 }}>
        AgentPass is an open specification for governed delegation of authority from humans to agents.
      </p>
      <p style={{ margin: 0 }}>
        <Link to="/spec">Read the spec →</Link>
      </p>
    </div>
  )
}
