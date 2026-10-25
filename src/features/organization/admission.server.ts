import { error } from '@sveltejs/kit';
import { getOrLoadOrganizationRoute, type OrganizationRouteRequest } from './routeIdentity.server';
import { sanitizeErrorForLog } from '$lib/utils/logSanitize';
import { parseDisabledFeatures, type FeatureKey } from '$lib/access/featureSwitches';

export interface OrganizationAdmissionRequest extends OrganizationRouteRequest {
	organizationAdmissions?: Map<string, Promise<ActiveOrganization>>;
}

export interface ActiveOrganization {
	id: string;
	disabledFeatures: FeatureKey[];
}

/**
 * Check fresh Organization status with the caller's RLS-scoped client and return its canonical id and
 * feature switches. The result is shared by every consumer of the same request and Organization route segment.
 */
export function requireActiveOrganization(
	request: OrganizationAdmissionRequest,
	segment: string
): Promise<ActiveOrganization> {
	const admissions = (request.organizationAdmissions ??= new Map());
	let admission = admissions.get(segment);
	if (!admission) {
		admission = readActiveOrganizationId(request, segment);
		admissions.set(segment, admission);
	}
	return admission;
}

async function readActiveOrganizationId(
	request: OrganizationAdmissionRequest,
	segment: string
): Promise<ActiveOrganization> {
	const result = await getOrLoadOrganizationRoute(request, segment);

	if (result.error) {
		console.error('[organization-admission] Failed to verify Organization status:', sanitizeErrorForLog(result.error));
		error(503, 'Unable to verify Organization status');
	}
	if (!result.data) error(404, 'Organization not found');
	if (result.data.suspended_at === null) {
		return { id: String(result.data.id), disabledFeatures: parseDisabledFeatures(result.data.disabled_features) };
	}
	if (typeof result.data.suspended_at === 'string' && result.data.suspended_at.length > 0) {
		error(403, 'Organization is suspended');
	}
	error(503, 'Unable to verify Organization status');
}
