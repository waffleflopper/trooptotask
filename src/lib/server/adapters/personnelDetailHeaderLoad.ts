import type { PersonnelDetailHeader } from '$features/personnel/contracts';
import { loadPersonnelDetailHeader } from '$features/personnel/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { Cookies } from '@sveltejs/kit';
import { loadWithContext } from './httpAdapter';
import { createRequestPersonnelDetailContext } from './requestContexts.server';

const headersByRequest = new WeakMap<App.Locals, Map<string, Promise<PersonnelDetailHeader>>>();

interface PersonnelDetailRequest {
	locals: App.Locals;
	cookies: Cookies;
	params: { orgId: string; personnelSlug: string };
}

/**
 * The detail layout and its pages share one header resolution per request. Pages must not await
 * `parent()` for it, because SvelteKit then runs every ancestor load, including the Personnel workspace.
 */
export function loadRequestPersonnelDetailHeader(
	{ locals, cookies, params }: PersonnelDetailRequest,
	loadWithContextFn: typeof loadWithContext = loadWithContext
): Promise<PersonnelDetailHeader> {
	let headers = headersByRequest.get(locals);
	if (!headers) headersByRequest.set(locals, (headers = new Map()));
	const key = `${params.orgId}/${params.personnelSlug}`;
	let header = headers.get(key);
	if (!header) {
		header = loadWithContextFn(locals, cookies, params.orgId, {
			context: createRequestPersonnelDetailContext,
			policyAction: POLICY_ACTION_CATALOG.personnel.manageRecords,
			policyResource: { kind: 'unscoped' },
			fn: (ctx) => loadPersonnelDetailHeader(ctx, params.personnelSlug)
		});
		headers.set(key, header);
	}
	return header;
}
