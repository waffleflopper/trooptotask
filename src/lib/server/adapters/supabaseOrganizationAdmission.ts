import { error } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { validateUUID } from '$lib/server/validation';
import { normalizeOrganizationUrlSlug } from '$lib/server/core/useCases/organizationUrlSlug';
import { sanitizeErrorForLog } from '$lib/server/logSanitize';

/** Check fresh Organization status with the caller's RLS-scoped client before dispatch. */
export async function requireActiveOrganization(supabase: SupabaseClient, segment: string): Promise<void> {
	const result = await supabase
		.from('organizations')
		.select('id, suspended_at')
		.eq(
			validateUUID(segment) ? 'id' : 'url_slug',
			validateUUID(segment) ? segment : normalizeOrganizationUrlSlug(segment)
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
	if (result.data.suspended_at === null) return;
	if (typeof result.data.suspended_at === 'string' && result.data.suspended_at.length > 0) {
		error(403, 'Organization is suspended');
	}
	error(503, 'Unable to verify Organization status');
}
