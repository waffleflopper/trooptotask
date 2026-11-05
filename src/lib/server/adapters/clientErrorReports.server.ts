import { error, json, type RequestEvent } from '@sveltejs/kit';
import {
	captureFailure,
	createSupabaseErrorRecordingStore,
	isClientReportLimited,
	type CaptureConfig
} from '$features/error-reporting/index.server';
import { clientErrorReportSchema } from '$features/error-reporting/contracts';
import type { DurableRateLimitStore } from '$lib/access/index.server';
import { requireActiveOrganization } from '$features/organization/index.server';
import { getAdminClient } from '$lib/server/supabase';
import { issueMessage } from '$lib/utils/inputSchemas';
import { readJsonBody, rethrowOrWrap } from './httpAdapter';

const KNOWN_ROUTE_IDS = new Set(__APP_ROUTE_IDS__);

/**
 * Receive one failure a signed-in browser saw: a render error, a transport failure or a write whose result it never
 * learned. The body is strict, so it cannot name a user, Organization, origin or reference. The server generates the
 * reference and attributes the account from the session and the Organization from this request's admission. Each
 * account may send 30 an hour across both endpoints.
 */
export async function receiveClientErrorReport(
	event: Pick<RequestEvent, 'locals' | 'params' | 'request'>,
	scope: 'account' | 'organization',
	rateLimitStore?: DurableRateLimitStore
): Promise<Response> {
	const actor = event.locals.actor;
	if (!actor) error(401, 'Authentication required');

	// Past the hourly budget the report is dropped quietly: the browser reads an empty answer as "no reference".
	// A check that cannot run stores nothing and answers like a failed store.
	const limited = await isClientReportLimited({ userId: actor.userId, store: rateLimitStore }).catch(() =>
		error(503, 'Report could not be stored')
	);
	if (limited) return new Response(null, { status: 204 });

	const body = await readJsonBody(event).catch(rethrowOrWrap);
	const parsed = clientErrorReportSchema.safeParse(body);
	if (!parsed.success) error(400, issueMessage(parsed.error));
	const report = parsed.data;
	// A shaped path such as /org/alpha/personnel/Jane-Smith is not a route id and would store its values.
	if (report.routeId !== null && !KNOWN_ROUTE_IDS.has(report.routeId)) error(400, 'Invalid route');

	let organizationId: string | null = null;
	try {
		if (scope === 'organization') {
			organizationId = (await requireActiveOrganization(event.locals, event.params.orgId as string)).id;
		}
	} catch (cause) {
		rethrowOrWrap(cause);
	}

	const config: CaptureConfig = {
		record: (occurrence) => createSupabaseErrorRecordingStore(getAdminClient).record(occurrence),
		routeId: report.routeId,
		method: report.method ?? null,
		userId: () => actor.userId,
		organizationId: async () => organizationId
	};
	const { reference, recorded } = captureFailure(config, {
		failure: { name: report.name, message: report.message },
		origin: 'client_reported',
		kind: report.kind,
		status: report.status ?? null
	});
	if (!(await recorded)) error(503, 'Report could not be stored');
	return json({ reference });
}
