import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared'
import Logo from '../../AgentPass.svg?url'

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <>
          <img src={Logo} alt="AgentPass" width={32} height={24} style={{ position: 'relative', top: 1 }} />
          AgentPass
        </>
      ),
    },
  }
}
