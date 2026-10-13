import { describe, expect, it, vi } from 'vitest';
import { createCapabilityMap } from '$lib/access/memberAccessShape';
import { createTestContext } from '$features/onboarding/server/onboardingPersistence.test-support.server';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';

const state = vi.hoisted(() => ({ ctx: null as ReturnType<typeof createTestContext> | null }));
vi.mock('$lib/server/adapters/httpAdapter', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/server/adapters/httpAdapter')>();
	return {
		...actual,
		loadWithContext: (
			_locals: unknown,
			_cookies: unknown,
			_orgId: string,
			config: Parameters<typeof handleUseCaseRequest>[0] & { defer?: boolean }
		) => {
			const data = handleUseCaseRequest(config, state.ctx!, undefined, () => state.ctx!);
			return config.defer ? { data } : data;
		}
	};
});
import { load } from './+page.server';

describe('Onboarding History page load', () => {
	it('loads only closed packets and re-runs with Organization and Onboarding refreshes', async () => {
		state.ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: { ...createCapabilityMap('none'), onboarding: 'view' },
				scopeSet: { kind: 'organization' }
			}
		});
		const orgId = state.ctx.auth.orgId;
		state.ctx.store.seed('personnel_onboardings', [
			{
				id: 'closed',
				organization_id: orgId,
				personnel_id: 'p-1',
				status: 'completed',
				started_at: '2026-01-01',
				completed_at: '2026-01-10'
			},
			{ id: 'open', organization_id: orgId, personnel_id: 'p-1', status: 'in_progress', started_at: '2026-02-01' }
		]);
		const depends = vi.fn();

		const result = (await load({
			params: { orgId: 'org-a' },
			locals: { session: null },
			cookies: {},
			depends
		} as never)) as unknown as {
			history: { data: Promise<{ onboardings: Array<{ id: string }>; archiveRetentionMonths: number | null }> };
		};
		const history = await result.history.data;

		expect(history.onboardings.map((o) => o.id)).toEqual(['closed']);
		expect(history.archiveRetentionMonths).toBe(36);
		expect(depends).toHaveBeenCalledWith('app:org-core', 'app:onboarding-data');
	});

	it('hands the page a promise that rejects, instead of failing the load, when the member may not view Onboarding', async () => {
		state.ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: createCapabilityMap('none'),
				scopeSet: { kind: 'organization' }
			}
		});

		const result = (await load({
			params: { orgId: 'org-a' },
			locals: { session: null },
			cookies: {},
			depends: vi.fn()
		} as never)) as unknown as { history: { data: Promise<unknown> } };

		await expect(result.history.data).rejects.toMatchObject({ status: 403 });
	});
});
