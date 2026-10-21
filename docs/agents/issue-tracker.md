# Issue Tracker: GitHub

Issues and PRDs live in GitHub Issues. Use the repository's configured GitHub remote; `gh` resolves it from the repo root. Confirm the target when multiple remotes make ownership ambiguous rather than using a hardcoded repository name.

Read an issue with `gh issue view <number> --comments`; use `gh issue list` to find relevant tickets. Reading context does not authorize creating, commenting on, relabeling or closing an issue.

For tracker writes, use authorization from the current request or an explicitly invoked workflow that includes publication. An incidental reference in a skill is not permission to publish. Prepare the exact title/body/labels locally before any approval needed for publication. Use a body file for multiline issue text and the [triage mapping](triage-labels.md) for labels. Tracker authorization does not authorize Git commit/push/PR creation, merge, release, deployment, remote SQL/provider administration, financial actions, live-data access or existing-local-database reset.
