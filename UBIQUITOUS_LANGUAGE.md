# Ubiquitous Language

This glossary captures the canonical v1 language for TroopToTask as it exists today. It should describe v1 honestly, while still flagging the places where legacy terminology or early architectural shortcuts are no longer the desired direction.

## Product Boundaries

| Term                          | Definition                                                                                                                                                                              | Aliases to avoid                                                             |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **TroopToTask**               | The v1 SaaS product for military unit management workflows.                                                                                                                             | App, tool, system                                                            |
| **Organization**              | The v1 workspace and tenancy boundary that owns operational data, memberships, settings, and billing state.                                                                             | Account, Unit, tenant, workspace                                             |
| **Group**                     | A configurable roster subdivision inside an **Organization** used for grouping, filtering, and scoped access.                                                                           | Element, squad, platoon, section, team when speaking about the product model |
| **Organization Member**       | An authenticated app user who belongs to an **Organization**.                                                                                                                           | User when access semantics matter                                            |
| **Membership Role**           | The fixed organization-governance role on an **Organization Member**: `owner`, `admin`, or `member`.                                                                                    | Team leader, viewer, editor                                                  |
| **Current Permission Preset** | The current v1 UI shortcut such as **Admin**, **Full Editor**, **Team Leader**, **Viewer**, or **Custom** that expands to permission flags and optional single-group scope.             | Role, future preset                                                          |
| **Member Preset**             | The approved replacement default member-access bundle; the starter presets are **Viewer**, **Operator**, and **Editor**.                                                                | Role, admin                                                                  |
| **Group Scope**               | The current single-group restriction stored today via `scoped_group_id`.                                                                                                                | Team leader role, future scope set                                           |
| **Scope Set**                 | The approved replacement positive-grant member scope model shared across all scoped feature lanes: organization-wide, one or more **Group**s, and later selected **Personnel Records**. | Per-feature scope matrix, negative grants                                    |
| **Organization Data Export**  | An **Organization**-scoped export of operational data for leader review, backup, or migration support. It may include readable review sheets and raw archive sheets.                    | Feature export, database dump, generic spreadsheet                           |

## Product Shell And Navigation

| Term                 | Definition                                                                                                                                     | Aliases to avoid                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **App Shell**        | The persistent authenticated product frame that carries primary navigation, organization context, account access, notifications, and help.     | Page chrome, dashboard wrapper                     |
| **Primary Nav**      | The main cross-feature navigation surface in the **App Shell**, rendered as a left rail on desktop and mobile tab navigation on small screens. | Sidebar when referring to mobile too, route list   |
| **Breadcrumb**       | The compact location label in the top bar that names the current **Organization** and feature surface.                                         | Page title, hero title                             |
| **Page Toolbar**     | The route-level command area for page-scoped filters, view controls, and actions.                                                              | Header, hero, stat strip                           |
| **Command Strip**    | A compact **Page Toolbar** variant used when controls should sit close to the working surface.                                                 | Stats row, summary card, floating card             |
| **Overflow Menu**    | A secondary command menu for lower-frequency page or shell actions.                                                                            | Junk drawer, hidden nav                            |
| **Help Entry Point** | The shell-level affordance that takes a user to product help.                                                                                  | Support widget when it is just the help navigation |

## People And Roster

| Term                  | Definition                                                                                                                                                                                                                                        | Aliases to avoid                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Personnel Record**  | The stored v1 roster record for a person assigned to an **Organization**.                                                                                                                                                                         | User, member, Soldier when discussing persistence              |
| **Soldier**           | The military-facing way leaders often talk about a person represented by a **Personnel Record**.                                                                                                                                                  | Personnel record when talking about the person in the workflow |
| **Personnel Scope**   | A future person-level entry inside a **Scope Set** that grants access to selected **Personnel Records** without granting their whole **Groups**.                                                                                                  | Ghost group, fake group                                        |
| **Duty Role**         | The preferred canonical term for a person's local functional role, billet, or position title inside the unit.                                                                                                                                     | Clinic role, bare role                                         |
| **Clinic Role**       | The legacy v1 runtime and schema field name kept for compatibility while docs, UX copy, exports, and new abstractions say **Duty Role**.                                                                                                          | Canonical term                                                 |
| **Rank**              | The military grade recorded on a **Personnel Record**.                                                                                                                                                                                            | Grade, pay grade                                               |
| **MOS**               | The military occupational specialty code recorded on a **Personnel Record**.                                                                                                                                                                      | Job, specialty                                                 |
| **Roster**            | The working collection of **Personnel Records** shown for an **Organization** or filtered **Group**.                                                                                                                                              | Personnel page data, list of users                             |
| **Roster Read Model** | The shared app-side read seam for the current **Roster**, including loaded **Personnel Records**, group membership, and roster ordering helpers used across feature surfaces. **Personnel** still owns roster administration and write workflows. | Personnel store when cross-feature read access is meant        |
| **Roster View Mode**  | The selected way to organize the **Roster**, currently alphabetical or by **Group**.                                                                                                                                                              | Sort toggle when grouping semantics matter                     |
| **Personnel Search**  | A text filter that narrows the **Roster** by typed characters across name, **Rank**, **MOS**, **Duty Role**, or **Group**.                                                                                                                        | Global search, personnel picker                                |
| **Group Filter**      | A page-scoped control that narrows a feature surface to one **Group**.                                                                                                                                                                            | Unit filter, element filter                                    |
| **Personnel Filter**  | A page-scoped control that narrows a feature surface to one **Personnel Record**.                                                                                                                                                                 | Soldier filter when persistence semantics matter               |

