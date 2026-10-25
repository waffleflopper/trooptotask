// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { flushSync } from 'svelte';
import { followStreamedRead } from './streamedRead.svelte';

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function follow(initial: Promise<string>) {
	let promise = $state(initial);
	let read!: ReturnType<typeof followStreamedRead<string>>;
	const cleanup = $effect.root(() => {
		read = followStreamedRead(() => promise);
	});
	flushSync();
	return {
		read,
		replace(next: Promise<string>) {
			promise = next;
			flushSync();
		},
		cleanup
	};
}

describe('followStreamedRead', () => {
	it('is pending until the read settles, then loaded', async () => {
		const first = deferred<string>();
		const view = follow(first.promise);
		expect(view.read.current).toEqual({ status: 'pending' });
		first.resolve('a');
		await settle();
		expect(view.read.current).toEqual({ status: 'loaded', value: 'a', refreshing: false });
		view.cleanup();
	});

	it('reports a rejected read as failed', async () => {
		const first = deferred<string>();
		const view = follow(first.promise);
		first.reject(new Error('boom'));
		await settle();
		expect(view.read.current).toEqual({ status: 'failed' });
		view.cleanup();
	});

	it('keeps the loaded value on screen while a refresh is in flight', async () => {
		const view = follow(Promise.resolve('a'));
		await settle();
		const next = deferred<string>();
		view.replace(next.promise);
		expect(view.read.current).toEqual({ status: 'loaded', value: 'a', refreshing: true });
		next.resolve('b');
		await settle();
		expect(view.read.current).toEqual({ status: 'loaded', value: 'b', refreshing: false });
		view.cleanup();
	});

	it('ignores a reply from a read that was replaced', async () => {
		const stale = deferred<string>();
		const view = follow(stale.promise);
		view.replace(Promise.resolve('fresh'));
		await settle();
		stale.resolve('stale');
		await settle();
		expect(view.read.current).toEqual({ status: 'loaded', value: 'fresh', refreshing: false });
		view.cleanup();
	});
});
