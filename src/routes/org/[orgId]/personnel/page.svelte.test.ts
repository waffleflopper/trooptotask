// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	personnelRosterHydration,
	personnelStore,
	pinnedGroupsHydration,
	personnelWorkspaceHydrator
} from '$features/personnel';
import type { Personnel, PersonnelWorkspaceResult } from '$features/personnel/contracts';

const navigation = vi.hoisted(() => ({ goto: vi.fn(), invalidateAll: vi.fn() }));
const feedback = vi.hoisted(() => ({ success: vi.fn(), info: vi.fn(), error: vi.fn(), warning: vi.fn() }));
vi.mock('$app/navigation', () => navigation);
vi.mock('svelte-sonner', () => ({ toast: { ...feedback, dismiss: vi.fn() } }));
vi.mock('$features/app-shell', () => ({
	getAppShellContext: () => ({
		scopeSet: { kind: 'organization' },
		affordanceForFeatureAction: () => ({ allowed: true, visible: true, disabled: false, reason: 'allowed:capability' })
	})
}));

import Layout from './+layout.svelte';
import Page from './+page.svelte';
import RouteBoundary from '$features/personnel/test-support/PersonnelRouteTestBoundary.svelte';

const alpha = person('alpha', 'Alpha');
const bravo = person('bravo', 'Bravo');
const currentB = person('b-record', 'CurrentB');

function person(id: string, lastName: string): Personnel {
	return {
		id,
		rank: 'SGT',
		lastName,
		firstName: 'Test',
		mos: '68W',
		clinicRole: 'Medic',
		groupId: 'section',
		groupName: 'Section',
		archivedAt: null,
		ets: null,
		deros: null,
		slug: `${id}-test`
	};
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<T>((done, fail) => {
		resolve = done;
		reject = fail;
	});
	return { promise, resolve, reject };
}

function workspace(orgId: string, rows: Personnel[]): PersonnelWorkspaceResult {
	return {
		laneKey: 'personnel',
		data: {
			personnel: rows,
			personnelLookup: [],
			groups: [],
			statusTypes: [],
			rankCatalog: [],
			pinnedGroups: [],
			lossWarningWindowDays: 180,
			awardTrackingAcknowledgedPersonnelIds: []
		},
		hydration: {
			orgId,
			personnel: { mode: 'replace', snapshotKey: `${orgId}-personnel`, items: rows },
			groups: { mode: 'replace', snapshotKey: `${orgId}-groups`, items: [] },
			statusTypes: { mode: 'replace', snapshotKey: `${orgId}-statuses`, items: [] },
			pinnedGroups: { mode: 'replace', snapshotKey: `${orgId}-pins`, items: [] }
		}
	};
}

function routeData(orgId: string, data: PersonnelWorkspaceResult | Promise<PersonnelWorkspaceResult>) {
	return { shell: { org: { id: orgId, name: `Unit ${orgId}` } }, personnel: { data } };
}

// The Organization layout owns workspace hydration; this public boundary supplies
// its saved snapshot while the real route, context, PageView and bulk helper run.
function hydrate(orgId: string, rows: Personnel[]) {
	personnelRosterHydration.load(rows, orgId);
	pinnedGroupsHydration.load([], orgId);
}

async function select(labels: string[]) {
	await fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
	for (const name of labels) await fireEvent.click(screen.getByRole('checkbox', { name }));
}

async function submit() {
	await fireEvent.click(screen.getByRole('button', { name: 'Confirm Archive' }));
	const dialog = await screen.findByRole('alertdialog');
	await fireEvent.click(within(dialog).getByRole('button', { name: 'Archive' }));
}

function submittedIds(send: ReturnType<typeof vi.fn>): string[][] {
	return send.mock.calls.map((call) => JSON.parse(String(call[1].body)).ids);
}

async function settle(promise: Promise<unknown>) {
	await promise.catch(() => undefined);
	await tick();
}

beforeEach(() => {
	personnelWorkspaceHydrator.reset();
	navigation.invalidateAll.mockResolvedValue(undefined);
});
afterEach(() => {
	cleanup();
	hydrate('reset', []);
	vi.unstubAllGlobals();
	vi.resetAllMocks();
});

