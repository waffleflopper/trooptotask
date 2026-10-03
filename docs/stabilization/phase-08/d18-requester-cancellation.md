# D18 — Requester cancellation repair

## Outcome and boundary

This intermediate `Refs #1366` deliverable repairs ordinary requester cancellation through the supported DELETE endpoint, retaining request history and all source effects unchanged. It starts from verified `main` `89c67e58754c7edb58d2d65318a871a85cc78212`, the tree-identical integration of [verification PR #1498](https://github.com/waffleflopper/trooptotask/pull/1498). That PR passed exact-head full CI/build and completed clean CodeRabbit review; the [unchanged baseline](d18-deletion-verification.md) preserves ordinary own cancellation500/pending unchanged versus admin-own200/cancelled.

Cancellation moves into the existing request owner, with a narrow ordinary-client provider and per-request HTTP composition. The central cancellation function and its sole route consumer are removed. The scoped pending lookup and Identity ownership policy stay in place. The additive `cancel_own_deletion_request(organizationId, requestId)` RPC derives the requester from the authenticated identity, changes only pending status to cancelled and returns a boolean acknowledgment. It exposes no arbitrary row patch or caller-supplied attribution. No general requester UPDATE policy or admin-client fallback is added.

This is a separate release outcome because its new caller requires Robert's manual migration before deployment. Settings requester identification and review feedback/lifetime handling have different consumers and remain the next repair; broader approval/denial/list, source retry, bulk aggregation and full workflow cutover remain D18 work. Existing approve/deny can still overwrite a cancellation winner, and counseling Storage remains outside migration012's row/status transaction. This repair protects cancellation's own conditional transition; it does not establish full review serialization.

## Acceptance selection

The authoritative [request/review recipe](../../../.agents/skills/verify-trooptotask/features/deletion-requests.md) distinguishes supported HTTP cancellation from native source/review controls. No native cancellation UI exists. Fresh final proof must establish ordinary own200 and admin-own200, saved cancelled history, exact source/request metadata invariance, replay and approved/denied/cancelled404, ordinary peer/foreign concealment404 and visible reviewer-peer403. Cancellation needs neither source capability nor a surviving target.

SQL contracts must prove fixed authenticated identity, Organization and pending binding, least execution privileges, continued direct UPDATE denial, failure rollback and exact saved fields. Actual bounded lock waits must show one competing cancellation succeeds, a committed terminal review cannot be overwritten by resumed cancellation, and membership loss or account/Organization suspension committed during a wait denies it. Fresh replay and populated upgrade must preserve all existing row identities and values before exercising the new command.

Feature-owned application/provider tests protect requester admission, source/history preservation, public error mapping, explicit retry and success audit only after a strict boolean acknowledgment. The old generic-store cancellation tests are relocated and expanded; a declaration-only route test is replaced with actual admission/validation behavior. Real SQL/ordinary HTTP proof supplies enforcement that those fake providers cannot establish. Current app checks pass five focused suites/53 tests, type checking and governance; they are development feedback, not final acceptance.

## Current validation and release state

Implementation, fresh database proof, final ordinary HTTP/native source persistence, independent complete-diff/expanded-artifact acceptance, proportional CodeRabbit and exact-head full CI remain in progress. No repaired live success or migration acceptance is claimed yet. The migration PR will remain unmerged for Robert's manual database step even when its review and CI are green. No remote database operation is performed, no other issue advances and #1366 remains open.
