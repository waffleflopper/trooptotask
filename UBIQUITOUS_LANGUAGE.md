# Ubiquitous Language

## Command actors

| Term                       | Definition                                                                       | Aliases to avoid                         |
| -------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------- |
| **Commander**              | A leader who needs unit-level readiness signals and prioritized action lists.    | Admin, manager                           |
| **First Sergeant (1SG)**   | A senior enlisted leader who needs Soldier-level follow-up lists and gaps.       | First sergeant dashboard user, NCOIC     |
| **Training NCO**           | A unit user responsible for tracking ICT requirements, completions, and updates. | Training manager, training administrator |
| **Command Dashboard User** | A commander, First Sergeant, or Training NCO using reports to decide what to do. | Viewer, dashboard consumer               |

## Organization and roster

| Term                  | Definition                                                                                    | Aliases to avoid                          |
| --------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **Organization**      | The TroopToTask workspace and tenancy boundary that owns unit data.                           | Unit, account                             |
| **Unit**              | The military formation whose readiness is being measured and briefed.                         | Organization, workspace                   |
| **Group**             | A configurable unit element used for filtering and grouping Soldiers.                         | Squad, platoon, team, section             |
| **Soldier**           | A person assigned to the Unit and measured for ICT readiness.                                 | Personnel, user, member                   |
| **Personnel Record**  | The stored TroopToTask record for a Soldier.                                                  | Soldier when discussing persistence       |
| **Assigned Soldier**  | A Soldier included in the current filtered report scope.                                      | Personnel, roster row                     |
| **Rank**              | The Soldier's military grade used for display, filtering, and sorting.                        | Grade, paygrade                           |
| **MOS**               | The Soldier's military occupational specialty code used for filtering and task applicability. | Job, specialty, role                      |
| **Clinic Role**       | The Soldier's local duty or clinic role used by the reports Role filter.                      | Organization role, access role, user role |
| **Organization Role** | A user's authorization level in the Organization.                                             | Clinic role, report role, duty role       |

## ICT task library

| Term                  | Definition                                                                        | Aliases to avoid                    |
| --------------------- | --------------------------------------------------------------------------------- | ----------------------------------- |
| **ICT**               | An Individual Critical Task requirement tracked by the Critical Tasks feature.    | Task, training item                 |
| **ICT Task**          | A library item that defines a required Individual Critical Task.                  | Task, critical task, requirement    |
| **Task Code**         | The unit-unique code that identifies an ICT Task.                                 | Task ID, task number, code          |
| **Task Title**        | The human-readable name of an ICT Task.                                           | Task name, title                    |
| **Task Description**  | Optional explanatory text for an ICT Task.                                        | Notes, details                      |
| **Task Category**     | A free-text local grouping for ICT Tasks used in readiness reports.               | Domain, task domain, category field |
| **MOS Applicability** | The set of MOS codes for which an ICT Task is required.                           | Category, role applicability        |
| **Archived ICT Task** | An ICT Task hidden from active reporting without deleting historical completions. | Deleted task, inactive task         |
| **Sort Order**        | The configured display sequence for ICT Tasks.                                    | Sequence, ordering                  |

## ICT completion lifecycle

| Term                        | Definition                                                                                       | Aliases to avoid                    |
| --------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------- |
| **ICT Completion**          | A dated record that a Soldier completed an ICT Task.                                             | Completion event, task completion   |
| **Latest Completion**       | The most recent ICT Completion for one Soldier and one ICT Task at a report as-of date.          | Current completion, latest update   |
| **Validation Method**       | The method used to validate an ICT Completion.                                                   | Training method, proof type         |
| **Validated By**            | The person or source that validated an ICT Completion.                                           | Certifier, trainer                  |
| **Logged By**               | The user who entered an ICT Completion into TroopToTask.                                         | Validator, author                   |
| **Currency Window**         | The number of months after completion that an ICT Task remains current.                          | Expiration months, validity period  |
| **Default Currency Window** | The Unit-level fallback Currency Window used when an ICT Task does not define its own window.    | Default expiration, global validity |
| **Expiration Date**         | The date when an ICT Completion stops counting as current.                                       | Lapse date, expiry date             |
| **Expiring Soon Window**    | The Unit-level warning window before an Expiration Date.                                         | Warning window, upcoming expiration |
| **Current**                 | The status of an ICT Completion that has not expired and is not inside the Expiring Soon Window. | Complete, valid                     |
| **Expiring Soon**           | The status of an ICT Completion that is current but inside the Expiring Soon Window.             | At risk, near expiration            |
| **Expired**                 | The status of an ICT Completion whose Expiration Date is before the report as-of date.           | Lapsed, invalid                     |
| **Not Recorded**            | The status for a required Soldier and ICT Task pair with no ICT Completion.                      | Missing, incomplete                 |

