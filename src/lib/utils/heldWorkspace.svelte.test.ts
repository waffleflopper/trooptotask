// @vitest-environment happy-dom
import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
import { HeldWorkspace, workspaceScope, type HeldWorkspaceOptions } from './heldWorkspace.svelte';

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	promise.catch(() => {});
	return { promise, resolve, reject };
}

async function settle() {
	await new Promise((resolve) => setTimeout(resolve, 0));
	flushSync();
}

function hold<T>(
	initial: T | Promise<T> | null,
	options: Pick<HeldWorkspaceOptions<T>, 'hydrate' | 'abandon'> = {},
	initialScope = 'org-1'
) {
	let source = $state.raw(initial);
	let scope = $state(initialScope);
	let held!: HeldWorkspace<T>;
	const stop = $effect.root(() => {
		held = new HeldWorkspace<T>({
			source: () => source,
			scope: () => scope,
			fallbackMessage: 'Failed to load',
			...options
		});
	});
	flushSync();
	return {
		get current() {
			return held.current;
		},
		show(next: T | Promise<T> | null, nextScope = scope) {
			source = next;
			scope = nextScope;
			flushSync();
		},
		stop
	};
}

describe('HeldWorkspace', () => {
	it('keeps the resolved workspace while a refresh in the same scope loads, then shows the refresh', async () => {
		const held = hold(Promise.resolve('first'));
		expect(held.current).toEqual({ status: 'pending' });
		await settle();
		expect(held.current).toEqual({ status: 'ready', value: 'first', refresh: 'idle' });

		const refresh = deferred<string>();
		held.show(refresh.promise);
		expect(held.current).toEqual({ status: 'ready', value: 'first', refresh: 'pending' });

		refresh.resolve('second');
		await settle();
		expect(held.current).toEqual({ status: 'ready', value: 'second', refresh: 'idle' });
		held.stop();
	});

	it('keeps the last workspace and reports the failure when a refresh rejects', async () => {
		const held = hold(Promise.resolve('first'));
		await settle();
		const refresh = deferred<string>();
		held.show(refresh.promise);
		refresh.reject(new Error('down'));
		await settle();
		expect(held.current).toEqual({ status: 'ready', value: 'first', refresh: 'failed' });

		held.show(Promise.resolve('recovered'));
		await settle();
		expect(held.current).toEqual({ status: 'ready', value: 'recovered', refresh: 'idle' });
		held.stop();
	});

	it('fails when the first load rejects, with nothing to keep', async () => {
		const first = deferred<string>();
		const held = hold(first.promise);
		first.reject('boom');
		await settle();
		expect(held.current).toEqual({ status: 'failed', error: new Error('Failed to load') });
		held.stop();
	});

	it('drops the workspace as soon as the scope changes, and ignores the old scope settling late', async () => {
		const held = hold(Promise.resolve('alpha rows'));
		await settle();
		const alphaRefresh = deferred<string>();
		held.show(alphaRefresh.promise);

		const bravo = deferred<string>();
		held.show(bravo.promise, 'org-2');
		expect(held.current).toEqual({ status: 'pending' });

		alphaRefresh.resolve('late alpha rows');
		await settle();
		expect(held.current).toEqual({ status: 'pending' });

		bravo.resolve('bravo rows');
		await settle();
		expect(held.current).toEqual({ status: 'ready', value: 'bravo rows', refresh: 'idle' });
		held.stop();
	});

	it('does not keep the old scope when the new scope fails to load', async () => {
		const held = hold(Promise.resolve('alpha rows'));
		await settle();
		const bravo = deferred<string>();
		held.show(bravo.promise, 'org-2');
		bravo.reject(new Error('down'));
		await settle();
		expect(held.current).toEqual({ status: 'failed', error: new Error('down') });
		held.stop();
	});

	it('shows the newest refresh when an earlier one resolves after it', async () => {
		const held = hold(Promise.resolve('first'));
		await settle();
		const earlier = deferred<string>();
		const later = deferred<string>();
		held.show(earlier.promise);
		held.show(later.promise);
		later.resolve('later');
		await settle();
		earlier.resolve('earlier');
		await settle();
		expect(held.current).toEqual({ status: 'ready', value: 'later', refresh: 'idle' });
		held.stop();
	});

	it('shows a workspace only after it has been applied, and never one superseded while applying', async () => {
		const applying = deferred<void>();
		const held = hold(Promise.resolve('first'), { hydrate: () => applying.promise });
		await settle();
		expect(held.current).toEqual({ status: 'pending' });

		held.show(Promise.resolve('other org'), 'org-2');
		applying.resolve();
		await settle();
		expect(held.current).toEqual({ status: 'ready', value: 'other org', refresh: 'idle' });
		held.stop();
	});

	it('tells the applying step whether a workspace of this scope is already shown', async () => {
		const refreshes: boolean[] = [];
		const held = hold(Promise.resolve('first'), { hydrate: (_value, refresh) => void refreshes.push(refresh) });
		await settle();
		held.show(Promise.resolve('second'));
		await settle();
		held.show(Promise.resolve('narrowed access'), 'org-1 narrowed');
		await settle();
		expect(refreshes).toEqual([false, true, false]);
		held.stop();
	});

	it('drops the work still running for a source once it fails', async () => {
		let abandoned = 0;
		const applying = deferred<void>();
		const held = hold(Promise.resolve('first'), { hydrate: () => applying.promise, abandon: () => void abandoned++ });
		await settle();
		applying.reject(new Error('one lane failed'));
		await settle();
		expect(held.current.status).toBe('failed');
		expect(abandoned).toBe(1);
		held.stop();
	});

	it('shows a workspace that arrives already resolved without a loading step', () => {
		const held = hold<string>('first');
		expect(held.current).toEqual({ status: 'ready', value: 'first', refresh: 'idle' });
		held.show('second');
		expect(held.current).toEqual({ status: 'ready', value: 'second', refresh: 'idle' });
		held.stop();
	});

	it('has nothing to hold without a source', () => {
		const held = hold<string>(null);
		expect(held.current).toEqual({ status: 'absent' });
		held.stop();
	});
});

describe('workspaceScope', () => {
	const shell = {
		org: { id: 'org-1' },
		user: { id: 'user-1' },
		member: { role: 'member', capabilityMap: { calendar: 'view' }, scopeSet: { kind: 'groups', groupIds: ['g1'] } }
	};

	it('is the same for the same Organization, user and access', () => {
		expect(workspaceScope(structuredClone(shell))).toBe(workspaceScope(shell));
	});

	it.each([
		['Organization', { ...shell, org: { id: 'org-2' } }],
		['user', { ...shell, user: { id: 'user-2' } }],
		['role', { ...shell, member: { ...shell.member, role: 'admin' } }],
		['capability', { ...shell, member: { ...shell.member, capabilityMap: { calendar: 'none' } } }],
		['Group scope', { ...shell, member: { ...shell.member, scopeSet: { kind: 'groups', groupIds: ['g2'] } } }]
	])('changes with the %s', (_name, changed) => {
		expect(workspaceScope(changed)).not.toBe(workspaceScope(shell));
	});
});
