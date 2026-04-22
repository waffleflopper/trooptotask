# Ubiquitous Language

This glossary captures the canonical TroopToTask v2 language from the planning conversation. Use these terms in code, schema, docs, issues, ADRs, and agent instructions unless an ADR deliberately changes them.

## Product Boundaries

| Term                 | Definition                                                                                                     | Aliases to avoid                                |
| -------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| **TroopToTask**      | The SaaS platform for military unit management workflows.                                                      | App, tool, system                               |
| **Account**          | The paying and administrative customer boundary in TroopToTask.                                                | Organization, tenant, customer org, workspace   |
| **Unit**             | An operational military workspace inside an **Account**.                                                       | Organization, workspace, group, customer        |
| **Parent Unit**      | A **Unit** that contains one or more subordinate **Units**.                                                    | Parent organization, higher org                 |
| **Subordinate Unit** | A **Unit** that belongs under a **Parent Unit**.                                                               | Sub-organization, child org, company-as-account |
| **Foundation Slice** | The first usable v2 path that proves auth, Account, Unit, Element, Personnel, authorization, audit, and tests. | MVP, prototype, demo                            |
| **Parity Ledger**    | A living record of v1 behavior covered, deferred, or required before a feature is considered migrated.         | Backlog, TODO list, migration notes             |

## Roster Structure

| Term                         | Definition                                                                                                         | Aliases to avoid                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| **Element**                  | A nested roster subdivision inside a **Unit**.                                                                     | Group, team, squad, platoon, section            |
| **Element Display Label**    | The customer-facing label used for an **Element** level, such as Platoon, Squad, Team, or Section.                 | Element type, group type, custom hierarchy rule |
| **Element Subtree**          | An **Element** plus all descendant **Elements** beneath it.                                                        | Group scope, team tree                          |
| **PersonnelRecord**          | A roster record for an assigned person in a **Unit**.                                                              | Soldier, person, personnel row, member, user    |
| **Primary Element**          | The single **Element** that owns a **PersonnelRecord** in the roster structure.                                    | Group assignment, team membership               |
| **Rank**                     | The military rank recorded on a **PersonnelRecord**.                                                               | Grade, pay grade                                |
| **Rank Category**            | A coarse category derived from rank for authorization or filtering, such as enlisted, officer, or warrant officer. | Rank filter, grade group                        |
| **Date Of Rank**             | The effective date of the recorded **Rank** on a **PersonnelRecord**.                                              | DOR, promotion date                             |
| **MOS**                      | The military occupational specialty recorded on a **PersonnelRecord**.                                             | Job code, specialty                             |
| **Duty Role**                | The operational role or position title recorded on a **PersonnelRecord**.                                          | Clinic role, job, slot                          |
| **ETS**                      | The expected end of service date recorded on a **PersonnelRecord**.                                                | Loss date, separation date                      |
| **PCS/DEROS**                | The expected permanent-change-of-station or overseas return date recorded on a **PersonnelRecord**.                | PCS, DEROS, move date                           |
| **Archived PersonnelRecord** | A **PersonnelRecord** removed from the active roster without deleting its history.                                 | Deleted person, inactive user, removed soldier  |

## People And Identity

| Term               | Definition                                                                           | Aliases to avoid                               |
| ------------------ | ------------------------------------------------------------------------------------ | ---------------------------------------------- |
| **Identity**       | The authenticated human represented by the auth provider.                            | User account, login, Clerk user in domain code |
| **AccountMember**  | An **Identity** with membership in an **Account**.                                   | User, member, organization member              |
| **Actor**          | The authenticated principal attempting an action in TroopToTask.                     | Current user, requester                        |
| **Personnel Link** | The auditable relationship connecting an **AccountMember** to a **PersonnelRecord**. | User-person merge, member assignment           |
| **Link History**   | The record of past **Personnel Links** and delinks for audit and lifecycle tracking. | Transfer history, member history               |

## Authorization

