// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';
import { ictTasksStore } from '$features/critical-tasks';
import { personnelIctCompletionsStore } from '$features/critical-tasks';
import { groupCatalogHydration, personnelStore } from '$features/personnel';
import type { IctTask, PersonnelIctCompletion } from '$features/critical-tasks/contracts';
import type { Group } from '$features/personnel/contracts';
import type { Personnel } from '$features/personnel/contracts';

const { mockOrgContext } = vi.hoisted(() => ({
	mockOrgContext: {
		orgId: 'org-1',
		orgName: 'Test Unit',
		userId: 'user-1',
		role: 'owner',
		isOwner: true,
		isAdmin: false,
		isPrivileged: true,
		capabilityMap: {
			calendar: 'configure',
			personnel: 'configure',
			training: 'configure',
			criticalTasks: 'configure',
			onboarding: 'configure',
			ratingScheme: 'configure'
		},
		scopeSet: { kind: 'organization' },
		affordanceForFeatureAction(action: { owner: { lane: string }; requiredCapability: string; accessMode: string }) {
			const levels = ['none', 'view', 'operate', 'configure'];
			const actual = this.capabilityMap[action.owner.lane as keyof typeof this.capabilityMap] ?? 'none';
			const hasCapability = levels.indexOf(actual) >= levels.indexOf(action.requiredCapability);
			return {
				allowed: hasCapability,
				visible: hasCapability,
				disabled: !hasCapability,
				reason: hasCapability ? 'allowed:capability' : 'denied:missing-capability',
				explanation: '',
				decision: {}
			};
		}
	}
}));

vi.mock('$features/app-shell', () => ({
	getAppShellContext: () => mockOrgContext
}));

const ictTask: IctTask = {
	id: 'task-1',
	taskCode: '181-105-1001',
	title: 'Perform tactical combat casualty care',
	description: null,
	mos: [],
	expirationMonths: null,
	sortOrder: 0,
	archivedAt: null,
	createdAt: '2026-04-01T12:00:00Z'
};

function person(overrides: Partial<Personnel> = {}): Personnel {
	return {
		id: 'person-1',
		rank: 'SGT',
		lastName: 'Smith',
		firstName: 'Jane',
		mos: '68W',
		clinicRole: 'Medic',
		groupId: 'group-alpha',
		groupName: 'Alpha',
		...overrides
	};
}

function completion(overrides: Partial<PersonnelIctCompletion>): PersonnelIctCompletion {
	return {
		id: 'completion-1',
		personnelId: 'person-1',
		ictTaskId: 'task-1',
		completedAt: '2098-01-01',
		validationMethod: 'Demonstration',
		validatedBy: 'SFC Observer',
		notes: null,
		loggedBy: 'user-1',
		createdAt: '2098-01-01T12:00:00Z',
		...overrides
	};
}

const alphaGroup: Group = { id: 'group-alpha', name: 'Alpha', sortOrder: 0, parentId: null, depth: 1 as const };
const bravoGroup: Group = { id: 'group-bravo', name: 'Bravo', sortOrder: 1, parentId: null, depth: 1 as const };

