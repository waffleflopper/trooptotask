# Export Organization data

An Organization owner or admin downloads a complete JSON backup or an Excel workbook for review, with retained source records, readable labels, and an auditable export lifecycle.

## Sub-features

- `export-entry`: Settings exposes JSON and Excel downloads to the current Organization owner/admin.
- `export-artifacts`: both formats retain every manifest section, raw row values, empty sections, readable workbook sheets, and existing filenames.
- `export-sensitive-records`: authorized full exports retain active and archived Personnel artifacts while ordinary display fields keep their blank legacy notes.
- `export-lifecycle`: each admitted request records its requester, Organization, status, timestamps, and actual artifact size; failures remain visible.
- `export-recovery`: a failed request downloads no error body, restores the controls, and permits an explicit retry.
- `export-scope`: member, scoped-feature, and foreign access cannot produce an unauthorized artifact or lifecycle row.
- `export-lifetime`: an intentionally requested A download can finish after switching Organizations while B retains its own controls and feedback.

## How to get to it (user POV)

Open an Organization, choose Settings, then Exports. Select Export JSON or Export Excel under Full organization. Both controls are busy while generation is pending. A successful request downloads the requested file and shows completion feedback.

The Personnel only action is disabled and marked Coming Soon. It is not a retained export workflow. Single-Person and feature report workbooks have separate recipes and formats.

## Driving it with verify:app

Use the [feature index](README.md) and [verification skill](../SKILL.md) for owned launch, doctor, fresh snapshot UIDs, artifact capture, and disposal. Freeze application code, controls, fixtures, and this recipe during a run. Preserve the tested revision/digest, origin, browser version, fixture IDs, each actor's page ID, and expected/observed results.

### Prepare source witnesses

Use `$V fixture` and capture A/B provider rows before any export. Existing actors provide the required authority without a new role family. `orgOwner` and `orgAdmin` govern A. `orgSettingsPeer` owns B, and `orgSettingsSwitch` is admin in both Organizations. Their stored Personnel override is `none`; owner/admin governance still supplies effective feature access, so these actors do not prove an effective denied Personnel lane. `orgMember`, `viewer`, and `scoped` lack Organization governance; `foreign` belongs only to B.

Run compatible temporary seeds once and preserve their returned IDs and literal values. `personnel-artifact-context` supplies active/archived A/B notes, counseling, documents, and follow-ups with real file witnesses. `dashboard` supplies dated Calendar, Training, Critical Tasks, Onboarding, and Rating Scheme facts. `communications` supplies own/peer/foreign inbox rows and announcements, but creates no Feedback rows. Submit a synthetic message through Send feedback as the export actor and preserve `$V communications ROLE` source facts. `audit` supplies stored A/B events. `training-pages` adds 26 Personnel, a UI page cohort that does not cross the export provider's 1,000-row boundary. Provider-sized traversal needs a separate sufficiently large witness. These seeds are privileged setup, not ordinary authorization or native creation proof. Keep the [Personnel](personnel-artifacts.md), [Dashboard](dashboard.md), and [communications](notifications-feedback.md) expectations for source meaning.

The current export rate limit allows ten admitted or denied POST attempts per client IP per hour across Organizations and both formats. Browser-injected failures do not dispatch and consume no server attempt. Plan compatible scenarios within that budget, then clean up and launch another disposable session when more attempts are needed. Preserve each session's separate identities and receipts. A 429 before admission is inconclusive authorization proof; never relabel it as a governance denial or disable the rate limit.

Export section completeness means complete rows visible to that request's authorized reader. Notifications remain self-owned; Feedback and invitation provenance retain their ordinary/platform-admin RLS limits. A privileged Organization-wide readback is not the expected artifact for these sections. Compare the signed-in actor's permitted rows and denied peers separately. The scoped readback covers all 38 source tables, including `dashboard_configs`, `getting_started_progress`, `user_org_preferences`, `user_pinned_groups`, and `access_request_organization_invitation_links`. An empty stored collection establishes absence and inventory presence; positive saved-field behavior still needs a nonempty source witness or independently specified lower-level coverage.

