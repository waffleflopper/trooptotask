// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { calendarStore } from '$features/calendar';
import { createRawSnippet } from 'svelte';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { toastStore } from '$lib/stores/toast.svelte';
import DashboardPageView from './DashboardPageView.svelte';
import { createDashboardScreenModel, type DashboardScreenModel } from '../read-model/dashboardScreenModel.svelte';
import type { DashboardPageData } from '$features/dashboard/contracts';
import { dashboardSection, type QuickAddEntry } from '../sections/dashboardSections';
import type { DashboardAccess } from '../sections/dashboardAccess';
import { DASHBOARD_SECTIONS } from '../sections/dashboardSectionRegistry';
import { buildStrengthBand } from '../read-model/strengthBand';
import type { Personnel } from '$features/personnel/contracts';
import type { TrainingType } from '$features/training/contracts';

vi.mock('$lib/utils/browserStorage', () => ({ getBrowserLocalStorage: () => globalThis.localStorage }));

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	localStorage.clear();
});

const access: DashboardAccess = {
	can: () => true,
	isPrivileged: false
};
const updates = {
	refreshSummary: () => {},
	refreshTaskings: async () => {},
	retryTaskings: () => {},
	putRecord: () => {}
};
const frame = {
	orgName: 'Test Unit',
	viewerDay: { date: '2026-10-19', timeZone: 'UTC' },
	sections: [],
	access,
	updates
};

/** Everyone on the roster is available today. */
function strengthOf(assigned: number, group: { id: string; name: string } | null = null) {
	const personnel = Array.from(
		{ length: assigned },
		(_, index) =>
			({
				id: `p${index}`,
				rank: 'SPC',
				firstName: 'Pat',
				lastName: `Last${index}`,
				groupId: group?.id ?? null
			}) as Personnel
	);
	return buildStrengthBand({
		today: '2026-10-19',
		forecastDays: ['2026-10-19'],
		personnel,
		availability: [],
		statusTypes: [],
		specialDays: [],
		groups: group ? [{ ...group, sortOrder: 0 }] : [],
		floorPercent: 80
	});
}

function makeCtx(overrides: Record<string, unknown> = {}): DashboardScreenModel {
	const base = {
		data: { orgName: 'Test Unit', orgId: 'org-1', disabledFeatures: [] },
		isHydrating: false,
		totalPersonnel: 10,
		strength: strengthOf(10),
		today: '2026-10-19',
		forecastDays: [],
		inputs: { forecastDays: [] }
	};

	return {
		...base,
		...overrides,
		data: { ...base.data, ...(overrides.data as Record<string, unknown> | undefined) }
	} as unknown as DashboardScreenModel;
}

describe('DashboardPageView', () => {
	it('opens Calendar on the viewer day even when Calendar was left in another month', async () => {
		calendarStore.goToMonth(2026, 2);
		render(DashboardPageView, { props: { ...frame, ctx: makeCtx() } });
		const link = screen.getByRole('link', { name: 'Open calendar' });
		link.addEventListener('click', (event) => event.preventDefault());

		await fireEvent.click(link);

		expect([calendarStore.year, calendarStore.month]).toEqual([2026, 9]);
	});

	it("shows the model's bottom line", () => {
		const ctx = makeCtx({ strength: strengthOf(50), totalPersonnel: 50 });

		render(DashboardPageView, { props: { ...frame, ctx } });

		expect(screen.getByText('of 50')).toBeTruthy();
		expect(screen.getByText('Available · 100%')).toBeTruthy();
	});
});

function bands() {
	return ['Strength', 'Action', 'Readiness'].map((name) => screen.queryByRole('region', { name }));
}

