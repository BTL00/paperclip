# Project environment selection

## Outcome and delivery

Tasks use their project's saved execution environment, including Daytona resource
configuration. Deliver one reviewed PR with passing checks. After that PR is
ready, create the requested `Daytona Paperclip Coding` environment with a 30 GiB
disk on the user's staging instance. Configuration creation and deployment of
the PR are separate states and must be reported accurately.

## Owning contracts

- Project settings store an environment reference in the existing
  `executionWorkspacePolicy.environmentId` field. Resource sizes stay on the
  referenced environment. No new schema or migration is needed.
- Environment selection belongs to the shared execution policy and heartbeat
  environment-selection module. The task's organizational project supplies this
  default independently of the project supplying its files or checkout settings.
- Priority: explicit low-trust task environment, task project, agent, instance,
  local fallback. Managed-only and forced Kubernetes restrictions still apply.
- External personal-assistant controllers retain their existing placement.
- Existing admitted runs keep their recorded runtime and recovery obligations.
  New admissions use the current project choice; old disks are not resized.
- Daytona owns image/snapshot resource semantics. Image creation forwards the
  selected disk size. A snapshot uses its captured allocation.

## Acceptance matrix

| Journey/state | Required evidence |
| --- | --- |
| Save and reload a project environment | Real project API persistence and visible UI selection; no checkout feature dependency |
| Project overrides agent and instance | Resolver regression and assembled heartbeat dispatch/lease evidence |
| Project has no codebase or uses another project's files | Task project's environment still wins |
| Clear selection, missing project, projectless work | Existing agent/instance fallback remains |
| Low-trust, managed-only, forced Kubernetes | Existing restrictions win; invalid choices cannot cause local fallback |
| Archived/deleted/unbound environment | Existing validation rejects it; selection does not silently change targets |
| Daytona image provisioning | Production provider receives the project's config; live provider reports 30 GiB and command executes there |
| Snapshot provisioning | Overrides are not falsely claimed to resize a snapshot |
| Recovery and environment changes | Existing admission/lease ownership remains effective; no replay or data loss |

## Feedback and verification

First reproduce the ignored project selection with targeted resolver and
PostgreSQL-backed selection tests. Then exercise persistence and assembled
heartbeat dispatch, UI save/clear states, Daytona provisioning and live provider
execution. Run token/map checks and the required repo typecheck, test and build
gates before PR handoff. Preserve failed attempts and report any unverified
boundary. Keep private credentials, tenant identifiers and live evidence out of
public fixtures and the PR description.

## Progress

- Confirmed existing resource schema and unused project environment selection.
- Dedicated branch: `codex/project-environment-selection`.
- Reproduced ignored project placement and hidden UI with failing regressions.
- Found and fixed the project parser dropping environment references on reads.
- Resolver, UI, API, simulated Daytona resource/lease and real local process
  coverage pass. The process cases cover disabled/enabled checkout policy,
  another project's files, and clearing to agent inheritance on a new task.
- Repository typecheck, build, map, module boundary and UI token checks pass.
  The full test suite is running.
- A live 30 GiB create reached Daytona and was rejected by the credential's
  organization-level 10 GiB per-sandbox cap. A read confirmed no allocation was
  left behind. This does not establish that the user's hosted instance has the
  same Daytona account or limit. Live 30 GiB qualification remains blocked by
  that external cap; the configured-resource tests use a simulated SDK boundary.
- The browser save/reload walkthrough and PR review remain in progress.
