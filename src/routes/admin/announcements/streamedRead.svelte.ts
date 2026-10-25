import { untrack } from 'svelte';

export type StreamedRead<T> =
	| { status: 'pending' }
	| { status: 'loaded'; value: T; refreshing: boolean }
	| { status: 'failed' };

/**
 * Follows a streamed read. A refresh keeps the last loaded value on screen, so a save does not flash a skeleton,
 * and a reply for a promise that has since been replaced is ignored.
 */
export function followStreamedRead<T>(getPromise: () => Promise<T>): { readonly current: StreamedRead<T> } {
	let current = $state<StreamedRead<T>>({ status: 'pending' });
	$effect(() => {
		const promise = getPromise();
		let latest = true;
		untrack(() => {
			current = current.status === 'loaded' ? { ...current, refreshing: true } : { status: 'pending' };
		});
		promise.then(
			(value) => {
				if (latest) current = { status: 'loaded', value, refreshing: false };
			},
			() => {
				if (latest) current = { status: 'failed' };
			}
		);
		return () => {
			latest = false;
		};
	});
	return {
		get current() {
			return current;
		}
	};
}
