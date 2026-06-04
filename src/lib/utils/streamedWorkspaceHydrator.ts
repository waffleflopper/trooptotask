import { isPromiseLike, observeDeferred } from './streamedRouteData';

export interface StreamedWorkspaceEnvelope<TWorkspace> {
	data?: TWorkspace | Promise<TWorkspace>;
}

export interface HydrateStreamedWorkspaceOptions<TWorkspace> {
	streamedWorkspace: StreamedWorkspaceEnvelope<TWorkspace> | null | undefined;
	fallbackMessage: string;
	hydrate(workspace: TWorkspace): Promise<void> | void;
	onReject(error: Error): void;
}

export function hydrateStreamedWorkspace<TWorkspace>(options: HydrateStreamedWorkspaceOptions<TWorkspace>): () => void {
	let cancelled = false;
	const streamedWorkspace = options.streamedWorkspace?.data;

	if (!streamedWorkspace) {
		return () => {
			cancelled = true;
		};
	}

	const hydration = isPromiseLike(streamedWorkspace)
		? streamedWorkspace.then((workspace) => {
				if (cancelled) return;
				return options.hydrate(workspace);
			})
		: Promise.resolve(options.hydrate(streamedWorkspace));

	void observeDeferred(Promise.resolve(hydration), {
		fallbackMessage: options.fallbackMessage,
		onReject: options.onReject,
		isCancelled: () => cancelled
	});

	return () => {
		cancelled = true;
	};
}
