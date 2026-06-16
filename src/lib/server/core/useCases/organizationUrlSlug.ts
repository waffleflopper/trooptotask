import type { SupabaseClient } from '@supabase/supabase-js';
import { validateUUID } from '$lib/server/validation';
import { fail } from '$lib/server/core/errors';
import { sanitizeErrorForLog } from '$lib/server/logSanitize';

export const ORGANIZATION_SLUG_MIN_LENGTH = 3;
export const ORGANIZATION_SLUG_MAX_LENGTH = 48;

const ORGANIZATION_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED_ORGANIZATION_SLUGS = new Set([
	'account',
	'admin',
	'api',
	'audit',
	'auth',
	'billing',
	'calendar',
	'critical-tasks',
	'dashboard',
	'duty-rosters',
	'evals',
	'help',
	'new',
	'onboarding',
	'org',
	'organizations',
	'personnel',
	'pricing',
	'privacy',
	'settings',
	'terms',
	'training'
]);

export interface OrganizationRouteIdentity {
	id: string;
	name: string | null;
	urlSlug: string | null;
	suspendedAt: string | null;
}

export function getPreferredOrganizationUrlSegment(input: { id: string; urlSlug?: string | null }): string {
	return input.urlSlug || input.id;
}

export function normalizeOrganizationUrlSlug(input: string | null | undefined): string {
	return String(input ?? '')
		.trim()
		.toLowerCase();
}

export function validateOrganizationUrlSlug(input: string | null | undefined): string {
	const slug = normalizeOrganizationUrlSlug(input);

	if (!slug) {
		fail(400, 'Organization URL slug is required');
	}

	if (slug.length < ORGANIZATION_SLUG_MIN_LENGTH) {
		fail(400, `Organization URL slug must be at least ${ORGANIZATION_SLUG_MIN_LENGTH} characters`);
	}

	if (slug.length > ORGANIZATION_SLUG_MAX_LENGTH) {
		fail(400, `Organization URL slug must be ${ORGANIZATION_SLUG_MAX_LENGTH} characters or fewer`);
	}

	if (!ORGANIZATION_SLUG_PATTERN.test(slug)) {
		fail(400, 'Organization URL slug can only use lowercase letters, numbers, and single hyphens');
	}

	if (validateUUID(slug)) {
		fail(400, 'Organization URL slug cannot be a UUID');
	}

	if (RESERVED_ORGANIZATION_SLUGS.has(slug)) {
		fail(400, 'Organization URL slug is reserved');
	}

	return slug;
}

export function isDuplicateOrganizationSlugError(errorMessage: string | null | undefined): boolean {
	return /duplicate|unique|organizations_url_slug_key/i.test(errorMessage ?? '');
}

export async function resolveOrganizationRouteIdentity(
	supabase: SupabaseClient,
	segment: string
): Promise<OrganizationRouteIdentity | null> {
	const normalizedSegment = normalizeOrganizationUrlSlug(segment);
	const isUuidSegment = validateUUID(segment);
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
