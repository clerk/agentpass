---
title: AgentPass Specification
---

# AgentPass Specification

***WARNING: This specification is work-in-progress. It has not been security-audited and is subject to change. Do not use in production environments.***

Version: 0.1 (Draft)

Table of Contents

- [1. Introduction](#s-1)
- [2. Notational Conventions](#s-2)
  - [2.1. Definitions](#s-2-1)
  - [2.2. Versioning](#s-2-2)
- [3. Harness Protocol](#s-3)
  - [3.1. Harness Identity](#s-3-1)
  - [3.2. Acquire an AgentPass](#s-3-2)
  - [3.3. Redeem a Browser Session](#s-3-3)
  - [3.4. Redeem a Bearer Token](#s-3-4)
- [4. Service Protocol](#s-4)
  - [4.1. Discovery and Configuration](#s-4-1)
  - [4.2. Authority Resolution](#s-4-2)
  - [4.3. Scope Discovery](#s-4-3)
  - [4.4. AgentPass Redemption](#s-4-4)
  - [4.5. Browser Session Authorization](#s-4-5)
  - [4.6. Bearer Token Authorization](#s-4-6)
- [5. Authority Protocol](#s-5)
  - [5.1. Trust Modes](#s-5-1)
  - [5.2. Discovery and Configuration](#s-5-2)
  - [5.3. AgentPass Issuance](#s-5-3)
  - [5.4. AgentPass Validation](#s-5-4)
  - [5.5. Authorization Management](#s-5-5)
- [Appendix A. JSON Schemas](#appendix-a)
- [Appendix B. JSON Examples](#appendix-b)

## 1. Introduction [#s-1]

AgentPass is an open specification for governed delegation of authority from Users to agents.

The specification defines how trust is established between Services and Authorities, how delegated authority is represented as AgentPasses, and how Services exchange AgentPasses for session credentials or bearer tokens.

The specification is organized around the three parties in the AgentPass protocol:

- **Harness Protocol** (Section 3): How Harnesses acquire AgentPasses, redeem browser sessions, and redeem bearer tokens.
- **Service Protocol** (Section 4): How Services discover trust configuration, validate AgentPass credentials, and enforce delegated authority.
- **Authority Protocol** (Section 5): How Authorities govern delegation policy and issue AgentPasses.

## 2. Notational Conventions [#s-2]

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and
"OPTIONAL" in this document are to be interpreted as described in BCP 14
[RFC2119] [RFC8174] when, and only when, they appear in all capitals.

Unless otherwise stated:

- JSON field names are shown in monospace (for example, `user.email`).
- URI templates and endpoint name variables are shown in braces (for example, `GET {authority_configuration_url}`, `POST {service_authority_resolution_url}`).
- DNS names are shown using literal labels (for example, `_agentpass.{user_email_domain}`).
- Examples are non-normative.

[RFC2119]: https://www.rfc-editor.org/rfc/rfc2119
[RFC8174]: https://www.rfc-editor.org/rfc/rfc8174

### 2.1. Definitions [#s-2-1]

This section defines the core actors and artifacts of the AgentPass specification.

- **User:** Identity representing the account at a Service on whose behalf an agent acts. The User is the subject of delegation. Approval MAY be granted by the User or by another approver (for example, the User's manager or an automated policy system).
- **Agent:** Software identity that acts on behalf of a User. The agent identity (`agent.id`) returned during AgentPass validation is determined and attested by the Authority.
- **Harness:** Execution environment that requests AgentPasses and presents them to Services.
- **Task:** A unit of work that a Harness performs on behalf of a User. Each Task is identified by a Harness-assigned `task.id` and described by a `task.description`. A Harness acquires a new AgentPass for each Task.
- **Service:** Relying party application that accepts AgentPasses.
- **Authority:** Person or organization that deploys and operates an **AgentPass Authority** — a deployed AgentPass instance that governs delegation policy and issues AgentPasses. Section 5 is addressed to this audience.
- **AgentPass:** Short-lived, single-use credential issued by an Authority representing delegated authority for a specific Service. Services MUST NOT interpret AgentPass values directly; validation is performed by the Authority.
- **Scope:** An array of strings representing the permissions delegated to an agent. Each string is an opaque scope identifier defined by the Service (for example, `["tickets:read", "tickets:comment"]`). The special scope value `"*"` means all scopes the User has access to at the Service. Scope MUST always be represented as a JSON array of strings.

### 2.2. Versioning [#s-2-2]

AgentPass version identifiers use `major.minor` format (for example, `"0.1"`).

- Clients MUST reject configurations with an unrecognized major version.
- Clients SHOULD accept configurations with a higher minor version than they implement, ignoring unrecognized fields (forward compatibility via `additionalProperties: true` in schemas).
- When a client does not support any version offered by a peer, it MUST fail with a clear error rather than attempting degraded operation.
- Implementations SHOULD document which specification version(s) they support.

## 3. Harness Protocol [#s-3]

This section is for Harness implementers that request and present AgentPass credentials on behalf of Users.

Examples include agent harnesses and coding agents such as Codex, Claude Code, OpenClaw, and similar execution environments.

This section defines how Harnesses initialize AgentPass flows: acquiring AgentPasses, redeeming browser sessions, and redeeming bearer tokens.

AgentPass supports two redemption flows, chosen based on the type of access the Harness needs:

- **Browser sessions** (`type = "browser_session"`): The Harness receives an initialization URL that establishes an authenticated browser session. Use this when the agent needs to interact with a web application through an emulated browser — navigating pages, reading rendered content, or submitting forms.
- **Bearer tokens** (`type = "bearer_token"`): The Harness receives an access token for programmatic API calls. Use this when the agent needs to call a Service's API directly — reading data, creating resources, or performing actions.

A Harness MAY use both flow types with the same Service, each requiring a separate AgentPass issuance and redemption.

### 3.1. Harness Identity [#s-3-1]

This section defines how Harnesses establish cryptographic identity for holder binding and optional verified agent identity via attestation. Both mechanisms share a single ephemeral key pair.

#### 3.1.1. Holder Binding [#s-3-1-1]

Holder binding is a mechanism that binds an AgentPass to a specific Harness, ensuring that only the Harness that requested the AgentPass can redeem it. Holder binding is RECOMMENDED.

When holder binding is used:

1. **At issuance:** The Harness includes `harness.cnf` in the issuance request (Section 3.2.3). The `cnf` object MUST contain a `jwk` field with the public key of an ephemeral key pair generated by the Harness, represented as a JWK ([RFC 7517]).

2. **At redemption:** The Harness includes `harness_proof` in the redemption request (Sections 3.3.1, 3.4.1). The `harness_proof` object MUST contain a `jwt` field with a signed JWT proving possession of the private key corresponding to the `cnf` public key.

   The proof JWT MUST include:
   - `iss` (string): the `harness.id`.
   - `aud` (string): the Service origin.
   - `iat` (number): issuance time.
   - `exp` (number): expiration time (SHOULD be short-lived).
   - `jti` (string): unique identifier to prevent replay.

   The proof JWT MUST be signed with the private key corresponding to the `cnf` public key.

3. **At validation:** When the Authority returns `cnf` in the validation response (Section 5.4), the Service MUST verify the `harness_proof` JWT signature against the `cnf.jwk` public key. If verification fails, the Service MUST reject the redemption.

When holder binding is not used, `harness.cnf` and `harness_proof` are omitted. Services MUST accept redemption requests without `harness_proof` when the Authority validation response does not include `cnf`.

[RFC 7517]: https://www.rfc-editor.org/rfc/rfc7517

#### 3.1.2. Harness Attestation [#s-3-1-2]

Harness attestation is an OPTIONAL mechanism that binds a verified agent identity to the holder binding key. When present, it allows Authorities to cryptographically verify which agent is requesting an AgentPass, rather than relying on self-asserted identity.

The attestation is carried in the `harness.attestation` field of the issuance request. The `harness.attestation` object MUST contain a `jwt` field with a signed attestation JWT.

**Attestation JWT format**

The attestation JWT MUST include:

- `iss` (string): the attestation signer (for example, `https://anthropic.com`). This is a trusted third party — NOT the Harness itself.
- `sub` (string): the verified agent identity (for example, `claude-code`).
- `cnf` (object): MUST contain a `jwk` field. The `cnf.jwk` value MUST match the `harness.cnf.jwk` value in the issuance request. This binds the verified identity to the holder binding key.
- `iat` (number): issuance time.
- `exp` (number): expiration time. Attestation JWTs SHOULD be short-lived.

The attestation JWT MUST be signed by the trusted third party (the `iss`), NOT by the Harness. The Harness presents an attestation it received from its vendor or operator.

**Authority verification**

When `harness.attestation` is present in an issuance request, the Authority MUST:

1. Decode the attestation JWT and extract the `iss` claim.
2. Fetch the attestation signer's JWKS from a JWKS endpoint for that issuer.
3. Verify the attestation JWT signature against the signer's published keys.
4. Verify that the attestation `cnf.jwk` matches `harness.cnf.jwk` in the issuance request.
5. Verify that the attestation is not expired.

If any verification step fails, the Authority MUST reject the issuance request.

#### 3.1.3. Task Attestation [#s-3-1-3]

Task attestation is an OPTIONAL mechanism that creates a non-repudiable record binding the Harness to the task it claims to perform. When present, it allows Authorities to cryptographically verify which task the Harness is requesting an AgentPass for.

Task attestation requires holder binding (Section 3.1.1). The attestation is carried in the `task.attestation` field of the issuance request. The `task.attestation` object MUST contain a `jwt` field with a signed task attestation JWT.

**Task attestation JWT format**

The task attestation JWT MUST include:

- `iss` (string): the `harness.id`.
- `task_id` (string): the task identifier (MUST match `task.id` in the issuance request).
- `task_description_hash` (string): SHA-256 hex digest of `task.description` from the issuance request.
- `iat` (number): issuance time.
- `exp` (number): expiration time. Task attestation JWTs SHOULD be short-lived.

The task attestation JWT MUST be signed with the private key corresponding to the holder binding public key (`harness.cnf.jwk`).

**Authority verification**

When `task.attestation` is present in an issuance request, the Authority MUST:

1. Verify that `harness.cnf` is present in the issuance request (task attestation requires holder binding).
2. Verify the task attestation JWT signature against the `harness.cnf.jwk` public key.
3. Verify that the `task_id` claim in the JWT matches `task.id` in the issuance request.
4. Verify that `task_description_hash` matches the SHA-256 hex digest of `task.description` in the issuance request.
5. Verify that the `iss` claim matches `harness.id` in the issuance request.
6. Verify that the attestation is not expired.

If any verification step fails, the Authority MUST reject the issuance request.

Task attestation is orthogonal to the trust tiers defined in Section 3.1.4. A Harness at any trust tier MAY include task attestation when holder binding is used.

#### 3.1.4. Trust Tiers [#s-3-1-4]

Harnesses present varying levels of identity assurance depending on whether they carry attestation and whether their key is pre-registered with the Authority. The following trust tiers define the spectrum:

| Tier | Mechanism | Use case | `harness.id` assurance |
|------|-----------|----------|---------------------|
| Attested | `harness.attestation.jwt` signed by vendor. Authority verifies vendor JWKS. | Cloud harnesses (Claude Code, Codex) | High — cryptographically verified |
| Registered | No attestation JWT. `cnf.jwk` pre-registered with Authority out-of-band. Authority recognizes key. | Self-hosted harnesses in enterprise environments | Medium — identity from registration |
| Unverified | No attestation, no registration. `harness.id` is self-asserted in request body. Holder binding still works. | Personal use, non-enterprise | Low — self-asserted |

Authorities SHOULD document which trust tiers they accept.

Authorities MAY reject issuance requests that do not meet their required trust tier.

When attestation is present, Authorities MUST verify the attestation before issuing an AgentPass.

### 3.2. Acquire an AgentPass [#s-3-2]

This section defines the normative Harness flow for acquiring an AgentPass from an Authority. This flow applies whenever a Harness needs delegated authority at a Service, regardless of whether the Harness intends to redeem a browser session or redeem a bearer token.

The flow uses:

- Authority issuance endpoints from Section 5.3
- Service authority-resolution endpoints from Section 4.2

#### 3.2.1. Discover Service [#s-3-2-1]

Harness MUST perform Service discovery:

1. DNS query `_agentpass-service.{service_host}` TXT to resolve `service_configuration_url`.
2. `GET {service_configuration_url}` to fetch Service configuration.

Discovery rules are defined in Section 4.1.

#### 3.2.2. Resolve Authority Through Service [#s-3-2-2]

Harness MUST call:

- the Authority Resolution Endpoint: `POST {service_authority_resolution_url}`

Request MUST include:

- `request.user.email` — the User email address (**`user.email`**) the Harness intends to sign in as

Response MUST include exactly one of:
  - `response.enterprise_authority`, or
  - `response.service_authority`, or
  - `response.trusted_federated_authorities`

If `response.enterprise_authority` is present:

- Harness MUST use it as the selected authority.
- Harness MUST NOT use a federated authority.

If `response.service_authority` is present:

- Harness MUST use it as the selected authority.
- Harness MUST NOT use a federated authority.

If `response.trusted_federated_authorities` is present:

- Harness MUST choose exactly one authority from that list (typically by asking a human operator which provider they prefer).
- Harness MUST NOT use an authority outside that list.

Harness MUST NOT perform direct enterprise discovery as part of this flow.

#### 3.2.3. Request Issuance [#s-3-2-3]

Harness MUST call:

- the Issuance Endpoint: `POST {agentpass_issuance_url}`

Where `agentpass_issuance_url` is obtained by fetching AgentPass configuration from the selected authority `authority_configuration_url` returned by the Authority Resolution Endpoint, and then using `endpoints.issuance`.

Request body MUST conform to the `issuance-request` schema (Appendix A).

Harness MUST set:

- `type` — `"browser_session"` for browser session flows, `"bearer_token"` for bearer token flows
- `service.origin`
- `user.email`
- `harness.id`
- `task.id` — Harness-assigned identifier for the task
- `task.description` — free-form natural language description of the task the agent intends to perform (for example, "Triage and respond to open support tickets")

If Harness requests holder binding, it SHOULD include `harness.cnf`.

Harness SHOULD include `task.attestation` when holder binding is used (Section 3.1.3).

For browser session flows, Harness SHOULD include `intent.destination_url` when available.

Bearer token flows do not use `intent.destination_url`.

**Poll for approval**

Authority MAY require approval and asynchronous processing. Approval MAY be granted by an approver other than the User (for example, a manager or an automated policy system).

Harness MUST poll:

- the Issuance Status Endpoint: `GET {agentpass_issuance_status_url_template}`

Status response MUST conform to the `issuance-status` schema (Appendix A).

**Status lifecycle**

Harness MUST handle these status values:

- non-terminal: `pending`
- terminal: `approved`, `denied`, `expired`, `canceled`

Allowed transition model:

- `pending -> approved | denied | expired | canceled`
- terminal states do not transition further

**Polling behavior**

While status is `pending`, Harness MUST continue polling until terminal state.

- If `poll_after_ms` is present, Harness SHOULD honor it.
- If absent, Harness SHOULD back off between polls and MUST avoid tight-loop polling.

**Approved result**

When status is `approved`, response MUST include a `agentpass` suitable for redemption.

If approved status does not include redeemable AgentPass data, Harness MUST treat response as protocol-invalid and fail flow.

**Terminal errors**

Harness MUST treat these outcomes as terminal failures for current request:

- issuance status is `denied`, `expired`, or `canceled`
- Service redemption rejects AgentPass (`4xx`) or replay semantics are triggered
- for browser session flows: initialization URL is expired or already consumed

After terminal failure, Harness MAY start a new request with fresh identifiers.

### 3.3. Redeem a Browser Session [#s-3-3]

This section defines the flow-specific steps for redeeming a browser session after obtaining an approved AgentPass. Harness MUST have completed Section 3.2 with `type = "browser_session"` and received an approved AgentPass.

#### 3.3.1. Redeem AgentPass at Service [#s-3-3-1]

Harness MUST call:

- the Browser Session Redemption Endpoint: `POST {service_redeem_browser_session_url}`

Request/response MUST conform to the `service-redeem-browser-session` schema (Appendix A).

Harness MUST include:

- `request.agentpass` from approved issuance response
- `request.authority` — the Authority identifier (`authority` field from `GET {authority_configuration_url}`)

Harness SHOULD include:

- `request.harness_proof` when proof-of-possession is required

Harness MAY include:

- `request.requested_scope` — array of scope strings the Harness wants for this session. When present, the Service computes the intersection with the Authority-approved scope and grants only the intersection. This enables least-privilege access when the Harness does not need the full approved scope.

Harness MUST include `request.user.email` for enterprise precedence domain derivation.

#### 3.3.2. Initialize Browser Session [#s-3-3-2]

If `POST {service_redeem_browser_session_url}` succeeds, Harness receives `initialization_url`.

Harness MUST:

- treat `initialization_url` as single-use and short-lived
- load it directly in emulated browser
- avoid prefetching, retries, or secondary sharing of URL

If browser initialization fails after URL issuance, Harness MUST create a new request instead of reusing same URL.

### 3.4. Redeem a Bearer Token [#s-3-4]

A **Bearer Token** is a delegated access token issued by a Service after AgentPass redemption, presented to Service APIs using `Authorization: Bearer`. This section defines the flow-specific steps for redeeming a bearer token after obtaining an approved AgentPass. Harness MUST have completed Section 3.2 with `type = "bearer_token"` and received an approved AgentPass.

#### 3.4.1. Redeem AgentPass at Service [#s-3-4-1]

Harness MUST call:

- the Bearer Token Redemption Endpoint: `POST {service_redeem_bearer_token_url}`

Request/response MUST conform to the `service-redeem-bearer-token` schema (Appendix A).

Harness MUST include:

- `request.agentpass` from approved issuance response
- `request.authority` — the Authority identifier (`authority` field from `GET {authority_configuration_url}`)
- `request.user.email`

Harness SHOULD include:

- `request.harness_proof` when proof-of-possession is required

Harness MAY include:

- `request.requested_scope` — same semantics as Section 3.3.1.

On success, Harness receives:

- `response.bearer_token`

Harness MAY use:

- `response.scope` (granted scope)
- `response.expires_in` (seconds until token expiration)

#### 3.4.2. Call Service API [#s-3-4-2]

Harness MUST present the bearer token using:

- `Authorization: Bearer {bearer_token}`

Harness MUST treat `bearer_token` as opaque. The bearer token format is determined by the Service.

## 4. Service Protocol [#s-4]

This section is for Service implementers. It defines how Services discover and publish configuration, authorize AgentPass credentials, and implement required endpoints.

### 4.1. Discovery and Configuration [#s-4-1]

This section defines how Harnesses discover a Service's **Service Configuration URL**.

#### Service Configuration URL

Services expose a base configuration URL `service_configuration_url` discovered via DNS.

Given a Service origin (for example, `https://service.example.com`), Harness derives host (`service.example.com`) and queries:

- `_agentpass-service.service.example.com TXT`

The TXT value MUST be an `https://` URL. That URL is the **Service Configuration URL** `service_configuration_url`.

Harness fetches the configuration document by calling:

- `GET {service_configuration_url}`

TXT parsing and validation rules MUST follow Section 5.2 parsing and security requirements.

This section defines the JSON configuration document returned by a **Service Configuration URL**.

#### Example Configuration (Non-Normative)

```json
{
  "version": "0.1",
  "kind": "service",
  "service": {
    "origin": "https://api.example.com",
    "name": "Example Service"
  },
  "jwks_uri": "https://api.example.com/agentpass-service/jwks.json",
  "trust": {
    "trusted_federated_authorities": [
      {
        "authority": "https://codex.example.com",
        "authority_configuration_url": "https://codex.example.com/ap"
      }
    ],
    "service_authority": {
      "authority": "https://api.example.com/agentpass",
      "authority_configuration_url": "https://api.example.com/agentpass/ap"
    }
  },
  "endpoints": {
    "resolve_authorities": "https://api.example.com/resolve-authorities",
    "redeem_browser_session": "https://api.example.com/redeem-browser-session",
    "redeem_bearer_token": "https://api.example.com/redeem-bearer-token",
    "available_scopes": "https://api.example.com/agentpass/scopes"
  }
}
```

#### Field Reference

- `version` (required): AgentPass specification version this configuration conforms to (for example, `"0.1"`). Clients MUST reject configurations with unrecognized major versions.
- `kind` (required): `"service"`.
- `service` (required): Service identity information.
- `service.origin` (required): Service origin (HTTPS).
- `service.name` (optional): human-readable service name.
- `jwks_uri` (required): JWKS URL for Service request signing. Used by Authorities to verify Service identity when processing AgentPass validation and scope refresh requests.
- `trust` (required): trust declarations.
- `trust.trusted_federated_authorities` (optional): list of Federated Authorities this Service is willing to trust (HTTPS). Returned federated options from the Authority Resolution Endpoint MUST be a subset of this list.
- `trust.service_authority` (optional): a single Authority with `trust_mode = "service"` operated by this Service. When configured, the Service MAY return this Authority from the Authority Resolution Endpoint as a first-class selection result. When an Enterprise Authority exists, use of the Service Authority remains subject to the Enterprise Authority's `policy.allow_service_authorities` setting (Section 5.2). Same shape as a `trusted_federated_authorities` entry (`authority`, `authority_configuration_url`).
- `endpoints` (required): Service integration endpoints.
- `endpoints.resolve_authorities` (required): authority-resolution endpoint (`POST`).
- `endpoints.redeem_browser_session` (required): browser session AgentPass redemption endpoint (`POST`).
- `endpoints.redeem_bearer_token` (required): bearer token AgentPass redemption endpoint (`POST`).
- `endpoints.available_scopes` (required): available scopes endpoint (`POST`).


JSON schema: see `service-configuration.schema.json` (Appendix A).

#### Endpoint Variable Mapping

For readability, this spec uses the following endpoint name variables derived from this configuration document:

- `{service_authority_resolution_url}` = `endpoints.resolve_authorities`
- `{service_redeem_browser_session_url}` = `endpoints.redeem_browser_session`
- `{service_redeem_bearer_token_url}` = `endpoints.redeem_bearer_token`
- `{service_available_scopes_url}` = `endpoints.available_scopes`

#### Consumer Behavior

Harnesses MUST use the Service authority-resolution endpoint (not direct enterprise discovery) to obtain acceptable authority selection for browser-session and bearer-token flows.

Services remain the final policy and trust enforcement point at redemption and initialization time.

#### Error Handling

Suggested status classes for configuration endpoint:

- `404` endpoint not found
- `406` unsupported `Accept`
- `5xx` transient Service failure

### 4.2. Authority Resolution [#s-4-2]

Resolves the acceptable Authority(s) for a User email address.

Schema: `service-authority-resolution` (Appendix A).

Examples: see Appendix B.

**Request**

Endpoint URL is provided by Service configuration:

- `endpoints.resolve_authorities` -> `POST {service_authority_resolution_url}`

Service MUST accept JSON body containing:

- `request.user.email`

**Service behavior**

Service MUST:

1. Derive the User email domain from the email domain portion of `request.user.email`.
2. Determine whether the derived User email domain has an Enterprise Authority by performing enterprise discovery for that domain (`_agentpass.{user_email_domain}`) (Section 5.2).
3. If enterprise discovery returns a URL and the discovered Enterprise Authority configuration can be fetched and validated:
   - If the Service has a `trust.service_authority` configured, fetch the Enterprise Authority's configuration and check `policy.allow_service_authorities` (default `true`). If `true`, Service MAY return the Service Authority instead of the Enterprise Authority. If `false`, Service MUST return the Enterprise Authority.
   - Otherwise, return the Enterprise Authority.
4. If enterprise discovery returns `none`, or if enterprise discovery returns a URL but the discovered configuration cannot be fetched or validated, reject the request and MUST NOT return Federated Authority or Service Authority options.
5. If enterprise discovery does not resolve (no DNS record):
   - If the Service has a `trust.service_authority` configured and selects it by Service policy, return the Service Authority.
   - Otherwise, if trusted Federated Authority options are available, return only trusted Federated Authority options that are explicitly defined in Service Configuration (`trust.trusted_federated_authorities`) and selected by Service policy.
   - Otherwise, reject the request.

Service MUST NOT return federated options when enterprise discovery returns a usable Enterprise Authority.
If a User email domain has an Enterprise Authority, Service MUST only authorize agents delegated by that Enterprise Authority or by the Service Authority (when permitted by the Enterprise Authority's policy).

Services MUST enforce the same precedence rules at redemption time (Section 4.4, step 3).

**Response**

Response MUST include exactly one field, determined by the discovery result:

| Discovery result | Response field |
|---|---|
| Enterprise Authority found, no Service Authority (or policy disallows) | `enterprise_authority` |
| Enterprise Authority found, Service Authority permitted by policy | `service_authority` |
| `none` | reject — MUST NOT return any authority |
| Fetch/validation failure | reject — MUST NOT return any authority |
| No DNS record, Service Authority selected by Service policy | `service_authority` |
| No DNS record, no Service Authority selected, trusted Federated options available | `trusted_federated_authorities` (non-empty; each entry MUST be in Service Configuration and selected by policy) |
| No DNS record, no Service Authority selected, no trusted Federated options available | reject — MUST NOT return any authority |

Service MUST treat federated providers as high-trust dependencies and MUST NOT return implicit federated options.

**Errors**

Suggested status classes:

- `400` malformed request or invalid email
- `404` no enterprise authority and no trusted federated options
- `403` enterprise precedence enforcement rejection (for example, discovery returns `none`)
- `502` enterprise discovery configuration fetch/validation failure
- `422` semantically invalid resolution request
- `5xx` transient Service failure

### 4.3. Scope Discovery [#s-4-3]

Returns the set of scopes a Service supports for AgentPass delegation, given a User and Agent context.

Schema: `service-available-scopes` (Appendix A).

Endpoint URL is provided by Service configuration:

- `endpoints.available_scopes` -> `POST {service_available_scopes_url}`

**Authentication**

Authority MUST authenticate using a signed JWT assertion. The assertion MUST be a JWS signed with the Authority's keys (from `jwks_uri`).

Required assertion claims:

- `iss` (string): the Authority identifier (MUST equal `authority` from `GET {authority_configuration_url}`).
- `aud` (string): the Service origin.
- `iat` (number): issuance time.
- `exp` (number): expiration time (SHOULD be short-lived).

The assertion MUST be presented in the `Authorization` header:

- `Authorization: Bearer {assertion_jwt}`

Service MUST validate the assertion signature using the Authority's published keys (JWKS), obtained by discovering the Authority configuration from the assertion `iss` and fetching its `jwks_uri`.

Service MUST reject requests with missing, expired, or invalid assertions.

**Request**

Authority MUST send a JSON body containing:

- `user.email` (string): User email address.
- `agent.id` (string): Agent identifier (attested by the authenticated Authority).

Authority MAY include:

- `task.id` (string): Task identifier assigned by the Harness.
- `task.description` (string): Task description from the issuance request.

**Response**

Service MUST return JSON conforming to `service-available-scopes` schema.

Response MUST include:

- `scopes`: array of scope objects

Each scope object MUST include:

- `name` (string): scope identifier (for example, `"tickets:read"`)

Each scope object MAY include:

- `description` (string): human-readable description

Service MAY return different scopes based on User, Agent, Task, or Authority context. When `task.id` or `task.description` is present, Services MAY use the task context to filter or prioritize the returned scopes.

**Consumer behavior**

Authorities call this endpoint during issuance processing to discover the scopes available for a given User and Agent. The `user.email` field in the request enables Services to return per-user dynamic scope lists. The Authority then uses the task description from the issuance request (Section 3.2.3) alongside the available scopes to determine which scopes to approve for delegation. The mechanism by which an Authority determines approved scopes is out of scope of this specification.

Approved scopes MUST be included in the AgentPass by the Authority and returned during validation (Section 5.4).

Scope enforcement occurs at AgentPass redemption time (Sections 4.5, 4.6). The available scopes response is informational for the Authority — Services enforce actual authorization at redemption.

**Errors**

Suggested status classes:

- `400` malformed request
- `401` missing or invalid assertion
- `403` untrusted Authority
- `429` rate limited
- `5xx` transient Service failure

### 4.4. AgentPass Redemption [#s-4-4]

This section defines the common AgentPass validation and enforcement behavior that applies to both browser session and bearer token redemption flows (Sections 4.5, 4.6).

#### AgentPass Validation

Service MUST validate AgentPass credentials by calling the Authority's Validation Endpoint (Section 5.4). Services MUST NOT interpret AgentPass values directly.

**Service authentication**

Service MUST authenticate to the Authority using a signed JWT assertion with its keys (from Service `jwks_uri`).

Required assertion claims:

- `iss` (string): the Service origin.
- `aud` (string): the Authority identifier.
- `iat` (number): issuance time.
- `exp` (number): expiration time (SHOULD be short-lived).

**Request**

Service sends:

- `agentpass.value` (string): the opaque AgentPass token from the redemption request.

**Validation response**

The Authority returns delegation details including `authorization_id`, `authorization_expires_at`, `user.email`, `agent.id`, `scope`, and optional fields for holder binding and task context. See Section 5.4.1 for the complete response schema.

The Authority atomically enforces single-use semantics. If the AgentPass has already been consumed, is expired, or is otherwise invalid, the Authority rejects the request.

#### Validation Algorithm

Service MUST perform the following checks during redemption:

1. Protocol validation (required fields, parseability).
2. Authority trust validation: verify `request.authority` is trusted per Service trust policy.
3. Authoritative precedence enforcement per Section 4.2. When the AgentPass was issued by the Service Authority (`request.authority` matches `trust.service_authority.authority`), the precedence check passes only if enterprise discovery for the User email domain does not resolve (no DNS record), or if a discovered Enterprise Authority's `policy.allow_service_authorities` is `true` or absent (default `true`).
4. AgentPass validation: call Authority Validation Endpoint (Section 5.4) with signed request. If Authority rejects (consumed, expired, invalid, or wrong audience), reject redemption.
5. Scope validation: verify returned `scope` contains scopes the Service supports. If `scope` contains `"*"`, treat as all scopes the User has access to.
6. Scope downgrade: if `request.requested_scope` is present, compute the intersection of `requested_scope` and the Authority-approved scope. If the intersection is empty, reject redemption. Otherwise, use the intersection as the effective granted scope.
7. Harness proof validation when validation response includes `cnf`.

Flow-specific sections MAY define additional validation steps beyond these common checks.

If any check fails, Service MUST reject the redemption.

#### Continuous Delegation Validation

Service SHOULD verify that the delegation is still active periodically by calling the Authorization Check Endpoint (Section 5.5) with the `authorization_id` obtained during AgentPass validation. Services MAY cache successful authorization check results briefly to reduce per-request latency. Revocation takes effect within the cache TTL window.

Services MUST treat `authorization_expires_at` returned by the Authority as the absolute upper bound for the delegation. Services MUST NOT keep browser sessions, bearer tokens, or any other delegated credentials valid beyond that timestamp.

If the Authority returns `404` (delegation revoked or expired), Service MUST invalidate any sessions or tokens associated with the delegation and discard any cached authorization check result for that `authorization_id`.

If the Authority is unreachable, Service SHOULD reject the request rather than allowing it to proceed without verification.

### 4.5. Browser Session Authorization [#s-4-5]

This section defines Service behavior for AgentPass browser sessions.

#### Endpoints

Services expose a base endpoint `service_configuration_url` discovered via DNS and configuration.

- `GET {service_configuration_url}` returns Service configuration.
- Authority Resolution Endpoint: `POST {service_authority_resolution_url}` resolves acceptable Authority(s) for a User email.
- Browser Session Redemption Endpoint: `POST {service_redeem_browser_session_url}` redeems an AgentPass.

#### Browser Session Redemption Endpoint Request Contract

Request/response MUST conform to the `service-redeem-browser-session` schema (Appendix A).

**Required request fields**

Service MUST require:

- `request.agentpass.type`
- `request.agentpass.value`
- `request.authority`
- `request.user.email`

Service SHOULD accept:

- `request.harness_proof`

**Validation algorithm**

Service MUST perform all common validation checks defined in Section 4.4. In addition, Service MUST perform:

8. Destination validation against Service allow-policy.

If any check fails, Service MUST reject redemption and MUST NOT mint initialization state.

#### Browser Session Redemption Endpoint Response Contract

On success, Service MUST return:

- `response.initialization_url`

Service SHOULD return:

- `response.expires_at`
- `response.one_time = true`

**Initialization URL requirements**

`initialization_url` MUST be:

- single-use
- short-lived
- bound to the approved AgentPass redemption context

Service MUST generate initialization state atomically with single-use marking to prevent replay races.

Any browser session established through this flow MUST expire no later than the `authorization_expires_at` returned by the Authority during AgentPass validation or a subsequent authorization check.

#### Browser Session Initialization Endpoint

The initialization URL is obtained from the `initialization_url` field in the browser session redemption response, not from Service configuration. Harnesses use this URL as-is.

The initialization URL embeds the initialization token. The URL structure is an internal implementation detail of the Service.

When handling initialization token, Service MUST:

1. Verify token exists, is unexpired, and is unused.
2. Consume token atomically as used before session finalization.
3. Establish an agent-attributed session for the approved User.
4. Enforce approved destination constraints before redirect.

Service MUST reject:

- unknown token
- expired token
- already-consumed token

Service MUST NOT allow re-use after first successful or failed terminal consumption attempt.

Service SHOULD return HTTP redirect (`302` or `303`) to approved destination after session establishment.

#### Browser and Session Security

Service MUST:

- issue session cookies with secure attributes appropriate for browser security
- prevent open redirect behavior
- set response controls to avoid caching of one-time initialization material

Service SHOULD ensure initialization endpoints are resistant to CSRF and token leakage via referrer or logs.

#### Error Handling

For redemption and initialization endpoints, Service SHOULD return structured JSON errors.

At minimum, error responses SHOULD include:

- machine-readable `code`
- human-readable `message`

Suggested classes:

- `400` malformed request or malformed token
- `401` invalid harness proof (when applicable)
- `403` trust or policy rejection
- `404` unknown initialization token
- `409` single-use conflict / replay
- `410` expired or consumed initialization token
- `422` semantically invalid AgentPass

#### Audit and Attribution

Services SHOULD log:

- request identifier
- User email (from Authority validation response `user.email`)
- Agent identifier (from Authority validation response `agent.id`)
- Task identifier (from Authority validation response `task.id`, when available)
- Authority
- harness identifier (when available)
- redemption/initialization outcome

### 4.6. Bearer Token Authorization [#s-4-6]

This section defines Service behavior for AgentPass bearer token flows.

For bearer-token flows, Services MUST expose and enforce the same authority-resolution behavior defined for browser sessions (the Authority Resolution Endpoint per Section 4.2).

#### Bearer Token Redemption Endpoint Contract

Request/response MUST conform to the `service-redeem-bearer-token` schema (Appendix A).

**Required request fields**

Service MUST require:

- `request.agentpass.type` (`"bearer_token"`)
- `request.agentpass.value`
- `request.authority`
- `request.user.email`

Service SHOULD accept:

- `request.harness_proof`

**Validation algorithm**

Service MUST perform all common validation checks defined in Section 4.4.

If any check fails, Service MUST reject redemption and MUST NOT issue a bearer token.

#### Redemption Response

On success, Service MUST return:

- `response.bearer_token`

Service SHOULD return:

- `response.scope` (granted scope; MUST NOT exceed the scope returned by the Authority)
- `response.expires_in` (seconds until token expiration)

The bearer token format is determined by the Service (JWT, opaque, etc.). Harnesses MUST treat `bearer_token` as opaque.

The granted scope MUST NOT exceed the scope returned by the Authority validation response.

Service MAY re-issue a bearer token for an active delegation based on a successful authorization check (Section 5.5), without requiring the Harness to repeat the full issuance flow.

Any bearer token issued or re-issued by the Service MUST expire no later than the `authorization_expires_at` returned by the Authority during AgentPass validation or a subsequent authorization check.

#### Error Handling

For bearer token redemption, Service SHOULD return structured JSON errors.

Suggested status classes:

- `400` malformed request
- `401` harness proof failure
- `403` trust/policy rejection
- `409` replay/single-use conflict
- `422` invalid AgentPass

#### Audit and Attribution

Services MUST log User, Agent, and Task identifiers from the Authority validation response (`user.email`, `agent.id`, and `task.id` when present).

Services SHOULD enforce enterprise precedence per Section 4.2.

## 5. Authority Protocol [#s-5]

This section is for Authority operators. An Authority governs delegation policy, issues AgentPasses, and exposes endpoints used by Harnesses and Services.

- Trust modes: Section 5.1.
- Discovery and configuration: Section 5.2.
- AgentPass issuance: Section 5.3.
- AgentPass validation: Section 5.4.
- Authorization management: Section 5.5.

This specification does not define how Authorities authenticate Users or gather approval. The Authority is responsible for verifying identity, confirming delegation intent, and enforcing approval policy. Services that trust a Federated Authority accept responsibility for that trust decision.

### 5.1. Trust Modes [#s-5-1]

Each Authority operates in one of three trust modes:

- `enterprise`
- `federated`
- `service`

An Authority MUST declare its `trust_mode` in its configuration (`GET {authority_configuration_url}`).

#### 5.1.1. Enterprise Trust Mode

`trust_mode = "enterprise"` (an **Enterprise Authority**) is intended for organizations that need enterprise control over how their members delegate to agents, including policy enforcement, approval control, and auditable attribution.

To prove its authority, an Enterprise Authority MUST publish an enterprise discovery DNS TXT record for each User email domain it serves (`_agentpass.{user_email_domain}`) (Section 5.2).

#### 5.1.2. Federated Trust Mode

`trust_mode = "federated"` (a **Federated Authority**) is intended as a fallback when an Enterprise Authority does not exist for the User email domain, and the Service elects to trust one or more Federated Authorities by policy.

Federated Authorities MAY be operated by any party that can obtain delegation approval from the User, so long as the Service trusts them to do so. Operators are expected to include, but are not limited to:

- the Harness
- independent authorization applications

Federated Authorities are high-trust dependencies and MUST be explicitly defined in the Service Configuration to be trusted.

#### 5.1.3. Service Trust Mode

`trust_mode = "service"` (a **Service Authority**) is intended for Services that operate their own approval dashboard and issue AgentPasses directly, rather than delegating approval to a Federated Authority.

Trust is inherent: the Service trusts itself, so no explicit trust configuration is needed beyond declaring the Authority in Service Configuration (`trust.service_authority`).

A Service Authority MAY be used even when an Enterprise Authority exists for the User's email domain, subject to the Enterprise Authority's `policy.allow_service_authorities` setting (Section 5.2).

A Service Authority MAY also be returned by the Service Authority Resolution Endpoint when no Enterprise Authority exists for the User's email domain, subject to Service policy.

Service Authorities are not discoverable via User email domain DNS. The Authority Configuration URL is known to the Service because it operates the Authority.

### 5.2. Discovery and Configuration [#s-5-2]

All information that Services and Harnesses need to interact with an Authority is obtained by fetching the authority's configuration document from its **Authority Configuration URL** (`GET {authority_configuration_url}`).

This section defines how an Authority Configuration URL is discovered.

#### 5.2.1. Enterprise Authority Discovery

For a given User email domain, there can be at most one Enterprise Authority.

If an Enterprise Authority exists for a User email domain, its Authority Configuration URL MUST be discoverable via DNS TXT lookup at:

- `_agentpass.{user_email_domain}`

Where `user_email_domain` is derived from `user.email` (the domain portion of the email address).

The TXT value MUST be either:

- an `https://` URL (the **Authority Configuration URL** `{authority_configuration_url}`), or
- the literal string `none` to explicitly disable delegation for that domain.

If the TXT value is a URL, clients MUST fetch the configuration document by calling:

- `GET {authority_configuration_url}`

If the TXT value is `none`, clients MUST treat enterprise discovery as successful-but-disabled and MUST NOT fall back to a federated authority.

**Parsing**

Clients MUST reject records that are neither an `https://` URL nor `none`.

If multiple TXT values exist for a lookup name, clients SHOULD fail unless exactly one value parses successfully.

**Caching**

Clients SHOULD cache DNS TXT records and configuration documents according to their respective TTL values. Clients MUST NOT cache configuration documents indefinitely. Configuration endpoints SHOULD set appropriate `Cache-Control` headers.

**Security notes**

DNS discovery is a bootstrap mechanism and should not be treated as strong identity proof in the absence of DNSSEC.

Clients SHOULD validate DNSSEC when available.

**Transport security**

All HTTPS endpoints in this specification MUST use TLS 1.2 or later. Clients MUST validate server certificates per standard TLS certificate validation rules.

#### 5.2.2. Federated Authority Discovery

Federated Authorities are not discoverable via User email domain DNS.

Operators of Federated Authorities MUST share the Authority Configuration URL with Services out-of-band if they want the authority to be considered for trust by Service policy.

This section defines the JSON configuration document returned by an **Authority Configuration URL**.

For readability, this spec uses the following endpoint name variables derived from this configuration document:

- `{agentpass_issuance_url}` = `endpoints.issuance`
- `{agentpass_issuance_status_url_template}` = `endpoints.issuance_status`
- `{agentpass_validate_url}` = `endpoints.validate`
- `{agentpass_authorization_check_url}` = `endpoints.authorization_check`

#### Example Configuration (Non-Normative)

```json
{
  "version": "0.1",
  "authority": "https://agentpass.example.com",
  "trust_mode": "enterprise",
  "jwks_uri": "https://agentpass.example.com/agentpass-authority/jwks.json",
  "endpoints": {
    "issuance": "https://agentpass.example.com/requests",
    "issuance_status": "https://agentpass.example.com/requests/{id}",
    "validate": "https://agentpass.example.com/validate",
    "authorization_check": "https://agentpass.example.com/authorization-check"
  },
  "policy": {
    "allow_service_authorities": true
  },
  "approval": {
    "modes": ["poll"],
    "default_ttl_seconds": 300
  }
}
```

#### Field Reference

- `version` (required): AgentPass specification version this configuration conforms to (for example, `"0.1"`). Clients MUST reject configurations with unrecognized major versions.
- `authority` (required): HTTPS authority identifier used for trust decisions.
- `trust_mode` (required): `"enterprise"`, `"federated"`, or `"service"`.
- `jwks_uri` (required): JWKS URL used by Services to verify Authority JWT assertions (for example, at the Available Scopes endpoint).
- `endpoints` (required): endpoints used by clients to create AgentPass requests, check their status, validate AgentPasses, and refresh scopes.
- `endpoints.issuance` (required): `POST` AgentPass creation endpoint.
- `endpoints.issuance_status` (required): AgentPass status lookup URL template (includes `{id}`).
- `endpoints.validate` (required): `POST` AgentPass validation endpoint.
- `endpoints.authorization_check` (required): `POST` authorization check and delegation scope refresh endpoint.
- `policy` (optional): policy settings for this Authority.
- `policy.allow_service_authorities` (optional, boolean, default `true`): when `false`, Services MUST NOT use a Service Authority for users of this Enterprise Authority's domain. Only meaningful when `trust_mode` is `"enterprise"`.
- `approval` (optional): non-normative approval hints.
- `approval.modes` (optional): supported approval modes (`poll`).
- `approval.default_ttl_seconds` (optional): default request TTL hint.

JSON schema: see `authority-configuration.schema.json` (Appendix A).

### 5.3. AgentPass Issuance [#s-5-3]

AgentPass issuance endpoint URLs are obtained from the AgentPass configuration document (`GET {authority_configuration_url}`) (Section 5.2).

#### 5.3.1. Issuance Endpoint [#s-5-3-1]

Creates an AgentPass request for delegated access.

Endpoint: `POST {agentpass_issuance_url}` (Section 5.2).

Supported request types:

- AgentPass browser sessions (`type=browser_session`)
- AgentPass bearer tokens (`type=bearer_token`)

Schema: `issuance-request` (Appendix A).

**Request**

Client MUST send JSON body conforming to `issuance-request` schema.

Required fields:

- `type`
- `service.origin`
- `user.email`
- `harness.id`
- `task.id`
- `task.description`

Harness typically obtains the selected authority Authority Configuration URL (`authority_configuration_url`) from the Service Authority Resolution Endpoint (`POST {service_authority_resolution_url}`) response.

For AgentPass browser sessions requests, client SHOULD include `intent.destination_url` when available.

**Task attestation verification**

When the issuance request includes `task.attestation`, the Authority MUST verify the task attestation JWT as defined in Section 3.1.3. If verification succeeds, the Authority records that the task was attested and includes `task.attested = true` in subsequent validation responses (Section 5.4). If verification fails, the Authority MUST reject the issuance request.

**Scope determination**

When the Authority receives an issuance request containing `task.description`, it calls the Service's Available Scopes endpoint (Section 4.3) using `user.email` from the request and the agent identity determined from `harness.id` and attestation to retrieve the scopes available for delegation. The Authority then determines which of the available scopes are appropriate for the described task. Approved scopes are included in the issued AgentPass.

**Response**

Authority SHOULD respond `202 Accepted` with request status payload.

Response payload MUST conform to the `issuance-status` schema (Appendix A).

Authority MAY return immediate terminal status when policy decision is already known.

When `status = approved`:

- Response MUST include `agentpass` regardless of request type.

The `agentpass.value` is an opaque credential. Services validate it by calling the Authority's Validation Endpoint (Section 5.4).

**Errors**

Authority SHOULD return structured JSON errors.

Suggested status classes:

- `400` malformed request
- `401` harness authentication/proof failure
- `403` policy rejection
- `409` request conflict
- `422` semantically invalid request
- `429` rate limited

#### 5.3.2. Issuance Status Endpoint [#s-5-3-2]

Polls the status of a request.

Endpoint: `GET {agentpass_issuance_status_url_template}` (Section 5.2).

Schema: `issuance-status` (Appendix A).

**Request**

Client sends request identifier in path: `{id}`.

**Response**

Authority MUST return JSON payload conforming to `issuance-status` schema.

Defined status values:

- `pending`
- `approved`
- `denied`
- `expired`
- `canceled`

Transition model:

- `pending -> approved | denied | expired | canceled`
- terminal states do not transition further

When `status = pending`, Authority SHOULD include `poll_after_ms`.

When `status = approved`:

- Response MUST provide `agentpass`, regardless of request type.

For browser sessions requests, Harness redeems the AgentPass at the Browser Session Redemption Endpoint (`POST {service_redeem_browser_session_url}`).

For bearer-token requests, Harness redeems the AgentPass at the Bearer Token Redemption Endpoint (`POST {service_redeem_bearer_token_url}`).

**Errors**

Suggested status classes:

- `404` unknown request id
- `410` request expired and unavailable
- `429` poll rate limit exceeded

### 5.4. AgentPass Validation [#s-5-4]

#### 5.4.1. Validation Endpoint [#s-5-4-1]

Validates and atomically consumes an AgentPass. Called by Services during redemption.

Endpoint: `POST {agentpass_validate_url}` (Section 5.2).

Schema: `authority-validate` (Appendix A).

**Authentication**

Service MUST authenticate using a signed JWT assertion with its keys (from Service `jwks_uri`).

Required assertion claims:

- `iss` (string): the Service origin.
- `aud` (string): the Authority identifier.
- `iat` (number): issuance time.
- `exp` (number): expiration time (SHOULD be short-lived).

The assertion MUST be presented in the `Authorization` header:

- `Authorization: Bearer {assertion_jwt}`

Authority MUST validate the assertion signature using the Service's published keys (JWKS), obtained by discovering the Service configuration from the assertion `iss` and fetching its `jwks_uri`.

Authority MUST reject requests with missing, expired, or invalid assertions.

**Request**

Service MUST send a JSON body containing:

- `agentpass.value` (string, required): the opaque AgentPass token.

**Authority behavior**

Authority MUST:

1. Validate Service assertion signature.
2. Look up AgentPass by value.
3. Verify AgentPass is valid, unexpired, and unconsumed.
4. Verify the requesting Service matches the AgentPass's intended audience.
5. Atomically mark AgentPass as consumed.
6. Return delegation details.

**Response**

On success, Authority MUST return JSON conforming to `authority-validate` response schema, including:

- `authorization_id` (string): identifier for this delegation, used for scope refresh queries (Section 5.5).
- `authorization_expires_at` (string): absolute expiration time for this delegation. Services MUST NOT keep delegated credentials valid beyond this timestamp.
- `user.email` (string): User email address.
- `agent.id` (string): Agent identifier, attested by the Authority.
- `scope` (array of strings): approved scopes.
- `type` (string): `"browser_session"` or `"bearer_token"`.

Response MAY include:

- `destination_url` (string): approved destination URL (browser sessions only).
- `cnf` (object): confirmation key material for holder binding.
- `task` (object): task context from the issuance request.
  - `task.id` (string): Task identifier asserted by the Harness.
  - `task.description` (string): Task description from the issuance request.
  - `task.attested` (boolean): `true` if the Authority verified a task attestation JWT (Section 3.1.3) at issuance.

**Errors**

Suggested status classes:

- `400` malformed request
- `401` invalid or missing Service assertion
- `403` Service not authorized for this AgentPass
- `404` unknown AgentPass
- `409` AgentPass already consumed (single-use violation)
- `410` AgentPass expired
- `422` validation failure

### 5.5. Authorization Management [#s-5-5]

The `authorization_id` returned by the Validation Endpoint (Section 5.4) is a durable handle representing an active delegation. Services use it to query the Authority for ongoing authorization decisions — checking whether a delegation is still valid, whether scopes have changed, and whether the delegation has been revoked.

This endpoint serves as the general re-authorization contract between Services and Authorities. Services SHOULD call this endpoint periodically for each active delegated session or bearer token to ensure the delegation remains valid (see Sections 4.5, 4.6).

Services MAY cache successful authorization check results briefly to reduce per-request latency. Services MUST NOT use expired cached results. Caching is intended for per-request latency reduction only — it does not replace periodic re-authorization.

When a delegation is revoked — for example, because an employee is terminated, a compromise is detected, or an administrator withdraws approval — the Authority MUST return `404` for that `authorization_id`. Because Services check delegation validity periodically, revocation takes effect within the cache TTL window.

If the Authority is unreachable, Services SHOULD reject agent requests rather than allowing them to proceed without authorization verification.

#### 5.5.1. Authorization Check Endpoint [#s-5-5-1]

Returns current authorization status and approved scopes for an agent delegation. Called by Services to verify delegation validity and detect scope changes.

Endpoint: `POST {agentpass_authorization_check_url}` (Section 5.2).

Schema: `authority-authorization-check` (Appendix A).

**Authentication**

Service MUST authenticate using a signed JWT assertion with its keys (from Service `jwks_uri`), following the same pattern as the Validation Endpoint (Section 5.4).

**Request**

Service MUST send a JSON body containing:

- `authorization_id` (string, required): the delegation identifier returned by the Validation Endpoint.

**Response**

On success (delegation still active), Authority MUST return JSON conforming to `authority-authorization-check` response schema, including:

- `scope` (array of strings): current approved scopes for this delegation.
- `authorization_expires_at` (string): current absolute expiration time for this delegation.

A successful response indicates the delegation is still active. Services MAY use the returned `scope` to detect scope changes and adjust enforcement accordingly. Services MUST also enforce the returned `authorization_expires_at` as the maximum lifetime of any delegated credentials.

Services MAY use a successful response to re-issue bearer tokens for the delegation without requiring the Harness to repeat the full issuance flow.

**Errors**

Suggested status classes:

- `400` malformed request
- `401` invalid Service assertion
- `404` unknown `authorization_id` or delegation revoked — Service MUST invalidate any sessions or tokens associated with this delegation

#### Error Responses

All endpoints defined in this specification SHOULD return structured JSON error responses on failure. Error responses MUST conform to the `error-response` schema (Appendix A).

## Appendix A. JSON Schemas [#appendix-a]

### `authority-configuration.schema.json` [#schema-authority-configuration]

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Authority Configuration",
  "type": "object",
  "required": [
    "version",
    "authority",
    "trust_mode",
    "jwks_uri",
    "endpoints"
  ],
  "properties": {
    "version": {
      "type": "string",
      "description": "AgentPass specification version this configuration conforms to.",
      "pattern": "^\\d+\\.\\d+$"
    },
    "authority": {
      "type": "string",
      "format": "uri",
      "pattern": "^https://"
    },
    "trust_mode": {
      "type": "string",
      "enum": [
        "enterprise",
        "federated",
        "service"
      ],
      "description": "Trust mode of this Authority. If enterprise, it is discoverable via `_agentpass.{user_email_domain}` where `user_email_domain` is derived from the User email address."
    },
    "jwks_uri": {
      "type": "string",
      "format": "uri",
      "pattern": "^https://"
    },
    "endpoints": {
      "type": "object",
      "required": [
        "issuance",
        "issuance_status",
        "validate",
        "authorization_check"
      ],
      "properties": {
        "issuance": {
          "type": "string",
          "pattern": "^https://"
        },
        "issuance_status": {
          "type": "string",
          "pattern": "^https://"
        },
        "validate": {
          "type": "string",
          "pattern": "^https://"
        },
        "authorization_check": {
          "type": "string",
          "pattern": "^https://"
        }
      },
      "additionalProperties": true
    },
    "policy": {
      "type": "object",
      "properties": {
        "allow_service_authorities": {
          "type": "boolean",
          "description": "When false, Services MUST NOT use a Service Authority for users of this Enterprise Authority's domain. Default: true."
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
              "poll"
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

### `issuance-request.schema.json` [#schema-issuance-request]

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "AgentPass Issuance Request",
  "type": "object",
  "required": [
    "harness",
    "user",
    "service",
    "type",
    "task"
  ],
  "properties": {
    "type": {
      "type": "string",
      "enum": [
        "browser_session",
        "bearer_token"
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
        "email"
      ],
      "properties": {
        "email": {
          "type": "string",
          "format": "email"
        }
      },
      "additionalProperties": true
    },
    "harness": {
      "type": "object",
      "required": [
        "id"
      ],
      "properties": {
        "id": {
          "type": "string",
          "minLength": 1
        },
        "cnf": {
          "type": "object",
          "required": ["jwk"],
          "properties": {
            "jwk": {
              "type": "object",
              "description": "Public key (JWK) for holder binding (Section 3.1.1)."
            }
          },
          "additionalProperties": true
        },
        "attestation": {
          "type": "object",
          "required": ["jwt"],
          "properties": {
            "jwt": {
              "type": "string",
              "description": "Signed JWT from a trusted third party binding a verified agent identity to the holder binding key (Section 3.1.2)."
            }
          },
          "additionalProperties": true
        }
      },
      "additionalProperties": true
    },
    "task": {
      "type": "object",
      "required": ["id", "description"],
      "properties": {
        "id": {
          "type": "string",
          "minLength": 1,
          "description": "Harness-assigned identifier for the task."
        },
        "description": {
          "type": "string",
          "minLength": 1,
          "description": "Free-form natural language description of the task the agent intends to perform."
        },
        "attestation": {
          "type": "object",
          "required": ["jwt"],
          "properties": {
            "jwt": {
              "type": "string",
              "description": "Signed JWT attesting task identity and description hash, signed by the holder binding key (Section 3.1.3)."
            }
          },
          "additionalProperties": true
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

### `issuance-status.schema.json` [#schema-issuance-status]

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "AgentPass Issuance Status",
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
        "browser_session",
        "bearer_token"
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
    "agentpass": {
      "type": "object",
      "required": [
        "type",
        "value"
      ],
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "browser_session",
            "bearer_token"
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
          "agentpass"
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
  "title": "Service Authority Resolution Request/Response",
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
        "enterprise_authority": {
          "type": "object",
          "required": [
            "authority",
            "authority_configuration_url"
          ],
          "properties": {
            "authority": {
              "type": "string",
              "format": "uri",
              "pattern": "^https://"
            },
            "authority_configuration_url": {
              "type": "string",
              "format": "uri",
              "pattern": "^https://"
            }
          },
          "additionalProperties": true
        },
        "trusted_federated_authorities": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "authority",
              "authority_configuration_url"
            ],
            "properties": {
              "authority": {
                "type": "string",
                "format": "uri",
                "pattern": "^https://"
              },
              "authority_configuration_url": {
                "type": "string",
                "format": "uri",
                "pattern": "^https://"
              }
            },
            "additionalProperties": true
          },
          "minItems": 1
        },
        "service_authority": {
          "type": "object",
          "required": [
            "authority",
            "authority_configuration_url"
          ],
          "properties": {
            "authority": {
              "type": "string",
              "format": "uri",
              "pattern": "^https://"
            },
            "authority_configuration_url": {
              "type": "string",
              "format": "uri",
              "pattern": "^https://"
            }
          },
          "additionalProperties": true
        }
      },
      "oneOf": [
        {
          "required": ["enterprise_authority"]
        },
        {
          "required": ["trusted_federated_authorities"]
        },
        {
          "required": ["service_authority"]
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
  "title": "Service Configuration",
  "type": "object",
  "required": [
    "version",
    "kind",
    "service",
    "jwks_uri",
    "trust",
    "endpoints"
  ],
  "properties": {
    "version": {
      "type": "string",
      "description": "AgentPass specification version this configuration conforms to.",
      "pattern": "^\\d+\\.\\d+$"
    },
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
    "jwks_uri": {
      "type": "string",
      "format": "uri",
      "pattern": "^https://",
      "description": "JWKS URL for Service request signing. Used by Authorities to verify Service identity."
    },
    "trust": {
      "type": "object",
      "properties": {
        "trusted_federated_authorities": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "authority",
              "authority_configuration_url"
            ],
            "properties": {
              "authority": {
                "type": "string",
                "format": "uri",
                "pattern": "^https://"
              },
              "authority_configuration_url": {
                "type": "string",
                "format": "uri",
                "pattern": "^https://"
              }
            },
            "additionalProperties": true
          },
          "minItems": 1,
          "uniqueItems": true
        },
        "service_authority": {
          "type": "object",
          "required": [
            "authority",
            "authority_configuration_url"
          ],
          "properties": {
            "authority": {
              "type": "string",
              "format": "uri",
              "pattern": "^https://"
            },
            "authority_configuration_url": {
              "type": "string",
              "format": "uri",
              "pattern": "^https://"
            }
          },
          "additionalProperties": true
        }
      },
      "additionalProperties": true
    },
    "endpoints": {
      "type": "object",
      "required": [
        "resolve_authorities",
        "redeem_browser_session",
        "redeem_bearer_token",
        "available_scopes"
      ],
      "properties": {
        "resolve_authorities": {
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
        "available_scopes": {
          "type": "string",
          "pattern": "^https://"
        }
      },
      "additionalProperties": true
    }
  },
  "additionalProperties": true
}
```

### `service-redeem-browser-session.schema.json` [#schema-service-redeem-browser-session]

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Service Browser Session Redemption Request/Response",
  "type": "object",
  "properties": {
    "request": {
      "type": "object",
      "required": [
        "agentpass",
        "authority",
        "user"
      ],
      "properties": {
        "agentpass": {
          "type": "object",
          "required": [
            "type",
            "value"
          ],
          "properties": {
            "type": {
              "type": "string",
              "const": "browser_session"
            },
            "value": {
              "type": "string",
              "minLength": 1
            }
          },
          "additionalProperties": true
        },
        "authority": {
          "type": "string",
          "format": "uri",
          "pattern": "^https://",
          "description": "Authority identifier from the Authority's configuration document."
        },
        "harness_proof": {
          "type": "object",
          "required": ["jwt"],
          "properties": {
            "jwt": {
              "type": "string",
              "description": "Signed JWT proving possession of the holder binding key (Section 3.1.1)."
            }
          },
          "additionalProperties": true
        },
        "user": {
          "type": "object",
          "required": ["email"],
          "properties": {
            "email": {
              "type": "string",
              "format": "email",
              "description": "User email used by Services for enterprise precedence domain derivation."
            }
          },
          "additionalProperties": true
        },
        "requested_scope": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Optional scope downgrade. When present, Service computes the intersection with Authority-approved scope and grants only the intersection."
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
  "title": "Service Bearer Token Redemption Request/Response",
  "type": "object",
  "properties": {
    "request": {
      "type": "object",
      "required": ["agentpass", "authority", "user"],
      "properties": {
        "agentpass": {
          "type": "object",
          "required": ["type", "value"],
          "properties": {
            "type": { "type": "string", "const": "bearer_token" },
            "value": { "type": "string", "minLength": 1 }
          },
          "additionalProperties": true
        },
        "authority": {
          "type": "string",
          "format": "uri",
          "pattern": "^https://",
          "description": "Authority identifier from the Authority's configuration document."
        },
        "harness_proof": {
          "type": "object",
          "required": ["jwt"],
          "properties": {
            "jwt": {
              "type": "string",
              "description": "Signed JWT proving possession of the holder binding key (Section 3.1.1)."
            }
          },
          "additionalProperties": true
        },
        "user": {
          "type": "object",
          "required": ["email"],
          "properties": {
            "email": { "type": "string", "format": "email" }
          },
          "additionalProperties": true
        },
        "requested_scope": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Optional scope downgrade. When present, Service computes the intersection with Authority-approved scope and grants only the intersection."
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
          "type": "array",
          "items": { "type": "string" }
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
  "title": "Service Available Scopes",
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

### `authority-validate.schema.json` [#schema-authority-validate]

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Authority AgentPass Validation Request/Response",
  "type": "object",
  "properties": {
    "request": {
      "type": "object",
      "required": ["agentpass"],
      "properties": {
        "agentpass": {
          "type": "object",
          "required": ["value"],
          "properties": {
            "value": { "type": "string", "minLength": 1 }
          },
          "additionalProperties": true
        }
      },
      "additionalProperties": true
    },
    "response": {
      "type": "object",
      "required": [
        "authorization_id",
        "authorization_expires_at",
        "user",
        "agent",
        "scope",
        "type"
      ],
      "properties": {
        "authorization_id": {
          "type": "string",
          "minLength": 1
        },
        "authorization_expires_at": {
          "type": "string",
          "format": "date-time"
        },
        "user": {
          "type": "object",
          "required": ["email"],
          "properties": {
            "email": {
              "type": "string",
              "format": "email"
            }
          },
          "additionalProperties": true
        },
        "agent": {
          "type": "object",
          "required": ["id"],
          "properties": {
            "id": { "type": "string", "minLength": 1 }
          },
          "additionalProperties": true
        },
        "scope": {
          "type": "array",
          "items": { "type": "string" }
        },
        "type": {
          "type": "string",
          "enum": ["browser_session", "bearer_token"]
        },
        "destination_url": {
          "type": "string",
          "format": "uri",
          "pattern": "^https://"
        },
        "cnf": {
          "type": "object",
          "required": ["jwk"],
          "properties": {
            "jwk": {
              "type": "object",
              "description": "Public key (JWK) for holder binding verification (Section 3.1.1)."
            }
          },
          "additionalProperties": true
        },
        "task": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string",
              "minLength": 1,
              "description": "Task identifier asserted by the Harness."
            },
            "description": {
              "type": "string",
              "description": "Task description from the issuance request."
            },
            "attested": {
              "type": "boolean",
              "description": "True if the Authority verified a task attestation JWT at issuance (Section 3.1.3)."
            }
          },
          "additionalProperties": true
        }
      },
      "additionalProperties": true
    }
  },
  "additionalProperties": true
}
```

### `authority-authorization-check.schema.json` [#schema-authority-authorization-check]

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Authority Authorization Check Request/Response",
  "type": "object",
  "properties": {
    "request": {
      "type": "object",
      "required": ["authorization_id"],
      "properties": {
        "authorization_id": {
          "type": "string",
          "minLength": 1
        }
      },
      "additionalProperties": true
    },
    "response": {
      "type": "object",
      "required": ["scope", "authorization_expires_at"],
      "properties": {
        "scope": {
          "type": "array",
          "items": { "type": "string" }
        },
        "authorization_expires_at": {
          "type": "string",
          "format": "date-time"
        }
      },
      "additionalProperties": true
    }
  },
  "additionalProperties": true
}
```

### `error-response.schema.json` [#schema-error-response]

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Error Response",
  "type": "object",
  "required": ["error"],
  "properties": {
    "error": {
      "type": "object",
      "required": ["code", "message"],
      "properties": {
        "code": {
          "type": "string",
          "minLength": 1,
          "description": "Machine-readable error code."
        },
        "message": {
          "type": "string",
          "description": "Human-readable error description."
        }
      },
      "additionalProperties": true
    }
  },
  "additionalProperties": true
}
```

## Appendix B. JSON Examples [#appendix-b]

### `service-authority-resolution-enterprise.json` [#example-enterprise-resolution]

```json
{
  "request": {
    "user": {
      "email": "alex@example.com"
    }
  },
  "response": {
    "enterprise_authority": {
      "authority": "https://agentpass.example.com",
      "authority_configuration_url": "https://agentpass.example.com/ap"
    }
  }
}
```

### `service-authority-resolution-service.json` [#example-service-resolution]

```json
{
  "request": {
    "user": {
      "email": "alex@example.com"
    }
  },
  "response": {
    "service_authority": {
      "authority": "https://api.example.com/agentpass",
      "authority_configuration_url": "https://api.example.com/agentpass/ap"
    }
  }
}
```

### `service-authority-resolution-federated.json` [#example-federated-resolution]

```json
{
  "request": {
    "user": {
      "email": "alex@no-agentpass-domain.example"
    }
  },
  "response": {
    "trusted_federated_authorities": [
      {
        "authority": "https://codex.example.com",
        "authority_configuration_url": "https://codex.example.com/ap"
      },
      {
        "authority": "https://claude-code.example.com",
        "authority_configuration_url": "https://claude-code.example.com/ap"
      }
    ]
  }
}
```

### `authority-issuance-request.json` [#example-issuance-request]

```json
{
  "type": "bearer_token",
  "service": {
    "origin": "https://api.example.com"
  },
  "user": {
    "email": "alex@example.com"
  },
  "harness": {
    "id": "agent:build-bot-7f2c",
    "cnf": {
      "jwk": {
        "kty": "EC",
        "crv": "P-256",
        "x": "f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU",
        "y": "x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0"
      }
    }
  },
  "task": {
    "id": "task_9a8b7c6d5e4f",
    "description": "Triage and respond to open support tickets",
    "attestation": {
      "jwt": "eyJhbGciOiJFUzI1NiJ9.eyJpc3MiOiJhZ2VudDpidWlsZC1ib3QtN2YyYyIsInRhc2tfaWQiOiJ0YXNrXzlhOGI3YzZkNWU0ZiIsInRhc2tfZGVzY3JpcHRpb25faGFzaCI6ImE3ZmZjNmYwMzhjNDMyOTBhZmQzYTU4OGY4N2EyMjRjIiwiaWF0IjoxNzA1MzA5MjAwLCJleHAiOjE3MDUzMDk1MDB9.signature"
    }
  }
}
```

### `service-redeem-browser-session.json` [#example-redeem-browser-session]

```json
{
  "request": {
    "agentpass": {
      "type": "browser_session",
      "value": "ap_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8..."
    },
    "authority": "https://agentpass.example.com",
    "user": {
      "email": "colin@example.com"
    },
    "requested_scope": ["dashboard:view"]
  },
  "response": {
    "initialization_url": "https://api.example.com/init?token=tok_9f8e7d6c5b4a...",
    "expires_at": "2025-01-15T12:05:00Z",
    "one_time": true
  }
}
```

### `service-redeem-bearer-token.json` [#example-redeem-bearer-token]

```json
{
  "request": {
    "agentpass": {
      "type": "bearer_token",
      "value": "ap_b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8..."
    },
    "authority": "https://agentpass.example.com",
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

### `authority-validate.json` [#example-authority-validate]

```json
{
  "request": {
    "agentpass": {
      "value": "ap_8f3a1b2c4d5e6f7a8b9c0d1e2f3a4b5c6d7e..."
    }
  },
  "response": {
    "authorization_id": "authz_a1b2c3d4e5f6",
    "authorization_expires_at": "2025-01-15T13:00:00Z",
    "user": { "email": "alex@example.com" },
    "agent": { "id": "build-bot-7f2c" },
    "scope": ["dashboard:view", "tickets:read"],
    "type": "browser_session",
    "destination_url": "https://api.example.com/dashboard",
    "task": {
      "id": "task_9a8b7c6d5e4f",
      "description": "Triage and respond to open support tickets",
      "attested": true
    }
  }
}
```

### `authority-authorization-check.json` [#example-authority-authorization-check]

```json
{
  "request": {
    "authorization_id": "authz_a1b2c3d4e5f6"
  },
  "response": {
    "scope": ["dashboard:view", "tickets:read", "tickets:comment"],
    "authorization_expires_at": "2025-01-15T13:00:00Z"
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
    },
    "task": {
      "id": "task_9a8b7c6d5e4f",
      "description": "Triage and respond to open support tickets"
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
