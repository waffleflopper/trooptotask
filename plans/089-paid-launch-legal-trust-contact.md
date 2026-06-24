# Plan 089: Align paid-launch legal, trust, and contact surfaces

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. This plan edits public Svelte/legal surfaces, so follow
> `docs/agents/svelte.md` before editing and run `svelte-autofixer` until
> clean. If anything in the "STOP conditions" section occurs, stop and report.
> When done, update the status row for this plan in `plans/README.md` unless a
> reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat b550f840..HEAD -- src/routes/+page.svelte src/routes/privacy/+page.svelte src/routes/terms/+page.svelte src/routes/security/+page.svelte src/routes/about/+page.svelte src/lib/components/public docs/launch-acquisition-path.md docs/billing-operations-launch-checklist.md docs/billing-cancellation-policy.md docs/billing-customer-portal.md docs/security/operational-control-evidence.md docs/security/security-overview.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `b550f840`, 2026-06-23 (reconciled; originally planned at `c6760c16`)

## Reconciliation note

On 2026-06-23, this plan was refreshed at `b550f840`. The public Svelte pages
still contain the original launch-copy finding: Terms is beta-only, Privacy
omits Stripe payment processing, and the homepage overstates audit-log breadth.
Docs changed after `d485cdc5` to add self-service support visibility,
support-safe billing evidence handling, and explicit Stripe Dashboard/launch
confirmation gates. Those doc updates should now be treated as source material
for the executor. Robert-owned support, refund, tax, mailbox, and
paid-launch legal-copy decisions remain the blocking prerequisite.

## Completion note

On 2026-06-23, Robert confirmed the canonical public `.org` support,
privacy, and security mailboxes, the monthly subscription refund posture, the
tax-disabled launch posture, and the paid-launch Terms posture. The plan was
executed on `codex/089-paid-launch-legal-trust-contact`, reviewed, refined for
CodeRabbit/Claude findings, and brought onto `codex/plan-89`. The public pages
now align with the approved paid-launch contract and the plan index marks this
slice DONE.

## Why this matters

The public pricing surface now names final Team and Unit prices for paid
launch, but the legal and trust surfaces still contain beta-era or incomplete
billing language. Before checkout is open to public customers, Terms, Privacy,
Security, and customer contact copy need to match the Stripe-backed paid
contract without inventing legal policy. This is a launch readiness slice: it
turns existing billing runbooks into owner-reviewed public language and one
staffed support/contact contract.

## Current state

- `src/routes/+page.svelte:363-365` says Team and Unit prices are final for
  paid launch.
- `src/routes/terms/+page.svelte:35-37` still says the service is provided "as
  is" during the beta period and does not describe recurring billing,
  cancellation, invoices, refunds, or tax.
- `src/routes/privacy/+page.svelte:54-57` names Supabase and Vercel as
  infrastructure processors but omits Stripe payment processing.
- `src/routes/+page.svelte:41-43` and `src/routes/+page.svelte:347-349`
  still claim a "full audit log" / "full audit log of every action"; the
  Security page is more precise and should be the copy standard.
- `src/routes/security/+page.svelte:104-106` correctly names Stripe as the
  payment processor.
- `docs/billing-cancellation-policy.md:3-8` defines period-end and immediate
  cancellation behavior.
- `docs/billing-customer-portal.md:7-13` defines supported Customer Portal
  outcomes.
- `docs/launch-acquisition-path.md:85-110` names Robert as support owner,
  keeps the launch support channel to be confirmed, and documents no-secret
  billing/account support evidence rules.
- `docs/billing-operations-launch-checklist.md:120-130` records the paid launch
  contract, and `docs/billing-operations-launch-checklist.md:145-173`
  records support process confirmations and safe Stripe/app identifiers.
- `docs/security/operational-control-evidence.md:13-16` now links
  billing/support security, vulnerability disclosure, audit log review, and
  environment/secrets review to the launch evidence rules.
- Customer-facing emails are inconsistent: privacy uses
  `privacy@trooptotask.com`, terms and billing use `support@trooptotask.com`,
  and security uses `security@trooptotask.org`.

Current excerpts:

```svelte
<!-- src/routes/terms/+page.svelte:35-37 -->
TroopToTask is a web-based personnel management platform for military unit leaders...
The service is provided "as is" during the beta period.
```

```svelte
<!-- src/routes/privacy/+page.svelte:54-57 -->
Our infrastructure providers (Supabase, Vercel) process data solely to deliver the service...
```

```svelte
<!-- src/routes/+page.svelte:363-365 -->
Team and Unit prices are final for paid launch. Access remains reviewed until billing is enabled...
```

```svelte
<!-- src/routes/+page.svelte:41-43 -->
TroopToTask aligns to NIST 800-171 with AES-256 encryption at rest...
and a full audit log of every action...
```

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Svelte docs | Svelte MCP `list-sections`, then `get-documentation` for relevant Svelte/SvelteKit component/page sections | docs read before Svelte edits |
| Svelte autofix | `svelte-autofixer` on edited Svelte files | no issues or suggestions remain |
| Copy grep | `rg -n "beta period|refund|Stripe|support@trooptotask|privacy@trooptotask|security@trooptotask|NIST|audit log" src/routes src/lib/components/public docs` | output matches the approved paid-launch copy |
| Full repo gate | `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` | all exit 0 |

## Scope

**In scope**:

