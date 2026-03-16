import type { ScopeDiscoveryHandler } from '@agentpass/service';

export const onScopeDiscovery: ScopeDiscoveryHandler = async () => [
  { name: 'todos:read', description: 'Read todos' },
  { name: 'todos:write', description: 'Create, update, and delete todos' },
];
