import { adminClient } from './fixtures/supabase';
import {
	TEST_ORG,
	TEST_GROUP,
	TEST_USERS,
	TEST_PERSONNEL,
	TEST_STATUS_TYPES,
	TEST_TRAINING_TYPES
} from './fixtures/test-data';
import { chromium } from '@playwright/test';

async function globalSetup() {
	// env vars loaded by supabase.ts via dotenv/config

	// 1. Create test users via Supabase Admin API
	const userIds: Record<string, string> = {};

	for (const [role, userData] of Object.entries(TEST_USERS)) {
		// Delete user if exists from previous failed run
		const { data: existingUsers } = await adminClient.auth.admin.listUsers();
		const existing = existingUsers?.users?.find((u) => u.email === userData.email);
		if (existing) {
			await adminClient.auth.admin.deleteUser(existing.id);
		}

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
	// We log in through the actual login UI to ensure cookies are set correctly
	// by @supabase/ssr (chunked sb-<ref>-auth-token cookies)
	const browser = await chromium.launch();

	for (const [role, userData] of Object.entries(TEST_USERS)) {
		const context = await browser.newContext();
		const page = await context.newPage();

		// Log in through the real login form
		await page.goto('http://localhost:5173/auth/login');
		await page.fill('#email', userData.email);
		await page.fill('#password', userData.password);
		await page.click('.btn-sign-in');

		// Wait for redirect to dashboard (confirms login succeeded + cookies set)
		await page.waitForURL('**/dashboard**', { timeout: 15000 });

		// Save storage state
		await context.storageState({ path: `e2e/.auth/${role}.json` });
		await context.close();
	}

	await browser.close();

	console.log('E2E global setup complete: users, org, and auth states created.');
}

export default globalSetup;
