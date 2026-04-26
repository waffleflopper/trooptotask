# Ubiquitous Language

This glossary captures the canonical v1 language for TroopToTask as it exists today. It should describe v1 honestly, while still flagging the places where legacy terminology or early architectural shortcuts are no longer the desired direction.

## Product Boundaries

| Term                          | Definition                                                                                                                                                                  | Aliases to avoid                                                             |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **TroopToTask**               | The v1 SaaS product for military unit management workflows.                                                                                                                 | App, tool, system                                                            |
| **Organization**              | The v1 workspace and tenancy boundary that owns operational data, memberships, settings, and billing state.                                                                 | Account, Unit, tenant, workspace                                             |
| **Group**                     | A configurable roster subdivision inside an **Organization** used for grouping, filtering, and scoped access.                                                               | Element, squad, platoon, section, team when speaking about the product model |
| **Organization Member**       | An authenticated app user who belongs to an **Organization**.                                                                                                               | User when access semantics matter                                            |
| **Membership Role**           | The fixed organization-governance role on an **Organization Member**: `owner`, `admin`, or `member`.                                                                        | Team leader, viewer, editor                                                  |
| **Current Permission Preset** | The current v1 UI shortcut such as **Admin**, **Full Editor**, **Team Leader**, **Viewer**, or **Custom** that expands to permission flags and optional single-group scope. | Role, future preset                                                          |
| **Member Preset**             | The approved replacement default member-access bundle; the starter presets are **Viewer**, **Operator**, and **Editor**.                                                    | Role, admin                                                                  |
| **Group Scope**               | The current single-group restriction stored today via `scoped_group_id`.                                                                                                    | Team leader role, future scope set                                           |
| **Scope Set**                 | The approved replacement member scope model: organization-wide or one or more **Group**s shared across all scoped feature lanes.                                            | Per-feature scope matrix                                                     |

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

| Term                 | Definition                                                                                                                               | Aliases to avoid                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Personnel Record** | The stored v1 roster record for a person assigned to an **Organization**.                                                                | User, member, Soldier when discussing persistence              |
| **Soldier**          | The military-facing way leaders often talk about a person represented by a **Personnel Record**.                                         | Personnel record when talking about the person in the workflow |
| **Duty Role**        | The preferred canonical term for a person's local functional role, billet, or position title inside the unit.                            | Clinic role, bare role                                         |
| **Clinic Role**      | The legacy v1 runtime and schema field name kept for compatibility while docs, UX copy, exports, and new abstractions say **Duty Role**. | Canonical term                                                 |
| **Rank**             | The military grade recorded on a **Personnel Record**.                                                                                   | Grade, pay grade                                               |
| **MOS**              | The military occupational specialty code recorded on a **Personnel Record**.                                                             | Job, specialty                                                 |
| **Roster**           | The working collection of **Personnel Records** shown for an **Organization** or filtered **Group**.                                     | Personnel page data, list of users                             |
| **Roster View Mode** | The selected way to organize the **Roster**, currently alphabetical or by **Group**.                                                     | Sort toggle when grouping semantics matter                     |
| **Personnel Search** | A text filter that narrows the **Roster** by typed characters across name, **Rank**, **MOS**, **Duty Role**, or **Group**.               | Global search, personnel picker                                |
| **Group Filter**     | A page-scoped control that narrows a feature surface to one **Group**.                                                                   | Unit filter, element filter                                    |
| **Personnel Filter** | A page-scoped control that narrows a feature surface to one **Personnel Record**.                                                        | Soldier filter when persistence semantics matter               |

## Calendar Planning

| Term                    | Definition                                                                                                                     | Aliases to avoid                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| **Availability Status** | A calendar state that marks a person's availability, duty limitation, or absence over one or more dates.                       | Event, appointment when status matters |
| **Status Type**         | An organization-defined calendar status category such as leave, school, training, appointment, sick, CQ/SD, or sick call.      | Calendar color only                    |
| **Status Legend**       | The visual key that explains **Status Types** on the calendar surface.                                                         | Filter bar, status picker              |
| **Bulk Status Update**  | A workflow for applying or removing an **Availability Status** across multiple people or dates.                                | Mass edit, batch event                 |
| **Planning Control**    | A page-level calendar control that changes planning scope, filters, visible date range, or update mode.                        | Stat badge, dashboard metric           |
| **Conflict Indicator**  | A signal that a calendar status or assignment overlaps in a way that needs review.                                             | Error if it is only a review condition |
| **Readiness Signal**    | A compact visual or data cue that helps leaders interpret availability, training, evaluation, or personnel state under review. | Decorative badge, vanity metric        |

## Authorization And Governance