| Term                         | Definition                                                                                                      | Aliases to avoid                              |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| **Authorization**            | The app-owned decision about whether an **Actor** may perform a **Capability** on a resource.                   | Permissions, Clerk permissions, RLS           |
| **Capability**               | A specific action that may be allowed, such as `personnel.view` or `member.assignRole`.                         | Permission flag, feature toggle               |
| **Role**                     | A curated bundle of **Capabilities** assignable to **AccountMembers**.                                          | Preset, permission template                   |
| **Grant**                    | The assignment of a **Role** to an **AccountMember** at a **Scope**.                                            | Permission, access row, membership permission |
| **Scope**                    | The boundary limiting where a **Grant** applies.                                                                | Group, scoped group, access filter            |
| **Account Scope**            | A **Scope** that applies across an entire **Account**.                                                          | Org-wide access                               |
| **Unit Scope**               | A **Scope** that applies inside one **Unit**.                                                                   | Workspace scope                               |
| **Element Subtree Scope**    | A **Scope** that applies to an **Element Subtree**.                                                             | Group scope, team scope                       |
| **Explicit Personnel Scope** | A **Scope** that applies to selected **PersonnelRecords**.                                                      | Person list, individual access                |
| **Predicate Scope**          | A **Scope** that applies to **PersonnelRecords** matching a simple attribute rule, such as **Rank Category**.   | Filter permission, dynamic group              |
| **Positive Grant**           | A model where access exists only when a matching **Grant** allows it.                                           | Allow-only permission                         |
| **Policy Decision**          | The explainable allow or deny result produced by evaluating an **Actor**, **Capability**, resource, and grants. | Permission result, auth check                 |

## Billing And Entitlements

| Term                  | Definition                                                                                  | Aliases to avoid                 |
| --------------------- | ------------------------------------------------------------------------------------------- | -------------------------------- |
| **Subscription**      | The billing relationship that determines an **Account's** purchased plan state.             | Plan, payment, Stripe state      |
| **Entitlement**       | The app-owned effective access or allowance derived from billing state.                     | Subscription, feature flag, plan |
| **Read-Only Account** | An **Account** whose write actions are restricted because of entitlement or billing state.  | Locked org, disabled account     |
| **Suspended Account** | An **Account** whose access is restricted for billing, administrative, or security reasons. | Disabled org, banned tenant      |

## Audit And Compliance

| Term               | Definition                                                                                                                    | Aliases to avoid                |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| **Audit Event**    | A durable record of a sensitive or business-significant action.                                                               | Log, activity item              |
| **Security Event** | A durable record of an auth, access, session, or security-relevant occurrence.                                                | Audit log, incident             |
| **Access Review**  | A reviewable snapshot or workflow for validating who has access to what.                                                      | Permission audit, user review   |
| **Control Map**    | Documentation that maps system behavior to security or compliance controls.                                                   | Compliance claim, certification |
| **CUI Alignment**  | Design and evidence work intended to support Controlled Unclassified Information expectations without claiming certification. | CUI certification, compliance   |

## Architecture Governance

| Term                           | Definition                                                                                        | Aliases to avoid               |
| ------------------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------ |
| **Architecture Contract**      | The mandatory rules that define package boundaries, dependency direction, and provider isolation. | Guidelines, conventions        |
| **Architecture Fitness Check** | A CI-enforced check that rejects architecture boundary violations.                                | Lint, review checklist         |
| **ADR**                        | A decision record documenting an architecture choice and how it is enforced.                      | Design note, decision memo     |
| **Deep Module**                | A module with a small public interface that hides substantial implementation complexity.          | Service wrapper, helper        |
| **Adapter**                    | Provider-specific implementation hidden behind a TroopToTask-owned interface.                     | Integration, SDK wrapper       |
| **Port**                       | A TroopToTask-owned interface used by domain or use-case code to avoid provider coupling.         | Interface, service contract    |
| **Boundary Test**              | A test that verifies behavior through a module's public interface.                                | Unit test, implementation test |
| **Vertical Slice**             | A thin, complete path through schema, use case, UI, authorization, audit, and tests.              | Ticket, task, horizontal layer |

## Relationships

