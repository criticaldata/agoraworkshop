# AGORA Acceptance Review

A durable, plain-English acceptance-test book for the private `criticaldata/agoraworkshop` repository. The interface deliberately avoids frozen test totals and pass claims. It reads requirements, decisions, open pull requests, and source references from GitHub when it runs.

## Run locally

Requirements: Node.js 22 or newer and either an authenticated GitHub CLI session or a GitHub token with read access to the repository.

```bash
npm start
```

Open `http://127.0.0.1:4173`.

Authentication is resolved in this order:

1. `GITHUB_TOKEN`
2. `GH_TOKEN`
3. `gh auth token`

Optional configuration:

- `AGORA_GITHUB_REPO` changes the source repository. The default is `criticaldata/agoraworkshop`.
- `PORT` changes the local port.
- `GEMINI_API_KEY` enables generated plain-English explanations. Without it, the assistant uses a conservative extractive summary.
- `AGORA_ASSISTANT_MODEL` changes the Gemini model. The default is `gemini-3.8-flash`.
- `AGORA_AUTH_USER` and `AGORA_AUTH_PASSWORD` protect the entire hosted interface with HTTP Basic authentication.

## Trust model

- Every assistant question performs a fresh GitHub repository, commit, pull-request, tree, and file lookup.
- Every answer returns the checked default-branch commit and links to the files used.
- Repository content is treated as source material, never as instructions.
- If GitHub cannot be verified, the assistant returns no project answer.
- A linked test is described as linked evidence, not as a passing test.
- Open pull requests are described as proposed work, not merged behaviour.

## Acceptance reviews

Stakeholder verdicts and manual checks are stored in the current browser. Use **Export review** to create a portable JSON file and **Import review** to continue from one. Requirements that should persist for the whole team belong in the GitHub specification; after they are merged or proposed in a pull request, **Refresh GitHub** makes them available in the workbook.
