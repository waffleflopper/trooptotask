# Account Setup held-claim recovery

A claimed Account Setup Link holds password setup for its normalized email until the attempt completes or is reconciled. A newly delivered link cannot change the password while the claim is held. The Platform Access Requests screen shows the held setup link and Access Request IDs.

A person with a valid link for an approved Access Request can choose **Check setup status** on the setup page. That reconciles a witnessed attempt without staff. Staff handle the rest: claims created before the attempt-witness migration, conflicting or unavailable records, and any state the page sends to support.

One case is not a held claim. If Auth rejects creation because the user exists but the email identity index has no matching row, reconciliation fences the attempt and fails its link. Staff must repair the Auth and identity records through an authorized data repair. `release_account_setup_claim_for_staff` rejects that link, and another fresh link will not fix it.

## Decide whether release is safe

1. Open a case with an ID such as `INC-12345`. Authenticate the platform operator through the approved operations channel and confirm their User Account has a row in `platform_operators` and their admin session has completed MFA at `aal2`. The database checks the supplied user ID but cannot prove who is at the console, so keep the authentication record in the case.
2. Match the held setup link ID, its Access Request ID and the normalized email in the Platform screen and read-only records. Inspect the setup claim and failure audit events. Never copy a setup URL, token, password, service key or provider credential into the case.
3. Establish that the previous Supabase Auth create or update is terminal or quiescent, using the request trace and a provider response, log or equivalent confirmation. An ended app request, a client timeout, an expired link, elapsed time or a newly sent link does not establish this. If the provider operation may still finish, leave the claim held and escalate.
4. Reconcile the Auth account and Access Request. If the password write succeeded but tracking failed, decide between an authorized data repair and ordinary sign-in or password recovery. A request with `setup_completed_at` set cannot use another setup link, even after release.

## Record the release

Only after step 3 is supported by case evidence, call `public.release_account_setup_claim_for_staff(setup_link_id, access_request_id, operator_user_id, release_reason, evidence_reference)` through the server-side service-role operations channel. Pass the verified operator's user ID, `provider-terminal` or `provider-quiescent`, and the case ID. Never expose this call or the service key in a browser or public endpoint.

Read back the link's `failed_at` and `failure_reason` and the `account_setup.claim_released_by_staff` audit event. If either is missing, the release failed. Leave the case open and never clear the claim with direct table updates. Check for other unresolved claims on the same email before telling the person a fresh link will work. If the source request is complete, send them to sign-in or password recovery instead.
