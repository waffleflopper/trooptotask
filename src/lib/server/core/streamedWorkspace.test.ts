import { describe, expect, it } from 'vitest';
import {
	createCompositeWorkspaceSnapshotKey,
	createWorkspaceHydrationTarget,
	createWorkspaceSnapshotKey,
	createWorkspaceValueHydrationTarget,
	isPromiseLike
} from './streamedWorkspace';

describe('streamed workspace hydration target helpers', () => {
	it('detects promise-like streamed values', () => {
		const callableThenable = Object.assign(() => undefined, { then: () => undefined });

		expect(isPromiseLike(Promise.resolve([]))).toBe(true);
		expect(isPromiseLike({ then: () => undefined })).toBe(true);
		expect(isPromiseLike(callableThenable)).toBe(true);
		expect(isPromiseLike([])).toBe(false);
		expect(isPromiseLike(undefined)).toBe(false);
	});

	it('reuses deferred snapshot keys for the same promise', () => {
		const pending = Promise.resolve(['ready']);

		expect(createWorkspaceSnapshotKey(pending)).toBe(createWorkspaceSnapshotKey(pending));
		expect(createWorkspaceSnapshotKey(pending)).toMatch(/^deferred:/);
	});

	it('can create stable non-leaky resolved snapshot keys', () => {
		const first = createWorkspaceSnapshotKey([{ id: 'p1', firstName: 'John' }], { resolved: 'hash' });
		const second = createWorkspaceSnapshotKey([{ id: 'p1', firstName: 'John' }], { resolved: 'hash' });
		const changed = createWorkspaceSnapshotKey([{ id: 'p2', firstName: 'Jane' }], { resolved: 'hash' });

		expect(second).toBe(first);
		expect(changed).not.toBe(first);
		expect(first).toMatch(/^resolved:\d+:/);
		expect(first).not.toContain('John');
	});

	it('can preserve random resolved snapshot keys for lanes that need refresh semantics', () => {
		const first = createWorkspaceSnapshotKey([{ id: 'p1' }], { resolved: 'random' });
		const second = createWorkspaceSnapshotKey([{ id: 'p1' }], { resolved: 'random' });

		expect(first).toMatch(/^resolved:/);
		expect(second).toMatch(/^resolved:/);
		expect(second).not.toBe(first);
	});

	it('builds lane-shaped hydration targets without knowing lane fields', () => {
		const items = [{ id: 'p1' }];

		expect(createWorkspaceHydrationTarget(items, { mode: 'merge', resolvedSnapshotKey: 'hash' })).toEqual({
			mode: 'merge',
			deferred: false,
			snapshotKey: expect.stringMatching(/^resolved:\d+:/),
			items
		});
	});

	it('builds value targets for composite lane payloads', () => {
		const items = {
			types: [{ id: 'at1' }],
			assignments: [{ id: 'da1' }]
		};

		expect(createWorkspaceValueHydrationTarget(items, { mode: 'replace', resolvedSnapshotKey: 'hash' })).toEqual({
			mode: 'replace',
			deferred: false,
			snapshotKey: expect.stringMatching(/^resolved:\d+:/),
			items
		});
	});

	it('builds composite keys from multiple parts', () => {
		const deferredPart = Promise.resolve(['late']);
		const first = createCompositeWorkspaceSnapshotKey(
			{ deferredPart, rangeStart: '2026-01-01', rangeEnd: '2026-01-31' },
			{ resolved: 'hash' }
		);
		const second = createCompositeWorkspaceSnapshotKey(
			{ deferredPart, rangeStart: '2026-01-01', rangeEnd: '2026-01-31' },
			{ resolved: 'hash' }
		);
		const samePartsDifferentOrder = createCompositeWorkspaceSnapshotKey(
			{ rangeEnd: '2026-01-31', deferredPart, rangeStart: '2026-01-01' },
			{ resolved: 'hash' }
		);

		expect(second).toBe(first);
		expect(samePartsDifferentOrder).toBe(first);
		expect(first).toMatch(/^resolved:\d+:/);
	});
});