## Calendar Planning

| Term                                | Definition                                                                                                                                                                       | Aliases to avoid                        |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| **Availability Status**             | A calendar state that marks a person's availability, duty limitation, or absence over one or more dates.                                                                         | Event, appointment when status matters  |
| **Daily Assignment Slot**           | One Calendar assignment position for a specific date and **Assignment Type**.                                                                                                    | Duplicate assignment row, batch row     |
| **Daily Assignment Source Lineage** | The source reference stored on a **Daily Assignment Slot** when another workflow creates or updates the Calendar assignment, using a source kind, source id, and source row key. | Duty-roster-only lineage, guessing rows |
| **Status Type**                     | An organization-defined calendar status category such as leave, school, training, appointment, sick, CQ/SD, or sick call.                                                        | Calendar color only                     |
| **DA6 Availability Treatment**      | The optional duty-roster meaning attached to a **Status Type** for DA Form 6 availability and numbering.                                                                         | Status type, DA6 code, color            |
| **Status Legend**                   | The visual key that explains **Status Types** on the calendar surface.                                                                                                           | Filter bar, status picker               |
| **Bulk Status Update**              | A workflow for applying or removing an **Availability Status** across multiple people or dates.                                                                                  | Mass edit, batch event                  |
| **Planning Control**                | A page-level calendar control that changes planning scope, filters, visible date range, or update mode.                                                                          | Stat badge, dashboard metric            |
| **Conflict Indicator**              | A signal that a calendar status or assignment overlaps in a way that needs review.                                                                                               | Error if it is only a review condition  |
| **Readiness Signal**                | A compact visual or data cue that helps leaders interpret availability, training, evaluation, or personnel state under review.                                                   | Decorative badge, vanity metric         |

## Duty Rosters

