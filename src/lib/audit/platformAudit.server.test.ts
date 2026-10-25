import { describe, expect, it } from 'vitest';
import { createInMemoryPlatformAuditStore } from './inMemoryPlatformAudit';
import { createPlatformAudit } from './platformAudit.server';

describe('PlatformAudit', () => {
	const event = (id: string, timestamp: string, overrides: Record<string, unknown> = {}) => ({
		id,
		userId: null,
		orgId: null,
		action: 'suspend_user',
		resourceType: 'user',
		resourceId: null,
		ipAddress: null,
		details: null,
		severity: 'critical',
		timestamp,
		...overrides
	});

	it('lists only the requested platform actions and prefixes, newest first, with the Organization name', async () => {
		const audit = createPlatformAudit({
			store: createInMemoryPlatformAuditStore({
				organizationNames: { 'org-1': 'Alpha Company' },
				logs: [
					event('old', '2026-10-20T12:00:00.000Z'),
					event('org', '2026-10-22T12:00:00.000Z', { action: 'suspend_org', orgId: 'org-1' }),
					event('prefixed', '2026-10-21T12:00:00.000Z', { action: 'admin.future_action' }),
					event('org-event', '2026-10-23T12:00:00.000Z', { action: 'personnel.updated', orgId: 'org-1' })
				]
			})
		});

		const result = await audit.listActivity({
			actions: ['suspend_user', 'suspend_org'],
			prefixes: ['admin.'],
			search: '',
			from: null,
			to: null,
			page: 1
		});

		expect(result.events.map((entry) => entry.id)).toEqual(['org', 'prefixed', 'old']);
		expect(result.events[0].orgName).toBe('Alpha Company');
		expect(result).toMatchObject({ totalCount: 3, page: 1, limit: 50 });
	});

	it('searches actor email, actor name, target name and Organization name without regard to case', async () => {
		const audit = createPlatformAudit({
			store: createInMemoryPlatformAuditStore({
				organizationNames: { 'org-1': 'Alpha Company' },
				actors: { 'user-1': { email: 'Dana@example.test', name: 'CPT Dana Reyes' } },
				logs: [
					event('account', '2026-10-23T12:00:00.000Z', { userId: 'user-1', orgId: 'org-1', details: {} }),
					event('actor', '2026-10-22T12:00:00.000Z', { details: { actorEmail: 'Robert@example.test' } }),
					event('target', '2026-10-21T12:00:00.000Z', { details: { targetName: 'Pat Example' } }),
					event('org', '2026-10-20T12:00:00.000Z', { orgId: 'org-1' }),
					event('none', '2026-10-19T12:00:00.000Z')
				]
			})
		});
		const search = async (text: string) =>
			(
				await audit.listActivity({
					actions: ['suspend_user'],
					prefixes: [],
					search: text,
					from: null,
					to: null,
					page: 1
				})
			).events.map((entry) => entry.id);

		expect(await search('ROBERT@')).toEqual(['actor']);
		expect(await search(' pat ex ')).toEqual(['target']);
		expect(await search('alpha')).toEqual(['account', 'org']);
		expect(await search('dana@EXAMPLE')).toEqual(['account']);
		expect(await search('Reyes')).toEqual(['account']);
	});

	it('keeps the start of a date range and drops its end instant', async () => {
		const audit = createPlatformAudit({
			store: createInMemoryPlatformAuditStore({
				logs: [
					event('before', '2026-10-20T23:59:59.999Z'),
					event('start', '2026-10-21T00:00:00.000Z'),
					event('inside', '2026-10-22T12:00:00.000Z'),
					event('end', '2026-10-23T00:00:00.000Z')
				]
			})
		});

		const result = await audit.listActivity({
			actions: ['suspend_user'],
			prefixes: [],
			search: '',
			from: new Date('2026-10-21T00:00:00.000Z'),
			to: new Date('2026-10-23T00:00:00.000Z'),
			page: 1
		});

		expect(result.events.map((entry) => entry.id)).toEqual(['inside', 'start']);
	});

	it('pages newest first and shows the last page when the requested page is past the end', async () => {
		const audit = createPlatformAudit({
			store: createInMemoryPlatformAuditStore({
				logs: [
					event('newest', '2026-10-24T12:00:00.000Z'),
					event('middle', '2026-10-23T12:00:00.000Z'),
					event('oldest', '2026-10-22T12:00:00.000Z')
				]
			})
		});
		const list = (page: number) =>
			audit.listActivity({ actions: ['suspend_user'], prefixes: [], search: '', from: null, to: null, page, limit: 2 });

		expect((await list(2)).events.map((entry) => entry.id)).toEqual(['oldest']);
		const past = await list(40);
		expect(past.events.map((entry) => entry.id)).toEqual(['oldest']);
		expect(past).toMatchObject({ page: 2, limit: 2, totalCount: 3 });
	});

	it('returns recent activity for organization and user detail pages', async () => {
		const audit = createPlatformAudit({
			store: createInMemoryPlatformAuditStore({
				logs: [
					{
						id: 'org-new',
						userId: 'user-1',
						orgId: 'org-1',
						action: 'admin.org.extend_gift',
						resourceType: 'organization',
						resourceId: 'org-1',
						ipAddress: null,
						details: null,
						severity: 'info',
						timestamp: '2026-06-08T16:00:00.000Z'
					},
					{
						id: 'user-new',
						userId: 'user-2',
						orgId: 'org-2',
						action: 'admin.user.resend_invite',
						resourceType: 'user',
						resourceId: 'user-2',
						ipAddress: null,
						details: { invitation: 'resent' },
						severity: 'warning',
						timestamp: '2026-06-08T15:00:00.000Z'
					},
					{
						id: 'org-old',
						userId: 'user-3',
						orgId: 'org-1',
						action: 'admin.org.revoke_gift',
						resourceType: 'organization',
						resourceId: 'org-1',
						ipAddress: null,
						details: null,
						severity: 'critical',
						timestamp: '2026-06-08T14:00:00.000Z'
					}
				]
			})
		});

		await expect(audit.listRecentByOrganization({ orgId: 'org-1', limit: 1 })).resolves.toEqual([
			{
				id: 'org-new',
				action: 'admin.org.extend_gift',
				userId: 'user-1',
				timestamp: '2026-06-08T16:00:00.000Z',
				severity: 'info',
				resourceType: 'organization',
				resourceId: 'org-1'
			}
		]);
		await expect(audit.listRecentByUser({ userId: 'user-2', limit: 1 })).resolves.toEqual([
			{
				id: 'user-new',
				userId: 'user-2',
				details: { invitation: 'resent' },
				ipAddress: null,
				action: 'admin.user.resend_invite',
				resourceType: 'user',
				resourceId: 'user-2',
				orgId: 'org-2',
				timestamp: '2026-06-08T15:00:00.000Z',
				severity: 'warning'
			}
		]);
	});
});
