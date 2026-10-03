import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { loadSettingsShell } from './settingsShell.server';

const organization = { id: 'org-a', name: 'Synthetic Alpha', urlSlug: 'alpha', urlSegment: 'alpha' };

describe('mixed settings shell delivery', () => {
	it('starts Organization invitations, Personnel archive and approval counts together and returns only their projections', async () => {
		const ctx = createTestContext({ auth: { orgId: 'org-a' } });
		const started = new Set<string>();
		let release!: () => void;
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		ctx.organizationSettings.countPendingInvitations = async () => {
			started.add('invitations');
			await held;
			return 2;
		};
		ctx.store.findManyWithCount = async (table) => {
			started.add(table);
			await held;
			return { data: [], count: table === 'personnel' ? 3 : 4 };
		};
		const pending = loadSettingsShell(ctx, organization);
		try {
			await vi.waitFor(() => expect(started).toEqual(new Set(['invitations', 'personnel', 'deletion_requests'])));
		} finally {
			release();
		}
		expect((await pending).navBadges).toEqual({
			pendingInvitationsCount: 2,
			archivedPersonnelCount: 3,
			pendingApprovalsCount: 4
		});
	});
	it.each(['invitations', 'personnel', 'deletion_requests'])(
		'keeps the shell failure boundary when a count cannot be read (%s)',
		async (source) => {
			const ctx = createTestContext({ auth: { orgId: 'org-a' } });
			ctx.organizationSettings.countPendingInvitations = async () => {
				if (source === 'invitations') throw new Error('Count unavailable');
				return 2;
			};
			ctx.store.findManyWithCount = async (table) => {
				if (table === source) throw new Error('Count unavailable');
				return { data: [], count: 3 };
			};
			await expect(loadSettingsShell(ctx, organization)).rejects.toThrow('Count unavailable');
		}
	);
});
