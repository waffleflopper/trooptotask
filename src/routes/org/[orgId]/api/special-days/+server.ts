import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { SpecialDayEntity } from '$lib/server/entities/specialDay';
import { createResetFederalHolidaysUseCase } from '$lib/server/core/useCases/specialDayCrud';
import { createCrudUseCases } from '$lib/server/core/useCases/crud';
import { fail } from '$lib/server/core/errors';
import { validateUUID } from '$lib/server/validation';

const specialDayUseCases = createCrudUseCases({
	entity: SpecialDayEntity,
	auditResource: 'special_day',
	policyAction: POLICY_ACTION_CATALOG.calendar.configureSpecialDays
});

const resetFederalHolidays = createResetFederalHolidaysUseCase();

export const _postConfig = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.configureSpecialDays,
	policyResource: { kind: 'organization' },
	fn: async (ctx, input) => {
		if (input.action === 'resetFederalHolidays') {
			return resetFederalHolidays(ctx);
		}
		return specialDayUseCases.create(ctx, input);
	}
} satisfies RouteConfig<Record<string, unknown>, unknown>;

export const _putConfig = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.configureSpecialDays,
	policyResource: { kind: 'organization' },
	fn: (ctx, input) => specialDayUseCases.update(ctx, input)
} satisfies RouteConfig<Record<string, unknown>, unknown>;

export const _deleteConfig = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.calendar.configureSpecialDays,
	policyResource: { kind: 'organization' },
	fn: async (ctx, input) => {
		const id = input?.id;
		if (!id || typeof id !== 'string') fail(400, 'Missing id');
		if (!validateUUID(id)) fail(400, 'Invalid resource ID');
		await specialDayUseCases.remove(ctx, id);
		return { success: true };
	}
} satisfies RouteConfig<Record<string, unknown>, unknown>;

export const PUT = handle(_putConfig);
export const DELETE = handle(_deleteConfig);

export const POST = handle<Record<string, unknown>, unknown>(_postConfig);
