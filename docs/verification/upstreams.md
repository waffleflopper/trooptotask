# Verification toolkit upstreams

These pinned sources informed TroopToTask's small, project-owned skills and browser wrapper. Their ideas were adapted to the [retained contracts](../stabilization/BASELINE.md#retained-contracts) and [Definition of Done](../architecture/DEFINITION_OF_DONE.md#verification-contract); upstream skill prose and Cursor orchestration machinery were not copied.

| Source                          | Adopted revision                                                 | License                        |
| ------------------------------- | ---------------------------------------------------------------- | ------------------------------ |
| [pstack][pstack]                | `ecc249f1e306`, `0.15.5`                                         | [MIT][pstack-license]          |
| [Cursor Team Kit][team-kit]     | `ecc249f1e306`, `1.2.0`                                          | [MIT][team-kit-license]        |
| [Chrome DevTools MCP][devtools] | npm `1.10.1`, gitHead `e52c6b59b476c5e04d8dd9fd4bd017ba3b3d65df` | [Apache-2.0][devtools-license] |
| [MCP TypeScript SDK][sdk]       | npm `1.30.1`, gitHead `289ac2c3af7e1536160e80414296b175171a1a87` | MIT                            |
| [Puppeteer browsers][browsers]  | npm `3.2.3`, gitHead `15684eb7f1adf98c1c0c4a5d23a154b7995e947e`  | Apache-2.0                     |

[pstack]: https://github.com/cursor/plugins/tree/ecc249f1e306fc64ddf83c7bed16cacf7c2239db/pstack
[pstack-license]: https://github.com/cursor/plugins/blob/ecc249f1e306fc64ddf83c7bed16cacf7c2239db/pstack/LICENSE
[team-kit]: https://github.com/cursor/plugins/tree/ecc249f1e306fc64ddf83c7bed16cacf7c2239db/cursor-team-kit
[team-kit-license]: https://github.com/cursor/plugins/blob/ecc249f1e306fc64ddf83c7bed16cacf7c2239db/cursor-team-kit/LICENSE
[devtools]: https://github.com/ChromeDevTools/chrome-devtools-mcp/tree/e52c6b59b476c5e04d8dd9fd4bd017ba3b3d65df
[devtools-license]: https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/e52c6b59b476c5e04d8dd9fd4bd017ba3b3d65df/LICENSE
[sdk]: https://www.npmjs.com/package/@modelcontextprotocol/sdk/v/1.30.1
[browsers]: https://www.npmjs.com/package/@puppeteer/browsers/v/3.2.3

pstack and Team Kit informed the workflow skills; DevTools supplies native interaction and inspection tools. The MCP SDK powers the project's stdio proxy, and Puppeteer browsers provisions Chrome for Testing.

