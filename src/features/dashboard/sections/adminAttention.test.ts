import { describe, expect, it, vi } from 'vitest';
import type { DashboardAdminAttentionState } from '../contracts';
import type { DashboardAccess } from './dashboardAccess';
import type { DashboardInputs } from './dashboardInputs';
import { composeDashboardSections } from './dashboardSections';
import { DASHBOARD_SECTIONS } from './dashboardSectionRegistry';
import { adminAttention, adminAttentionLoad } from './adminAttention';

const archive = { kind: 'archive', count: 2, oldestCreatedAt: '2026-10-21T15:00:00Z' } as const;
const deletion = { kind: 'deletion', count: 1, oldestCreatedAt: '2026-10-26T09:00:00Z' } as const;
const failed = {
	id: 'invite-failed',
	email: 'failed@example.invalid',
	expiresAt: '2026-11-20T12:00:00Z',
	reason: 'deliveryFailed'
} as const;
const expiring = {
	id: 'invite-expiring',
	email: 'soon@example.invalid',
	expiresAt: '2026-10-28T12:00:00Z',
	reason: 'expiringSoon'
} as const;

function inputs(adminAttention: DashboardAdminAttentionState): DashboardInputs {
	return {
		today: '2026-10-26',
		timeZone: 'UTC',
		forecastDays: [],
		page: { orgId: 'org-1', orgName: 'Test Unit', adminAttention }
	} as unknown as DashboardInputs;
}

type Approvals = readonly (typeof archive | typeof deletion)[];
type Invitations = readonly {
	id: string;
	email: string;
	expiresAt: string;
	reason: 'deliveryFailed' | 'expiringSoon';
}[];
const ready = (approvals: Approvals, invitations: Invitations = []) =>
	inputs({ status: 'ready', approvals, invitations });

describe('adminAttention', () => {
	it('lists one approval row per kind with the age of the oldest, linking to Approvals', () => {
		const items = adminAttention(ready([archive, deletion]));

		expect(items).toHaveLength(2);
		expect(items[0]).toMatchObject({
			kind: 'adminApprovals',
			id: 'approvals:archive',
			title: '2 archive requests to review',
			timing: '5 days waiting',
			href: '/org/org-1/settings/approvals',
			urgency: { date: '2026-10-21' },
			action: null
		});
		expect(items[1]).toMatchObject({
			kind: 'adminApprovals',
			id: 'approvals:deletion',
			title: '1 deletion request to review',
			timing: 'today',
			urgency: { date: '2026-10-26' }
		});
	});

	it('names a failed invitation and an expiring one, each linking to Members', () => {
		const items = adminAttention(ready([], [failed, expiring]));

		expect(items.map((item) => [item.kind, item.id, item.href])).toEqual([
			['invitationNotDelivered', 'invitation:invite-failed', '/org/org-1/settings/members'],
			['invitationExpiring', 'invitation:invite-expiring', '/org/org-1/settings/members']
		]);
		expect(items[0]).toMatchObject({
			title: expect.stringContaining('failed@example.invalid'),
			timing: 'expires in 25 days'
		});
		expect(items[1]).toMatchObject({
			title: expect.stringContaining('soon@example.invalid'),
			timing: 'expires in 2 days'
		});
	});

	it('dates an expiry by the viewer day, so a late-evening expiry is still today', () => {
		const [item] = adminAttention(ready([], [{ ...expiring, expiresAt: '2026-10-26T23:30:00Z' }]));

		expect(item?.timing).toBe('expires today');
	});

	it('drops a row as soon as the data no longer contains it', () => {
		const before = adminAttention(ready([archive], [failed, expiring])).map((item) => item.id);
		const after = adminAttention(ready([], [expiring])).map((item) => item.id);

		expect(before).toEqual(['approvals:archive', 'invitation:invite-failed', 'invitation:invite-expiring']);
		expect(after).toEqual(['invitation:invite-expiring']);
	});

	it.each<DashboardAdminAttentionState>([{ status: 'off' }, { status: 'pending' }, { status: 'failed' }])(
		'adds no rows while the source is $status',
		(state) => {
			expect(adminAttention(inputs(state))).toEqual([]);
		}
	);
});

describe('adminAttentionLoad', () => {
	it.each(['pending', 'failed'] as const)('reports %s and retries through the page', (status) => {
		const updates = { retryAdminAttention: vi.fn() };
		const load = adminAttentionLoad(inputs({ status }));

		expect(load).toMatchObject({ state: status });
		load?.retry(updates as never);
		expect(updates.retryAdminAttention).toHaveBeenCalledOnce();
	});

	it.each<DashboardAdminAttentionState>([{ status: 'off' }, { status: 'ready', approvals: [], invitations: [] }])(
		'reports nothing once the source is $status',
		(state) => {
			expect(adminAttentionLoad(inputs(state))).toBeNull();
		}
	);
});

describe('the administration section', () => {
	const access = (isPrivileged: boolean): DashboardAccess => ({ can: () => true, isPrivileged });
	const only = DASHBOARD_SECTIONS.filter((section) => section.id === 'administration');

	it('queues the rows for an owner or admin', () => {
		const parts = composeDashboardSections(only, ready([archive], [failed]), [], access(true));

		expect(parts.needsYou.ranked.map((item) => item.id)).toEqual(['invitation:invite-failed', 'approvals:archive']);
	});

	it('adds neither rows nor a loading or failed state for anyone else', () => {
		for (const state of [ready([archive], [failed]), inputs({ status: 'pending' }), inputs({ status: 'failed' })]) {
			const parts = composeDashboardSections(only, state, [], access(false));

			expect(parts.needsYou.ranked).toEqual([]);
			expect(parts.needsYouLoads).toEqual([]);
		}
	});

	it('shows the loading state to an owner or admin while the source is pending', () => {
		const parts = composeDashboardSections(only, inputs({ status: 'pending' }), [], access(true));

		expect(parts.needsYouLoads).toMatchObject([{ state: 'pending' }]);
	});

	it('stays when every feature is switched off, since it belongs to no feature', () => {
		const parts = composeDashboardSections(
			only,
			ready([deletion]),
			['training', 'criticalTasks', 'evaluations', 'lossesAndAwards', 'onboarding', 'eventsAndTaskings'],
			access(true)
		);

		expect(parts.needsYou.ranked).toHaveLength(1);
	});
});
