import { entityHandlers, handle } from '$lib/server/adapters/httpAdapter';
import { SpecialDayEntity } from '$lib/server/entities/specialDay';
import { createResetFederalHolidaysUseCase } from '$lib/server/core/useCases/specialDayCrud';

const handlers = entityHandlers(SpecialDayEntity);
const createSpecialDayConfig = handlers._configs.POST!;
const resetFederalHolidays = createResetFederalHolidaysUseCase();
export const DELETE = handlers.DELETE;

export const POST = handle<Record<string, unknown>, unknown>({
	permission: 'calendar',
	mutation: true,
	fn: async (ctx, input) => {
		if (input.action === 'resetFederalHolidays') {
			return resetFederalHolidays(ctx);
		}
		return createSpecialDayConfig.fn(ctx, input);
	}
});
