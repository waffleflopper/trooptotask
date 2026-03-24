import { handle } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';
import { specialDayCrudConfig, createResetFederalHolidaysUseCase } from '$lib/server/core/useCases/specialDayCrud';
import { createCrudUseCases } from '$lib/server/core/useCases/crud';

const useCases = createCrudUseCases(specialDayCrudConfig);
const resetFederalHolidays = createResetFederalHolidaysUseCase();

export const POST = handle<Record<string, unknown>, unknown>({
	permission: 'calendar',
	mutation: true,
	fn: async (ctx, input) => {
		if (input.action === 'resetFederalHolidays') {
			return resetFederalHolidays(ctx);
		}
		return useCases.create(ctx, input);
	}
});

export const DELETE = handle<Record<string, unknown>, unknown>({
	permission: 'calendar',
	mutation: true,
	fn: async (ctx, input) => {
		const id = input?.id;
		if (!id || typeof id !== 'string') {
			fail(400, 'Missing id');
		}
		await useCases.remove(ctx, id as string);
		return { success: true };
	}
});
