import { describe, it, expect, vi } from 'vitest';
import {
	createRequestOnboardingTemplateStepContext,
	createRequestOnboardingWorkspaceContext,
	createRequestOnboardingStepProgressContext
} from '$lib/server/adapters/featureRequestContexts.server';
import {
	createRequestGettingStartedContext,
	createRequestDashboardWorkspaceContext
} from '$lib/server/adapters/requestContexts.server';
import { createTestContext } from '$features/onboarding/server/onboardingPersistence.test-support.server';
import { onboardingProvider } from '$features/onboarding/server/test-support/onboardingProvider.server';
import { handleUseCaseRequest, rethrowOrWrap } from '$lib/server/adapters/httpAdapter';
import { _postConfig } from '../../../routes/org/[orgId]/api/onboarding-templates/+server';
import { afterEach } from 'vitest';
afterEach(() => vi.restoreAllMocks());
const TIME = '2026-10-07T12:00:00.123456Z';
function request() {
	const ctx = createTestContext({ auth: { orgId: 'canonical-org' } });
	const provider = onboardingProvider({
		onboarding_templates: [
			{ id: 'template', organization_id: 'canonical-org', name: 'Arrival', description: null, created_at: null }
		],
		personnel_onboardings: [
			{
				id: 'packet',
				organization_id: 'canonical-org',
				personnel_id: 'person',
				started_at: '2026-03-01',
				status: 'in_progress'
			}
		],
		onboarding_step_progress: [
			{
				id: 'progress',
				organization_id: 'canonical-org',
				onboarding_id: 'packet',
				step_name: 'Orientation',
				step_type: 'checkbox',
				sort_order: 0,
				completed: false
			}
		]
	});
	return { ...provider, request: { ...ctx, audit: ctx.auditPort, supabase: provider.client, session: null } };
}
describe('captured Onboarding request authority', () => {
	it('shares admitted canonical ordinary credentials across configure, workspace, progress, Dashboard and setup', async () => {
		const { request: admitted, state } = request();
		admitted.store.findMany = async () => {
			throw new Error('Generic ordinary reads are unavailable');
		};
		admitted.rawStore.findOne = async () => {
			throw new Error('Generic resource reads are unavailable');
		};
		const configure = createRequestOnboardingTemplateStepContext(admitted);
		const workspace = createRequestOnboardingWorkspaceContext(admitted);
		const progress = createRequestOnboardingStepProgressContext(admitted);
		const dashboard = createRequestDashboardWorkspaceContext(admitted);
		const setup = createRequestGettingStartedContext(admitted);
		expect(await configure.onboardingCatalog.createTemplate({ name: 'Saved', description: null })).toEqual({
			id: 'saved-1',
			orgId: 'canonical-org',
			name: 'Saved',
			description: null,
			createdAt: TIME
		});
		expect((await workspace.onboardingWorkflow.listPackets('active')).map((row) => row.id)).toEqual(['packet']);
		expect(await progress.onboardingWorkflow.saveCheckboxCompletion('progress', true)).toEqual({
			id: 'progress',
			onboardingId: 'packet',
			stepName: 'Orientation',
			stepType: 'checkbox',
			completed: true,
			currentStage: null
		});
		expect((await dashboard.onboardingWorkflow.listSavedActivePackets())[0].steps[0].completed).toBe(true);
		expect(await setup.onboardingCatalog.countEstimatedSteps()).toBe(0);
		expect(
			state.requests.every((row) =>
				row.method === 'POST'
					? row.body &&
						typeof row.body === 'object' &&
						'organization_id' in row.body &&
						row.body.organization_id === 'canonical-org'
					: row.url.searchParams.get('organization_id') === 'eq.canonical-org'
			)
		).toBe(true);
	});
	it('keeps provider status-shaped errors untrusted at the catalog route while retained business state survives', async () => {
		const { request: admitted, state } = request();
		state.failure = () => ({ code: '42501', message: 'Private provider detail', status: 403 });
		vi.spyOn(console, 'error').mockImplementation(() => {});
		await expect(
			(async () => {
				try {
					return await handleUseCaseRequest(_postConfig, admitted, { name: 'Arrival', description: null }, () =>
						createRequestOnboardingTemplateStepContext(admitted)
					);
				} catch (cause) {
					rethrowOrWrap(cause);
				}
			})()
		).rejects.toMatchObject({ status: 500, body: { message: 'Internal server error' } });
		expect(state.rows.onboarding_templates).toEqual([
			{ id: 'template', organization_id: 'canonical-org', name: 'Arrival', description: null, created_at: null }
		]);
		expect(admitted.audit.events).toEqual([]);
	});
});