- An **Account** maps to one Clerk organization at launch.
- An **Account** contains one or more **Units**.
- A **Unit** belongs to exactly one **Account**.
- A **Unit** may have zero or one **Parent Unit**.
- A **Parent Unit** may contain many **Subordinate Units**.
- A **Unit** contains many **Elements**.
- An **Element** belongs to exactly one **Unit**.
- An **Element** may have zero or one parent **Element**.
- An **Element Subtree** contains one root **Element** and all descendant **Elements**.
- A **PersonnelRecord** belongs to exactly one **Unit**.
- A **PersonnelRecord** has one **Primary Element**.
- An **AccountMember** belongs to exactly one **Account**.
- An **Identity** may become an **AccountMember** in many **Accounts**.
- An **AccountMember** may have zero or one active **Personnel Link** in a **Unit**.
- A **PersonnelRecord** may have zero or one active **Personnel Link**.
- A **Personnel Link** has **Link History** when created, changed, or removed.
- A **Role** contains one or more **Capabilities**.
- A **Grant** assigns one **Role** to one **AccountMember** at one **Scope**.
- A **Policy Decision** evaluates one **Actor**, one **Capability**, one resource, and the relevant **Grants**.
- A **Subscription** belongs to one **Account**.
- An **Entitlement** is derived from billing state and stored in TroopToTask-owned records.
- An **Audit Event** records one significant action by one **Actor** against one resource.
- An **ADR** can change canonical language only by naming the old term, the new term, and the enforcement mechanism.

## Example Dialogue

> **Dev:** "When an **AccountMember** opens the roster, do we check their Clerk organization role to decide which people they can see?"

> **Domain expert:** "No. The Clerk organization maps to the **Account**, but TroopToTask authorization decides roster access. Evaluate the member's **Grants** for `personnel.view` against the requested **PersonnelRecords**."

> **Dev:** "So if a platoon sergeant is responsible for people across multiple platoons, do I put those people in multiple **Elements**?"

> **Domain expert:** "No. Each **PersonnelRecord** has one **Primary Element**. Cross-cutting responsibility is represented with **Explicit Personnel Scope**, **Element Subtree Scope**, or a **Predicate Scope**."

> **Dev:** "If that leader leaves the unit, do I delete the linked user?"

> **Domain expert:** "No. Delink the **AccountMember** from the **PersonnelRecord** and preserve **Link History**. The auth **Identity** and the roster **PersonnelRecord** are separate concepts."

> **Dev:** "And if a v1 field says `clinic_role`, what do we call it in v2?"

> **Domain expert:** "Use **Duty Role** or position title language. `clinic` is legacy context, not v2 domain language."

## Flagged Ambiguities

- "Account" must not mean an individual login. In v2, **Account** is the paying/admin customer boundary; use **Identity** for the authenticated person and **AccountMember** for membership in an Account.
- "Organization" is overloaded between Clerk organizations, v1 organizations, military organizations, and SaaS tenants. In v2 domain language, use **Account** for the customer boundary and **Unit** for the operational military workspace.
- "Unit" and "Element" must stay distinct. A **Unit** is the operational workspace; an **Element** is the roster subdivision inside a Unit.
- "Group" is v1 language for roster subdivision. In v2, use **Element** in code and schema; use **Element Display Label** for customer-facing terms like Platoon, Squad, Team, or Section.
- "Personnel", "Soldier", and "Person" were all considered. Use **PersonnelRecord** for the canonical roster entity because it can represent soldiers, leaders, civilians, or other assigned people.
- "Clinic role" is legacy language from the original clinic-specific use case. Use **Duty Role** or `positionTitle` instead.
- "Member" and "PersonnelRecord" are separate concepts. An **AccountMember** is an app user; a **PersonnelRecord** is a roster record; a **Personnel Link** connects them when appropriate.
- "Permission" is too vague for v2 architecture. Prefer **Capability**, **Role**, **Grant**, **Scope**, and **Policy Decision**.
- "Scope" must not collapse back to one scoped group. V2 scopes include **Account Scope**, **Unit Scope**, **Element Subtree Scope**, **Explicit Personnel Scope**, and **Predicate Scope**.
- "Subscription" and "Entitlement" must stay distinct. A **Subscription** is billing-provider state; an **Entitlement** is the app-owned effective access decision.
- "Compliance" must not imply certification. Use **Control Map** and **CUI Alignment** unless formal certification is explicitly in scope.
- "Foundation Slice" must not hide deferred parity work. Any intentionally deferred v1 behavior belongs in the **Parity Ledger**.
- "Architecture guidelines" must not be treated as optional prose. Use **Architecture Contract** for rules that are enforced by CI through **Architecture Fitness Checks**.
