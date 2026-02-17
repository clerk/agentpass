# 1. Introduction

AgentPass is an open specification for governed delegation of authority from Users to agents.

This specification covers:

- Delegation and approval
- AgentPass Browser Sessions
- AgentPass Bearer Tokens
- Runtime and Service Provider integration
- Authoritative vs federated trust modes

## Actors

- **User:** the Service Provider account an agent is delegated to operate on behalf of.
- **Agent:** the software identity acting on the User's behalf.
- **Runtime:** the execution environment that requests and presents AgentPass artifacts/tokens.
- **AgentPass deployment:** the system that governs delegation, approvals, and artifact/token issuance.
- **Service Provider:** the application being accessed.

## High-Level Delegation Flow

1. Runtime discovers whether a Service Provider supports AgentPass (DNS TXT -> `service_provider_configuration_url`, then `GET {service_provider_configuration_url}` for configuration).
2. Runtime calls Service Provider `POST {service_provider_configuration_url}/resolve-deployments` with User email.
3. Service Provider determines whether an authoritative AgentPass deployment is configured for the User domain and returns either a required authoritative deployment or a set of explicitly trusted federated deployment options.
4. Runtime uses the required deployment or prompts a human operator to select from the trusted options, then requests delegated access from the selected deployment.
5. Runtime obtains asynchronous approval status (polling REQUIRED; push MAY be supported).
6. Runtime redeems approved artifact/token at the Service Provider.
7. For AgentPass Browser Sessions, runtime loads `initialization_url` in the emulated browser and establishes an agent-attributed session.

## Document Structure

- Section 2 defines notational conventions.
- Section 2.1 defines terms used throughout the document.
- Section 3 defines how to operate AgentPass.
- Section 4 defines runtime integration requirements and flows.
- Section 5 defines Service Provider integration requirements and flows.