describe('Dashboard frame', () => {
	it('names the viewer day and the unit, counts personnel once the model is ready, and omits an empty Readiness band', () => {
		render(DashboardPageView, { props: { ...frame, ctx: makeCtx({ totalPersonnel: 42 }) } });

		expect(screen.getByRole('heading', { level: 1, name: 'Monday 19 Oct' })).toBeTruthy();
		expect(screen.getByText('Dashboard · Test Unit · 42 personnel')).toBeTruthy();
		expect(bands().map((band) => band?.getAttribute('aria-busy') ?? null)).toEqual(['false', 'false', null]);
		expect(document.querySelector('[data-slot="skeleton"]')).toBeNull();
	});

	it.each([
		{ state: 'pending', ctx: null },
		{ state: 'hydrating', ctx: makeCtx({ isHydrating: true }) }
	])('holds every band in a skeleton while the model is $state', ({ ctx }) => {
		render(DashboardPageView, { props: { ...frame, ctx } });

		expect(screen.getByRole('status').textContent).toBe('Loading Dashboard');
		expect(screen.getByRole('heading', { level: 1, name: 'Monday 19 Oct' })).toBeTruthy();
		expect(screen.getByText('Dashboard · Test Unit')).toBeTruthy();
		for (const band of bands()) {
			expect(band?.getAttribute('aria-busy')).toBe('true');
			expect(band?.querySelector('[data-slot="skeleton"]')).not.toBeNull();
		}
		expect(screen.queryByRole('list', { name: 'Needs you' })).toBeNull();
	});

	it('shows ordered usable Quick add entries and hides the label when none are usable', async () => {
		const loadDialog: QuickAddEntry['loadDialog'] = async () => ({ default: () => ({}) });
		const icon: QuickAddEntry['icon'] = () => ({});
		const quickAdd: QuickAddEntry[] = [
			{
				id: 'training',
				label: 'Training',
				order: 20,
				loadDialog,
				icon,
				available: (_, viewer) => viewer.can(POLICY_ACTION_CATALOG.training.recordCompletions)
			},
			{
				id: 'status',
				label: 'Status',
				order: 10,
				primary: true,
				loadDialog,
				icon,
				available: (_, viewer) => viewer.can(POLICY_ACTION_CATALOG.calendar.manageAvailability)
			}
		];
		const props = { ...frame, ctx: makeCtx(), sections: [dashboardSection('availability', { quickAdd })] };
		const view = render(DashboardPageView, { props });

		const group = screen.getByRole('group', { name: 'Quick add' });
		expect(
			within(group)
				.getAllByRole('button')
				.map((button) => button.textContent?.trim())
		).toEqual(['Status', 'Training']);

		await view.rerender({
			...props,
			access: { ...access, can: (action) => action.id === 'calendar.manageAvailability' }
		});
		expect(
			within(screen.getByRole('group', { name: 'Quick add' }))
				.getByRole('button')
				.textContent?.trim()
		).toBe('Status');

		await view.rerender({ ...props, access: { ...access, can: () => false } });
		expect(screen.getByRole('heading', { level: 1, name: 'Monday 19 Oct' })).toBeTruthy();
		expect(screen.queryByRole('group', { name: 'Quick add' })).toBeNull();
	});

	it('opens the chosen entry in its own dialog, loaded on first open, and closes it', async () => {
		const loadDialog = vi.fn(() => import('./quick-add/QuickAddDialogTestDouble.svelte'));
		const icon: QuickAddEntry['icon'] = () => ({});
		const quickAdd: QuickAddEntry[] = [{ id: 'status', label: 'Status', icon, order: 10, loadDialog }];
		render(DashboardPageView, {
			props: { ...frame, ctx: makeCtx(), sections: [dashboardSection('availability', { quickAdd })] }
		});
		expect(loadDialog).not.toHaveBeenCalled();

		await fireEvent.click(screen.getByRole('button', { name: 'Status' }));
		await fireEvent.click(
			within(await screen.findByRole('dialog', { name: 'Quick add for Test Unit' })).getByRole('button', {
				name: 'Done'
			})
		);
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('keeps the entry chosen last when an earlier one finishes loading after it', async () => {
		const error = vi.spyOn(toastStore, 'error');
		let failStatus!: (reason: Error) => void;
		const icon: QuickAddEntry['icon'] = () => ({});
		const quickAdd: QuickAddEntry[] = [
			{
				id: 'status',
				label: 'Status',
				icon,
				order: 10,
				loadDialog: () => new Promise((_, reject) => (failStatus = reject))
			},
			{
				id: 'training-record',
				label: 'Training record',
				icon,
				order: 20,
				loadDialog: () => import('./quick-add/QuickAddDialogTestDouble.svelte')
			}
		];
		render(DashboardPageView, {
			props: { ...frame, ctx: makeCtx(), sections: [dashboardSection('availability', { quickAdd })] }
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Status' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Training record' }));
		await screen.findByRole('dialog', { name: 'Quick add for Test Unit' });
		failStatus(new Error('Chunk unavailable'));
		await Promise.resolve();
		await Promise.resolve();

		expect(error).not.toHaveBeenCalled();
		expect(screen.getByRole('dialog', { name: 'Quick add for Test Unit' })).toBeTruthy();
	});
	it('keeps the newer dialog when an earlier import succeeds late', async () => {
		let finishStatus!: (module: Awaited<ReturnType<QuickAddEntry['loadDialog']>>) => void;
		const icon: QuickAddEntry['icon'] = () => ({});
		const quickAdd: QuickAddEntry[] = [
			{
				id: 'status',
				label: 'Status',
				icon,
				order: 10,
				loadDialog: () =>
					new Promise((resolve) => {
						finishStatus = resolve;
					})
			},
			{
				id: 'training-record',
				label: 'Training record',
				icon,
				order: 20,
				loadDialog: () => import('./quick-add/QuickAddTrainingDialogTestDouble.svelte')
			}
		];
		render(DashboardPageView, {
			props: { ...frame, ctx: makeCtx(), sections: [dashboardSection('availability', { quickAdd })] }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Status' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Training record' }));
		await screen.findByRole('dialog', { name: 'Training record dialog' });
		finishStatus(await import('./quick-add/QuickAddDialogTestDouble.svelte'));
		await Promise.resolve();
		await Promise.resolve();
		expect(screen.getByRole('dialog', { name: 'Training record dialog' })).toBeTruthy();
		expect(screen.queryByRole('dialog', { name: 'Quick add for Test Unit' })).toBeNull();
	});

	it('drops a dialog still loading when the Organization unloads, even if the viewer comes back', async () => {
		let finishStatus!: (module: Awaited<ReturnType<QuickAddEntry['loadDialog']>>) => void;
		const icon: QuickAddEntry['icon'] = () => ({});
		const quickAdd: QuickAddEntry[] = [
			{
				id: 'status',
				label: 'Status',
				icon,
				order: 10,
				loadDialog: () => new Promise((resolve) => (finishStatus = resolve))
			}
		];
		const props = { ...frame, ctx: makeCtx(), sections: [dashboardSection('availability', { quickAdd })] };
		const view = render(DashboardPageView, { props });

		await fireEvent.click(screen.getByRole('button', { name: 'Status' }));
		await view.rerender({ ...props, ctx: null });
		await view.rerender(props);
		finishStatus(await import('./quick-add/QuickAddDialogTestDouble.svelte'));
		await Promise.resolve();
		await Promise.resolve();

		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('lets the viewer try again when the dialog fails to load', async () => {
		const loadDialog = vi
			.fn<QuickAddEntry['loadDialog']>()
			.mockRejectedValueOnce(new Error('Chunk unavailable'))
			.mockImplementation(() => import('./quick-add/QuickAddDialogTestDouble.svelte'));
		const icon: QuickAddEntry['icon'] = () => ({});
		const quickAdd: QuickAddEntry[] = [{ id: 'status', label: 'Status', icon, order: 10, loadDialog }];
		render(DashboardPageView, {
			props: { ...frame, ctx: makeCtx(), sections: [dashboardSection('availability', { quickAdd })] }
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Status' }));
		await vi.waitFor(() => expect(loadDialog).toHaveBeenCalledTimes(1));
		expect(screen.queryByRole('dialog')).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: 'Status' }));
		expect(await screen.findByRole('dialog', { name: 'Quick add for Test Unit' })).toBeTruthy();
	});
});

describe('Dashboard sections', () => {
	function pageData(): DashboardPageData {
		return {
			orgId: 'org-1',
			orgName: 'Test Unit',
			taskings: { status: 'off' },
			userId: 'user-1',
			viewerDay: { date: '2026-10-19', timeZone: 'UTC' },
			disabledFeatures: [],
			dashboard: {
				workspaceKey: 'dashboard',
				data: {
					availabilityEntries: [],
					assignmentTypes: [],
					todayAssignments: [],
					range: { rangeStart: '2026-10-17', rangeEnd: '2026-11-03' },
					pinnedGroups: [],
					activeOnboardings: [],
					hasAnyOnboardingTemplate: true,
					ratingSchemeEntries: [
						{
							id: 'entry-1',
							ratedPersonId: 'p-1',
							evalType: 'NCOER',
							ratingPeriodEnd: '2027-06-30',
							status: 'completed'
						}
					],
					personnel: [],
					groups: [],
					statusTypes: [],
					trainingTypes: [{ id: 'training-1', name: 'SHARP' } as TrainingType],
					lossWarningWindowDays: 180,
					strengthFloorPercent: 80,
					awardTrackingAcknowledgedPersonnelIds: [],
					specialDays: []
				},
				hydration: { orgId: 'org-1' } as DashboardPageData['dashboard']['hydration']
			},
			trainingSummary: null,
			ictlSummary: null,
			summaryFailed: false,
			onboardingTrainingCompletions: []
		};
	}

	const onePerson = {
		id: 'p0',
		rank: 'SPC',
		lastName: 'Ames',
		firstName: 'A',
		mos: '68W',
		clinicRole: '',
		groupId: null,
		groupName: ''
	};
	const ftx = {
		kind: 'span' as const,
		id: 'ftx',
		start: '2026-10-20',
		end: '2026-10-22',
		title: 'FTX',
		detail: '20 Oct to 22 Oct',
		label: 'FTX exercise',
		href: '/org/org-1/ftx',
		emphasis: 'strong' as const
	};
	const sources = {
		personnel: { items: [onePerson], loading: false },
		statusTypes: { items: [], loading: false },
		availability: { items: [], loading: false },
		dailyAssignments: { assignments: [], types: [], loading: false },
		groups: { items: [], loading: false },
		pinnedGroups: { list: [] }
	};

	it('renders a section that registers a Needs you source and a forecast lane without changing the bands', () => {
		const exercises = dashboardSection('criticalTasks', {
			needsYou: [
				(inputs) => [
					{
						kind: 'leaving',
						id: 'leaving-p1',
						personnelId: 'p1',
						title: 'SGT Diaz',
						subtitle: 'PCS to Fort Hood',
						timing: 'in 3 days',
						href: '/org/org-1/personnel/p1',
						action: null,
						urgency: { date: inputs.forecastDays[3] }
					}
				]
			],
			forecastLanes: [
				{
					id: 'exercises',
					label: 'Exercises',
					empty: 'No exercises.',
					legend: [],
					read: () => ({ state: 'ready', marks: [ftx] })
				}
			]
		});
		const sections = DASHBOARD_SECTIONS.map((entry) => (entry.id === 'criticalTasks' ? exercises : entry));
		const ctx = createDashboardScreenModel(pageData(), { sources });

		render(DashboardPageView, { props: { ...frame, ctx, sections } });

		expect(screen.getByText('Needs you · 1')).toBeTruthy();
		const queue = screen.getByRole('list', { name: 'Needs you' });
		expect(within(queue).getByRole('link', { name: 'SGT Diaz' }).getAttribute('href')).toBe('/org/org-1/personnel/p1');
		expect(within(queue).getByText('Leaving')).toBeTruthy();
		expect(within(queue).getByText('PCS to Fort Hood')).toBeTruthy();
		const lane = screen.getByRole('list', { name: 'Exercises' });
		expect(within(lane).getByRole('link', { name: 'FTX exercise' }).getAttribute('href')).toBe('/org/org-1/ftx');
		expect(bands().every((band) => band?.getAttribute('aria-busy') === 'false')).toBe(true);
	});

	it('drops a switched-off section with its row and lane', () => {
		const exercises = dashboardSection('criticalTasks', {
			needsYou: [
				() => [
					{
						kind: 'leaving',
						id: 'leaving-p1',
						personnelId: 'p1',
						title: 'SGT Diaz',
						subtitle: 'PCS',
						timing: 'in 3 days',
						href: '/org/org-1/personnel/p1',
						action: null,
						urgency: { date: '2026-10-22' }
					}
				]
			],
			forecastLanes: [
				{
					id: 'exercises',
					label: 'Exercises',
					empty: 'No exercises.',
					legend: [],
					read: () => ({ state: 'ready', marks: [ftx] })
				}
			]
		});
		const ctx = createDashboardScreenModel({ ...pageData(), disabledFeatures: ['criticalTasks'] }, { sources });

		render(DashboardPageView, { props: { ...frame, ctx, sections: [exercises] } });

		expect(screen.getByText('Nothing needs you right now.')).toBeTruthy();
		expect(screen.queryByRole('list', { name: 'Exercises' })).toBeNull();
	});
	describe('the Events & Taskings lane', () => {
		const forecast = {
			events: [
				{
					id: 'e-1',
					title: 'Best Medic Competition',
					startsOn: '2026-10-20',
					endsOn: '2026-10-23',
					cancelled: false,
					hasWork: true
				}
			],
			suspenses: [{ taskingId: 't-1', title: 'Alpha lane coverage', suspenseOn: '2026-10-22', status: 'open' as const }]
		};
		const lane = () => document.querySelector<HTMLElement>('[data-forecast-lane="events-and-taskings"]');
		const renderWith = (taskings: DashboardPageData['taskings'], pageUpdates = updates) =>
			render(DashboardPageView, {
				props: {
					...frame,
					updates: pageUpdates,
					ctx: createDashboardScreenModel({ ...pageData(), taskings }, { sources }),
					sections: DASHBOARD_SECTIONS
				}
			});

		it('links each Event span and suspense point to its detail', () => {
			renderWith({ status: 'ready', attention: { rows: [], total: 0 }, forecast });

			const marks = within(lane()!).getAllByRole('link');
			expect(marks.map((mark) => mark.getAttribute('href'))).toEqual([
				'/org/org-1/calendar/events/e-1',
				'/org/org-1/calendar/taskings/t-1'
			]);
			expect(marks.every((mark) => (mark.getAttribute('aria-label') ?? '').length > 0)).toBe(true);
		});

		it('holds a placeholder while the read is pending, and the forecast numbers do not wait for it', () => {
			renderWith({ status: 'pending' });

			expect(lane()?.querySelector('[aria-busy="true"] [data-slot="skeleton"]')).not.toBeNull();
			expect(within(lane()!).queryAllByRole('link')).toEqual([]);
			expect(bands()[0]?.getAttribute('aria-busy')).toBe('false');
		});

		it('fails on its own and retries the Tasking read', async () => {
			const retryTaskings = vi.fn();
			renderWith({ status: 'failed' }, { ...updates, retryTaskings });

			await fireEvent.click(within(lane()!).getByRole('button', { name: 'Try again' }));

			expect(retryTaskings).toHaveBeenCalledOnce();
			expect(bands().every((band) => band?.getAttribute('aria-busy') === 'false')).toBe(true);
		});

		it('lists the suspenses due on one day behind its first diamond', async () => {
			const due = (taskingId: string) => ({
				taskingId,
				title: taskingId,
				suspenseOn: '2026-10-22',
				status: 'open' as const
			});
			renderWith({
				status: 'ready',
				attention: { rows: [], total: 0 },
				forecast: { events: [], suspenses: [due('t-1'), due('t-2'), due('t-3')] }
			});

			expect(
				within(lane()!)
					.getAllByRole('link')
					.map((mark) => mark.getAttribute('href'))
			).toEqual(['/org/org-1/calendar/taskings/t-1']);
			await fireEvent.click(within(lane()!).getByRole('button'));

			const list = await waitFor(() => {
				const content = document.querySelector<HTMLElement>('[data-slot="popover-content"]');
				expect(content).not.toBeNull();
				return content!;
			});
			const listed = within(list).getAllByRole('link');
			expect(listed.map((mark) => mark.getAttribute('href'))).toEqual([
				'/org/org-1/calendar/taskings/t-1',
				'/org/org-1/calendar/taskings/t-2',
				'/org/org-1/calendar/taskings/t-3'
			]);
		});

		it('leaves the forecast in place without a lane when the Tasking read is off', () => {
			renderWith({ status: 'off' });

			expect(bands()[0]).toBeTruthy();
			expect(lane()).toBeNull();
		});
	});

	function leaving(index: number) {
		return {
			kind: 'leaving' as const,
			id: `leaving-${index}`,
			personnelId: `p${index}`,
			title: `SGT Person ${index}`,
			subtitle: 'ETS',
			timing: `in ${index} days`,
			href: `/org/org-1/personnel/p${index}`,
			action: null,
			urgency: { date: `2026-10-${String(19 + index).padStart(2, '0')}` }
		};
	}

	function renderQueue(count: number) {
		const many = dashboardSection('lossesAndAwards', {
			needsYou: [() => Array.from({ length: count }, (_, index) => leaving(index + 1))]
		});
		render(DashboardPageView, {
			props: { ...frame, ctx: createDashboardScreenModel(pageData(), { sources }), sections: [many] }
		});
		return screen.getByRole('list', { name: 'Needs you' });
	}

	it('folds the rows past the top seven and reveals them in place', async () => {
		const queue = renderQueue(10);

		expect(within(queue).getByRole('link', { name: 'SGT Person 7' })).toBeTruthy();
		expect(within(queue).queryByRole('link', { name: 'SGT Person 8' })).toBeNull();

		await fireEvent.click(within(queue).getByRole('button', { name: 'Show all 10' }));

		expect(within(queue).getByRole('link', { name: 'SGT Person 10' })).toBeTruthy();
		expect(within(queue).queryByRole('button', { name: 'Show all 10' })).toBeNull();
		expect(document.activeElement).toBe(within(queue).getByRole('link', { name: 'SGT Person 8' }));
	});

	it("shows four of the week's changes until asked for all of them", async () => {
		const ctx = createDashboardScreenModel(pageData(), {
			sources: {
				...sources,
				personnel: {
					items: ['Ames', 'Bell', 'Cruz', 'Diaz', 'Eto'].map((lastName) => ({
						id: lastName,
						rank: 'SPC',
						lastName,
						firstName: 'A',
						mos: '68W',
						clinicRole: '',
						groupId: null,
						groupName: ''
					})),
					loading: false
				},
				statusTypes: {
					items: [
						{
							id: 'leave',
							name: 'Leave',
							color: '#336699',
							textColor: '#ffffff',
							shortLabel: null,
							rosterEffect: 'available',
							sortOrder: 0
						}
					],
					loading: false
				},
				availability: {
					items: ['Ames', 'Bell', 'Cruz', 'Diaz', 'Eto'].map((personnelId, index) => ({
						id: `leave-${personnelId}`,
						personnelId,
						statusTypeId: 'leave',
						startDate: `2026-10-2${index}`,
						endDate: '2026-10-30'
					})),
					loading: false
				}
			}
		} as Parameters<typeof createDashboardScreenModel>[1]);

		render(DashboardPageView, { props: { ...frame, ctx, sections: DASHBOARD_SECTIONS } });

		const changes = within(screen.getByRole('region', { name: 'Coming and going · 7 days' })).getByRole('list');
		const people = () =>
			within(changes)
				.getAllByRole('listitem')
				.map((row) => within(row).getByText(/^SPC /).textContent);
		expect(people()).toEqual(['SPC Ames', 'SPC Bell', 'SPC Cruz', 'SPC Diaz']);

		await fireEvent.click(screen.getByRole('button', { name: 'All 5 changes' }));

		expect(people()).toEqual(['SPC Ames', 'SPC Bell', 'SPC Cruz', 'SPC Diaz', 'SPC Eto']);
		expect(document.activeElement).toBe(within(changes).getByText('SPC Eto').closest('li'));
	});

	it("names tomorrow's duty even when today is open", () => {
		const ctx = createDashboardScreenModel(pageData(), {
			sources: {
				...sources,
				personnel: {
					items: [
						{
							id: 'p1',
							rank: 'SSG',
							lastName: 'Okafor',
							firstName: 'Ada',
							mos: '68W',
							clinicRole: '',
							groupId: null,
							groupName: ''
						}
					],
					loading: false
				},
				dailyAssignments: {
					types: [
						{
							id: 'staff-duty',
							name: 'Staff Duty',
							shortName: 'SD',
							assignTo: 'personnel',
							color: '#1f6feb',
							poolRules: null,
							weekendMode: 'same',
							excusals: [],
							showOnCalendar: true,
							sortOrder: 0
						}
					],
					assignments: [{ id: 'sd-20', date: '2026-10-20', assignmentTypeId: 'staff-duty', assigneeId: 'p1' }],
					loading: false
				}
			}
		} as Parameters<typeof createDashboardScreenModel>[1]);

		render(DashboardPageView, { props: { ...frame, ctx, sections: DASHBOARD_SECTIONS } });

		const duty = screen.getByRole('row', { name: /Staff Duty/ });
		expect(
			within(duty)
				.getAllByRole('cell')
				.map((cell) => cell.textContent?.trim())
		).toEqual(['Open', 'SSG Okafor']);
		expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent?.trim())).toEqual([
			'Duty',
			'Mon 19',
			'Tue 20'
		]);
	});

	it('opens the Calendar at the month of the first unfilled day', async () => {
		calendarStore.goToMonth(2026, 0);
		const filled = Array.from({ length: 13 }, (_, index) => `2026-10-${19 + index}`);
		const ctx = createDashboardScreenModel(pageData(), {
			sources: {
				...sources,
				dailyAssignments: {
					types: [
						{
							id: 'staff-duty',
							name: 'Staff Duty',
							shortName: 'SD',
							assignTo: 'personnel',
							color: '#1f6feb',
							poolRules: null,
							weekendMode: 'same',
							excusals: [],
							showOnCalendar: true,
							sortOrder: 0
						}
					],
					assignments: filled.map((date) => ({ id: date, date, assignmentTypeId: 'staff-duty', assigneeId: 'p1' })),
					loading: false
				}
			}
		} as Parameters<typeof createDashboardScreenModel>[1]);
		render(DashboardPageView, { props: { ...frame, ctx, sections: DASHBOARD_SECTIONS } });
		const link = within(screen.getByRole('list', { name: 'Needs you' })).getByRole('link', {
			name: '1 Staff Duty day unfilled'
		});
		link.addEventListener('click', (event) => event.preventDefault());

		await fireEvent.click(link);

		expect(link.getAttribute('href')).toBe('/org/org-1/calendar');
		expect(calendarStore.currentDate).toEqual(new Date(2026, 10, 1));
	});

	const trainingSummary: DashboardPageData['trainingSummary'] = {
		stats: { current: 0, expired: 0, warningOrange: 0, warningYellow: 0, notCompleted: 0, notRequired: 0, total: 0 },
		issues: [],
		expiredByType: [],
		expiredPersonnelCount: 0,
		groupDelinquencies: []
	};
	const ictlSummary: DashboardPageData['ictlSummary'] = {
		hasActiveTasks: true,
		overallReadinessPercent: 57,
		overallDeltaPercent: -3,
		readyCount: 57,
		applicableCount: 100,
		soldiersBelowThresholdCount: 15,
		soldiersAtRiskCount: 2,
		soldiersBelowThresholdTotal: 20,
		thresholdPercent: 70,
		expiringSoonCount: 3,
		expiringSoonAffectedSoldiers: 3,
		expiringSoonWindowDays: 30,
		tasksBelowThresholdCount: 0,
		projectedReadinessPercent: 57,
		mosReadiness: [],
		trend: [],
		tasksBelowThreshold: [],
		atRiskSoldiers: []
	};

	function readinessTitles() {
		return within(screen.getByRole('list', { name: 'Readiness by feature' }))
			.getAllByRole('heading', { level: 3 })
			.map((heading) => heading.textContent?.trim());
	}

	it('gives each section a readiness column and closes ranks when one contributes none', () => {
		const props = { ...frame, sections: DASHBOARD_SECTIONS };
		render(DashboardPageView, {
			props: { ...props, ctx: createDashboardScreenModel({ ...pageData(), trainingSummary, ictlSummary }, { sources }) }
		});
		expect(readinessTitles()).toEqual(['Training', 'Critical tasks', 'Evaluations', 'Arriving and leaving']);
		expect(
			screen.getByText((_, element) => element?.textContent === 'ready · ▼ 3 pts, down 3 points in 30 days')
		).toBeTruthy();
		cleanup();

		render(DashboardPageView, {
			props: {
				...props,
				ctx: createDashboardScreenModel({ ...pageData(), trainingSummary, ictlSummary: null }, { sources })
			}
		});
		expect(readinessTitles()).toEqual(['Training', 'Evaluations', 'Arriving and leaving']);
	});

	describe('with a person expired on training', () => {
		const expiredSummary: DashboardPageData['trainingSummary'] = {
			...trainingSummary,
			expiredByType: [{ trainingTypeId: 'cpr', personnelIds: ['p1'], maxDaysLate: 4 }],
			expiredPersonnelCount: 1,
			groupDelinquencies: [{ groupId: null, expiredPersonnelCount: 1, delinquentPersonnelCount: 1 }]
		};
		const diaz: Personnel = {
			id: 'p1',
			slug: 'p1',
			rank: 'SPC',
			firstName: 'Pat',
			lastName: 'Diaz',
			mos: '68W',
			clinicRole: '',
			groupId: null,
			groupName: ''
		};
		const withPerson = { ...sources, personnel: { items: [diaz], loading: false } };
		const summaryFailure = createRawSnippet(() => ({
			render: () => '<div role="alert"><button type="button">Retry Dashboard</button></div>'
		}));

		it('lists the expired row when the summary loaded', () => {
			const ctx = createDashboardScreenModel(
				{ ...pageData(), trainingSummary: expiredSummary },
				{ sources: withPerson }
			);

			render(DashboardPageView, { props: { ...frame, ctx, sections: DASHBOARD_SECTIONS, summaryFailure } });

			expect(within(screen.getByRole('list', { name: 'Needs you' })).getByText(/expired on/)).toBeTruthy();
			expect(screen.queryByRole('alert')).toBeNull();
		});

		it('calls Needs you incomplete and offers one Retry instead of reading as clear when the summary failed', () => {
			const ctx = createDashboardScreenModel({ ...pageData(), summaryFailed: true }, { sources: withPerson });

			render(DashboardPageView, { props: { ...frame, ctx, sections: DASHBOARD_SECTIONS, summaryFailure } });

			expect(screen.queryByText('Nothing needs you right now.')).toBeNull();
			expect(screen.getByText('Needs you is incomplete. Training items could not load.')).toBeTruthy();
			expect(screen.getAllByRole('button', { name: 'Retry Dashboard' })).toHaveLength(1);
			expect(readinessTitles()).toEqual(['Training', 'Critical tasks', 'Evaluations', 'Arriving and leaving']);
		});

		it('keeps the empty state and offers no Retry when the actor reads neither summary source', () => {
			const ctx = createDashboardScreenModel({ ...pageData(), summaryFailed: true }, { sources: withPerson });
			const noSummaryAccess: DashboardAccess = {
				isPrivileged: false,
				can: (action) =>
					action.id !== POLICY_ACTION_CATALOG.training.viewRecords.id &&
					action.id !== POLICY_ACTION_CATALOG.criticalTasks.viewReadiness.id
			};

			render(DashboardPageView, {
				props: { ...frame, ctx, sections: DASHBOARD_SECTIONS, access: noSummaryAccess, summaryFailure }
			});

			expect(screen.getByText('Nothing needs you right now.')).toBeTruthy();
			expect(screen.queryByRole('button', { name: 'Retry Dashboard' })).toBeNull();
		});
	});

	describe('when the strength band has nothing true to say', () => {
		const roster = ['Ames', 'Bell', 'Cruz', 'Diaz'].map((lastName) => ({
			id: lastName,
			rank: 'SPC',
			lastName,
			firstName: 'A',
			mos: '68W',
			clinicRole: '',
			groupId: null,
			groupName: ''
		}));
		const withRoster = { ...sources, personnel: { items: roster, loading: false } };

		it('says Calendar availability is withheld rather than counting everyone available, and drops On duty', () => {
			const noCalendar: DashboardAccess = {
				isPrivileged: false,
				can: (action) => action.id !== POLICY_ACTION_CATALOG.calendar.viewAvailability.id
			};
			const ctx = createDashboardScreenModel(pageData(), { sources: withRoster });

			render(DashboardPageView, { props: { ...frame, ctx, sections: DASHBOARD_SECTIONS, access: noCalendar } });

			const strength = screen.getByRole('region', { name: 'Strength' });
			expect(strength.textContent).toContain(
				'You do not have access to Calendar availability, so strength is not shown.'
			);
			expect(screen.queryByText('of 4')).toBeNull();
			expect(screen.queryByText('Everyone is available today.')).toBeNull();
			expect(screen.queryByRole('heading', { name: 'Tonight and tomorrow' })).toBeNull();
		});

		it('shows an empty roster as empty, not as everyone available', () => {
			const ctx = createDashboardScreenModel(pageData(), {
				sources: { ...sources, personnel: { items: [], loading: false } }
			});

			render(DashboardPageView, { props: { ...frame, ctx, sections: DASHBOARD_SECTIONS } });

			expect(screen.getByRole('region', { name: 'Strength' }).textContent).toContain('No active personnel yet.');
			expect(screen.queryByText('of 0')).toBeNull();
			expect(screen.queryByText('Everyone is available today.')).toBeNull();
		});

		it('still counts the roster for a viewer with Calendar access', () => {
			const ctx = createDashboardScreenModel(pageData(), { sources: withRoster });

			render(DashboardPageView, { props: { ...frame, ctx, sections: DASHBOARD_SECTIONS } });

			expect(screen.getByText('of 4')).toBeTruthy();
			expect(screen.getByRole('heading', { name: 'Tonight and tomorrow' })).toBeTruthy();
		});
	});

	it('says which columns could not load when the summary fails and keeps every band', () => {
		const ctx = createDashboardScreenModel({ ...pageData(), summaryFailed: true }, { sources });

		render(DashboardPageView, { props: { ...frame, ctx, sections: DASHBOARD_SECTIONS } });

		const row = screen.getByRole('list', { name: 'Readiness by feature' });
		expect(readinessTitles()).toEqual(['Training', 'Critical tasks', 'Evaluations', 'Arriving and leaving']);
		expect(within(row).getByText("Couldn't load Training currency. Reload the page to try again.")).toBeTruthy();
		expect(within(row).getByText("Couldn't load Critical Tasks readiness. Reload the page to try again.")).toBeTruthy();
		expect(within(row).getByText('None due within 60 days. 0 are current.')).toBeTruthy();
		expect(bands().map((band) => band?.getAttribute('aria-busy'))).toEqual(['false', 'false', 'false']);
	});
});

