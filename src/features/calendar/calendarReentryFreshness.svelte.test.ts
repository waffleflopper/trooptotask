// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calendarWorkspaceHydrator } from './calendarWorkspaceHydration.svelte';
import { availabilityStore } from './stores/availability.svelte';
import { specialDaysStore } from './stores/specialDays.svelte';
import { dailyAssignmentsStore } from './stores/dailyAssignments.svelte';
import { endOrganizationLifetime } from '$lib/stores/core';
import { confirmedChangesSentNow } from '$lib/test-support/confirmedChangeCookies';
import type { CalendarWorkspaceHydration } from './calendar.types';
import type { AssignmentType, AvailabilityEntry, DailyAssignment, SpecialDay } from './contracts';

const OCTOBER = { rangeStart: '2026-10-01', rangeEnd: '2026-10-31' };
const DECEMBER = { rangeStart: '2026-12-01', rangeEnd: '2026-12-31' };
const CATALOG_YEARS = { rangeStart: '2025-01-01', rangeEnd: '2028-12-31' };

const leave = (id: string, date = '2026-10-14', note: string | null = null): AvailabilityEntry => ({
	id,
	personnelId: 'p1',
	statusTypeId: 'leave',
	startDate: date,
	endDate: date,
	note
});
const closure = (id: string, date = '2026-10-20'): SpecialDay => ({
	id,
	name: `Closure ${id}`,
	date,
	type: 'org-closure'
});
const duty = (id: string, date = '2026-10-09', assigneeId = 'p1'): DailyAssignment => ({
	id,
	date,
	assignmentTypeId: 'cq',
	assigneeId
});
const runnerDuty = (id: string, date: string): DailyAssignment => ({
	id,
	date,
	assignmentTypeId: 'rt',
	assigneeId: 'g1'
});
const chargeOfQuarters: AssignmentType = {
	id: 'cq',
	name: 'Charge of Quarters',
	shortName: 'CQ',
	assignTo: 'personnel',
	color: '#2563eb',
	exemptPersonnelIds: [],
	showOnCalendar: false,
	sortOrder: 0
};
const runnerTeam: AssignmentType = {
	...chargeOfQuarters,
	id: 'rt',
	name: 'Runner Team',
	shortName: 'RT',
	assignTo: 'group'
};

type Rows = {
	availability: AvailabilityEntry[] | Promise<AvailabilityEntry[]>;
	specialDays: SpecialDay[] | Promise<SpecialDay[]>;
	assignments: DailyAssignment[] | Promise<DailyAssignment[]>;
	types?: AssignmentType[];
};

// Mirrors the targets the server delivery streams; building one is the request leaving the browser.
function workspace(rows: Rows, range = OCTOBER, specialDaysRange = CATALOG_YEARS): CalendarWorkspaceHydration {
	const key = crypto.randomUUID();
	return {
		orgId: '',
		confirmedChangesByTab: confirmedChangesSentNow(),
		personnel: { mode: 'replace', snapshotKey: key, items: [] },
		groups: { mode: 'replace', snapshotKey: key, items: [] },
		statusTypes: { mode: 'replace', snapshotKey: key, items: [] },
		pinnedGroups: { mode: 'replace', snapshotKey: key, items: [] },
		availabilityEntries: { mode: 'range', snapshotKey: key, items: rows.availability, range },
		specialDays: { mode: 'range', snapshotKey: key, items: rows.specialDays, range: specialDaysRange },
		calendarAssignments: {
			mode: 'range',
			snapshotKey: key,
			range,
			items: Promise.resolve(rows.assignments).then((assignments) => ({ types: rows.types ?? [], assignments }))
		}
	};
}

function enter(orgId: string, data: CalendarWorkspaceHydration) {
	calendarWorkspaceHydrator.reset();
	return calendarWorkspaceHydrator.hydrate({ ...data, orgId });
}

function held<T>() {
	let release!: (value: T) => void;
	const promise = new Promise<T>((resolve) => (release = resolve));
	return { promise, release };
}

function heldSnapshot() {
	const availability = held<AvailabilityEntry[]>();
	const specialDays = held<SpecialDay[]>();
	const assignments = held<DailyAssignment[]>();
	return {
		rows: { availability: availability.promise, specialDays: specialDays.promise, assignments: assignments.promise },
		release(rows: { availability: AvailabilityEntry[]; specialDays: SpecialDay[]; assignments: DailyAssignment[] }) {
			availability.release(rows.availability);
			specialDays.release(rows.specialDays);
			assignments.release(rows.assignments);
		}
	};
}

