import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dailyAssignmentsStore } from './dailyAssignments.svelte';

function mockFetch(response: unknown, status = 200) {
	return vi.fn().mockResolvedValue({
		ok: status >= 200 && status < 300,
		status,
		json: () => Promise.resolve(response)
	});
}

const guardType = {
	id: '1',
	name: 'Guard',
	shortName: 'GD',
	assignTo: 'personnel' as const,
	color: '#000',
	exemptPersonnelIds: [],
	showInDateHeader: false
};

describe('regression: delete type then add type flow', () => {
	it('should show new type after deleting old type and adding new one', async () => {
		vi.restoreAllMocks();

		// Setup: load store with one type
		const typeA = {
			id: 'type-a',
			name: 'Old Type',
			shortName: 'OT',
			assignTo: 'personnel' as const,
			color: '#000',
			exemptPersonnelIds: []
		};
		dailyAssignmentsStore.load([typeA], [], 'org-1');
		expect(dailyAssignmentsStore.types).toEqual([typeA]);

		// Step 1: Delete typeA
		vi.stubGlobal('fetch', mockFetch(typeA));
		const deleteResult = await dailyAssignmentsStore.removeType('type-a');
		expect(deleteResult).toBe(true);
		expect(dailyAssignmentsStore.types).toEqual([]);

		// Step 2: Add typeB
		const typeB = {
			id: 'type-b',
			name: 'New Type',
			shortName: 'NT',
			assignTo: 'personnel' as const,
			color: '#fff',
			exemptPersonnelIds: []
		};
		vi.stubGlobal('fetch', mockFetch(typeB));
		const addResult = await dailyAssignmentsStore.addType({
			name: 'New Type',
			shortName: 'NT',
			assignTo: 'personnel',
			color: '#fff',
			exemptPersonnelIds: []
		});
		expect(addResult).toEqual(typeB);

		// Step 3: Verify store has ONLY typeB, not typeA
		expect(dailyAssignmentsStore.types).toEqual([typeB]);
		expect(dailyAssignmentsStore.types).not.toContainEqual(typeA);
	});
});

