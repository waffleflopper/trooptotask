# TroopToTask V1

Shared domain language for TroopToTask's military unit management workflows. Use the [domain reading map](docs/agents/domain.md) for behavior contracts and architecture decisions.

## Language

### Organizations, accounts, and access

**Organization**:
The boundary that owns operational data, Groups, membership, and settings.
_Avoid_: Account, Unit, tenant, workspace as the product name

**Group**:
A configurable subdivision of an Organization's roster, used for grouping, filtering, and scoped access. A Personnel Record may belong to one Group or be ungrouped.
_Avoid_: Element, squad, platoon, section, team as the product model name

**User Account**:
A person's sign-in identity and authentication settings, independent of Organization membership and roster records.
_Avoid_: Organization, Personnel Record

**User Profile**:
Personal details attached to a User Account, such as name and rank. They are independent of Personnel Record data and do not automatically link or synchronize with it.
_Avoid_: Personnel Record

**Organization Membership**:
The relationship between a User Account and one Organization, carrying that account's membership role and member access for that Organization.
_Avoid_: Account activation, invitation

**Organization Member**:
A User Account with an Organization Membership.
_Avoid_: Soldier, Personnel Record, bare User when membership matters

**Access Request**:
A request for reviewed entry into TroopToTask; approval authorizes account setup, not Organization membership. Public requests receive platform review; an Organization Invitation for a new account supplies organization-authorized approval through the invitation bridge. That approval lasts only while a linked invitation is neither revoked nor blocked, and platform staff can rescind any approval before setup completes.
_Avoid_: Organization Invitation, registration invite

**Account Setup Link**:
A time-limited link issued for an approved Access Request so the recipient can activate a User Account and choose a password. Completing setup does not accept an Organization Invitation or create Organization Membership.
_Avoid_: Temporary password, magic login, organization invite

**Organization Invitation**:
An invitation to join a specific Organization with defined member access, separate from approval to enter the platform and the Account Setup Link. Membership begins through invitation acceptance; resending the invitation does not issue a new setup credential.
_Avoid_: Access Request, Account Setup Link

**Platform Administration**:
Administration of TroopToTask-wide concerns such as accounts, Organizations, reviewed access, announcements, audit visibility, and suspension. One platform operator holds this authority through `platform_operators`, separate from Organization membership. Admin pages and endpoints require MFA at `aal2`. Suspension changes require an MFA verification within ten minutes, and the operator cannot suspend their own account. Platform commands await their audit writes before reporting success.
_Avoid_: Organization admin

### Member authority and scope

**Membership Role**:
The fixed Organization-governance role: `owner`, `admin`, or `member`. Ownership transfer and destructive Organization danger actions belong to the owner.
_Avoid_: Member Preset, Duty Role, bare Role

**Organization Governance Action**:
An action concerning Organization access, settings, or destructive Organization state, distinct from normal feature work.
_Avoid_: Feature capability

**Member Preset**:
The default feature-access bundle assigned to a member: Viewer, Operator, or Editor, with explicit capability overrides where needed. A preset does not make someone an admin or owner.
_Avoid_: Membership Role, Team Leader, Full Editor

**Feature Lane**:
A product feature's independent permission area: Calendar, Personnel, Training, Critical Tasks, Onboarding, or Rating Scheme. Its ownership is independent of navigation or page placement.
_Avoid_: Page permission, shared permission bucket

**Capability Level**:
Authority within a Feature Lane: `none`, `view`, `operate`, or `configure`. Operating means day-to-day work; configuring means changing the lane's settings or workflow shape, without granting Organization governance.
_Avoid_: Membership Role, legacy permission flag

**Capability Map**:
The member's effective Capability Level for each Feature Lane after preset defaults and explicit overrides.
_Avoid_: Role permissions

