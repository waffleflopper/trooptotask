# Plan 082: Package operational security evidence for launch readiness

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. Do not invent compliance evidence. If Robert does not have an
> operational control artifact yet, document it as missing or planned. When
> done, update the status row for this plan in `plans/README.md` unless a
> reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 03af64cb..HEAD -- docs/security src/routes/security/+page.svelte src/tests/security-posture.test.ts docs/billing-operations-launch-checklist.md docs/architecture/ADR_INDEX.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `03af64cb`, 2026-06-15

## Why this matters

TroopToTask handles personnel readiness data and the public security page makes
NIST 800-171 and CUI-equivalent claims. The codebase has improved technical
controls, but the repo still says formal operational-control evidence is not
fully represented. A paid launch needs a support-safe evidence pack for
incident response, access review, provisioning/deprovisioning, backup/restore,
and billing/security support operations.

## Current state

- `docs/security/control-mapping.md` lists implemented technical controls, but
  marks NIST 800-171 evidence as partial and operational control evidence as
  planned.
- `docs/security/security-overview.md` says TroopToTask handles CUI including
  personnel, emergency contact, counseling, and training data, and aligns to
  NIST SP 800-171 Rev 2 control families.
- `docs/security/incident-response.md` is short and includes "Restore from
  backup if data was modified" without a backup/restore procedure.
- `src/routes/security/+page.svelte` publishes public claims and says "Last
  reviewed: May 2026".
- `src/tests/security-posture.test.ts` asserts some security docs/config claims,
  but it does not assert the operational evidence pack exists.

Current excerpts:

```md
docs/security/control-mapping.md
Partial:
- NIST 800-171 alignment evidence
  The codebase now supports the core technical claims much better, but formal
  evidence for operational controls still lives outside the repo and is not
  fully represented here.
```

```md
docs/security/control-mapping.md
Planned:
- Operational control evidence pack
  Add or link runbooks and review artifacts for incident response, access
  review, provisioning/deprovisioning, and backup/restore evidence.
```

```svelte
src/routes/security/+page.svelte
<p>TroopToTask aligns with NIST SP 800-171 for the protection of Controlled
Unclassified Information.</p>
```

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Security posture test | `npx vitest run src/tests/security-posture.test.ts` | all pass |
| Security page test | run any existing tests for `src/routes/security/+page.svelte` if present | all pass |
| Full repo gate | `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` | all exit 0 |

## Scope

**In scope**:

- `docs/security/operational-control-evidence.md` (create)
- `docs/security/access-review.md` (create if useful)
- `docs/security/provisioning-deprovisioning.md` (create if useful)
- `docs/security/backup-restore.md` (create if useful)
- `docs/security/incident-response.md`
- `docs/security/control-mapping.md`
- `docs/security/security-overview.md`
- `src/routes/security/+page.svelte` only if public claims need truthful
  caveats or review date updates
- `src/tests/security-posture.test.ts`
- `docs/billing-operations-launch-checklist.md` only to cross-link launch
  support/security evidence
- `plans/README.md` status row only

**Out of scope**:

- No new formal compliance certification claim.
- No FedRAMP claim.
- No production database inspection, backup restoration, or destructive
  recovery drill without Robert's explicit permission.
- No secret values, dashboard screenshots with secrets, or raw incident data.
- No security feature implementation unless a doc/test mismatch reveals a small
  truthful-copy correction.

## Git workflow

- Branch: `codex/082-operational-security-evidence`
- Commit style: short imperative subject, for example
  `Package launch security evidence`.
- Use a worktree under `.worktrees/` if executing alongside other plans.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create the operational evidence index

Create `docs/security/operational-control-evidence.md` with a table of launch
controls:

- incident response,
- access review,
- provisioning and deprovisioning,
- backup and restore,
- billing/support security,
- vulnerability disclosure,
- audit log review,
- environment/secrets review.

For each row include:

- control family or purpose,
- owner,
- cadence,
- current status: `implemented`, `partial`, `planned`, or `external`,
- evidence location,
- launch blocker: yes/no,
- notes.

If evidence exists outside the repo, say "external evidence held by the security owner" and
describe the artifact type without copying sensitive content.

**Verify**:
`rg -n "incident response|access review|provisioning|deprovisioning|backup|restore|billing/support|launch blocker" docs/security/operational-control-evidence.md`
shows every required area.

