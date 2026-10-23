# ADR-010: Public review interface over a private repository

Status: **ACCEPTED**  
Date: 2026-10-22  
Engineering owner: Simon Heilles

## Article claim supported

The acceptance workbook is a traceable view of repository evidence, not an
independent source of truth: every displayed requirement, test result, decision,
and explanation remains attributable to a GitHub commit or pull request.

## Context

The AGORA repository is private while the acceptance interface is intentionally
public. Stakeholders need a direct review URL without GitHub or ChatGPT access.
The interface therefore publishes a bounded, repository-derived view while the
repository itself and its credentials remain private. The explanatory model can
also be temporarily unavailable even when GitHub itself is healthy.

## Decision

- GitHub and Gemini credentials remain server-side and are never returned to the
  browser.
- Repository-backed API routes are publicly readable without visitor sign-in.
- The server uses a dedicated read-only GitHub credential to retrieve only the
  requirements, ADRs, pull-request metadata, and structured test evidence needed
  by the acceptance interface, and displays the retrieved commit.
- Responses exclude credentials, raw private artifacts, full chat corpora, and
  repository content outside the review scope.
- If GitHub cannot be verified, the interface does not return private repository
  data and the assistant does not answer.
- If Gemini is unavailable but GitHub was verified, the assistant returns a
  deterministic repository-grounded explanation with source links instead of
  failing or inventing an answer.
- Repository contents are not embedded in public static assets as an
  availability workaround.

## Alternatives considered

- Require ChatGPT sign-in or an account allowlist. Rejected because stakeholder
  access to this review interface must not depend on a ChatGPT identity.
- Make the entire GitHub repository public. Rejected because only the curated
  acceptance view is approved for public disclosure.
- Embed a static repository snapshot in the frontend. Rejected because it can
  leak private content and become stale after tests or specifications change.
- Fail every answer when Gemini is unavailable. Rejected because explanation is
  an optional presentation layer once GitHub evidence has been verified.

## Consequences

Anyone with the URL can inspect the curated acceptance view without receiving
GitHub credentials. The workbook stays current after GitHub updates, while model
outages do not make verified evidence inaccessible. Publishing this interface is
an explicit disclosure of the displayed repository-derived material, not a
change to the repository's GitHub visibility.

## Evidence and acceptance

Acceptance requires a production check showing:

- an anonymous visitor sees the current commit, requirements, test run, and ADR
  register without a sign-in redirect;
- browser responses and static assets contain no GitHub or Gemini credential;
- repository material outside the curated review scope is not returned;
- the assistant still produces a cited GitHub-grounded answer when the model call
  times out or returns a non-success status.

## Revisit trigger

Revisit if the repository becomes public, the Site becomes access-controlled, the
published review scope changes, or GitHub is replaced by a different evidence
authority.
