---
description: Triage and fix a Troop to Task bug with regression coverage
---

Load and follow the `trooptotask-feature` skill.

Bug report: $@

Workflow:

1. Reproduce or infer the failure from the current code and tests.
2. Identify the narrowest root cause.
3. Fix the bug without broadening scope.
4. Add or update a regression test.
5. If server entities, adapters, or Supabase behavior are involved, also load the `safe-supabase-change` skill.
6. Run the required verification workflow before finishing.
7. Summarize the root cause, fix, regression coverage, and remaining risks.
