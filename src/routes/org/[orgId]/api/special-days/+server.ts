import { json, error } from '@sveltejs/kit';
import { specialDayCrudConfig, createResetFederalHolidaysUseCase } from '$lib/server/core/useCases/specialDayCrud';
import { createCrudUseCases } from '$lib/server/core/useCases/crud';
import { buildContext, deleteHandler } from '$lib/server/adapters/httpAdapter';

const useCases = createCrudUseCases(specialDayCrudConfig);
const resetFederalHolidays = createResetFederalHolidaysUseCase();

export const POST = async (event) => {
	const ctx = await buildContext(event);

	let body: Record<string, unknown>;
	try {
		body = (await event.request.json()) as Record<string, unknown>;
	} catch {
		throw error(400, 'Invalid JSON in request body');
	}

	if (body.action === 'resetFederalHolidays') {
		const result = await resetFederalHolidays(ctx);
		return json(result);
	}

	const result = await useCases.create(ctx, body);
	return json(result);
};

export const DELETE = deleteHandler(useCases.remove);
