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

**User Account**:
The signed-in person's identity and authentication settings, such as email address, password, MFA, and personal profile details.
_Avoid_: Organization, workspace, tenant

**User Profile**:
The personal profile details attached to a **User Account**, such as first name, last name, rank, and future display information. A **User Profile** is not the same as a **Personnel Record** and should not automatically sync to roster data.
_Avoid_: Personnel Record, Organization Member

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
The approved replacement default member-access bundle, with starter presets **Viewer**, **Operator**, and **Editor**. Viewer is read-oriented, Operator is for day-to-day feature work, and Editor is for feature-lane configuration. A **Member Preset** does not grant **Organization Governance Actions** by itself.
_Avoid_: Role, admin

**Capability Level**:
The approved replacement per-feature authority level: `none`, `view`, `operate`, or `configure`. `operate` allows normal lane work without lane configuration; `configure` allows changing that lane's settings or workflow shape. **Organization Governance Actions** stay outside **Capability Levels**.
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
The approved replacement positive-grant member scope model shared across all scoped **Feature Lanes**. A **Scope Set** may represent organization-wide access, one or more whole **Groups**, and later named **Personnel Scope** entries for specific **Personnel Records** across Groups.
_Avoid_: Per-feature scope matrix, negative grants

**Personnel Scope**:
A future person-level entry inside a **Scope Set** that grants access to selected **Personnel Records** without granting every person in their **Groups**.
_Avoid_: Ghost group

**Policy Overlay**:
A cross-cutting rule that can change the final allow or deny result after role, capability, and scope are evaluated.
_Avoid_: Permission, preset

**Policy Action**:
A stable authorization action evaluated by the policy module, such as `training.completion.record` or `organization.member.invite`, independent of the route, page, or button that requested it.
_Avoid_: Route permission, page permission

**Workflow-Level Action**:
A **Policy Action** sized around a meaningful user workflow, split only when capability level, audit treatment, or UX explanation needs differ.
_Avoid_: Button permission, giant feature edit

**Action Catalog**:
The approved registry of **Policy Actions**, including each action's owning **Feature Lane** or **Organization Governance Action**.
_Avoid_: Ad hoc permission checks

**Policy Evaluator**:
The pure TypeScript function or module that turns already-loaded policy inputs into a structured **Policy Decision** without querying Supabase or another provider directly.
_Avoid_: Supabase policy helper

**Policy Adapter**:
The provider-aware translation layer that loads organization membership, capabilities, scope, resource context, and overlays, then passes provider-agnostic inputs into the **Policy Evaluator**.
_Avoid_: Business-logic query shortcut

**Policy Reason Code**:
A stable machine-readable code on a **Policy Decision**, such as `allowed.capability`, `denied.missingCapability`, `denied.outOfScope`, `denied.readOnlyMode`, or `denied.ownerOnly`.
_Avoid_: Free-form denial text

**Policy Audit Event**:
A selective audit record produced from a **Policy Decision** for denied or suspicious attempts and sensitive successful actions.
_Avoid_: Every allowed read

**Audit Capture Rule**:
The allowlist rule that decides whether a **Policy Decision** should become a **Policy Audit Event**.
_Avoid_: Log everything

**Authoritative Policy Decision**:
A server-side **Policy Decision** that enforces writes and sensitive reads.
_Avoid_: Client-only check

**Advisory Policy Decision**:
A client-side or preloaded **Policy Decision** used only for UX hints such as hiding buttons, disabling controls, or explaining access.
_Avoid_: Security enforcement

**Vertical Authorization Slice**:
A migration slice that moves one meaningful authorization workflow through storage, adapter, evaluator, route enforcement, UI affordance, audit behavior, and tests together.
_Avoid_: Half-migrated authz layer

