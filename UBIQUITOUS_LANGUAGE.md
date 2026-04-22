# Ubiquitous Language

This glossary captures the canonical v1 language for TroopToTask as it exists today. It should describe v1 honestly, while still flagging the places where legacy terminology or early architectural shortcuts are no longer the desired direction.

## Product Boundaries

| Term                    | Definition                                                                                                                                               | Aliases to avoid                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **TroopToTask**         | The v1 SaaS product for military unit management workflows.                                                                                              | App, tool, system                                                            |
| **Organization**        | The v1 workspace and tenancy boundary that owns operational data, memberships, settings, and billing state.                                              | Account, Unit, tenant, workspace                                             |
| **Group**               | A configurable roster subdivision inside an **Organization** used for grouping, filtering, and scoped access.                                            | Element, squad, platoon, section, team when speaking about the product model |
| **Organization Member** | An authenticated app user who belongs to an **Organization**.                                                                                            | User when access semantics matter                                            |
| **Membership Role**     | The persisted organization membership role: `owner`, `admin`, or `member`.                                                                               | Team leader, viewer, full editor                                             |
| **Permission Preset**   | An admin UI shortcut such as **Admin**, **Full Editor**, **Team Leader**, **Viewer**, or **Custom** that expands to permission flags and optional scope. | Role                                                                         |
| **Group Scope**         | The optional group restriction that narrows an **Organization Member**'s effective reach to one **Group**.                                               | Team leader role                                                             |

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

| Term                | Definition                                                                                                       | Aliases to avoid         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------ |
| **Permission Flag** | A current boolean permission on an organization membership or invitation row.                                    | Capability, grant        |
| **Feature Lane**    | The permission surface for one product feature area.                                                             | Shared permission bucket |
| **Policy Decision** | The effective allow or deny outcome for a requested action after role, flags or grants, and scope are evaluated. | Checkbox                 |
| **Read-Only Mode**  | A billing-driven state where writes are blocked even if a member would otherwise have edit access.               | Broken permissions       |

## Feature Surfaces

| Term                  | Definition                                                                                                                                                                           | Aliases to avoid                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| **Calendar**          | The feature for availability, assignments, special days, and duty visibility.                                                                                                        | Leave tracker                                                     |
| **Personnel**         | The feature for roster management and personnel records.                                                                                                                             | Member manager                                                    |
| **Training**          | The feature for training types, training records, matrix views, and training reports.                                                                                                | Certification tracker only                                        |
| **Critical Tasks**    | The feature for ICT task libraries, completions, readiness reporting, and related reporting views.                                                                                   | Training when discussing feature ownership                        |
| **Onboarding**        | The feature for template-driven in-processing workflows and onboarding progress.                                                                                                     | Checklist feature                                                 |
| **Leader's Book**     | The v1 surface for counseling-adjacent records, goals, and leader-reference workflows. It still exists conceptually even though nav visibility is currently reduced during redesign. | Deprecated feature when discussing current permissions or exports |
| **Rating Scheme**     | The active v1 surface for evaluation or rating follow-up entries.                                                                                                                    | Personnel metadata, leaders-book-only data                        |
| **Counseling Record** | A stored counseling entry tied to a person.                                                                                                                                          | Note, eval                                                        |
| **Training Type**     | An organization-defined training requirement with applicability and expiration behavior.                                                                                             | Certification row                                                 |
| **Critical Task**     | An organization-defined ICT requirement tracked by the Critical Tasks feature.                                                                                                       | Training type                                                     |

## Relationships

- An **Organization** contains **Groups**, **Personnel Records**, settings, and organization-scoped feature data.
- An **Organization Member** belongs to an **Organization** and receives a **Membership Role**, **Permission Flags**, and optional **Group Scope**.
- A **Permission Preset** expands to a set of **Permission Flags** and may also imply **Group Scope**.
- A **Group Scope** narrows an **Organization Member**'s effective reach to one **Group**.
- A **Personnel Record** may belong to one **Group**.
- A **Duty Role** is stored today through the legacy **Clinic Role** field.
- **Critical Tasks** is its own feature surface even though the current authorization lane still overlaps with **Training**.
- **Rating Scheme** is active even though its current boundaries still overlap with **Leader's Book** and personnel-adjacent workflows.

## Example Dialogue

> **Dev:** "Should I document v1 access in terms of **Account** and **Unit** now that we know that is closer to the future model?"
>
> **Domain expert:** "No. In v1, the current truth is **Organization** and **Group**. Future migration language should stay separate from present-tense v1 docs."
>
> **Dev:** "If a user is a **Team Leader**, is that a persisted **Membership Role**?"
>
> **Domain expert:** "No. **Team Leader** is a **Permission Preset**. The persisted **Membership Role** is still `member`, with a specific set of **Permission Flags** and a **Group Scope**."
>
> **Dev:** "Can I treat **Critical Tasks** as just another part of **Training** because it shares the permission lane today?"
>
> **Domain expert:** "No. **Critical Tasks** is its own feature surface. The shared permission lane is current drift, not the desired feature boundary."
>
> **Dev:** "The person record has `clinicRole`. What should our docs call it?"
>
> **Domain expert:** "Document `clinicRole` as the legacy field name, but use **Duty Role** as the canonical term going forward."

## Flagged Ambiguities

- **Organization** is the canonical v1 term. Do not use **Account** or **Unit** as if they already describe the current v1 model.
- **Group** is the canonical v1 subdivision term. Do not silently replace it with **Element** in current-state v1 docs.
- **Membership Role** and **Permission Preset** are different concepts. `owner` / `admin` / `member` are persisted roles; **Full Editor**, **Team Leader**, and **Viewer** are preset shapes over the current authz model.
- **Permission Flag** is the current implementation concept. Future-facing terms like capability or grant may become canonical later, but they do not describe the current persisted v1 model yet.
- **Duty Role** is the preferred canonical term. **Clinic Role** is legacy compatibility language tied to existing code and schema.
- **Critical Tasks** and **Training** are distinct feature surfaces even though current authorization still couples them.
- **Leader's Book** still exists in the product model even though its main-nav visibility is reduced during redesign.
- **Rating Scheme** is not just a detail inside **Personnel** or **Leader's Book**; it is an active feature surface with an incomplete boundary.
