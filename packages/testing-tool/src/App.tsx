import { useState } from 'react';
import { testService, testAuthority } from './tester';
import type { TestSuiteResult, TestResult } from './tester';

export default function App() {
  const [url, setUrl] = useState('');
  const [testType, setTestType] = useState<'service' | 'authority'>('service');
  const [result, setResult] = useState<TestSuiteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runTests = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const testFn = testType === 'service' ? testService : testAuthority;
      const result = await testFn(url.trim());
      setResult(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ marginBottom: '0.5rem' }}>AgentPass Compliance Tester</h1>
      <p style={{ color: '#6b7280', marginBottom: '2rem' }}>
        Test your Service or Authority for AgentPass spec compliance.
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button
          onClick={() => setTestType('service')}
          style={{
            padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer',
            border: testType === 'service' ? '2px solid #2563eb' : '1px solid #ddd',
            background: testType === 'service' ? '#eff6ff' : 'white',
            fontWeight: testType === 'service' ? 600 : 400,
          }}
        >
          Test Service
        </button>
        <button
          onClick={() => setTestType('authority')}
          style={{
            padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer',
            border: testType === 'authority' ? '2px solid #2563eb' : '1px solid #ddd',
            background: testType === 'authority' ? '#eff6ff' : 'white',
            fontWeight: testType === 'authority' ? 600 : 400,
          }}
        >
          Test Authority
        </button>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem' }}>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && runTests()}
          placeholder={
            testType === 'service'
              ? 'https://service.example.com or configuration URL'
              : 'https://authority.example.com or configuration URL'
          }
          style={{
            flex: 1, padding: '0.75rem', borderRadius: '8px',
            border: '1px solid #d1d5db', fontSize: '1rem',
          }}
        />
        <button
          onClick={runTests}
          disabled={loading || !url.trim()}
          style={{
            padding: '0.75rem 2rem', borderRadius: '8px', border: 'none',
            background: loading ? '#9ca3af' : '#2563eb', color: 'white',
            cursor: loading ? 'default' : 'pointer', fontWeight: 600, fontSize: '1rem',
          }}
        >
          {loading ? 'Testing...' : 'Run Tests'}
        </button>
      </div>

      {error && (
        <div style={{ padding: '1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', marginBottom: '1rem', color: '#dc2626' }}>
          {error}
        </div>
      )}

      {result && (
        <div>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: '1rem', padding: '1rem', borderRadius: '8px',
            background: result.failCount === 0 ? '#f0fdf4' : '#fefce8',
            border: `1px solid ${result.failCount === 0 ? '#bbf7d0' : '#fef08a'}`,
          }}>
            <div>
              <strong>{result.passCount}/{result.tests.length} tests passed</strong>
              <span style={{ color: '#6b7280', marginLeft: '1rem', fontSize: '0.875rem' }}>
                {result.type === 'service' ? 'Service' : 'Authority'} at {result.url}
              </span>
            </div>
            <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
              {new Date(result.timestamp).toLocaleTimeString()}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {result.tests.map((test, i) => (
              <TestResultRow key={i} test={test} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TestResultRow({ test }: { test: TestResult }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.75rem',
      padding: '0.625rem 0.75rem', borderRadius: '6px',
      background: test.passed ? '#f0fdf4' : '#fef2f2',
      border: `1px solid ${test.passed ? '#dcfce7' : '#fecaca'}`,
    }}>
      <span style={{ fontSize: '1rem', flexShrink: 0 }}>
        {test.passed ? '\u2705' : '\u274c'}
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{test.name}</div>
        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{test.message}</div>
      </div>
    </div>
  );
}