describe('dailyAssignmentsStore - core primitives composition', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		dailyAssignmentsStore.load([], [], 'org-1');
	});

	describe('load', () => {
		it('should set types and assignments on load', () => {
			const assignment = { id: 'a1', date: '2026-03-20', assignmentTypeId: '1', assigneeId: 'p1' };
			dailyAssignmentsStore.load([guardType], [assignment], 'org-1');
			expect(dailyAssignmentsStore.types).toEqual([guardType]);
			expect(dailyAssignmentsStore.assignments).toEqual([assignment]);
		});

		it('should allow load when org changes during in-flight mutation', async () => {
			let resolveFetch!: (value: unknown) => void;
			vi.stubGlobal(
				'fetch',
				vi.fn().mockReturnValue(
					new Promise((resolve) => {
						resolveFetch = resolve;
					}).then(() => ({ ok: true, status: 200, json: () => Promise.resolve({}) }))
				)
			);

			dailyAssignmentsStore.addType({
				name: 'CQ',
				shortName: 'CQ',
				assignTo: 'personnel',
				color: '#fff',
				exemptPersonnelIds: []
			});

			// Different org — should go through
			dailyAssignmentsStore.load(
				[
					{
						id: '10',
						name: 'Other',
						shortName: 'OT',
						assignTo: 'group' as const,
						color: '#aaa',
						exemptPersonnelIds: []
					}
				],
				[],
				'org-2'
			);

			expect(dailyAssignmentsStore.types).toEqual([
				{ id: '10', name: 'Other', shortName: 'OT', assignTo: 'group', color: '#aaa', exemptPersonnelIds: [] }
			]);

			resolveFetch(undefined);
		});
	});

	describe('addType', () => {
		it('should optimistically add and reconcile with server response', async () => {
			const serverType = {
				id: 'server-1',
				name: 'CQ',
				shortName: 'CQ',
				assignTo: 'personnel' as const,
				color: '#fff',
				exemptPersonnelIds: []
			};
			vi.stubGlobal('fetch', mockFetch(serverType));

			const result = await dailyAssignmentsStore.addType({
				name: 'CQ',
				shortName: 'CQ',
				assignTo: 'personnel',
				color: '#fff',
				exemptPersonnelIds: []
			});

			expect(result).toEqual(serverType);
			expect(dailyAssignmentsStore.types).toEqual([serverType]);
		});

		it('should rollback on failure', async () => {
			vi.stubGlobal('fetch', mockFetch(null, 500));

			const result = await dailyAssignmentsStore.addType({
				name: 'CQ',
				shortName: 'CQ',
				assignTo: 'personnel',
				color: '#fff',
				exemptPersonnelIds: []
			});

			expect(result).toBeNull();
			expect(dailyAssignmentsStore.types).toEqual([]);
		});

		it('should not clobber optimistic addType when load is called mid-flight', async () => {
			dailyAssignmentsStore.load([guardType], [], 'org-1');

			let resolveFetch!: (value: unknown) => void;
			const fetchPromise = new Promise((resolve) => {
				resolveFetch = resolve;
			});
			vi.stubGlobal(
				'fetch',
				vi.fn().mockReturnValue(
					fetchPromise.then(() => ({
						ok: true,
						status: 200,
						json: () =>
							Promise.resolve({
								id: 'server-2',
								name: 'CQ',
								shortName: 'CQ',
								assignTo: 'personnel',
								color: '#fff',
								exemptPersonnelIds: []
							})
					}))
				)
			);

			const addPromise = dailyAssignmentsStore.addType({
				name: 'CQ',
				shortName: 'CQ',
				assignTo: 'personnel',
				color: '#fff',
				exemptPersonnelIds: []
			});

			expect(dailyAssignmentsStore.types.length).toBe(2);

			// Stale load arrives
			dailyAssignmentsStore.load([guardType], [], 'org-1');

			expect(dailyAssignmentsStore.types.length).toBe(2);
			expect(dailyAssignmentsStore.types.some((t) => t.name === 'CQ')).toBe(true);

			resolveFetch(undefined);
			await addPromise;
		});
	});

	describe('updateType', () => {
		it('should optimistically update and reconcile', async () => {
			dailyAssignmentsStore.load([guardType], [], 'org-1');
			const updated = { ...guardType, name: 'Guard Updated' };
			vi.stubGlobal('fetch', mockFetch(updated));

			const result = await dailyAssignmentsStore.updateType('1', { name: 'Guard Updated' });
			expect(result).toBe(true);
			expect(dailyAssignmentsStore.types[0].name).toBe('Guard Updated');
		});

		it('should rollback on failure', async () => {
			dailyAssignmentsStore.load([guardType], [], 'org-1');
			vi.stubGlobal('fetch', mockFetch(null, 500));

			const result = await dailyAssignmentsStore.updateType('1', { name: 'Failed' });
			expect(result).toBe(false);
			expect(dailyAssignmentsStore.types[0].name).toBe('Guard');
		});

		it('should return false for non-existent id', async () => {
			const result = await dailyAssignmentsStore.updateType('nonexistent', { name: 'X' });
			expect(result).toBe(false);
		});
	});

	describe('removeType', () => {
		it('should optimistically remove type and cascade assignments', async () => {
			const assignment = { id: 'a1', date: '2026-03-20', assignmentTypeId: '1', assigneeId: 'p1' };
			dailyAssignmentsStore.load([guardType], [assignment], 'org-1');

			vi.stubGlobal(
				'fetch',
				vi.fn().mockResolvedValue({
					ok: true,
					status: 200,
					json: () => Promise.resolve({})
				})
			);

			const result = await dailyAssignmentsStore.removeType('1');
			expect(result).toBe(true);
			expect(dailyAssignmentsStore.types).toEqual([]);
			expect(dailyAssignmentsStore.assignments).toEqual([]);
		});

		it('should rollback type and assignments on failure', async () => {
			const assignment = { id: 'a1', date: '2026-03-20', assignmentTypeId: '1', assigneeId: 'p1' };
			dailyAssignmentsStore.load([guardType], [assignment], 'org-1');

			vi.stubGlobal('fetch', mockFetch(null, 500));

			const result = await dailyAssignmentsStore.removeType('1');
			expect(result).toBe(false);
			expect(dailyAssignmentsStore.types).toEqual([guardType]);
			expect(dailyAssignmentsStore.assignments).toEqual([assignment]);
		});

		it('should return false for non-existent id', async () => {
			const result = await dailyAssignmentsStore.removeType('nonexistent');
			expect(result).toBe(false);
		});
	});

	describe('setAssignment', () => {
		it('should optimistically set and reconcile', async () => {
			const serverAssignment = { id: 'sa1', date: '2026-03-20', assignmentTypeId: 'type-1', assigneeId: 'p1' };
			vi.stubGlobal('fetch', mockFetch(serverAssignment));

			const result = await dailyAssignmentsStore.setAssignment('2026-03-20', 'type-1', 'p1');
			expect(result).toBe(true);
			expect(dailyAssignmentsStore.assignments).toEqual([serverAssignment]);
		});

		it('should not clobber optimistic setAssignment when load is called mid-flight', async () => {
			dailyAssignmentsStore.load([{ ...guardType, id: 'type-1' }], [], 'org-1');

			let resolveFetch!: (value: unknown) => void;
			const fetchPromise = new Promise((resolve) => {
				resolveFetch = resolve;
			});
			vi.stubGlobal(
				'fetch',
				vi.fn().mockReturnValue(
					fetchPromise.then(() => ({
						ok: true,
						status: 200,
						json: () =>
							Promise.resolve({
								id: 'server-a1',
								date: '2026-03-17',
								assignmentTypeId: 'type-1',
								assigneeId: 'person-1'
							})
					}))
				)
			);

			const setPromise = dailyAssignmentsStore.setAssignment('2026-03-17', 'type-1', 'person-1');

			expect(dailyAssignmentsStore.assignments.length).toBe(1);

			// Stale load
			dailyAssignmentsStore.load([{ ...guardType, id: 'type-1' }], [], 'org-1');

			expect(dailyAssignmentsStore.assignments.length).toBe(1);

			resolveFetch(undefined);
			await setPromise;
		});

		it('should rollback on failure', async () => {
			vi.stubGlobal('fetch', mockFetch(null, 500));

			const result = await dailyAssignmentsStore.setAssignment('2026-03-20', 'type-1', 'p1');
			expect(result).toBe(false);
			expect(dailyAssignmentsStore.assignments).toEqual([]);
		});
	});

	describe('removeAssignment', () => {
		it('should optimistically remove and confirm', async () => {
			const assignment = { id: 'a1', date: '2026-03-20', assignmentTypeId: 'type-1', assigneeId: 'p1' };
			dailyAssignmentsStore.load([], [assignment], 'org-1');

			vi.stubGlobal('fetch', mockFetch({}));

			const result = await dailyAssignmentsStore.removeAssignment('2026-03-20', 'type-1');
			expect(result).toBe(true);
			expect(dailyAssignmentsStore.assignments).toEqual([]);
		});

		it('should rollback on failure', async () => {
			const assignment = { id: 'a1', date: '2026-03-20', assignmentTypeId: 'type-1', assigneeId: 'p1' };
			dailyAssignmentsStore.load([], [assignment], 'org-1');

			vi.stubGlobal('fetch', mockFetch(null, 500));

			const result = await dailyAssignmentsStore.removeAssignment('2026-03-20', 'type-1');
			expect(result).toBe(false);
			expect(dailyAssignmentsStore.assignments).toEqual([assignment]);
		});

		it('should return false for non-existent assignment', async () => {
			const result = await dailyAssignmentsStore.removeAssignment('2026-03-20', 'type-1');
			expect(result).toBe(false);
		});
	});

	describe('query methods', () => {
		const assignments = [
			{ id: 'a1', date: '2026-03-20', assignmentTypeId: 'type-1', assigneeId: 'p1' },
			{ id: 'a2', date: '2026-03-20', assignmentTypeId: 'type-2', assigneeId: 'p2' },
			{ id: 'a3', date: '2026-03-21', assignmentTypeId: 'type-1', assigneeId: 'p1' },
			{ id: 'a4', date: '2026-03-20', assignmentTypeId: 'type-3', assigneeId: 'group-alpha' }
		];

		beforeEach(() => {
			dailyAssignmentsStore.load([guardType], assignments, 'org-1');
		});

		it('getTypeById returns correct type', () => {
			expect(dailyAssignmentsStore.getTypeById('1')).toEqual(guardType);
			expect(dailyAssignmentsStore.getTypeById('nonexistent')).toBeUndefined();
		});

		it('getAssignmentsForDate returns correct assignments', () => {
			const result = dailyAssignmentsStore.getAssignmentsForDate('2026-03-20');
			expect(result.length).toBe(3);
		});

		it('getAssignmentForDate returns single assignment', () => {
			const result = dailyAssignmentsStore.getAssignmentForDate('2026-03-20', 'type-1');
			expect(result).toEqual(assignments[0]);
		});

		it('getAssignmentsForPersonnel returns correct assignments', () => {
			const result = dailyAssignmentsStore.getAssignmentsForPersonnel('p1');
			expect(result.length).toBe(2);
		});

		it('getAssignmentsForGroup returns correct assignments', () => {
			const result = dailyAssignmentsStore.getAssignmentsForGroup('group-alpha');
			expect(result.length).toBe(1);
		});

		it('getPersonnelAssignmentsForDate returns correct assignments', () => {
			const result = dailyAssignmentsStore.getPersonnelAssignmentsForDate('p1', '2026-03-20');
			expect(result.length).toBe(1);
			expect(result[0]).toEqual(assignments[0]);
		});
	});

	describe('showInDateHeader field', () => {
		it('loads a type with showInDateHeader: true and exposes it', () => {
			const featuredType = { ...guardType, id: 'f1', showInDateHeader: true };
			dailyAssignmentsStore.load([guardType, featuredType], [], 'org-1');
			const found = dailyAssignmentsStore.getTypeById('f1');
			expect(found?.showInDateHeader).toBe(true);
		});

		it('updateType can set showInDateHeader to true on a type', async () => {
			dailyAssignmentsStore.load([guardType], [], 'org-1');
			const updated = { ...guardType, showInDateHeader: true };
			vi.stubGlobal('fetch', mockFetch(updated));
			const result = await dailyAssignmentsStore.updateType('1', { showInDateHeader: true });
			expect(result).toBe(true);
			expect(dailyAssignmentsStore.getTypeById('1')?.showInDateHeader).toBe(true);
		});
	});

	describe('setAssignmentBatch', () => {
		it('should optimistically batch set and reconcile', async () => {
			const inserted = [
				{ id: 'sa1', date: '2026-03-20', assignmentTypeId: 'type-1', assigneeId: 'p1' },
				{ id: 'sa2', date: '2026-03-20', assignmentTypeId: 'type-2', assigneeId: 'p2' }
			];
			vi.stubGlobal('fetch', mockFetch({ inserted }));

			const result = await dailyAssignmentsStore.setAssignmentBatch([
				{ date: '2026-03-20', assignmentTypeId: 'type-1', assigneeId: 'p1' },
				{ date: '2026-03-20', assignmentTypeId: 'type-2', assigneeId: 'p2' }
			]);

			expect(result).toBe(true);
			expect(dailyAssignmentsStore.assignments).toEqual(inserted);
		});

		it('should rollback batch on failure', async () => {
			const existing = { id: 'a1', date: '2026-03-20', assignmentTypeId: 'type-1', assigneeId: 'p-old' };
			dailyAssignmentsStore.load([], [existing], 'org-1');

			vi.stubGlobal('fetch', mockFetch(null, 500));

			const result = await dailyAssignmentsStore.setAssignmentBatch([
				{ date: '2026-03-20', assignmentTypeId: 'type-1', assigneeId: 'p-new' }
			]);

			expect(result).toBe(false);
			expect(dailyAssignmentsStore.assignments).toEqual([existing]);
		});
	});
});
