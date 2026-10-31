# Invalid, stale and conflicting input

A malformed, missing, foreign or conflicting write gets a controlled 4xx with a readable message and changes nothing. A
form that receives one keeps its draft open and shows that message; a server or transport failure keeps the form's
existing generic text. Provider, constraint and foreign-Organization details never reach the response.

## Sub-features

- `ids`: schema-validated non-UUID body IDs answer `400 Invalid ID`; Calendar status/assignment type and Training
  type/view DELETE handlers answer `400 Invalid resource ID`. A non-UUID Personnel path id answers `404`. A well-formed
  id that is missing or belongs to another Organization answers `404` with the resource's own message, except for the
  retryable catalog deletes below.
- `dates`: a date-only field accepts only a real `YYYY-MM-DD` day. `not-a-date`, `2026-02-30` and `2026-13-01` answer
  `400 Use a valid date (YYYY-MM-DD)`; a range whose end precedes its start answers `400`.
- `types`: a field of the wrong JSON type, a missing required field, malformed JSON, a `null` body, or JSON sent to a
  file upload answers `400`. `mos: null` stays a `400`; Personnel MOS is a string or omitted.
- `conflicts`: a duplicate Training type or Onboarding template name, or a Group name duplicated under the same
  parent, answers `409` with a message naming the conflict. Different parents can have Groups with the same name.
- `deletes`: deleting a missing Calendar status or assignment type still answers `200`, so a retried delete recovers,
  but records no audit event and sends no administrator notification.
- `imports`: a malformed Critical Tasks completion import record, or a Training import status other than `completed` or
  `exempt`, answers `400` and saves nothing. An impossible date such as `2026-02-30` is flagged during review in the
  Availability, Training, Critical Tasks and Personnel imports and is not sent.
- `forms`: these forms show the server's 4xx message and keep the draft: Training type and view; Calendar status type
  and closure; Personnel roster edit and the detail page's Data sheet; the follow-up, leader-note, document and
  counseling add forms; follow-up updates; Group rename; Rating Scheme edit; Onboarding start and packet actions; the
  Availability edit; and the Critical Tasks defaults. A server or transport failure keeps each form's own text.

## How to get to it (user POV)

The forms are the normal editors in Training → Manage Types and the Manage views sheet, Calendar → Settings, Personnel, Evals and
Onboarding. The other cases have no visible entry point. Drive them as authenticated endpoint probes.

## Driving it with verify:app

Preconditions: `doctor` passes and `$V fixture` supplies the IDs below. Sign in each actor with `$V actor`:
`calendarConfigure calendar/settings` for catalogs, `calendarOperate calendar` for assignments and availability,
`manager personnel` for Personnel and Groups, `trainingConfigure training` for Training, `orgOwner home` for Onboarding,
Rating Scheme and Critical Tasks. `MISSING` is `00000000-0000-4000-8000-000000000001`.

