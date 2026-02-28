---
title: AgentPass Specification
---

# AgentPass Specification

Table of Contents

- [1. Introduction](#s-1)
- [2. Notational Conventions](#s-2)
  - [2.1. Definitions](#s-2-1)
- [3. Operating AgentPass](#s-3)
  - [3.1. Authoritative vs Federated](#s-3-1)
  - [3.2. Discovery](#s-3-2)
  - [3.3. Configuration](#s-3-3)
  - [3.4. Endpoints](#s-3-4)
- [4. Runtime Usage Instructions](#s-4)
  - [4.1. Initialize an AgentPass Browser Session](#s-4-1)
  - [4.2. Request an AgentPass Bearer Token](#s-4-2)
- [5. Service Provider Requirements](#s-5)
  - [5.1. Discovery](#s-5-1)
  - [5.2. Configuration](#s-5-2)
  - [5.3. AgentPass Service Provider Spec](#s-5-3)
  - [5.4. Support AgentPass Browser Sessions](#s-5-4)
  - [5.5. Support AgentPass Bearer Tokens](#s-5-5)
  - [5.6. Endpoints](#s-5-6)
    - [5.6.1. Service Provider Discovery](#s-5-6-1)
    - [5.6.2. Service Provider Configuration Endpoint](#s-5-6-2)
    - [5.6.3. Browser Session Redemption Endpoint](#s-5-6-3)
    - [5.6.4. Browser Session Initialization Endpoint](#s-5-6-4)
    - [5.6.5. Deployment Resolution Endpoint](#s-5-6-5)
    - [5.6.6. Bearer Token Redemption Endpoint](#s-5-6-6)
    - [5.6.7. Available Scopes Endpoint](#s-5-6-7)
- [Appendix A. JSON Schemas](#appendix-a)
- [Appendix B. JSON Examples](#appendix-b)

## 1. Introduction [#s-1]

AgentPass is an open specification for governed delegation of authority from Users to agents.

The specification exists to make delegated agent access interoperable and auditable across independent systems. It defines how delegation is approved, how trust is established between Authoritative and Federated AgentPass deployments, and how delegated authority is represented as delegation passes that Runtimes present to Service Providers, and how Service Providers exchange delegation passes for session credentials or bearer tokens.

## 2. Notational Conventions [#s-2]

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and
"OPTIONAL" in this document are to be interpreted as described in BCP 14
[RFC2119] [RFC8174] when, and only when, they appear in all capitals.

Unless otherwise stated:

- JSON field names are shown in monospace (for example, `user.email`).
- URI templates and endpoint name variables are shown in braces (for example, `GET {agentpass_configuration_url}`, `POST {service_provider_deployment_resolution_url}`).
- DNS names are shown using literal labels (for example, `_agentpass.{user_email_domain}`).
- Examples are non-normative.

[RFC2119]: https://www.rfc-editor.org/rfc/rfc2119
[RFC8174]: https://www.rfc-editor.org/rfc/rfc8174

### 2.1. Definitions [#s-2-1]

This section defines terms used across the AgentPass specification.

- **User:** Identity representing the account at a Service Provider that an agent is delegated to operate on behalf of. The User is the subject of delegation. Approval MAY be granted by the User or by another approver (for example, the User's manager or an automated policy system).
- **Agent:** Software identity that acts on behalf of a User.
- **Runtime:** Execution environment that requests delegation passes from AgentPass and presents them to Service Providers.
- **Service Provider:** Relying party application that accepts AgentPass delegation passes.
- **AgentPass deployment:** A deployed AgentPass instance. For a given User, acceptable deployment(s) are determined by the Service Provider (via discovery and its deployment-resolution logic); the selected deployment governs delegation policy and issues delegation passes.
- **Authoritative AgentPass:** AgentPass deployment with `trust_mode = "authoritative"`. Intended to be the source of truth for delegation policy for one or more User email domains. Discoverable via the `_agentpass.{user_email_domain}` DNS record, where `user_email_domain` is derived from the User email address.
- **Federated AgentPass:** AgentPass deployment with `trust_mode = "federated"`. Not discoverable via User DNS. Used only when explicitly trusted by a Service Provider (for example, when returned as a trusted option from the Deployment Resolution Endpoint (`POST {service_provider_deployment_resolution_url}`)).
- **`user.email`:** User email address the Runtime intends to sign in as. Runtime sends this to the Service Provider deployment-resolution endpoint.
- **Approver:** Entity that ultimately approves or denies a delegation request. MAY be the User, another human (for example, a manager), or an automated policy system.
- **`trust_mode`:** Trust mode of an AgentPass deployment, declared in AgentPass configuration (`GET {agentpass_configuration_url}`). Valid values: `authoritative` (authoritative for one or more User email domains; intended to be discovered via `_agentpass.{user_email_domain}` derived from `user.email`); `federated` (not authoritative; intended to be used only when explicitly trusted by Service Provider policy).
- **Delegation Pass:** Short-lived, single-use JWT issued by an AgentPass deployment representing delegated authority for a specific Service Provider. Used in both AgentPass browser session and bearer token flows. For browser sessions, the Runtime redeems the delegation pass at the Browser Session Redemption Endpoint (`POST {service_provider_redeem_browser_session_url}`). For bearer tokens, the Runtime redeems the delegation pass at the Bearer Token Redemption Endpoint (`POST {service_provider_redeem_bearer_token_url}`).
- **Bearer Token:** Delegated access token issued by a Service Provider after delegation pass redemption, presented to Service Provider APIs using `Authorization: Bearer`.
- **AgentPass Configuration URL:** HTTPS URL at which `GET` returns AgentPass configuration for an AgentPass deployment. In URI templates, written as `{agentpass_configuration_url}`.
- **Service Provider Configuration URL:** HTTPS URL at which `GET` returns Service Provider configuration for a Service Provider. In URI templates, written as `{service_provider_configuration_url}`.
- **AgentPass Configuration:** JSON document returned by `GET {agentpass_configuration_url}` that describes an AgentPass deployment's issuer identity, `trust_mode`, endpoints, and cryptographic material.
- **Service Provider Configuration:** JSON document returned by `GET {service_provider_configuration_url}` that describes Service Provider trust configuration and AgentPass integration endpoints.
- **Audience (`aud`):** Intended Service Provider recipient for a delegation pass. Service Providers MUST reject delegation passes not addressed to their own origin/identifier.
- **Scope:** Delegated permission boundary carried in delegation pass claims. Service Providers advertise available scopes via the Available Scopes Endpoint. AgentPass operators determine which scopes to approve. Approved scopes are carried as a required claim in all delegation passes. The wildcard value `*` represents all available scopes.
- **Capabilities:** Service Provider-specific expression of delegated scope (for example, operation names or permissions). Capabilities MUST be enforced by Service Providers at authorization time.
- **Effective Principal:** Combined execution identity formed by User + Agent + approved delegated scope/capabilities.
- **`issuer` (`iss`):** Identity of the issuing authority for a delegation pass. Service Providers validate issuer trust and precedence.
- **`cnf` (Confirmation):** Confirmation claim used to bind a delegation pass to a holder key or runtime key material.
- **Proof-of-Possession (PoP):** Runtime/Service Provider verification step proving the caller controls the key material referenced by `cnf`.
- **SSE (Server-Sent Events):** One-way streaming mechanism over HTTP used by AgentPass implementations for optional request status push updates.
- **Available Scopes Endpoint:** Authenticated Service Provider endpoint (`POST {service_provider_available_scopes_url}`) that returns scopes available for a given User and Agent. AgentPass authenticates using a signed JWT assertion.
- **Bearer Token Redemption Endpoint:** Service Provider endpoint (`POST {service_provider_redeem_bearer_token_url}`) that accepts a bearer-token delegation pass and returns a bearer token.
- **`initialization_url`:** Short-lived, single-use URL returned by a Service Provider after delegation pass redemption and used to establish an agent-attributed browser session.
- **Single-use:** Credential or URL property indicating one-time redeemability. Subsequent redemption attempts MUST be rejected.

## 3. Operating AgentPass [#s-3]

AgentPass governs delegation approvals so agents can act on behalf of a User.

An AgentPass deployment exposes endpoints used by Runtimes and Service Providers to request approval and obtain delegation passes after approval.

Deployments typically log approvals and delegated activity for review, audit, and attribution.

Non-Normative: Typical responsibilities:

- Establish delegation between a User and an Agent.
- Evaluate policy before and during delegated activity.
- Issue short-lived delegation passes representing delegated authority.
- Support revocation and oversight.
- Provide visibility into approvals and usage for audit and attribution.

Terminology:

- See Section 2.1.

This section specifies how an AgentPass deployment is discovered, configured, and used over HTTP:

- Trust modes: Section 3.1.
- Discovery: Section 3.2.
- Configuration document: Section 3.3.
- Endpoints: Section 3.4.

Credential families:

- Delegation passes: Runtime flow (Sections 4.1, 4.2); Service Provider behavior (Sections 5.4, 5.5).
- Bearer tokens: issued by Service Providers after delegation pass redemption (Section 5.5).

Optional governance features (Non-Normative):

- Deployments may provide additional governance and oversight (for example, continuous evaluation, revocation, audit streams, or step-up approvals).
- These features are out of scope unless specified by a normative section of this document.

### 3.1. Authoritative vs Federated [#s-3-1]

Each AgentPass deployment operates in one of two trust modes:

- `authoritative`
- `federated`

An AgentPass deployment MUST declare its `trust_mode` in its configuration (`GET {agentpass_configuration_url}`).

#### 3.1.1. Authoritative Trust Mode

`trust_mode = "authoritative"` (an **Authoritative AgentPass**) is intended for organizations that need enterprise control over how their members delegate to agents, including policy enforcement, approval control, and auditable attribution.

To prove its authority, an Authoritative AgentPass MUST publish an authoritative discovery DNS TXT record for each User email domain it serves (`_agentpass.{user_email_domain}`) (Section 3.2).

#### 3.1.2. Federated Trust Mode

`trust_mode = "federated"` (a **Federated AgentPass**) is intended as a fallback when an Authoritative AgentPass does not exist for the User email domain, and the Service Provider elects to trust one or more Federated AgentPasses by policy.

Federated AgentPass deployments MAY be operated by any party that can obtain delegation approval from the User, so long as the Service Provider trusts them to do so. Operators are expected to include, but are not limited to:

- the Service Provider
- the Runtime
- independent authorization applications

Federated AgentPass deployments are high-trust dependencies and MUST be explicitly defined in the Service Provider Configuration to be trusted.

### 3.2. Discovery [#s-3-2]

All information that Service Providers and Runtimes need to interact with an AgentPass deployment is obtained by fetching the deployment's configuration document from its **AgentPass Configuration URL** (`GET {agentpass_configuration_url}`).

This section defines how an AgentPass Configuration URL is discovered.

The configuration document returned by `GET {agentpass_configuration_url}` is defined in Section 3.3.

#### 3.2.1. Authoritative AgentPass Discovery

For a given User email domain, there can be at most one Authoritative AgentPass.

If an Authoritative AgentPass exists for a User email domain, its AgentPass Configuration URL MUST be discoverable via DNS TXT lookup at:

- `_agentpass.{user_email_domain}`

Where `user_email_domain` is derived from `user.email` (the domain portion of the email address).

The TXT value MUST be either:

- an `https://` URL (the **AgentPass Configuration URL** `{agentpass_configuration_url}`), or
- the literal string `none` to explicitly disable delegation for that domain.

If the TXT value is a URL, clients MUST fetch the configuration document by calling:

- `GET {agentpass_configuration_url}`

If the TXT value is `none`, clients MUST treat authoritative discovery as successful-but-disabled and MUST NOT fall back to a federated deployment.

**Parsing**

Clients MUST reject records that are neither an `https://` URL nor `none`.

If multiple TXT values exist for a lookup name, clients SHOULD fail unless exactly one value parses successfully.

**Security notes**

DNS discovery is a bootstrap mechanism and should not be treated as strong identity proof in the absence of DNSSEC.

Clients SHOULD validate DNSSEC when available.

#### 3.2.2. Federated AgentPass Discovery

Federated AgentPass deployments are not discoverable via User email domain DNS.

Operators of Federated AgentPass deployments MUST share the AgentPass Configuration URL with Service Providers out-of-band if they want the deployment to be considered for trust by Service Provider policy.

### 3.3. Configuration [#s-3-3]

This section defines the JSON configuration document returned by an **AgentPass Configuration URL**.

For readability, this spec uses the following endpoint name variables derived from this configuration document:

- `{agentpass_request_create_url}` = `endpoints.request_create`
- `{agentpass_request_status_url_template}` = `endpoints.request_status`
- `{agentpass_request_events_url_template}` = `endpoints.request_events`

#### Example Configuration (Non-Normative)

```json
{
  "issuer": "https://agentpass.example.com",
  "trust_mode": "authoritative",
  "jwks_uri": "https://agentpass.example.com/.well-known/jwks.json",
  "endpoints": {
    "request_create": "https://agentpass.example.com/requests",
    "request_status": "https://agentpass.example.com/requests/{id}",
    "request_events": "https://agentpass.example.com/requests/{id}/events"
  },
  "approval": {
    "modes": ["poll", "sse"],
    "default_ttl_seconds": 300
  }
}
```

#### Field Reference

- `issuer` (required): HTTPS issuer identifier used for bearer token `iss` and trust decisions.
- `trust_mode` (required): `"authoritative"` or `"federated"`.
- `jwks_uri` (required): JWKS URL used to validate signatures for delegation passes.
- `endpoints` (required): endpoints used by clients to create requests and retrieve request status.
- `endpoints.request_create` (required): `POST` request-creation endpoint.
- `endpoints.request_status` (required): request-status lookup URL template (includes `{id}`).
- `endpoints.request_events` (optional): SSE events URL template (includes `{id}`).
- `approval` (optional): non-normative approval hints.
- `approval.modes` (optional): supported approval modes (`poll`, `sse`).
- `approval.default_ttl_seconds` (optional): default request TTL hint.

JSON schema: see `authority-configuration.schema.json` (Appendix A).

### 3.4. Endpoints [#s-3-4]

AgentPass endpoint URLs are obtained from the AgentPass configuration document (`GET {agentpass_configuration_url}`) (Section 3.3).

This section defines the following endpoints by name:

- **Request Create Endpoint** (`POST`): `endpoints.request_create` -> `{agentpass_request_create_url}`
- **Request Status Endpoint** (`GET`): `endpoints.request_status` -> `{agentpass_request_status_url_template}`
- **Request Events Endpoint** (`GET`, optional): `endpoints.request_events` -> `{agentpass_request_events_url_template}`

- [3.4.1. Request Create Endpoint](#s-3-4-1)
- [3.4.2. Request Status Endpoint](#s-3-4-2)
- [3.4.3. Request Events Endpoint (Optional)](#s-3-4-3)

#### 3.4.1. Request Create Endpoint [#s-3-4-1]

Creates an authority request for delegated access.

Endpoint URL is provided by AgentPass configuration:

- `endpoints.request_create` -> `POST {agentpass_request_create_url}`

Supported request types:

- AgentPass browser sessions (`type=service_signin_bootstrap`)
- AgentPass bearer tokens (`type=service_bearer_token`)

Schema: `request-create` (Appendix A).

**Request**

Client MUST send JSON body conforming to `request-create` schema.

Required fields:

- `type`
- `service.origin`
- `user.sub`
- `user.email`
- `agent.id`

Runtime typically obtains the selected deployment AgentPass Configuration URL (`agentpass_configuration_url`) from the Service Provider Deployment Resolution Endpoint (`POST {service_provider_deployment_resolution_url}`) response.

For AgentPass browser sessions requests, client SHOULD include `intent.destination_url` when available.

**Response**

Authority SHOULD respond `202 Accepted` with request status payload.

Response payload MUST conform to the `request-status` schema (Appendix A).

Authority MAY return immediate terminal status when policy decision is already known.

When `status = approved`:

- Response MUST include `delegation_pass` regardless of request type.

For browser sessions requests (`type=service_signin_bootstrap`), `delegation_pass.value` is a JWT per the delegation pass profile in Section 5.4.

For bearer-token requests (`type=service_bearer_token`), `delegation_pass.value` is a JWT per the delegation pass profile in Section 5.5.

**Errors**

Authority SHOULD return structured JSON errors.

Suggested status classes:

- `400` malformed request
- `401` runtime authentication/proof failure
- `403` policy rejection
- `409` request conflict
- `422` semantically invalid request
- `429` rate limited

#### 3.4.2. Request Status Endpoint [#s-3-4-2]

Polls the status of a request.

Endpoint URL template is provided by AgentPass configuration:

- `endpoints.request_status` -> `GET {agentpass_request_status_url_template}`

Schema: `request-status` (Appendix A).

**Request**

Client sends request identifier in path: `{id}`.

**Response**

Authority MUST return JSON payload conforming to `request-status` schema.

Defined status values:

- `pending`
- `approved`
- `denied`
- `expired`
- `canceled`

Transition model:

- `pending -> approved | denied | expired | canceled`
- terminal states do not transition further

When `status = pending`, authority SHOULD include `poll_after_ms`.

When `status = approved`:

- Response MUST provide `delegation_pass`, regardless of request type.

For browser sessions requests, Runtime redeems the delegation pass at the Browser Session Redemption Endpoint (`POST {service_provider_redeem_browser_session_url}`).

For bearer-token requests, Runtime redeems the delegation pass at the Bearer Token Redemption Endpoint (`POST {service_provider_redeem_bearer_token_url}`).

**Errors**

Suggested status classes:

- `404` unknown request id
- `410` request expired and unavailable
- `429` poll rate limit exceeded

#### 3.4.3. Request Events Endpoint (Optional) [#s-3-4-3]

Optional SSE stream for request status updates.

Endpoint URL template is provided by AgentPass configuration:

- `endpoints.request_events` -> `GET {agentpass_request_events_url_template}`

**Request**

Client requests `text/event-stream` for a request id.

**Event model**

Authority MAY emit event type `request_status` with `data` containing a payload conforming to the `request-status` schema (Appendix A).

Event stream SHOULD include each state transition for the request.

When a terminal state is emitted (`approved`, `denied`, `expired`, `canceled`), authority SHOULD close the stream.

**Client behavior**

Polling remains REQUIRED for interoperability.

Clients MAY consume SSE for lower latency, but MUST tolerate disconnects and resume via the Request Status Endpoint (`GET {agentpass_request_status_url_template}`).

**Errors**

If SSE is unsupported, authority SHOULD return `404` or `501`.

## 4. Runtime Usage Instructions [#s-4]

This section is for Runtime implementers that request and present AgentPass credentials on behalf of Users.

Examples include agent runtimes and coding agents such as Codex, Claude Code, OpenClaw, and similar execution environments.

The Runtime integration model is organized into two flows:

This section defines the Runtime requirements for browser-session initialization and bearer-token acquisition.

In this section:

- [4.1. Initialize an AgentPass Browser Session](#s-4-1)
- [4.2. Request an AgentPass Bearer Token](#s-4-2)

### 4.1. Initialize an AgentPass Browser Session [#s-4-1]

This section defines the normative Runtime flow for AgentPass browser sessions.

#### Flow Context

This flow applies when a Runtime needs an agent-attributed browser session at a Service Provider.

The flow uses:

- authority request endpoints from Section 3.4
- Service Provider deployment-resolution and bootstrap endpoints from Section 5.4 and 5.6.5

#### Step 1: Gather Required Inputs

Before resolving authority, Runtime MUST have:

- `user.email`
- `agent.id`
- Service Provider origin (audience)

Before creating the authority request, Runtime MUST also have:

- `user.sub` (stable User subject identifier)
- User email domain (derived from `user.email`)

Runtime MAY include:

- destination URL intent
- runtime confirmation key material (`cnf`)

#### Step 2: Discover Service Provider

Runtime MUST perform Service Provider discovery:

1. DNS query `_agentpass-service.{service_host}` TXT to resolve `service_provider_configuration_url`.
2. `GET {service_provider_configuration_url}` to fetch Service Provider configuration.

Discovery rules are defined in Section 5.6.1.

#### Step 3: Resolve Deployment Through Service Provider

Runtime MUST call:

- the Deployment Resolution Endpoint: `POST {service_provider_deployment_resolution_url}`

Request MUST include:

- `request.user.email`

Response MUST include:
- one of:
  - `response.authoritative_deployment`, or
  - `response.trusted_federated_deployments`

If `response.authoritative_deployment` is present:

- Runtime MUST use it as the selected deployment.
- Runtime MUST NOT use a federated deployment.

If `response.trusted_federated_deployments` is present:

- Runtime MUST choose exactly one deployment from that list (typically by asking a human operator which provider they prefer).
- Runtime MUST NOT use a deployment outside that list.

Runtime MUST NOT perform direct authoritative discovery as part of this flow.

#### Step 4: Perform Trust Compatibility Pre-Check

Runtime SHOULD verify selected deployment against Service Provider trust configuration when present.

- If `trust.accepted_authorities` is present and `response.authoritative_deployment` is present, the selected deployment issuer MUST be in that set.
- If these fields are absent, Runtime MAY proceed, but Service Provider remains final enforcement point.

#### Step 5: Create Browser Sessions Request

Runtime MUST call:

- the AgentPass Request Create Endpoint: `POST {agentpass_request_create_url}`

Where `agentpass_request_create_url` is obtained by fetching AgentPass configuration from the selected deployment `agentpass_configuration_url` returned by the Deployment Resolution Endpoint, and then using `endpoints.request_create`.

Request body MUST conform to the `request-create` schema (Appendix A).

For AgentPass browser sessions, Runtime MUST set:

- `type = "service_signin_bootstrap"`
- `service.origin`
- `user.sub`
- `user.email`
- `agent.id`

If Runtime requests holder binding, it SHOULD include `runtime.cnf`.

If Runtime has an operator-intended destination, it SHOULD include `intent.destination_url`.

#### Step 6: Poll for Approval Status

Authority MAY require approval and asynchronous processing. Approval MAY be granted by an approver other than the User (for example, a manager or an automated policy system).

Runtime MUST poll:

- the AgentPass Request Status Endpoint: `GET {agentpass_request_status_url_template}`

Status response MUST conform to the `request-status` schema (Appendix A).

**Status lifecycle**

Runtime MUST handle these status values:

- non-terminal: `pending`
- terminal: `approved`, `denied`, `expired`, `canceled`

Allowed transition model:

- `pending -> approved | denied | expired | canceled`
- terminal states do not transition further

**Polling behavior**

While status is `pending`, Runtime MUST continue polling until terminal state.

- If `poll_after_ms` is present, Runtime SHOULD honor it.
- If absent, Runtime SHOULD back off between polls and MUST avoid tight-loop polling.

**Approved result**

When status is `approved`, response MUST include a `delegation_pass` suitable for AgentPass browser sessions redemption.

If approved status does not include redeemable delegation pass data, Runtime MUST treat response as protocol-invalid and fail flow.

#### Step 7: Redeem Delegation Pass at Service Provider

After approval, Runtime MUST call:

- the Browser Session Redemption Endpoint: `POST {service_provider_redeem_browser_session_url}`

Request/response MUST conform to the `service-redeem-browser-session` schema (Appendix A).

Runtime MUST include:

- `request.delegation_pass` from approved authority response

Runtime SHOULD include:

- `request.runtime_proof` when proof-of-possession is required

Runtime MUST include `request.user.email` for authoritative precedence domain derivation.

#### Step 8: Initialize Browser Session

If `POST {service_provider_redeem_browser_session_url}` succeeds, Runtime receives `initialization_url`.

Runtime MUST:

- treat `initialization_url` as single-use and short-lived
- load it directly in emulated browser
- avoid prefetching, retries, or secondary sharing of URL

If browser initialization fails after URL issuance, Runtime MUST create a new request instead of reusing same URL.

#### Step 9: Handle Terminal Errors

Runtime MUST treat these outcomes as terminal failures for current request:

- authority status is `denied`, `expired`, or `canceled`
- Service Provider redemption rejects delegation pass (`4xx`) or replay semantics are triggered
- initialization URL is expired or already consumed

After terminal failure, Runtime MAY start a new request with fresh identifiers.

#### Step 10: Apply Security Requirements

Runtime MUST:

- protect delegation pass and token material from logs and telemetry
- present delegation passes only to intended Service Provider origin
- bind requests to holder key material when required by authority/Service Provider policy
- preserve User + Agent identity attribution for downstream audit

### 4.2. Request an AgentPass Bearer Token [#s-4-2]

This section defines the normative Runtime flow for AgentPass bearer tokens.

#### Flow Context

This flow applies when a Runtime needs a bearer token for API access at a Service Provider.

The flow uses:

- authority request endpoints from Section 3.4
- Service Provider deployment-resolution endpoints from Section 5.6.5
- Bearer Token Redemption Endpoint from Section 5.6.6

#### Steps 1–4: Reference Section 4.1

Runtime MUST perform Steps 1 through 4 of Section 4.1 (gather inputs, discover Service Provider, resolve deployment through Service Provider, trust compatibility pre-check) to select an AgentPass deployment.

Runtime MUST NOT perform direct authoritative discovery as part of this flow.

#### Step 5: Create Bearer Token Request

Runtime MUST call:

- the AgentPass Request Create Endpoint: `POST {agentpass_request_create_url}`

Where `agentpass_request_create_url` is obtained by fetching AgentPass configuration from the selected deployment `agentpass_configuration_url` returned by the Deployment Resolution Endpoint, and then using `endpoints.request_create`.

Request body MUST conform to the `request-create` schema (Appendix A).

For AgentPass bearer tokens, Runtime MUST set:

- `type = "service_bearer_token"`
- `service.origin`
- `user.sub`
- `user.email`
- `agent.id`

If Runtime requests holder binding, it SHOULD include `runtime.cnf`.

Bearer token requests do not use `intent.destination_url`.

#### Step 6: Poll for Approval Status

Authority MAY require approval and asynchronous processing. Approval MAY be granted by an approver other than the User (for example, a manager or an automated policy system).

Runtime MUST poll:

- the AgentPass Request Status Endpoint: `GET {agentpass_request_status_url_template}`

Status response MUST conform to the `request-status` schema (Appendix A).

Runtime MUST handle status values per Section 4.1, Step 6.

When status is `approved`, response MUST include a `delegation_pass` with `type=service_bearer_token`.

If approved status does not include redeemable delegation pass data, Runtime MUST treat response as protocol-invalid and fail flow.

#### Step 7: Redeem Delegation Pass for Bearer Token

Runtime MUST call:

- the Bearer Token Redemption Endpoint: `POST {service_provider_redeem_bearer_token_url}`

Request/response MUST conform to the `service-redeem-bearer-token` schema (Appendix A).

Runtime MUST include:

- `request.delegation_pass` from approved authority response
- `request.user.email`

Runtime SHOULD include:

- `request.runtime_proof` when proof-of-possession is required

On success, Runtime receives:

- `response.bearer_token`

Runtime MAY use:

- `response.scope` (granted scope)
- `response.expires_in` (seconds until token expiration)

#### Step 8: Call Service Provider API

Runtime MUST present the bearer token using:

- `Authorization: Bearer {bearer_token}`

Runtime MUST treat `bearer_token` as opaque. The bearer token format is determined by the Service Provider.

#### Step 9: Handle Terminal Errors

Runtime MUST treat these outcomes as terminal failures for current request:

- authority status is `denied`, `expired`, or `canceled`
- Service Provider redemption rejects delegation pass (`4xx`) or replay semantics are triggered

After terminal failure, Runtime MAY start a new request with fresh identifiers.

#### Step 10: Apply Security Requirements

Runtime MUST:

- protect delegation pass and bearer token material from logs and telemetry
- present delegation passes only to intended Service Provider origin
- bind requests to holder key material when required by authority/Service Provider policy
- preserve User + Agent identity attribution for downstream audit

## 5. Service Provider Requirements [#s-5]

This section defines how Service Providers discover and publish configuration, enforce delegation policy, and implement required endpoints.

In this section:

- [5.1. Discovery](#s-5-1)
- [5.2. Configuration](#s-5-2)
- [5.3. AgentPass Service Provider Spec](#s-5-3)
- [5.4. Support AgentPass Browser Sessions](#s-5-4)
- [5.5. Support AgentPass Bearer Tokens](#s-5-5)
- [5.6. Endpoints](#s-5-6)

### 5.1. Discovery [#s-5-1]

This section defines how Runtimes discover a Service Provider's **Service Provider Configuration URL**.

#### Service Provider Configuration URL

Service Providers expose a base configuration URL `service_provider_configuration_url` discovered via DNS.

Given a Service Provider origin (for example, `https://service.example.com`), Runtime derives host (`service.example.com`) and queries:

- `_agentpass-service.service.example.com TXT`

The TXT value MUST be an `https://` URL. That URL is the **Service Provider Configuration URL** `service_provider_configuration_url`.

Runtime fetches the configuration document by calling:

- `GET {service_provider_configuration_url}`

TXT parsing and validation rules MUST follow Section 3.2 parsing and security requirements.

The configuration document returned by `GET {service_provider_configuration_url}` is defined in Section 5.2.

### 5.2. Configuration [#s-5-2]

This section defines the JSON configuration document returned by a **Service Provider Configuration URL**.

#### Example Configuration (Non-Normative)

```json
{
  "kind": "service",
  "service": {
    "origin": "https://api.example.com",
    "name": "Example Service"
  },
  "trust": {
    "accepted_authorities": ["https://agentpass.example.com"],
    "trusted_federated_deployments": [
      {
        "issuer": "https://codex.example.com",
        "agentpass_configuration_url": "https://codex.example.com/ap"
      }
    ]
  },
  "endpoints": {
    "resolve_deployments": "https://api.example.com/resolve-deployments",
    "redeem_browser_session": "https://api.example.com/redeem-browser-session",
    "redeem_bearer_token": "https://api.example.com/redeem-bearer-token",
    "initialize_session": "https://api.example.com/initialize-session/{token}",
    "available_scopes": "https://api.example.com/agentpass/scopes"
  },
  "session": {}
}
```

#### Field Reference

- `kind` (required): `"service"`.
- `service` (required): Service Provider identity information.
- `service.origin` (required): Service Provider origin (HTTPS).
- `service.name` (optional): human-readable service name.
- `trust` (required): trust declarations used for authoritative compatibility pre-checks and federated trust allowlisting.
- `trust.accepted_authorities` (optional): list of accepted authoritative issuers (HTTPS).
- `trust.trusted_federated_deployments` (optional): list of Federated AgentPass deployments this Service Provider is willing to trust (HTTPS).
- `endpoints` (required): Service Provider integration endpoints.
- `endpoints.resolve_deployments` (required): deployment-resolution endpoint (`POST`).
- `endpoints.redeem_browser_session` (required): browser session delegation pass redemption endpoint (`POST`).
- `endpoints.redeem_bearer_token` (required): bearer token delegation pass redemption endpoint (`POST`).
- `endpoints.initialize_session` (required): browser initialization endpoint URL template (`GET`, includes `{token}`).
- `endpoints.available_scopes` (required): available scopes endpoint (`POST`).
- `session` (optional): service-provider-specific session configuration.

JSON schema: see `service-configuration.schema.json` (Appendix A).

### 5.3. AgentPass Service Provider Spec [#s-5-3]

#### Overview

The AgentPass Service Provider spec defines how a Service Provider validates and enforces delegated authority.

#### Credential Validation

This section applies to both delegation passes (Section 5.4) and bearer tokens (Section 5.5).

A Service Provider MUST:

1. Validate credential signature
2. Validate issuer trust
3. Validate expiration
4. Enforce scope constraints

If confirmation binding is present, the Service Provider MUST validate proof-of-possession.

#### Effective Principal Construction

The Service Provider MUST construct an Effective Principal composed of:

- User
- Agent
- Delegated scope

The Service Provider MUST NOT treat the agent as equivalent to the User unless explicitly granted.

#### Audit and Attribution

Service Providers SHOULD:

- Log both User and Agent identifiers
- Surface delegated activity distinctly
- Support activity callbacks to AgentPass where feasible

For AgentPass delegation passes, User and Agent identifiers are carried in delegation pass claims as defined in Sections 5.4 and 5.5.

#### Deployment Resolution

Service Provider MUST provide a deployment-resolution endpoint per Section 5.6.5.

#### Endpoints

- Section 5.4 — AgentPass browser sessions delegation pass redemption and initialization URL flow
- Section 5.5 — AgentPass bearer tokens delegation pass redemption and bearer token issuance flow

### 5.4. Support AgentPass Browser Sessions [#s-5-4]

This section defines Service Provider behavior for AgentPass browser sessions.

#### Endpoints

Service Providers expose a base endpoint `service_provider_configuration_url` discovered via DNS and configuration.

- `GET {service_provider_configuration_url}` returns Service Provider configuration.
- Deployment Resolution Endpoint: `POST {service_provider_deployment_resolution_url}` resolves acceptable AgentPass deployment(s) for a User email.
- Browser Session Redemption Endpoint: `POST {service_provider_redeem_browser_session_url}` redeems a delegation pass.
- Browser Session Initialization Endpoint: `GET {service_provider_session_initialization_url_template}` establishes browser session and redirects.

#### Delegation Pass Profile (Normative)

For AgentPass browser session flows, delegation pass `value` MUST be a JWT secured as JWS (signed JWT). Service Providers MUST validate delegation pass signatures using the issuing deployment's published keys (JWKS), obtained from the deployment configuration `jwks_uri` (Section 3.3).

**Required claims**

A delegation pass MUST include:

- `iss` (string): the issuer — the AgentPass deployment. Service Provider MUST validate this equals the deployment `issuer` from `GET {agentpass_configuration_url}` and MUST enforce authoritative precedence per Section 5.6.5.
- `aud` (string or array of strings): the intended recipient — the Service Provider origin. Service Provider MUST validate this matches the Service Provider (see definition of Audience (`aud`) in Section 2.1).
- `exp` (number): expiration time.
- `iat` (number): issuance time.
- `jti` (string): unique identifier for single-use enforcement.
- `sub` (string): the delegated User identifier. This MUST equal the Runtime-provided `request.user.sub` value from the Request Create Endpoint (`POST {agentpass_request_create_url}`).
- `agent` (object): agent identity context. This MUST include:
  - `agent.id` (string): the delegated Agent identifier. This MUST equal the Runtime-provided `request.agent.id` value from the Request Create Endpoint (`POST {agentpass_request_create_url}`).
- `scope` (string or array of strings): approved delegated permission boundary. The wildcard value `*` represents all available scopes.

**Optional claims**

A delegation pass MAY include:

- `cnf` (object): confirmation for holder binding (see `cnf` definition in Section 2.1). If `cnf` is present, Service Provider MUST require proof-of-possession.
- `destination_url` (string): approved destination URL for browser redirect.

**Single-use enforcement**

Service Providers MUST track `jti` to enforce single-use semantics and MUST reject previously redeemed passes.

#### Decoded Delegation Pass Claims Example (Non-Normative)

```json
{
  "iss": "https://agentpass.example.com",
  "aud": "https://api.example.com",
  "iat": 1771041600,
  "exp": 1771041900,
  "jti": "dp_8f3a1b2c-4d5e-6f7a-8b9c-0d1e2f3a4b5c",
  "sub": "user:colin",
  "agent": { "id": "agent:build-bot-7f2c" },
  "scope": ["dashboard:view", "tickets:read"],
  "destination_url": "https://api.example.com/dashboard"
}
```

#### Deployment Resolution Endpoint Contract

Service Provider MUST implement the Deployment Resolution Endpoint per Section 5.6.5. Request/response MUST conform to the `service-authority-resolution` schema (Appendix A).

#### Browser Session Redemption Endpoint Request Contract

Request/response MUST conform to the `service-redeem-browser-session` schema (Appendix A).

**Required request fields**

Service Provider MUST require:

- `request.delegation_pass.type`
- `request.delegation_pass.value`
- `request.user.email`

Service Provider SHOULD accept:

- `request.runtime_proof`

**Validation algorithm**

Service Provider MUST perform all checks before issuing `initialization_url`:

1. Protocol validation (required fields, parseability).
2. Delegation pass integrity validation: verify JWS signature using the issuing deployment's JWKS (`jwks_uri` from Section 3.3).
3. Delegation pass freshness (`exp`) and single-use status (track `jti` to reject previously redeemed passes).
4. Audience validation: delegation pass `aud` MUST target this Service Provider origin.
5. Issuer trust validation against Service Provider trust policy.
6. Authoritative precedence enforcement per Section 5.6.5.
7. Scope validation: verify `scope` claim contains scopes the Service Provider supports (or `*`).
8. Runtime proof validation when delegation pass or policy requires holder binding.
9. Destination validation against Service Provider allow-policy.

If any check fails, Service Provider MUST reject redemption and MUST NOT mint initialization state.

The delegation pass `sub` claim carries the delegated User identifier.

#### Browser Session Redemption Endpoint Response Contract

On success, Service Provider MUST return:

- `response.initialization_url`

Service Provider SHOULD return:

- `response.expires_at`
- `response.one_time = true`

**Initialization URL requirements**

`initialization_url` MUST be:

- single-use
- short-lived
- bound to the approved delegation pass redemption context

Service Provider MUST generate initialization state atomically with single-use marking to prevent replay races.

#### Browser Session Initialization Endpoint

When handling initialization token, Service Provider MUST:

1. Verify token exists, is unexpired, and is unused.
2. Consume token atomically as used before session finalization.
3. Establish an agent-attributed session for the approved User.
4. Enforce approved destination constraints before redirect.

Service Provider MUST reject:

- unknown token
- expired token
- already-consumed token

Service Provider MUST NOT allow re-use after first successful or failed terminal consumption attempt.

#### Error Handling

For redemption and initialization endpoints, Service Provider SHOULD return structured JSON errors.

At minimum, error responses SHOULD include:

- machine-readable `code`
- human-readable `message`

Suggested classes:

- `400` malformed request
- `401` invalid runtime proof (when applicable)
- `403` trust or policy rejection
- `409` single-use conflict / replay
- `410` expired or consumed initialization token
- `422` semantically invalid delegation pass

#### Browser and Session Security

Service Provider MUST:

- issue session cookies with secure attributes appropriate for browser security
- prevent open redirect behavior
- set response controls to avoid caching of one-time initialization material

Service Provider SHOULD ensure initialization endpoints are resistant to CSRF and token leakage via referrer or logs.

#### Audit and Attribution

Service Providers SHOULD log:

- request identifier
- User identifier
- Agent identifier
- authority issuer
- runtime identifier (when available)
- redemption/initialization outcome

### 5.5. Support AgentPass Bearer Tokens [#s-5-5]

This section defines Service Provider behavior for AgentPass bearer token flows.

For bearer-token flows, Service Providers MUST expose and enforce the same deployment-resolution behavior defined for browser sessions (the Deployment Resolution Endpoint per Section 5.6.5).

#### Delegation Pass Profile for Bearer Token Flows (Normative)

For AgentPass bearer token flows, delegation pass `value` MUST be a JWT secured as JWS (signed JWT). Service Providers MUST validate delegation pass signatures using the issuing deployment's published keys (JWKS), obtained from the deployment configuration `jwks_uri` (Section 3.3).

**Required claims**

A delegation pass for bearer token flows MUST include:

- `iss` (string): the issuer — the AgentPass deployment. Service Provider MUST validate this equals the deployment `issuer` from `GET {agentpass_configuration_url}` and MUST enforce authoritative precedence per Section 5.6.5.
- `aud` (string or array of strings): the intended recipient — the Service Provider origin. Service Provider MUST validate this matches the Service Provider (see definition of Audience (`aud`) in Section 2.1).
- `exp` (number): expiration time.
- `iat` (number): issuance time.
- `jti` (string): unique identifier for single-use enforcement.
- `sub` (string): the delegated User identifier. This MUST equal the Runtime-provided `request.user.sub` value from the Request Create Endpoint (`POST {agentpass_request_create_url}`).
- `agent` (object): agent identity context. This MUST include:
  - `agent.id` (string): the delegated Agent identifier. This MUST equal the Runtime-provided `request.agent.id` value from the Request Create Endpoint (`POST {agentpass_request_create_url}`).
- `scope` (string or array of strings): approved delegated permission boundary. The wildcard value `*` represents all available scopes.

**Optional claims**

A delegation pass for bearer token flows MAY include:

- `cnf` (object): confirmation for holder binding (see `cnf` definition in Section 2.1). If `cnf` is present, Service Provider MUST require proof-of-possession.

Bearer token delegation passes do not use `destination_url` (browser-session-specific).

**Single-use enforcement**

Service Providers MUST track `jti` to enforce single-use semantics and MUST reject previously redeemed passes.

#### Decoded Delegation Pass Claims Example (Non-Normative)

```json
{
  "iss": "https://agentpass.example.com",
  "aud": "https://api.example.com",
  "iat": 1771041600,
  "exp": 1771041900,
  "jti": "dp_b2c3d4e5-6f7a-8b9c-0d1e-2f3a4b5c6d7e",
  "sub": "user:colin",
  "agent": { "id": "agent:build-bot-7f2c" },
  "scope": ["tickets:read", "tickets:comment"]
}
```

#### Bearer Token Redemption Endpoint Contract

Request/response MUST conform to the `service-redeem-bearer-token` schema (Appendix A).

**Required request fields**

Service Provider MUST require:

- `request.delegation_pass.type` (`"service_bearer_token"`)
- `request.delegation_pass.value`
- `request.user.email`

Service Provider SHOULD accept:

- `request.runtime_proof`

**Validation algorithm**

Service Provider MUST perform all checks before issuing a bearer token:

1. Protocol validation (required fields, parseability).
2. Delegation pass integrity validation: verify JWS signature using the issuing deployment's JWKS (`jwks_uri` from Section 3.3).
3. Delegation pass freshness (`exp`) and single-use status (track `jti` to reject previously redeemed passes).
4. Audience validation: delegation pass `aud` MUST target this Service Provider origin.
5. Issuer trust validation against Service Provider trust policy.
6. Authoritative precedence enforcement per Section 5.6.5.
7. Scope validation: verify `scope` claim contains scopes the Service Provider supports (or `*`).
8. Runtime proof validation when delegation pass or policy requires holder binding.

If any check fails, Service Provider MUST reject redemption and MUST NOT issue a bearer token.

The delegation pass `sub` claim carries the delegated User identifier.

#### Redemption Response

On success, Service Provider MUST return:

- `response.bearer_token`

Service Provider SHOULD return:

- `response.scope` (granted scope; MUST NOT exceed delegation pass `scope`)
- `response.expires_in` (seconds until token expiration)

The bearer token format is determined by the Service Provider (JWT, opaque, etc.). Runtimes MUST treat `bearer_token` as opaque.

The granted scope MUST NOT exceed the delegation pass `scope`.

#### Audit and Attribution

Service Providers MUST log User and Agent identifiers from validated delegation pass claims (`sub` and `agent.id`).

Service Providers SHOULD enforce authoritative precedence per Section 5.6.5.

### 5.6. Endpoints [#s-5-6]

- [5.6.1. Service Provider Discovery](#s-5-6-1)
- [5.6.2. Service Provider Configuration Endpoint](#s-5-6-2)
- [5.6.3. Browser Session Redemption Endpoint](#s-5-6-3)
- [5.6.4. Browser Session Initialization Endpoint](#s-5-6-4)
- [5.6.5. Deployment Resolution Endpoint](#s-5-6-5)
- [5.6.6. Bearer Token Redemption Endpoint](#s-5-6-6)
- [5.6.7. Available Scopes Endpoint](#s-5-6-7)

#### 5.6.1. Service Provider Discovery [#s-5-6-1]

Service Provider discovery uses DNS TXT bootstrap and HTTPS configuration fetch.

Given a Service Provider origin (for example, `https://service.example.com`), Runtime derives host (`service.example.com`) and queries:

- `_agentpass-service.service.example.com TXT`

Example value:

```txt
https://service.example.com/ap
```

Runtime then fetches:

- `GET {service_provider_configuration_url}` -> Service Provider configuration

TXT parsing and validation rules MUST follow Section 3.2 parsing and security requirements.

#### 5.6.2. Service Provider Configuration Endpoint [#s-5-6-2]

Returns the Service Provider configuration document.

Schema: `service-configuration` (Appendix A).

**Request**

Client issues `GET {service_provider_configuration_url}` resolved from Service Provider discovery.

Client SHOULD send `Accept: application/json`.

**Response**

Service Provider MUST return JSON configuration with:

- `kind = "service"`
- `service.origin`
- `trust`
- `endpoints`

**Trust declaration**

`trust.accepted_authorities` (optional) lists authoritative issuers the Service Provider is willing to accept.

`trust.trusted_federated_deployments` (optional) lists Federated AgentPass deployments the Service Provider is willing to trust. Returned federated options from the Deployment Resolution Endpoint (`POST {service_provider_deployment_resolution_url}`) MUST be a subset of this list.

Service Providers enforcing authoritative precedence MUST apply rules from Section 5.6.5.

**Endpoint declaration**

For readability, this spec uses the following endpoint name variables derived from this configuration document:

- `{service_provider_deployment_resolution_url}` = `endpoints.resolve_deployments`
- `{service_provider_redeem_browser_session_url}` = `endpoints.redeem_browser_session`
- `{service_provider_redeem_bearer_token_url}` = `endpoints.redeem_bearer_token`
- `{service_provider_session_initialization_url_template}` = `endpoints.initialize_session`
- `{service_provider_available_scopes_url}` = `endpoints.available_scopes`

`endpoints.redeem_browser_session`:

- absolute HTTPS URL for `POST` browser session delegation pass redemption

`endpoints.redeem_bearer_token`:

- absolute HTTPS URL for `POST` bearer token delegation pass redemption

`endpoints.available_scopes`:

- absolute HTTPS URL for `POST` available scopes requests

`endpoints.initialize_session`:

- absolute HTTPS URL template for browser initialization
- template variable `{token}` identifies initialization token

`endpoints.resolve_deployments`:

- absolute HTTPS URL for Runtime deployment-resolution requests
- accepts User email and returns acceptable AgentPass deployment selection data

**Consumer behavior**

Runtimes MUST use the Service Provider deployment-resolution endpoint (not direct authoritative discovery) to obtain acceptable deployment selection for browser-session and bearer-token flows.

Service Providers remain the final policy and trust enforcement point at redemption and initialization time.

**Errors**

Suggested status classes:

- `404` endpoint not found
- `406` unsupported `Accept`
- `5xx` transient Service Provider failure

#### 5.6.3. Browser Session Redemption Endpoint [#s-5-6-3]

Redeems an AgentPass browser sessions delegation pass and returns a single-use `initialization_url`.

Schema: `service-redeem-browser-session` (Appendix A).

Endpoint URL is provided by Service Provider configuration:

- `endpoints.redeem_browser_session` -> `POST {service_provider_redeem_browser_session_url}`

**Request**

Service Provider MUST accept JSON body conforming to `service-redeem-browser-session` request schema.

Required fields:

- `request.delegation_pass.type`
- `request.delegation_pass.value`
- `request.user.email`

Service Provider SHOULD accept:

- `request.runtime_proof`

**Validation requirements**

Service Provider MUST validate the delegation pass per the validation algorithm in Section 5.4.

**Response**

On success, Service Provider MUST return JSON conforming to `service-redeem-browser-session` response schema, including:

- `response.initialization_url`

**Errors**

Suggested status classes:

- `400` malformed request
- `401` runtime proof failure
- `403` trust/policy rejection
- `409` replay/single-use conflict
- `422` invalid delegation pass

#### 5.6.4. Browser Session Initialization Endpoint [#s-5-6-4]

Single-use browser entrypoint that establishes a session and redirects to the approved destination.

Endpoint URL template is provided by Service Provider configuration:

- `endpoints.initialize_session` -> `GET {service_provider_session_initialization_url_template}`

**Request**

Initialization token is supplied via path parameter `{token}`.

**Service Provider behavior**

Service Provider MUST:

1. Validate token exists, is unexpired, and is unused.
2. Consume token atomically as used.
3. Establish agent-attributed browser session for approved User.
4. Redirect only to approved destination.

Service Provider MUST reject unknown, expired, or already-used tokens.

Service Provider MUST NOT allow token reuse.

**Success response**

Service Provider SHOULD return HTTP redirect (`302` or `303`) to approved destination after session establishment.

**Errors**

Suggested status classes:

- `400` malformed token
- `404` unknown token
- `410` expired or consumed token

#### 5.6.5. Deployment Resolution Endpoint [#s-5-6-5]

Resolves the acceptable AgentPass deployment(s) for a User email address.

Schema: `service-authority-resolution` (Appendix A).

Examples: see Appendix B.

**Request**

Endpoint URL is provided by Service Provider configuration:

- `endpoints.resolve_deployments` -> `POST {service_provider_deployment_resolution_url}`

Service Provider MUST accept JSON body containing:

- `request.user.email`

**Service Provider behavior**

Service Provider MUST:

1. Derive the User email domain from the email domain portion of `request.user.email`.
2. Determine whether the derived User email domain has an Authoritative AgentPass by performing authoritative discovery for that domain (`_agentpass.{user_email_domain}`) (Section 3.2).
3. If authoritative discovery returns a URL and the discovered Authoritative AgentPass configuration can be fetched and validated, return that authoritative deployment.
4. If authoritative discovery returns `none`, or if authoritative discovery returns a URL but the discovered configuration cannot be fetched or validated, reject the request and MUST NOT return Federated AgentPass deployment options.
5. If authoritative discovery does not resolve (no DNS record), return only trusted Federated AgentPass deployment options that are explicitly defined in Service Provider Configuration (`trust.trusted_federated_deployments`) and selected by Service Provider policy.

Service Provider MUST NOT return federated options when authoritative discovery returns a usable authoritative deployment.
If a User email domain has an Authoritative AgentPass, Service Provider MUST only authorize agents delegated by that Authoritative AgentPass.

**Authoritative precedence rule (normative)**

Service Providers MUST enforce the authoritative precedence behavior above when accepting delegation passes for a User email domain:

- If authoritative discovery returns `none`, Service Provider MUST reject delegation for that User and MUST NOT fall back to a Federated AgentPass.
- If authoritative discovery returns a URL but configuration fetch or validation fails, Service Provider MUST reject delegation for that User and MUST NOT fall back to a Federated AgentPass.
- If authoritative discovery returns a usable Authoritative AgentPass configuration, Service Provider MUST accept only delegation passes whose `iss` equals the resolved Authoritative AgentPass `issuer`, and whose signatures validate using the resolved Authoritative AgentPass configuration (`jwks_uri`) (Section 3.3).
- If authoritative discovery does not resolve (no DNS record), Service Provider MUST accept only delegation passes issued by Federated AgentPass deployments it explicitly defined in Service Provider Configuration and selected by policy (for example, deployments returned in `response.trusted_federated_deployments`).

**Response**

Response includes:

If authoritative discovery returns a URL and the discovered configuration can be fetched and validated:

- `response.authoritative_deployment` MUST be present.

If authoritative discovery does not resolve (no DNS record):

- `response.trusted_federated_deployments` MUST be present and non-empty.
- each returned Federated AgentPass deployment MUST be explicitly defined in Service Provider Configuration (`trust.trusted_federated_deployments`).
- each returned Federated AgentPass deployment MUST be explicitly selected by Service Provider policy.

Service Provider MUST treat federated providers as high-trust dependencies and MUST NOT return implicit federated options.

**Errors**

Suggested status classes:

- `400` malformed request or invalid email
- `404` no authoritative provider and no trusted federated options
- `403` authoritative precedence enforcement rejection (for example, discovery returns `none`)
- `502` authoritative discovery configuration fetch/validation failure
- `422` semantically invalid resolution request
- `5xx` transient Service Provider failure

#### 5.6.6. Bearer Token Redemption Endpoint [#s-5-6-6]

Redeems an AgentPass bearer token delegation pass and returns a bearer token.

Schema: `service-redeem-bearer-token` (Appendix A).

Endpoint URL is provided by Service Provider configuration:

- `endpoints.redeem_bearer_token` -> `POST {service_provider_redeem_bearer_token_url}`

**Request**

Service Provider MUST accept JSON body conforming to `service-redeem-bearer-token` request schema.

Required fields:

- `request.delegation_pass.type` (`"service_bearer_token"`)
- `request.delegation_pass.value`
- `request.user.email`

Service Provider SHOULD accept:

- `request.runtime_proof`

**Validation requirements**

Service Provider MUST validate the delegation pass per the validation algorithm in Section 5.5.

**Response**

On success, Service Provider MUST return:

- `response.bearer_token`

Service Provider SHOULD return:

- `response.scope` (granted scope; MUST NOT exceed delegation pass `scope`)
- `response.expires_in` (seconds until token expiration)

**Errors**

Suggested status classes:

- `400` malformed request
- `401` runtime proof failure
- `403` trust/policy rejection
- `409` replay/single-use conflict
- `422` invalid delegation pass

#### 5.6.7. Available Scopes Endpoint [#s-5-6-7]

Returns the set of scopes a Service Provider supports for AgentPass delegation, given a User and Agent context.

Schema: `service-available-scopes` (Appendix A).

Endpoint URL is provided by Service Provider configuration:

- `endpoints.available_scopes` -> `POST {service_provider_available_scopes_url}`

**Authentication**

AgentPass MUST authenticate using a signed JWT assertion. The assertion MUST be a JWS signed with the AgentPass deployment's keys (from `jwks_uri`).

Required assertion claims:

- `iss` (string): the AgentPass deployment issuer (MUST equal `issuer` from `GET {agentpass_configuration_url}`).
- `aud` (string): the Service Provider origin.
- `iat` (number): issuance time.
- `exp` (number): expiration time (SHOULD be short-lived).

The assertion MUST be presented in the `Authorization` header:

- `Authorization: Bearer {assertion_jwt}`

Service Provider MUST validate the assertion signature using the AgentPass deployment's published keys (JWKS), obtained by discovering the deployment configuration from the assertion `iss` and fetching its `jwks_uri`.

Service Provider MUST reject requests with missing, expired, or invalid assertions.

**Request**

AgentPass MUST send a JSON body containing:

- `user.email` (string): User email address.
- `agent.id` (string): Agent identifier (scoped to the authenticated AgentPass deployment).

**Response**

Service Provider MUST return JSON conforming to `service-available-scopes` schema.

Response MUST include:

- `scopes`: array of scope objects

Each scope object MUST include:

- `name` (string): scope identifier (for example, `"tickets:read"`)

Each scope object MAY include:

- `description` (string): human-readable description

Service Provider MAY return different scopes based on User, Agent, or AgentPass deployment context.

**Consumer behavior**

AgentPass operators use this endpoint to discover available scopes before determining which scopes to approve for delegation. The mechanism by which an AgentPass operator determines approved scopes is out of scope of this specification.

Approved scopes MUST be carried in the delegation pass `scope` claim.

Scope enforcement occurs at delegation pass redemption time (Sections 5.6.3, 5.6.6). The available scopes response is informational for the AgentPass operator — Service Providers enforce actual authorization at redemption.

**Errors**

Suggested status classes:

- `400` malformed request
- `401` missing or invalid assertion
- `403` untrusted AgentPass deployment
- `429` rate limited
- `5xx` transient Service Provider failure

## Appendix A. JSON Schemas [#appendix-a]

### `authority-configuration.schema.json` [#schema-authority-configuration]

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "AgentPass Deployment Configuration",
  "type": "object",
  "required": [
    "issuer",
    "trust_mode",
    "jwks_uri",
    "endpoints"
  ],
  "properties": {
    "issuer": {
      "type": "string",
      "format": "uri",
      "pattern": "^https://"
    },
    "trust_mode": {
      "type": "string",
      "enum": [
        "authoritative",
        "federated"
      ],
      "description": "Trust mode of this AgentPass deployment. If authoritative, it is discoverable via `_agentpass.{user_email_domain}` where `user_email_domain` is derived from the User email address."
    },
    "jwks_uri": {
      "type": "string",
      "format": "uri",
      "pattern": "^https://"
    },
    "endpoints": {
      "type": "object",
      "required": [
        "request_create",
        "request_status"
      ],
      "properties": {
        "request_create": {
          "type": "string",
          "pattern": "^https://"
        },
        "request_status": {
          "type": "string",
          "pattern": "^https://"
        },
        "request_events": {
          "type": "string",
          "pattern": "^https://"
        }
      },
      "additionalProperties": true
    },
    "approval": {
      "type": "object",
      "properties": {
        "modes": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": [
              "poll",
              "sse"
            ]
          },
          "uniqueItems": true
        },
        "default_ttl_seconds": {
          "type": "integer",
          "minimum": 1
        }
      },
      "additionalProperties": true
    }
  },
  "additionalProperties": true
}
```

### `request-create.schema.json` [#schema-request-create]

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "AgentPass Request Create",
  "type": "object",
  "required": [
    "agent",
    "user",
    "service",
    "type"
  ],
  "properties": {
    "type": {
      "type": "string",
      "enum": [
        "service_signin_bootstrap",
        "service_bearer_token"
      ]
    },
    "service": {
      "type": "object",
      "required": [
        "origin"
      ],
      "properties": {
        "origin": {
          "type": "string",
          "format": "uri",
          "pattern": "^https://"
        }
      },
      "additionalProperties": true
    },
    "user": {
      "type": "object",
      "required": [
        "sub",
        "email"
      ],
      "properties": {
        "sub": {
          "type": "string",
          "minLength": 1
        },
        "email": {
          "type": "string",
          "format": "email"
        }
      },
      "additionalProperties": true
    },
    "agent": {
      "type": "object",
      "required": [
        "id"
      ],
      "properties": {
        "id": {
          "type": "string",
          "minLength": 1
        }
      },
      "additionalProperties": true
    },
    "runtime": {
      "type": "object",
      "properties": {
        "instance_id": {
          "type": "string",
          "minLength": 1
        },
        "cnf": {
          "type": "object"
        }
      },
      "additionalProperties": true
    },
    "intent": {
      "type": "object",
      "properties": {
        "destination_url": {
          "type": "string",
          "format": "uri",
          "pattern": "^https://"
        }
      },
      "additionalProperties": true
    }
  },
  "additionalProperties": true
}
```

### `request-status.schema.json` [#schema-request-status]

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "AgentPass Request Status",
  "type": "object",
  "required": [
    "id",
    "status"
  ],
  "properties": {
    "id": {
      "type": "string",
      "minLength": 1
    },
    "status": {
      "type": "string",
      "enum": [
        "pending",
        "approved",
        "denied",
        "expired",
        "canceled"
      ]
    },
    "type": {
      "type": "string",
      "enum": [
        "service_signin_bootstrap",
        "service_bearer_token"
      ]
    },
    "expires_at": {
      "type": "string",
      "format": "date-time"
    },
    "poll_after_ms": {
      "type": "integer",
      "minimum": 0
    },
    "links": {
      "type": "object",
      "properties": {
        "self": {
          "type": "string",
          "format": "uri"
        },
        "events": {
          "type": "string",
          "format": "uri"
        }
      },
      "additionalProperties": true
    },
    "reason": {
      "type": "string"
    },
    "delegation_pass": {
      "type": "object",
      "required": [
        "type",
        "value"
      ],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "service_signin_bootstrap",
            "service_bearer_token"
          ]
        },
        "value": {
          "type": "string",
          "minLength": 1
        }
      },
      "additionalProperties": true
    }
  },
  "allOf": [
    {
      "if": {
        "properties": {
          "status": {
            "const": "approved"
          }
        }
      },
      "then": {
        "required": [
          "delegation_pass"
        ]
      }
    }
  ],
  "additionalProperties": true
}
```

### `service-authority-resolution.schema.json` [#schema-service-authority-resolution]

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Service Provider Deployment Resolution Request/Response",
  "type": "object",
  "properties": {
    "request": {
      "type": "object",
      "required": [
        "user"
      ],
      "properties": {
        "user": {
          "type": "object",
          "required": [
            "email"
          ],
          "properties": {
            "email": {
              "type": "string",
              "format": "email"
            }
          },
          "additionalProperties": true
        }
      },
      "additionalProperties": true
    },
    "response": {
      "type": "object",
      "properties": {
        "authoritative_deployment": {
          "type": "object",
          "required": [
            "issuer",
            "agentpass_configuration_url"
          ],
          "properties": {
            "issuer": {
              "type": "string",
              "format": "uri",
              "pattern": "^https://"
            },
            "agentpass_configuration_url": {
              "type": "string",
              "format": "uri",
              "pattern": "^https://"
            }
          },
          "additionalProperties": true
        },
        "trusted_federated_deployments": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "issuer",
              "agentpass_configuration_url"
            ],
            "properties": {
              "issuer": {
                "type": "string",
                "format": "uri",
                "pattern": "^https://"
              },
              "agentpass_configuration_url": {
                "type": "string",
                "format": "uri",
                "pattern": "^https://"
              }
            },
            "additionalProperties": true
          },
          "minItems": 1
        }
      },
      "anyOf": [
        {
          "required": [
            "authoritative_deployment"
          ]
        },
        {
          "required": [
            "trusted_federated_deployments"
          ]
        }
      ],
      "allOf": [
        {
          "if": {
            "required": [
              "authoritative_deployment"
            ]
          },
          "then": {
            "required": [
              "authoritative_deployment"
            ],
            "not": {
              "required": [
                "trusted_federated_deployments"
              ]
            }
          }
        },
        {
          "if": {
            "required": [
              "trusted_federated_deployments"
            ]
          },
          "then": {
            "required": [
              "trusted_federated_deployments"
            ],
            "not": {
              "required": [
                "authoritative_deployment"
              ]
            }
          }
        }
      ],
      "additionalProperties": true
    }
  },
  "additionalProperties": true
}
```

### `service-configuration.schema.json` [#schema-service-configuration]

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "AgentPass Service Provider Configuration",
  "type": "object",
  "required": [
    "kind",
    "service",
    "trust",
    "endpoints"
  ],
  "properties": {
    "kind": {
      "type": "string",
      "const": "service"
    },
    "service": {
      "type": "object",
      "required": [
        "origin"
      ],
      "properties": {
        "origin": {
          "type": "string",
          "format": "uri",
          "pattern": "^https://"
        },
        "name": {
          "type": "string",
          "minLength": 1
        }
      },
      "additionalProperties": true
    },
    "trust": {
      "type": "object",
      "properties": {
        "accepted_authorities": {
          "type": "array",
          "items": {
            "type": "string",
            "format": "uri",
            "pattern": "^https://"
          },
          "minItems": 1,
          "uniqueItems": true
        },
        "trusted_federated_deployments": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "issuer",
              "agentpass_configuration_url"
            ],
            "properties": {
              "issuer": {
                "type": "string",
                "format": "uri",
                "pattern": "^https://"
              },
              "agentpass_configuration_url": {
                "type": "string",
                "format": "uri",
                "pattern": "^https://"
              }
            },
            "additionalProperties": true
          },
          "minItems": 1,
          "uniqueItems": true
        }
      },
      "additionalProperties": true
    },
    "endpoints": {
      "type": "object",
      "required": [
        "resolve_deployments",
        "redeem_browser_session",
        "redeem_bearer_token",
        "initialize_session",
        "available_scopes"
      ],
      "properties": {
        "resolve_deployments": {
          "type": "string",
          "pattern": "^https://"
        },
        "redeem_browser_session": {
          "type": "string",
          "pattern": "^https://"
        },
        "redeem_bearer_token": {
          "type": "string",
          "pattern": "^https://"
        },
        "initialize_session": {
          "type": "string",
          "pattern": "^https://"
        },
        "available_scopes": {
          "type": "string",
          "pattern": "^https://"
        }
      },
      "additionalProperties": true
    },
    "session": {
      "type": "object"
    }
  },
  "additionalProperties": true
}
```

### `service-redeem-browser-session.schema.json` [#schema-service-redeem-browser-session]

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Service Provider Browser Session Redemption Request/Response",
  "type": "object",
  "properties": {
    "request": {
      "type": "object",
      "required": [
        "delegation_pass"
      ],
      "properties": {
        "delegation_pass": {
          "type": "object",
          "required": [
            "type",
            "value"
          ],
          "properties": {
            "type": {
              "type": "string",
              "const": "service_signin_bootstrap"
            },
            "value": {
              "type": "string",
              "minLength": 1
            }
          },
          "additionalProperties": true
        },
        "runtime_proof": {
          "type": "object"
        },
        "user": {
          "type": "object",
          "properties": {
            "email": {
              "type": "string",
              "format": "email",
              "description": "User email used by Service Providers for authoritative precedence domain derivation."
            }
          },
          "additionalProperties": true
        }
      },
      "additionalProperties": true
    },
    "response": {
      "type": "object",
      "required": [
        "initialization_url"
      ],
      "properties": {
        "initialization_url": {
          "type": "string",
          "format": "uri",
          "pattern": "^https://"
        },
        "expires_at": {
          "type": "string",
          "format": "date-time"
        },
        "one_time": {
          "type": "boolean"
        }
      },
      "additionalProperties": true
    }
  },
  "additionalProperties": true
}
```

### `service-redeem-bearer-token.schema.json` [#schema-service-redeem-bearer-token]

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Service Provider Bearer Token Redemption Request/Response",
  "type": "object",
  "properties": {
    "request": {
      "type": "object",
      "required": ["delegation_pass"],
      "properties": {
        "delegation_pass": {
          "type": "object",
          "required": ["type", "value"],
          "properties": {
            "type": { "type": "string", "const": "service_bearer_token" },
            "value": { "type": "string", "minLength": 1 }
          },
          "additionalProperties": true
        },
        "runtime_proof": { "type": "object" },
        "user": {
          "type": "object",
          "properties": {
            "email": { "type": "string", "format": "email" }
          },
          "additionalProperties": true
        }
      },
      "additionalProperties": true
    },
    "response": {
      "type": "object",
      "required": ["bearer_token"],
      "properties": {
        "bearer_token": { "type": "string", "minLength": 1 },
        "scope": {
          "oneOf": [
            { "type": "string" },
            { "type": "array", "items": { "type": "string" } }
          ]
        },
        "expires_in": { "type": "integer", "minimum": 0 }
      },
      "additionalProperties": true
    }
  },
  "additionalProperties": true
}
```

### `service-available-scopes.schema.json` [#schema-service-available-scopes]

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Service Provider Available Scopes",
  "type": "object",
  "required": ["scopes"],
  "properties": {
    "scopes": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name"],
        "properties": {
          "name": { "type": "string", "minLength": 1 },
          "description": { "type": "string" }
        },
        "additionalProperties": true
      }
    }
  },
  "additionalProperties": true
}
```

## Appendix B. JSON Examples [#appendix-b]

### `service-authority-resolution-authoritative.json` [#example-authoritative-resolution]

```json
{
  "request": {
    "user": {
      "email": "alex@example.com"
    }
  },
  "response": {
    "authoritative_deployment": {
      "issuer": "https://agentpass.example.com",
      "agentpass_configuration_url": "https://agentpass.example.com/ap"
    }
  }
}
```

### `service-authority-resolution-federated-options.json` [#example-federated-options]

```json
{
  "request": {
    "user": {
      "email": "alex@no-agentpass-domain.example"
    }
  },
  "response": {
    "trusted_federated_deployments": [
      {
        "issuer": "https://codex.example.com",
        "agentpass_configuration_url": "https://codex.example.com/ap"
      },
      {
        "issuer": "https://claude-code.example.com",
        "agentpass_configuration_url": "https://claude-code.example.com/ap"
      }
    ]
  }
}
```

### `service-redeem-bearer-token.json` [#example-redeem-bearer-token]

```json
{
  "request": {
    "delegation_pass": {
      "type": "service_bearer_token",
      "value": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
    },
    "user": {
      "email": "colin@example.com"
    }
  },
  "response": {
    "bearer_token": "sp_tok_a1b2c3d4e5f6...",
    "scope": ["tickets:read", "tickets:comment"],
    "expires_in": 3600
  }
}
```

### `service-available-scopes.json` [#example-available-scopes]

```json
{
  "request": {
    "user": {
      "email": "colin@example.com"
    },
    "agent": {
      "id": "agent:build-bot-7f2c"
    }
  },
  "response": {
    "scopes": [
      {
        "name": "tickets:read",
        "description": "Read access to tickets"
      },
      {
        "name": "tickets:comment",
        "description": "Add comments to tickets"
      },
      {
        "name": "dashboard:view",
        "description": "View dashboard data"
      }
    ]
  }
}
```
