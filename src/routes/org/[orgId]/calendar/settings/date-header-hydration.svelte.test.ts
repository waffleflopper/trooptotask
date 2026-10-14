// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import Layout from '../+layout.svelte';
import SettingsPage from './+page.svelte';
import RouteHarness from '$features/personnel/test-support/PersonnelRouteTestHarness.svelte';
import { createTestContext } from '$features/calendar/calendarPersistence.test-support.server';
import { fetchCalendarBootstrap, listAssignmentTypes } from '$features/calendar/index.server';
import { createCalendarWorkspaceHydration } from '../calendarWorkspaceDelivery.server';
import { calendarWorkspaceHydrator } from '$features/calendar/calendarWorkspaceHydration.svelte';
import { endOrganizationLifetime } from '$lib/stores/core';
import { toastStore } from '$lib/stores/toast.svelte';
import type { AssignmentType, DailyAssignment } from '$features/calendar/contracts';
import { dailyAssignmentsStore, type CalendarWorkspaceResult } from '$features/calendar';

vi.mock('$lib/server/adapters/httpAdapter', () => ({ loadWithContext: vi.fn() }));
vi.mock('$lib/server/adapters/requestContexts.server', () => ({ createRequestCalendarWorkspaceContext: vi.fn() }));
vi.mock('$features/app-shell', async (importOriginal) => ({
	...(await importOriginal<typeof import('$features/app-shell')>()),
	getAppShellContext: () => ({
		orgUrlSegment: 'org-1',
		affordanceForFeatureAction: () => ({ allowed: true, visible: true })
	})
}));

type Gate = { promise: Promise<void>; resolve: () => void };

function gate(): Gate {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => (resolve = done));
	return { promise, resolve };
}

const flags = (types: AssignmentType[]) => Object.fromEntries(types.map((type) => [type.id, type.showInDateHeader]));
const rowFields = (rows: DailyAssignment[]) =>
	rows.map(({ id, date, assignmentTypeId, assigneeId }) => ({ id, date, assignmentTypeId, assigneeId }));
const currentLabel = () =>
	screen
		.getByText(/Currently showing:/)
		.textContent?.replace(/\s+/g, ' ')
		.trim();

const outside = { id: 'outside', date: '2026-06-10', assignmentTypeId: 'sd', assigneeId: 'p-outside' };
const linked = { id: 'linked', date: '2026-10-12', assignmentTypeId: 'rt', assigneeId: 'g-runners' };
const incoming = { id: 'incoming', date: '2026-10-14', assignmentTypeId: 'cq', assigneeId: 'p-incoming' };

