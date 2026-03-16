/**
 * AgentPass Compliance Tester
 * Tests Services and Authorities for spec compliance.
 */

export interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  details?: string;
}

export interface TestSuiteResult {
  type: 'service' | 'authority';
  url: string;
  tests: TestResult[];
  passCount: number;
  failCount: number;
  timestamp: string;
}

// ─── Service Tests ───

export async function testService(url: string): Promise<TestSuiteResult> {
  const tests: TestResult[] = [];

  // Test 1: Configuration endpoint
  try {
    const configUrl = url.includes('config.json')
      ? url
      : `${url.replace(/\/$/, '')}/agentpass-service/config.json`;
    const res = await fetch(configUrl);
    const config = await res.json() as Record<string, unknown>;

    tests.push({
      name: 'Configuration endpoint reachable',
      passed: res.ok,
      message: res.ok ? 'Configuration document fetched successfully' : `HTTP ${res.status}`,
    });

    // Test version
    tests.push({
      name: 'Version field present and valid',
      passed: typeof config.version === 'string' && /^\d+\.\d+$/.test(config.version as string),
      message: config.version ? `Version: ${config.version}` : 'Missing or invalid version',
    });

    // Test kind
    tests.push({
      name: 'Kind field is "service"',
      passed: config.kind === 'service',
      message: config.kind === 'service' ? 'Correct' : `Expected "service", got "${config.kind}"`,
    });

    // Test service object
    const service = config.service as Record<string, string> | undefined;
    tests.push({
      name: 'Service origin present',
      passed: !!service?.origin && (service.origin as string).startsWith('https://'),
      message: service?.origin
        ? `Origin: ${service.origin}`
        : 'Missing service.origin or not HTTPS',
    });

    // Test jwks_uri
    tests.push({
      name: 'JWKS URI present',
      passed: typeof config.jwks_uri === 'string' && (config.jwks_uri as string).startsWith('https://'),
      message: config.jwks_uri ? `JWKS URI: ${config.jwks_uri}` : 'Missing or invalid jwks_uri',
    });

    // Test JWKS endpoint
    if (config.jwks_uri) {
      try {
        const jwksRes = await fetch(config.jwks_uri as string);
        const jwks = await jwksRes.json() as { keys?: unknown[] };
        tests.push({
          name: 'JWKS endpoint reachable and valid',
          passed: jwksRes.ok && Array.isArray(jwks.keys) && jwks.keys.length > 0,
          message: jwksRes.ok ? `Found ${jwks.keys?.length || 0} key(s)` : `HTTP ${jwksRes.status}`,
        });
      } catch (e) {
        tests.push({
          name: 'JWKS endpoint reachable and valid',
          passed: false,
          message: `Failed: ${(e as Error).message}`,
        });
      }
    }

    // Test trust
    const trust = config.trust as Record<string, unknown> | undefined;
    tests.push({
      name: 'Trust configuration present',
      passed: !!trust,
      message: trust ? 'Trust section present' : 'Missing trust configuration',
    });

    if (trust) {
      const hasFederated = Array.isArray(trust.trusted_federated_authorities);
      const hasServiceAuth = !!trust.service_authority;
      tests.push({
        name: 'Trust has at least one authority type',
        passed: hasFederated || hasServiceAuth,
        message: `Federated: ${hasFederated ? (trust.trusted_federated_authorities as unknown[]).length : 0}, Service: ${hasServiceAuth ? 'yes' : 'no'}`,
      });
    }

    // Test endpoints
    const endpoints = config.endpoints as Record<string, string> | undefined;
    const requiredEndpoints = ['resolve_authorities', 'redeem_browser_session', 'redeem_bearer_token', 'available_scopes'];
    for (const ep of requiredEndpoints) {
      tests.push({
        name: `Endpoint "${ep}" present`,
        passed: !!endpoints?.[ep],
        message: endpoints?.[ep] ? `URL: ${endpoints[ep]}` : `Missing endpoints.${ep}`,
      });
    }

    // Test authority resolution endpoint
    if (endpoints?.resolve_authorities) {
      try {
        const resolveRes = await fetch(endpoints.resolve_authorities, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user: { email: 'test@example.com' } }),
        });
        const resolveBody = await resolveRes.json() as Record<string, unknown>;
        const hasAuthority = !!resolveBody.enterprise_authority ||
          !!resolveBody.trusted_federated_authorities ||
          !!resolveBody.service_authority;

        tests.push({
          name: 'Authority resolution endpoint responds',
          passed: resolveRes.ok || resolveRes.status === 404 || resolveRes.status === 403,
          message: resolveRes.ok
            ? `Returned authority type: ${Object.keys(resolveBody).join(', ')}`
            : `HTTP ${resolveRes.status} (acceptable for test domain)`,
        });

        if (resolveRes.ok) {
          tests.push({
            name: 'Authority resolution returns valid authority type',
            passed: hasAuthority,
            message: hasAuthority ? 'Valid authority returned' : 'Missing authority in response',
          });
        }
      } catch (e) {
        tests.push({
          name: 'Authority resolution endpoint responds',
          passed: false,
          message: `Failed: ${(e as Error).message}`,
        });
      }
    }
  } catch (e) {
    tests.push({
      name: 'Configuration endpoint reachable',
      passed: false,
      message: `Failed to fetch: ${(e as Error).message}`,
    });
  }

  const passCount = tests.filter(t => t.passed).length;
  return {
    type: 'service',
    url,
    tests,
    passCount,
    failCount: tests.length - passCount,
    timestamp: new Date().toISOString(),
  };
}

