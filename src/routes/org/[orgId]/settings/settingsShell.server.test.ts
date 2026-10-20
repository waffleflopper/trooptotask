import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { streamSettingsNavCounts } from './settingsShell.server';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => (resolve = r));
	return { promise, resolve };
}

async function settledValue<T>(promise: Promise<T>): Promise<T | 'pending'> {
	return Promise.race([promise, new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), 0))]);
}

describe('settings nav counts', () => {
	it('streams each count as its own read settles', async () => {
		const ctx = createTestContext({ auth: { orgId: 'org-a' } });
		const invitations = deferred<number>();
		const approvals = deferred<{ count: number }>();
		ctx.organizationSettings.countPendingInvitations = (orgId) =>
			orgId === 'org-a' ? invitations.promise : Promise.resolve(0);
		const counts = streamSettingsNavCounts(ctx, () => approvals.promise);

		expect(await settledValue(counts.pendingInvitations)).toBe('pending');
		expect(await settledValue(counts.pendingApprovals)).toBe('pending');

		invitations.resolve(2);
		expect(await settledValue(counts.pendingInvitations)).toBe(2);
		expect(await settledValue(counts.pendingApprovals)).toBe('pending');

		approvals.resolve({ count: 4 });
		expect(await settledValue(counts.pendingApprovals)).toBe(4);
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

	it('keeps the approval count when the invitation count fails', async () => {
		const ctx = createTestContext({ auth: { orgId: 'org-a' } });
		ctx.organizationSettings.countPendingInvitations = async () => {
			throw new Error('Count unavailable');
		};
		const counts = streamSettingsNavCounts(ctx, async () => ({ count: 4 }));

		await expect(counts.pendingInvitations).rejects.toThrow('Count unavailable');
		await expect(counts.pendingApprovals).resolves.toBe(4);
	});
});
