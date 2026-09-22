# D01 publication handoff

Title: **Remove Duty Roster generation and preserve Calendar workflows**

Existing PR: [#1320](https://github.com/waffleflopper/trooptotask/pull/1320), opened early and left untouched at Robert's request. Base `main` (`b7b4cdf6990025d0671ca43936100607d336e8e6`); head `stabilization/05-d01-duty-runtime` (published/local HEAD `f57b8ffdaa717ffe6aa8d1d53eb2d99ca04b101c` plus uncommitted final changes). No final commit SHA exists yet. PR is open/unmerged and currently lacks a closing link. [Prepared body](d01-pr-body.md) adds `Closes #1316` and references parent #1278 without closing it.

Before publication, review the complete existing-PR plus working diff and the [work record](../EVIDENCE.md#task-05-01-03-generation-and-entry-point-removal). Independent local runtime/removal review passed; normal final PR review remains required, particularly onboarding RLS/column grants and retained Calendar records. Robert controls commit/push and PR editing. This driver performed none of them.

After Robert authorizes publication, commit the reviewed complete child on its existing branch, then use:

```bash
git push origin stabilization/05-d01-duty-runtime
gh pr edit 1320 --repo waffleflopper/trooptotask --title "Remove Duty Roster generation and preserve Calendar workflows" --body-file docs/stabilization/phase-05/d01-pr-body.md
```

Verify the new published head and child-closing linkage; keep #1316 open until merge. Do not create another PR. Resolve [release prerequisites](../RELEASE.md#phase-05-d01-publication-prerequisites) before a merge that deploys: owner-approved notice/caller cutover, backup/recovery, application/schema compatibility, deployment targets and separately authorized hosted RLS migration handling. A successful Vercel preview is not canonical CI or review approval.

Stop here. After the owner-controlled merge into `main`, use the same #1275 driver to verify the actual merge/integrated result before establishing D02 from updated default content. No D02 work or new-phase activation is authorized by this handoff.
