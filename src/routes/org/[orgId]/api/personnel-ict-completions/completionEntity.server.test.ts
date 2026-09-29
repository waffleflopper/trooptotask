import { describe, expect, it } from 'vitest';
import { PersonnelIctCompletionEntity } from '$features/critical-tasks/index.server';
import type { PersonnelIctCompletion } from '$features/critical-tasks/contracts';
import { entityHandlers, handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { createTestContext } from '$lib/server/adapters/inMemory';

const completionHandlers = entityHandlers(PersonnelIctCompletionEntity, {
	policyResourceForPersonnel: async (ctx, personnelId) => {
		const person = await ctx.personnelCriticalTasksRoster.findForCompletionWrite(ctx.auth, personnelId);
		return person?.groupId ? { kind: 'group', groupId: person.groupId } : { kind: 'organization' };
	}
});

describe('Critical Tasks completion policy boundary', () => {
	it('rejects completion writes when the user lacks Critical Tasks operate capability', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'configure',
					criticalTasks: 'view',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});

		await expect(
			handleUseCaseRequest(completionHandlers._configs.POST!, ctx, {
				personnelId: 'person-1',
				ictTaskId: 'task-1',
				completedAt: '2026-04-01',
				validationMethod: 'Lecture'
			})
		).rejects.toMatchObject({ status: 403 });

		const stored = await ctx.store.findMany('personnel_ict_completions', 'test-org');
		expect(stored).toHaveLength(0);
	});

	it('enforces scoped-group access for create and update writes', async () => {
		const outsideId = '22222222-2222-4222-8222-222222222222';
		const ctx = createTestContext({
			auth: {
				scopeSet: { kind: 'groups', groupIds: ['group-1'] },
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'operate',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});
		ctx.store.seed('personnel', [
			{ id: 'person-inside', organization_id: 'test-org', group_id: 'group-1' },
			{ id: 'person-outside', organization_id: 'test-org', group_id: 'group-2' }
		]);

		const created = (await handleUseCaseRequest(completionHandlers._configs.POST!, ctx, {
			personnelId: 'person-inside',
			ictTaskId: 'task-1',
			completedAt: '2026-04-01',
			validationMethod: 'Practical Exercise'
		})) as PersonnelIctCompletion;

		expect(created.personnelId).toBe('person-inside');

		await expect(
			handleUseCaseRequest(completionHandlers._configs.POST!, ctx, {
				personnelId: 'person-outside',
				ictTaskId: 'task-1',
				completedAt: '2026-04-01',
				validationMethod: 'Lecture'
			})
		).rejects.toMatchObject({ status: 403 });

		await handleUseCaseRequest(completionHandlers._configs.PUT!, ctx, {
			id: created.id,
			notes: 'Corrected entry'
		});

		await ctx.rawStore.insert('personnel_ict_completions', 'test-org', {
			id: outsideId,
			personnel_id: 'person-outside',
			ict_task_id: 'task-1',
			completed_at: '2026-04-01',
			validation_method: 'Lecture',
			validated_by: null,
			notes: null,
			logged_by: null,
			created_at: '2026-04-01T12:00:00Z'
		});

		await expect(
			handleUseCaseRequest(completionHandlers._configs.PUT!, ctx, {
				id: outsideId,
				notes: 'Unauthorized update'
			})
		).rejects.toMatchObject({ status: 403 });
	});
});