**Scope Set**:
The positive grant of Organization-wide access or one or more whole Groups, shared across scoped Feature Lanes. Group grants exclude ungrouped Personnel Records; current scope has neither per-feature variations, person-specific grants, nor deny exceptions.
_Avoid_: Team Leader role, per-feature scope matrix

**Policy Action**:
A named user workflow whose authorization meaning is independent of the route, page, or control used to request it.
_Avoid_: Button permission

**Policy Overlay**:
An additional rule that can affect authorization beyond Membership Role, capabilities, and scope, such as an owner-only restriction.
_Avoid_: Member Preset

**Policy Decision**:
The allow-or-deny result for a Policy Action after relevant authority, scope, and overlays are considered, with a reason that can explain the result. Server decisions enforce access; client affordances are advisory.
_Avoid_: Checkbox, hidden button as access enforcement

**Feature switch**:
A unit-wide setting that turns off Training, Critical Tasks, Evaluations, Onboarding, or Losses and awards for every member, owners included. A disabled feature's Feature Lane projects to `none` with the reason "off for the unit", distinct from no permission. It leaves records and stored member access unchanged, and it is not a security boundary: RLS and SQL capability checks do not read it.
_Avoid_: Feature flag, which names a release toggle; Capability Level `none`

**Strength floor**:
The duty strength percent, from 1 to 100 and 80 by default, at or above which a unit's availability reads as healthy. Below it, group and headline availability on the dashboard turn amber.
_Avoid_: Readiness goal, which applies to Training

### People and leader records

**Personnel Record**:
An Organization's roster record for a person, whether or not that person has a User Account or Organization Membership.
_Avoid_: User, member, Soldier when discussing the stored record

**Soldier**:
The military-facing person represented by a Personnel Record.
_Avoid_: Personnel Record when referring to the person

**Roster**:
The collection of Personnel Records for an Organization, optionally narrowed by Group, person, or search.
_Avoid_: List of users

**Personnel**:
The feature owning roster administration, Soldier Data Sheets, Counseling Records, Documents, Follow-Ups, and Leader Notes.
_Avoid_: Member manager

**Duty Role**:
A person's local functional role, billet, or position title. Clinic Role is legacy compatibility wording for this same concept.
_Avoid_: Clinic Role in new product copy, bare Role

**Rank**:
The military grade recorded on a Personnel Record.
_Avoid_: Grade, pay grade as the product field name

**MOS**:
The military occupational specialty code recorded on a Personnel Record.
_Avoid_: Job, specialty

**Soldier Data Sheet**:
The extended personal, family, contact, service, and education information associated with a Soldier's Personnel Record, reflecting the traditional Army Soldier Data Sheet.
_Avoid_: Extended info when naming the full concept

**Follow-Up**:
A leader-created action item tied to a Soldier, such as a counseling reminder, award recommendation, or developmental goal.
_Avoid_: Leader Note, task or to-do as the product name

**Leader Note**:
A leader's observation, accomplishment, or assessment recorded against a Soldier, such as material for an NCOER or award justification. An action to complete is a Follow-Up.
_Avoid_: Follow-Up when no action is required

**Counseling Record**:
A record of a completed counseling session tied to a Soldier, including its uploaded PDF and session details. It records completed counseling rather than a signature or form-building workflow.
_Avoid_: Leader Note, Evaluation

**Document**:
A general-purpose file stored with a Soldier's Personnel Record for leader reference, such as a certificate or scanned data sheet, distinct from a Counseling Record.
_Avoid_: Attachment, upload as the stored item's name

### Calendar and assignments

**Calendar**:
The feature for availability, daily assignments, and special days.
_Avoid_: Leave tracker

**Availability Status**:
A person's availability, duty limitation, or absence over one or more dates, classified by a Status Type.
_Avoid_: Event, appointment when the availability state is meant

**Status Type**:
An Organization-defined availability category, such as leave, school, training, appointment, or sick call.
Its saved order sets the legend and picker order. Its **One-day label**, up to three characters, names it on a one-day bar; without one, the first three letters or digits of its name are used.
_Avoid_: Calendar color

