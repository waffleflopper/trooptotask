import type { Cookies } from '@sveltejs/kit';
import { requireReadyAppShell } from './appShellRouteData';

export interface FeatureLaneWorkspaceRequestContext {
	locals: App.Locals;
	cookies: Cookies;
	orgId: string;
}

export interface FeatureLaneWorkspaceLoadEvent {
	locals: App.Locals;
	cookies: Cookies;
	depends: (...deps: string[]) => void;
	parent: () => Promise<Parameters<typeof requireReadyAppShell>[0]>;
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

	const shell = requireReadyAppShell(await event.parent());
	return options.streamWorkspace({
		locals: event.locals,
		cookies: event.cookies,
		orgId: shell.org.id
	});
}