| Term                               | Definition                                                                                                                                  | Aliases to avoid         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| **Permission Flag**                | A current boolean permission on an organization membership or invitation row.                                                               | Capability, grant        |
| **Capability Level**               | The approved replacement per-feature authority level: `none`, `view`, `operate`, or `configure`.                                            | Permission flag          |
| **Capability Map**                 | The lane-by-lane set of **Capability Level** values assigned to a member after preset defaults and overrides are applied.                   | Role permissions blob    |
| **Feature Lane**                   | The permission surface for one product feature area.                                                                                        | Shared permission bucket |
| **Lane Ownership**                 | The durable permission owner for a feature, independent of temporary route, page, or screen placement.                                      | Current page nesting     |
| **Compatibility Lane**             | A temporary permission surface kept during migration so legacy flows still work while the durable lane map is remediated.                   | Durable feature lane     |
| **Policy Overlay**                 | A cross-cutting rule that can still change the final allow or deny result after role, capability, and scope are evaluated.                  | Permission, preset       |
| **Policy Decision**                | The effective allow or deny outcome for a requested action after role, capability or flag, scope, and policy overlays are evaluated.        | Checkbox                 |
| **Organization Governance Action** | An action that changes organization access, settings, billing, or destructive org state and therefore stays reserved to `admin` or `owner`. | Feature edit             |
| **Read-Only Mode**                 | A billing-driven state where writes are blocked even if a member would otherwise have edit access.                                          | Broken permissions       |

## Feature Surfaces

| Term                  | Definition                                                                                                                                                                                               | Aliases to avoid                           |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **Calendar**          | The feature for availability, assignments, special days, and duty visibility.                                                                                                                            | Leave tracker                              |
| **Personnel**         | The feature for roster management and personnel records.                                                                                                                                                 | Member manager                             |
| **Training**          | The feature for training types, training records, matrix views, and training reports.                                                                                                                    | Certification tracker only                 |
| **Critical Tasks**    | The feature for ICT task libraries, completions, readiness reporting, and related reporting views.                                                                                                       | Training when discussing feature ownership |
| **Onboarding**        | The feature for template-driven in-processing workflows and onboarding progress.                                                                                                                         | Checklist feature                          |
| **Leader's Book**     | The transitional compatibility surface for counseling records, development goals, and the future remade per-Soldier leader-reference or administrative workflows while its shape is still being rebuilt. | Durable future default lane                |
| **Rating Scheme**     | The active v1 surface for evaluation-tracking records and workflows for rated individuals, exposed through the Evals route with its own durable lane ownership.                                          | Personnel metadata, leaders-book-only data |
| **Evals**             | The primary navigation label and route surface for **Rating Scheme** workflows.                                                                                                                          | Separate domain from Rating Scheme         |
| **Evaluation**        | The military evaluation context that **Rating Scheme** supports by identifying rated people and rating relationships.                                                                                    | Training, counseling                       |
| **Rated Individual**  | The **Personnel Record** whose evaluation relationship is tracked by a **Rating Scheme** entry.                                                                                                          | Subject, evaluatee, assignee               |
| **Rater**             | The **Personnel Record** or leader recorded as responsible for evaluating a **Rated Individual**.                                                                                                        | Reviewer when referring to evaluation duty |
| **Counseling Record** | A stored counseling entry tied to a person.                                                                                                                                                              | Note, eval                                 |
| **Training Type**     | An organization-defined training requirement with applicability and expiration behavior.                                                                                                                 | Certification row                          |
| **Critical Task**     | An organization-defined ICT requirement tracked by the Critical Tasks feature.                                                                                                                           | Training type                              |

## Relationships