**Assignment Type**:
An Organization-defined kind of Calendar assignment, used to identify a Daily Assignment Slot.
_Avoid_: Duty Role

**Daily Assignment Slot**:
One Calendar assignment position identified by date and Assignment Type within an Organization. Repeating that pair does not create a second slot.
_Avoid_: Duplicate assignment row

**Duty roster**:
The settings on a person-assigned Assignment Type that pick who pulls it in turn: its Pool, its weekend rule and its excusals. The DA 6 form shows it.
_Avoid_: bare Roster, which is the Personnel roster

**Pool**:
The people a Duty roster picks from on a day: everyone its rules match, less the excused.
_Avoid_: Roster members

**Track**:
One run of detail days a Duty roster counts on its own. A Separate count keeps a weekday track and a weekend and holiday track; otherwise there is one.
_Avoid_: Column set, list

**Count**:
A person's number on a Track: detail days since they last pulled the duty. The highest count pulls next, and a count is always derived from assignments and statuses.
_Avoid_: Score, points, stored count

**DA 6 form**:
One period of a Duty roster's record, shown as a DA Form 6. A rule change closes the open form and saves it as a record; the next form carries everyone's count over.
_Avoid_: sheet as the stored record

**Starting number**:
A person's count going into a DA 6 form's first day on a Track, carried from the last form or typed from a paper DA 6. Typed numbers change only until the first detail on the form is served; then they are part of the record.
_Avoid_: Initial count, seed

**Event**:
Something the unit runs, supports or should know about, over one or more whole dates. Its host is this Organization or a named outside unit, and its coordinator is an Organization member who is the point of contact; neither grants access. An Event with nothing asked of the unit is awareness only.
_Avoid_: Availability Status, appointment, tasking when the Event itself is meant

**Event cancellation**:
The explicit end of an Event, with who cancelled it, when, and an optional reason. A cancelled Event stays on record and cannot be edited; Events are never deleted.
_Avoid_: Delete, archive

**Event Activity**:
The record of an Event's creation, date changes, host or coordinator changes and cancellation, written by the database with the acting member.
_Avoid_: Audit log, history

**Tasking**:
An outcome the unit owes by a date, owned by exactly one Group or by the Organization itself. It stands alone or sits under one Event, and linking or unlinking it later keeps the same Tasking and its history. It moves Open, In progress, Blocked, Completed or Cancelled only by an explicit action.
_Avoid_: Task, mission, assignment when a Daily Assignment is meant

**Responsibility**:
Who owns a Tasking: one Group, or the Organization when no single Group does. Organization level is always chosen, never assumed, and only Organization-wide Calendar operators move it.
_Avoid_: Owner, assignee

**Suspense**:
The date a Tasking's outcome is due. It marks no one as busy; execution dates do that.
_Avoid_: Deadline, due date in product copy

**Equipment requirement**:
A named item a Tasking needs, with a quantity and how many are secured. It is ready when all are secured and partial when some are. It never changes the Tasking's status.
_Avoid_: Supply, gear list

**Checklist item**:
One step on a Tasking's flat, ordered list, open or done. Completing it records who and when, and it never changes the Tasking's status.
_Avoid_: Subtask, to-do

**Tasking Activity**:
The record of a Tasking's creation, outcome, responsibility, date, Event link, requirement, instruction, equipment and checklist changes and every status move, written by the database with the acting member.
_Avoid_: Audit log, history

**Pick**:
A Person chosen to carry out a Tasking. A Group Tasking picks from the responsible Group's active roster and an Organization Tasking from the whole active roster. Picks are saved as one whole list, and the count reads picked of required.
_Avoid_: Assignment, participant in product copy

**Needs review**:
A pick whose Person was archived or left the responsible Group after being picked. It stays on the list, does not count, and clears only when an operator keeps or removes it; restoring the Person does not clear it.
_Avoid_: Invalid, stale

