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
	url: URL;
	depends: (...deps: string[]) => void;
	parent: () => Promise<Parameters<typeof requireReadyAppShell>[0]>;
}

export interface StreamReadyFeatureLaneWorkspaceOptions<
	TResult,
	TContext extends FeatureLaneWorkspaceRequestContext = FeatureLaneWorkspaceRequestContext
> {
	dependencies: string[];
	createContext?: (event: FeatureLaneWorkspaceLoadEvent, shell: ReturnType<typeof requireReadyAppShell>) => TContext;
	streamWorkspace(context: TContext): Promise<TResult>;
}

export async function streamReadyFeatureLaneWorkspace<
	TResult,
	TContext extends FeatureLaneWorkspaceRequestContext = FeatureLaneWorkspaceRequestContext
>(
	event: FeatureLaneWorkspaceLoadEvent,
	options: StreamReadyFeatureLaneWorkspaceOptions<TResult, TContext>
): Promise<TResult> {
	event.depends(...options.dependencies);

	const shell = requireReadyAppShell(await event.parent());
	const context =
		options.createContext?.(event, shell) ??
		({
			locals: event.locals,
			cookies: event.cookies,
			orgId: shell.org.id
		} as TContext);
	return options.streamWorkspace(context);
}