| Term                                  | Definition                                                                                                                                                                           | Aliases to avoid                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| **Duty Roster**                       | The replacement **Calendar**-owned DA Form 6 planning surface for recurring one-duty roster templates, generated runs, accepted history, exports, and optional Calendar application. | Advanced duty roster, simple duty roster, schedule    |
| **Duty Roster Template**              | A reusable definition for one duty roster, including its pool, duty-specific exemptions, and starting count source.                                                                  | Multi-position template, assignment type counter      |
| **Duty Roster Template Workspace**    | The URL-addressable work surface for one **Duty Roster Template**, including generation, history, and settings.                                                                      | Client-only tab state, modal-only template detail     |
| **Duty Roster Template Slug**         | The human-readable route key for one **Duty Roster Template**, unique inside its **Organization** while the internal template id remains stable.                                     | UUID-only template URL, global slug                   |
| **Duty Roster Short Code**            | The optional compact display label for a **Duty Roster Template** in dense UI, Calendar badges, and exports.                                                                         | Route slug, unique template identity                  |
| **Duty Roster Pool**                  | The resolved set of **Personnel Records** included in a **Duty Roster Template** before duty-specific exemptions are removed.                                                        | Exemption list, date availability, all personnel      |
| **DA6 Roster Order**                  | The standard order for a new DA Form 6: alphabetically within pay grade, beginning with the highest pay grade.                                                                       | Current-count order, random starting order            |
| **Duty Roster Run**                   | One generated roster for a selected duty, date range, and rule configuration.                                                                                                        | Generation, batch, run job                            |
| **Accepted Duty Roster Run**          | A generated **Duty Roster Run** that has been saved as official DA Form 6 history and may later be printed, exported, or applied to the **Calendar**.                                | Preview, draft print, unsaved generation              |
| **Manual Duty Roster Selection**      | A pre-acceptance human change to a generated roster row that replaces the proposed Soldier for a duty date.                                                                          | Silent override, post-apply correction                |
| **Duty Roster Correction**            | A post-acceptance record that changes who actually performs a duty date while preserving the original accepted assignment and reason.                                                | In-place row edit, regenerated history                |
| **Invalidated Duty Roster Run**       | The latest **Accepted Duty Roster Run** marked unusable so future counts roll back to the prior accepted history while the invalidated record remains locked and visible.            | Deleted roster, hidden undo, editing history in place |
| **Run Snapshot**                      | The immutable inputs and outputs produced by a **Duty Roster Run**.                                                                                                                  | Current roster data, regenerated history              |
| **Roster Row**                        | The operational outcome for one duty date in a **Duty Roster Run**, either an assigned **Soldier** or an unfilled reason.                                                            | DA6 row, assignment row                               |
| **DA Form 6**                         | The Army duty roster form used to record duty performance and support equitable future assignments.                                                                                  | DA6 when formal document clarity matters              |
| **DA6 Matrix**                        | The structured row-by-date representation of a **DA Form 6**, including assigned, available, chargeable, and nonchargeable cells.                                                    | Export table, spreadsheet                             |
| **DA6 Cell**                          | One **Soldier** and one duty date inside a **DA6 Matrix**.                                                                                                                           | Table value, display cell                             |
| **DA6 Code**                          | A duty-roster availability marker such as assigned, `A`, `D`, or future `U`.                                                                                                         | Status type, absence type                             |
| **Chargeable Day**                    | A duty date that continues a **Soldier**'s DA6 numbering sequence even when the Soldier is not selected.                                                                             | Counted absence, penalty day                          |
| **Nonchargeable Day**                 | A duty date that interrupts a **Soldier**'s DA6 numbering sequence because the Soldier is in an authorized absence.                                                                  | Free day, ignored day                                 |
| **Authorized Absence**                | A nonchargeable reason a **Soldier** is unavailable for duty, represented as `A` in DA Form 6 language.                                                                              | Leave status when the DA6 meaning matters             |
| **Other Duty**                        | A chargeable reason a **Soldier** is unavailable because another duty or duty recovery window blocks selection, represented as `D` in DA Form 6 terms.                               | Blocked, conflict, cooldown without DA6 semantics     |
| **Misconduct Unavailable**            | A future chargeable unavailable state for absence or misconduct reasons, represented as `U` in DA Form 6 terms.                                                                      | AWOL status as a general calendar concept             |
| **Duty Exemption**                    | A rule that removes a **Personnel Record** from a specific **Duty Roster** because the person should not perform that duty.                                                          | Authorized absence, unavailability                    |
| **Numbering Mode**                    | The rule for whether a **Duty Roster Run** uses one DA6 sequence or separate weekday and weekend-holiday sequences.                                                                  | Sort mode, view mode                                  |
| **Sequence Kind**                     | The DA6 sequence category for a duty date, such as weekday, weekend, holiday, or weekend-holiday.                                                                                    | Date type when rotation semantics matter              |
| **Duty Roster Export Model**          | The formatting-neutral snapshot data used by a future export module to produce DA Form 6-style output.                                                                               | Excel HTML, download payload, generated spreadsheet   |
| **Manual History Import**             | Manually entered or imported DA Form 6 duty outcomes from a prior manual record, labeled as not system-generated, used to continue future duty runs.                                 | Generated run, hidden counter seed                    |
| **Manual DA6 Baseline**               | Optional starting counts entered on a new **Duty Roster Template** so the first generated run can continue from a prior manual or outside system.                                    | Assignment type counter, silent starting value        |
| **Manual Adjustment**                 | A user-recorded change to generated duty output that preserves the generated proposal and final human-applied state.                                                                 | Override when no audit/counter meaning is intended    |
| **Post-Apply Correction**             | An append-only **Manual Adjustment** recorded after a duty roster was applied or saved, used when real-world events change who actually pulled duty.                                 | Editing history in place, silent correction           |
| **DONSA**                             | A day of no scheduled activities, often used for training holidays and similar unit non-duty days; legacy storage may still call these `org-closure`.                                | Closure, org closure in duty-roster UX copy           |
| **Advanced Duty Run**                 | The legacy current-state team-duty run for a selected advanced duty template and event date pattern.                                                                                 | DA6 roster, replacement duty roster                   |
| **Advanced Run Snapshot**             | The immutable inputs and outputs produced by an **Advanced Duty Run** preview.                                                                                                       | Current template state, recomputed preview            |
| **Snapshot Custody**                  | The product decision that a previewed **Advanced Run Snapshot** is persisted server-side as a 24-hour draft and later applied by snapshot identity.                                  | Signed client payload, browser-owned run state        |
| **Advanced Duty Revision Draft**      | The single active unapplied proposal for changing an already-applied **Advanced Duty Run**; it belongs to the applied run, may span dates, and stores current desired slot changes.  | Parallel draft, hidden edit state, full snapshot copy |
| **Advanced Duty Revision Change Set** | The compact append-only record created when an **Advanced Duty Revision Draft** is reapplied, with meaningful slot-level differences.                                                | Full roster snapshot copy, generic audit log only     |
| **Advanced Duty Workspace**           | The operator workspace for configuring, reviewing, applying, exporting, and inspecting **Advanced Duty Runs**.                                                                       | Wizard redesign, stacked preview cards                |
| **Team Duty Packet Export Model**     | The formatting-neutral snapshot data used by a future export module to produce staff duty, CQ, or team-duty packet output.                                                           | Browser markup, DA6 matrix                            |

