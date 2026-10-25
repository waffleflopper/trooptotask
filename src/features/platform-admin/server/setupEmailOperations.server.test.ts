import { createClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { admission, audit } = vi.hoisted(() => ({ admission: vi.fn(), audit: vi.fn() }));
vi.mock('./admission.server', () => ({ admitPlatformAdministrator: admission }));
vi.mock('$lib/audit/index.server', () => ({ auditLog: audit }));
import { createPlatformSetupEmailOperations } from './setupEmailOperations.server';

const item = {
	isOpen: true,
	id: 'link-1',
	requestId: 'request-1',
	name: 'Pat',
	email: 'pat@example.test',
	reason: 'bounced',
	failedAt: '2026-10-24',
	closedAt: null,
	bounceReason: 'Mailbox gone',
	expiresAt: '2026-11-01',
	createdAt: '2026-10-23',
	claimedAt: null,
	revokedAt: null,
	completedAt: null,
	status: 'approved'
};
const origin = {
	id: 'origin-1',
	access_request_id: 'request-1',
	organization_invitation_id: 'invite-1',
	organization_id: 'org-1',
	invited_by: 'inviter-1',
	invited_at: '2026-10-22',
	intended_membership_role: 'member',
	intended_member_preset: 'viewer',
	organizations: { id: 'org-1', name: 'Able Clinic' }
};
function fixture(
	options: { open?: boolean; member?: boolean; invitationPending?: boolean; notificationFails?: boolean } = {}
) {
	const writes: Array<{ path: string; value: unknown }> = [];
	admission.mockResolvedValue({
		actor: { userId: 'operator-1' },
		requestInfo: { userId: 'operator-1', userEmail: 'operator@example.test' },
		adminClient: createClient('http://127.0.0.1:9', 'synthetic-service-key', {
			auth: { persistSession: false },
			global: {
				fetch: async (input, init) => {
					const request = new Request(input, init);
					const url = new URL(request.url);
					if (request.method === 'POST' && url.pathname === '/rest/v1/notifications') {
						writes.push({ path: url.pathname, value: await request.json() });
						return options.notificationFails
							? Response.json({ message: 'unavailable' }, { status: 500 })
							: new Response(null, { status: 201 });
					}
					if (url.pathname === '/rest/v1/rpc/platform_setup_email_inbox')
						return Response.json({ count: 1, rows: [{ ...item, isOpen: options.open ?? true }] });
					if (url.pathname === '/rest/v1/access_request_organization_invitation_links')
						return Response.json(
							options.invitationPending === false &&
								url.searchParams.get('organization_invitations.status') === 'eq.pending'
								? []
								: [origin, { ...origin, id: 'origin-duplicate' }]
						);
					if (url.pathname === '/rest/v1/organization_memberships')
						return Response.json(
							options.member === false ? [] : [{ role: 'member', organizations: { id: 'org-1', name: 'Able Clinic' } }]
						);
					throw new Error(`Unexpected effect ${request.method} ${url.pathname}`);
				}
			}
		})
	});
	return { writes };
}

describe('ask the inviter', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		audit.mockResolvedValue(undefined);
	});
	it('notifies the current inviting member once and awaits audit', async () => {
		const { writes } = fixture();
		let resolveAudit!: () => void;
		audit.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					resolveAudit = resolve;
				})
		);
		const operations = await createPlatformSetupEmailOperations({} as never);
		let settled = false;
		const pending = operations.askInviter('link-1').then((result) => {
			settled = true;
			return result;
		});
		await vi.waitFor(() => expect(audit).toHaveBeenCalled());
		expect(settled).toBe(false);
		resolveAudit();
		await expect(pending).resolves.toEqual({ status: 'notified' });
		expect(writes).toEqual([
			{
				path: '/rest/v1/notifications',
				value: [
					{
						organization_id: 'org-1',
						user_id: 'inviter-1',
						type: 'setup_email_address_check',
						title: expect.any(String),
						message: expect.stringContaining('pat@example.test'),
						link: '/org/org-1/settings/members'
					}
				]
			}
		]);
		expect(audit).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'access_request.inviter_address_check_requested',
				resourceId: 'request-1',
				details: expect.objectContaining({ actorEmail: 'operator@example.test', targetName: 'Pat' })
			}),
			expect.objectContaining({ userId: 'operator-1' }),
			{ required: true }
		);
	});
	it.each([
		{ open: false, status: 'not_open' },
		{ member: false, status: 'no_inviter' },
		{ invitationPending: false, status: 'no_inviter' }
	])('does not notify for $status', async (options) => {
		const { writes } = fixture(options);
		const operations = await createPlatformSetupEmailOperations({} as never);
		await expect(operations.askInviter('link-1')).resolves.toEqual({ status: options.status });
		expect(writes).toEqual([]);
		expect(audit).not.toHaveBeenCalled();
	});
	it('fails if notification persistence fails', async () => {
		fixture({ notificationFails: true });
		const operations = await createPlatformSetupEmailOperations({} as never);
		await expect(operations.askInviter('link-1')).rejects.toThrow();
		expect(audit).not.toHaveBeenCalled();
	});
	it('does not report success when the required audit fails after delivery', async () => {
		const { writes } = fixture();
		audit.mockRejectedValue(new Error('Audit unavailable'));
		const operations = await createPlatformSetupEmailOperations({} as never);
		await expect(operations.askInviter('link-1')).resolves.toEqual({ status: 'notified_audit_failed' });
		expect(writes).toHaveLength(1);
	});
});