describe('critical tasks page', () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-05-01T12:00:00.000Z'));
		mockOrgContext.role = 'owner';
		mockOrgContext.isOwner = true;
		mockOrgContext.isAdmin = false;
		mockOrgContext.isPrivileged = true;
		mockOrgContext.capabilityMap.criticalTasks = 'configure';
		mockOrgContext.scopeSet = { kind: 'organization' };
		personnelStore.startLoading();
		groupCatalogHydration.startLoading();
		ictTasksStore.startLoading();
		personnelIctCompletionsStore.startLoading();
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		vi.useRealTimers();
		vi.unstubAllGlobals();
		personnelStore.load([], 'org-test-reset');
		groupCatalogHydration.load([], 'org-test-reset');
		ictTasksStore.load([], 'org-test-reset');
		personnelIctCompletionsStore.load([], 'org-test-reset');
	});

	it('shows the reports and task library affordances to owners and admins', async () => {
		personnelStore.load([], 'org-1');
		groupCatalogHydration.load([], 'org-1');
		ictTasksStore.load([ictTask], 'org-1');
		personnelIctCompletionsStore.load([], 'org-1');

		render(Page, {
			props: {
				data: {
					orgId: 'org-1'
				}
			}
		});

		const reportsLink = screen.getByRole('link', { name: 'Reports' });
		expect(reportsLink.getAttribute('href')).toBe('/org/org-1/critical-tasks/reports');
		const libraryLink = screen.getByRole('link', { name: 'Task Library' });
		expect(libraryLink.getAttribute('href')).toBe('/org/org-1/critical-tasks/library');
	});

	it('uses Critical Tasks Policy Decisions for page affordances', () => {
		mockOrgContext.role = 'member';
		mockOrgContext.isOwner = false;
		mockOrgContext.isAdmin = false;
		mockOrgContext.isPrivileged = false;
		mockOrgContext.capabilityMap.criticalTasks = 'configure';
		personnelStore.load([person()], 'org-1');
		groupCatalogHydration.load([alphaGroup], 'org-1');
		ictTasksStore.load([ictTask], 'org-1');
		personnelIctCompletionsStore.load([], 'org-1');

		render(Page, {
			props: {
				data: {
					orgId: 'org-1',
					orgName: 'Test Unit'
				}
			}
		});

		expect(screen.queryByRole('heading', { name: 'Access Restricted' })).toBeNull();
		expect(screen.getByRole('link', { name: 'Task Library' }).getAttribute('href')).toBe(
			'/org/org-1/critical-tasks/library'
		);
		expect(screen.getByRole('link', { name: 'Import Completions' }).getAttribute('href')).toBe(
			'/org/org-1/critical-tasks/import'
		);
		expect(screen.getByRole('button', { name: 'Record Completion' })).toBeTruthy();
	});

	it('keeps Record Completion and Import Completions unavailable until completions have loaded', async () => {
		personnelStore.load([person()], 'org-1');
		groupCatalogHydration.load([alphaGroup], 'org-1');
		ictTasksStore.load([ictTask], 'org-1');
		render(Page, { props: { data: { orgId: 'org-1' } } });

		const record = screen.getByRole('button', { name: 'Record Completion' }) as HTMLButtonElement;
		const importCompletions = screen.getByRole('link', { name: 'Import Completions' });
		expect([record.disabled, record.getAttribute('title')]).toEqual([true, 'Critical Tasks are still loading.']);
		expect([importCompletions.getAttribute('aria-disabled'), importCompletions.getAttribute('title')]).toEqual([
			'true',
			'Critical Tasks are still loading.'
		]);
		await fireEvent.click(record);
		expect(screen.queryByRole('dialog')).toBeNull();

		personnelIctCompletionsStore.load([completion({})], 'org-1');
		await waitFor(() => expect(record.disabled).toBe(false));
		expect(record.getAttribute('title')).toBeNull();
		expect(importCompletions.getAttribute('href')).toBe('/org/org-1/critical-tasks/import');
	});

	it('shows an empty roster and a filter miss as distinct Empty states', async () => {
		personnelStore.load([], 'org-1');
		groupCatalogHydration.load([], 'org-1');
		ictTasksStore.load([ictTask], 'org-1');
		personnelIctCompletionsStore.load([], 'org-1');

		const view = render(Page, { props: { data: { orgId: 'org-1' } } });

		expect(screen.getByText('No personnel yet.')).toBeTruthy();
		expect(screen.queryByRole('table', { name: 'Critical Tasks readiness matrix' })).toBeNull();
		view.unmount();

		personnelStore.load([person()], 'org-1');
		render(Page, { props: { data: { orgId: 'org-1' } } });
		await fireEvent.input(screen.getByRole('searchbox', { name: 'Search by name, rank, or MOS' }), {
			target: { value: 'nobody' }
		});

		expect(await screen.findByText('No personnel match the current filters.')).toBeTruthy();
		expect(screen.queryByRole('table', { name: 'Critical Tasks readiness matrix' })).toBeNull();
		expect(screen.queryByText('No personnel yet.')).toBeNull();
	});

	it('keeps Export Excel focused and busy while the matrix downloads, refusing another press', async () => {
		personnelStore.load([person()], 'org-1');
		groupCatalogHydration.load([alphaGroup], 'org-1');
		ictTasksStore.load([ictTask], 'org-1');
		personnelIctCompletionsStore.load([], 'org-1');
		const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
		vi.stubGlobal('fetch', fetchMock);

		render(Page, { props: { data: { orgId: 'org-1' } } });
		const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Export Excel' });
		button.focus();
		await fireEvent.click(button);

		const exporting = await screen.findByRole<HTMLButtonElement>('button', { name: 'Exporting...' });
		expect([
			exporting === document.activeElement,
			exporting.disabled,
			exporting.getAttribute('aria-disabled'),
			exporting.getAttribute('aria-busy')
		]).toEqual([true, false, 'true', 'true']);
		await fireEvent.click(exporting);
		expect(fetchMock).toHaveBeenCalledOnce();
	});

	it('reports a failed matrix export as an alert whose Retry requests the export again', async () => {
		personnelStore.load([person()], 'org-1');
		groupCatalogHydration.load([alphaGroup], 'org-1');
		ictTasksStore.load([ictTask], 'org-1');
		personnelIctCompletionsStore.load([], 'org-1');
		const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 } as Response);
		vi.stubGlobal('fetch', fetchMock);

		render(Page, { props: { data: { orgId: 'org-1' } } });
		await fireEvent.click(screen.getByRole('button', { name: 'Export Excel' }));

		const alert = await screen.findByRole('alert');
		expect(within(alert).getByText('Unable to export the matrix')).toBeTruthy();
		expect(within(alert).getByText('Failed to export critical task matrix')).toBeTruthy();

		await fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
		expect(fetchMock.mock.calls[1][0]).toBe('/org/org-1/api/critical-tasks/matrix/export');
	});

	it('exports the matrix with the group, gaps and trimmed search chosen in the toolbar', async () => {
		personnelStore.load(
			[
				person({ id: 'smith', lastName: 'Smith', groupId: alphaGroup.id, groupName: alphaGroup.name }),
				person({ id: 'jones', lastName: 'Jones', groupId: bravoGroup.id, groupName: bravoGroup.name })
			],
			'org-1'
		);
		groupCatalogHydration.load([alphaGroup, bravoGroup], 'org-1');
		ictTasksStore.load([ictTask], 'org-1');
		personnelIctCompletionsStore.load([], 'org-1');
		const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 } as Response);
		vi.stubGlobal('fetch', fetchMock);

		render(Page, { props: { data: { orgId: 'org-1' } } });
		const group = screen.getByRole('button', { name: 'Critical Tasks group filter' });
		group.focus();
		await fireEvent.keyDown(group, { key: 'ArrowDown' });
		const alpha = await screen.findByRole('option', { name: /Alpha/ });
		await fireEvent.pointerUp(alpha);
		expect(group.textContent).toContain('Alpha');
		await fireEvent.click(screen.getByRole('button', { name: 'Gaps only' }));
		await fireEvent.input(screen.getByRole('searchbox', { name: 'Search by name, rank, or MOS' }), {
			target: { value: '  smith ' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Export Excel' }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		expect(fetchMock.mock.calls[0][0]).toBe(
			'/org/org-1/api/critical-tasks/matrix/export?groupFilter=group-alpha&search=smith&gapsOnly=true'
		);
	});

	it('keeps actions a Critical Tasks viewer may not use out of More when every control folds', async () => {
		mockOrgContext.role = 'member';
		mockOrgContext.isOwner = false;
		mockOrgContext.isPrivileged = false;
		mockOrgContext.capabilityMap.criticalTasks = 'view';
		personnelStore.load([person()], 'org-1');
		groupCatalogHydration.load([alphaGroup], 'org-1');
		ictTasksStore.load([ictTask], 'org-1');
		personnelIctCompletionsStore.load([], 'org-1');
		const observers: { callback: ResizeObserverCallback; targets: Element[] }[] = [];
		vi.stubGlobal(
			'ResizeObserver',
			class {
				targets: Element[] = [];
				constructor(callback: ResizeObserverCallback) {
					observers.push({ callback, targets: this.targets });
				}
				observe(target: Element) {
					this.targets.push(target);
				}
				unobserve() {}
				disconnect() {}
			}
		);

		render(Page, { props: { data: { orgId: 'org-1' } } });
		for (const { callback, targets } of observers) {
			const entries = targets.map((target) => {
				const box = [{ inlineSize: target.hasAttribute('data-toolbar-row') ? 1 : 40, blockSize: 32 }];
				return { target, borderBoxSize: box, contentBoxSize: box };
			});
			callback(entries as unknown as ResizeObserverEntry[], {} as ResizeObserver);
		}
		await tick();

		const more = screen.getByRole('button', { name: 'More Critical Tasks controls' });
		more.focus();
		await fireEvent.keyDown(more, { key: 'Enter' });
		const menu = await screen.findByRole('menu');
		expect(within(menu).getByRole('menuitem', { name: 'Group, All groups' })).toBeTruthy();
		expect(within(menu).getByRole('menuitem', { name: 'Export Excel' })).toBeTruthy();
		expect(within(menu).getByRole('menuitem', { name: 'Reports' })).toBeTruthy();
		expect(within(menu).queryByRole('menuitem', { name: 'Task Library' })).toBeNull();
		expect(within(menu).queryByRole('menuitem', { name: 'Import Completions' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Record Completion' })).toBeNull();
	});
});
