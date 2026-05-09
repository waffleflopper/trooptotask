# Requirement Badge Prototype

Question: which shared badge/status model should replace route-local status swatches for Training and Critical Tasks while keeping calendar status colors isolated behind a calendar-only wrapper?

Run: `npm run dev -- --host 127.0.0.1`, then open `/ui-showroom/prototype/requirement-badges`.

Variants:

- `A`: one shared requirement status vocabulary.
- `B`: separate Training and Critical Tasks wrappers over shared token aliases.
- `C`: token contract board that compares badges, matrix cells, and source-domain mappings.

Verdict: TBD. Delete this route and `src/lib/components/prototype/PrototypeSwitcher.svelte` after the decision is folded into real shared components.
