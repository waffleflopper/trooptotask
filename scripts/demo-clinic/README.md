# Army innovation contest clinic demo

This import adds a fictional troop medical clinic to existing Organization **`3d4fe26d-6bf1-4165-af93-2907373bbfd4`**. It adds **50 Personnel Records**, preserving the two existing people, for an expected **52 total**. These are roster records, not login accounts.

It reuses the standard **Leadership, Alpha and Bravo** Groups by name, preserving their IDs, names and current members. The fictional clinic uses Leadership for headquarters, Alpha for patient care and Bravo for clinical support. If a standard Group is missing, the seed creates it; unrelated Groups remain untouched.

| Area       | Demo contents                                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| Roster     | 10 Leadership, 20 Alpha, 20 Bravo; realistic fictional names, Army ranks, MOSs and Duty Roles                          |
| Evals      | 12 OER/NCOER packets with rating chains; current, due in 30/60 days, overdue and 2 completed                           |
| Training   | 10 requirements; current, approaching expiration, expired and missing records; MOS-specific and optional examples      |
| Onboarding | One 8-step arrival template; 6 Soldiers in progress and 2 completed packets; paperwork, checkboxes and linked training |
| ICTLs      | 10 clearly fictional tasks with MOS-specific coverage, missing tasks and current/expiring/expired validations          |
| Calendar   | 14 availability entries; weekday huddle leads and weekly group training across the surrounding four weeks              |
| Follow-up  | 6 fictional leader notes and 6 arrival-progress follow-ups                                                             |

All dates are relative to `CURRENT_DATE` when the seed runs. Fake ICTL codes and training descriptions explicitly identify demo content; these are not official Army requirements or clinical instructions. No personal contact details, patient records, files, credentials, invitations or memberships are imported.

## Owner-run live import

**Owner-reported live import completed on 2026-09-22:** Robert ran this seed for Innovation 2026 and reported 52 total Personnel, 50 demo Personnel, 3 Groups, and successful `verify.sql` results. The agent did not access the live database. Do not repeat the completed import; the sequence below documents the procedure. Local verification and limitations are recorded in [EVIDENCE](https://github.com/waffleflopper/trooptotask/blob/dbd501301df350ef4e6cebb6bc1238283b24d9c9/docs/stabilization/EVIDENCE.md#clinic-demo-seed-and-temporary-duty-roster-navigation-removal).

1. In the intended Supabase project's SQL editor, run [preflight.sql](preflight.sql). Confirm the Organization name/ID, the existing two people, the standard Groups, nine active rank codes, and zero existing demo Personnel.
2. Run the **entire** [seed.sql](seed.sql) as one batch. It contains its own transaction. Successful output reports 50 demo Personnel, the total roster count and total Group count. With the reported starting data, expect 52 people and 3 Groups.
3. Run [verify.sql](verify.sql) immediately after import. It is read-only and checks linked feature data, readiness examples and Organization consistency. It expects the unchanged initial demo and dates near import time; later evaluator edits may intentionally invalidate those initial assertions.
4. Sign in through the ordinary app and select the demo Organization. Check Calendar, Personnel, Training, Evals, Onboarding and Critical Tasks. Use the normal Organization invitation workflow to give the evaluator access if needed.

The seed only inserts new demo data. It does not rename the Organization, move existing people, update existing configuration, alter permissions, disable triggers or change the schema. General Demo training/ICTL requirements also apply to the two existing people, so their readiness screens will show missing Demo records unless they already have applicable completions. The seed deliberately leaves those people untouched.

The script refuses a missing Organization, missing active rank catalog entries, ambiguous standard Group names, or a repeated/conflicting demo import. A database error rolls back the entire batch. A second successful import is intentionally prohibited rather than duplicating people or overwriting evaluator edits. Do not use the old whole-environment `supabase/seed.sql` for this import.

## Local proof

The candidate was run against a newly allocated disposable Supabase project, never the existing development stacks. The local fixture replicated the supplied live shape: two pre-existing people in Alpha/Bravo and the three standard Groups, plus a separate Organization and scoped users for isolation checks. The verification compared every pre-existing row across 66 tables before/after import and tested a repeated import and missing target for unchanged state.

The executable import and read-only acceptance checks are the same files linked above. Raw local setup, fixture, SQL/HTTP checks and command receipts are in `/tmp/t3-clinic-demo-0921` on the development machine; final results and unavailable browser evidence are recorded in EVIDENCE. No remote database was inspected or modified.

The original demo UI change hid Duty Rosters from primary navigation and the Calendar Planning menu and announced a temporary outage in What's New. At that time, direct URLs and stored records remained. Stabilization phase 05 D01 removed the Duty Roster routes, generation, history and feature exports; those direct URLs are retired. Phase 06's merged local schema cutover retires duty-only tables while preserving persisted Calendar assignments and their types. This demo import performs no schema cleanup. The hosted schema and data remain unverified in the [Phase 06 release handoff](../../docs/stabilization/RELEASE.md#phase-06-activation-and-release-boundary).