function calendarServer() {
	const ctx = createTestContext({ auth: { orgId: 'org-1' } });
	const saved = { organization_id: 'org-1', created_at: '2026-10-01T00:00:00.000Z', archived_at: null };
	ctx.store.seed('assignment_types', [
		{
			...saved,
			id: 'cq',
			name: 'Charge of Quarters',
			short_name: 'CQ',
			assign_to: 'personnel',
			color: '#2563eb',
			sort_order: 0,
			exempt_personnel_ids: [],
			show_in_date_header: true
		},
		{
			...saved,
			id: 'sd',
			name: 'Staff Duty',
			short_name: 'SD',
			assign_to: 'personnel',
			color: '#047857',
			sort_order: 1,
			exempt_personnel_ids: ['p-exempt'],
			show_in_date_header: false
		},
		{
			...saved,
			id: 'rt',
			name: 'Runner Team',
			short_name: 'RT',
			assign_to: 'group',
			color: '#b45309',
			sort_order: 2,
			exempt_personnel_ids: [],
			show_in_date_header: false
		},
		{
			...saved,
			id: 'nw',
			name: 'Night Watch',
			short_name: 'NW',
			assign_to: 'personnel',
			color: '#7c3aed',
			sort_order: 3,
			exempt_personnel_ids: [],
			show_in_date_header: false
		}
	]);
	const events: string[] = [];
	const requests: string[] = [];
	const commit = gate();
	const reply = gate();

	async function readTypes() {
		const snapshot = structuredClone(await listAssignmentTypes(ctx.calendarCatalogs));
		events.push('read types');
		return snapshot;
	}
	async function savedFlags() {
		return flags(await listAssignmentTypes(ctx.calendarCatalogs));
	}
	function seedDaily(rows: DailyAssignment[]) {
		ctx.store.seed(
			'daily_assignments',
			rows.map((row) => ({
				id: row.id,
				organization_id: 'org-1',
				date: row.date,
				assignment_type_id: row.assignmentTypeId,
				assignee_id: row.assigneeId
			}))
		);
	}
	async function produce(rangeStart: string, rangeEnd: string, held?: { daily: Gate; outer: Gate }) {
		const ports = {
			...ctx,
			calendarCatalogs: { ...ctx.calendarCatalogs, listAssignmentTypes: readTypes },
			calendarAssignments: {
				...ctx.calendarAssignments,
				async listRange(range: { rangeStart: string; rangeEnd: string }) {
					const rows = await ctx.calendarAssignments.listRange(range);
					if (held) {
						await held.daily.promise;
						events.push('deliver daily');
					}
					return rows;
				}
			},
			organizationSettings: {
				async findLossWarningWindowDays() {
					if (held) await held.outer.promise;
					return 180;
				}
			}
		};
		const data = {
			...(await fetchCalendarBootstrap(ports, { rangeStart, rangeEnd })),
			activeOnboardingPersonnelIds: []
		};
		return {
			laneKey: 'calendar',
			data,
			hydration: createCalendarWorkspaceHydration('org-1', data)
		} satisfies CalendarWorkspaceResult;
	}
	async function acknowledgeAfter(commitWrites: () => Promise<void>) {
		await commit.promise;
		await commitWrites();
		events.push('commit');
		await reply.promise;
		events.push('reply');
		return Response.json({ success: true });
	}

	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string, init?: RequestInit) => {
			const method = init?.method ?? 'GET';
			requests.push(`${method} ${url}`);
			if (method === 'GET' && url === '/org/org-1/api/assignment-types') {
				events.push('get');
				return Response.json(await readTypes());
			}
			const body = JSON.parse(String(init?.body));
			if (method === 'PUT' && url === '/org/org-1/api/assignment-types/date-header') {
				events.push('put');
				return acknowledgeAfter(async () => {
					for (const id of ['cq', 'sd', 'rt', 'nw'])
						await ctx.store.update('assignment_types', 'org-1', id, {
							show_in_date_header: id === body.assignmentTypeId
						});
				});
			}
			if (method === 'DELETE' && url === '/org/org-1/api/assignment-types') {
				events.push('delete');
				return acknowledgeAfter(async () => {
					await ctx.store.delete('assignment_types', 'org-1', body.id);
					await ctx.store.deleteWhere('daily_assignments', 'org-1', { assignment_type_id: body.id });
				});
			}
			throw new Error(`Unexpected request ${method} ${url}`);
		})
	);
	return { ctx, events, requests, readTypes, savedFlags, seedDaily, produce, commit, reply };
}

type Server = ReturnType<typeof calendarServer>;

function renderCalendarSettings(workspace: Promise<CalendarWorkspaceResult>) {
	return render(RouteHarness, { props: { Layout, Page: SettingsPage, data: { calendar: { data: workspace } } } });
}

async function openAssignmentTypes() {
	await screen.findByRole('heading', { name: 'Calendar Settings' });
	await fireEvent.click(screen.getByRole('tab', { name: /Assignment Types/ }));
}

async function settledCalendar(server: Server) {
	server.seedDaily([outside]);
	const june = renderCalendarSettings(server.produce('2026-06-01', '2026-06-30'));
	await screen.findByRole('heading', { name: 'Calendar Settings' });
	june.unmount();
	server.seedDaily([{ id: 'inside-old', date: '2026-10-10', assignmentTypeId: 'cq', assigneeId: 'p-old' }, linked]);
	const october = renderCalendarSettings(server.produce('2026-10-01', '2026-10-31'));
	await openAssignmentTypes();
	expect(currentLabel()).toContain('Currently showing: Charge of Quarters');
	expect(rowFields(dailyAssignmentsStore.assignments)).toEqual([
		outside,
		{ id: 'inside-old', date: '2026-10-10', assignmentTypeId: 'cq', assigneeId: 'p-old' },
		linked
	]);
	server.events.length = 0;
	return october;
}

async function chooseStaff(server: Server) {
	await fireEvent.click(screen.getByRole('radio', { name: 'Show Staff Duty in date header' }));
	await waitFor(() => expect(server.events).toContain('put'));
	expect(dailyAssignmentsStore.pendingDateHeaderId).toBe('sd');
}

async function acknowledge(server: Server) {
	server.commit.resolve();
	server.reply.resolve();
	await waitFor(() => expect(dailyAssignmentsStore.pendingDateHeaderId).toBeNull());
	expect(flags(dailyAssignmentsStore.types)).toEqual({ cq: false, sd: true, rt: false, nw: false });
}

