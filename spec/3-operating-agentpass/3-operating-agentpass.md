# 3. Operating AgentPass

AgentPass is where delegation requests are approved so agents can act on behalf of a User.

An AgentPass deployment exposes endpoints that Runtimes and Service Providers use to request approval and to obtain the resulting artifacts/tokens after approval.

AgentPass also logs approvals and delegated activity so organizations and Users can review what agents requested, what was granted, and what was used.

## What AgentPass Does (Non-Normative)

AgentPass defines a governance model for delegated agent authority. In typical deployments, AgentPass is responsible for:

- establishing delegation between a User and an Agent
- evaluating policy before and during delegated activity
- issuing short-lived artifacts and/or bearer tokens that represent delegated authority
- supporting revocation and oversight
- providing visibility into approvals and usage for audit and attribution

Terms such as User, Agent, and Effective Principal are defined in:

- [`../2-notational-conventions/2.1-definitions.md`](../2-notational-conventions/2.1-definitions.md)

## How This Section Fits

This section specifies how an AgentPass deployment is discovered, configured, and used over HTTP:

- [`3.1-authoritative-vs-federated.md`](3.1-authoritative-vs-federated.md) (trust modes and precedence rules)
- [`3.2-discovery.md`](3.2-discovery.md) (authoritative discovery)
- [`3.3-configuration.md`](3.3-configuration.md) (deployment configuration document)
- [`3.6-endpoints.md`](3.6-endpoints.md) (request/status/JWKS endpoints)

## Credential Types

AgentPass defines two primary credential families, each with its own flow and validation rules:

- Browser-session artifacts (bootstrap artifacts redeemed at the Service Provider):
  - Runtime flow: [`../4-integrating-agentpass-for-runtimes/4.1-agentpass-browser-sessions.md`](../4-integrating-agentpass-for-runtimes/4.1-agentpass-browser-sessions.md)
  - Service Provider behavior: [`../5-integrating-agentpass-for-service-providers/5.4-agentpass-browser-sessions.md`](../5-integrating-agentpass-for-service-providers/5.4-agentpass-browser-sessions.md)
- AgentPass Bearer Tokens (access tokens presented to Service Provider APIs):
  - Runtime flow: [`../4-integrating-agentpass-for-runtimes/4.2-agentpass-bearer-tokens.md`](../4-integrating-agentpass-for-runtimes/4.2-agentpass-bearer-tokens.md)
  - Service Provider behavior: [`../5-integrating-agentpass-for-service-providers/5.5-agentpass-bearer-tokens.md`](../5-integrating-agentpass-for-service-providers/5.5-agentpass-bearer-tokens.md)

## Optional Governance Features (Non-Normative)

Deployments may include additional governance and oversight capabilities (for example, continuous evaluation, revocation, audit streams, or step-up approvals). These features are out of scope unless explicitly specified by a normative section of this document.
