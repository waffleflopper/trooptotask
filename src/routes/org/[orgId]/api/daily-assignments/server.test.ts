import { describe, expect, it } from 'vitest';
import { createTestContext } from '$features/calendar/calendarPersistence.test-support.server';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _deleteConfig, _postConfig } from './+server';

const CQ_TYPE = '00000000-0000-4000-8000-000000000010';
const PERSON_1 = '00000000-0000-4000-8000-000000000011';
const PERSON_2 = '00000000-0000-4000-8000-000000000012';

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
				handleUseCaseRequest(config, ctx, { date: '2026-05-01', assignmentTypeId: CQ_TYPE }, () => ctx)
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
				assignment_type_id: CQ_TYPE,
				assignee_id: PERSON_1
			},
			{
				id: 'assignment-delete-clear',
				organization_id: ctx.auth.orgId,
				date: '2026-05-02',
				assignment_type_id: CQ_TYPE,
				assignee_id: PERSON_2
			}
		]);

		await expect(
			handleUseCaseRequest(_postConfig, ctx, { date: '2026-05-01', assignmentTypeId: CQ_TYPE }, () => ctx)
		).resolves.toEqual({ success: true, removed: true });
		await expect(
			handleUseCaseRequest(_deleteConfig, ctx, { date: '2026-05-02', assignmentTypeId: CQ_TYPE }, () => ctx)
		).resolves.toEqual({ success: true });

		await expect(ctx.store.findMany('daily_assignments', ctx.auth.orgId)).resolves.toEqual([]);
		expect(ctx.auditPort.events).toEqual([
			expect.objectContaining({
				action: 'daily_assignment.cleared',
				resourceType: 'daily_assignment',
				details: { date: '2026-05-01', assignmentTypeId: CQ_TYPE }
			}),
			expect.objectContaining({
				action: 'daily_assignment.cleared',
				resourceType: 'daily_assignment',
				details: { date: '2026-05-02', assignmentTypeId: CQ_TYPE }
			})
		]);
	});

	it('rejects a blank set assignee without clearing the saved slot', async () => {
		const ctx = createTestContext();
		const existing = {
			id: 'saved-slot',
			organization_id: ctx.auth.orgId,
			date: '2026-05-01',
			assignment_type_id: CQ_TYPE,
			assignee_id: PERSON_1
		};
		ctx.store.seed('daily_assignments', [existing]);

		await expect(
			handleUseCaseRequest(
				_postConfig,
				ctx,
				{
					date: '2026-05-01',
					assignmentTypeId: CQ_TYPE,
					assigneeId: '   '
				},
				() => ctx
			)
		).rejects.toMatchObject({ status: 400 });
		expect(await ctx.store.findMany('daily_assignments', ctx.auth.orgId)).toEqual([existing]);
		expect(ctx.auditPort.events).toEqual([]);
	});

	it('answers 400 for an impossible assignment date', async () => {
		const ctx = createTestContext();

		await expect(
			handleUseCaseRequest(_postConfig, ctx, { date: '2026-02-30', assignmentTypeId: CQ_TYPE }, () => ctx)
		).rejects.toMatchObject({ status: 400 });
	});
});
