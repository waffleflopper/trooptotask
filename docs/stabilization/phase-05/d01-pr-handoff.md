# D01 publication handoff

Title: **Remove Duty Roster generation and preserve Calendar workflows**

Existing PR: [#1320](https://github.com/waffleflopper/trooptotask/pull/1320), open/unmerged. Base `main` (`b7b4cdf6990025d0671ca43936100607d336e8e6`); branch `stabilization/05-d01-duty-runtime`. Local candidate is `20aea22d043d5bd0adbee106c998f77e14d84634` plus the uncommitted step-ownership repair and documentation. Last verified published head remains `f57b8ffdaa717ffe6aa8d1d53eb2d99ca04b101c`; its body lacks a closing link. The [prepared body](d01-pr-body.md) covers the complete change and closes #1316 only.

The [independent review failure](../EVIDENCE.md#independent-review-phase-05-d01) is preserved. Its [verified additive repair](../EVIDENCE.md#task-05-01-02-r01-step-ownership-review-repair) now passes failing-before/passing-after SQL, isolated fresh/upgrade, all canonical checks, retained browser flows and independent Standards/Spec repair review. Local acceptance is restored; final review must inspect the complete published candidate. The repair record also names the separate preexisting renamed-starter replay limitation without claiming universal replay success.

Robert has authorized publication and the finish-pr workflow. Commit the complete verified candidate, then update this existing PR:

```bash
git push origin stabilization/05-d01-duty-runtime
gh pr edit 1320 --repo waffleflopper/trooptotask --title "Remove Duty Roster generation and preserve Calendar workflows" --body-file docs/stabilization/phase-05/d01-pr-body.md
```

Verify the published head and child-closing linkage; obtain fresh final PR review. Keep #1316 open until verified merge. Do not create another PR. Resolve [release prerequisites](../RELEASE.md#phase-05-d01-publication-prerequisites) before a releasing merge: notice/caller cutover, backup/recovery, compatibility, deployment targets and separately authorized hosted migration handling in order (`20260922000100`, then `20260922000200`). Push can redeploy the preview and merge may deploy production; hosted migration state remains unverified.

**AWAITING_MERGE / STOP before another child.** Publication and PR review are now authorized. Merge remains subject to completed review/checks and confirmed release prerequisites; remote database work is not authorized. After an owner-controlled merge, use workflow #1275 to verify the integrated result before establishing D02. No next child or phase is activated.