## Authorization And Governance

| Term                               | Definition                                                                                                                                                                                          | Aliases to avoid          |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| **Permission Flag**                | A current boolean permission on an organization membership or invitation row.                                                                                                                       | Capability, grant         |
| **Capability Level**               | The approved replacement per-feature authority level: `none`, `view`, `operate`, or `configure`; `operate` is day-to-day lane work, while `configure` is feature-lane configuration.                | Permission flag           |
| **Capability Map**                 | The lane-by-lane set of **Capability Level** values assigned to a member after preset defaults and overrides are applied.                                                                           | Role permissions blob     |
| **Feature Lane**                   | The permission surface for one product feature area.                                                                                                                                                | Shared permission bucket  |
| **Lane Ownership**                 | The durable permission owner for a feature, independent of temporary route, page, or screen placement.                                                                                              | Current page nesting      |
| **Compatibility Lane**             | A temporary permission surface kept during migration so legacy flows still work while the durable lane map is remediated.                                                                           | Durable feature lane      |
| **Policy Overlay**                 | A cross-cutting rule that can still change the final allow or deny result after role, capability, and scope are evaluated.                                                                          | Permission, preset        |
| **Policy Action**                  | A stable authorization action evaluated by the policy module, independent of the route, page, or button that requested it.                                                                          | Route permission          |
| **Workflow-Level Action**          | A **Policy Action** sized around a meaningful user workflow, split only when capability level, audit treatment, or UX explanation needs differ.                                                     | Button permission         |
| **Action Catalog**                 | The approved registry of **Policy Actions**, including each action's owning **Feature Lane** or **Organization Governance Action**.                                                                 | Ad hoc checks             |
| **Policy Evaluator**               | The pure TypeScript function or module that turns already-loaded policy inputs into a structured **Policy Decision** without querying Supabase or another provider directly.                        | Supabase policy helper    |
| **Policy Adapter**                 | The provider-aware translation layer that loads organization membership, capabilities, scope, resource context, and overlays for the **Policy Evaluator**.                                          | Business-logic shortcut   |
| **Policy Reason Code**             | A stable machine-readable code on a **Policy Decision**, such as `allowed.capability`, `denied.missingCapability`, `denied.outOfScope`, `denied.readOnlyMode`, or `denied.ownerOnly`.               | Free-form denial text     |
| **Policy Audit Event**             | A selective audit record produced from a **Policy Decision** for denied or suspicious attempts and sensitive successful actions.                                                                    | Every allowed read        |
| **Audit Capture Rule**             | The allowlist rule that decides whether a **Policy Decision** should become a **Policy Audit Event**.                                                                                               | Log everything            |
| **Authoritative Policy Decision**  | A server-side **Policy Decision** that enforces writes and sensitive reads.                                                                                                                         | Client-only check         |
| **Advisory Policy Decision**       | A client-side or preloaded **Policy Decision** used only for UX hints such as hiding buttons, disabling controls, or explaining access.                                                             | Security enforcement      |
| **Vertical Authorization Slice**   | A migration slice that moves one meaningful authorization workflow through storage, adapter, evaluator, route enforcement, UI affordance, audit behavior, and tests together.                       | Half-migrated authz layer |
| **Policy Decision**                | The structured effective outcome for a requested action after role, capability or flag, scope, and policy overlays are evaluated, including a stable reason code and metadata for UX and audit use. | Checkbox                  |
| **Organization Governance Action** | An action that changes organization access, settings, billing, or destructive org state and therefore stays reserved to `admin` or `owner`.                                                         | Feature edit              |
| **Read-Only Mode**                 | A billing-driven state where writes are blocked even if a member would otherwise have edit access.                                                                                                  | Broken permissions        |

