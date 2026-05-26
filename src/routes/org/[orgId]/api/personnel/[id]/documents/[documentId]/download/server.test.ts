import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { createPersonnelDocument } from '$lib/server/core/useCases/personnelDocuments';
import { _getConfig } from './+server';

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);

function seedPersonnel(ctx: ReturnType<typeof createTestContext>) {
	ctx.store.seed('personnel', [{ id: 'person-1', organization_id: ctx.auth.orgId, group_id: null }]);
}

describe('/api/personnel/[id]/documents/[documentId]/download', () => {
	it('returns a signed URL for a scoped personnel document', async () => {
		const ctx = createTestContext({
			auth: {
				capabilityMap: {
					calendar: 'view',
					personnel: 'configure',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			}
		});
		seedPersonnel(ctx);
		const created = await createPersonnelDocument(ctx, {
			personnelId: 'person-1',
			file: new File([PDF_BYTES], 'download.pdf', { type: 'application/pdf' })
		});

		const result = await handleUseCaseRequest(_getConfig, ctx, {
			personnelId: 'person-1',
			documentId: created.id
		});

		expect(result.url).toContain('/personnel-documents/');
		expect(result.url).toContain('expires=300');
	});
});
