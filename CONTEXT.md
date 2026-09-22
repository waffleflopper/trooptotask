# TroopToTask V1

Shared domain language for TroopToTask's military unit management workflows. Use the [domain reading map](docs/agents/domain.md) for behavior contracts, architecture decisions, and stabilization status.

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
A request for reviewed entry into TroopToTask; approval authorizes account setup, not Organization membership. Public requests receive platform review; an Organization Invitation for a new account supplies organization-authorized approval through the invitation bridge.
_Avoid_: Organization Invitation, registration invite

**Account Setup Link**:
A time-limited link issued for an approved Access Request so the recipient can activate a User Account and choose a password. Completing setup does not accept an Organization Invitation or create Organization Membership.
_Avoid_: Temporary password, magic login, organization invite

**Organization Invitation**:
An invitation to join a specific Organization with defined member access, separate from approval to enter the platform and the Account Setup Link. Membership begins through invitation acceptance; resending the invitation does not issue a new setup credential.
_Avoid_: Access Request, Account Setup Link

**Platform Administration**:
Administration of TroopToTask-wide concerns such as accounts, Organizations, reviewed access, announcements, audit visibility, and suspension. Its authority is separate from Organization membership roles.
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
_Avoid_: Calendar color

**Assignment Type**:
An Organization-defined kind of Calendar assignment, used to identify a Daily Assignment Slot.
_Avoid_: Duty Role, Duty Roster Template

**Daily Assignment Slot**:
One Calendar assignment position identified by date and Assignment Type within an Organization. Repeating that pair does not create a second slot.
_Avoid_: Duplicate assignment row, Duty Roster Run

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
The proportion of applicable requirements counted as ready: Training counts `current`; Critical Tasks counts `current` and `expiring-soon`. Optional Training Types are excluded from readiness even when selected for report detail.
_Avoid_: Currency Status

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