**Policy Decision**:
The structured effective outcome for a requested action after role, capability, scope, and policy overlays are evaluated. A **Policy Decision** should include the allow/deny result, a stable **Policy Reason Code**, and explanation metadata such as matched capability, matched scope, blocking overlay, action, lane, and resource so the app can explain and potentially audit attempted access.
_Avoid_: Checkbox

**Read-Only Mode**:
A billing-driven state where writes are blocked even if a member would otherwise have edit access.
_Avoid_: Broken permissions

### Feature Surfaces

**Calendar**:
The feature for availability, assignments, special days, and duty visibility.
_Avoid_: Leave tracker

**DONSA**:
A day of no scheduled activities, often used for training holidays and similar unit non-duty days. The current schema may still store these as `org-closure` special days, but duty-roster UX copy should prefer **DONSA** over closure language.
_Avoid_: Closure, org closure in user-facing duty-roster copy

**Availability Status**:
A calendar state that marks a person's availability, duty limitation, or absence over one or more dates.
_Avoid_: Event, appointment when status matters

**Status Type**:
An organization-defined calendar status category such as leave, school, training, appointment, sick, CQ/SD, or sick call.
_Avoid_: Calendar color only

**DA6 Availability Treatment**:
The optional duty-roster meaning attached to a **Status Type** for DA Form 6 availability and numbering.
_Avoid_: Status type, DA6 code, color

**Duty Roster**:
The replacement DA Form 6 planning surface for recurring one-duty roster templates, generated runs, accepted history, exports, and optional Calendar application.
_Avoid_: Advanced duty roster, simple duty roster, Assignments / Taskings when the DA6 roster feature is meant

**Duty Roster Template**:
A reusable definition for one duty roster, including its pool, duty-specific exemptions, and starting count source.
_Avoid_: Multi-position template, assignment type counter

**Duty Roster Template Workspace**:
The URL-addressable work surface for one **Duty Roster Template**, including generation, history, and settings.
_Avoid_: Client-only tab state, modal-only template detail

**Duty Roster Template Slug**:
The human-readable route key for one **Duty Roster Template**, unique inside its **Organization** while the internal template id remains stable.
_Avoid_: UUID-only template URL, global slug

**Duty Roster Short Code**:
The optional compact display label for a **Duty Roster Template** in dense UI, Calendar badges, and exports.
_Avoid_: Route slug, unique template identity

**Duty Roster Pool**:
The resolved set of **Personnel Records** included in a **Duty Roster Template** before duty-specific exemptions are removed.
_Avoid_: Exemption list, date availability, all personnel

**DA6 Roster Order**:
The standard order for a new DA Form 6: alphabetically within pay grade, beginning with the highest pay grade.
_Avoid_: Current-count order, random starting order

**Accepted Duty Roster Run**:
A generated **Duty Roster Run** that has been saved as official DA Form 6 history and may later be printed, exported, or applied to the **Calendar**.
_Avoid_: Preview, draft print, unsaved generation

**Manual Duty Roster Selection**:
A pre-acceptance human change to a generated roster row that replaces the proposed Soldier for a duty date.
_Avoid_: Silent override, post-apply correction

**Duty Roster Correction**:
A post-acceptance record that changes who actually performs a duty date while preserving the original accepted assignment and reason.
_Avoid_: In-place row edit, regenerated history

**Invalidated Duty Roster Run**:
The latest **Accepted Duty Roster Run** marked unusable so future counts roll back to the prior accepted history while the invalidated record remains locked and visible.
_Avoid_: Deleted roster, hidden undo, editing history in place

**Advanced Duty Run**:
The legacy current-state team-duty run for a selected advanced duty template and event date pattern.
_Avoid_: DA6 roster, replacement duty roster, regenerated apply payload

**Advanced Run Snapshot**:
The immutable inputs and outputs produced by an **Advanced Duty Run** preview.
_Avoid_: Current template state, recomputed preview

