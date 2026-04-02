# Local Auth Testing

Use local Supabase plus Mailpit to test invite acceptance and password recovery without touching production auth limits or real email delivery.

## One-time local setup

1. Start Supabase:

   ```bash
   supabase start
   ```

2. Confirm local service URLs and keys:

   ```bash
   supabase status -o env
   ```

3. Make sure `.env.local` points at local Supabase:

   ```bash
   PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
   PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   ```

4. Start the app:

   ```bash
   npm run dev
   ```

## Local email inbox

- Supabase local auth emails are captured by Mailpit at [http://127.0.0.1:54324](http://127.0.0.1:54324).
- Invite and recovery links should now redirect back to `localhost:5173` or `127.0.0.1:5173` instead of the old `127.0.0.1:3000` fallback.
- The Playwright auth suites use their own isolated app server on `127.0.0.1:4173` so they do not inherit whatever state or rate-limiting conditions your normal dev server might already have.
- If you change `supabase/config.toml`, restart Supabase so GoTrue reloads the auth config.

## Run the full auth smoke test

This project now includes a Playwright spec that:

- creates an invited user via the local admin API
- reads the invite email from Mailpit
- completes the `/auth/accept-invite` password flow
- requests a password reset
- reads the recovery email from Mailpit
- completes the `/auth/reset-password` flow
- verifies the user can sign in with the new password

Run the base auth email flow with:

```bash
npm run test:e2e:auth
```

Run the access-request approval and resend flow with:

```bash
npm run test:e2e:access-requests
```

These two focused suites are more reliable than a single giant auth run because local Supabase auth can get temperamental when many invite and recovery emails are created back to back in one process.

## What this does and does not validate

- This validates your app logic, redirect handling, password policy, and Supabase local email links end to end.
- This does not validate real-world deliverability to `@army.mil` or `@health.mil`.
- Hosted Supabase's built-in email sender is still limited to 2 emails per hour project-wide. Local Mailpit avoids that limitation for development, but production will still need a delivery strategy that those domains actually accept.