## Feature Surfaces

| Term                   | Definition                                                                                                                                                                                                                                                                        | Aliases to avoid                                |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| **Calendar**           | The feature for availability, assignments, special days, and duty visibility.                                                                                                                                                                                                     | Leave tracker                                   |
| **Personnel**          | The feature for roster management and personnel records.                                                                                                                                                                                                                          | Member manager                                  |
| **Training**           | The feature for training types, training records, matrix views, and training reports.                                                                                                                                                                                             | Certification tracker only                      |
| **Critical Tasks**     | The feature for ICT task libraries, completions, readiness reporting, and related reporting views.                                                                                                                                                                                | Training when discussing feature ownership      |
| **Onboarding**         | The feature for template-driven in-processing workflows and onboarding progress.                                                                                                                                                                                                  | Checklist feature                               |
| **Leader's Book**      | Retired. Formerly the transitional compatibility surface for counseling records, development goals, and per-Soldier admin workflows. Surviving content absorbed by **Personnel** (ADR 0008).                                                                                      | Any new feature, route, or lane under this name |
| **Follow-Up**          | A leader-created action item tied to a **Soldier** on the Personnel detail page, covering counseling reminders, award recommendations, developmental goals, and other working-list items.                                                                                         | Development goal, task, to-do                   |
| **Leader Note**        | A leader-authored observation, accomplishment, or assessment recorded against a **Soldier**. Used for NCOER bullets, award justifications, and general context — distinct from action-oriented **Follow-Ups**.                                                                    | Follow-up when no action is needed              |
| **Personnel Slug**     | A human-readable route key for one **Personnel Record**, derived from `lastName-firstName`, unique inside its **Organization**. Collisions get a numeric suffix. Auto-regenerates on name change; no stale slug redirects. Internal personnel id remains stable identity.         | UUID in URL, rank in slug                       |
| **Soldier Data Sheet** | The expanded extended info section on the Personnel detail page: emergency contact, spouse, vehicle, address, personal contact, blood type, BASD, date of rank, marital status, dependents/children, civilian and military education.                                             | Leaders Book data sheet                         |
| **Rating Scheme**      | The active v1 surface for evaluation-tracking records and workflows for rated individuals, exposed through the Evals route with its own durable lane ownership.                                                                                                                   | Personnel metadata, leaders-book-only data      |
| **Evals**              | The primary navigation label and route surface for **Rating Scheme** workflows.                                                                                                                                                                                                   | Separate domain from Rating Scheme              |
| **Evaluation**         | The military evaluation context that **Rating Scheme** supports by identifying rated people and rating relationships.                                                                                                                                                             | Training, counseling                            |
| **Rated Individual**   | The **Personnel Record** whose evaluation relationship is tracked by a **Rating Scheme** entry.                                                                                                                                                                                   | Subject, evaluatee, assignee                    |
| **Rater**              | The **Personnel Record** or leader recorded as responsible for evaluating a **Rated Individual**.                                                                                                                                                                                 | Reviewer when referring to evaluation duty      |
| **Counseling Record**  | A stored record of a completed counseling session tied to a **Soldier**: uploaded PDF, date conducted, title, optional summary, and uploaded-by metadata. Not a workflow tool.                                                                                                    | Note, eval, counseling workflow                 |
| **Document**           | A general-purpose file uploaded to a **Soldier**'s Personnel record for leader reference (certificates, inspection forms, scanned data sheets, BLS cards). Accepted: PDF, JPEG, PNG, HEIC. Max 10MB/file, per-Soldier cap (default 100MB) configurable at **Organization** level. | Attachment, upload                              |
| **Training Type**      | An organization-defined training requirement with applicability and expiration behavior.                                                                                                                                                                                          | Certification row                               |
| **Critical Task**      | An organization-defined ICT requirement tracked by the Critical Tasks feature.                                                                                                                                                                                                    | Training type                                   |

## Relationships

