import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _getConfig } from './+server';

const platoon = '11111111-1111-4111-8111-111111111111';
const squad = '22222222-2222-4222-8222-222222222222';
const team = '33333333-3333-4333-8333-333333333333';
const sibling = '44444444-4444-4444-8444-444444444444';
const missing = '99999999-9999-4999-8999-999999999999';
const archivedAt = '2026-01-01T00:00:00Z';

function seeded() {
	const ctx = createTestContext();
	const orgId = ctx.auth.orgId;
	ctx.store.seed('groups', [
		{ id: platoon, organization_id: orgId, name: '1st Platoon', sort_order: 0, parent_id: null, depth: 1 },
		{ id: squad, organization_id: orgId, name: '1st Squad', sort_order: 0, parent_id: platoon, depth: 2 },
		{ id: team, organization_id: orgId, name: 'Alpha Team', sort_order: 0, parent_id: squad, depth: 3 },
		{ id: sibling, organization_id: orgId, name: '2nd Platoon', sort_order: 1, parent_id: null, depth: 1 }
	]);
	ctx.store.seed('personnel', [
		{ id: 'p1', organization_id: orgId, last_name: 'Able', group_id: platoon, archived_at: archivedAt },
		{ id: 'p2', organization_id: orgId, last_name: 'Baker', group_id: team, archived_at: archivedAt },
		{ id: 'p3', organization_id: orgId, last_name: 'Cole', group_id: team, archived_at: null },
		{ id: 'p4', organization_id: orgId, last_name: 'Dunn', group_id: sibling, archived_at: archivedAt },
		{ id: 'p5', organization_id: 'other-org', last_name: 'Epps', group_id: platoon, archived_at: archivedAt }
	]);
	return ctx;
}

describe('/api/groups/archived-members', () => {
	it('counts archived people in the Group and every Group under it, and no one else', async () => {
		const ctx = seeded();

		await expect(handleUseCaseRequest(_getConfig, ctx, { groupId: platoon }, () => ctx)).resolves.toEqual({
			count: 2
		});
		await expect(handleUseCaseRequest(_getConfig, ctx, { groupId: squad }, () => ctx)).resolves.toEqual({ count: 1 });
		await expect(handleUseCaseRequest(_getConfig, ctx, { groupId: sibling }, () => ctx)).resolves.toEqual({
			count: 1
		});
	});

	it('answers 404 for a Group that is gone and 400 for a malformed id', async () => {
		const ctx = seeded();

		await expect(handleUseCaseRequest(_getConfig, ctx, { groupId: missing }, () => ctx)).rejects.toMatchObject({
			status: 404
		});
		await expect(handleUseCaseRequest(_getConfig, ctx, { groupId: 'nope' }, () => ctx)).rejects.toMatchObject({
			status: 400
		});
	});

	it('denies a Personnel viewer', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				canManageMembers: false,
				capabilityMap: {
					calendar: 'view',
					personnel: 'view',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			}
		});

		await expect(handleUseCaseRequest(_getConfig, ctx, { groupId: platoon }, () => ctx)).rejects.toMatchObject({
			status: 403
		});
	});
});
