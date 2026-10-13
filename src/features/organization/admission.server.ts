import { error } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isOrganizationIdSegment, normalizeOrganizationUrlSlug } from './url';
import { sanitizeErrorForLog } from '$lib/utils/logSanitize';

export interface OrganizationAdmissionRequest {
	supabase: SupabaseClient;
	organizationAdmissions?: Map<string, Promise<string>>;
}

/**
 * Check fresh Organization status with the caller's RLS-scoped client and return its canonical id.
 * The result is shared by every consumer of the same request and Organization route segment.
 */
export function requireActiveOrganization(request: OrganizationAdmissionRequest, segment: string): Promise<string> {
	const admissions = (request.organizationAdmissions ??= new Map());
	let admission = admissions.get(segment);
	if (!admission) {
		admission = readActiveOrganizationId(request.supabase, segment);
		admissions.set(segment, admission);
	}
	return admission;
}

async function readActiveOrganizationId(supabase: SupabaseClient, segment: string): Promise<string> {
	const result = await supabase
		.from('organizations')
		.select('id, suspended_at')
		.eq(
			isOrganizationIdSegment(segment) ? 'id' : 'url_slug',
			isOrganizationIdSegment(segment) ? segment : normalizeOrganizationUrlSlug(segment)
		)
		.maybeSingle()
		.then(
			(result) => result,
			(cause) => ({ data: null, error: cause })
		);

	if (result.error) {
		console.error('[organization-admission] Failed to verify Organization status:', sanitizeErrorForLog(result.error));
		error(503, 'Unable to verify Organization status');
	}
	if (!result.data) error(404, 'Organization not found');
	if (result.data.suspended_at === null) return String(result.data.id);
	if (typeof result.data.suspended_at === 'string' && result.data.suspended_at.length > 0) {
		error(403, 'Organization is suspended');
	}
	error(503, 'Unable to verify Organization status');
}