let savedIds = 0;
let failingRequests: string[] = [];
let savedTypes: AssignmentType[] = [];

function serverAcknowledges() {
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string, init?: RequestInit) => {
			const method = init?.method ?? 'GET';
			if (failingRequests.includes(`${method} ${url}`)) return Response.json({ error: 'Not saved' }, { status: 500 });
			const body = init?.body ? JSON.parse(String(init.body)) : {};
			if (method === 'GET' && url.endsWith('/api/assignment-types')) return Response.json(savedTypes);
			if (url.endsWith('/api/daily-assignments/batch')) {
				const records: Omit<DailyAssignment, 'id'>[] = body.records;
				return Response.json({
					inserted: records
						.filter((record) => record.assigneeId)
						.map((record) => ({ id: `saved-${++savedIds}`, ...record }))
				});
			}
			if (method === 'DELETE') return Response.json({ success: true });
			if (method === 'PUT') return Response.json(body);
			if (body.action === 'addClosureDays') {
				const dates: string[] = body.dates;
				return Response.json({
					created: dates.map((date) => ({ id: `saved-${++savedIds}`, name: body.name, date, type: 'org-closure' }))
				});
			}
			return Response.json({ id: `saved-${++savedIds}`, ...body });
		})
	);
}

const ids = (items: { id: string }[]) => items.map((item) => item.id).sort();

