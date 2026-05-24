import { json } from '@sveltejs/kit';

type ErrorWithStatus = Error & {
	status?: number;
	reason?: string;
	requiresStepUp?: boolean;
	stepUpPath?: string | null;
};

function isErrorWithStatus(err: unknown): err is ErrorWithStatus {
	return err instanceof Error && typeof (err as ErrorWithStatus).status === 'number';
}

export function billingApiErrorResponse(err: unknown, fallbackMessage: string): Response {
	if (isErrorWithStatus(err)) {
		const body: Record<string, unknown> = {
			error: err.message || fallbackMessage
		};

		if (err.reason) body.reason = err.reason;
		if (typeof err.requiresStepUp === 'boolean') body.requiresStepUp = err.requiresStepUp;
		if (typeof err.stepUpPath === 'string') body.stepUpPath = err.stepUpPath;

		return json(body, { status: err.status });
	}

	console.error('[billing-api] Unhandled billing route error:', err);
	return json({ error: fallbackMessage }, { status: 500 });
}
