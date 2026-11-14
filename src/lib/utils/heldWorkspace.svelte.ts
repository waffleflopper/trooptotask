import { untrack } from 'svelte';
import { isPromiseLike } from './streamedRouteData';
import { hydrateStreamedWorkspace } from './streamedWorkspaceHydrator';

export type HeldWorkspaceState<T> =
	| { status: 'absent' }
	| { status: 'pending' }
	| { status: 'failed'; error: Error }
	| { status: 'ready'; value: T; refresh: 'idle' | 'pending' | 'failed' };

export interface HeldWorkspaceOptions<T> {
	source: () => T | Promise<T> | null | undefined;
	/** Who is looking at which Organization. A held workspace is never shown under another scope. */
	scope: () => string;
	fallbackMessage: string;
	/** Runs when a streamed source starts loading. */
	onPending?(): void;
	/**
	 * Applies a resolved workspace before it is shown. A rejection counts as a failed load. `refresh` is true when a
	 * workspace of this scope is already on screen.
	 */
	hydrate?(workspace: T, refresh: boolean): Promise<void> | void;
	onReject?(error: Error): void;
	/** Runs when a source fails, is replaced or loses its owner, so work still running for it can be dropped. */
	abandon?(): void;
}

type Settled<T> = { scope: string; source: unknown } & (
	| { held: true; value: T; refreshError: Error | null }
	| { held: false; error: Error }
);

interface ShellAccess {
	org: { id: string };
	user?: { id: string };
	member?: { role: unknown; capabilityMap: unknown; scopeSet: unknown };
}

/** The scope of a workspace read: one Organization, seen by one user with one level of access. */
export function workspaceScope(shell: ShellAccess | null | undefined): string {
	return JSON.stringify([
		shell?.org.id,
		shell?.user?.id,
		shell?.member?.role,
		shell?.member?.capabilityMap,
		shell?.member?.scopeSet
	]);
}

/**
 * Follows a streamed workspace. A refresh in the same scope keeps the last resolved workspace until the new one
 * resolves, and keeps it when the refresh fails. A scope change drops it at once, before the new source settles.
 */
export class HeldWorkspace<T> {
	#options: HeldWorkspaceOptions<T>;
	#settled = $state.raw<Settled<T> | null>(null);
	#current = $derived.by((): HeldWorkspaceState<T> => {
		const source = this.#options.source();
		if (source == null) return { status: 'absent' };
		const settled = this.#settled;
		if (!settled || settled.scope !== this.#options.scope()) return { status: 'pending' };
		const answered = settled.source === source;
		if (!settled.held) return answered ? { status: 'failed', error: settled.error } : { status: 'pending' };
		return {
			status: 'ready',
			value: settled.value,
			refresh: !answered ? 'pending' : settled.refreshError ? 'failed' : 'idle'
		};
	});

	constructor(options: HeldWorkspaceOptions<T>) {
		this.#options = options;
		$effect(() => {
			const source = options.source();
			const scope = options.scope();
			// Leaving a scope forgets its workspace, so coming back before the other scope settles is a first load again.
			untrack(() => {
				if (this.#settled && this.#settled.scope !== scope) this.#settled = null;
			});
			if (source == null) return;
			// A workspace that is already resolved and needs no applying is shown in the same pass, with no loading step.
			if (!options.hydrate && !isPromiseLike(source)) {
				untrack(() => (this.#settled = { scope, source, held: true, value: source, refreshError: null }));
				return;
			}
			let live = true;
			const stop = untrack(() =>
				hydrateStreamedWorkspace<T>({
					streamedWorkspace: { data: source },
					fallbackMessage: options.fallbackMessage,
					onPending: options.onPending,
					hydrate: async (value) => {
						const kept = this.#settled;
						await options.hydrate?.(value, !!kept?.held && kept.scope === scope);
						if (live) this.#settled = { scope, source, held: true, value, refreshError: null };
					},
					onReject: (error) => {
						const kept = this.#settled;
						this.#settled =
							kept?.held && kept.scope === scope
								? { ...kept, source, refreshError: error }
								: { scope, source, held: false, error };
						options.abandon?.();
						options.onReject?.(error);
					}
				})
			);
			return () => {
				live = false;
				stop();
				options.abandon?.();
			};
		});
	}

	get current(): HeldWorkspaceState<T> {
		return this.#current;
	}

	/** The workspace to show: the last one resolved in this scope. */
	get value(): T | undefined {
		return this.#current.status === 'ready' ? this.#current.value : undefined;
	}
}
