import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { streamSettingsNavCounts } from './settingsShell.server';

const ADMIN = { orgId: 'org-a', role: 'admin', isPrivileged: true } as const;
const FAR_FUTURE = '2999-01-01T00:00:00.000Z';
const LONG_PAST = '2000-01-01T00:00:00.000Z';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => (resolve = r));
	return { promise, resolve };
}

function invite(id: string, expiresAt: string, orgId = 'org-a') {
	return { id, organization_id: orgId, email: `${id}@example.invalid`, status: 'pending', expires_at: expiresAt };
}

const NOW = new Date('2026-08-04T12:00:00.000Z');

function hoursFromNow(hours: number) {
	return new Date(NOW.getTime() + hours * 3_600_000).toISOString();
}

describe('settings nav counts', () => {
	afterEach(() => vi.useRealTimers());

	it('streams each count as its own read settles', async () => {
		const ctx = createTestContext({ auth: ADMIN });
		ctx.store.seed('organization_invitations', [
			invite('one', FAR_FUTURE),
			invite('two', FAR_FUTURE),
			invite('other-org', FAR_FUTURE, 'org-b')
		]);
		const approvals = deferred<{ kind: 'archive' | 'deletion'; count: number; oldestCreatedAt: string }[]>();
		const counts = streamSettingsNavCounts(ctx, () => approvals.promise);

		await expect(counts.pendingInvitations).resolves.toBe(2);
		approvals.resolve([
			{ kind: 'archive', count: 1, oldestCreatedAt: LONG_PAST },
			{ kind: 'deletion', count: 3, oldestCreatedAt: LONG_PAST }
		]);
		await expect(counts.pendingApprovals).resolves.toBe(4);
	});

	it('does not count a pending invitation that has already expired', async () => {
		const ctx = createTestContext({ auth: ADMIN });
		ctx.store.seed('organization_invitations', [invite('live', FAR_FUTURE), invite('lapsed', LONG_PAST)]);
		const counts = streamSettingsNavCounts(ctx, async () => []);

		await expect(counts.pendingInvitations).resolves.toBe(1);
	});

	it('keeps the invitation count when the approval count fails', async () => {
		const ctx = createTestContext({ auth: ADMIN });
		ctx.store.seed('organization_invitations', [invite('one', FAR_FUTURE), invite('two', FAR_FUTURE)]);
		const counts = streamSettingsNavCounts(ctx, async () => {
			throw new Error('Count unavailable');
		});

		await expect(counts.pendingInvitations).resolves.toBe(2);
		await expect(counts.pendingApprovals).rejects.toThrow('Count unavailable');
	});

	it('splits the invitations that need follow-up by why, and leaves out healthy and lapsed ones', async () => {
		vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
		const ctx = createTestContext({ auth: ADMIN });
		ctx.store.seed('organization_invitations', [
			invite('failed', FAR_FUTURE),
			invite('failed-and-soon', hoursFromNow(10)),
			invite('soon-a', hoursFromNow(24)),
			invite('soon-b', hoursFromNow(48)),
			invite('healthy', FAR_FUTURE),
			invite('lapsed', LONG_PAST),
			invite('other-org', hoursFromNow(5), 'org-b')
		]);
		ctx.store.seed('organization_invitation_email_outbox', [
			{ id: 'd1', invitation_id: 'failed', organization_id: 'org-a', status: 'failed', created_at: LONG_PAST },
			{ id: 'd2', invitation_id: 'failed-and-soon', organization_id: 'org-a', status: 'failed', created_at: LONG_PAST }
		]);
		const counts = streamSettingsNavCounts(ctx, async () => []);

		await expect(counts.invitationsToFollowUp).resolves.toEqual({ deliveryFailed: 2, expiringSoon: 2 });
		await expect(counts.pendingInvitations).resolves.toBe(5);
	});

	it('keeps the approval count when the invitation follow-up fails', async () => {
		const ctx = createTestContext({ auth: ADMIN });
		ctx.organizationSettings.listUnexpiredPendingInvitations = async () => {
			throw new Error('Invitations unavailable');
		};
		const counts = streamSettingsNavCounts(ctx, async () => [
			{ kind: 'deletion', count: 2, oldestCreatedAt: LONG_PAST }
		]);

		await expect(counts.invitationsToFollowUp).rejects.toThrow('Invitations unavailable');
		await expect(counts.pendingApprovals).resolves.toBe(2);
	});
});
