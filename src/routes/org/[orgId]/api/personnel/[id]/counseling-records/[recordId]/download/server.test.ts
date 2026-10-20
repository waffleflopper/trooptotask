import { createPersonnelArtifactDeliveryContext } from '$lib/server/adapters/requestContexts.server';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { createPersonnelCounselingRecord } from '$features/personnel/index.server';
import { _getConfig } from './+server';

const PERSON_ID = '00000000-0000-4000-8000-0000000000a1';

function contextWith(personnel: 'configure' | 'operate') {
	const ctx = createTestContext({
		auth: {
			capabilityMap: {
				calendar: 'view',
				personnel,
				training: 'view',
				criticalTasks: 'view',
				onboarding: 'view',
				ratingScheme: 'view'
			},
			scopeSet: { kind: 'organization' }
		}
	});
	ctx.store.seed('personnel', [{ id: PERSON_ID, organization_id: ctx.auth.orgId, group_id: null }]);
	return ctx;
}

async function uploadCounseling(ctx: ReturnType<typeof createTestContext>) {
	return createPersonnelCounselingRecord(createPersonnelArtifactDeliveryContext(ctx), {
		personnelId: PERSON_ID,
		dateConducted: '2026-10-02',
		title: 'Monthly counseling',
		file: new File(['%PDF-1.7\nsigned'], 'monthly.pdf', { type: 'application/pdf' })
	});
}

describe('/api/personnel/[id]/counseling-records/[recordId]/download', () => {
	it('returns a short-lived signed URL for the counseling PDF', async () => {
		const ctx = contextWith('configure');
		const created = await uploadCounseling(ctx);

		const result = await handleUseCaseRequest(_getConfig, ctx, { personnelId: PERSON_ID, recordId: created.id }, () =>
			createPersonnelArtifactDeliveryContext(ctx)
		);

		expect(result.url).toContain('/counseling-files/');
		expect(result.url).toContain('expires=300');
	});

	it('answers a segment that is not a record id like a missing record', async () => {
		await expect(
			_getConfig.parseInput?.({ params: { id: PERSON_ID, recordId: 'not-a-uuid' } } as never)
		).rejects.toMatchObject({ status: 404 });
	});

	it('refuses a Personnel operator, who may upload but not read counselings', async () => {
		const ctx = contextWith('operate');
		const created = await uploadCounseling(ctx);

		await expect(
			handleUseCaseRequest(_getConfig, ctx, { personnelId: PERSON_ID, recordId: created.id }, () =>
				createPersonnelArtifactDeliveryContext(ctx)
			)
		).rejects.toMatchObject({ status: 403 });
	});
});
