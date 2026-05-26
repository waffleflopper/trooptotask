---
target: org/billing route
total_score: 22
p0_count: 0
p1_count: 2
timestamp: 2026-05-26T01-56-26Z
slug: src-routes-org-orgid-billing-page-svelte
---

## Design Health Score

| #         | Heuristic                       | Score     | Key Issue                                                                      |
| --------- | ------------------------------- | --------- | ------------------------------------------------------------------------------ |
| 1         | Visibility of System Status     | 3         | No progress indication when redirecting to Stripe checkout                     |
| 2         | Match System / Real World       | 2         | "Entitlement Source," "Plan Source," "syncStatus" leak implementation language |
| 3         | User Control and Freedom        | 3         | Good exit paths in dialogs; no breadcrumb back from Stripe                     |
| 4         | Consistency and Standards       | 2         | "Manage Subscription" appears 4 times doing the same thing                     |
| 5         | Error Prevention                | 3         | Good CANCEL NOW confirmation; no confirmation before paid checkout             |
| 6         | Recognition Rather Than Recall  | 2         | Heavy billing terminology with no contextual help                              |
| 7         | Flexibility and Efficiency      | 2         | No keyboard shortcuts, no navigation anchors, long vertical scroll             |
| 8         | Aesthetic and Minimalist Design | 1         | Up to 12 cards stack vertically with equal visual weight                       |
| 9         | Error Recovery                  | 3         | Specific recovery steps; 5x identical generic catch-all error                  |
| 10        | Help and Documentation          | 1         | No help links, no tooltips, no FAQ anywhere on page                            |
| **Total** |                                 | **22/40** | **Acceptable**                                                                 |

## Anti-Patterns Verdict

**LLM assessment**: Low-to-moderate slop. The pricing section uses the most generic SaaS pattern possible (three equal-width cards with checkmark lists), and the top metric strip is borderline hero-metric template. However, the page avoids the worst offenders: no gradient text, no glassmorphism, no side-stripe borders, no decorative illustrations or animations. The overall aesthetic reads as enterprise admin, which is appropriate for the product register.

**Deterministic scan**: 20/27 patterns clean. 6 findings classified as low severity or false positive. One genuine finding: missing focus management on the success and canceled sub-pages after Stripe redirect (screen readers are not oriented to the status card on arrival). No AI slop tells detected by automated rules.

**Convergence**: Both assessments agree the interface is technically clean but suffers from information architecture problems rather than aesthetic ones. The card avalanche and repeated CTAs are structural issues that no visual polish will fix.

## Overall Impression

The billing page is built with genuine care for edge cases and billing state machines. The recovery flows, cancellation safeguards, and state-specific messaging are better than most billing UIs. But the page tries to be four things at once (status dashboard, pricing page, recovery wizard, cancellation flow), and the result is a wall of same-weight cards that overwhelms the primary question every user brings here: "Is my unit's access okay?"

## What's Working

1. **Recovery flows are genuinely well-engineered.** The `buildBillingRecovery` function maps each subscription failure state to specific titles, impact statements, and ordered steps. The consistent "existing data remains visible" reassurance is exactly right for anxious military users worried about losing their unit's data.

2. **The cancellation dialog is responsibly designed.** Typed "CANCEL NOW" confirmation, feedback reason dropdown, and "Keep Subscription" as the safe exit (not just "Cancel") show careful UX thinking for a high-stakes destructive action.

3. **The success and canceled sub-pages are clean.** Centered card, clear status icon, title, description, two actions. Multiple checkout states handled with appropriate icons. No unnecessary decoration.

## Priority Issues

### [P1] Card avalanche with no information hierarchy

**What**: In degraded billing states, 8-12 cards stack vertically with equal visual weight. Read-only alert, error alert, pending checkout alert, cancellation alerts, metrics, usage card, billing status card, recovery card, invoices card, cancellation policy card, current plan card, and pricing grid can all render simultaneously.
**Why**: An NCO checking billing status needs one answer: "Is my unit's access okay?" Scrolling through a wall of identically-weighted cards to find that answer is cognitive overload. The cognitive load assessment shows 6/8 failures (critical).
**Fix**: Consolidate into 2-3 sections. Lead with a single prominent status banner answering the primary question. Collapse detail into expandable sections or a tabbed layout (Status, Plans, History). Merge the Current Plan, Billing Status, and Cancellation Timing cards since they all describe the same subscription.
**Suggested command**: `/impeccable distill`

### [P1] "Manage Subscription" appears 4 times doing the same thing

