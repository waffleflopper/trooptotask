import { groupCoverageForTest } from '$lib/access/test-support/groupCoverage';
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
			config: Parameters<typeof handleUseCaseRequest>[0]
		) => handleUseCaseRequest(config, state.ctx!, undefined, () => state.ctx!)
	};
});
import { load } from './+page.server';

function event() {
	return {
		params: { orgId: 'org-a' },
		locals: { session: { user: { id: 'user-a' } } },
		cookies: {},
		depends: vi.fn()
	};
}

describe('Onboarding templates page admission', () => {
	it.each([{ groups: ['group-a'] }, { groups: [] }])('rejects Group-scoped configurators (%j)', async ({ groups }) => {
		state.ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: { ...createCapabilityMap('none'), onboarding: 'configure' },
				scopeSet: groupCoverageForTest({ kind: 'groups', groupIds: groups })
			}
		});
		await expect(load(event() as never)).rejects.toMatchObject({ status: 403 });
	});
	it.each(['view', 'operate'] as const)('rejects Organization-scoped %s users', async (onboarding) => {
		state.ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: { ...createCapabilityMap('none'), onboarding },
				scopeSet: { kind: 'organization' }
			}
		});
		await expect(load(event() as never)).rejects.toMatchObject({ status: 403 });
	});
	it.each(['owner', 'admin', 'member'] as const)(
		'admits an authorized %s and depends on Organization refresh',
		async (role) => {
			state.ctx = createTestContext({
				auth: {
					role,
					isPrivileged: role !== 'member',
					capabilityMap: { ...createCapabilityMap('none'), onboarding: 'configure' },
					scopeSet: { kind: 'organization' }
				}
			});
			const request = event();

			await expect(load(request as never)).resolves.toMatchObject({ orgId: 'org-a', activePacketCounts: {} });
			expect(request.depends).toHaveBeenCalledWith('app:org-core');
		}
	);
	it('counts in-progress packets for each template without loading the packets', async () => {
		state.ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: { ...createCapabilityMap('none'), onboarding: 'configure' },
				scopeSet: { kind: 'organization' }
			}
		});
		const orgId = state.ctx.auth.orgId;
		state.ctx.store.seed('onboarding_templates', [
			{ id: 'tmpl-1', name: 'Standard', organization_id: orgId },
			{ id: 'tmpl-2', name: 'Officer', organization_id: orgId }
		]);
		state.ctx.store.seed('personnel_onboardings', [
			{ id: 'p1', template_id: 'tmpl-1', status: 'in_progress', organization_id: orgId },
			{ id: 'p2', template_id: 'tmpl-1', status: 'in_progress', organization_id: orgId },
			{ id: 'p3', template_id: 'tmpl-1', status: 'completed', organization_id: orgId }
		]);

		await expect(load(event() as never)).resolves.toMatchObject({
			activePacketCounts: { 'tmpl-1': 2, 'tmpl-2': 0 }
		});
	});
});
