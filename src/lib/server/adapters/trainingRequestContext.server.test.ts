import { describe, expect, it, vi } from 'vitest';
import { trainingProvider } from '$features/training/server/test-support/trainingProvider.server';
import { createTestContext } from '$features/training/server/trainingPersistence.test-support.server';
import {
	createRequestTrainingCatalogContext,
	createRequestTrainingRosterContext,
	createRequestTrainingBriefingContext
} from './featureRequestContexts.server';
import type { AdmittedOrganizationRequest } from './requestContexts.server';

const { getAdminClient } = vi.hoisted(() => ({
	getAdminClient: vi.fn(() => {
		throw new Error('Admin acquisition forbidden');
	})
}));
vi.mock('$lib/server/supabase', () => ({ getAdminClient }));

describe('Training request authority', () => {
	it('binds ordinary catalog and completion methods to the admitted client and canonical Organization without generic-store or privileged fallback', async () => {
		const ctx = createTestContext({ auth: { orgId: 'org-a' } });
		const { client } = trainingProvider({
			training_types: [
				{ id: 'a', organization_id: 'org-a', name: 'A' },
				{ id: 'b', organization_id: 'org-b', name: 'B' }
			],
			personnel_trainings: [
				{ id: 'r-a', organization_id: 'org-a', personnel_id: 'p-a', training_type_id: 'a' },
				{ id: 'r-b', organization_id: 'org-b', personnel_id: 'p-b', training_type_id: 'b' }
			]
		});
		const request = {
			...ctx,
			auth: { ...ctx.auth },
			supabase: client,
			session: null
		} satisfies AdmittedOrganizationRequest;
		const catalog = createRequestTrainingCatalogContext(request);
		const roster = createRequestTrainingRosterContext(request);
		const reports = createRequestTrainingBriefingContext(request);
		request.auth.orgId = 'org-b';
		expect(await catalog.trainingCatalog.listTypeLabels()).toEqual([{ id: 'a', name: 'A' }]);
		expect(await roster.trainingCompletions.listCompletions()).toEqual([
			{ id: 'r-a', organization_id: 'org-a', personnelId: 'p-a', trainingTypeId: 'a' }
		]);
		expect(await reports.trainingCatalog.listTypes()).toEqual([{ id: 'a', name: 'A', organization_id: 'org-a' }]);
		expect(getAdminClient).not.toHaveBeenCalled();
	});
});
