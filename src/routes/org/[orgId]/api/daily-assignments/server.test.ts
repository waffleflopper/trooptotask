import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _deleteConfig, _postConfig } from './+server';

const deniedCapabilities = {
	calendar: 'none',
	personnel: 'none',
	training: 'none',
	criticalTasks: 'none',
	onboarding: 'none',
	ratingScheme: 'none'
} as const;

describe('/api/daily-assignments', () => {
	it('denies assignment mutations through the policy decision', async () => {
		for (const config of [_postConfig, _deleteConfig]) {
			const ctx = createTestContext({
				auth: {
					role: 'member',
					isPrivileged: false,
					canManageMembers: false,
					capabilityMap: deniedCapabilities,
					scopeSet: { kind: 'organization' }
				}
			});

			await expect(
				handleUseCaseRequest(config, ctx, { date: '2026-05-01', assignmentTypeId: 'type-cq' })
			).rejects.toMatchObject({ status: 403 });
			expect(ctx.auditPort.events).toEqual([
				expect.objectContaining({
					action: 'policy.denied',
					resourceType: 'calendar.manageAssignments'
				})
			]);
		}
	});

	it('clears assignment slots for an authorized calendar operator', async () => {
		const ctx = createTestContext();
		ctx.store.seed('daily_assignments', [
			{
				id: 'assignment-post-clear',
				organization_id: ctx.auth.orgId,
				date: '2026-05-01',
				assignment_type_id: 'type-cq',
				assignee_id: 'person-1'
			},
			{
				id: 'assignment-delete-clear',
				organization_id: ctx.auth.orgId,
				date: '2026-05-02',
				assignment_type_id: 'type-cq',
				assignee_id: 'person-2'
			}
		]);

		await expect(
			handleUseCaseRequest(_postConfig, ctx, { date: '2026-05-01', assignmentTypeId: 'type-cq' })
		).resolves.toEqual({ success: true, removed: true });
		await expect(
			handleUseCaseRequest(_deleteConfig, ctx, { date: '2026-05-02', assignmentTypeId: 'type-cq' })
		).resolves.toEqual({ success: true });

		await expect(ctx.store.findMany('daily_assignments', ctx.auth.orgId)).resolves.toEqual([]);
		expect(ctx.auditPort.events).toEqual([
			expect.objectContaining({
				action: 'daily_assignment.cleared',
				resourceType: 'daily_assignment',
				details: { date: '2026-05-01', assignmentTypeId: 'type-cq' }
			}),
			expect.objectContaining({
				action: 'daily_assignment.cleared',
				resourceType: 'daily_assignment',
				details: { date: '2026-05-02', assignmentTypeId: 'type-cq' }
			})
		]);
	});
});
