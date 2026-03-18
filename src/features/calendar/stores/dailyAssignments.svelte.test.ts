import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dailyAssignmentsStore } from './dailyAssignments.svelte';

function mockFetch(response: unknown, status = 200) {
	return vi.fn().mockResolvedValue({
		ok: status >= 200 && status < 300,
		status,
		json: () => Promise.resolve(response)
	});
}

describe('dailyAssignmentsStore - load during in-flight mutations (issue #113)', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		dailyAssignmentsStore.load([], [], 'org-1');
	});

	it('should not clobber optimistic addType when load is called mid-flight', async () => {
		dailyAssignmentsStore.load(
			[{ id: '1', name: 'Guard', shortName: 'GD', assignTo: 'personnel', color: '#000', exemptPersonnelIds: [] }],
			[],
			'org-1'
		);

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

		// Optimistic item should be present
		expect(dailyAssignmentsStore.types.length).toBe(2);

		// Stale load arrives (only has original type)
		dailyAssignmentsStore.load(
			[{ id: '1', name: 'Guard', shortName: 'GD', assignTo: 'personnel', color: '#000', exemptPersonnelIds: [] }],
			[],
			'org-1'
		);

		// Should NOT clobber optimistic add
		expect(dailyAssignmentsStore.types.length).toBe(2);
		expect(dailyAssignmentsStore.types.some((t) => t.name === 'CQ')).toBe(true);

		resolveFetch(undefined);
		await addPromise;
	});

	it('should not clobber optimistic setAssignment when load is called mid-flight', async () => {
		dailyAssignmentsStore.load(
			[
				{
					id: 'type-1',
					name: 'Guard',
					shortName: 'GD',
					assignTo: 'personnel' as const,
					color: '#000',
					exemptPersonnelIds: []
				}
			],
			[],
			'org-1'
		);

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
						Promise.resolve({ id: 'server-a1', date: '2026-03-17', assignmentTypeId: 'type-1', assigneeId: 'person-1' })
				}))
			)
		);

		const setPromise = dailyAssignmentsStore.setAssignment('2026-03-17', 'type-1', 'person-1');

		// Optimistic assignment should exist
		expect(dailyAssignmentsStore.assignments.length).toBe(1);

		// Stale load (no assignments)
		dailyAssignmentsStore.load(
			[
				{
					id: 'type-1',
					name: 'Guard',
					shortName: 'GD',
					assignTo: 'personnel' as const,
					color: '#000',
					exemptPersonnelIds: []
				}
			],
			[],
			'org-1'
		);

		// Should NOT clobber
		expect(dailyAssignmentsStore.assignments.length).toBe(1);

		resolveFetch(undefined);
		await setPromise;
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
			[{ id: '10', name: 'Other', shortName: 'OT', assignTo: 'group', color: '#aaa', exemptPersonnelIds: [] }],
			[],
			'org-2'
		);

		expect(dailyAssignmentsStore.types).toEqual([
			{ id: '10', name: 'Other', shortName: 'OT', assignTo: 'group', color: '#aaa', exemptPersonnelIds: [] }
		]);

		resolveFetch(undefined);
	});
});
