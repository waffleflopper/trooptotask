# TroopToTask V1

TroopToTask v1 is a military unit management SaaS context for organization-scoped roster, calendar, training, assignment, onboarding, evaluation, and governance workflows. This context uses current v1 product language honestly while flagging legacy compatibility names and transitional architecture that should not become precedent.

## Language

### Product Boundaries

**Organization**:
The v1 workspace and tenancy boundary that owns operational data, memberships, settings, and billing state.
_Avoid_: Account, Unit, tenant, workspace

**Group**:
A configurable roster subdivision inside an **Organization** used for grouping, filtering, and scoped access.
_Avoid_: Element, squad, platoon, section, team when naming the product model

**Organization Member**:
An authenticated app user who belongs to an **Organization**.
_Avoid_: User when access semantics matter

**Membership Role**:
The fixed organization-governance role on an **Organization Member**: `owner`, `admin`, or `member`.
_Avoid_: Team leader, viewer, editor

**Organization Governance Action**:
An action that changes organization access, settings, billing, or destructive organization state.
_Avoid_: Feature edit

### People And Roster

**Personnel Record**:
The stored v1 roster record for a person assigned to an **Organization**.
_Avoid_: User, member, Soldier when discussing persistence

**Soldier**:
The military-facing person represented by a **Personnel Record**.
_Avoid_: Personnel record when talking about the person in the workflow

**Roster**:
The working collection of **Personnel Records** shown for an **Organization** or filtered **Group**.
_Avoid_: Personnel page data, list of users

**Duty Role**:
The canonical military-facing term for a person's local functional role, billet, or position title.
_Avoid_: Clinic role, bare role

**Clinic Role**:
The legacy v1 runtime and schema field name kept for compatibility while docs, UX copy, exports, and new abstractions say **Duty Role**.
_Avoid_: Canonical term

**Rank**:
The military grade recorded on a **Personnel Record**.
_Avoid_: Grade, pay grade

**MOS**:
The military occupational specialty code recorded on a **Personnel Record**.
_Avoid_: Job, specialty

### Authorization And Access

**Permission Flag**:
A current boolean permission on an organization membership or invitation row.
_Avoid_: Capability, grant

**Current Permission Preset**:
The current v1 UI shortcut such as **Admin**, **Full Editor**, **Team Leader**, **Viewer**, or **Custom** that expands to permission flags and optional single-group scope.
_Avoid_: Role, future preset

**Member Preset**:
The approved replacement default member-access bundle, with starter presets **Viewer**, **Operator**, and **Editor**.
_Avoid_: Role, admin

**Capability Level**:
The approved replacement per-feature authority level: `none`, `view`, `operate`, or `configure`.
_Avoid_: Permission flag

**Capability Map**:
The lane-by-lane set of **Capability Level** values assigned to a member after preset defaults and overrides are applied.
_Avoid_: Role permissions blob

**Feature Lane**:
The permission surface for one product feature area.
_Avoid_: Shared permission bucket

**Lane Ownership**:
The durable permission owner for a feature, independent of temporary route, page, or screen placement.
_Avoid_: Current page nesting

**Compatibility Lane**:
A temporary permission surface kept during migration so legacy flows still work while the durable lane map is remediated.
_Avoid_: Durable feature lane

**Group Scope**:
The current single-group restriction stored through `scoped_group_id`.
_Avoid_: Team leader role, future scope set

**Scope Set**:
The approved replacement member scope model: organization-wide or one or more **Groups** shared across all scoped **Feature Lanes**.
_Avoid_: Per-feature scope matrix

**Policy Overlay**:
A cross-cutting rule that can change the final allow or deny result after role, capability, and scope are evaluated.
_Avoid_: Permission, preset

**Policy Decision**:
The effective allow or deny outcome for a requested action after role, capability, scope, and policy overlays are evaluated.
_Avoid_: Checkbox

**Read-Only Mode**:
A billing-driven state where writes are blocked even if a member would otherwise have edit access.
_Avoid_: Broken permissions

### Feature Surfaces

**Calendar**:
The feature for availability, assignments, special days, and duty visibility.
_Avoid_: Leave tracker

**Availability Status**:
A calendar state that marks a person's availability, duty limitation, or absence over one or more dates.
_Avoid_: Event, appointment when status matters

**Status Type**:
An organization-defined calendar status category such as leave, school, training, appointment, sick, CQ/SD, or sick call.
_Avoid_: Calendar color only

**DA6 Availability Treatment**:
The optional duty-roster meaning attached to a **Status Type** for DA Form 6 availability and numbering.
_Avoid_: Status type, DA6 code, color

**Advanced Duty Run**:
One generated team-duty run for a selected advanced duty template and event date pattern.
_Avoid_: DA6 run, regenerated apply payload

