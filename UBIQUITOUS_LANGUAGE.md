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

## People And Roster

| Term                 | Definition                                                                                            | Aliases to avoid                                               |
| -------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Personnel Record** | The stored v1 roster record for a person assigned to an **Organization**.                             | User, member, Soldier when discussing persistence              |
| **Soldier**          | The military-facing way leaders often talk about a person represented by a **Personnel Record**.      | Personnel record when talking about the person in the workflow |
| **Duty Role**        | The preferred canonical term for a person's local functional role or position title inside the unit.  | Clinic role                                                    |
| **Clinic Role**      | The legacy v1 field name currently stored in code and schema for what should be called **Duty Role**. | Canonical term                                                 |
| **Rank**             | The military grade recorded on a **Personnel Record**.                                                | Grade, pay grade                                               |
| **MOS**              | The military occupational specialty code recorded on a **Personnel Record**.                          | Job, specialty                                                 |

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

| Term                  | Definition                                                                                                                                             | Aliases to avoid                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| **Calendar**          | The feature for availability, assignments, special days, and duty visibility.                                                                          | Leave tracker                              |
| **Personnel**         | The feature for roster management and personnel records.                                                                                               | Member manager                             |
| **Training**          | The feature for training types, training records, matrix views, and training reports.                                                                  | Certification tracker only                 |
| **Critical Tasks**    | The feature for ICT task libraries, completions, readiness reporting, and related reporting views.                                                     | Training when discussing feature ownership |
| **Onboarding**        | The feature for template-driven in-processing workflows and onboarding progress.                                                                       | Checklist feature                          |
| **Leader's Book**     | The transitional compatibility surface and lane for counseling-adjacent records and leader-reference workflows while its remake is pending.            | Durable future default lane                |
| **Rating Scheme**     | The active v1 surface for evaluation or rating follow-up entries, with its own durable lane ownership even when temporarily rendered inside Personnel. | Personnel metadata, leaders-book-only data |
| **Counseling Record** | A stored counseling entry tied to a person.                                                                                                            | Note, eval                                 |
| **Training Type**     | An organization-defined training requirement with applicability and expiration behavior.                                                               | Certification row                          |
| **Critical Task**     | An organization-defined ICT requirement tracked by the Critical Tasks feature.                                                                         | Training type                              |

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
- **Organization Governance Actions** stay with `admin` and `owner`, while ownership transfer and destructive organization-danger actions stay `owner`-only.
- Governance, billing, member-management, and platform concerns stay outside the durable **Feature Lane** map.
- A **Policy Overlay** can still block or gate an action even when a member's **Capability Map** would otherwise allow it.
- A **Personnel Record** may belong to one **Group**.
- A **Duty Role** is stored today through the legacy **Clinic Role** field.
- **Critical Tasks** is its own feature surface even though the current authorization lane still overlaps with **Training**.
- **Rating Scheme** is active even though its current boundaries still overlap with **Leader's Book** and personnel-adjacent workflows.

## Example Dialogue

> **Dev:** "If **Rating Scheme** sits on the **Personnel** page today, does that make **Personnel** its **Lane Ownership**?"
>
> **Domain expert:** "No. **Lane Ownership** is separate from screen placement. **Rating Scheme** keeps its own **Feature Lane** even while the UI is temporarily nested there."
>
> **Dev:** "Then why does **Leader's Book** still show up in permissions and help?"
>
> **Domain expert:** "Because **Leader's Book** is a **Compatibility Lane** during the remake. It is not part of the durable first-class lane map."
>
> **Dev:** "Do billing and member-management need their own **Feature Lanes** too?"
>
> **Domain expert:** "No. Those are **Organization Governance Actions** or policy concerns. They stay outside the durable **Feature Lane** map."

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
- **Critical Tasks** and **Training** are distinct feature surfaces even though current authorization still couples them.
- **Leader's Book** still exists in the product model, but it should be treated as a transitional **Compatibility Lane** while the remake is pending, not as a durable first-class lane.
- **Lane Ownership** is not the same thing as temporary page placement. **Rating Scheme** can live on the **Personnel** page during migration and still own its own lane.
- **Feature Lane** and **Organization Governance Action** are different concepts. Billing, member management, org settings, and platform concerns are not part of the durable feature-lane map.
- **Rating Scheme** is not just a detail inside **Personnel** or **Leader's Book**; it is an active feature surface with an incomplete boundary.
