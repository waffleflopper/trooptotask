import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { listActiveIctTasksForReadiness } from './ictTaskRead.server';

function taskRow(id: string, orgId: string, archivedAt: string | null) {
	return {
		id,
		organization_id: orgId,
		task_code: id,
		title: id,
		description: null,
		category: null,
		mos: ['68W'],
		expiration_months: 12,
		sort_order: 0,
		archived_at: archivedAt,
		created_at: '2026-04-01T00:00:00Z'
	};
}

describe('active Critical Tasks read for Personnel readiness', () => {
	it('returns mapped active tasks from the admitted Organization only', async () => {
		const ctx = createTestContext();
		ctx.store.seed('ict_tasks', [
			taskRow('active', ctx.auth.orgId, null),
			taskRow('archived', ctx.auth.orgId, '2026-04-02T00:00:00Z'),
			taskRow('foreign', 'other-org', null)
		]);

		await expect(listActiveIctTasksForReadiness({ store: ctx.store, orgId: ctx.auth.orgId })).resolves.toEqual([
			expect.objectContaining({ id: 'active', taskCode: 'active', mos: ['68W'], expirationMonths: 12 })
		]);
	});
});
