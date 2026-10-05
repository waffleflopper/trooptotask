import { describe, expect, it } from 'vitest';
import { createTestContext } from './criticalTaskLibrary.test-support.server';
import { loadCriticalTasksReadinessLane } from './personnelCriticalTasksReadiness.server';
const AS_OF = '2026-05-14';

function seedPerson(ctx: ReturnType<typeof createTestContext>, overrides: Record<string, unknown> = {}) {
	ctx.store.seed('personnel', [
		{
			id: 'person-1',
			organization_id: ctx.auth.orgId,
			group_id: 'group-1',
			rank: 'SGT',
			last_name: 'Rivera',
			first_name: 'Monica',
			mos: '68W',
			clinic_role: 'Medic',
			ets: '2026-06-20',
			deros: null,
			archived_at: null,
			...overrides
		}
	]);
}

describe('Personnel Critical Tasks readiness', () => {
	it('calculates Critical Tasks readiness for applicable ICT tasks', async () => {
		const ctx = createTestContext();
		seedPerson(ctx);
		ctx.store.seed('ict_tasks', [
			{
				id: 'task-1',
				organization_id: ctx.auth.orgId,
				task_code: 'ICT-1',
				title: 'Airway',
				description: null,
				category: null,
				mos: ['68W'],
				expiration_months: 12,
				sort_order: 1,
				archived_at: null,
				created_at: `${AS_OF}T00:00:00Z`
			},
			{
				id: 'task-2',
				organization_id: ctx.auth.orgId,
				task_code: 'ICT-2',
				title: 'IV validation',
				description: null,
				category: null,
				mos: ['68W'],
				expiration_months: 12,
				sort_order: 2,
				archived_at: null,
				created_at: `${AS_OF}T00:00:00Z`
			}
		]);
		ctx.store.seed('personnel_ict_completions', [
			{
				id: 'completion-1',
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-1',
				ict_task_id: 'task-1',
				completed_at: '2026-05-01',
				validation_method: 'Demonstration',
				validated_by: null,
				notes: null,
				logged_by: null,
				created_at: `${AS_OF}T00:00:00Z`
			}
		]);

		await expect(
			loadCriticalTasksReadinessLane({
				store: ctx.store,
				criticalTaskLibrary: ctx.criticalTaskLibrary,
				orgId: ctx.auth.orgId,
				personnelId: 'person-1',
				asOf: AS_OF,
				loadAuthorizedPerson: async () => {
					const person = await ctx.personnelCriticalTasksRoster.findForHistory(ctx.auth, 'person-1');
					if (!person) throw new Error('Missing fixture person');
					return person;
				}
			})
		).resolves.toMatchObject({
			label: 'Critical Tasks',
			value: '50%',
			detail: '1 of 2 applicable ICT tasks ready. 1 task needs attention.',
			tone: 'bad'
		});
	});

	it('uses plural grammar for multiple Critical Tasks that need attention', async () => {
		const ctx = createTestContext();
		seedPerson(ctx);
		ctx.store.seed('ict_tasks', [
			{
				id: 'task-1',
				organization_id: ctx.auth.orgId,
				task_code: 'ICT-1',
				title: 'Airway',
				description: null,
				category: null,
				mos: ['68W'],
				expiration_months: 12,
				sort_order: 1,
				archived_at: null,
				created_at: `${AS_OF}T00:00:00Z`
			},
			{
				id: 'task-2',
				organization_id: ctx.auth.orgId,
				task_code: 'ICT-2',
				title: 'IV validation',
				description: null,
				category: null,
				mos: ['68W'],
				expiration_months: 12,
				sort_order: 2,
				archived_at: null,
				created_at: `${AS_OF}T00:00:00Z`
			},
			{
				id: 'task-3',
				organization_id: ctx.auth.orgId,
				task_code: 'ICT-3',
				title: 'Radio report',
				description: null,
				category: null,
				mos: ['68W'],
				expiration_months: 12,
				sort_order: 3,
				archived_at: null,
				created_at: `${AS_OF}T00:00:00Z`
			}
		]);
		ctx.store.seed('personnel_ict_completions', [
			{
				id: 'completion-1',
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-1',
				ict_task_id: 'task-1',
				completed_at: '2026-05-01',
				validation_method: 'Demonstration',
				validated_by: null,
				notes: null,
				logged_by: null,
				created_at: `${AS_OF}T00:00:00Z`
			}
		]);

		await expect(
			loadCriticalTasksReadinessLane({
				store: ctx.store,
				criticalTaskLibrary: ctx.criticalTaskLibrary,
				orgId: ctx.auth.orgId,
				personnelId: 'person-1',
				asOf: AS_OF,
				loadAuthorizedPerson: async () => {
					const person = await ctx.personnelCriticalTasksRoster.findForHistory(ctx.auth, 'person-1');
					if (!person) throw new Error('Missing fixture person');
					return person;
				}
			})
		).resolves.toMatchObject({
			detail: '1 of 3 applicable ICT tasks ready. 2 tasks need attention.'
		});
	});

	it('counts expiring-soon Critical Tasks as ready for the Personnel lane', async () => {
		const ctx = createTestContext();
		seedPerson(ctx);
		ctx.store.seed('ict_tasks', [
			{
				id: 'task-1',
				organization_id: ctx.auth.orgId,
				task_code: 'ICT-1',
				title: 'Airway',
				description: null,
				category: null,
				mos: ['68W'],
				expiration_months: 12,
				sort_order: 1,
				archived_at: null,
				created_at: `${AS_OF}T00:00:00Z`
			}
		]);
		ctx.store.seed('personnel_ict_completions', [
			{
				id: 'completion-1',
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-1',
				ict_task_id: 'task-1',
				completed_at: '2025-06-01',
				validation_method: 'Demonstration',
				validated_by: null,
				notes: null,
				logged_by: null,
				created_at: '2025-06-01T00:00:00Z'
			}
		]);

		await expect(
			loadCriticalTasksReadinessLane({
				store: ctx.store,
				criticalTaskLibrary: ctx.criticalTaskLibrary,
				orgId: ctx.auth.orgId,
				personnelId: 'person-1',
				asOf: AS_OF,
				loadAuthorizedPerson: async () => {
					const person = await ctx.personnelCriticalTasksRoster.findForHistory(ctx.auth, 'person-1');
					if (!person) throw new Error('Missing fixture person');
					return person;
				}
			})
		).resolves.toMatchObject({
			label: 'Critical Tasks',
			value: '100%',
			detail: '1 of 1 applicable ICT tasks ready. 1 task expiring soon. No tasks need attention.',
			tone: 'watch'
		});
	});
});