The author's [pstack Part 1](https://threadnavigator.com/thread/2094457600259842065/) and [Part 2](https://threadnavigator.com/thread/2097732320606507506/) explain why repeatable live verification comes first. The relevant upstream details are [create verification](https://github.com/cursor/plugins/blob/ecc249f1e306fc64ddf83c7bed16cacf7c2239db/pstack/skills/create-verification-skill/SKILL.md), [maintain verification](https://github.com/cursor/plugins/blob/ecc249f1e306fc64ddf83c7bed16cacf7c2239db/pstack/skills/maintain-verification-skill/SKILL.md), [Build the Lever](https://github.com/cursor/plugins/blob/ecc249f1e306fc64ddf83c7bed16cacf7c2239db/pstack/skills/principle-build-the-lever/SKILL.md), and [Encode Lessons in Structure](https://github.com/cursor/plugins/blob/ecc249f1e306fc64ddf83c7bed16cacf7c2239db/pstack/skills/principle-encode-lessons-in-structure/SKILL.md). Team Kit's [control-ui](https://github.com/cursor/plugins/blob/ecc249f1e306fc64ddf83c7bed16cacf7c2239db/cursor-team-kit/skills/control-ui/SKILL.md), [verify-this](https://github.com/cursor/plugins/blob/ecc249f1e306fc64ddf83c7bed16cacf7c2239db/cursor-team-kit/skills/verify-this/SKILL.md), [review-and-ship](https://github.com/cursor/plugins/blob/ecc249f1e306fc64ddf83c7bed16cacf7c2239db/cursor-team-kit/skills/review-and-ship/SKILL.md), and [make-pr-easy-to-review](https://github.com/cursor/plugins/blob/ecc249f1e306fc64ddf83c7bed16cacf7c2239db/cursor-team-kit/skills/make-pr-easy-to-review/SKILL.md) informed the proportionate skill entrypoints. We use neither Playwright nor the upstream [experimental background CLI](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/e52c6b59b476c5e04d8dd9fd4bd017ba3b3d65df/docs/cli.md). The pstack ten-lane PR plan and cloud/Graphite orchestrator are outside this two-worker local workflow.

The [published DevTools package](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/e52c6b59b476c5e04d8dd9fd4bd017ba3b3d65df/package.json) needs Node `^20.19.0 || ^22.12.0 || >=23`; this repository targets Node 24 and npm 11. The wrapper also needs Python 3, Docker, the Supabase CLI, and Chrome 149 or newer because [allowed URL patterns](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/e52c6b59b476c5e04d8dd9fd4bd017ba3b3d65df/docs/configuration.md) need Chrome 149. It can provision Chrome for Testing `154.0.8037.57`. It launches a private profile, restricts browser origins, redacts network headers, and disables usage statistics and CrUX lookup. Process ownership checks currently inspect Linux `/proc`; do not assume the local supervisor works on macOS. Consult `package.json` and `npm run verify:app -- --help` for the current executable surface.

The separately inspected upstream head, [`ae0aaef`](https://github.com/ChromeDevTools/chrome-devtools-mcp/compare/e52c6b59b476c5e04d8dd9fd4bd017ba3b3d65df...ae0aaef884c41445d83f86f099ef211f4584b791), is newer than the installed release. It adds rejection of regex-group URL allow/block patterns, a memory analysis tool, and CLI default changes; do not attribute those to npm `1.10.1`. This wrapper uses exact origin patterns and the release's stable page, snapshot, network, console, screenshot, and trace tools. Versions and integrity are pinned in `package-lock.json`.

The CLI works without live Codex MCP registration. [Official Codex MCP documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) supports a project-scoped `.codex/config.toml`; this repository has the following entry for the owned worker. Start the worker before connecting. No global user settings change is needed.

```toml
[mcp_servers.trooptotask-verification]
command = "npm"
args = ["run", "--silent", "verify:app", "--", "mcp"]
startup_timeout_sec = 30
tool_timeout_sec = 180
```

The upstream [Codex configuration example](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/e52c6b59b476c5e04d8dd9fd4bd017ba3b3d65df/docs/client-configurations.md) registers the upstream server, not this project wrapper; a running T3 session may need to reload tools before the project entry appears. `codex mcp list` recognizes the project entry. On 2026-09-26, a delegated Sol 6 xhigh session read the upstreams and authored these instructions, establishing runner availability rather than browser proof. An Astra primary with an Astra reviewer gets independent executions, not model diversity. Local Chrome/Docker/Supabase startup and all `prove` outcomes require actual commands and candidate-bound receipts.

Also inspected at the pinned pstack revision: `how`, `why`, `teach`, `blast-radius`, `architect`, `prototype`, `refactoring`, multi-phase planning, figure-it-out, and orchestration guidance. Their useful parts became the investigation, uncertain-design, fixed-outcome, verification, and review modes in [t2t-engineer](../../.agents/skills/t2t-engineer/SKILL.md), rather than separate overlapping prompt libraries.

## Runner and setup

Project skills live in `.agents/skills/<name>/SKILL.md`; the repository instructions link the two local entry points so an existing session can read them directly. Start a fresh agent session if automatic skill discovery or MCP registration has not refreshed. The inspected runner supports delegated `gpt-6-sol` with `xhigh` effort; use that selected configuration when delegating. The coordinating session used `gpt-6-astra` with `high` effort. Neither model name is a Cursor Task or cloud-agent capability. At most two implementation workers may own separate worktrees and mutable services; research and read-only review do not become overlapping implementation lanes.

On this Linux workstation, run `npm ci`, then `npm run verify:app -- setup`. Local Docker must be running, with Python 3 and the Supabase CLI on PATH. Automatic Chrome provisioning also needs network access, `unzip`, and Chrome's operating-system libraries. `setup` reports `BLOCKED` with the missing provisioning path; it does not require a personal Chrome profile or silently install system packages. `launch` also provisions the pinned browser if no compatible installed browser exists. No hosted provider credentials or manual synthetic-user creation are needed.

Worker state lives outside the checkout in a private, checkout-specific directory; `.verification/evidence/` retains receipts after cleanup. Following compaction, reconnect with `info` and `doctor` before driving. A changed executable candidate requires `restart`; a lost supervisor requires owned `cleanup` and `launch`. These are persisted resources, not guarantees that an agent's conversation or task resumes automatically. The existing context-window and compaction settings were preserved. GitHub and Depot access were available in the implementation session; local browser proof does not require them.
