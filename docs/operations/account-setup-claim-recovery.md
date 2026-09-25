# Account Setup held-claim recovery

An Account Setup Link that has been claimed holds password setup for its normalized email until the attempt completes or is explicitly released. A newer link can be delivered while a claim is held, but it cannot change that account's password. The Platform Access Requests screen shows the held setup link and Access Request IDs. Organization members see support guidance without the platform IDs.

## Decide whether release is safe

1. Open a case with an ID such as `INC-12345`. Authenticate the actual staff operator through the approved operations channel and verify that they are an active `support` or `super_admin` platform admin. The database function checks that the supplied user ID is active; it cannot prove the service-role caller supplied the identity of the human at the console. Keep the operator authentication record in the case.
2. Match the held setup link ID, its Access Request ID and normalized email in the Platform screen and read-only records. Inspect the setup claim/failure audit events. Do not copy a setup URL, raw token, password, service key or provider credential into the case or audit reference.
3. Establish that the **previous Supabase Auth create/update operation is terminal or quiescent** using the request trace and provider response/log or an equivalent provider-side confirmation. An ended app request, client timeout, expired link, elapsed time, or a newly sent link does not establish this. If the provider operation may still finish, leave the claim held and escalate; a later password write could otherwise overtake recovery.
4. Reconcile the Auth account and Access Request state. If the password write succeeded but profile/request/link tracking failed, decide whether the account needs an authorized data repair or ordinary sign-in/password recovery. A source Access Request whose `setup_completed_at` is already set cannot use another setup link, even after the held link is released. Release may still clear the email gate for a different incomplete request; it does not complete or repair the source request.

## Record the release

Only after step 3 is supported by the case evidence, use the approved server-side service-role operations channel to invoke `public.release_account_setup_claim_for_staff(setup_link_id, access_request_id, operator_user_id, release_reason, evidence_reference)`. Supply the verified operator's user ID, `provider-terminal` or `provider-quiescent`, and the case ID only. Do not expose this operation or the service key in a browser or public endpoint. The procedure locks the email claim, checks the active staff role and held link, writes `failure_reason = 'operator-released'`, and writes `account_setup.claim_released_by_staff` in the same transaction. It rejects repeated release and unclaimed or used links. The attestation records the decision; the database cannot inspect an in-flight provider call.

Read back the link's `failed_at`/`failure_reason` and the audit event by the same IDs. If either is absent, treat the release as unsuccessful and leave the case open; do not clear the claim with direct table updates. Check all other unresolved same-email claims before telling the person a fresh link can be used. If the source request is complete, give the person the appropriate sign-in or password-recovery path rather than another setup link. Preserve the case reference and provider-operation evidence for later review.

Live use requires the normal operational authority and change controls before any database or provider action.
