import type { Cookies } from '@sveltejs/kit';
import { requireActiveOrganization } from '$features/organization/index.server';
import { buildLayoutRequest } from './requestContexts.server';

export interface FeatureLaneWorkspaceRequestContext {
	locals: App.Locals;
	cookies: Cookies;
	orgId: string;
}

export interface FeatureLaneWorkspaceLoadEvent {
	locals: App.Locals;
	cookies: Cookies;
	params: { orgId: string };
	depends: (...deps: string[]) => void;
}

export interface StreamReadyFeatureLaneWorkspaceOptions<TResult> {
	dependencies: string[];
	streamWorkspace(context: FeatureLaneWorkspaceRequestContext): Promise<TResult>;
}

export async function streamReadyFeatureLaneWorkspace<TResult>(
	event: FeatureLaneWorkspaceLoadEvent,
	options: StreamReadyFeatureLaneWorkspaceOptions<TResult>
): Promise<TResult> {
	event.depends(...options.dependencies);
	const organization = await requireActiveOrganization(event.locals, event.params.orgId);
	await buildLayoutRequest(event.locals, organization.id);
	return options.streamWorkspace({ locals: event.locals, cookies: event.cookies, orgId: organization.id });
}
