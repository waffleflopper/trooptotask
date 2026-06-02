import { describe, it, expect } from 'vitest';
import { SpecialDayEntity } from '$lib/server/entities/specialDay';
import { entityHandlers, handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';

function requireConfig<T>(config: T | undefined, label: string): T {
	expect(config).toBeDefined();
	if (!config) {
		throw new Error(`${label} config missing`);
	}
	return config;
}

describe('handle() + entity pipeline integration', () => {
	it('entityHandlers create inserts via entity schema through handle pipeline', async () => {
		const handlers = entityHandlers(SpecialDayEntity);
		const ctx = createTestContext();
		const config = requireConfig(handlers._configs.POST, 'POST');

		const result = (await handleUseCaseRequest(config, ctx, {
			date: '2026-12-25',
			name: 'Christmas',
			type: 'federal-holiday'
		})) as Record<string, unknown>;

		expect(result).toMatchObject({ date: '2026-12-25', name: 'Christmas', type: 'federal-holiday' });

		const stored = await ctx.store.findMany('special_days', 'test-org');
		expect(stored).toHaveLength(1);
	});

	it('handle pipeline authorizes SpecialDay mutations through policy decisions before entity operations', async () => {
		const handlers = entityHandlers(SpecialDayEntity);
		const ctx = createTestContext({
			auth: {
				capabilityMap: {
					calendar: 'operate',
					personnel: 'configure',
					training: 'configure',
					criticalTasks: 'configure',
					onboarding: 'configure',
					ratingScheme: 'configure'
				},
				requireEdit() {
					throw new Error('legacy edit flag should not decide SpecialDay mutations');
				}
			}
		});

		const config = requireConfig(handlers._configs.POST, 'POST');

		await expect(
			handleUseCaseRequest(config, ctx, { date: '2026-12-25', name: 'X', type: 'federal-holiday' })
		).rejects.toMatchObject({
			status: 403,
			message:
				"You don't have permission. This requires Calendar can manage permissions. Talk to your organization owner or admin."
		});

		expect(ctx.auditPort.events[0]).toMatchObject({
			action: 'policy.denied',
			resourceType: 'calendar.configureSpecialDays',
			details: {
				policyAction: 'calendar.configureSpecialDays',
				reasonCode: 'denied:missing-capability'
			}
		});

		const stored = await ctx.store.findMany('special_days', 'test-org');
		expect(stored).toHaveLength(0);
	});

	it('handle pipeline blocks mutations when read-only before entity operations', async () => {
		const handlers = entityHandlers(SpecialDayEntity);
		const ctx = createTestContext({ readOnly: true });
		const config = requireConfig(handlers._configs.POST, 'POST');

		await expect(
			handleUseCaseRequest(config, ctx, { date: '2026-12-25', name: 'X', type: 'federal-holiday' })
		).rejects.toMatchObject({ status: 403 });
	});

	it('entityHandlers can pass policy actions into entity CRUD use cases', async () => {
		const handlers = entityHandlers(SpecialDayEntity, {
			policyAction: POLICY_ACTION_CATALOG.training.configureRequirements
		});
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'configure',
					personnel: 'none',
					training: 'operate',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});
		const config = requireConfig(handlers._configs.POST, 'POST');

		await expect(
			handleUseCaseRequest(config, ctx, { date: '2026-12-25', name: 'X', type: 'federal-holiday' })
		).rejects.toMatchObject({ status: 403 });
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({
				action: 'policy.denied',
				details: expect.objectContaining({
					policyAction: 'training.configureRequirements',
					reasonCode: 'denied:missing-capability'
				})
			})
		);
	});
});