**Staffing advisory**:
Availability or another active Tasking that overlaps a candidate's execution dates, shown in the picker for awareness. It never blocks a pick, and a Tasking the reader cannot see reads only as committed elsewhere.
_Avoid_: Blocker, availability check

**Event work phase**:
Where a Tasking sits against its Event: execution when its execution dates or suspense touch the Event's dates, preparation when it is due before the Event starts, closeout when after it ends. Event detail groups its Taskings by phase.
_Avoid_: Stage, before/after

**Summary row**:
The one-line, non-opening row a Group-scoped reader gets for another Group's or the Organization's Tasking under a shared Event: responsible Group or Organization, outcome, status, requirement and suspense. It never carries people, instructions, a block reason, equipment, checklist or Activity, and grants no access to the Tasking. A standalone Tasking outside the reader's scope has none.
_Avoid_: Preview, stub

**Date review**:
The list of an Event's active Taskings that its date change left outside the new dates or in another phase. Nothing is moved for the operator; each Tasking opens its own edit.
_Avoid_: Cascade, auto-shift

**DONSA**:
A day of no scheduled activities, represented as a Calendar special day; Training Holiday is also appropriate military-facing wording.
_Avoid_: Closure, org closure in product copy

### Training, onboarding, and evaluations

**Training**:
The feature for Training Types, completion records, matrix views, and training reports, with its own Feature Lane.
_Avoid_: Critical Tasks, certification tracker only

**Training Type**:
An Organization-defined training requirement with applicability and expiration behavior.
_Avoid_: Critical Task, certification row

**Critical Tasks**:
The independently authorized feature for individual critical task (ICT) libraries, completions, and readiness reporting.
_Avoid_: Training when naming the feature or its authority

**Critical Task**:
An Organization-defined ICT requirement tracked by Critical Tasks.
_Avoid_: Training Type

**Currency Status**:
Whether a dated requirement is current, expiring, expired, or not recorded as of a particular date. Currency alone does not establish applicability, exemption, or readiness.
_Avoid_: Readiness, compliance

**Readiness**:
The proportion of applicable requirements counted as ready. Both Training and Critical Tasks count current and expiring requirements as ready: Training counts `current`, `warning-yellow` and `warning-orange`; Critical Tasks counts `current` and `expiring-soon`. Optional Training Types are excluded from readiness even when selected for report detail.
_Avoid_: Currency Status

**Readiness goal**:
An Organization's target Training readiness, a whole-number percent from 1 to 100 that defaults to 90. Training Reports uses it for the forecast goal line, readiness bands and horizon tone.
_Avoid_: Readiness threshold, which names the separate Critical Tasks constant

**Lapse**:
The date a ready requirement becomes expired; the first day it is no longer ready.
_Avoid_: Expiration date

**Onboarding**:
The feature for template-driven in-processing workflows and progress tracking.
_Avoid_: Account setup, checklist feature

**Onboarding Template**:
A reusable, ordered in-processing workflow definition, including checkbox steps, paperwork stages, and Training Type-linked steps.
_Avoid_: Active onboarding record, checklist

**Rating Scheme**:
The independently authorized feature tracking rated people, rating relationships, and evaluation workflows. Evals is its navigation label, not a separate domain.
_Avoid_: Personnel metadata

**Evaluation**:
The military evaluation context supported by Rating Scheme relationships and tracking.
_Avoid_: Training, counseling

**Rated Individual**:
The person represented by a Personnel Record whose evaluation relationships are tracked in a Rating Scheme entry.
_Avoid_: Subject, evaluatee, assignee

**Rater**:
The Personnel Record or leader recorded as responsible for evaluating a Rated Individual.
_Avoid_: Reviewer when referring to evaluation duty

**Organization Data Export**:
An Organization-scoped export of operational data for leader review, backup, or migration support.
_Avoid_: Database dump, separate Feature Lane
