import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _getConfig } from './+server';

describe('GET /api/getting-started', () => {
	it('exports a privileged RouteConfig', () => {
		expect(_getConfig.permission).toBe('privileged');
	});

	it('returns workspace support metadata and logs timing', async () => {
		const ctx = createTestContext();
		const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

		ctx.store.seed('onboarding_template_steps', [
			{ id: 'step-1', organization_id: ctx.auth.orgId, title: 'Step 1' },
			{ id: 'step-2', organization_id: ctx.auth.orgId, title: 'Step 2' }
		]);
		ctx.store.seed('rating_scheme_entries', [
			{ id: 'rating-1', organization_id: ctx.auth.orgId, rated_person_id: 'p1', rating_period_end: '2026-01-01' }
		]);
		ctx.store.seed('organization_memberships', [
			{ id: 'member-1', organization_id: ctx.auth.orgId, user_id: ctx.auth.userId, role: 'owner' },
			{ id: 'member-2', organization_id: ctx.auth.orgId, user_id: 'user-2', role: 'member' }
		]);
		ctx.store.seed('getting_started_progress', [
			{
				id: 'progress-1',
				organization_id: ctx.auth.orgId,
				user_id: ctx.auth.userId,
				dismissed_at: '2026-04-10T00:00:00Z'
			}
		]);

		const result = await handleUseCaseRequest(_getConfig, ctx, undefined);

		expect(result).toEqual({
			onboardingTemplateStepCount: 2,
			ratingSchemeEntryCount: 1,
			orgMemberCount: 2,
			gettingStartedDismissed: true
		});
		expect(consoleInfoSpy).toHaveBeenCalledWith(
			'[dashboard-load]',
			expect.objectContaining({
				orgId: ctx.auth.orgId,
				phase: 'support',
				status: 'ok',
				durationMs: expect.any(Number)
			})
		);
	});
});
