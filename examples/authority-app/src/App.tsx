import { useCallback } from 'react';
import { ClerkProvider, Show, SignInButton, UserButton, useAuth } from "@clerk/react";
import { AgentPassProvider } from '@agentpass/authority/react';
import { Dashboard } from './components/Dashboard';

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const AUTHORITY_URL = import.meta.env.VITE_AUTHORITY_URL || 'http://localhost:8787/agentpass-authority';

function AuthorityDashboard() {
  const { getToken } = useAuth();

  const getAuthToken = useCallback(async () => {
    const token = await getToken();
    return token || '';
  }, [getToken]);

  return (
    <AgentPassProvider authorityUrl={AUTHORITY_URL} getToken={getAuthToken}>
      <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h1 style={{ margin: 0 }}>AgentPass Authority</h1>
          <UserButton />
        </header>
        <Dashboard />
      </div>
    </AgentPassProvider>
  );
}

export default function App() {
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
      <Show when="signed-in">
        <AuthorityDashboard />
      </Show>
      <Show when="signed-out">
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '100vh', fontFamily: 'system-ui, sans-serif',
        }}>
          <h1>AgentPass Authority</h1>
          <p>Sign in to manage AgentPass delegation requests.</p>
          <SignInButton mode="modal">
            <button style={{
              padding: '0.75rem 2rem', fontSize: '1rem', borderRadius: '8px',
              border: 'none', background: '#2563eb', color: 'white', cursor: 'pointer',
            }}>
              Sign In
            </button>
          </SignInButton>
        </div>
      </Show>
    </ClerkProvider>
  );
}
