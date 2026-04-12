# Project-local pi resources

This directory contains Troop to Task-specific pi resources:

- `extensions/` — safety guardrails, verify workflow helpers, preset modes, and context-aware compaction
- `skills/` — repo-specific workflows for features, Supabase changes, and UI consistency passes
- `prompts/` — repeatable prompts for features, bug fixes, ship passes, and UI passes
- `presets.json` — project defaults for `/plan`, `/build`, `/ship`, and `/preset`

## Quick command cheat sheet

### Modes

- `/plan` — switch to read-only planning mode
- `/build` — focused implementation mode
- `/ship` — finish-line mode with verification bias
- `/preset` — choose a mode interactively
- `/preset clear` — clear the active preset and restore the default working toolset

### Verification

- `/verify` — run `npm run format`, `npm run lint`, `npm run check`, and `npm run test`
- `/verify help` — show argument help and examples
- `/verify lint check` — run only specific verification steps
- `/verify all --fail-fast` — run the full workflow and stop on the first failure

### Context and prompts

- `/context-summary` — preview the context snapshot used by custom compaction
- `/feature ...` — feature implementation workflow prompt
- `/bugfix ...` — bugfix + regression workflow prompt
- `/ui-pass ...` — UI consistency workflow prompt
- `/ship-pass ...` — final review prompt without colliding with `/ship`

### Subagents

- `/subagents` — list the discovered Pi + Claude-compatible subagents
- `Agent` / `Task` tools — Claude Code compatibility aliases for skills that expect subagent spawning
- `run_in_background: true` now starts a true background subagent and automatically posts the result back into the conversation when it finishes
- Active subagent runs are tracked in a widget below the editor while they are in flight
- If you already have a global `subagent` tool installed, this project-local extension layers Claude compatibility on top of it rather than replacing it

### Forcing a skill explicitly

Pi can auto-load these skills when the task matches, but use the commands below when you want to guarantee the workflow:

- `/skill:trooptotask-feature`
- `/skill:safe-supabase-change`
- `/skill:ui-consistency-pass`

## Notes

- These resources are intended for pi and are excluded from the app's TypeScript and ESLint pipelines.
- The guardrails extension blocks destructive Supabase/database commands and protects sensitive paths.
- The verify workflow mirrors the repo requirements in `AGENTS.md`.
- The verify tool has a custom renderer and a status widget, so collapsed results should stay readable during long sessions.
- The subagent extension discovers project-local agents from `.pi/agents/` and Claude-style agents from `.claude/agents/` when present.
