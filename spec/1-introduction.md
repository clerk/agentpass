# 1. Introduction

AgentPass is an open specification for governed delegation of authority from humans to agents.

This specification covers:

- Delegation and approval
- AgentPass Browser Sessions
- AgentPass Bearer Tokens
- Runtime and Service Provider integration
- Authoritative vs federated trust modes

## Actors

- **Delegating Principal:** the human delegating authority.
- **Agent Principal:** the software identity acting on the delegating principal's behalf.
- **Runtime:** the execution environment that requests and presents AgentPass artifacts/tokens.
- **AgentPass Authority:** the authority system that governs delegation, approvals, and artifact/token issuance.
- **Service Provider:** the application being accessed.

## High-Level Delegation Flow

1. Runtime discovers whether a Service Provider supports AgentPass (DNS TXT -> `e`, then `GET {e}` for metadata).
2. Runtime calls Service Provider `POST {e}/resolve-authority` with delegating principal email.
3. Service Provider determines whether an Authoritative AgentPass is configured for the Delegating Principal and returns `trust_mode` with either a resolved authoritative authority or trusted federated authority options.
4. Runtime selects authority from Service Provider response and requests delegated access from that authority.
5. Runtime obtains asynchronous approval status (polling REQUIRED; push MAY be supported).
6. Runtime redeems approved artifact/token at the Service Provider.
7. For AgentPass Browser Sessions, runtime loads `initialization_url` in the emulated browser and establishes an agent-attributed session.

## Document Structure

- Section 2 defines notational conventions.
- Section 2.1 defines terms used throughout the document.
- Section 3 defines how to operate AgentPass.
- Section 4 defines runtime integration requirements and flows.
- Section 5 defines Service Provider integration requirements and flows.