- An **Organization** contains **Groups**, **Personnel Records**, settings, and organization-scoped feature data.
- An **Organization Member** belongs to an **Organization** and receives a fixed **Membership Role**.
- In the current model, an **Organization Member** also receives **Permission Flags** and an optional single-**Group** **Group Scope**.
- In the approved replacement model, a member receives a **Member Preset**, a **Capability Map**, and a shared **Scope Set**.
- A **Member Preset** seeds the **Capability Map**, and explicit overrides adjust individual **Feature Lanes** without severing preset lineage.
- A **Scope Set** applies across all scoped **Feature Lanes**; it does not vary by feature.
- The durable first-class **Feature Lanes** are **Calendar**, **Personnel**, **Training**, **Critical Tasks**, **Onboarding**, and **Rating Scheme**.
- **Leader's Book** remains a **Compatibility Lane** and not part of the durable first-class lane map.
- **Lane Ownership** does not change just because a feature is temporarily rendered inside another page or route shell.
- **Rating Scheme** and **Leader's Book** are independently grantable feature surfaces.
- **Organization Governance Actions** stay with `admin` and `owner`, while ownership transfer and destructive organization-danger actions stay `owner`-only.
- Governance, billing, member-management, and platform concerns stay outside the durable **Feature Lane** map.
- A **Policy Overlay** can still block or gate an action even when a member's **Capability Map** would otherwise allow it.
- A **Personnel Record** may belong to one **Group**.
- A **Roster** is composed of **Personnel Records** and may be narrowed by **Group Filter**, **Personnel Filter**, or **Personnel Search**.
- A **Roster View Mode** changes organization of the same **Roster**; it does not change the underlying **Personnel Records**.
- A **Duty Role** is stored today through the legacy **Clinic Role** field and may still be accepted through compatibility labels in import paths.
- **Critical Tasks** is its own feature surface and now owns its dedicated authorization lane.
- **Personnel** owns roster administration.
- **Rating Scheme** may read the roster reference data it needs to resolve rated people and raters without inheriting **Personnel** lane ownership.
- **Evals** is the route and **Primary Nav** label for **Rating Scheme**; it does not create a separate domain concept.
- A **Rating Scheme** entry connects one **Rated Individual** to one or more evaluation relationships such as a **Rater**.
- The **Calendar** displays **Availability Status** values defined by **Status Types**, and the **Status Legend** explains those statuses.
- A **Bulk Status Update** creates, changes, or removes **Availability Status** values across multiple dates or people.
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

## Flagged Ambiguities

- **Organization** is the canonical v1 term. Do not use **Account** or **Unit** as if they already describe the current v1 model.
- **Group** is the canonical v1 subdivision term. Do not silently replace it with **Element** in current-state v1 docs.
- **Membership Role**, **Current Permission Preset**, and **Member Preset** are different concepts. `owner` / `admin` / `member` are fixed governance roles; current UI presets are convenience shapes over booleans; the approved replacement presets are **Viewer**, **Operator**, and **Editor**.
- **Admin** is a fixed governance role, not a member preset.
- **Team Leader** is a current UI label and a future composed state, not a canonical replacement preset.
- **Permission Flag** is the current implementation concept. **Capability Level** and **Capability Map** describe the approved replacement model, not today's persisted booleans.
- **Group Scope** is the current single-group implementation. **Scope Set** is the approved replacement target and can eventually support `1..n` groups.
- **Scope Set** is shared across features. Do not treat scope as a per-feature matrix.
- **Duty Role** is the preferred canonical term. **Clinic Role** is legacy compatibility language tied to existing code and schema.
- **Role** is too ambiguous when it could mean **Duty Role**, **Membership Role**, or a platform/admin role. Prefer **Duty Role** for personnel position data.
- **Critical Tasks** and **Training** are distinct feature surfaces with separate lanes.
- **Leader's Book** still exists in the product model, but it should be treated as a transitional **Compatibility Lane** while the remake is pending, not as a durable first-class lane.
- That current taxonomy does not pre-decide the rebuilt **Leader's Book** forever; a later explicit decision can revisit whether the remade surface returns to the durable lane map.
- A hidden or redirected route does not mean the underlying feature surface is already gone during this transition.
- **Lane Ownership** is not the same thing as route placement or nav treatment. **Rating Scheme** owns its lane whether surfaced as Evals or through a temporary compatibility path.
- **Feature Lane** and **Organization Governance Action** are different concepts. Billing, member management, org settings, and platform concerns are not part of the durable feature-lane map.
- **Personnel** owns roster administration, but another feature can still read roster reference data without inheriting the **Personnel** lane.
- **Rating Scheme** and **Leader's Book** are separate feature surfaces; current compatibility wiring must not be misread as intended coupling.
- **Rating Scheme** is not just a detail inside **Personnel** or **Leader's Book**; it owns evaluation-tracking records and workflows, and #627 moved runtime access onto its own lane while the Evals route now owns the primary UI surface.
- **Evals** is a navigation and route label, not the canonical domain term for the records; use **Rating Scheme** for the feature surface and persistence boundary.
- **Page Toolbar**, **Command Strip**, and **Breadcrumb** are product-surface terms, not domain ownership boundaries.
- **Planning Control** is not a dashboard metric. If a control changes calendar scope, range, filters, or update mode, it belongs with the working surface.
- **Roster View Mode** and **Personnel Search** are view controls over the **Roster**, not separate roster states.
- **Personnel Filter** selects one **Personnel Record**; **Personnel Search** narrows by typed text and may match many records.
- **Availability Status** and **Status Type** are related but distinct: a status type is the category, while an availability status is the applied calendar state for a person and date range.
