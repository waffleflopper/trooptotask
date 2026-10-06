import { describe, expect, it } from 'vitest';
import {
	createPersonnelIctCompletion,
	updatePersonnelIctCompletion,
	preparePersonnelIctCompletionDeletion
} from './personnelIctCompletionOperations.server';
import type { PersonnelIctCompletionWriteContext } from './personnelIctCompletionPorts.server';
import { createTestContext } from './criticalTaskLibrary.test-support.server';

function completionContext(ctx: ReturnType<typeof createTestContext>): PersonnelIctCompletionWriteContext {
	return {
		auth: ctx.auth,
		audit: ctx.audit,
		store: ctx.store,
		criticalTaskLibrary: ctx.criticalTaskLibrary,
		personnelCriticalTasksRoster: ctx.personnelCriticalTasksRoster
	};
}

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
			createPersonnelIctCompletion(completionContext(ctx), {
				personnelId: 'person-1',
				ictTaskId: 'task-1',
				completedAt: '2026-04-01',
				validationMethod: 'Lecture'
			})
		).rejects.toMatchObject({ status: 403 });
		await expect(
			updatePersonnelIctCompletion(completionContext(ctx), { id: 'completion-1', notes: null })
		).rejects.toMatchObject({
			status: 403
		});
		await expect(preparePersonnelIctCompletionDeletion(completionContext(ctx), 'completion-1')).rejects.toMatchObject({
			status: 403
		});

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

		ctx.store.seed('ict_tasks', [{ id: 'task-1', organization_id: 'test-org', archived_at: null }]);

		const created = await createPersonnelIctCompletion(completionContext(ctx), {
			personnelId: 'person-inside',
			ictTaskId: 'task-1',
			completedAt: '2026-04-01',
			validationMethod: 'Practical Exercise'
		});

		expect(created.personnelId).toBe('person-inside');

		await expect(
			createPersonnelIctCompletion(completionContext(ctx), {
				personnelId: 'person-outside',
				ictTaskId: 'task-1',
				completedAt: '2026-04-01',
				validationMethod: 'Lecture'
			})
		).rejects.toMatchObject({ status: 403 });

		await updatePersonnelIctCompletion(completionContext(ctx), {
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
			updatePersonnelIctCompletion(completionContext(ctx), {
				id: outsideId,
				notes: 'Unauthorized update'
			})
		).rejects.toMatchObject({ status: 403 });
	});

	it('retains separate dated captures and clears nullable details without changing their identities', async () => {
		const ctx = createTestContext();
		ctx.store.seed('personnel', [{ id: 'person-1', organization_id: 'test-org', group_id: null, archived_at: null }]);
		ctx.store.seed('ict_tasks', [{ id: 'task-1', organization_id: 'test-org', archived_at: null }]);
		const operationCtx = completionContext(ctx);
		const first = await createPersonnelIctCompletion(operationCtx, {
			personnelId: 'person-1',
			ictTaskId: 'task-1',
			completedAt: '2026-04-01',
			validationMethod: 'Lecture',
			validatedBy: 'Synthetic validator',
			notes: 'First capture',
			id: 'caller-controlled-id',
			loggedBy: 'caller-controlled-user',
			createdAt: '2099-01-01T00:00:00Z'
		});
		const second = await createPersonnelIctCompletion(operationCtx, {
			personnelId: 'person-1',
			ictTaskId: 'task-1',
			completedAt: '2026-04-02',
			validationMethod: 'Demonstration',
			notes: 'Second capture'
		});
		expect(first.id).not.toBe('caller-controlled-id');
		expect(first.loggedBy).not.toBe('caller-controlled-user');
		expect(first.createdAt).not.toBe('2099-01-01T00:00:00Z');
		expect(second.id).not.toBe(first.id);
		await ctx.store.update('personnel_ict_completions', 'test-org', first.id, {
			logged_by: 'synthetic-recorder',
			created_at: '2026-04-01T12:00:00Z'
		});

		const corrected = await updatePersonnelIctCompletion(operationCtx, {
			id: first.id,
			notes: null,
			validatedBy: null,
			loggedBy: 'replacement-user',
			createdAt: '2099-02-01T00:00:00Z'
		});
		expect(corrected).toMatchObject({
			id: first.id,
			personnelId: 'person-1',
			ictTaskId: 'task-1',
			completedAt: '2026-04-01',
			validationMethod: 'Lecture',
			validatedBy: null,
			notes: null,
			loggedBy: 'synthetic-recorder',
			createdAt: '2026-04-01T12:00:00Z'
		});
		expect(await ctx.store.findMany('personnel_ict_completions', 'test-org')).toEqual([
			expect.objectContaining({
				id: first.id,
				completed_at: '2026-04-01',
				validation_method: 'Lecture',
				validated_by: null,
				notes: null
			}),
			expect.objectContaining({
				id: second.id,
				completed_at: '2026-04-02',
				validation_method: 'Demonstration',
				notes: 'Second capture'
			})
		]);
	});

	it('rejects invalid completion values before writing or reporting a successful mutation', async () => {
		const ctx = createTestContext();
		ctx.store.seed('personnel', [{ id: 'person-1', organization_id: 'test-org', group_id: null, archived_at: null }]);
		ctx.store.seed('ict_tasks', [{ id: 'task-1', organization_id: 'test-org', archived_at: null }]);
		await expect(
			createPersonnelIctCompletion(completionContext(ctx), {
				personnelId: 'person-1',
				ictTaskId: 'task-1',
				completedAt: '2026-04-01',
				validationMethod: 'Not a validation method'
			})
		).rejects.toMatchObject({ status: 400 });
		expect(await ctx.store.findMany('personnel_ict_completions', 'test-org')).toEqual([]);
		expect(ctx.auditPort.events).toEqual([]);
	});
});
