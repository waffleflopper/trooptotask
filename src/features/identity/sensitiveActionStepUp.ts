export interface SensitiveActionStepUpPayload {
	requiresStepUp?: unknown;
	stepUpPath?: unknown;
}

const STEP_UP_PATHS = new Set(['/auth/login', '/auth/mfa-verify']);

export function isSensitiveActionStepUpPayload(value: unknown): value is SensitiveActionStepUpPayload {
	return Boolean(value && typeof value === 'object' && (value as SensitiveActionStepUpPayload).requiresStepUp === true);
}

export function buildSensitiveActionStepUpUrl(
	payload: SensitiveActionStepUpPayload,
	currentLocation: Pick<Location, 'origin' | 'pathname' | 'search'>
): string {
	const requestedPath = typeof payload.stepUpPath === 'string' ? payload.stepUpPath : '/auth/login';
	const path = STEP_UP_PATHS.has(requestedPath) ? requestedPath : '/auth/login';
	const destination = new URL(path, currentLocation.origin);
	const next = `${currentLocation.pathname}${currentLocation.search}`;

	if (path === '/auth/login') {
		destination.searchParams.set('reauth', '1');
	}

	destination.searchParams.set('next', next);
	return destination.toString();
}

export function redirectToSensitiveActionStepUp(payload: unknown): boolean {
	if (!isSensitiveActionStepUpPayload(payload)) return false;
	window.location.href = buildSensitiveActionStepUpUrl(payload, window.location);
	return true;
}
