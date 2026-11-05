import { z } from 'zod';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { auditLogCursorSchema, parseAuditLogFilters, type AuditLogFilters } from '$lib/audit/auditLogFilters';
import type { AuditLogQueryResult } from '$lib/audit/contracts';
import { fetchAuditLogs } from '$lib/audit/index.server';
import { handle, privateJson, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestOrganizationAuditLogContext } from '$lib/server/adapters/requestContexts.server';
import { viewerTimeZone } from '$lib/server/viewerDay.server';

const auditLogPageInput = z.object({
	after: auditLogCursorSchema,
	filters: z.custom<AuditLogFilters>(),
	timeZone: z.string()
});

/** The page of entries older than `after`, for Activity's load more. The first page comes with the Logs page load. */
export const _getConfig: RouteConfig<
	z.infer<typeof auditLogPageInput>,
	AuditLogQueryResult,
	ReturnType<typeof createRequestOrganizationAuditLogContext>
> = {
	context: createRequestOrganizationAuditLogContext,
	policyAction: POLICY_ACTION_CATALOG.organization.accessAuditLogs,
	policyResource: { kind: 'organization' },
	input: auditLogPageInput,
	parseInput: (event) => ({
		after: event.url.searchParams.get('after') ?? '',
		filters: parseAuditLogFilters(event.url.searchParams),
		timeZone: viewerTimeZone(event.cookies)
	}),
	fn: (ctx, input) =>
		fetchAuditLogs(
			ctx.auth.orgId,
			ctx.auditStore,
			{ filters: input.filters, timeZone: input.timeZone, after: input.after },
			ctx.auditLabels
		),
	formatOutput: privateJson
};

export const GET = handle(_getConfig);