- An **Organization** contains **Groups**, **Personnel Records**, settings, and organization-scoped feature data.
- An **Organization Member** belongs to an **Organization** and receives a fixed **Membership Role**.
- In the current model, an **Organization Member** also receives **Permission Flags** and an optional single-**Group** **Group Scope**.
- In the approved replacement model, a member receives a **Member Preset**, a **Capability Map**, and a shared **Scope Set**.
- A **Member Preset** seeds the **Capability Map**, and explicit overrides adjust individual **Feature Lanes** without severing preset lineage.
- **Viewer**, **Operator**, and **Editor** are member-access presets, not governance roles; even broad feature-lane `configure` access does not make a member an `admin`.
- A **Scope Set** applies across all scoped **Feature Lanes**; it does not vary by feature.
- A **Scope Set** should move toward multiple whole-**Group** grants sooner than later and keep room for future **Personnel Scope** entries across Groups.
- **Scope Set** grants are positive-only; deny exceptions and "all except" scope semantics require a later explicit decision.
- A **Personnel Record** without a **Group** is organization-scoped for **Scope Set** decisions; a whole-**Group** grant does not include ungrouped **Personnel Records**.
- A **Policy Decision** should carry structured explanation fields even when a call site initially only reads the final allow/deny result.
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
- **Leader's Book** is retired and fully removed. It is no longer a **Compatibility Lane** or part of any lane taxonomy (ADR 0008).
- **Counseling Records**, **Documents**, **Follow-Ups**, **Leader Notes**, and the **Soldier Data Sheet** are owned by the **Personnel** lane.
- The Personnel detail page requires `operate` capability on **Personnel**; view-only users use the roster list.
- **Lane Ownership** does not change just because a feature is temporarily rendered inside another page or route shell.
- **Rating Scheme** is independently grantable from **Personnel**.
- **Organization Governance Actions** stay with `admin` and `owner`, while ownership transfer and destructive organization-danger actions stay `owner`-only.
- Governance, billing, member-management, and platform concerns stay outside the durable **Feature Lane** map.
- A **Policy Overlay** can still block or gate an action even when a member's **Capability Map** would otherwise allow it.
- A **Personnel Record** may belong to one **Group**.
- A **Roster** is composed of **Personnel Records** and may be narrowed by **Group Filter**, **Personnel Filter**, or **Personnel Search**.
- The **Roster Read Model** is shared infrastructure for reading roster data across feature surfaces.
- **Personnel** owns roster administration and write workflows even when other features consume the **Roster Read Model**.
- A **Roster View Mode** changes organization of the same **Roster**; it does not change the underlying **Personnel Records**.
- A **Duty Role** is stored today through the legacy **Clinic Role** field and may still be accepted through compatibility labels in import paths.
- **Critical Tasks** is its own feature surface and now owns its dedicated authorization lane.
- **Personnel** owns roster administration.
- **Rating Scheme** may read the roster reference data it needs to resolve rated people and raters without inheriting **Personnel** lane ownership.
- **Evals** is the route and **Primary Nav** label for **Rating Scheme**; it does not create a separate domain concept.
- A **Rating Scheme** entry connects one **Rated Individual** to one or more evaluation relationships such as a **Rater**.
- The **Calendar** displays **Availability Status** values defined by **Status Types**, and the **Status Legend** explains those statuses.
- A **Status Type** may have no **DA6 Availability Treatment** when it should not affect duty-roster generation.
- A **DA6 Availability Treatment** can map a **Status Type** to **Authorized Absence**, **Other Duty**, or future **Misconduct Unavailable** semantics without making the **Status Type** itself a **DA6 Code**.
- Default Calendar status semantics treat leave, school, TDY, and sick as **Authorized Absence**; CQ/SD as **Other Duty**; and appointment-style statuses as having no **DA6 Availability Treatment**.
- The **Status Type** management UI should explain **DA6 Availability Treatment** with a concise help affordance so users understand which treatments continue DA Form 6 numbering and which interrupt it.
- **Misconduct Unavailable** should be visible as a future **DA6 Availability Treatment** but unavailable for routine selection until the product has an explicit misconduct/AWOL workflow.
- Existing **Status Types** may be backfilled by conservative name matching for common seeded labels, while custom or unclear names should default to no **DA6 Availability Treatment**.
- **Duty Roster Runs** should consume **DA6 Availability Treatment** from **Status Types** instead of asking users to redefine excluded statuses per run.
- When multiple **Availability Statuses** overlap on one duty date, **Authorized Absence** takes precedence over **Other Duty** because approved leave or another authorized absence is nonchargeable; future **Misconduct Unavailable** takes precedence once enabled.
- A **Bulk Status Update** creates, changes, or removes **Availability Status** values across multiple dates or people.
- The replacement **Duty Roster** surface supersedes the old simple duty roster, advanced duty roster, and Assignments / Taskings duty-roster surfaces.
- A **Duty Roster** belongs to **Calendar** and assigns **Soldiers** from the **Roster** to duty dates.
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
- A **Duty Roster Run** produces exactly one **Run Snapshot**.
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
- A **Run Snapshot** contains **Roster Rows**, a **DA6 Matrix**, and a **Duty Roster Export Model**.
- A **DA6 Matrix** contains one **DA6 Cell** per rostered **Soldier** per duty date.
- A **DA6 Cell** can represent an **Authorized Absence**, **Other Duty**, **Misconduct Unavailable**, assignment, or available-not-selected state.
- **Authorized Absence** creates a **Nonchargeable Day**, while **Other Duty** and **Misconduct Unavailable** create **Chargeable Days**.
- A **Duty Exemption** removes a **Personnel Record** from that specific **Duty Roster** rather than marking the person as absent.
- **Numbering Mode** controls whether **Sequence Kinds** share one sequence or keep separate weekday and weekend-holiday sequences.
- Prefer **DONSA** or **Training Holiday** in military-facing duty-roster language. Treat **closure** and **org closure** as legacy compatibility wording to phase out across the site.
- **Manual History Imports** are the preferred way to continue from an existing manual DA Form 6 because they preserve actual charged duty outcomes as history.
- A **Manual DA6 Baseline** must not live as mutable counter state on an assignment type.
- A **Manual Adjustment** must be visible as human judgment and must preserve both the generated proposal and the final applied state.
- A **Post-Apply Correction** should be append-only. The first correction workflow changes the final assigned **Soldier** for a duty date, records the reason, and does not silently change DA6 chargeability.
- **Calendar** assignments stay in **Calendar**; applying an accepted **Duty Roster Run** may create or update Calendar records, but the DA Form 6 history belongs to **Duty Roster**.
- An **Advanced Duty Run** produces exactly one draft **Advanced Run Snapshot** during preview.
- **Snapshot Custody** keeps the draft **Advanced Run Snapshot** server-side so apply, retry, and export can reference the same previewed run.
- An unapplied **Advanced Run Snapshot** may produce a preview-only **Team Duty Packet Export Model**, but it is not a final applied record.
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
- The **Advanced Duty Workspace** keeps active run review primary and moves applied-event inspection to a reachable but separate view.
- A **Team Duty Packet Export Model** belongs to the advanced team-duty lane and must not force advanced duties into **DA Form 6** output.
- **Planning Controls** belong in the **Page Toolbar** or **Command Strip** when they change the working scope of a feature surface.
- During the current transition, hidden or missing primary nav does not by itself mean a **Feature Lane** no longer exists.
- The **App Shell** is shared product infrastructure; it should not redefine feature ownership.
- A **Breadcrumb** names location and context, while a **Page Toolbar** carries actions and working controls.