**Snapshot Custody**:
The product decision that a previewed **Advanced Run Snapshot** is persisted server-side as a 24-hour draft and later applied by snapshot identity.
_Avoid_: Signed client payload, browser-owned run state

**Advanced Duty Revision Draft**:
The single active unapplied proposal for changing an already-applied **Advanced Duty Run**. It belongs to the applied run, may span multiple event dates, and stores only the current desired slot changes instead of copying the full **Advanced Run Snapshot**.
_Avoid_: Parallel draft, hidden edit state, full snapshot copy per dropdown change

**Advanced Duty Revision Change Set**:
The compact append-only record created when an **Advanced Duty Revision Draft** is reapplied, with meaningful slot-level differences such as previous Soldier, new Soldier, cleared or locked state, reason, actor, and timestamp.
_Avoid_: Full roster snapshot copy, generic audit log only

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
Retired. Formerly the transitional compatibility surface for counseling records, development goals, and per-Soldier administrative workflows. Its surviving content (counseling records, extended info / Soldier Data Sheet, follow-ups, leader notes) has been absorbed by **Personnel**. See ADR 0008.
_Avoid_: Any new feature work, route, or permission lane under this name

**Follow-Up**:
A leader-created action item tied to a **Soldier** on the Personnel detail page. Covers counseling reminders, award recommendations, developmental goals, and any other leader working-list item. Replaces the former development goals concept.
_Avoid_: Development goal, task, to-do

**Leader Note**:
A leader-authored observation, accomplishment, or assessment recorded against a **Soldier** on the Personnel detail page. Used for NCOER bullets, award justifications, and general context — distinct from **Follow-Ups**, which are action-oriented.
_Avoid_: Follow-up when there is no action to take

**Personnel Slug**:
A human-readable route key for one **Personnel Record**, derived from `lastName-firstName` and unique inside its **Organization**. Collisions get a numeric suffix (`smith-john-2`). The slug auto-regenerates when the Soldier's name changes, with collision suffixes re-evaluated only for the person whose name changed. No stale slug redirects. The internal personnel id remains the stable database identity.
_Avoid_: UUID in URL, rank in slug

**Soldier Data Sheet**:
The expanded extended info section on the Personnel detail page containing emergency contact, spouse, vehicle, address, personal contact, blood type, BASD, date of rank, marital status, dependents/children, civilian education, and military education. The digital equivalent of the traditional Army Soldier Data Sheet.
_Avoid_: Leaders Book data sheet, extended info when discussing the full concept

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
A stored record of a completed counseling session tied to a **Soldier**, consisting of an uploaded PDF with date conducted, title, optional summary, and uploaded-by metadata. Not a workflow tool — no signature tracking, status management, or form building.
_Avoid_: Note, eval, counseling workflow

