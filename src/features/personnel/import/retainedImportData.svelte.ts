import { isPromiseLike, observeDeferred } from '$lib/utils/streamedRouteData';
import type { Personnel, PersonnelDodId } from '../contracts';

export interface ImportData {
	dodIds: readonly PersonnelDodId[];
	archived: readonly Personnel[];
}

type Loaded = ImportData | { access: unknown } | null | undefined;

export type RetainedImportData =
	| ({ orgId: string; state: 'ready'; stale?: true } & ImportData)
	| { orgId: string; state: 'denied' | 'failed' };

/** An import's own refresh replaces the streamed data; keep the last of it so the flow, and its receipt, stay mounted. */
export function retainImportData(source: () => { orgId: string; streamed: Loaded | Promise<Loaded> }) {
	let data = $state<RetainedImportData | null>(null);
	$effect(() => {
		const { orgId, streamed } = source();
		let cancelled = false;
		const settle = (value: Loaded) => {
			data =
				value && 'dodIds' in value
					? { orgId, state: 'ready', dodIds: value.dodIds, archived: value.archived }
					: { orgId, state: 'denied' };
		};
		if (!isPromiseLike(streamed)) {
			settle(streamed);
			return;
		}
		void observeDeferred(streamed, {
			fallbackMessage: 'Failed to load the Personnel import',
			onResolve: settle,
			onReject: () => {
				data = data?.orgId === orgId && data.state === 'ready' ? { ...data, stale: true } : { orgId, state: 'failed' };
			},
			isCancelled: () => cancelled
		});
		return () => {
			cancelled = true;
		};
	});
	return {
		get current() {
			return data?.orgId === source().orgId ? data : null;
		}
	};
}