**Advanced Run Snapshot**:
The immutable inputs and outputs produced by an **Advanced Duty Run** preview.
_Avoid_: Current template state, recomputed preview

**Snapshot Custody**:
The product decision that a previewed **Advanced Run Snapshot** is persisted server-side as a 24-hour draft and later applied by snapshot identity.
_Avoid_: Signed client payload, browser-owned run state

**Advanced Duty Workspace**:
The operator workspace for configuring, reviewing, applying, exporting, and inspecting **Advanced Duty Runs**.
_Avoid_: Wizard redesign, stacked preview cards

**Personnel**:
The feature for roster management and personnel records.
_Avoid_: Member manager

**Training**:
The feature for training types, training records, matrix views, and training reports.
_Avoid_: Certification tracker only

**Critical Tasks**:
The feature for ICT task libraries, completions, readiness reporting, and related reporting views.
_Avoid_: Training when discussing feature ownership

**Onboarding**:
The feature for template-driven in-processing workflows and onboarding progress.
_Avoid_: Checklist feature

**Leader's Book**:
The transitional compatibility surface for counseling records, development goals, and the future remade per-Soldier leader-reference or administrative workflows while its shape is still being rebuilt.
_Avoid_: Durable future default lane

**Rating Scheme**:
The active v1 surface for evaluation-tracking records and workflows for rated individuals, exposed through the Evals route with its own durable lane ownership.
_Avoid_: Personnel metadata, leaders-book-only data

**Evals**:
The primary navigation label and route surface for **Rating Scheme** workflows.
_Avoid_: Separate domain from Rating Scheme

**Evaluation**:
The military evaluation context that **Rating Scheme** supports by identifying rated people and rating relationships.
_Avoid_: Training, counseling

**Rated Individual**:
The **Personnel Record** whose evaluation relationship is tracked by a **Rating Scheme** entry.
_Avoid_: Subject, evaluatee, assignee

**Rater**:
The **Personnel Record** or leader recorded as responsible for evaluating a **Rated Individual**.
_Avoid_: Reviewer when referring to evaluation duty

**Counseling Record**:
A stored counseling entry tied to a person.
_Avoid_: Note, eval

**Training Type**:
An organization-defined training requirement with applicability and expiration behavior.
_Avoid_: Certification row

**Critical Task**:
An organization-defined ICT requirement tracked by the **Critical Tasks** feature.
_Avoid_: Training type

## Relationships

- An **Organization** contains **Groups**, **Personnel Records**, settings, and organization-scoped feature data.
- An **Organization Member** belongs to exactly one **Organization** and receives one **Membership Role**.
- In the current model, an **Organization Member** receives **Permission Flags** and may receive one **Group Scope**.
- In the approved replacement model, a member receives one **Member Preset**, one **Capability Map**, and one shared **Scope Set**.
- A **Scope Set** applies across all scoped **Feature Lanes**; it does not vary by feature.
- The durable first-class **Feature Lanes** are **Calendar**, **Personnel**, **Training**, **Critical Tasks**, **Onboarding**, and **Rating Scheme**.
- **Leader's Book** remains a **Compatibility Lane** and not part of the current durable first-class lane map.
- **Lane Ownership** does not change just because a feature is temporarily rendered inside another page or route shell.
- **Organization Governance Actions** stay with `admin` and `owner`, while ownership transfer and destructive organization-danger actions stay `owner`-only.
- Governance, billing, member management, and platform concerns stay outside the durable **Feature Lane** map.
- A **Personnel Record** may belong to one **Group**.
- A **Roster** is composed of **Personnel Records** and may be narrowed by **Group**, **Personnel Record**, or typed search.
- **Duty Role** is stored today through the legacy **Clinic Role** field and may still be accepted through compatibility labels in import paths.
- **Rating Scheme** may read roster reference data to resolve rated people and raters without inheriting **Personnel** lane ownership.
- **Rating Scheme** and **Leader's Book** are independently grantable feature surfaces.
- **Evals** is the route and primary navigation label for **Rating Scheme**; it does not create a separate domain concept.
- A **Rating Scheme** entry connects one **Rated Individual** to one or more evaluation relationships such as a **Rater**.
- The **Calendar** displays **Availability Status** values defined by **Status Types**.
- A **Status Type** may have no **DA6 Availability Treatment** when it should not affect duty-roster generation.
- A **DA6 Availability Treatment** can map a **Status Type** to **Authorized Absence**, **Other Duty**, or future **Misconduct Unavailable** semantics without making the **Status Type** itself a **DA6 Code**.
- Default Calendar status semantics treat leave, school, TDY, and sick as **Authorized Absence**; CQ/SD as **Other Duty**; and appointment-style statuses as having no **DA6 Availability Treatment**.
- The **Status Type** management UI should explain **DA6 Availability Treatment** with a concise help affordance so users understand which treatments continue DA Form 6 numbering and which interrupt it.
- **Misconduct Unavailable** should be visible as a future **DA6 Availability Treatment** but unavailable for routine selection until the product has an explicit misconduct/AWOL workflow.
- Existing **Status Types** may be backfilled by conservative name matching for common seeded labels, while custom or unclear names should default to no **DA6 Availability Treatment**.
- **Duty Roster Runs** should consume **DA6 Availability Treatment** from **Status Types** instead of asking users to redefine excluded statuses per run.
- When multiple **Availability Statuses** overlap on one duty date, **Authorized Absence** takes precedence over **Other Duty** because approved leave or another authorized absence is nonchargeable; future **Misconduct Unavailable** takes precedence once enabled.
- An **Advanced Duty Run** produces exactly one draft **Advanced Run Snapshot** during preview.
- **Snapshot Custody** keeps the draft **Advanced Run Snapshot** server-side so apply, retry, and export can reference the same previewed run.
- An unapplied **Advanced Run Snapshot** may produce a preview-only team duty packet export, but it is not a final applied record.
- A successfully applied **Advanced Run Snapshot** is finalized and cannot be normally re-applied.
- Applying an **Advanced Run Snapshot** requires snapshot identity plus a fingerprint of the reviewed preview.
- The **Advanced Duty Workspace** should keep the active run review primary while moving applied-event inspection to a reachable but separate view.

