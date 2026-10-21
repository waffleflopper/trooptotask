import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { streamSettingsNavCounts } from './settingsShell.server';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => (resolve = r));
	return { promise, resolve };
}

describe('settings nav counts', () => {
	it('streams each count as its own read settles', async () => {
		const ctx = createTestContext({ auth: { orgId: 'org-a' } });
		ctx.organizationSettings.countPendingInvitations = async (orgId) => (orgId === 'org-a' ? 2 : 0);
		const approvals = deferred<{ count: number }>();
		const counts = streamSettingsNavCounts(ctx, () => approvals.promise);

		await expect(counts.pendingInvitations).resolves.toBe(2);
		approvals.resolve({ count: 4 });
		await expect(counts.pendingApprovals).resolves.toBe(4);
	});

	it('keeps the invitation count when the approval count fails', async () => {
		const ctx = createTestContext({ auth: { orgId: 'org-a' } });
		ctx.organizationSettings.countPendingInvitations = async () => 2;
		const counts = streamSettingsNavCounts(ctx, async () => {
			throw new Error('Count unavailable');
		});

		await expect(counts.pendingInvitations).resolves.toBe(2);
		await expect(counts.pendingApprovals).rejects.toThrow('Count unavailable');
	});
});