async function prepareReturningRows(server: Server) {
	await server.ctx.store.delete('daily_assignments', 'org-1', 'inside-old');
	server.seedDaily([incoming]);
}

async function returnToCalendar(
	packet: Promise<CalendarWorkspaceResult>,
	held: { daily: Gate; outer: Gate },
	server: Server
) {
	held.outer.resolve();
	await packet;
	const returning = renderCalendarSettings(packet);
	await waitFor(() => expect(dailyAssignmentsStore.loading).toBe(true));
	server.events.push('outer observed');
	expect(screen.queryByRole('heading', { name: 'Calendar Settings' })).toBeNull();
	return returning;
}

let toasts: string[];

beforeEach(() => {
	endOrganizationLifetime();
	toasts = [];
	vi.spyOn(toastStore, 'error').mockImplementation((message: string) => {
		toasts.push(message);
		return 'toast-id';
	});
});

afterEach(() => {
	cleanup();
	calendarWorkspaceHydrator.restrict();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

it.each([
	[
		'delivers its daily rows after the reply',
		['put', 'read types', 'outer observed', 'commit', 'reply', 'deliver daily', 'get', 'read types']
	],
	[
		'first arrives after the reply',
		['read types', 'put', 'commit', 'reply', 'outer observed', 'deliver daily', 'get', 'read types']
	]
])('keeps a saved header when a workspace read before its commit %s', async (ordering, expectedEvents) => {
	const server = calendarServer();
	const initial = await settledCalendar(server);
	await prepareReturningRows(server);
	const held = { daily: gate(), outer: gate() };
	let packet: Promise<CalendarWorkspaceResult>;
	if (ordering === 'first arrives after the reply') {
		packet = server.produce('2026-10-01', '2026-10-31', held);
		await waitFor(() => expect(server.events).toEqual(['read types']));
		await chooseStaff(server);
		initial.unmount();
		await acknowledge(server);
		await returnToCalendar(packet, held, server);
	} else {
		await chooseStaff(server);
		initial.unmount();
		packet = server.produce('2026-10-01', '2026-10-31', held);
		await waitFor(() => expect(server.events).toEqual(['put', 'read types']));
		await returnToCalendar(packet, held, server);
		await acknowledge(server);
	}
	held.daily.resolve();
	await openAssignmentTypes();

	expect(currentLabel()).toContain('Currently showing: Staff Duty');
	await waitFor(() => expect(server.events).toEqual(expectedEvents));
	expect(currentLabel()).toContain('Currently showing: Staff Duty');
	expect(await server.savedFlags()).toEqual({ cq: false, sd: true, rt: false, nw: false });
	expect(flags(dailyAssignmentsStore.types)).toEqual({ cq: false, sd: true, rt: false, nw: false });
	expect(server.requests).toEqual([
		'PUT /org/org-1/api/assignment-types/date-header',
		'GET /org/org-1/api/assignment-types'
	]);
	expect(rowFields(dailyAssignmentsStore.assignments)).toEqual([outside, linked, incoming]);
	expect(dailyAssignmentsStore.loading).toBe(false);
	expect(screen.queryByText('Loading Calendar data')).toBeNull();
	expect(screen.queryByRole('alert')).toBeNull();
	expect(screen.getByRole('button', { name: 'Edit Staff Duty' }).hasAttribute('disabled')).toBe(false);
	expect(toasts).toEqual([]);
});

it('keeps a deleted type removed when a workspace read before the delete arrives after it', async () => {
	const server = calendarServer();
	const initial = await settledCalendar(server);
	await prepareReturningRows(server);
	const held = { daily: gate(), outer: gate() };
	const packet = server.produce('2026-10-01', '2026-10-31', held);
	await waitFor(() => expect(server.events).toEqual(['read types']));
	await fireEvent.click(screen.getByRole('button', { name: 'Delete Runner Team' }));
	await fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
	await waitFor(() => expect(server.events).toEqual(['read types', 'delete']));
	initial.unmount();
	server.commit.resolve();
	server.reply.resolve();
	await waitFor(() => expect(dailyAssignmentsStore.typesBusy).toBe(false));
	expect(dailyAssignmentsStore.types.map((type) => type.id)).toEqual(['cq', 'sd', 'nw']);
	await returnToCalendar(packet, held, server);
	held.daily.resolve();
	await openAssignmentTypes();

	expect(screen.queryByRole('button', { name: 'Delete Runner Team' })).toBeNull();
	await waitFor(() =>
		expect(server.events).toEqual([
			'read types',
			'delete',
			'commit',
			'reply',
			'outer observed',
			'deliver daily',
			'get',
			'read types'
		])
	);
	expect(screen.queryByRole('button', { name: 'Delete Runner Team' })).toBeNull();
	expect(dailyAssignmentsStore.types.map((type) => type.id)).toEqual(['cq', 'sd', 'nw']);
	expect(Object.keys(await server.savedFlags())).toEqual(['cq', 'sd', 'nw']);
	expect(server.requests).toEqual(['DELETE /org/org-1/api/assignment-types', 'GET /org/org-1/api/assignment-types']);
	expect(rowFields(dailyAssignmentsStore.assignments)).toEqual(expect.arrayContaining([outside, incoming]));
	expect(dailyAssignmentsStore.loading).toBe(false);
	expect(currentLabel()).toContain('Currently showing: Charge of Quarters');
	expect(toasts).toEqual([]);
});

it('saves a header with one PUT and adopts an agreeing returning workspace without a read', async () => {
	const server = calendarServer();
	const initial = await settledCalendar(server);
	await chooseStaff(server);
	await acknowledge(server);
	await waitFor(() => expect(currentLabel()).toContain('Currently showing: Staff Duty'));
	initial.unmount();
	await prepareReturningRows(server);
	renderCalendarSettings(server.produce('2026-10-01', '2026-10-31'));
	await openAssignmentTypes();

	expect(server.events).toEqual(['put', 'commit', 'reply', 'read types']);
	expect(server.requests).toEqual(['PUT /org/org-1/api/assignment-types/date-header']);
	expect(currentLabel()).toContain('Currently showing: Staff Duty');
	expect(flags(dailyAssignmentsStore.types)).toEqual({ cq: false, sd: true, rt: false, nw: false });
	expect(rowFields(dailyAssignmentsStore.assignments)).toEqual([outside, linked, incoming]);
	expect(dailyAssignmentsStore.loading).toBe(false);
});

it("adopts another user's saved catalog through one fresh read after a local save", async () => {
	const server = calendarServer();
	const initial = await settledCalendar(server);
	await chooseStaff(server);
	await acknowledge(server);
	initial.unmount();
	await server.ctx.store.update('assignment_types', 'org-1', 'sd', {
		name: 'Staff Duty Relief',
		show_in_date_header: false
	});
	await server.ctx.store.update('assignment_types', 'org-1', 'nw', { show_in_date_header: true });
	await server.ctx.store.update('assignment_types', 'org-1', 'cq', { archived_at: '2026-10-13T12:00:00.000Z' });
	server.events.length = 0;
	renderCalendarSettings(server.produce('2026-10-01', '2026-10-31'));
	await openAssignmentTypes();

	await waitFor(() => expect(currentLabel()).toContain('Currently showing: Night Watch'));
	expect(server.events).toEqual(['read types', 'get', 'read types']);
	expect(server.requests).toEqual([
		'PUT /org/org-1/api/assignment-types/date-header',
		'GET /org/org-1/api/assignment-types'
	]);
	expect(screen.getByRole('button', { name: 'Edit Staff Duty Relief' })).toBeTruthy();
	expect(screen.queryByRole('button', { name: 'Edit Charge of Quarters' })).toBeNull();
	expect(flags(dailyAssignmentsStore.types)).toEqual({ cq: false, sd: false, rt: false, nw: true });
	expect(dailyAssignmentsStore.getTypeById('cq')?.archivedAt).toBe('2026-10-13T12:00:00.000Z');
	expect(toasts).toEqual([]);
});

it('adopts a changed workspace header directly when this session wrote nothing', async () => {
	const server = calendarServer();
	const initial = await settledCalendar(server);
	initial.unmount();
	await server.ctx.store.update('assignment_types', 'org-1', 'cq', { show_in_date_header: false });
	await server.ctx.store.update('assignment_types', 'org-1', 'sd', { show_in_date_header: true });
	renderCalendarSettings(server.produce('2026-10-01', '2026-10-31'));
	await openAssignmentTypes();

	expect(server.events).toEqual(['read types']);
	expect(server.requests).toEqual([]);
	expect(currentLabel()).toContain('Currently showing: Staff Duty');
	expect(rowFields(dailyAssignmentsStore.assignments)).toEqual([
		outside,
		{ id: 'inside-old', date: '2026-10-10', assignmentTypeId: 'cq', assigneeId: 'p-old' },
		linked
	]);
	expect(dailyAssignmentsStore.loading).toBe(false);
});
