import { createContext, useContext, createElement, useMemo } from 'react';
import type { ReactNode } from 'react';

export interface AgentPassContextValue {
  /** Base URL of the Authority API (e.g., https://authority.example.com) */
  authorityUrl: string;
  /** Function that returns a JWT for authenticating dashboard API requests */
  getToken: () => Promise<string>;
}

export interface AgentPassProviderProps {
  /** Base URL of the Authority API */
  authorityUrl: string;
  /** Function that returns a JWT for authenticating dashboard API requests */
  getToken: () => Promise<string>;
  children: ReactNode;
}

const AgentPassContext = createContext<AgentPassContextValue | null>(null);

export function AgentPassProvider({ authorityUrl, getToken, children }: AgentPassProviderProps) {
  const value = useMemo(
    () => ({ authorityUrl: authorityUrl.replace(/\/$/, ''), getToken }),
    [authorityUrl, getToken],
  );

  return createElement(AgentPassContext.Provider, { value }, children);
}

export function useAgentPass(): AgentPassContextValue {
  const context = useContext(AgentPassContext);
  if (!context) {
    throw new Error('useAgentPass must be used within an AgentPassProvider');
  }
  return context;
}