## Example Dialogue

> **Dev:** "If the primary nav says **Evals**, should the domain model also rename **Rating Scheme** to Evals?"
>
> **Domain expert:** "No. **Evals** is the route and **Primary Nav** label. **Rating Scheme** is the domain surface that owns the evaluation-tracking records."
>
> **Dev:** "When a leader filters the calendar to one platoon or one person, are those different calendars?"
>
> **Domain expert:** "No. The **Calendar** is the same feature surface. A **Group Filter** or **Personnel Filter** only narrows the working view."
>
> **Dev:** "On the **Personnel** page, does switching from A-Z to By Group change the roster?"
>
> **Domain expert:** "It changes the **Roster View Mode**, not the **Roster** itself. **Personnel Search** can then narrow those same **Personnel Records** by typed characters."
>
> **Dev:** "So should **Planning Controls** live near dashboard stats?"
>
> **Domain expert:** "No. Dashboard stats summarize. **Planning Controls** belong in the **Page Toolbar** or **Command Strip** because they change the working scope of the page."
>
> **Dev:** "If a **Soldier** is on leave during a **Duty Roster Run**, do we remove them from the **DA6 Matrix**?"
>
> **Domain expert:** "No. Leave is an **Authorized Absence**, so the **DA6 Cell** uses `A` and creates a **Nonchargeable Day**. A **Duty Exemption** is what removes a person from that specific **Duty Roster**."
>
> **Dev:** "If the Soldier is blocked by another duty or cooldown, is that also `A`?"
>
> **Domain expert:** "No. That is **Other Duty**, so the cell is chargeable and the DA6 numbering continues."
>
> **Dev:** "Should a saved roster export use current Personnel data?"
>
> **Domain expert:** "No. It uses the **Run Snapshot** so the **Duty Roster Export Model** reflects what was generated and applied at the time."

