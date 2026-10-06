import { describe, expect, it } from 'vitest';
import { createInMemoryCriticalTaskLibraryPersistence } from '$features/critical-tasks/server/inMemoryCriticalTaskLibrary.server';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { _postConfig, _putConfig } from './+server';

describe('ICT task JSON handlers', () => {
	it('audits task library create and soft-archive updates through the public JSON handlers', async () => {
		const ctx = createTestContext({ criticalTaskLibraryFactory: createInMemoryCriticalTaskLibraryPersistence });

		const created = (await handleUseCaseRequest(
			_postConfig,
			ctx,
			{
				taskCode: '181-105-1001',
				title: 'Perform tactical combat casualty care',
				description: 'Aid under fire',
				category: 'Casualty Care',
				mos: ['68W'],
				expirationMonths: 12,
				sortOrder: 0
			},
			() => ctx
		)) as { id: string; category: string | null };

		expect(created.category).toBe('Casualty Care');

		await handleUseCaseRequest(
			_putConfig,
			ctx,
			{
				id: created.id,
				archivedAt: '2026-04-15T12:00:00Z'
			},
			() => ctx
		);

		expect(ctx.auditPort.events).toEqual([
			expect.objectContaining({
				action: 'ict_task.created',
				resourceType: 'ict_task',
				resourceId: created.id
			}),
			expect.objectContaining({
				action: 'ict_task.updated',
				resourceType: 'ict_task',
				resourceId: created.id
			})
		]);
	});
});