Record `$V rows data_exports orgA` and `orgB`, notifications, and source rows before each request. Include `access_request_organization_invitation_links`, `dashboard_configs`, `getting_started_progress`, `user_org_preferences`, `user_pinned_groups` and `beta_feedback` when comparing full saved fields. The readbacks are privileged synthetic source observations; the downloaded rows must still obey the exporting user's ordinary RLS and the separately admitted Personnel artifact reader. Compare original rows after the run. Export requests legitimately add their own lifecycle, Audit, and administrator notification rows; distinguish these effects from unrelated source mutations.

### Download and inspect both formats

1. Run `$V actor orgOwner settings/exports`. Inspect the loaded Export controls and A header. Arm `$V export arm PAGE` and `$V network arm-observe PAGE export`. Click Export JSON using a fresh snapshot UID. Preserve the request, stable feedback, `$V network state PAGE`, `$V export state PAGE`, and a screenshot. Save the Blob with `$V export save PAGE .verification/evidence/verify-trooptotask/RUN/owner-a.json`. Restore both controls before another request.
2. Parse the saved JSON. Compare `organizationId`, `exportedAt`, `sectionInventory`, `sections`, and the retained top-level section keys. Every manifest section must exist, including empty arrays. Inventory counts must match actual arrays. Compare explicit IDs and stored values against independent fixture/provider observations, including first/last IDs in a paged cohort. Require A-owned exported source rows; B source rows and private labels, paths, and note values must be absent. Faithful A-owned Audit details may retain historical references to B resource UUIDs; compare the containing source row before classifying a UUID occurrence as foreign row admission.
3. Compare sensitive raw fields separately. Active and archived leader notes retain stored contributor IDs and text. Counseling, documents, and follow-ups retain their IDs, parent IDs, archive dates, notes, uploader values, and file paths. Ordinary readable Personnel `leader_notes` remains blank. An Organization owner/admin export covers all Groups independently of ordinary Personnel feature access. Do not reinterpret raw note or file-path loss as masking.
4. Repeat the native action with Export Excel, family `export-excel`, and `owner-a.xlsx`. Use `$V workbook FILE 'Export Inventory'` and inspect the actual downloaded workbook's readable and raw sheets. Compare each inventory count and every selected raw field with that request's preceding provider facts and controlled effects. Unchanged source fields also match JSON; lifecycle, Audit, notification rows, and metadata can change between requests. Readable sheets resolve Person, Group, status, assignment, Training, and task labels while preserving their retained columns. Personnel Documents exposes the stored filename's last path component; its raw sheet retains the full path. Readable Personnel legacy notes remain blank, while the separate Leader Notes sheet preserves authorized notes. Nested raw values serialize as JSON cell text. Empty sheets remain present. Record real worksheet names, including safe truncation and collision suffixes.
5. For each artifact, read lifecycle rows after completion and again after a visible reload. Require a new row with the exact Organization/requester, completed status, non-null completion time, and byte size equal to the saved artifact. Completion writes are currently best-effort; a download alone proves no lifecycle update. Preserve missing or inconsistent rows as failures. Capture the corresponding export Audit event and real administrator notification separately.
6. Repeat positive native downloads as `orgAdmin`. Use `orgSettingsPeer` for a B artifact and require B-only source rows. Use `orgSettingsSwitch` to establish that admin governance can export A with a stored Personnel override of `none`. Record the effective role access accurately. Compare retained raw sections rather than relying on arrival at Settings.

### Failure and explicit recovery

As an authorized actor, arm capture and `$V network arm-fail PAGE export` or `export-excel`. Submit natively. Require visible failure, no captured download, idle controls, and no new lifecycle row because this synthetic browser response blocks dispatch. Restore the hook, retry explicitly, and inspect the resulting artifact and new completed row. This proves client recovery, not a server/provider outage.

For an admitted server export that fails while reading a source, use `$V server-source arm availability_entries fail-hard`. It returns a controlled synthetic 500 before dispatching one allowlisted A provider GET in the owned app process. Submit natively, capture actual HTTP/error feedback, and compare the new failed lifecycle row, no artifact, and unchanged source facts. Restore the source control before explicit retry. The successful retry needs its own artifact and completed row. Inspect the control receipt; an unmatched hook or SDK retry that recovers earns no failed-export credit. This control covers one source-read rejection, not lifecycle writes, notifications, all providers, or production outages.

