import { fail } from '$lib/errors';
import { isUuid } from '$lib/utils/inputSchemas';
import type { RequestEvent } from '@sveltejs/kit';

/** A segment that is not a UUID cannot name a stored record, so it answers like a missing one. */
function routeUuid(event: Pick<RequestEvent, 'params'>, param: string, notFoundMessage: string): string {
	const value: unknown = (event.params as Record<string, string | undefined>)[param];
	if (!isUuid(value)) fail(404, notFoundMessage);
	return value;
}

export function routePersonnelId(event: Pick<RequestEvent, 'params'>): string {
	return routeUuid(event, 'id', 'Personnel record not found');
}

export function routeArtifactIds<TParam extends string>(
	event: Pick<RequestEvent, 'params'>,
	param: TParam,
	notFoundMessage: string
): { personnelId: string } & Record<TParam, string> {
	const personnelId = routePersonnelId(event);
	return { personnelId, [param]: routeUuid(event, param, notFoundMessage) } as { personnelId: string } & Record<
		TParam,
		string
	>;
}

export const ARTIFACT_PAGE_SIZE = 25;
const MAX_ARTIFACT_PAGE_SIZE = 100;

/** Reads `?limit=&offset=`, answering 400 to anything that is not a whole number in range. */
export function routeArtifactPage(event: Pick<RequestEvent, 'url'>): { limit: number; offset: number } {
	const whole = (name: string, fallback: number, max: number) => {
		const raw = event.url.searchParams.get(name);
		if (raw === null) return fallback;
		const value = Number(raw);
		if (!/^\d+$/.test(raw) || value > max) fail(400, `Invalid ${name}`);
		return value;
	};
	const limit = whole('limit', ARTIFACT_PAGE_SIZE, MAX_ARTIFACT_PAGE_SIZE);
	if (limit < 1) fail(400, 'Invalid limit');
	return { limit, offset: whole('offset', 0, Number.MAX_SAFE_INTEGER) };
}
