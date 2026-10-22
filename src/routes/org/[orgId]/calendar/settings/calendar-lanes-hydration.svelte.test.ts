// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
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

const calendarLaneIds = (types: AssignmentType[]) =>
	types
		.filter((type) => type.showOnCalendar && !type.archivedAt)
		.sort((a, b) => a.sortOrder - b.sortOrder)
		.map((type) => type.id);

function gate(): Gate {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => (resolve = done));
	return { promise, resolve };
}

const rowFields = (rows: DailyAssignment[]) =>
	rows.map(({ id, date, assignmentTypeId, assigneeId }) => ({ id, date, assignmentTypeId, assigneeId }));

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
			roster_pool_rules: null,
			roster_weekend_mode: 'same',
			show_on_calendar: true
		},
		{
			...saved,
			id: 'sd',
			name: 'Staff Duty',
			short_name: 'SD',
			assign_to: 'personnel',
			color: '#047857',
			sort_order: 1,
			roster_pool_rules: null,
			roster_weekend_mode: 'same',
			show_on_calendar: false
		},
		{
			...saved,
			id: 'rt',
			name: 'Runner Team',
			short_name: 'RT',
			assign_to: 'group',
			color: '#b45309',
			sort_order: 2,
			roster_pool_rules: null,
			roster_weekend_mode: 'same',
			show_on_calendar: false
		},
		{
			...saved,
			id: 'nw',
			name: 'Night Watch',
			short_name: 'NW',
			assign_to: 'personnel',
			color: '#7c3aed',
			sort_order: 3,
			roster_pool_rules: null,
			roster_weekend_mode: 'same',
			show_on_calendar: false
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
	async function savedLanes() {
		return calendarLaneIds(await listAssignmentTypes(ctx.calendarCatalogs));
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
			if (method === 'PUT' && url === '/org/org-1/api/assignment-types/lanes') {
				events.push('put');
				return acknowledgeAfter(() =>
					ctx.calendarCatalogs.setCalendarLanes(body.laneTypeIds, body.expectedLaneTypeIds)
				);
			}
			throw new Error(`Unexpected request ${method} ${url}`);
		})
	);
	return { ctx, events, requests, readTypes, savedLanes, seedDaily, produce, commit, reply };
}

type Server = ReturnType<typeof calendarServer>;

function renderCalendarSettings(workspace: Promise<CalendarWorkspaceResult>) {
	return render(RouteHarness, { props: { Layout, Page: SettingsPage, data: { calendar: { data: workspace } } } });
}

async function settledCalendar(server: Server) {
	server.seedDaily([outside]);
	const june = renderCalendarSettings(server.produce('2026-06-01', '2026-06-30'));
	await screen.findByRole('heading', { name: 'Calendar Settings' });
	june.unmount();
	server.seedDaily([{ id: 'inside-old', date: '2026-10-10', assignmentTypeId: 'cq', assigneeId: 'p-old' }, linked]);
	const october = renderCalendarSettings(server.produce('2026-10-01', '2026-10-31'));
	await screen.findByRole('heading', { name: 'Calendar Settings' });
	expect(calendarLaneIds(dailyAssignmentsStore.types)).toEqual(['cq']);
	expect(rowFields(dailyAssignmentsStore.assignments)).toEqual([
		outside,
		{ id: 'inside-old', date: '2026-10-10', assignmentTypeId: 'cq', assigneeId: 'p-old' },
		linked
	]);
	server.events.length = 0;
	return october;
}

function moveStaffFirst(server: Server) {
	const saved = dailyAssignmentsStore.setCalendarLanes(['sd', 'cq']);
	expect(server.events).toContain('put');
	expect(dailyAssignmentsStore.pendingLaneIds).toEqual(['sd', 'cq']);
	return saved;
}

async function acknowledge(server: Server, saved: ReturnType<typeof moveStaffFirst>) {
	server.commit.resolve();
	server.reply.resolve();
	expect(await saved).toEqual({ status: 'saved' });
	expect(dailyAssignmentsStore.pendingLaneIds).toBeNull();
	expect(calendarLaneIds(dailyAssignmentsStore.types)).toEqual(['sd', 'cq']);
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

it.each(['delivers its daily rows after the reply', 'first arrives after the reply'])(
	'keeps saved lanes when a workspace read before their commit %s',
	async (ordering) => {
		const server = calendarServer();
		const initial = await settledCalendar(server);
		await prepareReturningRows(server);
		const held = { daily: gate(), outer: gate() };
		let packet: Promise<CalendarWorkspaceResult>;
		if (ordering === 'first arrives after the reply') {
			packet = server.produce('2026-10-01', '2026-10-31', held);
			await waitFor(() => expect(server.events).toEqual(['read types']));
			const saved = moveStaffFirst(server);
			initial.unmount();
			await acknowledge(server, saved);
			await returnToCalendar(packet, held, server);
		} else {
			const saved = moveStaffFirst(server);
			initial.unmount();
			packet = server.produce('2026-10-01', '2026-10-31', held);
			await waitFor(() => expect(server.events).toEqual(['put', 'read types']));
			await returnToCalendar(packet, held, server);
			await acknowledge(server, saved);
		}
		held.daily.resolve();
		await screen.findByRole('heading', { name: 'Calendar Settings' });

		await waitFor(() =>
			expect(server.requests).toEqual([
				'PUT /org/org-1/api/assignment-types/lanes',
				'GET /org/org-1/api/assignment-types'
			])
		);
		await waitFor(() => expect(dailyAssignmentsStore.loading).toBe(false));
		expect(calendarLaneIds(dailyAssignmentsStore.types)).toEqual(['sd', 'cq']);
		expect(await server.savedLanes()).toEqual(['sd', 'cq']);
		expect(rowFields(dailyAssignmentsStore.assignments)).toEqual([outside, linked, incoming]);
		expect(screen.queryByRole('alert')).toBeNull();
		expect(toasts).toEqual([]);
	}
);
