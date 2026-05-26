---
target: org/settings/members
total_score: 30
p0_count: 0
p1_count: 2
p2_count: 3
date: 2026-05-25
---

# Critique: org/settings/members

## Design Health Score

| #         | Heuristic                       | Score     | Key Issue                                                    |
| --------- | ------------------------------- | --------- | ------------------------------------------------------------ |
| 1         | Visibility of System Status     | 3         | No page-level loading state; member list has no skeleton     |
| 2         | Match System / Real World       | 4         | n/a — domain terminology is excellent                        |
| 3         | User Control and Freedom        | 3         | No undo for member removal; no draft-save for invites        |
| 4         | Consistency and Standards       | 4         | n/a — strong shared component usage                          |
| 5         | Error Prevention                | 3         | No client-side validation on invite form; server-only        |
| 6         | Recognition Rather Than Recall  | 3         | Edit sheet has no diff indication of changed vs saved state  |
| 7         | Flexibility and Efficiency      | 2         | No search/filter, no bulk operations, no keyboard shortcuts  |
| 8         | Aesthetic and Minimalist Design | 4         | n/a — clean, purposeful, no decoration                       |
| 9         | Error Recovery                  | 2         | No retry mechanism; removal is irreversible with no recovery |
| 10        | Help and Documentation          | 2         | Thin contextual help; no tooltips on capability levels       |
| **Total** |                                 | **30/40** | **Good**                                                     |

## Anti-Patterns Verdict

**LLM assessment**: NOT AI-SLOP. This reads as hand-crafted product work. No gradient text, glassmorphism, side-stripe borders, hero-metric templates, identical card grids, or decorative motion. The page uses design-system tokens throughout, the domain language is specific and deliberate, and the visual treatment is flat borders and background tints — exactly what DESIGN.md prescribes. A user fluent in Linear or Stripe settings would sit down and trust this interface immediately.

**Deterministic scan**: Zero AI slop tells detected (patterns 1-8 all clean). 3 medium findings: missing loading skeleton for member list (line 86), no empty state for `sortedMembers` (line 86), and the modal pattern for removal (acceptable for destructive actions). 5 low findings: nested bordered containers within card sections, flat type scale between h2/h3, inconsistent button label vocabulary, mild heading restating, and reliance on component-level focus indicators.

## Overall Impression

A solid, credible settings page that respects the domain and avoids vanity. The primary gap is **operational efficiency at scale** — the page was designed for small orgs and will degrade for larger formations. The secondary gap is **high-stakes action transparency** — removing a member and editing capabilities both lack the consequence-visibility that "nothing falls through the cracks" demands.

## What's Working

1. **Access model is well-surfaced in the member list.** Each row shows email, scope set, access badge, and override badges at a glance. An admin can scan the roster and quickly identify non-standard access without opening any editor. Directly serves "show the whole formation."

2. **Progressive disclosure is correctly calibrated.** The edit sheet concentrates complex capability-per-lane UI behind an explicit action. Scope-kind toggle hides group checkboxes until needed. Invite form hides preset/scope when role is admin. The page never overwhelms on initial view.

3. **Genuinely flat and restrained.** No shadows on in-flow elements. No colored accents beyond semantic badge variants. Visual treatment is borders, background tints, and divide-y — the design system working as prescribed.

## Priority Issues

### [P1] No search/filter on member list — scalability concern

**Why it matters**: Design Principle 3 says "show the whole formation," but for orgs with 20+ members, scrolling an unpaginated list to find someone is slow. A staff section managing a 100-person company would find this unusable. An NCO managing a battalion-level formation cannot scroll through dozens of rows.
**Fix**: Add a search input above the member list that filters by email. For large orgs (>15 members), consider pagination or sticky column headers. Keep "show all" as default but enable rapid navigation.
**Suggested command**: `/impeccable craft` (new feature: search/filter)

### [P1] Remove Member dialog lacks consequence explanation

**Why it matters**: Design Principle 1 says "nothing falls through the cracks." Removing a member may orphan assignments, leave calendar gaps, or break duty roster fairness. The dialog says "Remove {email} from this organization?" but reveals zero downstream effects. This creates an anxiety valley at a high-stakes moment.
**Fix**: Add a consequence statement: "Their assignments, pending duties, and calendar availability will be removed. This cannot be undone." Better: show a summary of what they own ("2 pending duty assignments, 3 upcoming calendar entries will be unassigned").
**Suggested command**: `/impeccable harden`