## Flagged Ambiguities

- **Organization** is the canonical v1 term. Do not use **Account** or **Unit** as if they already describe the current v1 model.
- **Group** is the canonical v1 subdivision term. Do not silently replace it with **Element** in current-state v1 docs.
- **Membership Role**, **Current Permission Preset**, and **Member Preset** are different concepts. `owner` / `admin` / `member` are fixed governance roles; current UI presets are convenience shapes over booleans; the approved replacement presets are **Viewer**, **Operator**, and **Editor**.
- **Admin** is a fixed governance role, not a member preset.
- A member with many `configure` **Capability Levels** is a high-access member, not an `admin`, unless their **Membership Role** is actually `admin` or `owner`.
- **Team Leader** is a current UI label and a future composed state, not a canonical replacement preset.
- **Permission Flag** is the current implementation concept. **Capability Level** and **Capability Map** describe the approved replacement model, not today's persisted booleans.
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
- **Role** is too ambiguous when it could mean **Duty Role**, **Membership Role**, or a platform/admin role. Prefer **Duty Role** for personnel position data.
- **Critical Tasks** and **Training** are distinct feature surfaces with separate lanes.
- **Leader's Book** is retired and removed from the platform. Its surviving content is owned by **Personnel** (ADR 0008).
- **Lane Ownership** is not the same thing as route placement or nav treatment. **Rating Scheme** owns its lane whether surfaced as Evals or through a temporary compatibility path.
- **Feature Lane** and **Organization Governance Action** are different concepts. Billing, member management, org settings, and platform concerns are not part of the durable feature-lane map.
- **Personnel** owns roster administration, but another feature can still read roster reference data without inheriting the **Personnel** lane.
- **Leader's Book** is retired. Do not create new features, routes, or permission surfaces under this name. Its content has been absorbed by **Personnel** (ADR 0008).
- **Rating Scheme** is not just a detail inside **Personnel** or **Leader's Book**; it owns evaluation-tracking records and workflows, and #627 moved runtime access onto its own lane while the Evals route now owns the primary UI surface.
- **Evals** is a navigation and route label, not the canonical domain term for the records; use **Rating Scheme** for the feature surface and persistence boundary.
- **Page Toolbar**, **Command Strip**, and **Breadcrumb** are product-surface terms, not domain ownership boundaries.
- **Planning Control** is not a dashboard metric. If a control changes calendar scope, range, filters, or update mode, it belongs with the working surface.
- **Roster View Mode** and **Personnel Search** are view controls over the **Roster**, not separate roster states.
- **Personnel Filter** selects one **Personnel Record**; **Personnel Search** narrows by typed text and may match many records.
- **Availability Status** and **Status Type** are related but distinct: a status type is the category, while an availability status is the applied calendar state for a person and date range.
- **DA6 Availability Treatment** and **DA6 Code** are related but distinct: the treatment is the human-readable Calendar configuration, while the code is the DA Form 6 marker generated from it.
- **Sick Call** is unit-dependent: it may have no **DA6 Availability Treatment** when used like an appointment, or **Authorized Absence** when it means unavailable for duty.
- **Field/Training** is overloaded and should be split before defaulting: training that is an authorized absence belongs under **Authorized Absence**, while another duty/detail that blocks selection belongs under **Other Duty**.
- Prefer clearer split labels such as **Training / TDY** for **Authorized Absence** and **Other Duty / Detail** for **Other Duty** instead of reusing overloaded **Field/Training** language.
- Do not let a normal **Status Type** be casually configured as **Misconduct Unavailable** before the product has an honest misconduct/AWOL workflow.
- Do not treat per-run excluded-status selection as the durable source of DA Form 6 availability truth once **DA6 Availability Treatment** exists on **Status Types**.
- **Duty Roster** is a Calendar workflow, not the same concept as the **Roster** of **Personnel Records**.
- **Run Snapshot** must mean frozen generated truth; do not use it for current, recomputed, or live Personnel data.
- **Authorized Absence**, **Other Duty**, and **Misconduct Unavailable** are DA6 semantic categories; do not collapse them into generic unavailable status.
- **Duty Exemption** is not an **Authorized Absence**. It removes someone from that duty roster instead of marking a DA6 `A`.
- **DA6 Code** is not the same thing as a **Status Type**. A future Calendar status semantic may map a **Status Type** to a DA6 category, but the terms should stay distinct.
- **Numbering Mode** is a duty-rotation rule, not a display preference or **Roster View Mode**.
- **Duty Roster Export Model** is not an Excel file. It is snapshot data a future export module can format.