1. **Endpoint matrix.** Send each request from the actor's signed-in page with the `evaluate_script` probe in the
   [Calendar catalogs recipe](calendar-catalogs.md#driving-it-with-verifyapp), sending the body verbatim (malformed JSON
   included). Save status and body for every row, then read back that no row named by the request's marker exists and
   that edited targets are unchanged.

   | Actor             | Request                                                                                                                                                        | Expected                                                                                                                                                    |
   | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | calendarConfigure | `PUT api/status-types` `{id:MISSING,name:M}`, then `statusForeign`, then `'not-a-uuid'`                                                                        | `404`, `404`, `400 Invalid ID`                                                                                                                              |
   | calendarConfigure | `PUT api/assignment-types` `{id:MISSING,name:M}`, then `typeForeign`                                                                                           | `404`, `404`                                                                                                                                                |
   | calendarConfigure | `PUT api/special-days` `{id:MISSING,name:M}`                                                                                                                   | `404`                                                                                                                                                       |
   | calendarConfigure | `POST api/special-days` `{action:'addClosureDays',name:M,dates:[D]}` with D `not-a-date`, then `2026-02-30`, then body `null`                                  | `400` ×3                                                                                                                                                    |
   | calendarConfigure | `DELETE api/status-types` `{id:MISSING}`                                                                                                                       | `200`; no new `status_type.deleted` audit row or notification                                                                                               |
   | calendarOperate   | `POST api/daily-assignments/batch` with one valid record and one `not-a-date`, then `2026-02-31`                                                               | `400` ×2; zero rows on the valid record's date                                                                                                              |
   | calendarOperate   | `POST api/daily-assignments` date `22/09/2026`; batch with `assignmentTypeId:'nope'`                                                                           | `400` ×2                                                                                                                                                    |
   | calendarOperate   | `POST api/availability` dates `2026-13-01`; then start `2026-09-25`, end `2026-09-20`                                                                          | `400` ×2; no row with either note                                                                                                                           |
   | manager           | `POST api/personnel` with `rank:5`; `mos:null`; no `lastName`; `ets:'soon'`; `ets:'2027-02-30'`; `groupId:'alpha'`                                             | `400` each; no Person with the marker last name                                                                                                             |
   | manager           | `PUT api/personnel` with `id:MISSING`; `id:'abc'`; `clinicRole:42` on `personA`; `personForeign`; `deros:'2027-13-01'`                                         | `404`, `400`, `400`, `404`, `400`; `personA` unchanged                                                                                                      |
   | manager           | `GET api/personnel/abc/leader-notes`; `POST api/personnel/<personA>/leader-notes` body `{bad`                                                                  | `404`, `400`                                                                                                                                                |
   | manager           | `POST api/groups` `{name:'Alpha'}`                                                                                                                             | `409`                                                                                                                                                       |
   | trainingConfigure | `PUT api/training-types` `{id:MISSING}`, then `trainingForeignType`; `POST` name `Verification Required Training`                                              | `404`, `404`, `409`                                                                                                                                         |
   | trainingConfigure | `PUT api/training-views` `{id:MISSING}`; `POST` with `columnIds:['abc']`                                                                                       | `404`, `400`                                                                                                                                                |
   | trainingConfigure | `POST api/personnel-trainings` `{}`; then `completionDate:'2026-02-30'`                                                                                        | `400` ×2                                                                                                                                                    |
   | orgOwner          | `POST api/onboarding-templates` with the fixture template's name; `POST api/onboarding` `personnelId:'abc'`                                                    | `409`, `400`                                                                                                                                                |
   | orgOwner          | `PUT api/rating-scheme` `{id:'abc'}`; `PUT api/ict-tasks` `{id:MISSING,title:M}`                                                                               | `400`, `404`                                                                                                                                                |
   | orgOwner          | `GET api/sign-in-rosters?limit=abc`; `GET api/calendar-reports/status-days?startDate=2026-02-30&endDate=2026-03-02`                                            | the default page of rosters, matching `total`; `400`                                                                                                        |
   | orgOwner          | `POST api/personnel-ict-completions/batch` with `{records:[null]}`; a record with `personnelId:'abc'`; a known Person and task with `completedAt:'2026-02-30'` | `400` ×3 (`Invalid input: expected object, received null`, `Invalid ID`, `Use a valid date (YYYY-MM-DD)`); the Organization's completion rows are unchanged |
   | orgOwner          | `POST api/personnel-trainings/batch` for `personB` on `trainingOptional` with `status:'not-completed'`, then with no status                                    | `400 Status must be completed or exempt` ×2; the Organization's Training rows are unchanged                                                                 |

2. **Form messages.** As `trainingConfigure`, open Manage Types → `New type`. Paste a 105-character name through `fill`, then `Create type`: `Name` shows
   `Keep the name to 100 characters.`, the sheet stays open and no row is created. Enter `Verification Required
Training`: the sheet stays open with `A Training type with that name already exists.` and no second row. As `calendarConfigure`, choose `Edit` from
   `More actions for Verification Leave`, enter a 101-character name in the inline composer and choose `Save changes`.
   The composer stays open with the draft, the error toast reads `Name must be 100 characters or fewer` and the row is
   unchanged. As `manager`, rename a Group to `Bravo` from Manage Groups: the message names the duplicate and both
   sibling Groups keep their names. Capture `$V feedback` and `network arm-observe` state for each save.
3. **Stale records.** In each case, open the form first, change the record from a second signed-in session, then save.
   Each save keeps its draft and shows the server's reason:
   - **Personnel detail Data sheet.** Use a temporary Person deleted elsewhere (archive, then
     `api/personnel/permanent`). Save changes returns `404` and shows `Personnel record not found` in the form alert.
   - **Rating Scheme edit.** Delete the entry from the owner's session. A non-owner delete may need approval. Save
     returns `404` and shows `Rating Scheme entry not found`.
   - **Onboarding start.** Start the same member from another session. Submit returns `409` and shows
     `Soldier already has an active onboarding`.

## Gotchas

- An actor without the lane gets its usual `403`/`404` before validation for most routes; use the actor named in the
  table so the probe reaches the input check.
- `rows` reads are privileged readback. They establish no effect, not authorization.
- Catalog deletes of a missing id are deliberately `200` so a retried delete recovers.
- Lower-level route and operation tests cover each owner's schema; this matrix is the live sample, not every field.
