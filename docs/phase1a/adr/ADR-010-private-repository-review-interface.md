# ADR-010: Private repository access in the review interface

Status: **ACCEPTED**  
Date: 2026-10-22  
Engineering owner: Simon Heilles

## Article claim supported

The acceptance workbook is a traceable view of repository evidence, not an
independent source of truth: every displayed requirement, test result, decision,
and explanation remains attributable to a GitHub commit or pull request.

## Context

The AGORA repository is private while the review interface has a public URL for
stakeholder access. An opaque user-ID allowlist rejected legitimate signed-in
users and left the workbook empty. The explanatory model can also be temporarily
unavailable even when GitHub itself is healthy.

## Decision

- GitHub and Gemini credentials remain server-side and are never returned to the
  browser.
- Repository-backed API routes require ChatGPT sign-in and accept a visitor only
  when either their stable Site user ID or normalized signed-in email appears in
  the server-side allowlist.
- The workbook reads requirements, ADRs, pull requests, and structured test
  evidence from GitHub after access is granted, and displays the retrieved commit.
- If GitHub cannot be verified, the interface does not return private repository
  data and the assistant does not answer.
- If Gemini is unavailable but GitHub was verified, the assistant returns a
  deterministic repository-grounded explanation with source links instead of
  failing or inventing an answer.
- Repository contents are not embedded in public static assets as a workaround
  for authentication or availability failures.

## Alternatives considered

- Make repository-backed APIs anonymous. Rejected because the public Site shell
  must not make a private repository public.
- Embed a static repository snapshot in the frontend. Rejected because it can
  leak private content and become stale after tests or specifications change.
- Fail every answer when Gemini is unavailable. Rejected because explanation is
  an optional presentation layer once GitHub evidence has been verified.

## Consequences

Authorized stakeholders can use a stable public URL without receiving GitHub
credentials. The workbook stays current after GitHub updates, while model outages
do not make verified evidence inaccessible. New stakeholder accounts must be
added deliberately to the server-side allowlist.

## Evidence and acceptance

Acceptance requires a production check showing:

- an anonymous request receives no private repository data;
- an unauthorized signed-in visitor is rejected;
- an authorized signed-in visitor sees the current commit, requirements, test
  run, decision register, and ADR register;
- the assistant still produces a cited GitHub-grounded answer when the model call
  times out or returns a non-success status.

## Revisit trigger

Revisit if the repository becomes public, the Site moves to workspace-wide access,
or GitHub is replaced by a different evidence authority.
