import type { CurrentOrganizationSuspension, OrganizationSupportReader } from '$features/organization/contracts';
import type { PlatformAudit } from '$lib/audit/contracts';
import { activityInstantRange, ACTIVITY_PAGE_SIZE, type ActivityPage, type ActivityQuery } from '../activityQuery';
import { activityScope, type AuditEventRecord } from '../auditSentences';

function belongsToCurrentSuspension(event: AuditEventRecord, suspension: CurrentOrganizationSuspension): boolean {
	return (
		event.action === 'suspend_org' &&
		event.resourceType === 'organization' &&
		Date.parse(event.timestamp) >= Date.parse(suspension.suspendedAt)
	);
}

export async function listPlatformActivity(
	audit: Pick<PlatformAudit, 'listActivity'>,
	query: ActivityQuery,
	timeZone: string,
	viewerId: string,
	organizations: Pick<OrganizationSupportReader, 'listCurrentSuspensions'>
): Promise<ActivityPage> {
	const { from, to } = activityInstantRange(query, timeZone);
	const result = await audit.listActivity({
		...activityScope(query.category),
		search: query.q,
		from,
		to,
		page: query.page,
		limit: ACTIVITY_PAGE_SIZE
	});
	const organizationIds = [
		...new Set(
			result.events.flatMap((event) =>
				event.action === 'suspend_org' && event.resourceType === 'organization' && event.resourceId
					? [event.resourceId]
					: []
			)
		)
	];
	const suspensions = organizationIds.length ? await organizations.listCurrentSuspensions(organizationIds) : [];
	const byOrganization = new Map(suspensions.map((suspension) => [suspension.organizationId, suspension]));
	const events = result.events.map((event) => {
		const suspension = event.resourceId ? byOrganization.get(event.resourceId) : undefined;
		return suspension && belongsToCurrentSuspension(event, suspension)
			? { ...event, currentOrganizationSuspensionReason: suspension.reason }
			: event;
	});
	return { events, page: result.page, pageSize: result.limit, totalCount: result.totalCount, viewerId };
}
