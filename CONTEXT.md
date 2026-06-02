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

**Access Request**:
A beta-period request for reviewed entry into TroopToTask before a **User Account** is activated. Approval authorizes an account setup attempt, but it is not itself an **Organization Membership** or an **Organization Invitation**. The flow exists to control beta access and should replace legacy invite-code registration rather than becoming a permanent parallel registration system.
_Avoid_: Invite, registration invite, organization member, permanent signup queue

**Account Setup Link**:
An app-owned, time-limited link sent after an **Access Request** is approved so the recipient can activate a **User Account** and choose their own password.
_Avoid_: Supabase invite, temporary password, magic login

**Platform Access Request Administration**:
The platform-admin workflow for reviewing **Access Requests**, issuing or resending **Account Setup Links**, explaining setup state, rejecting requests, and blocking linked **Organization Invitations** when platform access is denied. It does not create **User Accounts** directly and does not create **Organization Members**.
_Avoid_: Invite-code admin, organization member approval, Supabase invite management

**User Profile**:
The personal profile details attached to a **User Account**, such as first name, last name, rank, and future display information. A **User Profile** is not the same as a **Personnel Record** and should not automatically sync to roster data.
_Avoid_: Personnel Record, Organization Member

**Membership Role**:
The fixed organization-governance role on an **Organization Member**: `owner`, `admin`, or `member`.
_Avoid_: Team leader, viewer, editor

**Organization Governance Action**:
An action that changes organization access, settings, billing, or destructive organization state.
_Avoid_: Feature edit

**Organization Settings Workspace**:
The visible settings surface for one **Organization**, organized by user-facing sections such as organization profile, members, policies, archived personnel, data export, and owner danger actions. The workspace should consume a shaped settings model rather than raw membership, invitation, policy, audit, billing, or legacy access rows.
_Avoid_: Admin page, raw settings load, member-management route

**Organization Data Export**:
An **Organization**-scoped export of operational data for leader review, backup, or migration support. The export may include readable review sheets and raw archive sheets, but it is not itself a **Feature Lane** and should not own feature-specific business rules.
_Avoid_: Feature export, database dump, generic spreadsheet

**Organization Data Export Execution**:
The server-side workflow that enforces export quota, starts and completes the export lifecycle record, marks failed exports, records export audit events, notifies organization admins, and hands an export artifact back to the route for response formatting. It does not decide which tables, workbook sheets, or feature-specific rows belong in the **Organization Data Export**.
_Avoid_: Workbook builder, export manifest, route response formatting, feature export rules

### Product Shell And Navigation

**App Shell**:
The persistent authenticated product frame that carries primary navigation, organization context, account access, notifications, announcements, help, and account controls. The **App Shell** is shared product infrastructure and must not redefine **Feature Lane** ownership.
_Avoid_: Page chrome, dashboard wrapper, feature owner

**App Shell First Paint Data**:
The minimal blocking data needed to render a usable **App Shell** without misleading access or layout shifts: current **Organization** identity, current **Organization Member** access, current user identity, suspended/read-only state, and layout-stable announcements. Announcement load failure should render like there are no announcements.
_Avoid_: Full shell payload, every badge, feature workspace data

**App Shell Deferred Chrome Data**:
Non-blocking **App Shell** enhancement data that may load after first paint, such as notification count, the full organization switcher list, and non-layout-critical preferences. Failure should stay local to the affected shell affordance and must not block the current **Organization** page.
_Avoid_: Access enforcement, layout-stable announcement data, required route data

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

**Roster Read Model**:
The shared app-side read seam for the current **Roster**, including loaded **Personnel Records**, group membership, and roster ordering helpers used across feature surfaces. **Personnel** still owns roster administration and write workflows.
_Avoid_: Personnel store when cross-feature read access is meant, write-side personnel workflow

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

**Member Access Projection**:
The app-side read model that translates current and replacement member-access storage into a member's **Membership Role**, **Member Preset**, **Capability Map**, **Scope Set**, and compatibility presentation fields. It is the seam callers should use when they need to display or reason about effective member access without knowing legacy **Permission Flag** storage details.
_Avoid_: Settings-only access helper, raw permission row

