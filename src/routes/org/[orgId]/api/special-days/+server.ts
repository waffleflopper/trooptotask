import { entityHandlers, handle } from '$lib/server/adapters/httpAdapter';
import { SpecialDayEntity } from '$lib/server/entities/specialDay';
import { createResetFederalHolidaysUseCase } from '$lib/server/core/useCases/specialDayCrud';

const handlers = entityHandlers(SpecialDayEntity);
const createSpecialDayConfig = handlers._configs.POST!;
export const _postConfig = {
	permission: 'calendar',
	mutation: true,
	deferPolicyToUseCase: true,
	fn: async (ctx, input) => {
		if (input.action === 'resetFederalHolidays') {
			return resetFederalHolidays(ctx);
		}
		return createSpecialDayConfig.fn(ctx, input);
	}
} satisfies Parameters<typeof handle<Record<string, unknown>, unknown>>[0];
export const _putConfig = handlers._configs.PUT!;
const resetFederalHolidays = createResetFederalHolidaysUseCase();
export const PUT = handlers.PUT!;
export const DELETE = handlers.DELETE;

export const POST = handle<Record<string, unknown>, unknown>(_postConfig);
