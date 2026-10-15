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