**Feature Lane**:
The permission surface for one product feature area.
_Avoid_: Shared permission bucket

**Lane Ownership**:
The durable permission owner for a feature, independent of temporary route, page, or screen placement.
_Avoid_: Current page nesting

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

**Billing Snapshot Transition**:
The app-owned billing lifecycle decision that turns provider facts, such as Stripe checkout, subscription, invoice, or cancellation events, into the current **Organization** billing snapshot, legacy Organization billing mirror, and related cache effects.
_Avoid_: Webhook handler, raw Stripe update, table update

### Feature Surfaces

**Calendar**:
The feature for availability, assignments, special days, and duty visibility.
_Avoid_: Leave tracker

**Calendar Render State**:
The app-side read model that turns already-loaded **Calendar** data into render-ready date header and person/date cell facts for month and long-range views. It owns lookup and shaping rules for **Availability Statuses**, **Daily Assignment Slots**, special days, duty badges, onboarding markers, and loss indicators. It does not own scrolling, virtual row layout, collapsed groups, click handlers, exports, modal state, provider access, or authorization.
_Avoid_: Calendar UI helper, cell-only index, route data

**Report Workspace**:
The shared report chrome for feature reporting surfaces: toolbar, filters, content sections, table, state, and export affordances. Reports should compose it around their feature-owned data loading, filters, math, and result views instead of rebuilding per-report page chrome.
_Avoid_: Bespoke report config shell, ad hoc `.report-config`

**Report Run**:
The client-side fetch, compute, loading, result, and error lifecycle for one report request. It coordinates a supplied data loader and compute function; it does not own route loading, provider access, authorization, or report math.
_Avoid_: Route loader, server query, report calculation layer

**Report Filter Selection**:
A report multi-select that auto-selects all options on first load and preserves user intent when option lists change. It is the shared selection behavior for report filters, not a feature-specific permission or scope model.
_Avoid_: Raw `SvelteSet` plus bespoke select-all effect

**Daily Assignment Slot**:
One Calendar assignment position for a specific date and **Assignment Type**.
_Avoid_: Duplicate assignment row, batch row

**Daily Assignment Source Lineage**:
The source reference stored on a **Daily Assignment Slot** when another workflow creates or updates the Calendar assignment, using a source kind, source id, and source row key so later updates or removals can target only the assignments created by that workflow.
_Avoid_: Duty-roster-only lineage, date/template guessing

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

**DA6 Roster Engine**:
The deep module that turns an already-classified, exempt-filtered **Duty Roster Pool** into DA Form 6 selection and numbering across a date range. It owns per-date duty selection, the chargeable queue and its positions, **Duty Priority** ordering, and **DA6 Matrix** sequence numbering, returning matrix columns, **DA6 Matrix** cells, and roster rows. It receives availability already resolved as classifications and emits **DA6 Matrix** cells directly, where an assigned cell supersedes its classification. Its boundary is string-free: it emits stable reason codes (with parameters such as **Status Type** names), and copy is mapped outside it, the same way a **Policy Reason Code** maps to text outside the **Policy Evaluator**. It does not own availability classification, **DA6 Availability Treatment** resolution, snapshot or export assembly, or personnel-display denormalization onto matrix rows.
_Avoid_: Run builder, snapshot assembler, the whole generation function

**Duty Priority**:
The **DA6 Roster Engine**'s internal ordering of which pool member is most overdue for a duty, used to rank the **Duty Roster Pool** each date before selection. It has two data-selected implementations: a last-duty-date ordering seeded from prior assignment and accepted history, and a count ordering seeded from a **Manual DA6 Baseline**, with **DA6 Roster Order** breaking ties. It is an engine-internal seam used by the engine and its own tests, not part of the engine's public interface and not a caller-pluggable strategy.
_Avoid_: Pluggable strategy hook, public ordering option, two parallel ranking branches

**Accepted Duty Roster Run**:
A generated **Duty Roster Run** that has been saved as official DA Form 6 history and may later be printed, exported, or applied to the **Calendar**.
_Avoid_: Preview, draft print, unsaved generation

