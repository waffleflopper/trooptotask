import { ROSTER_UNAVAILABLE_MESSAGE } from '$features/sign-in-rosters/contracts';
import { fail } from '$lib/errors';
import { isUuid } from '$lib/utils/inputSchemas';
import type { RequestEvent } from '@sveltejs/kit';

/** A segment that is not a UUID cannot name a stored roster, so it answers like a missing one. */
export function routeRosterId(event: Pick<RequestEvent, 'params'>): string {
	const id: unknown = (event.params as Record<string, string | undefined>).id;
	if (!isUuid(id)) fail(404, ROSTER_UNAVAILABLE_MESSAGE);
	return id;
}
