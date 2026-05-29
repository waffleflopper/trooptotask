import { fail } from '@sveltejs/kit';

export function toActionFailure(errorKey: string, error: unknown) {
	if (error instanceof Error) {
		const rawStatus = Reflect.get(error, 'status');
		const status = typeof rawStatus === 'number' && rawStatus >= 400 && rawStatus <= 599 ? rawStatus : 500;
		const data: Record<string, unknown> = { [errorKey]: error.message };
		const reason = Reflect.get(error, 'reason');
		const requiresStepUp = Reflect.get(error, 'requiresStepUp');
		const stepUpPath = Reflect.get(error, 'stepUpPath');

		if (typeof reason === 'string') data.reason = reason;
		if (typeof requiresStepUp === 'boolean') data.requiresStepUp = requiresStepUp;
		if (typeof stepUpPath === 'string') data.stepUpPath = stepUpPath;

		return fail(status, data);
	}

	throw error;
}