## Example Dialogue

> **Dev:** "If a member can open **Evals**, should we say they have **Personnel** access?"
>
> **Domain expert:** "No. **Evals** is the route label for **Rating Scheme**. **Personnel** owns roster administration; **Rating Scheme** can use roster reference data without borrowing the **Personnel** lane."
>
> **Dev:** "If a leader is scoped to Alpha Company, is that a special **Team Leader** role?"
>
> **Domain expert:** "No. Today it is **Group Scope** over permission flags. In the target model, scope becomes a shared **Scope Set** composed with a **Capability Map**."
>
> **Dev:** "The database column is `clinic_role`; should the UI keep saying clinic role?"
>
> **Domain expert:** "No. Keep **Clinic Role** as compatibility language in runtime and schema, but call the user-facing concept **Duty Role**."

## Flagged Ambiguities

- **Organization** is the canonical v1 term. Do not use **Account** or **Unit** as if they already describe the current v1 model.
- **Group** is the canonical v1 subdivision term. Do not silently replace it with **Element** in current-state v1 docs.
- **Membership Role**, **Current Permission Preset**, and **Member Preset** are different concepts.
- **Admin** is a fixed governance role, not a member preset.
- **Team Leader** is a current UI label and a future composed state, not a canonical replacement preset.
- **Permission Flag** is the current implementation concept. **Capability Level** and **Capability Map** describe the approved replacement model.
- **Group Scope** is the current single-group implementation. **Scope Set** is the approved replacement target and can eventually support `1..n` groups.
- **Scope Set** is shared across features. Do not treat scope as a per-feature matrix.
- **Duty Role** is the preferred canonical term. **Clinic Role** is legacy compatibility language tied to existing code and schema.
- **Role** is too ambiguous when it could mean **Duty Role**, **Membership Role**, or platform/admin role.
- **Critical Tasks** and **Training** are distinct feature surfaces with separate lanes.
- **Leader's Book** still exists in the product model, but it should be treated as a transitional **Compatibility Lane** while the remake is pending.
- **Lane Ownership** is not the same thing as route placement or nav treatment.
- **Rating Scheme** is not just a detail inside **Personnel** or **Leader's Book**; it owns evaluation-tracking records and workflows.
- **Evals** is a navigation and route label, not the canonical domain term for the records.
- **Sick Call** is unit-dependent: it may have no **DA6 Availability Treatment** when used like an appointment, or **Authorized Absence** when it means unavailable for duty.
- **Field/Training** is overloaded and should be split before defaulting: training that is an authorized absence belongs under **Authorized Absence**, while another duty/detail that blocks selection belongs under **Other Duty**.
- Prefer clearer split labels such as **Training / TDY** for **Authorized Absence** and **Other Duty / Detail** for **Other Duty** instead of reusing overloaded **Field/Training** language.
- Do not let a normal **Status Type** be casually configured as **Misconduct Unavailable** before the product has an honest misconduct/AWOL workflow.
- Do not treat per-run excluded-status selection as the durable source of DA Form 6 availability truth once **DA6 Availability Treatment** exists on **Status Types**.
