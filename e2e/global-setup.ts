import { adminClient } from './fixtures/supabase';
import {
	TEST_ORG,
	TEST_GROUP,
	TEST_USERS,
	TEST_PERSONNEL,
	TEST_STATUS_TYPES,
	TEST_TRAINING_TYPES
} from './fixtures/test-data';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import fs from 'fs';

async function globalSetup() {
	// env vars loaded by supabase.ts via dotenv/config

	// 0. Clean up any leftover data from a previous failed run
	// Delete in FK-safe order (same as teardown)
	const orgId = TEST_ORG.id;
	await adminClient.from('counseling_records').delete().eq('organization_id', orgId);
	await adminClient.from('availability_entries').delete().eq('organization_id', orgId);
	await adminClient.from('personnel_trainings').delete().eq('organization_id', orgId);
	await adminClient.from('deletion_requests').delete().eq('organization_id', orgId);
	await adminClient.from('personnel').delete().eq('organization_id', orgId);
	await adminClient.from('status_types').delete().eq('organization_id', orgId);
	await adminClient.from('training_types').delete().eq('organization_id', orgId);
	await adminClient.from('counseling_types').delete().eq('organization_id', orgId);
	await adminClient.from('organization_memberships').delete().eq('organization_id', orgId);
	await adminClient.from('groups').delete().eq('organization_id', orgId);
	await adminClient.from('audit_logs').delete().eq('organization_id', orgId);
	await adminClient.from('notifications').delete().eq('organization_id', orgId);
	await adminClient.from('organizations').delete().eq('id', orgId);

	// 1. Clean up leftover test auth users via psql, then create fresh ones
	// The admin API's listUsers can be unreliable on local Supabase, so we
	// delete directly from auth.users using psql to ensure a clean slate.
	const testEmails = Object.values(TEST_USERS)
		.map((u) => `'${u.email}'`)
		.join(',');
	try {
		execSync(
			`psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "DELETE FROM auth.users WHERE email IN (${testEmails})"`,
			{ stdio: 'pipe' }
		);
	} catch {
		// psql cleanup is best-effort for local dev; ignore failures
	}

	const userIds: Record<string, string> = {};

	for (const [role, userData] of Object.entries(TEST_USERS)) {
		const { data, error } = await adminClient.auth.admin.createUser({
			email: userData.email,
			password: userData.password,
			email_confirm: true
		});

		if (error) throw new Error(`Failed to create ${role} user: ${error.message}`);
		userIds[role] = data.user.id;
	}

	// 2. Create test organization
	const { error: orgError } = await adminClient.from('organizations').insert({
		id: TEST_ORG.id,
		name: TEST_ORG.name,
		created_by: userIds.owner
	});
	if (orgError) throw new Error(`Failed to create org: ${orgError.message}`);

	// 3. Create test group
	const { error: groupError } = await adminClient.from('groups').insert({
		id: TEST_GROUP.id,
		name: TEST_GROUP.name,
		organization_id: TEST_ORG.id,
		sort_order: TEST_GROUP.sort_order
	});
	if (groupError) throw new Error(`Failed to create group: ${groupError.message}`);

	// 4. Create org memberships
	for (const [role, userData] of Object.entries(TEST_USERS)) {
		const memberData: Record<string, unknown> = {
			organization_id: TEST_ORG.id,
			user_id: userIds[role],
			role: userData.role
		};

		// Scope the member user to the test group
		if (role === 'member') {
			memberData.scoped_group_id = TEST_GROUP.id;
			// Give member basic view permissions
			memberData.can_view_calendar = true;
			memberData.can_view_personnel = true;
			memberData.can_view_training = true;
			memberData.can_edit_calendar = false;
			memberData.can_edit_personnel = false;
			memberData.can_edit_training = false;
			memberData.can_manage_members = false;
		}

		const { error } = await adminClient.from('organization_memberships').insert(memberData);
		if (error) throw new Error(`Failed to create ${role} membership: ${error.message}`);
	}

	// 5. Create status types
	for (const st of TEST_STATUS_TYPES) {
		const { error } = await adminClient.from('status_types').insert({
			...st,
			organization_id: TEST_ORG.id
		});
		if (error) throw new Error(`Failed to create status type: ${error.message}`);
	}

	// 6. Create training types
	for (const tt of TEST_TRAINING_TYPES) {
		const { error } = await adminClient.from('training_types').insert({
			...tt,
			organization_id: TEST_ORG.id
		});
		if (error) throw new Error(`Failed to create training type: ${error.message}`);
	}

	// 7. Create seed personnel
	for (const p of TEST_PERSONNEL) {
		const { error } = await adminClient.from('personnel').insert({
			...p,
			organization_id: TEST_ORG.id,
			group_id: TEST_GROUP.id
		});
		if (error) throw new Error(`Failed to create personnel: ${error.message}`);
	}

	// 8. Create authenticated storageState files for each role
	// Sign in programmatically via Supabase client to avoid GoTrue rate limits,
	// then write Playwright-compatible storageState JSON with the auth cookies.
	const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
	const anonKey = process.env.PUBLIC_SUPABASE_ANON_KEY || '';

	// Ensure auth directory exists
	fs.mkdirSync('e2e/.auth', { recursive: true });

	for (const [role, userData] of Object.entries(TEST_USERS)) {
		const client = createClient(supabaseUrl, anonKey, {
			auth: { autoRefreshToken: false, persistSession: false }
		});

		const { data, error: signInError } = await client.auth.signInWithPassword({
			email: userData.email,
			password: userData.password
		});

		if (signInError || !data.session) {
			throw new Error(`Failed to sign in ${role}: ${signInError?.message || 'no session'}`);
		}

		// Build the cookie value that @supabase/ssr expects
		// Cookie name: sb-{ref}-auth-token where ref is extracted from URL hostname
		const url = new URL(supabaseUrl);
		const ref = url.hostname.split('.')[0]; // '127' for local, project ref for hosted
		const cookieName = `sb-${ref}-auth-token`;

		// The session is stored as base64url-encoded JSON, potentially chunked
		const sessionStr = JSON.stringify({
			access_token: data.session.access_token,
			refresh_token: data.session.refresh_token,
			expires_at: data.session.expires_at,
			expires_in: data.session.expires_in,
			token_type: data.session.token_type,
			user: data.session.user
		});

		// @supabase/ssr uses chunked cookies with max ~3180 chars per chunk
		const CHUNK_SIZE = 3180;
		const cookies: Array<Record<string, unknown>> = [];

		if (sessionStr.length <= CHUNK_SIZE) {
			cookies.push({
				name: cookieName,
				value: `base64-${Buffer.from(sessionStr).toString('base64url')}`,
				domain: 'localhost',
				path: '/',
				httpOnly: false,
				secure: false,
				sameSite: 'Lax',
				expires: data.session.expires_at || -1
			});
		} else {
			// Chunk the session string
			const encoded = `base64-${Buffer.from(sessionStr).toString('base64url')}`;
			const chunks = Math.ceil(encoded.length / CHUNK_SIZE);
			for (let i = 0; i < chunks; i++) {
				cookies.push({
					name: `${cookieName}.${i}`,
					value: encoded.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
					domain: 'localhost',
					path: '/',
					httpOnly: false,
					secure: false,
					sameSite: 'Lax',
					expires: data.session.expires_at || -1
				});
			}
		}

		// Write Playwright storageState JSON
		const storageState = {
			cookies,
			origins: []
		};

		fs.writeFileSync(`e2e/.auth/${role}.json`, JSON.stringify(storageState, null, 2));
	}

	console.log('E2E global setup complete: users, org, and auth states created.');
}

export default globalSetup;