// ─── Authority Tests ───

export async function testAuthority(url: string): Promise<TestSuiteResult> {
  const tests: TestResult[] = [];

  try {
    const configUrl = url.includes('/ap') || url.includes('configuration')
      ? url
      : `${url.replace(/\/$/, '')}/ap`;
    const res = await fetch(configUrl);
    const config = await res.json() as Record<string, unknown>;

    tests.push({
      name: 'Configuration endpoint reachable',
      passed: res.ok,
      message: res.ok ? 'Configuration document fetched successfully' : `HTTP ${res.status}`,
    });

    // Test version
    tests.push({
      name: 'Version field present and valid',
      passed: typeof config.version === 'string' && /^\d+\.\d+$/.test(config.version as string),
      message: config.version ? `Version: ${config.version}` : 'Missing or invalid version',
    });

    // Test authority
    tests.push({
      name: 'Authority identifier present',
      passed: typeof config.authority === 'string' && (config.authority as string).startsWith('https://'),
      message: config.authority ? `Authority: ${config.authority}` : 'Missing or invalid authority',
    });

    // Test trust_mode
    const validModes = ['enterprise', 'federated', 'service'];
    tests.push({
      name: 'Trust mode valid',
      passed: validModes.includes(config.trust_mode as string),
      message: config.trust_mode ? `Trust mode: ${config.trust_mode}` : 'Missing trust_mode',
    });

    // Test jwks_uri
    tests.push({
      name: 'JWKS URI present',
      passed: typeof config.jwks_uri === 'string' && (config.jwks_uri as string).startsWith('https://'),
      message: config.jwks_uri ? `JWKS URI: ${config.jwks_uri}` : 'Missing or invalid jwks_uri',
    });

    // Test JWKS endpoint
    if (config.jwks_uri) {
      try {
        const jwksRes = await fetch(config.jwks_uri as string);
        const jwks = await jwksRes.json() as { keys?: unknown[] };
        tests.push({
          name: 'JWKS endpoint reachable and valid',
          passed: jwksRes.ok && Array.isArray(jwks.keys) && jwks.keys.length > 0,
          message: jwksRes.ok ? `Found ${jwks.keys?.length || 0} key(s)` : `HTTP ${jwksRes.status}`,
        });
      } catch (e) {
        tests.push({
          name: 'JWKS endpoint reachable and valid',
          passed: false,
          message: `Failed: ${(e as Error).message}`,
        });
      }
    }

    // Test endpoints
    const endpoints = config.endpoints as Record<string, string> | undefined;
    const requiredEndpoints = ['issuance', 'issuance_status', 'validate', 'authorization_check'];
    for (const ep of requiredEndpoints) {
      tests.push({
        name: `Endpoint "${ep}" present`,
        passed: !!endpoints?.[ep],
        message: endpoints?.[ep] ? `URL: ${endpoints[ep]}` : `Missing endpoints.${ep}`,
      });
    }

    // Test issuance_status template
    if (endpoints?.issuance_status) {
      tests.push({
        name: 'Issuance status URL contains {id} template',
        passed: endpoints.issuance_status.includes('{id}'),
        message: endpoints.issuance_status.includes('{id}')
          ? 'Contains {id} template variable'
          : 'Missing {id} template variable',
      });
    }

    // Test issuance endpoint
    if (endpoints?.issuance) {
      try {
        const issueRes = await fetch(endpoints.issuance, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'bearer_token',
            service: { origin: 'https://test.example.com' },
            user: { email: 'test@example.com' },
            harness: { id: 'agentpass-tester' },
            task: { id: 'test_001', description: 'Compliance test' },
          }),
        });

        tests.push({
          name: 'Issuance endpoint accepts valid request',
          passed: issueRes.status === 202 || issueRes.status === 200,
          message: `HTTP ${issueRes.status}`,
        });

        if (issueRes.ok || issueRes.status === 202) {
          const issueBody = await issueRes.json() as Record<string, unknown>;
          tests.push({
            name: 'Issuance response has id field',
            passed: !!issueBody.id,
            message: issueBody.id ? `Request ID: ${issueBody.id}` : 'Missing id',
          });
          tests.push({
            name: 'Issuance response has status field',
            passed: !!issueBody.status,
            message: issueBody.status ? `Status: ${issueBody.status}` : 'Missing status',
          });

          // Test status endpoint
          if (issueBody.id && endpoints.issuance_status) {
            const statusUrl = endpoints.issuance_status.replace('{id}', issueBody.id as string);
            const statusRes = await fetch(statusUrl);
            tests.push({
              name: 'Issuance status endpoint responds',
              passed: statusRes.ok,
              message: statusRes.ok ? 'Status check succeeded' : `HTTP ${statusRes.status}`,
            });
          }
        }
      } catch (e) {
        tests.push({
          name: 'Issuance endpoint accepts valid request',
          passed: false,
          message: `Failed: ${(e as Error).message}`,
        });
      }

      // Test invalid request
      try {
        const badRes = await fetch(endpoints.issuance, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'invalid' }),
        });
        tests.push({
          name: 'Issuance endpoint rejects invalid request',
          passed: badRes.status >= 400 && badRes.status < 500,
          message: `HTTP ${badRes.status}`,
        });
      } catch (e) {
        tests.push({
          name: 'Issuance endpoint rejects invalid request',
          passed: false,
          message: `Failed: ${(e as Error).message}`,
        });
      }
    }

    // Test policy
    if (config.policy) {
      const policy = config.policy as Record<string, unknown>;
      if (policy.allow_service_authorities !== undefined) {
        tests.push({
          name: 'Policy allow_service_authorities is boolean',
          passed: typeof policy.allow_service_authorities === 'boolean',
          message: `Value: ${policy.allow_service_authorities}`,
        });
      }
    }

    // Test approval
    if (config.approval) {
      const approval = config.approval as Record<string, unknown>;
      if (approval.modes) {
        tests.push({
          name: 'Approval modes is array containing "poll"',
          passed: Array.isArray(approval.modes) && (approval.modes as string[]).includes('poll'),
          message: `Modes: ${JSON.stringify(approval.modes)}`,
        });
      }
    }
  } catch (e) {
    tests.push({
      name: 'Configuration endpoint reachable',
      passed: false,
      message: `Failed to fetch: ${(e as Error).message}`,
    });
  }

  const passCount = tests.filter(t => t.passed).length;
  return {
    type: 'authority',
    url,
    tests,
    passCount,
    failCount: tests.length - passCount,
    timestamp: new Date().toISOString(),
  };
}