**Accepted Duty Roster Run Calendar Sync**:
The workflow that makes **Calendar** assignments match an **Accepted Duty Roster Run** while preserving **Daily Assignment Source Lineage**. It covers applying an accepted run, later applying history, syncing **Duty Roster Corrections** into Calendar, detecting edited linked Calendar assignments, explaining out-of-sync states, and removing linked assignments when an **Accepted Duty Roster Run** is invalidated. It does not own preview acceptance, DA Form 6 count derivation, or accepted-history storage.
_Avoid_: Duty Roster lifecycle, Calendar assignment batch only, preview apply logic

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

**Critical Tasks Workspace**:
The app-owned route-data surface for the Critical Tasks readiness matrix, including settings, task library data, personnel, groups, and completions.
_Avoid_: Route-owned Critical Tasks settings query, generic layout helper

**Onboarding**:
The feature for template-driven in-processing workflows and onboarding progress.
_Avoid_: Checklist feature

**Follow-Up**:
A leader-created action item tied to a **Soldier** on the Personnel detail page. Covers counseling reminders, award recommendations, developmental goals, and any other leader working-list item.
_Avoid_: Development goal, task, to-do

**Leader Note**:
A leader-authored observation, accomplishment, or assessment recorded against a **Soldier** on the Personnel detail page. Used for NCOER bullets, award justifications, and general context — distinct from **Follow-Ups**, which are action-oriented.
_Avoid_: Follow-up when there is no action to take

**Personnel Slug**:
A human-readable route key for one **Personnel Record**, derived from `lastName-firstName` and unique inside its **Organization**. Collisions get a numeric suffix (`smith-john-2`). The slug auto-regenerates when the Soldier's name changes, with collision suffixes re-evaluated only for the person whose name changed. No stale slug redirects. The internal personnel id remains the stable database identity.
_Avoid_: UUID in URL, rank in slug

**Soldier Data Sheet**:
The expanded extended info section on the Personnel detail page containing emergency contact, spouse, vehicle, address, personal contact, blood type, BASD, date of rank, marital status, dependents/children, civilian education, and military education. The digital equivalent of the traditional Army Soldier Data Sheet.
_Avoid_: Extended info when discussing the full concept

**Rating Scheme**:
The active v1 surface for evaluation-tracking records and workflows for rated individuals, exposed through the Evals route with its own durable lane ownership.
_Avoid_: Personnel metadata

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

**Training Report Matrix**:
The per-Soldier, per-**Training Type** status grid that a **Training** report uses as the shared source for readiness, detail rows, sorting, pagination, and CSV output.
_Avoid_: Pivot cache, dashboard cache, report rows only

**Critical Task**:
An organization-defined ICT requirement tracked by the **Critical Tasks** feature.
_Avoid_: Training type

**Currency Status**:
The shared, provider-free determination of whether a dated requirement is still current, expiring, expired, or has no usable date, given a completion or expiration date, a resolved expiration window, ordered warning thresholds, and an as-of date. It is the single currency clock behind both **Training Type** status and **Critical Task** status. Currency Status does not decide applicability or exemption (that gate runs before it and is feature-owned), does not own display color or label text (that presenter runs after it), and does not interpret a null expiration window — each feature resolves its effective window first, since a null window means "never expires" for **Training** but "use the org default" for **Critical Tasks**. The four currency states are `not-recorded`, `current`, `expiring`, and `expired`.
_Avoid_: Compliance status, readiness, training status, ICT status when the shared currency determination is meant

## Relationships