describe('Calendar re-entry freshness', () => {
	beforeEach(async () => {
		calendarWorkspaceHydrator.restrict();
		endOrganizationLifetime();
		savedIds = 0;
		failingRequests = [];
		savedTypes = [];
		serverAcknowledges();
		await enter(
			'org-1',
			workspace({
				availability: [leave('a1'), leave('a2', '2026-10-15')],
				specialDays: [closure('c1'), closure('c2', '2026-10-21')],
				assignments: [duty('x1'), duty('x2', '2026-10-10')]
			})
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('removes rows another member deleted when the user re-enters Calendar', async () => {
		await enter(
			'org-1',
			workspace({ availability: [leave('a1')], specialDays: [closure('c1')], assignments: [duty('x1')] })
		);

		expect(ids(availabilityStore.items)).toEqual(['a1']);
		expect(ids(specialDaysStore.items)).toEqual(['c1']);
		expect(ids(dailyAssignmentsStore.assignments)).toEqual(['x1']);
	});

	it("applies another member's edit on re-entry", async () => {
		await enter(
			'org-1',
			workspace({
				availability: [leave('a1', '2026-10-16', 'Moved by B'), leave('a2', '2026-10-15')],
				specialDays: [{ ...closure('c1'), name: 'Renamed by B' }, closure('c2', '2026-10-21')],
				assignments: [duty('x1', '2026-10-09', 'p2'), duty('x2', '2026-10-10')]
			})
		);

		expect(availabilityStore.getById('a1')).toEqual(leave('a1', '2026-10-16', 'Moved by B'));
		expect(specialDaysStore.getById('c1')?.name).toBe('Renamed by B');
		expect(dailyAssignmentsStore.assignments.find((row) => row.id === 'x1')?.assigneeId).toBe('p2');
	});

	it('keeps saves the server confirmed while the re-entry snapshot was in flight', async () => {
		const snapshot = heldSnapshot();
		const reentry = enter('org-1', workspace(snapshot.rows));

		await availabilityStore.add({
			personnelId: 'p1',
			statusTypeId: 'leave',
			startDate: '2026-10-22',
			endDate: '2026-10-22'
		});
		await availabilityStore.update('a1', { note: 'Saved by A' });
		await specialDaysStore.addClosureDays({ name: 'Closure by A', dates: ['2026-10-23'] });
		await dailyAssignmentsStore.setAssignment('2026-10-12', 'cq', 'p3');

		snapshot.release({
			availability: [leave('a1'), leave('a2', '2026-10-15')],
			specialDays: [closure('c1'), closure('c2', '2026-10-21')],
			assignments: [duty('x1'), duty('x2', '2026-10-10')]
		});
		await reentry;

		expect(ids(availabilityStore.items)).toEqual(['a1', 'a2', 'saved-1']);
		expect(availabilityStore.getById('a1')?.note).toBe('Saved by A');
		expect(ids(specialDaysStore.items)).toEqual(['c1', 'c2', 'saved-2']);
		expect(dailyAssignmentsStore.getAssignmentForDate('2026-10-12', 'cq')).toEqual(duty('saved-3', '2026-10-12', 'p3'));
	});

	it('keeps a daily assignment the server confirmed while the re-entry snapshot was in flight', async () => {
		const snapshot = heldSnapshot();
		const reentry = enter('org-1', workspace(snapshot.rows));

		await dailyAssignmentsStore.setAssignment('2026-10-12', 'cq', 'p3');

		snapshot.release({
			availability: [leave('a1'), leave('a2', '2026-10-15')],
			specialDays: [closure('c1'), closure('c2', '2026-10-21')],
			assignments: [duty('x1'), duty('x2', '2026-10-10')]
		});
		await reentry;

		expect(ids(dailyAssignmentsStore.assignments)).toEqual(['saved-1', 'x1', 'x2']);
	});

	it('keeps rows deleted locally while the re-entry snapshot was in flight deleted', async () => {
		const snapshot = heldSnapshot();
		const reentry = enter('org-1', workspace(snapshot.rows));

		await availabilityStore.remove('a2');
		await specialDaysStore.remove('c2');
		await dailyAssignmentsStore.removeAssignment('2026-10-10', 'cq');

		snapshot.release({
			availability: [leave('a1'), leave('a2', '2026-10-15')],
			specialDays: [closure('c1'), closure('c2', '2026-10-21')],
			assignments: [duty('x1'), duty('x2', '2026-10-10')]
		});
		await reentry;

		expect(ids(availabilityStore.items)).toEqual(['a1']);
		expect(ids(specialDaysStore.items)).toEqual(['c1']);
		expect(ids(dailyAssignmentsStore.assignments)).toEqual(['x1']);
	});

	it('does not restore a save the server rejected while the snapshot was in flight', async () => {
		failingRequests = ['POST /org/org-1/api/availability'];
		const snapshot = heldSnapshot();
		const reentry = enter('org-1', workspace(snapshot.rows));

		await expect(
			availabilityStore.add({
				personnelId: 'p1',
				statusTypeId: 'leave',
				startDate: '2026-10-22',
				endDate: '2026-10-22'
			})
		).rejects.toThrow();

		snapshot.release({ availability: [leave('a1')], specialDays: [closure('c1')], assignments: [duty('x1')] });
		await reentry;

		expect(ids(availabilityStore.items)).toEqual(['a1']);
	});

	it('stops re-applying a confirmed save once no older snapshot is outstanding', async () => {
		const snapshot = heldSnapshot();
		const reentry = enter('org-1', workspace(snapshot.rows));
		await availabilityStore.add({
			personnelId: 'p1',
			statusTypeId: 'leave',
			startDate: '2026-10-22',
			endDate: '2026-10-22'
		});
		snapshot.release({ availability: [leave('a1')], specialDays: [closure('c1')], assignments: [duty('x1')] });
		await reentry;

		await enter(
			'org-1',
			workspace({ availability: [leave('a1')], specialDays: [closure('c1')], assignments: [duty('x1')] })
		);

		expect(ids(availabilityStore.items)).toEqual(['a1']);
	});

	it('leaves rows outside the snapshot range untouched', async () => {
		await enter(
			'org-1',
			workspace(
				{
					availability: [leave('dec', '2026-12-04')],
					specialDays: [closure('later', '2030-07-04')],
					assignments: [duty('dec-duty', '2026-12-04')]
				},
				DECEMBER,
				{ rangeStart: '2026-12-01', rangeEnd: '2030-12-31' }
			)
		);

		await enter(
			'org-1',
			workspace({ availability: [leave('a1')], specialDays: [closure('c1')], assignments: [duty('x1')] }, OCTOBER, {
				rangeStart: '2026-01-01',
				rangeEnd: '2026-11-30'
			})
		);

		expect(ids(availabilityStore.items)).toEqual(['a1', 'dec']);
		expect(ids(specialDaysStore.items)).toEqual(['c1', 'later']);
		expect(ids(dailyAssignmentsStore.assignments)).toEqual(['dec-duty', 'x1']);
	});

	it('shows only the returning Organization after an A to B to A switch', async () => {
		endOrganizationLifetime();
		await enter('org-2', workspace({ availability: [leave('b1')], specialDays: [closure('b-c1')], assignments: [] }));
		endOrganizationLifetime();
		await enter(
			'org-1',
			workspace({ availability: [leave('a1')], specialDays: [closure('c1')], assignments: [duty('x1')] })
		);

		expect(availabilityStore.orgId).toBe('org-1');
		expect(ids(availabilityStore.items)).toEqual(['a1']);
		expect(ids(specialDaysStore.items)).toEqual(['c1']);
		expect(ids(dailyAssignmentsStore.assignments)).toEqual(['x1']);
	});

	it('keeps changes confirmed after the request left but before its response arrived', async () => {
		const request = workspace({
			availability: [leave('a1'), leave('a2', '2026-10-15')],
			specialDays: [closure('c1'), closure('c2', '2026-10-21')],
			assignments: [duty('x1'), duty('x2', '2026-10-10')]
		});
		await availabilityStore.add({
			personnelId: 'p1',
			statusTypeId: 'leave',
			startDate: '2026-10-22',
			endDate: '2026-10-22'
		});
		await specialDaysStore.remove('c2');

		await enter('org-1', request);

		expect(ids(availabilityStore.items)).toEqual(['a1', 'a2', 'saved-1']);
		expect(ids(specialDaysStore.items)).toEqual(['c1']);
	});

	it("shows another member's later edit to a row saved before the request left", async () => {
		await availabilityStore.update('a1', { note: 'Saved by A' });
		const request = workspace({
			availability: [leave('a1', '2026-10-14', 'Edited later by B'), leave('a2', '2026-10-15')],
			specialDays: [closure('c1'), closure('c2', '2026-10-21')],
			assignments: [duty('x1'), duty('x2', '2026-10-10')]
		});

		await enter('org-1', request);

		expect(availabilityStore.getById('a1')?.note).toBe('Edited later by B');
	});

	it('changes nothing when a full Special Days read adopted after the request left', async () => {
		const request = workspace({
			availability: [leave('a1'), leave('a2', '2026-10-15')],
			specialDays: [closure('c1'), closure('old-holiday', '2026-01-01')],
			assignments: [duty('x1'), duty('x2', '2026-10-10')]
		});
		const holiday = { id: 'new-holiday', name: 'New Year', date: '2026-01-01', type: 'federal-holiday' as const };
		let acknowledgeReset!: () => void;
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_url: string, init?: RequestInit) => {
				if (!init) return Response.json([closure('c1'), holiday, closure('saved-1', '2026-10-23')]);
				if (JSON.parse(String(init.body)).action === 'resetFederalHolidays') {
					return new Promise<Response>((resolve) => (acknowledgeReset = () => resolve(Response.json([holiday]))));
				}
				return Response.json({ created: [closure('saved-1', '2026-10-23')] });
			})
		);
		const reset = specialDaysStore.resetFederalHolidays();
		await specialDaysStore.addClosureDays({ name: 'Closure by A', dates: ['2026-10-23'] });
		acknowledgeReset();
		expect(await reset).toBe('saved');

		await enter('org-1', request);

		expect(ids(specialDaysStore.items)).toEqual(['c1', 'new-holiday', 'saved-1']);
	});

	it('does not apply a held snapshot after the user switched to another Organization', async () => {
		const held = heldSnapshot();
		const staleEntry = enter('org-1', workspace(held.rows));
		endOrganizationLifetime();
		await enter('org-2', workspace({ availability: [leave('b1')], specialDays: [closure('b-c1')], assignments: [] }));

		held.release({ availability: [leave('a1')], specialDays: [closure('c1')], assignments: [duty('x1')] });
		await staleEntry;

		expect(availabilityStore.orgId).toBe('org-2');
		expect(ids(availabilityStore.items)).toEqual(['b1']);
		expect(ids(specialDaysStore.items)).toEqual(['b-c1']);
		expect(ids(dailyAssignmentsStore.assignments)).toEqual([]);
	});

	describe('after the server deletes rows by type or slot', () => {
		const empty = { availability: [], specialDays: [] };

		async function enterWithRunnerTeam() {
			await enter(
				'org-1',
				workspace({
					...empty,
					assignments: [duty('x1'), runnerDuty('r1', '2026-10-12')],
					types: [chargeOfQuarters, runnerTeam]
				})
			);
			savedTypes = [chargeOfQuarters];
		}

		it("keeps a deleted type's held rows deleted when an older snapshot arrives after the delete", async () => {
			await enterWithRunnerTeam();
			const snapshot = heldSnapshot();
			const reentry = enter('org-1', workspace({ ...snapshot.rows, types: [chargeOfQuarters, runnerTeam] }));

			expect(await dailyAssignmentsStore.removeType('rt')).toBe(true);
			snapshot.release({ ...empty, assignments: [duty('x1'), runnerDuty('r1', '2026-10-12')] });
			await reentry;

			expect(ids(dailyAssignmentsStore.assignments)).toEqual(['x1']);
			await vi.waitFor(() => expect(dailyAssignmentsStore.types).toEqual([chargeOfQuarters]));
		});

		it("removes a deleted type's rows this tab never loaded when an older snapshot arrives after the delete", async () => {
			await enterWithRunnerTeam();
			const snapshot = heldSnapshot();
			const reentry = enter('org-1', workspace({ ...snapshot.rows, types: [chargeOfQuarters, runnerTeam] }));

			expect(await dailyAssignmentsStore.removeType('rt')).toBe(true);
			snapshot.release({
				...empty,
				assignments: [duty('x1'), runnerDuty('r1', '2026-10-12'), runnerDuty('added-by-b', '2026-10-20')]
			});
			await reentry;

			expect(ids(dailyAssignmentsStore.assignments)).toEqual(['x1']);
			await vi.waitFor(() => expect(dailyAssignmentsStore.types).toEqual([chargeOfQuarters]));
		});

		it("shows only the user's saved assignment when an older snapshot holds another member's row for that slot", async () => {
			const snapshot = heldSnapshot();
			const reentry = enter('org-1', workspace(snapshot.rows));

			expect(await dailyAssignmentsStore.setAssignment('2026-10-10', 'cq', 'p3')).toBe(true);
			snapshot.release({ ...empty, assignments: [duty('x1'), duty('replaced-by-b', '2026-10-10', 'p2')] });
			await reentry;

			expect(dailyAssignmentsStore.getAssignmentsForDate('2026-10-10')).toEqual([duty('saved-1', '2026-10-10', 'p3')]);
			expect(ids(dailyAssignmentsStore.assignments)).toEqual(['saved-1', 'x1']);
		});

		it("keeps a cleared slot empty when an older snapshot holds another member's row for it", async () => {
			const snapshot = heldSnapshot();
			const reentry = enter('org-1', workspace(snapshot.rows));

			expect(await dailyAssignmentsStore.removeAssignment('2026-10-10', 'cq')).toBe(true);
			snapshot.release({ ...empty, assignments: [duty('x1'), duty('replaced-by-b', '2026-10-10', 'p2')] });
			await reentry;

			expect(ids(dailyAssignmentsStore.assignments)).toEqual(['x1']);
		});

		it("applies a batch's saved and cleared slots over another member's rows in an older snapshot", async () => {
			const snapshot = heldSnapshot();
			const reentry = enter('org-1', workspace(snapshot.rows));

			expect(
				await dailyAssignmentsStore.setAssignmentBatch([
					{ date: '2026-10-10', assignmentTypeId: 'cq', assigneeId: 'p3' },
					{ date: '2026-10-11', assignmentTypeId: 'cq', assigneeId: '' }
				])
			).toBe(true);
			snapshot.release({
				...empty,
				assignments: [
					duty('x1'),
					duty('replaced-by-b', '2026-10-10', 'p2'),
					duty('added-by-b', '2026-10-11', 'p4'),
					runnerDuty('other-type', '2026-10-10')
				]
			});
			await reentry;

			expect(ids(dailyAssignmentsStore.assignments)).toEqual(['other-type', 'saved-1', 'x1']);
			expect(dailyAssignmentsStore.getAssignmentForDate('2026-10-10', 'cq')).toEqual(
				duty('saved-1', '2026-10-10', 'p3')
			);
		});
	});
});
