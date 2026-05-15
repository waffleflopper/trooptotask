import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _getConfig, _postConfig } from './+server';

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);

function seedPersonnel(ctx: ReturnType<typeof createTestContext>) {
	ctx.store.seed('personnel', [{ id: 'person-1', organization_id: ctx.auth.orgId, group_id: null }]);
}

describe('/api/personnel/[id]/documents', () => {
	it('creates and lists personnel documents through API configs', async () => {
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
			title: 'BLS Card',
			file: new File([PDF_BYTES], 'bls.pdf', { type: 'application/pdf' })
		});
		const records = await handleUseCaseRequest(_getConfig, ctx, { personnelId: 'person-1' });

		expect(created.title).toBe('BLS Card');
		expect(records).toHaveLength(1);
	});

	it('derives the Personnel id from the route param for form submissions', async () => {
		const formData = new FormData();
		formData.set('title', 'Inspection Worksheet');
		formData.set('file', new File([PDF_BYTES], 'inspection.pdf', { type: 'application/pdf' }));

		await expect(
			_postConfig.parseInput?.({
				params: { id: 'person-1' },
				request: new Request('http://localhost', { method: 'POST', body: formData })
			} as never)
		).resolves.toMatchObject({
			personnelId: 'person-1',
			title: 'Inspection Worksheet'
		});
	});
});