## Readiness reporting

| Term                           | Definition                                                                                              | Aliases to avoid                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| **Filtered Report Scope**      | The Soldiers and ICT Tasks included after applying the Groups, Ranks, MOS, and Roles filters.           | Filter state, selected rows        |
| **Applicable Soldier**         | A Soldier whose MOS makes an ICT Task required in the current report calculation.                       | Assigned Soldier, eligible person  |
| **Ready Count**                | The count of applicable Soldier and ICT Task pairs whose Latest Completion is Current or Expiring Soon. | Complete count, passed count       |
| **Applicable Count**           | The count of applicable Soldier and ICT Task pairs in the denominator for readiness.                    | Assigned count, total count        |
| **Unit Readiness**             | The percentage of applicable Soldier and ICT Task pairs that are ready in the Filtered Report Scope.    | Completion rate, readiness score   |
| **Individual Readiness**       | The percentage of a Soldier's applicable ICT Tasks that are ready.                                      | Soldier completion rate            |
| **Readiness Threshold**        | The minimum readiness percentage used to flag Soldiers or ICT Tasks for action.                         | Pass line, cutoff                  |
| **Soldier Below Threshold**    | A Soldier whose Individual Readiness is below the Readiness Threshold.                                  | Low performer, deficient Soldier   |
| **Task Below Unit Threshold**  | An ICT Task whose Unit Readiness is below the Readiness Threshold.                                      | Below-threshold task, failing task |
| **Soldier Gap Count**          | The count of Applicable Soldiers who still need a specific ICT Task to become ready.                    | Gap, missing count                 |
| **At-Risk Soldier**            | A Soldier prioritized for follow-up because readiness is low, tasks are expiring, or updates are stale. | Call-list Soldier, risk row        |
| **Days Since Last ICT Update** | The number of days since a Soldier's most recent ICT Completion was logged.                             | Staleness, last updated            |

## Report visualizations

| Term                           | Definition                                                                                                    | Aliases to avoid                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| **KPI Strip**                  | The four-card summary of Unit Readiness, Soldiers Below Threshold, expiring tasks, and tasks below threshold. | Metric cards, summary row               |
| **Readiness Matrix**           | A MOS-by-Task Category heatmap showing readiness percentages.                                                 | MOS heatmap, readiness grid             |
| **Readiness Tier**             | The readiness band used to encode a readiness percentage in the matrix.                                       | Color bucket, status band               |
| **Readiness Trend**            | A 12-month series of readiness snapshots for the Unit and top MOS groups.                                     | Completion trend, activity trend        |
| **Completion Trend**           | A count of ICT Completion events over time.                                                                   | Readiness trend                         |
| **Tasks Below Unit Threshold** | The sortable report table of ICT Tasks below the Readiness Threshold.                                         | Below-threshold list, task gap table    |
| **Expiration Cliff**           | A six-month forecast of ICT Completions that will expire, segmented by MOS.                                   | Expiration forecast, renewal cliff      |
| **Projected Unit Readiness**   | The forecasted Unit Readiness at the end of the Expiration Cliff assuming no retraining occurs.               | Month-six readiness, forecast readiness |
| **At-Risk Soldiers Call List** | The sortable table of Soldiers who need command or training follow-up.                                        | Call list, at-risk table                |
| **Readiness Distribution**     | A histogram of Individual Readiness percentages within one or more MOS groups.                                | Readiness histogram, distribution chart |

## Imports and exports

| Term                    | Definition                                                                                 | Aliases to avoid                |
| ----------------------- | ------------------------------------------------------------------------------------------ | ------------------------------- |
| **ICT Task Import**     | A bulk import of ICT Task library rows.                                                    | Task upload, library import     |
| **Create-Only Import**  | An ICT Task Import mode that rejects rows whose Task Code already exists.                  | Create mode, insert-only        |
| **Upsert Import**       | An ICT Task Import mode that creates new ICT Tasks and updates existing ones by Task Code. | Update import, create-or-update |
| **Import Review**       | The pre-save review of valid and invalid rows from an ICT Task Import.                     | Preview, validation screen      |
| **Valid Import Row**    | An import row that can be saved as an ICT Task.                                            | Ready row, accepted row         |
| **Invalid Import Row**  | An import row that cannot be saved until its errors are corrected.                         | Error row, rejected row         |
| **Filtered CSV Export** | A CSV export containing the current Filtered Report Scope.                                 | Export CSV, report download     |

