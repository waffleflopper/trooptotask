import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { streamSettingsNavCounts } from './settingsShell.server';

describe('settings nav counts', () => {
	it('streams the invitation and approval counts', async () => {
		const ctx = createTestContext({ auth: { orgId: 'org-a' } });
		ctx.organizationSettings.countPendingInvitations = async (orgId) => (orgId === 'org-a' ? 2 : 0);
		const counts = streamSettingsNavCounts(ctx, async () => ({ count: 4 }));

		await expect(counts.pendingInvitations).resolves.toBe(2);
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