describe('setup hints', () => {
	const notSetUp = (gap: string) => ({ isNotSetUp: () => true, gap, fix: { label: 'Fix it', href: () => '/fix' } });
	const sections = [
		dashboardSection('onboarding', { setup: notSetUp('there are no templates yet') }),
		dashboardSection('training', { setup: notSetUp('there are no training types yet') })
	];
	const owner = { ...access, isPrivileged: true };
	const viewAs = (userId: string, orgId = 'org-1') =>
		render(DashboardPageView, {
			props: {
				...frame,
				access: owner,
				sections,
				ctx: makeCtx({ data: { orgId, userId }, inputs: { forecastDays: [], page: { orgId } } })
			}
		});
	const hintTexts = () => screen.queryAllByText(/is on, but/).map((hint) => hint.textContent);
	const readiness = () => screen.queryByRole('region', { name: 'Readiness' });

	it('keeps a dismissed hint hidden for that member and unit after a reload, and drops an empty Readiness band', async () => {
		viewAs('user-1');
		expect(screen.getByRole('link', { name: 'Turn off onboarding' }).getAttribute('href')).toBe(
			'/org/org-1/settings/features'
		);
		await fireEvent.click(screen.getByRole('button', { name: 'Dismiss the Onboarding hint' }));
		expect(hintTexts()).toEqual(["Training is on, but there are no training types yet, so it isn't shown here."]);
		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Dismiss the Training hint' }));
		cleanup();

		viewAs('user-1');
		expect(hintTexts()).toEqual(["Training is on, but there are no training types yet, so it isn't shown here."]);
		await fireEvent.click(screen.getByRole('button', { name: 'Dismiss the Training hint' }));
		expect(readiness()).toBeNull();
		expect(document.activeElement?.textContent).toContain('Most urgent first');
		cleanup();

		viewAs('user-2');
		expect(hintTexts()).toHaveLength(2);
		cleanup();

		viewAs('user-1', 'org-2');
		expect(hintTexts()).toHaveLength(2);
	});

	it('moves focus to the Readiness heading when the last hint goes and columns remain', async () => {
		const column = () => ({ id: 'evals', title: 'Evaluations', link: { label: 'Evals', href: '#' } });
		render(DashboardPageView, {
			props: {
				...frame,
				access: owner,
				sections: [
					dashboardSection('onboarding', { setup: notSetUp('there are no templates yet') }),
					dashboardSection('evaluations', {
						readiness: () => ({ ...column(), state: 'failed', subject: 'Evaluations' })
					})
				],
				ctx: makeCtx({ data: { userId: 'user-3' }, inputs: { forecastDays: [], page: { orgId: 'org-1' } } })
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Dismiss the Onboarding hint' }));

		expect(hintTexts()).toEqual([]);
		expect(document.activeElement?.textContent).toContain('Where the unit stands');
	});
});