**Document**:
A general-purpose file uploaded to a **Soldier**'s Personnel record for leader reference. Covers certificates, inspection forms, scanned data sheets, BLS cards, and anything else that is not a **Counseling Record**. Accepted types: PDF, JPEG, PNG, HEIC. Max 10MB per file, with a per-Soldier storage cap (default 100MB) configurable at the **Organization** level.
_Avoid_: Attachment, upload when referring to the stored thing

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
- A high-access member may receive broad `configure` access across **Feature Lanes** without becoming an `admin`.
- A **Scope Set** applies across all scoped **Feature Lanes**; it does not vary by feature.
- A **Scope Set** should move toward multiple whole-**Group** grants sooner than later and keep room for future **Personnel Scope** entries across Groups.
- **Scope Set** grants are positive-only in the approved replacement model; do not introduce deny exceptions or "all except" scope semantics without a later explicit decision.
- `operate` is for day-to-day feature work; `configure` is for feature-lane configuration; neither implies member management, billing, ownership transfer, or destructive organization-danger authority.
- A **Policy Decision** should be structured even when a call site initially only uses the final allow/deny result.
- Structured **Policy Decisions** should support user-facing explanations and audit capture for denied or suspicious access attempts.
- Every **Policy Decision** should include a stable **Policy Reason Code**; human-facing copy should be mapped from reason codes outside the evaluator.
- **Policy Reason Codes** should be searchable and testable, while optional decision metadata carries matched action, lane, scope, overlay, and resource details.
- Audit capture should be selective: denied writes, suspicious denied access patterns, **Organization Governance Actions**, owner-only actions, billing changes, and member-management changes are audit-worthy by default.
- Do not audit every ordinary allowed read; **Audit Capture Rules** should decide when a **Policy Decision** becomes a **Policy Audit Event**.
- Server-side **Authoritative Policy Decisions** enforce writes and sensitive reads; client-side **Advisory Policy Decisions** are UX hints only.
- UI placement, hidden buttons, and disabled controls must not be treated as security enforcement.
- Policy evaluation should be action-first: routes, pages, and buttons ask about stable **Policy Actions** rather than defining authorization meaning themselves.
- The first **Action Catalog** should use **Workflow-Level Actions** rather than one action per button or one giant action per feature.
- Split **Policy Actions** when two actions need different **Capability Levels**, audit treatment, or UX explanations.
- The replacement rollout should use **Vertical Authorization Slices** filed as implementation issues, not a long-lived compatibility layer that leaves the old permission system in place.
- Current **Permission Flags** and **Group Scope** are tolerated current-state only; replacement slices should retire them from the workflows they touch.
- Every **Policy Action** should be owned by a **Feature Lane** or by **Organization Governance Action** semantics.
- The **Policy Evaluator** should be pure and provider-agnostic; provider-specific data loading belongs in a **Policy Adapter**.
- The **Policy Evaluator** should receive already-loaded facts such as actor role, **Capability Map**, **Scope Set**, resource context, and **Policy Overlays**.
- The durable first-class **Feature Lanes** are **Calendar**, **Personnel**, **Training**, **Critical Tasks**, **Onboarding**, and **Rating Scheme**.
- **Leader's Book** is retired and fully removed. It is no longer a **Compatibility Lane** or part of any lane taxonomy. See ADR 0008.
- **Counseling Records**, **Documents**, **Follow-Ups**, **Leader Notes**, and the **Soldier Data Sheet** are owned by the **Personnel** lane.
- **Lane Ownership** does not change just because a feature is temporarily rendered inside another page or route shell.
- **Organization Governance Actions** stay with `admin` and `owner`, while ownership transfer and destructive organization-danger actions stay `owner`-only.
- Governance, billing, member management, and platform concerns stay outside the durable **Feature Lane** map.
- A **Personnel Record** may belong to one **Group**.
- A **Roster** is composed of **Personnel Records** and may be narrowed by **Group**, **Personnel Record**, or typed search.
- **Duty Role** is stored today through the legacy **Clinic Role** field and may still be accepted through compatibility labels in import paths.
- **Rating Scheme** may read roster reference data to resolve rated people and raters without inheriting **Personnel** lane ownership.
- **Rating Scheme** is independently grantable from **Personnel**.
- **Evals** is the route and primary navigation label for **Rating Scheme**; it does not create a separate domain concept.
- A **Rating Scheme** entry connects one **Rated Individual** to one or more evaluation relationships such as a **Rater**.
- The **Calendar** displays **Availability Status** values defined by **Status Types**.
- **DONSAs** are Calendar special days and may still use `org-closure` as a compatibility storage value while product language phases out clinic-era closure wording.
- A **Status Type** may have no **DA6 Availability Treatment** when it should not affect duty-roster generation.
- A **DA6 Availability Treatment** can map a **Status Type** to **Authorized Absence**, **Other Duty**, or future **Misconduct Unavailable** semantics without making the **Status Type** itself a **DA6 Code**.
- Default Calendar status semantics treat leave, school, TDY, and sick as **Authorized Absence**; CQ/SD as **Other Duty**; and appointment-style statuses as having no **DA6 Availability Treatment**.
- The **Status Type** management UI should explain **DA6 Availability Treatment** with a concise help affordance so users understand which treatments continue DA Form 6 numbering and which interrupt it.
- **Misconduct Unavailable** should be visible as a future **DA6 Availability Treatment** but unavailable for routine selection until the product has an explicit misconduct/AWOL workflow.
- Existing **Status Types** may be backfilled by conservative name matching for common seeded labels, while custom or unclear names should default to no **DA6 Availability Treatment**.
- **Duty Roster Runs** should consume **DA6 Availability Treatment** from **Status Types** instead of asking users to redefine excluded statuses per run.
- When multiple **Availability Statuses** overlap on one duty date, **Authorized Absence** takes precedence over **Other Duty** because approved leave or another authorized absence is nonchargeable; future **Misconduct Unavailable** takes precedence once enabled.
- The replacement **Duty Roster** surface supersedes the old simple duty roster, advanced duty roster, and Assignments / Taskings duty-roster surfaces.
- A **Duty Roster Template** describes one duty position such as CQ NCO or CQ runner; separate duty positions use separate templates so each keeps its own DA Form 6 counts.
- The **Duty Roster** route is template-first: each **Duty Roster Template** should expose generate, history, and settings actions from its own **Duty Roster Template Workspace**.
- **Duty Roster Template Workspace** views must be URL-addressable so browser refresh, direct links, and back/forward navigation preserve the selected template and view.
- Refreshing on a template settings or history view must return to that same template view, not the base **Duty Roster** entry point.
- The **Duty Roster Template Workspace** route should use a **Duty Roster Template Slug** rather than exposing the template UUID in the address bar.
- A **Duty Roster Template Slug** is scoped to its **Organization**, so two Organizations may use the same template slug without conflict.
- The internal template id remains the stable database identity even when the route uses a human-readable **Duty Roster Template Slug**.
- The intended route shape is `/org/[orgId]/duty-rosters/[templateSlug]/generate`, `/history`, and `/settings`, with `[orgId]` able to become an organization slug in a future route migration.
- A **Duty Roster Template Slug** may be edited in template settings, but the app should not keep indefinite slug redirect history.
- If stale slug redirects are added, they should be short-lived cleanup aids rather than permanent history for every prior template name.
- A **Duty Roster Template Slug** is generated from the template name by default, such as `cq-nco` for CQ NCO.
- Template slug collisions are resolved inside the **Organization** by suggesting a suffix such as `cq-nco-2` or asking the user to choose another slug.
- Template settings should show the slug field clearly enough that users understand it affects the URL.
- A **Duty Roster Template** may have an optional **Duty Roster Short Code** for compact display, such as `CQ`.
- **Duty Roster Short Codes** are not unique template identity and may be reused across related templates such as CQ NCO and CQ runner.
- The **Duty Roster Template Slug** owns URL uniqueness; the **Duty Roster Short Code** owns compact display.
- A **Duty Roster Template** builds its **Duty Roster Pool** from inclusive criteria such as **Rank**, **Group**, **MOS**, and **Duty Role**.
- **Duty Roster Pool** criteria use OR within a category and AND across categories, such as SGT or SSG who are also in the selected Groups.
- Duty-specific exemptions are selected only from people already included in the **Duty Roster Pool**.
- A duty-specific exemption removes someone from that duty's pool; it is not the same thing as an **Availability Status** for a specific date.
- A **Manual DA6 Baseline** is optional setup data for a **Duty Roster Template** so the first generated run can pick up from a prior manual or outside system.
- A **Manual DA6 Baseline** stores optional starting counts for people in the resolved, non-exempt **Duty Roster Pool** rather than importing old roster rows.
- A person with no baseline count starts from **DA6 Roster Order**.
- If no **Manual DA6 Baseline** exists, the first generated run starts from **DA6 Roster Order**.
- After the first **Accepted Duty Roster Run** for a template, the **Manual DA6 Baseline** is locked as setup history and future counts come from accepted, non-invalidated runs.
- Duty selection uses the longest break from that duty first; **DA6 Roster Order** breaks ties when history and baseline data do not separate Soldiers.
- A **Duty Roster Run** keeps pool members in the **DA6 Matrix** when they are unavailable on a duty date; the reason they are unavailable controls whether their count increments.
- **Authorized Absence** uses `A`, is nonchargeable, and interrupts the Soldier's DA Form 6 numbering sequence.
- **Other Duty** uses `D`, is chargeable, and continues the Soldier's DA Form 6 numbering sequence.
- **Misconduct Unavailable** uses `U`, is chargeable, and continues the Soldier's DA Form 6 numbering sequence once that product workflow exists.
- The DA6 engine should preserve **Misconduct Unavailable** support, but normal UI setup must not enable it until the product has an explicit misconduct/AWOL workflow and audit trail.
- **Duty Roster Templates** consume each **Status Type**'s **DA6 Availability Treatment** and do not redefine unavailable statuses per template.
- When statuses overlap during **Duty Roster** generation, the selected DA6 treatment follows the documented priority: future **Misconduct Unavailable** first once enabled, then **Authorized Absence**, then **Other Duty**.
- **Calendar** assignments stay in **Calendar**; applying an accepted **Duty Roster Run** may create or update Calendar records, but the DA Form 6 history belongs to **Duty Roster**.
- Calendar assignments created from an **Accepted Duty Roster Run** must keep lineage back to that run.
- Run-to-Calendar lineage lets invalidation remove exactly the Calendar assignments created by that run without guessing by date, template, or person.
- Generating a **Duty Roster Run** creates a preview only; it does not change DA Form 6 history or future counts until accepted.
- Before acceptance, the operator may make a **Manual Duty Roster Selection** for a duty date in the generated preview.
- Accepted history must preserve whether each roster row was generated or manually selected, with manual selections clearly marked in UI and print/export output.
- A simple `MANUAL` marker is the preferred visible label for manually selected roster rows.
- The preview list should show the final selected Soldier, a `MANUAL` marker when changed by the operator, and access to the original generated Soldier.
- The **DA6 Matrix** should show only authorized DA Form 6 markings such as sequence numbers, `A`, `D`, and future `U`; it should not show `MANUAL` inside matrix cells.
- Accepted history for a **Duty Roster Run** should provide both an operational list view and a **DA6 Matrix** view.
- The accepted-history list view supports understanding, correction review, and duty-swap context; the **DA6 Matrix** view supports DA Form 6 review, print, and export.
- **Manual Duty Roster Selections** may choose someone outside the generated **Duty Roster Pool** as a reviewable human decision, but the UI must warn and preserve that choice in history.
- Archived or missing Personnel Records are hard blocks for **Manual Duty Roster Selections**.
- Most manual-selection conflicts should be reviewable with clear warnings and reason capture rather than hard-blocked.
- **Manual Duty Roster Selections** require a reason only when they carry a reviewable warning such as outside-pool, unavailable status, or another duty conflict.
- Clean pre-acceptance swaps between eligible Soldiers may be marked `MANUAL` without requiring a reason.
- Post-acceptance changes use a **Duty Roster Correction**, not a **Manual Duty Roster Selection**.
- A **Duty Roster Correction** should capture the original Soldier, replacement Soldier, duty date, reason, actor, and timestamp.
- A **Duty Roster Correction** requires a reason because it changes official history and future count derivation.
- **Duty Roster Corrections** should support duty-swap memo language such as one Soldier performing the duty for another Soldier because of a stated reason.
- A **Duty Roster Correction** preserves the original accepted row and records what actually happened; it does not mutate accepted history in place.
- Future count derivation uses the Soldier who actually performed duty after **Duty Roster Corrections**, while history still shows the original accepted Soldier.
- If an **Accepted Duty Roster Run** is invalidated, its **Duty Roster Corrections** remain visible in that run's history but no longer affect future count derivation.
- When a **Duty Roster Correction** changes a run that was applied to the **Calendar**, the Calendar assignment should update to the Soldier who actually performs the duty while preserving lineage to the accepted run.
- A generated **Duty Roster Run** snapshots the resolved pool, duty-specific exemptions, baseline/count source, relevant **Availability Status** treatment, generated result, and display fields the operator reviewed.
- An **Accepted Duty Roster Run** advances future duty counts whether or not it is immediately applied to the **Calendar**.
- Accepted history, official exports, and later Calendar apply from history use the saved **Run Snapshot**, not current Personnel, template, or Calendar state.
- Editing a **Duty Roster Template** affects future generated runs only and must not mutate **Accepted Duty Roster Run** history.
- Corrections to the latest accepted history use latest-run invalidation followed by a new generated run, not in-place template-driven history changes.
- Applying a **Duty Roster Run** to the **Calendar** accepts it if it was still only a preview.
- Draft printing is allowed from a preview, but official print/export output should come from an **Accepted Duty Roster Run**.
- An **Accepted Duty Roster Run** that was not applied to the **Calendar** at acceptance time may be applied later from history.
- Accepting and opening print preview saves the **Accepted Duty Roster Run** before the print surface opens, even if the user cancels printing.
- Only the latest **Accepted Duty Roster Run** for a **Duty Roster Template** may be invalidated.
- An **Invalidated Duty Roster Run** remains visible in history, is locked from normal apply/print actions, and is excluded from future count derivation.
- Invalidating a run is an audit action for recent mistakes such as incorrect statuses or roster setup, not a way to rewrite older DA Form 6 history.
- Invalidating an **Accepted Duty Roster Run** that was applied to the **Calendar** removes the Calendar assignments from that run after explicit confirmation.
- The invalidation confirmation should clearly warn: "Invalidating this run will remove the assignments from the calendar. Are you sure?"
- An **Advanced Duty Run** produces exactly one draft **Advanced Run Snapshot** during preview.
- **Snapshot Custody** keeps the draft **Advanced Run Snapshot** server-side so apply, retry, and export can reference the same previewed run.
- An unapplied **Advanced Run Snapshot** may produce a preview-only team duty packet export, but it is not a final applied record.
- A successfully applied **Advanced Run Snapshot** is finalized and cannot be normally re-applied.
- Applying an **Advanced Run Snapshot** requires snapshot identity plus a fingerprint of the reviewed preview.
- Editing an applied advanced duty event should produce one active **Advanced Duty Revision Draft** at a time instead of immediately mutating the operational record.
- Applying an **Advanced Duty Revision Draft** should persist an **Advanced Duty Revision Change Set**, not a full copy of the entire **Advanced Run Snapshot** for every dropdown change.
- An **Advanced Duty Revision Draft** belongs to one applied **Advanced Duty Run** and may include changes across multiple event dates in that run.
- Starting edits on a run that already has an active **Advanced Duty Revision Draft** should reopen that draft instead of creating a parallel draft.
- Reapplying an **Advanced Duty Revision Draft** should validate current safety, permissions, read-only state, and conflicts without re-running the assignment algorithm or silently choosing different Soldiers.
- Reapplying an **Advanced Duty Revision Draft** should block hard conflicts such as missing or archived Soldiers, deleted or superseded operational records, read-only mode, missing permission, and non-waivable slot-rule violations.
- Reapplying an **Advanced Duty Revision Draft** may allow reviewable conflicts such as overlapping duty, cooldown, unavailable status, replacement of an existing slot assignment, or soft-preference warnings only with explicit confirmation and a required reason.
- **Advanced Duty Revision Change Sets** should be visible in the **Advanced Duty Workspace** as a simple revision history with date, actor, reason, and changed slots.
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
- **User Account** is personal identity and sign-in settings. It does not own organization data, memberships, billing, or governance settings.
- **User Profile** is independent from **Personnel Record** data in the first account-settings slice. Keep future linking possible, but do not auto-link or auto-sync profile and roster records without a separate decision.
- **Group** is the canonical v1 subdivision term. Do not silently replace it with **Element** in current-state v1 docs.
- **Membership Role**, **Current Permission Preset**, and **Member Preset** are different concepts.
- **Admin** is a fixed governance role, not a member preset.
- **Team Leader** is a current UI label and a future composed state, not a canonical replacement preset.
- **Permission Flag** is the current implementation concept. **Capability Level** and **Capability Map** describe the approved replacement model.
- **Group Scope** is the current single-group implementation. **Scope Set** is the approved replacement target and should support multiple Groups, with future room for **Personnel Scope** entries.
- **Scope Set** is shared across features. Do not treat scope as a per-feature matrix.
- **Scope Set** is positive-grant only. Do not model negative grants, deny exceptions, or "all except person X" semantics in the first replacement model.
- Do not model selected people across Groups as a fake **Group**. Use future **Personnel Scope** language for person-level access inside a **Scope Set**.
- Do not derive authorization meaning from route, page, or button placement. Use stable **Policy Actions** from the **Action Catalog**.
- Do not let the **Policy Evaluator** query `locals.supabase` or any provider client directly. Use a **Policy Adapter** to translate provider data into policy inputs.
- Do not put free-form explanation text in the **Policy Evaluator** as the canonical reason. Return a stable **Policy Reason Code** and map copy elsewhere.
- Do not log every **Policy Decision** by default. Use **Audit Capture Rules** so authorization audit trails stay useful instead of noisy.
- Do not rely on client-side **Advisory Policy Decisions** to protect data or writes. Re-check with an **Authoritative Policy Decision** server-side.
- Do not let the **Action Catalog** collapse into either tiny button permissions or broad catch-all feature edits.
- Do not plan the authz replacement as "new model over old storage forever." Use vertical slices to remove old permission-system dependencies from each migrated workflow.
- **Duty Role** is the preferred canonical term. **Clinic Role** is legacy compatibility language tied to existing code and schema.
- **Role** is too ambiguous when it could mean **Duty Role**, **Membership Role**, or platform/admin role.
- **Critical Tasks** and **Training** are distinct feature surfaces with separate lanes.
- **Leader's Book** is retired. Do not create new features, routes, or permission surfaces under this name. Its content has been absorbed by **Personnel** (see ADR 0008).
- **Lane Ownership** is not the same thing as route placement or nav treatment.
- **Rating Scheme** is not just a detail inside **Personnel**; it owns evaluation-tracking records and workflows.
- **Evals** is a navigation and route label, not the canonical domain term for the records.
- **Sick Call** is unit-dependent: it may have no **DA6 Availability Treatment** when used like an appointment, or **Authorized Absence** when it means unavailable for duty.
- **Field/Training** is overloaded and should be split before defaulting: training that is an authorized absence belongs under **Authorized Absence**, while another duty/detail that blocks selection belongs under **Other Duty**.
- Prefer clearer split labels such as **Training / TDY** for **Authorized Absence** and **Other Duty / Detail** for **Other Duty** instead of reusing overloaded **Field/Training** language.
- Prefer **DONSA** or **Training Holiday** in military-facing UX copy. Treat **closure** and **org closure** as legacy compatibility wording to phase out across the site.
- Do not let a normal **Status Type** be casually configured as **Misconduct Unavailable** before the product has an honest misconduct/AWOL workflow.
- Do not treat per-run excluded-status selection as the durable source of DA Form 6 availability truth once **DA6 Availability Treatment** exists on **Status Types**.
