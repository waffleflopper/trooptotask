import type { SupabaseClient } from '@supabase/supabase-js';
import { fail } from '$lib/errors';
import { sanitizeErrorForLog } from '$lib/server/logSanitize';
import { isOrganizationIdSegment, normalizeOrganizationUrlSlug } from './url';
import type { OrganizationRouteIdentity } from './profileTypes';

export async function resolveOrganizationRouteIdentity(
	supabase: SupabaseClient,
	segment: string
): Promise<OrganizationRouteIdentity | null> {
	const normalizedSegment = normalizeOrganizationUrlSlug(segment);
	const isUuidSegment = isOrganizationIdSegment(segment);
	const query = supabase.from('organizations').select('id, name, url_slug, suspended_at');
	const { data, error } = isUuidSegment
		? await query.eq('id', segment).maybeSingle()
		: await query.eq('url_slug', normalizedSegment).maybeSingle();

	if (error) {
		console.error('[organization-url-slug] Failed to resolve organization route identity:', sanitizeErrorForLog(error));
		fail(500, 'Internal server error');
	}

	if (!data) {
		return null;
	}

	return {
		id: String(data.id),
		name: (data.name as string | null | undefined) ?? null,
		urlSlug: (data.url_slug as string | null | undefined) ?? null,
		suspendedAt: (data.suspended_at as string | null | undefined) ?? null
	};
}
