# D02 publication handoff

Title: **Make Calendar assignments independent of Duty Roster**

Base: `main`, freshly fetched at `5c0662bbd37a5df478b634f72a0e4d7bef3c9e8e`. Head branch: `stabilization/05-d02-calendar-independence`. Local candidate: `a62b66d54b915412a0b87694cf41498859fd751e` plus the complete uncommitted cutover, collision repair and evidence. No D02 PR exists after paginated live reconciliation; no published final head is claimed. Keep child #1317 open until verified merge.

The [work record](../EVIDENCE.md#task-05-03-01-manual-assignment-conflict-and-provenance-cutover) owns verification, data-preservation receipts and limitations. All mapped D02 tasks and acceptance must pass before publication. Review the full diff from `main`, especially retained historical assignments, Group/tenant denial, conflict classification, rollback and Dashboard access. Independent local reviews pass; obtain review of the exact published candidate too.

After separately authorizing publication, the owner should review and commit the complete intended diff, then run:

```bash
git push -u origin stabilization/05-d02-calendar-independence
gh pr create --repo waffleflopper/trooptotask --base main --head stabilization/05-d02-calendar-independence --title "Make Calendar assignments independent of Duty Roster" --body-file docs/stabilization/phase-05/d02-pr-body.md
```

Reconcile live PRs again before creation; reuse an existing PR if publication occurred meanwhile. Verify its actual head SHA, `main` base and `Closes #1317` linkage. The [prepared body](d02-pr-body.md) references parent #1278 without closing it. Resolve [release prerequisites](../RELEASE.md#phase-05-d02-local-implementation-boundary) before any releasing merge: publication may deploy; D01's owner confirmations do not certify D02. This child introduces no migration.

**AWAITING_PR / STOP.** This invocation does not authorize or perform commit, push, PR creation, merge, deployment, remote database work, D03 work or Phase 06 activation. After owner-controlled publication/review/merge, repeat workflow #1275 to verify integration before starting another child.