Lifecycle insert/update rejection, notification delivery failure, and concurrency have separate service/SQL obligations. Keep unrun cases explicit. There is no export cancellation action; the Organization-switch scenario below verifies intentional download completion with isolated feedback. Best-effort completion updates retain their current contract until an approved repair changes it.

### Denied Organization and sensitive access

Run `$V actor orgMember settings/exports`, then repeat with `viewer` and `scoped`. Capture the actual Settings denial. From each signed-in owned page, run `$V export request PAGE orgA json` and `excel`. Preserve the exact status/body and unchanged A/B lifecycle/source rows. The shared policy may append `policy.denied` Audit warnings; require no export-success event or administrator notification and preserve original Audit rows. Feature configure or scoped Personnel access does not grant Organization governance.

As `foreign`, attempt A's export endpoints and preserve denial with no new A lifecycle row or returned artifact. As `orgOwner`, attempt B's endpoints for the corresponding negative tenant control. The B owner's positive B download distinguishes a forbidden target from a broken endpoint. These direct authenticated requests are HTTP proof, separate from native download actions. Existing `canManageMembers` mock-context tests establish no real delegated member authority; current roles, permission evaluation, and lifecycle RLS own admission.

### Organization switching and delayed responses

Use `$V actor orgSettingsSwitch settings/exports`. Arm capture and `$V network arm-hold PAGE export`, click Export JSON, and preserve the held real-response receipt plus A's completed lifecycle row. While delivery is held, use the visible Organization menu to select B. Capture B's route/header and idle controls with no A success/error feedback. Release A, preserve `$V export state PAGE`, and save the actual Blob with `$V export save PAGE .verification/evidence/verify-trooptotask/RUN/delayed-a.json`. Require A's filename, `organizationId`, and source rows in the parsed file while B stays idle without A feedback. Restore the A hooks, arm fresh capture, then submit B Excel normally and compare its separate B artifact/lifecycle. Restore hooks before navigating again.

Use a held failing provider response or focused deferred component checks for late errors and late body completion. A full document reload destroys browser hooks and establishes no delayed-response isolation. Same-canonical-Organization URL changes preserve the pending export; an A→B→A return must not let the disposed first A request clear the new A request's busy state. Preserve what was actually driven separately from component coverage.

## Gotchas

- Use `$V seed roster-pages` for 1,001 saved A roster rows when roster persistence or its backup reader changes. Preserve the exact preceding `$V rows sign_in_rosters orgA` readback and compare every seeded ID and raw field in JSON and the `Raw - Sign-in Rosters` worksheet, including unknown nested marker fields, null dates and timestamp precision. Check the B roster remains absent. Clean only the recorded cohort with `clean-seeds`; this synthetic setup is separate from native creation and export admission.

- JSON and Excel are POST downloads. Native Blob capture proves what the member downloaded; an authenticated fetch returning 200 alone does not.
- The current artifact captures the export row while it is processing. After download, provider history can show that same row completed. Do not require the immutable artifact to predict a later lifecycle update or its own later Audit event.
- Inventory, source rows, readable projections, and lifecycle effects are distinct observations. An empty or successful workbook cannot prove complete source retrieval.
- Full Organization backup formats and narrower report workbooks have different contracts. Preserve raw sensitive rules and legacy blank fields without expanding the Coming Soon action.
- Keep meaningful execution/lifecycle/manifest/workbook, Personnel export, JSON/Excel route, and export-workspace checks. `data_export_lifecycle_rls.sql` and sensitive Personnel SQL establish database admission separately under the [isolated database contract](../../../../docs/architecture/DEFINITION_OF_DONE.md#isolated-database-checks).
- Restore every armed network/export/source control, remove only recorded helper seeds, compare original source/file sentinels, run final doctor, and dispose this worker. Lifecycle/Audit/notification rows created by real exports remain in the disposable project until owned disposal. Package observations under the [durable artifact contract](../../../../docs/architecture/DEFINITION_OF_DONE.md#packaging-durable-artifacts).
