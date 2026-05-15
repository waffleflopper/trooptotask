import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _getConfig, _postConfig } from './+server';

function seedPersonnel(ctx: ReturnType<typeof createTestContext>) {
	ctx.store.seed('personnel', [{ id: 'person-1', organization_id: ctx.auth.orgId, group_id: null }]);
}

describe('/api/personnel/[id]/counseling-records', () => {
	it('creates and lists counseling uploads through API configs', async () => {
		const ctx = createTestContext({
			auth: {
				capabilityMap: {
					calendar: 'view',
					personnel: 'operate',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			}
		});
		seedPersonnel(ctx);

		const created = await handleUseCaseRequest(_postConfig, ctx, {
			personnelId: 'person-1',
			dateConducted: '2026-05-01',
			title: 'Event-oriented counseling',
			summary: '',
			file: new File(['%PDF-1.7\napi upload'], 'event.pdf', { type: 'application/pdf' })
		});
		const records = await handleUseCaseRequest(_getConfig, ctx, { personnelId: 'person-1' });

		expect(created.title).toBe('Event-oriented counseling');
		expect(records).toHaveLength(1);
	});

	it('derives the Personnel id from the route param for form submissions', async () => {
		const formData = new FormData();
		formData.set('dateConducted', '2026-05-01');
		formData.set('title', 'Route id counseling');
		formData.set('summary', 'Short summary');
		formData.set('file', new File(['%PDF-1.7\nroute upload'], 'route.pdf', { type: 'application/pdf' }));

		await expect(
			_postConfig.parseInput?.({
				params: { id: 'person-1' },
				request: new Request('http://localhost', { method: 'POST', body: formData })
			} as never)
		).resolves.toMatchObject({
			personnelId: 'person-1',
			title: 'Route id counseling',
			summary: 'Short summary'
		});
	});
});
