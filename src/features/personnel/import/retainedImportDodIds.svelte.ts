import { isPromiseLike, observeDeferred } from '$lib/utils/streamedRouteData';
import type { PersonnelDodId } from '../contracts';

type Loaded = { dodIds: readonly PersonnelDodId[] } | { access: unknown } | null | undefined;

export type ImportDodIds =
	| { orgId: string; state: 'ready'; dodIds: readonly PersonnelDodId[]; stale?: true }
	| { orgId: string; state: 'denied' | 'failed' };

/** An import's own refresh replaces the streamed IDs; keep the last ones so the flow, and its receipt, stay mounted. */
export function retainImportDodIds(source: () => { orgId: string; streamed: Loaded | Promise<Loaded> }) {
	let ids = $state<ImportDodIds | null>(null);
	$effect(() => {
		const { orgId, streamed } = source();
		let cancelled = false;
		const settle = (value: Loaded) => {
			ids = value && 'dodIds' in value ? { orgId, state: 'ready', dodIds: value.dodIds } : { orgId, state: 'denied' };
		};
		if (!isPromiseLike(streamed)) {
			settle(streamed);
			return;
		}
		void observeDeferred(streamed, {
			fallbackMessage: 'Failed to load the Personnel import',
			onResolve: settle,
			onReject: () => {
				ids = ids?.orgId === orgId && ids.state === 'ready' ? { ...ids, stale: true } : { orgId, state: 'failed' };
			},
			isCancelled: () => cancelled
		});
		return () => {
			cancelled = true;
		};
	});
	return {
		get current() {
			return ids?.orgId === source().orgId ? ids : null;
		}
	};
}
