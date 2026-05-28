import { fail } from '@sveltejs/kit';

export function toActionFailure(errorKey: string, error: unknown) {
	if (error instanceof Error && typeof Reflect.get(error, 'status') === 'number') {
		const data: Record<string, unknown> = { [errorKey]: error.message };
		const reason = Reflect.get(error, 'reason');
		const requiresStepUp = Reflect.get(error, 'requiresStepUp');
		const stepUpPath = Reflect.get(error, 'stepUpPath');

		if (typeof reason === 'string') data.reason = reason;
		if (typeof requiresStepUp === 'boolean') data.requiresStepUp = requiresStepUp;
		if (typeof stepUpPath === 'string') data.stepUpPath = stepUpPath;

		return fail(Reflect.get(error, 'status') as number, data);
	}

	throw error;
}
