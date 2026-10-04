import { describe, expect, it, vi } from 'vitest';
import { createCapabilityMap } from '$lib/access/memberAccessShape';
import { createTestContext } from '$lib/server/adapters/inMemory';
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
	const templates = [{ id: 'template-a', name: 'A configuration' }];
	const steps = [{ id: 'step-a', templateId: 'template-a' }];
	return {
		params: { orgId: 'org-a' },
		locals: { session: { user: { id: 'user-a' } } },
		cookies: {},
		parent: vi.fn(async () => ({
			onboarding: {
				data: Promise.resolve({
					data: {
						onboardingTemplates: templates,
						onboardingTemplateSteps: steps,
						trainingTypes: [{ id: 'training-a', name: 'CPR' }]
					}
				})
			}
		}))
	};
}

describe('Onboarding templates page admission', () => {
	it.each([{ groups: ['group-a'] }, { groups: [] }])(
		'rejects Group-scoped configurators (%j) before consuming the workspace',
		async ({ groups }) => {
			state.ctx = createTestContext({
				auth: {
					role: 'member',
					isPrivileged: false,
					capabilityMap: { ...createCapabilityMap('none'), onboarding: 'configure' },
					scopeSet: { kind: 'groups', groupIds: groups }
				}
			});
			const request = event();
			await expect(load(request as never)).rejects.toMatchObject({ status: 403 });
			expect(request.parent).not.toHaveBeenCalled();
		}
	);
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
		'uses the already loaded owned configuration for an authorized %s',
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
			await expect(load(request as never)).resolves.toMatchObject({
				templates: [{ id: 'template-a', name: 'A configuration' }],
				templateSteps: [{ id: 'step-a', templateId: 'template-a' }],
				trainingTypes: [{ id: 'training-a', name: 'CPR' }]
			});
		}
	);
});