- `src/routes/terms/+page.svelte`
- `src/routes/privacy/+page.svelte`
- `src/routes/security/+page.svelte`
- `src/routes/+page.svelte`
- `src/lib/components/public/PublicFooter.svelte` and public nav/CTA components
  only if contact/support links are added.
- A small shared contact constant/module only if it reduces repeated hard-coded
  customer-facing mailbox strings.
- `docs/launch-acquisition-path.md`,
  `docs/billing-operations-launch-checklist.md`,
  `docs/billing-cancellation-policy.md`,
  `docs/billing-customer-portal.md`, and
  `docs/security/operational-control-evidence.md` only to record the approved
  public launch contract and no-secret support rules.
- Public/legal page tests if the executor adds a shared contact component or
  test seam.
- `plans/README.md` status row only.

**Out of scope**:

- Do not invent refund, tax, SLA, support, or legal positions without Robert's
  explicit decision.
- Do not change Stripe checkout behavior, product prices, billing policy, or
  Customer Portal settings.
- Do not claim FedRAMP authorization, certification, or formal government
  approval.
- Do not paste real customer data, card details, dashboard screenshots, secret
  values, or provider payloads into docs or tests.

## Git workflow

- Branch: `codex/089-paid-launch-legal-trust-contact`
- Commit style: short imperative subject, for example
  `Align paid launch legal surfaces`.
- Use a worktree under `.worktrees/` if executing alongside other plans.
- Do not push or open a PR unless the operator instructed it.

## Steps

### Step 1: Get Robert-owned policy decisions

Before changing public legal copy, ask Robert to confirm:

- canonical support mailbox/channel for billing and account support;
- privacy/security mailbox domains;
- refund or no-refund posture for monthly subscriptions;
- tax language when automatic tax is disabled versus later enabled;
- whether the public Terms should still mention beta for any feature or should
  describe paid launch support boundaries instead.

If Robert does not confirm these, stop and mark the plan BLOCKED.

**Verify**:
The PR/plan notes list the confirmed decisions without including secrets or
provider dashboard screenshots.

### Step 2: Update Terms for paid subscriptions

Replace beta-only wording with paid-launch terms that cover recurring monthly
billing, Team/Unit plan names, cancellation timing, invoices/receipts, payment
processor role, taxes if applicable, refund posture, and support-handled states.
Use `docs/billing-cancellation-policy.md` and `docs/billing-customer-portal.md`
as the source; do not create new billing behavior in copy.

**Verify**:
`rg -n "beta period|recurring|cancel|refund|invoice|tax|Stripe|Customer Portal" src/routes/terms/+page.svelte`
shows no stale beta-only launch statement and includes the approved billing
terms.

### Step 3: Update Privacy and Security to match payment processing

Update Privacy so Stripe is named where payment processing data is disclosed.
Tighten trust copy so public claims match existing evidence:

- use "security-relevant audit logs" rather than "full audit log of every
  action";
- keep "NIST-aligned" or similar honest language;
- keep explicit non-certification and non-classified-use guidance.

**Verify**:
`rg -n "full audit log|NIST|Stripe|classified|FedRAMP|certification|security-relevant" src/routes/+page.svelte src/routes/privacy/+page.svelte src/routes/security/+page.svelte docs/security/operational-control-evidence.md`
shows the intended, evidence-backed wording.

### Step 4: Centralize customer-facing contact paths

Make customer-facing support/contact links consistent with Robert's decision.
If adding a shared constant is cleaner, keep it small and public-safe. Update
public footer/nav or add a simple Contact/Support link only if it has a real
staffed destination.

**Verify**:
`rg -n "support@trooptotask|privacy@trooptotask|security@trooptotask|Contact|Support" src/routes src/lib/components/public docs/launch-acquisition-path.md docs/billing-operations-launch-checklist.md`
shows one intentional support contract and no unapproved domain drift.

### Step 5: Run Svelte and repo verification

Run Svelte autofixer for edited `.svelte` files, then full repo gate.

**Verify**:

- Svelte autofixer reports no issues/suggestions.
- `npm run format && npm run lint && npm run governance:check && npm run check && npm run test` exits 0.

## Test plan

- If only copy changes are made and no test seam exists, rely on Svelte
  autofixer, grep checks, and the full repo gate.
- If a shared contact module/component is added, add the smallest unit/component
  test proving Terms/Privacy/Security/Billing links use the configured
  customer-facing channels.
- Keep tests free of real customer/provider data.

## Done criteria

- [ ] Terms no longer present paid launch as beta-only and include approved
      recurring billing, cancellation, refund/tax/support language.
- [ ] Privacy discloses Stripe/payment processing consistently with Security.
- [ ] Public trust copy matches the evidence level and avoids over-broad audit
      or certification claims.
- [ ] Customer-facing support/contact channels are canonical and documented.
- [ ] Svelte autofixer is clean for edited Svelte files.
- [ ] Full repo gate passes.
- [ ] `plans/README.md` status row updated unless the reviewer maintains the
      index.

## STOP conditions

Stop and report back if:

- Robert has not confirmed support, refund, tax, or legal copy decisions.
- The change would require legal advice beyond owner-approved product terms.
- The copy would claim formal certification, government approval, or evidence
  that does not exist.
- Any step requires production systems, secrets, live Stripe changes, or
  customer data.

## Maintenance notes

Whenever billing policy changes, update public legal copy and billing runbooks
in the same slice. Keep security and compliance language grounded in
`docs/security/operational-control-evidence.md`; launch trust is strongest when
it is precise.