- An **Organization** contains **Groups**, **Personnel Records**, settings, and organization-scoped feature data.
- An **Organization Member** belongs to exactly one **Organization** and receives one **Membership Role**.
- In the current model, an **Organization Member** receives **Permission Flags** and may receive one **Group Scope**.
- In the approved replacement model, a member receives one **Member Preset**, one **Capability Map**, and one shared **Scope Set**.
- A high-access member may receive broad `configure` access across **Feature Lanes** without becoming an `admin`.
- A **Scope Set** applies across all scoped **Feature Lanes**; it does not vary by feature.
- A **Scope Set** should move toward multiple whole-**Group** grants sooner than later and keep room for future **Personnel Scope** entries across Groups.
- **Scope Set** grants are positive-only in the approved replacement model; do not introduce deny exceptions or "all except" scope semantics without a later explicit decision.
- A **Personnel Record** without a **Group** is organization-scoped for **Scope Set** decisions; a whole-**Group** grant does not include ungrouped **Personnel Records**.
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
- **Counseling Records**, **Documents**, **Follow-Ups**, **Leader Notes**, and the **Soldier Data Sheet** are owned by the **Personnel** lane.
- **Lane Ownership** does not change just because a feature is temporarily rendered inside another page or route shell.
- **Organization Governance Actions** stay with `admin` and `owner`, while ownership transfer and destructive organization-danger actions stay `owner`-only.
- Governance, billing, member management, and platform concerns stay outside the durable **Feature Lane** map.
- A **Personnel Record** may belong to one **Group**.
- A **Roster** is composed of **Personnel Records** and may be narrowed by **Group**, **Personnel Record**, or typed search.
- The **Roster Read Model** is shared infrastructure for reading roster data across feature surfaces.
- **Personnel** owns roster administration and write workflows even when other features consume the **Roster Read Model**.
- **Duty Role** is stored today through the legacy **Clinic Role** field and may still be accepted through compatibility labels in import paths.
- **Rating Scheme** may read roster reference data to resolve rated people and raters without inheriting **Personnel** lane ownership.
- **Rating Scheme** is independently grantable from **Personnel**.
- **Evals** is the route and primary navigation label for **Rating Scheme**; it does not create a separate domain concept.
- A **Rating Scheme** entry connects one **Rated Individual** to one or more evaluation relationships such as a **Rater**.
- The **Calendar** displays **Availability Status** values defined by **Status Types**.
- A **Daily Assignment Slot** is unique by date and **Assignment Type**; duplicate batch inputs for the same slot are invalid rather than order-dependent.
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
- The **DA6 Roster Engine** owns duty selection, the chargeable queue and positions, **Duty Priority** ordering, and **DA6 Matrix** numbering; availability classification, **DA6 Availability Treatment** resolution, and snapshot/export assembly stay outside it.
- The **DA6 Roster Engine** emits **DA6 Matrix** cells directly, and an assigned cell supersedes its availability classification with no A/D/U code or reason; personnel-display denormalization onto matrix rows happens in the surrounding builder, not the engine.
- The **DA6 Roster Engine** boundary is string-free: it emits stable reason codes with parameters, and a single builder-side mapper renders copy, the same discipline as **Policy Reason Code** to text outside the **Policy Evaluator**.
- **Duty Priority** has a last-duty-date implementation and a **Manual DA6 Baseline** count implementation selected by whether baseline data exists; both express the same "most overdue first" rule and are engine-internal rather than caller-pluggable.
- A **Duty Roster Run** keeps pool members in the **DA6 Matrix** when they are unavailable on a duty date; the reason they are unavailable controls whether their count increments.
- **Authorized Absence** uses `A`, is nonchargeable, and interrupts the Soldier's DA Form 6 numbering sequence.
- **Other Duty** uses `D`, is chargeable, and continues the Soldier's DA Form 6 numbering sequence.
- **Misconduct Unavailable** uses `U`, is chargeable, and continues the Soldier's DA Form 6 numbering sequence once that product workflow exists.
- The DA6 engine should preserve **Misconduct Unavailable** support, but normal UI setup must not enable it until the product has an explicit misconduct/AWOL workflow and audit trail.
- **Duty Roster Templates** consume each **Status Type**'s **DA6 Availability Treatment** and do not redefine unavailable statuses per template.
- When statuses overlap during **Duty Roster** generation, the selected DA6 treatment follows the documented priority: future **Misconduct Unavailable** first once enabled, then **Authorized Absence**, then **Other Duty**.
- **Calendar** assignments stay in **Calendar**; applying an accepted **Duty Roster Run** may create or update Calendar records, but the DA Form 6 history belongs to **Duty Roster**.
- **Accepted Duty Roster Run Calendar Sync** owns the seam where accepted Duty Roster history changes Calendar assignments; it should not become the owner of preview acceptance, DA Form 6 count derivation, or accepted-history storage.
- **Accepted Duty Roster Run Calendar Sync** should behave as all-or-reverted: applying, later applying, correction sync, invalidation cleanup, and rollback should not leave callers responsible for partial Calendar sync state.
- **Accepted Duty Roster Run Calendar Sync** should expose sync state before writes, including in-sync, Duty Roster newer than Calendar, Calendar manually changed, and needs-review cases.
- Reapplying **Accepted Duty Roster Run Calendar Sync** changes should require a confirmation that explains which Calendar assignments will change and why, including **Duty Roster Correction** reasons when available.
- **Accepted Duty Roster Run Calendar Sync** owns its audit events because it knows whether the operation was first apply, reapply, correction sync, invalidation cleanup, edited-Calendar detection, or rollback.
- Calendar assignments created from an **Accepted Duty Roster Run** must keep **Daily Assignment Source Lineage** back to that run.
- **Daily Assignment Source Lineage** lets invalidation remove exactly the Calendar assignments created by that source without guessing by date, template, or person.
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
- Settings-facing interfaces and UI should treat **Membership Role** changes separately from **Member Preset**, **Capability Map**, and **Scope Set** edits. A compact screen is fine, but "make admin" must not be modeled or explained as an access preset change.
- **Team Leader** is a current UI label and a future composed state, not a canonical replacement preset.
- **Permission Flag** is the current implementation concept. **Capability Level** and **Capability Map** describe the approved replacement model.
- **Group Scope** is the current single-group implementation. **Scope Set** is the approved replacement target and should support multiple Groups, with future room for **Personnel Scope** entries.
- Legacy access labels and fields such as Full Editor, Team Leader, Permission Flags, `scoped_group_id`, and route-level permission booleans are compatibility-only. They must not appear in settings-facing interfaces, UI copy, or new access tests except inside explicitly named legacy adapter tests that prove old rows map into **Member Preset**, **Capability Map**, and **Scope Set**.
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
- A **Training Report Matrix** belongs to one **Training** report request and contains one status cell for each included Soldier and **Training Type** pairing, including optional **Training Types** selected for detail or CSV output.
- Readiness derived from a **Training Report Matrix** ignores optional **Training Types** even when those optional cells remain visible in detail or CSV output.
- A Training report status filter narrows detail and CSV rows, but readiness derived from the **Training Report Matrix** still reflects the selected Soldiers and **Training Types** before status filtering.
- Training report CSV export uses the full filtered and sorted **Training Report Matrix** instead of the current paginated detail slice.
- Training Type column sorting in Training reports preserves the existing status severity order: expired, warning-orange, warning-yellow, not-completed, current, not-required, exempt.
- **Training Report Matrix** construction belongs in the **Training** report calculation layer, while server queries orchestrate authorization, data loading, filtering, sorting, pagination, and export output.
- **Lane Ownership** is not the same thing as route placement or nav treatment.
- **Rating Scheme** is not just a detail inside **Personnel**; it owns evaluation-tracking records and workflows.
- **Evals** is a navigation and route label, not the canonical domain term for the records.
- **Sick Call** is unit-dependent: it may have no **DA6 Availability Treatment** when used like an appointment, or **Authorized Absence** when it means unavailable for duty.
- **Field/Training** is overloaded and should be split before defaulting: training that is an authorized absence belongs under **Authorized Absence**, while another duty/detail that blocks selection belongs under **Other Duty**.
- Prefer clearer split labels such as **Training / TDY** for **Authorized Absence** and **Other Duty / Detail** for **Other Duty** instead of reusing overloaded **Field/Training** language.
- Prefer **DONSA** or **Training Holiday** in military-facing UX copy. Treat **closure** and **org closure** as legacy compatibility wording to phase out across the site.
- Do not let a normal **Status Type** be casually configured as **Misconduct Unavailable** before the product has an honest misconduct/AWOL workflow.
- Do not treat per-run excluded-status selection as the durable source of DA Form 6 availability truth once **DA6 Availability Treatment** exists on **Status Types**.
