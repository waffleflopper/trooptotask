import { fail } from '$lib/errors';

const ORGANIZATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isOrganizationIdSegment(segment: string): boolean {
	return ORGANIZATION_ID_PATTERN.test(segment);
}

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

	if (isOrganizationIdSegment(slug)) {
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
