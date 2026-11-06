import { describe, expect, it } from 'vitest';
import { createWritePortsContext } from '$lib/server/adapters/inMemory';
import { setGroupOrder } from './groupOperations.server';

const ALPHA = '00000000-0000-4000-a000-000000000001';
const BRAVO = '00000000-0000-4000-a000-000000000002';

describe('Group order', () => {
	it('audits how many Groups were reordered', async () => {
		const ctx = createWritePortsContext();
		ctx.store.seed(
			'groups',
			[ALPHA, BRAVO].map((id, position) => ({ id, organization_id: ctx.auth.orgId, name: id, sort_order: position }))
		);
		await setGroupOrder(ctx, { groupIds: [BRAVO, ALPHA], expectedGroupIds: [ALPHA, BRAVO] });
		expect(ctx.audit.events).toMatchObject([{ action: 'group.reordered', details: { count: 2 } }]);
	});

	it('saves an empty order without an audit entry, which the catalog would refuse', async () => {
		const ctx = createWritePortsContext();
		await expect(setGroupOrder(ctx, { groupIds: [], expectedGroupIds: [] })).resolves.toBeUndefined();
		expect(ctx.audit.events).toEqual([]);
	});
});