### Step 2: Add or expand operational runbooks

Add focused runbooks if they do not exist:

- `docs/security/access-review.md`: who reviews platform admins, Organization
  owners/admins, support/billing admins, and stale users; cadence and evidence.
- `docs/security/provisioning-deprovisioning.md`: how platform admin access is
  granted/revoked, how support access is handled, how departing users/org admins
  are handled.
- `docs/security/backup-restore.md`: what provider backups exist, what restore
  evidence is available, what is not yet tested, and how a restore drill should
  be requested without touching production casually.

Expand `docs/security/incident-response.md` with concrete launch-safe sections:
severity, roles, containment, communications, credential rotation, billing
webhook/payment incidents, evidence handling, post-incident review, and explicit
no-secret note capture.

Do not claim a restore drill passed unless Robert actually ran one.

**Verify**:
`rg -n "do not|secret|restore drill|owner|cadence|evidence" docs/security/*.md`
shows explicit safety and evidence language.

### Step 3: Update the control map and security overview truthfully

Update `docs/security/control-mapping.md` so planned/partial rows point at the
new evidence pack and runbooks. Keep the status partial where evidence is not
complete.

Update `docs/security/security-overview.md` if needed so the public-facing
claims are honest about alignment versus certification. Also fix any obviously
stale contact/domain mismatch if found during this pass.

If `src/routes/security/+page.svelte` claims more than the docs can support,
adjust public copy to say "aligned with" and "used with local policy" rather
than implying certification.

**Verify**:
`rg -n "certified|certification|FedRAMP|formal federal|aligned|Last reviewed" docs/security src/routes/security/+page.svelte`
shows no over-claim beyond the documented posture.

### Step 4: Add security-posture tests for the evidence pack

Update `src/tests/security-posture.test.ts` to assert:

- `docs/security/operational-control-evidence.md` exists,
- it references incident response, access review, provisioning/deprovisioning,
  backup/restore, and billing/support security,
- `docs/security/control-mapping.md` links or names the evidence pack,
- public/docs security copy does not claim FedRAMP certification.

Keep the tests textual and cheap; do not require network access.

**Verify**:
`npx vitest run src/tests/security-posture.test.ts` -> all pass.

### Step 5: Cross-link billing launch support

If plan 078 created or updated a billing launch evidence document, add a
support/security cross-link from `docs/billing-operations-launch-checklist.md`
to the operational evidence pack. At minimum, the billing support process should
know where incident-response and no-secret note rules live.

**Verify**:
`rg -n "operational-control-evidence|incident-response|security" docs/billing-operations-launch-checklist.md`
shows the cross-link if billing checklist was updated.

### Step 6: Run verification

**Verify**:

- `npx vitest run src/tests/security-posture.test.ts` -> all pass.
- `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` -> all exit 0.

## Test plan

- Textual security-posture tests for required docs and claim boundaries.
- If public security page copy changes and there is a component test, update it
  for the new text.
- No E2E required unless route behavior changes.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `docs/security/operational-control-evidence.md` exists.
- [ ] Evidence pack covers incident response, access review,
      provisioning/deprovisioning, backup/restore, and billing/support security.
- [ ] Missing evidence is marked partial/planned/external, not invented.
- [ ] Control map points at the evidence pack.
- [ ] Public/docs security copy does not imply FedRAMP or formal certification.
- [ ] `src/tests/security-posture.test.ts` covers the evidence pack.
- [ ] Required repo checks all pass.
- [ ] `plans/README.md` status row for 082 updated.

## STOP conditions

Stop and report back if:

- Robert wants to claim a certification that is not supported by evidence in or
  linked from the repo.
- The plan appears to require production backup restore, production database
  access, or destructive recovery testing.
- You encounter real secret values in docs or tests. Do not copy them; report
  file/line and secret type only.
- A public security claim conflicts with provider terms or the available
  evidence and needs Robert's decision.

## Maintenance notes

- This evidence pack is launch posture, not a one-time compliance trophy. It
  should be reviewed after major auth, billing, storage, or platform-admin
  changes.
- Keep public claims calibrated: "aligned with" and "built for" are different
  from "certified" or "authorized".
- Do not store customer incident details, secrets, or raw provider payloads in
  these docs.