### [P2] Six simultaneous capability dropdowns create decision fatigue

**Why it matters**: The edit sheet presents all 6 feature lanes in a 2-column grid simultaneously. This violates the 4-option threshold. The helper text says "use overrides only when the preset is too broad," but the visual gives all 6 equal prominence, implying each needs a decision.
**Fix**: Visually de-emphasize lanes matching the preset default (dimmed text, smaller triggers). Only give full weight to lanes that differ. Or collapse overrides behind a "Customize" link that expands on demand.
**Suggested command**: `/impeccable distill`

### [P2] No diff indication in the edit sheet

**Why it matters**: When editing access, the sheet shows current state but never indicates what has changed from saved. An admin must remember original values. For a system where access changes have real consequences, this is a gap.
**Fix**: Add a subtle indicator (dot, different border color) on any select trigger that differs from saved state. The "Save member" button could show "Save 2 changes."
**Suggested command**: `/impeccable harden`

### [P2] Flat type scale between page heading and section headings

**Why it matters**: The page h2 ("Access Management") uses `text-lg font-semibold` and the section h3s ("Organization members", "Invite Member", "Pending Invitations") also use `text-lg font-semibold tracking-tight`. They share identical visual weight — hierarchy is communicated only by structural position, not typographic contrast.
**Fix**: Bump the page-level h2 to `text-xl` or use the design system's title weight (Barlow Condensed 600+). Keep h3s at `text-lg`. The 1.25 ratio minimum between steps in DESIGN.md requires visible differentiation.
**Suggested command**: `/impeccable typeset`

## Persona Red Flags

**Alex (Power User)**: No search or filter on 20+ member list — must scroll to find a person. No keyboard shortcuts for edit/remove. No bulk operations (cannot change preset for 10 members at once). Sheet requires clicking through 6 dropdowns even when only changing one. High frustration for daily admin workflows.

**Sam (Accessibility-Dependent User)**: Sheet form is keyboard-navigable through standard form controls (good). All interactive elements have labels via `aria-labelledby`. However: the disabled "Resend" button (line 281) provides no programmatic explanation of why it is disabled — screen reader announces "Resend, button, disabled" with no hint of when it becomes available. The member avatar div is correctly `aria-hidden`. The status badge text ("Editor", "Preset defaults") provides no additional context about what these mean.

**Sgt. First Class "Martinez" (Project-Specific: NCO Managing a Platoon)**
Profile: Managing 30-40 personnel across multiple groups. Checks this page weekly. Not technical — uses the tool as issued equipment.
Red flags: No way to see "who was added last week" without scanning every row. Cannot filter by group to see "who in 2nd Platoon has Training access." The invite form's "Selected groups" checkbox list may have 6-10 groups with no search — must scan all of them. If Martinez opens this page after a month, has no quick way to spot what changed.

## Minor Observations

- The "You" badge on the current user's row uses the default Badge variant. Consider a distinct variant for quick self-identification in long lists.
- The `{governanceRoleExplanation}` text appended to the page description may make the intro paragraph unexpectedly dense if the explanation is multi-sentence.
- Disabled "Resend" button provides no tooltip explaining why resend is unavailable. Users will wonder if it is broken.
- The `Separator` component in the invite form is the only use of `<Separator>` on the page — other sections use border/divide-y. Minor inconsistency.
- Pending invitations badge appears in both the members card header (line 83) and as a badge in the pending section header (line 266). Mild redundancy.

## Questions to Consider

1. What happens at scale? This page was designed for 5-15 members. What does the admin of a 60-person company experience?
2. Why can't the owner see a before/after summary before saving access changes? For a "nothing falls through the cracks" system, blind-saving feels like a gap.
3. Should invitation history live here or in the Logs tab? Closed invitations are audit records, not active access management.
4. Is "Area-by-area access" the right framing? Would "Per-function overrides" or domain-specific labels serve NCOs better?
5. What would a confident version of the remove dialog look like — one that earns trust by showing exactly what will happen?
