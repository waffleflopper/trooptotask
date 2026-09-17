import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { appHost } from '../fixtures/app';
import { adminClient } from '../fixtures/supabase';
import { TEST_ORG, TEST_USERS } from '../fixtures/test-data';

const INVITEE_PASSWORD = 'DashboardInvite123!';

async function createAuthenticatedContext(
	browser: import('@playwright/test').Browser,
	email: string,
	password: string
): Promise<import('@playwright/test').BrowserContext> {
	const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || 'http://127.0.0.1:56321';
	const anonKey = process.env.PUBLIC_SUPABASE_ANON_KEY || '';
	const client = createClient(supabaseUrl, anonKey, {
		auth: { persistSession: false, autoRefreshToken: false }
	});

	const { data, error } = await client.auth.signInWithPassword({ email, password });
	expect(error).toBeNull();
	expect(data.session).not.toBeNull();

	const url = new URL(supabaseUrl);
	const ref = url.hostname.split('.')[0];
	const cookieName = `sb-${ref}-auth-token`;
	const sessionStr = JSON.stringify({
		access_token: data.session!.access_token,
		refresh_token: data.session!.refresh_token,
		expires_at: data.session!.expires_at,
		expires_in: data.session!.expires_in,
		token_type: data.session!.token_type,
		user: data.session!.user
	});

	return browser.newContext({
		storageState: {
			cookies: [
				{
					name: cookieName,
					value: `base64-${Buffer.from(sessionStr).toString('base64url')}`,
					domain: appHost,
					path: '/',
					httpOnly: false,
					secure: false,
					sameSite: 'Lax',
					expires: data.session!.expires_at || -1
				}
			],
			origins: []
		}
	});
}

async function findOwnerUserId(): Promise<string> {
	const users = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
	const owner = users.data.users.find((user) => user.email === TEST_USERS.owner.email);
	expect(owner).toBeTruthy();
	return owner!.id;
}

async function createInvitee(email: string): Promise<string> {
	const { data, error } = await adminClient.auth.admin.createUser({
		email,
		password: INVITEE_PASSWORD,
		email_confirm: true
	});
	expect(error).toBeNull();
	return data.user.id;
}

async function createDashboardInvitation(email: string, invitedBy: string): Promise<string> {
	const { data, error } = await adminClient
		.from('organization_invitations')
		.insert({
			organization_id: TEST_ORG.id,
			email,
			invited_by: invitedBy,
			role: 'member',
			status: 'pending',
			expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
			member_preset: 'viewer',
			capability_overrides: {},
			access_scope_kind: 'organization',
			access_scope_group_ids: []
		})
		.select('id')
		.single();
	expect(error).toBeNull();
	return data.id as string;
}

async function invitationStatus(invitationId: string): Promise<string | null> {
	const { data, error } = await adminClient
		.from('organization_invitations')
		.select('status')
		.eq('id', invitationId)
		.single();
	expect(error).toBeNull();
	return data.status as string;
}

async function membershipRole(userId: string): Promise<string | null> {
	const { data, error } = await adminClient
		.from('organization_memberships')
		.select('role')
		.eq('organization_id', TEST_ORG.id)
		.eq('user_id', userId)
		.maybeSingle();
	expect(error).toBeNull();
	return (data?.role as string | undefined) ?? null;
}

async function invitationIdsForEmails(emails: string[]): Promise<string[]> {
	const { data, error } = await adminClient
		.from('organization_invitations')
		.select('id')
		.eq('organization_id', TEST_ORG.id)
		.in('email', emails);
	expect(error).toBeNull();
	return data.map((invitation) => invitation.id as string);
}

async function cleanupInvitees(input: { emails: string[]; userIds: string[]; invitationIds: string[] }): Promise<void> {
	const invitationIds = Array.from(new Set([...input.invitationIds, ...(await invitationIdsForEmails(input.emails))]));

	if (invitationIds.length > 0) {
		await adminClient.from('audit_logs').delete().in('resource_id', invitationIds);
		await adminClient.from('organization_invitation_email_outbox').delete().in('invitation_id', invitationIds);
		await adminClient.from('organization_invitations').delete().in('id', invitationIds);
	}

	if (input.userIds.length > 0) {
		await adminClient
			.from('organization_memberships')
			.delete()
			.eq('organization_id', TEST_ORG.id)
			.in('user_id', input.userIds);
	}

	for (const email of input.emails) {
		const users = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
		const user = users.data.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase());
		if (user) {
			await adminClient.auth.admin.deleteUser(user.id);
		}
	}
}

function pagePathAndSearch(page: import('@playwright/test').Page): string {
	const url = new URL(page.url());
	return `${url.pathname}${url.search}`;
}

test.describe('Dashboard Organization Invitation E2E smoke', () => {
	test.setTimeout(60_000);

	test('accepts and declines pending dashboard invitations for authenticated invitees', async ({ browser }) => {
		const suffix = Date.now();
		const acceptEmail = `dashboard-invite-accept-${suffix}@example.test`;
		const declineEmail = `dashboard-invite-decline-${suffix}@example.test`;
		const userIds: string[] = [];
		const invitationIds: string[] = [];

		try {
			await cleanupInvitees({ emails: [acceptEmail, declineEmail], userIds, invitationIds });
			const invitedBy = await findOwnerUserId();
			const acceptUserId = await createInvitee(acceptEmail);
			userIds.push(acceptUserId);
			const declineUserId = await createInvitee(declineEmail);
			userIds.push(declineUserId);
			const acceptInvitationId = await createDashboardInvitation(acceptEmail, invitedBy);
			invitationIds.push(acceptInvitationId);
			const declineInvitationId = await createDashboardInvitation(declineEmail, invitedBy);
			invitationIds.push(declineInvitationId);

			const acceptContext = await createAuthenticatedContext(browser, acceptEmail, INVITEE_PASSWORD);
			const acceptPage = await acceptContext.newPage();
			await acceptPage.goto('/dashboard?show=all');
			await expect(acceptPage.getByText('Pending Invitations', { exact: true })).toBeVisible();
			await expect(acceptPage.getByText(TEST_ORG.name)).toBeVisible();
			await acceptPage.getByRole('button', { name: 'Accept' }).click();
			await expect.poll(() => invitationStatus(acceptInvitationId)).toBe('accepted');
			await expect.poll(() => membershipRole(acceptUserId)).toBe('member');
			await expect(acceptPage.getByRole('button', { name: 'Accept' })).toBeHidden();
			await expect.poll(() => pagePathAndSearch(acceptPage)).toMatch(/^\/(dashboard\?show=all|org\/)/);
			await acceptContext.close();

			const declineContext = await createAuthenticatedContext(browser, declineEmail, INVITEE_PASSWORD);
			const declinePage = await declineContext.newPage();
			await declinePage.goto('/dashboard?show=all');
			await expect(declinePage.getByText('Pending Invitations', { exact: true })).toBeVisible();
			await expect(declinePage.getByText(TEST_ORG.name)).toBeVisible();
			await declinePage.getByRole('button', { name: 'Decline' }).click();
			await expect.poll(() => invitationStatus(declineInvitationId)).toBe('declined');
			await expect.poll(() => membershipRole(declineUserId)).toBeNull();
			await expect(declinePage.getByRole('button', { name: 'Decline' })).toBeHidden();
			await expect.poll(() => pagePathAndSearch(declinePage)).toMatch(/^\/(dashboard\?show=all|org\/new)/);
			await declineContext.close();
		} finally {
			await cleanupInvitees({ emails: [acceptEmail, declineEmail], userIds, invitationIds });
		}
	});
});
