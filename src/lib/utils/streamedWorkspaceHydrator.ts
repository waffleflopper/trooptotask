import { isPromiseLike, observeDeferred } from './streamedRouteData';

export interface StreamedWorkspaceEnvelope<TWorkspace> {
	data?: TWorkspace | Promise<TWorkspace>;
}

export interface HydrateStreamedWorkspaceOptions<TWorkspace> {
	streamedWorkspace: StreamedWorkspaceEnvelope<TWorkspace> | null | undefined;
	fallbackMessage: string;
	hydrate(workspace: TWorkspace): Promise<void> | void;
	onPending?(): void;
	onResolved?(workspace: TWorkspace): void;
	onReject(error: Error): void;
}

export function hydrateStreamedWorkspace<TWorkspace>(options: HydrateStreamedWorkspaceOptions<TWorkspace>): () => void {
	let cancelled = false;
	const streamedWorkspace = options.streamedWorkspace?.data;

	if (streamedWorkspace == null) {
		return () => {
			cancelled = true;
		};
	}

	if (isPromiseLike(streamedWorkspace)) {
		options.onPending?.();
	}

	const hydration = isPromiseLike(streamedWorkspace)
		? streamedWorkspace.then((workspace) => {
				if (cancelled) return;
				options.onResolved?.(workspace);
				return options.hydrate(workspace);
			})
		: Promise.resolve().then(() => {
				if (cancelled) return;
				options.onResolved?.(streamedWorkspace);
				return options.hydrate(streamedWorkspace);
			});

	void observeDeferred(Promise.resolve(hydration), {
		fallbackMessage: options.fallbackMessage,
		onReject: options.onReject,
		isCancelled: () => cancelled
	});

	return () => {
		cancelled = true;
	};
}
