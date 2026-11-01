import { error, json, type RequestEvent } from '@sveltejs/kit';
import {
	captureFailure,
	createSupabaseErrorRecordingStore,
	type CaptureConfig
} from '$features/error-reporting/index.server';
import { clientErrorReportSchema } from '$features/error-reporting/contracts';
import { requireActiveOrganization } from '$features/organization/index.server';
import { getAdminClient } from '$lib/server/supabase';
import { issueMessage } from '$lib/utils/inputSchemas';
import { readJsonBody, rethrowOrWrap } from './httpAdapter';

/**
 * Receive one failure a signed-in browser saw: a render error, a transport failure or a write whose result it never
 * learned. The body is strict, so it cannot name a user, Organization, origin or reference. The server generates the
 * reference and attributes the account from the session and the Organization from this request's admission.
 */
export async function receiveClientErrorReport(
	event: Pick<RequestEvent, 'locals' | 'params' | 'request'>,
	scope: 'account' | 'organization'
): Promise<Response> {
	const actor = event.locals.actor;
	if (!actor) error(401, 'Authentication required');

	const body = await readJsonBody(event).catch(rethrowOrWrap);
	const parsed = clientErrorReportSchema.safeParse(body);
	if (!parsed.success) error(400, issueMessage(parsed.error));
	const report = parsed.data;

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
