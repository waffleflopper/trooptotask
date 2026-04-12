---
description: Inspect, implement, test, and verify a Troop to Task feature change
---

Load and follow the `trooptotask-feature` skill.

Task request: $@

Workflow:

1. Identify the relevant feature module under `src/features/*` and any matching route shells under `src/routes/**`.
2. Inspect related server adapters/entities/tests before changing behavior.
3. Propose the smallest safe implementation.
4. Implement the change.
5. Add or update tests where behavior changed.
6. Run the required verification workflow before finishing.
7. Summarize files changed, risks, and any manual follow-ups.
