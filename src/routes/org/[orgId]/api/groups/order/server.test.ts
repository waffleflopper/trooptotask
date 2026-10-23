import { describe, expect, it } from 'vitest';
import type { ScopeSet } from '$lib/access/memberAccessShape';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _putConfig } from './+server';

const alpha = '0a000000-0000-4000-8000-000000000001';
const bravo = '0b000000-0000-4000-8000-000000000002';
const charlie = '0c000000-0000-4000-8000-000000000003';

function context(scopeSet: ScopeSet = { kind: 'organization' }) {
	const ctx = createTestContext({
		auth: {
			role: 'member',
			isPrivileged: false,
			canManageMembers: false,
			capabilityMap: {
				calendar: 'none',
				personnel: 'configure',
				training: 'none',
				criticalTasks: 'none',
				onboarding: 'none',
				ratingScheme: 'none'
			},
			scopeSet
		}
	});
	ctx.store.seed('groups', [
		{ id: alpha, organization_id: ctx.auth.orgId, name: 'Alpha', sort_order: 0 },
		{ id: bravo, organization_id: ctx.auth.orgId, name: 'Bravo', sort_order: 1 },
		{ id: charlie, organization_id: ctx.auth.orgId, name: 'Charlie', sort_order: 2 }
	]);
	return ctx;
}

const reorder = (ctx: ReturnType<typeof context>, groupIds: string[], expectedGroupIds = [alpha, bravo, charlie]) =>
	handleUseCaseRequest(_putConfig, ctx, { groupIds, expectedGroupIds }, () => ctx);

async function savedOrder(ctx: ReturnType<typeof context>) {
	const rows = await ctx.store.findMany<{ id: string; sort_order: number }>('groups', ctx.auth.orgId);
	return rows.toSorted((a, b) => a.sort_order - b.sort_order).map((row) => row.id);
}

describe('PUT /api/groups/order', () => {
	it('saves the display order, accepts a replay and audits each save', async () => {
		const ctx = context();

		await expect(reorder(ctx, [charlie, alpha, bravo])).resolves.toEqual({ success: true });
		expect(await savedOrder(ctx)).toEqual([charlie, alpha, bravo]);
		await expect(reorder(ctx, [charlie, alpha, bravo])).resolves.toEqual({ success: true });
		expect(ctx.auditPort.events).toEqual([
			expect.objectContaining({ action: 'group.reordered', details: { groupIds: [charlie, alpha, bravo] } }),
			expect.objectContaining({ action: 'group.reordered', details: { groupIds: [charlie, alpha, bravo] } })
		]);
	});

	it('answers 409 for an order read before another save and 400 for an incomplete order', async () => {
		const ctx = context();

		await expect(reorder(ctx, [bravo, alpha, charlie], [charlie, bravo, alpha])).rejects.toMatchObject({
			status: 409,
			message: 'The Group order changed somewhere else. The list shows the saved order.'
		});
		await expect(reorder(ctx, [bravo, alpha])).rejects.toMatchObject({ status: 400 });
		await expect(reorder(ctx, ['not-a-uuid'])).rejects.toMatchObject({ status: 400 });
		expect(await savedOrder(ctx)).toEqual([alpha, bravo, charlie]);
		expect(ctx.auditPort.events).toEqual([]);
	});

	it('denies a Group-scoped Personnel configurer', async () => {
		const ctx = context({ kind: 'groups', groupIds: [alpha, bravo, charlie] });

		await expect(reorder(ctx, [charlie, alpha, bravo])).rejects.toMatchObject({ status: 403 });
		expect(await savedOrder(ctx)).toEqual([alpha, bravo, charlie]);
	});
});