describe('Personnel route archive retry lifetime', () => {
	it.each(['immediate', 'deferred'] as const)(
		'preserves failed-only selection through same-Organization refresh after %s bootstrap',
		async (bootstrap) => {
			hydrate('a', [alpha, bravo]);
			const firstWorkspace = deferred<PersonnelWorkspaceResult>();
			const nextWorkspace = deferred<PersonnelWorkspaceResult>();
			const refreshCompleted = deferred<void>();
			const send = vi
				.fn()
				.mockResolvedValueOnce(
					Response.json({
						archivedIds: [],
						approvalRequestedIds: ['bravo'],
						errors: [{ id: 'alpha', message: 'source write failed' }]
					})
				)
				.mockResolvedValueOnce(Response.json({ archivedIds: ['alpha'], approvalRequestedIds: [], errors: [] }));
			vi.stubGlobal('fetch', send);
			const view = render(Page, {
				data: routeData('a', bootstrap === 'immediate' ? workspace('a', [alpha, bravo]) : firstWorkspace.promise)
			});
			if (bootstrap === 'deferred') firstWorkspace.resolve(workspace('a', [alpha, bravo]));
			await screen.findByText('Alpha, Test');
			navigation.invalidateAll.mockImplementationOnce(async () => {
				await view.rerender({ data: routeData('a', nextWorkspace.promise) });
				await refreshCompleted.promise;
			});
			await select(['Select SGT Alpha, Test', 'Select SGT Bravo, Test']);
			await submit();
			await waitFor(() => expect(navigation.invalidateAll).toHaveBeenCalledOnce());
			const retained = screen.getByRole('checkbox', { name: 'Select SGT Alpha, Test' });
			expect(retained.getAttribute('aria-checked')).toBe('true');
			expect(retained).toHaveProperty('disabled', true);
			expect(screen.getByRole('checkbox', { name: 'Select SGT Bravo, Test' }).getAttribute('aria-checked')).toBe(
				'false'
			);
			expect(send).toHaveBeenCalledOnce();

			hydrate('a', [bravo]);
			nextWorkspace.resolve(workspace('a', [bravo]));
			await settle(nextWorkspace.promise);
			expect(screen.queryByText('Alpha, Test')).toBeNull();
			expect(screen.getByText('Bravo, Test')).toBeTruthy();
			expect(screen.getByRole('button', { name: 'Confirm Archive' })).toHaveProperty('disabled', true);
			refreshCompleted.resolve();
			await waitFor(() =>
				expect(screen.getByRole('button', { name: 'Confirm Archive' })).toHaveProperty('disabled', false)
			);
			expect(send).toHaveBeenCalledOnce();
			await submit();
			await waitFor(() => expect(feedback.success).toHaveBeenCalledOnce());
			expect(submittedIds(send)).toEqual([['alpha', 'bravo'], ['alpha']]);
			expect(personnelStore.getById('bravo')).toBeTruthy();
		}
	);

	it('keeps an absent failed target explicitly retryable when refreshed active rows are empty', async () => {
		hydrate('a', [alpha, bravo]);
		const nextWorkspace = deferred<PersonnelWorkspaceResult>();
		const refreshCompleted = deferred<void>();
		const send = vi
			.fn()
			.mockResolvedValueOnce(
				Response.json({
					archivedIds: ['bravo'],
					approvalRequestedIds: [],
					errors: [{ id: 'alpha', message: 'source write failed' }]
				})
			)
			.mockResolvedValueOnce(Response.json({ archivedIds: ['alpha'], approvalRequestedIds: [], errors: [] }));
		vi.stubGlobal('fetch', send);
		const view = render(Page, { data: routeData('a', workspace('a', [alpha, bravo])) });
		navigation.invalidateAll.mockImplementationOnce(async () => {
			await view.rerender({ data: routeData('a', nextWorkspace.promise) });
			await refreshCompleted.promise;
		});
		await select(['Select SGT Alpha, Test', 'Select SGT Bravo, Test']);
		await submit();
		await waitFor(() => expect(navigation.invalidateAll).toHaveBeenCalledOnce());
		hydrate('a', []);
		nextWorkspace.resolve(workspace('a', []));
		await settle(nextWorkspace.promise);
		refreshCompleted.resolve();
		await waitFor(() =>
			expect(screen.getByRole('button', { name: 'Confirm Archive' })).toHaveProperty('disabled', false)
		);
		expect(screen.getByText(/^1 selected/)).toBeTruthy();
		await submit();
		await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
		expect(submittedIds(send)).toEqual([['alpha', 'bravo'], ['alpha']]);
	});

	it.each(['success', 'failure'] as const)(
		'disposes A’s held %s result while B retains its own pending selection',
		async (outcome) => {
			hydrate('a', [alpha]);
			const a = deferred<Response>();
			const b = deferred<Response>();
			const send = vi.fn().mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
			vi.stubGlobal('fetch', send);
			const view = render(Page, { data: routeData('a', workspace('a', [alpha])) });
			await select(['Select SGT Alpha, Test']);
			await submit();
			await waitFor(() => expect(send).toHaveBeenCalledOnce());
			hydrate('b', [currentB]);
			await view.rerender({ data: routeData('b', workspace('b', [currentB])) });
			expect(screen.queryByRole('alertdialog')).toBeNull();
			expect(screen.queryByText('Alpha, Test')).toBeNull();
			await select(['Select SGT CurrentB, Test']);
			await submit();
			await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
			a.resolve(
				outcome === 'success'
					? Response.json({ archivedIds: ['alpha'], approvalRequestedIds: [], errors: [] })
					: new Response(null, { status: 503 })
			);
			await settle(a.promise);
			const currentDialog = screen.getByRole('alertdialog');
			expect(within(currentDialog).getByRole('button', { name: /Archive/ })).toHaveProperty('disabled', true);
			expect(personnelStore.getById('b-record')).toBeTruthy();
			for (const port of Object.values(feedback)) expect(port).not.toHaveBeenCalled();
			expect(navigation.invalidateAll).not.toHaveBeenCalled();
			b.resolve(Response.json({ archivedIds: [], approvalRequestedIds: ['b-record'], errors: [] }));
			await waitFor(() => expect(feedback.info).toHaveBeenCalledOnce());
			expect(send.mock.calls.map((call) => call[0])).toEqual([
				'/org/a/api/personnel/archive-batch',
				'/org/b/api/personnel/archive-batch'
			]);
		}
	);
	it('retains failed-only retry through a real layout refresh rejection after invalidation has returned', async () => {
		const initialWorkspace = deferred<PersonnelWorkspaceResult>();
		const refreshWorkspace = deferred<PersonnelWorkspaceResult>();
		const send = vi
			.fn()
			.mockResolvedValueOnce(
				Response.json({
					archivedIds: [],
					approvalRequestedIds: ['bravo'],
					errors: [{ id: 'alpha', message: 'source write failed' }]
				})
			)
			.mockResolvedValueOnce(Response.json({ archivedIds: ['alpha'], approvalRequestedIds: [], errors: [] }));
		vi.stubGlobal('fetch', send);
		const view = render(RouteBoundary, { data: routeData('a', initialWorkspace.promise), Layout, Page });
		initialWorkspace.resolve(workspace('a', [alpha, bravo]));
		await settle(initialWorkspace.promise);
		await screen.findByText('Alpha, Test');
		expect(personnelStore.getById('bravo')).toBeTruthy();
		navigation.invalidateAll.mockImplementationOnce(async () => {
			await view.rerender({ data: routeData('a', refreshWorkspace.promise) });
		});
		await select(['Select SGT Alpha, Test', 'Select SGT Bravo, Test']);
		await submit();
		// The invalidation returns with a new pending stream; a later rejection is
		// handled by the real Layout/Page, outside the bulk caller's awaited refresh.
		await waitFor(() =>
			expect(screen.getByRole('button', { name: 'Confirm Archive' })).toHaveProperty('disabled', false)
		);
		expect(navigation.invalidateAll).toHaveBeenCalledOnce();
		expect(feedback.info).toHaveBeenCalledOnce();
		refreshWorkspace.reject(new Error('readback connection failed'));
		const alert = await screen.findByRole('alert');
		expect(alert.textContent).toMatch(/refresh/i);
		expect(screen.getByText('Alpha, Test')).toBeTruthy();
		expect(screen.getByText('Bravo, Test')).toBeTruthy();
		expect(screen.getByRole('checkbox', { name: 'Select SGT Alpha, Test' }).getAttribute('aria-checked')).toBe('true');
		expect(screen.getByRole('checkbox', { name: 'Select SGT Bravo, Test' }).getAttribute('aria-checked')).toBe('false');
		expect(send).toHaveBeenCalledOnce();
		await submit();
		await waitFor(() => expect(feedback.success).toHaveBeenCalledOnce());
		expect(submittedIds(send)).toEqual([['alpha', 'bravo'], ['alpha']]);
		expect(personnelStore.getById('bravo')).toBeTruthy();
	});

	it.each(['initial', 'new-Organization'] as const)(
		'keeps an actual layout/page %s load rejection fatal when there is no saved workspace for that Organization',
		async (phase) => {
			const pending = deferred<PersonnelWorkspaceResult>();
			const initialWorkspace = deferred<PersonnelWorkspaceResult>();
			const view = render(RouteBoundary, {
				data: routeData('a', phase === 'initial' ? pending.promise : initialWorkspace.promise),
				Layout,
				Page
			});
			if (phase === 'new-Organization') {
				initialWorkspace.resolve(workspace('a', [alpha]));
				await settle(initialWorkspace.promise);
				await screen.findByText('Alpha, Test');
				await view.rerender({ data: routeData('b', pending.promise) });
			}
			pending.reject(new Error(`${phase} workspace unavailable`));
			const alert = await screen.findByRole('alert');
			expect(alert.textContent).toContain(`${phase} workspace unavailable`);
			expect(screen.queryByText('Alpha, Test')).toBeNull();
			expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull();
		}
	);
});
