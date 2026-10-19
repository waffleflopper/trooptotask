// @vitest-environment happy-dom
import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
import { StreamedValue } from './streamedValue.svelte';

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function follow<T>(initial: Promise<T>) {
	let source = $state(initial);
	let streamed!: StreamedValue<T>;
	const stop = $effect.root(() => {
		streamed = new StreamedValue(() => source);
	});
	flushSync();
	return {
		get current() {
			return streamed.current;
		},
		replace(next: Promise<T>) {
			source = next;
			flushSync();
		},
		stop
	};
}

describe('StreamedValue', () => {
	it('keeps the settled value while a refresh is pending, then shows the refresh', async () => {
		const first = deferred<string>();
		const streamed = follow(first.promise);
		expect(streamed.current).toEqual({ state: 'pending' });

		first.resolve('first');
		await first.promise;
		expect(streamed.current).toEqual({ state: 'ready', value: 'first' });

		const second = deferred<string>();
		streamed.replace(second.promise);
		expect(streamed.current).toEqual({ state: 'ready', value: 'first' });

		second.reject(new Error('down'));
		await second.promise.catch(() => {});
		expect(streamed.current).toEqual({ state: 'failed' });
		streamed.stop();
	});

	it('ignores a superseded promise that settles late', async () => {
		const stale = deferred<string>();
		const streamed = follow(stale.promise);
		const fresh = deferred<string>();
		streamed.replace(fresh.promise);

		fresh.resolve('fresh');
		await fresh.promise;
		stale.resolve('stale');
		await stale.promise;
		expect(streamed.current).toEqual({ state: 'ready', value: 'fresh' });
		streamed.stop();
	});
});
