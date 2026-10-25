import { untrack } from 'svelte';

export type StreamedRead<T> =
	| { status: 'pending' }
	| { status: 'loaded'; value: T; refreshing: boolean }
	| { status: 'failed' };

/**
 * Follows a streamed read. A refresh keeps the last loaded value on screen, so a save does not flash a skeleton,
 * and a reply for a promise that has since been replaced is ignored. `settled` is the promise whose reply
 * `current` last applied, so a caller can tell a reply to a read it started from one to an older read.
 */
export function followStreamedRead<T>(getPromise: () => Promise<T>): {
	readonly current: StreamedRead<T>;
	readonly settled: Promise<T> | null;
} {
	let current = $state<StreamedRead<T>>({ status: 'pending' });
	let settled = $state.raw<Promise<T> | null>(null);
	$effect(() => {
		const promise = getPromise();
		let latest = true;
		untrack(() => {
			current = current.status === 'loaded' ? { ...current, refreshing: true } : { status: 'pending' };
		});
		promise.then(
			(value) => {
				if (!latest) return;
				current = { status: 'loaded', value, refreshing: false };
				settled = promise;
			},
			() => {
				if (!latest) return;
				current = { status: 'failed' };
				settled = promise;
			}
		);
		return () => {
			latest = false;
		};
	});
	return {
		get current() {
			return current;
		},
		get settled() {
			return settled;
		}
	};
}