## Relationships

- An **Organization** is the TroopToTask workspace for one **Unit**'s data.
- A **Unit** has zero or more **Groups**, many **Soldiers**, and many **ICT Tasks**.
- A **Soldier** has exactly one current **Personnel Record** in the active roster.
- A **Soldier** belongs to zero or one **Group** in the current model.
- A **Soldier** has exactly one **Rank**, one **MOS**, and zero or one **Clinic Role** in the current model.
- An **ICT Task** belongs to exactly one **Organization**.
- An **ICT Task** has exactly one **Task Code** and one **Task Title**.
- An **ICT Task** can have zero or one **Task Category**.
- An **ICT Task** can apply to zero or more **MOS** codes through **MOS Applicability**.
- An **ICT Task** can have zero or one task-specific **Currency Window**.
- A **Default Currency Window** applies when an **ICT Task** has no task-specific **Currency Window**.
- A **Soldier** can have many **ICT Completions**.
- An **ICT Completion** belongs to exactly one **Soldier** and exactly one **ICT Task**.
- Readiness calculations use the **Latest Completion** for each **Soldier** and **ICT Task** pair at the report as-of date.
- A **Latest Completion** is **Current**, **Expiring Soon**, or **Expired** based on the **Expiration Date** and **Expiring Soon Window**.
- A required **Soldier** and **ICT Task** pair with no **ICT Completion** is **Not Recorded**.
- **Unit Readiness** is computed from **Ready Count** divided by **Applicable Count**.
- **Individual Readiness** is computed from one **Soldier**'s ready applicable tasks divided by that Soldier's applicable tasks.
- A **Task Below Unit Threshold** is an **ICT Task** whose readiness is below the **Readiness Threshold**.
- A **Soldier Gap Count** belongs to one **ICT Task** in a **Filtered Report Scope**.
- The **Readiness Matrix** groups **ICT Tasks** by **Task Category** and rows by **MOS**.
- The **Expiration Cliff** uses **Expiration Dates** from **Latest Completions** to forecast upcoming lapses.
- The **Filtered CSV Export** must reflect the same **Filtered Report Scope** as every report widget.

## Example dialogue

> **Dev:** "Should the **Readiness Trend** reuse the old completion activity list?"
>
> **Domain expert:** "No. A **Completion Trend** counts entered **ICT Completions**. The **Readiness Trend** must show monthly **Unit Readiness** snapshots."
>
> **Dev:** "If a task is in the Medical **Task Category**, does that decide which Soldiers need it?"
>
> **Domain expert:** "No. **Task Category** only groups **ICT Tasks** for the **Readiness Matrix**. **MOS Applicability** decides which **Soldiers** are **Applicable Soldiers** for that task."
>
> **Dev:** "A Soldier completed the task last year. Are they ready?"
>
> **Domain expert:** "Only if the **Latest Completion** is still inside the **Currency Window**. Otherwise it is **Expired**, or **Expiring Soon** if it is inside the warning window."
>
> **Dev:** "When the 1SG exports the report, should it export the whole Unit?"
>
> **Domain expert:** "No. The **Filtered CSV Export** should match the current **Filtered Report Scope**, just like the **KPI Strip**, **Readiness Matrix**, and **At-Risk Soldiers Call List**."

## Flagged ambiguities

- "Task" has meant both **ICT Task** and GitHub implementation work; use **ICT Task** for the domain requirement and "issue" or "ticket" for development work.
- "Readiness" and "completion" are not interchangeable; use **Readiness Trend** for command readiness snapshots and **Completion Trend** only for input activity.
- "Soldier" and "Personnel" are close but not identical; use **Soldier** in command-facing language and **Personnel Record** when discussing stored roster data.
- "Unit" and "Organization" are close but not identical; use **Unit** for military readiness language and **Organization** for tenancy, permissions, and workspace boundaries.
- "Group" can represent a squad, platoon, team, or local unit element; keep **Group** as the product term unless the specific local element type is known.
- "Role" is overloaded; use **Clinic Role** for report filters and **Organization Role** for access control.
- "Category" and "domain" were both considered for ICT grouping; use **Task Category** as the canonical field and avoid "domain" in product copy and schema changes.
- "Assigned" and "applicable" are different denominators; use **Assigned Soldier** for filtered roster headcount and **Applicable Soldier** for Soldiers whose MOS requires an ICT Task.
- "Current" and "completed" are not interchangeable; an **ICT Completion** can exist while the task status is **Expired**.
- "At risk" can refer to a Soldier or a completion; use **At-Risk Soldier** for call-list rows and **Expiring Soon** for completion status.