**What**: The same Stripe portal button appears in the toolbar (line 886), billing status card (line 1083), payment recovery card (line 1115), and cancellation policy card (line 1169). All call the same `handleManageSubscription` function.
**Why**: Four identical CTAs create doubt ("Do these do different things?"), dilute action hierarchy, and inflate page length. Every duplicate button adds cognitive noise.
**Fix**: Keep it in the toolbar (persistent, always reachable) and remove it from individual cards. If a card needs to reference the portal, use a text link instead of a full button.
**Suggested command**: `/impeccable distill`

### [P2] Implementation terminology leaks into the UI

**What**: "Entitlement Source," "Billing Snapshot Source," "syncStatus," "needs_reconciliation," "drift detected" surface to users through labels and status text. "Plan Source" in the top metrics shows "Paid Subscription" or "Default," which are developer concepts.
**Why**: An NCO managing their company's roster should never see "Entitlement Source: Billing Provider." These labels are meaningful to the developer, not the user.
**Fix**: Replace "Entitlement Source" with "Managed By" or remove it. Replace the "Plan Source" metric with something actionable, or remove it entirely since the badge already shows the source. Audit all user-facing strings for implementation language.
**Suggested command**: `/impeccable clarify`

### [P2] No confirmation before paid checkout redirect

**What**: Clicking "Subscribe" immediately fires a POST and redirects to Stripe. No preview of price, billing cycle, or what happens next.
**Why**: This is a financial commitment. The jump from in-app to an external payment provider is jarring without preparation. Military users on government networks may also experience firewall issues with Stripe domains.
**Fix**: Add an intermediate confirmation dialog showing: plan name, price, billing frequency, and "You will be redirected to our payment provider to complete checkout."
**Suggested command**: `/impeccable harden`

### [P2] Cancellation policy card is a text wall, not actionable UX

**What**: Two paragraphs of policy text explaining the difference between portal cancellation and immediate cancellation, with two buttons side by side.
**Why**: Users don't read policy paragraphs. The wall of text will be skipped, potentially leading users to click the wrong button (immediate vs. period-end cancellation) with irreversible consequences.
**Fix**: Replace with a clear two-option layout: "Cancel at period end (recommended): Keep access until [date]" vs "Cancel immediately: Lose access now." Single-sentence descriptions, not paragraphs.
**Suggested command**: `/impeccable clarify`

## Persona Red Flags

**Alex (Power User)**: No keyboard shortcuts for any billing action. "Manage Subscription" button duplicated four times yet no quick anchor to jump between sections on a long scrolling page. The single `#billing-pricing-heading` anchor is used by one link but not surfaced as navigation. Alex will scroll impatiently through 8 cards to find the portal button.

**Jordan (First-Timer)**: "Entitlement Source: Billing Provider" and "Plan Source: Default" are incomprehensible to a first-time billing visitor. No contextual help, tooltips, or FAQ anywhere on the page. The cancellation section uses policy-speak ("configured for launch," "period end") without defining terms. Jordan cannot distinguish between the two cancellation paths without reading dense paragraph text.

**1SG Davis (NCO Manager)** [project-specific]: A first sergeant checking Monday morning billing status sees three metric cards, a status card with an embedded alert, possibly a usage card, possibly a recovery card, and then a pricing grid. All first sergeant wants to know: "Are we good?" The page does not answer this question in a single glance. The critical status information competes with plan comparison, invoices, and cancellation policy for attention.

## Minor Observations

- `billingAlertVariant` maps `success` badge to `default` alert, which could cause visual inconsistency.
- Pricing cards use green checkmarks for all features including the Free tier, undermining upgrade motivation.
- `formatPrice` strips cents (`$X/mo`), which will break if pricing ever includes fractional dollars.
- Five identical catch blocks all produce the same generic error message.
- Success page puts `CardDescription` (eyebrow) above `CardTitle`, which is unconventional and may confuse screen readers.
- Missing focus management on success/canceled pages after Stripe redirect.

## Questions to Consider

1. **Why is this one page?** Status monitoring, plan selection, payment recovery, and cancellation are four distinct user intents. Would a tabbed or routed approach (billing/status, billing/plans, billing/cancel) let each view serve its purpose without competing for attention?

2. **What does a first sergeant see when they open this page on a Monday morning?** They want one answer: "Is my unit's access good?" Could the entire page be replaced with a single status sentence and a "Need to change something?" expandable section?

3. **Has anyone tested the Stripe redirect on a government network?** Government firewalls and proxy configurations can block third-party payment domains. There is no fallback or guidance if the Stripe redirect fails silently.
