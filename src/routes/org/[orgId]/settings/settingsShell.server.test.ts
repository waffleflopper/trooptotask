import { describe, expect, it } from 'vitest';
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

describe('settings nav counts', () => {
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
});
