import type { SupabaseClient } from '@supabase/supabase-js';
import { fail } from '$lib/errors';
import { sanitizeErrorForLog } from '$lib/utils/logSanitize';
import { isOrganizationIdSegment, normalizeOrganizationUrlSlug } from './url';
import type { OrganizationRouteIdentity } from './profileTypes';
import { parseDisabledFeatures } from '$lib/access/featureSwitches';

export interface OrganizationRouteRequest {
	supabase: SupabaseClient;
	organizationRouteReads?: Map<string, ReturnType<typeof readOrganizationRoute>>;
}

interface OrganizationRouteRow {
	id: unknown;
	name?: unknown;
	url_slug?: unknown;
	suspended_at?: unknown;
	created_at?: unknown;
	disabled_features?: unknown;
}

async function readOrganizationRoute(
	supabase: SupabaseClient,
	segment: string
): Promise<{ data: OrganizationRouteRow | null; error: unknown }> {
	return supabase
		.from('organizations')
		.select('id, name, url_slug, suspended_at, disabled_features, created_at')
		.eq(isOrganizationIdSegment(segment) ? 'id' : 'url_slug', segment)
		.maybeSingle()
		.then(
			(result) => result,
			(cause: unknown) => ({ data: null, error: cause })
		);
}

export function getOrLoadOrganizationRoute(request: OrganizationRouteRequest, segment: string) {
	const key = isOrganizationIdSegment(segment) ? segment : normalizeOrganizationUrlSlug(segment);
	const reads: NonNullable<OrganizationRouteRequest['organizationRouteReads']> = (request.organizationRouteReads ??=
		new Map());
	let read = reads.get(key);
	if (!read) {
		read = readOrganizationRoute(request.supabase, key);
		reads.set(key, read);
		const pending = read;
		void pending.then(({ data }) => {
			if (data) {
				reads.set(String(data.id), pending);
				if (typeof data.url_slug === 'string') reads.set(data.url_slug, pending);
			}
		});
	}
	return read;
}

export async function resolveOrganizationRouteIdentity(
	request: OrganizationRouteRequest,
	segment: string
): Promise<OrganizationRouteIdentity | null> {
	const { data, error } = await getOrLoadOrganizationRoute(request, segment);

	if (error) {
		console.error('[organization-url-slug] Failed to resolve organization route identity:', sanitizeErrorForLog(error));
		fail(500, 'Internal server error');
	}

	if (!data) {
		return null;
	}

	return {
		id: String(data.id),
		name: typeof data.name === 'string' ? data.name : null,
		urlSlug: typeof data.url_slug === 'string' ? data.url_slug : null,
		suspendedAt: typeof data.suspended_at === 'string' ? data.suspended_at : null,
		createdAt: typeof data.created_at === 'string' ? data.created_at : null,
		disabledFeatures: parseDisabledFeatures(data.disabled_features)
	};
}
