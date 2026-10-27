// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { DashboardScreenModel } from '../read-model/dashboardScreenModel.svelte';
import type { NeedsYouLoad } from '../sections/dashboardSections';
import { buildNeedsYouQueue, needsYouPanel, type NeedsYouAction, type NeedsYouItem } from '../sections/needsYou';
import NeedsYouPanelTestDouble from './needs-you/NeedsYouPanelTestDouble.svelte';
import NeedsYouQueue from './NeedsYouQueue.svelte';

const policy = POLICY_ACTION_CATALOG.personnel.manageRecords;

function leaving(id: string, action: NeedsYouAction | null): NeedsYouItem {
	return {
		kind: 'leaving',
		id,
		personnelId: id,
		title: `Row ${id}`,
		subtitle: 'End-of-tour award not started',
		timing: 'in 28 days',
		href: `/org/org-1/personnel/${id}/data-sheet`,
		action,
		urgency: { date: '2026-11-16' }
	};
}

function show(items: NeedsYouItem[], unavailable: string[] = [], loads: NeedsYouLoad[] = []) {
	const updates = { refreshSummary: vi.fn(), refreshTaskings: vi.fn(), retryTaskings: vi.fn(), putRecord: vi.fn() };
	const { rerender, container } = render(NeedsYouQueue, {
		props: {
			queue: buildNeedsYouQueue([items]),
			model: {} as DashboardScreenModel,
			access: { can: () => true, isPrivileged: false },
			updates,
			unavailable,
			loads
		}
	});
	return { updates, rerender, container };
}

function deferred() {
	let resolve!: () => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<void>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

afterEach(cleanup);

describe('NeedsYouQueue actions', () => {
	it('saves from the row, marks the action busy meanwhile, and keeps a failed row with its message', async () => {
		const first = deferred();
		const run = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce(undefined);
		const { updates } = show([leaving('p-patel', { label: 'Award started', policy, mode: 'run', run })]);
		const button = screen.getByRole('button', { name: 'Award started' }) as HTMLButtonElement;

		button.focus();
		await fireEvent.click(button);
		await fireEvent.click(button);
		expect(button.getAttribute('aria-disabled')).toBe('true');
		expect(run).toHaveBeenCalledTimes(1);
		expect(run).toHaveBeenCalledWith(updates);
		first.reject(new Error('You cannot manage this person'));

		expect((await screen.findByRole('alert')).textContent).toBe('You cannot manage this person');
		expect(screen.getByRole('link', { name: 'Row p-patel' })).toBeTruthy();
		expect(button.getAttribute('aria-disabled')).toBe('false');
		expect(document.activeElement).toBe(button);

		await fireEvent.click(button);
		await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
		expect(run).toHaveBeenCalledTimes(2);
	});

	it('moves focus to the row now in its place when a saved row leaves', async () => {
		const next = leaving('p-kim', null);
		const harness: { rerender?: ReturnType<typeof show>['rerender'] } = {};
		const run = vi.fn(async () => {
			await harness.rerender?.({ queue: buildNeedsYouQueue([[next]]) });
		});
		harness.rerender = show([leaving('p-patel', { label: 'Award started', policy, mode: 'run', run }), next]).rerender;
		const button = screen.getByRole('button', { name: 'Award started' });

		button.focus();
		await fireEvent.click(button);

		await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Row p-kim' })));
	});

	it.each([
		{ unavailable: [], emptyText: 'Nothing needs you right now.' },
		{ unavailable: ['Training'], emptyText: 'Needs you is incomplete. Training items could not load.' }
	])(
		'moves focus to the empty state ($emptyText) when a saved action clears the queue',
		async ({ unavailable, emptyText }) => {
			const harness: { rerender?: ReturnType<typeof show>['rerender'] } = {};
			const run = vi.fn(async () => {
				await harness.rerender?.({ queue: buildNeedsYouQueue([[]]) });
			});
			harness.rerender = show(
				[leaving('p-patel', { label: 'Award started', policy, mode: 'run', run })],
				unavailable
			).rerender;
			const button = screen.getByRole('button', { name: 'Award started' });

			button.focus();
			await fireEvent.click(button);

			await waitFor(() => expect(document.activeElement?.textContent?.trim()).toBe(emptyText));
		}
	);

	it('lists the features that could not load under the rows', () => {
		show([leaving('p-patel', null)], ['Training', 'Critical tasks']);

		expect(screen.getByRole('link', { name: 'Row p-patel' })).toBeTruthy();
		expect(screen.getByText('Needs you is incomplete. Training and Critical tasks items could not load.')).toBeTruthy();
	});

	it('shows a panel that failed to open as a message in the row', async () => {
		const open = vi.fn().mockRejectedValue(new Error('Rating Scheme entry not found'));
		show([leaving('eval-1', { label: 'Update status', policy, mode: 'dialog', open })]);

		await fireEvent.click(screen.getByRole('button', { name: 'Update status' }));

		expect((await screen.findByRole('alert')).textContent).toBe('Rating Scheme entry not found');
	});

	it('expands a panel in the row, shows its failure there, and keeps the message in the row once collapsed', async () => {
		const command = vi.fn().mockRejectedValue(new Error('Assignment type is archived'));
		const open = vi.fn().mockResolvedValue(needsYouPanel(NeedsYouPanelTestDouble, { command }));
		show([leaving('sd', { label: 'Fill 2 days', policy, mode: 'expand', open })]);
		const toggle = screen.getByRole('button', { name: 'Fill 2 days' });
		expect(toggle.getAttribute('aria-expanded')).toBe('false');

		await fireEvent.click(toggle);
		const panel = await screen.findByRole('region', { name: 'Test panel' });
		expect(toggle.getAttribute('aria-expanded')).toBe('true');
		expect(toggle.getAttribute('aria-controls')).toBe(panel.parentElement?.id);

		await fireEvent.click(screen.getByRole('button', { name: 'Save panel' }));
		expect(await screen.findByText('Panel says: Assignment type is archived')).toBeTruthy();
		expect(screen.queryByRole('alert')).toBeNull();

		const close = screen.getByRole('button', { name: 'Close panel' });
		close.focus();
		await fireEvent.click(close);
		expect(toggle.getAttribute('aria-expanded')).toBe('false');
		await waitFor(() => expect(document.activeElement).toBe(toggle));
		expect(screen.getByRole('alert').textContent).toBe('Assignment type is archived');
	});

	it('opens one panel in place when a second row opens while the first is still loading', async () => {
		const panel = () => needsYouPanel(NeedsYouPanelTestDouble, { command: vi.fn() });
		const first = deferred();
		const openFirst = vi.fn(() => first.promise.then(panel));
		const openSecond = vi.fn().mockResolvedValue(panel());
		show([
			leaving('a', { label: 'Fill A', policy, mode: 'expand', open: openFirst }),
			leaving('b', { label: 'Fill B', policy, mode: 'expand', open: openSecond })
		]);

		await fireEvent.click(screen.getByRole('button', { name: 'Fill A' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Fill B' }));
		await screen.findByRole('region', { name: 'Test panel' });
		first.resolve();
		await first.promise;

		await waitFor(() => expect(screen.getAllByRole('region', { name: 'Test panel' })).toHaveLength(1));
		expect(screen.getByRole('button', { name: 'Fill A' }).getAttribute('aria-expanded')).toBe('false');
		expect(screen.getByRole('button', { name: 'Fill B' }).getAttribute('aria-expanded')).toBe('true');
	});

	it('collapses an expanded panel from its toggle', async () => {
		const open = vi.fn().mockResolvedValue(needsYouPanel(NeedsYouPanelTestDouble, { command: vi.fn() }));
		show([leaving('sd', { label: 'Fill 2 days', policy, mode: 'expand', open })]);
		const toggle = screen.getByRole('button', { name: 'Fill 2 days' });

		await fireEvent.click(toggle);
		await screen.findByRole('region', { name: 'Test panel' });
		await fireEvent.click(toggle);

		expect(screen.queryByRole('region', { name: 'Test panel' })).toBeNull();
	});

	it('links to the owning page for a link action and shows no action for a row without one', () => {
		show([
			leaving('a', { label: 'Check off', policy, mode: 'link', href: '/org/org-1/onboarding?packet=a' }),
			leaving('b', null)
		]);

		expect(screen.getByRole('link', { name: 'Check off' }).getAttribute('href')).toBe('/org/org-1/onboarding?packet=a');
		expect(screen.queryAllByRole('button')).toEqual([]);
	});
});

describe('NeedsYouQueue sources that load after the page', () => {
	const load = (state: 'pending' | 'failed', retry = vi.fn()): NeedsYouLoad => ({ label: 'Tasking', state, retry });

	it('holds the place of a pending source with a placeholder instead of saying nothing needs you', () => {
		const { container } = show([], [], [load('pending')]);

		expect(container.querySelector('[data-needs-you-pending]')).not.toBeNull();
		expect(screen.queryByText('Nothing needs you right now.')).toBeNull();
	});

	it('keeps the rows it has and adds a placeholder row for a pending source', () => {
		const { container } = show([leaving('p-patel', null)], [], [load('pending')]);

		expect(screen.getByRole('link', { name: 'Row p-patel' })).toBeTruthy();
		expect(container.querySelector('[data-needs-you-pending]')).not.toBeNull();
	});

	it('names a failed source beside the other rows and retries it from the note', async () => {
		const retry = vi.fn();
		const { updates } = show([leaving('p-patel', null)], [], [load('failed', retry)]);

		expect(screen.getByRole('link', { name: 'Row p-patel' })).toBeTruthy();
		expect(screen.getByText(/incomplete.*Tasking/)).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

		expect(retry).toHaveBeenCalledWith(updates);
	});

	it('is incomplete, not clear, when the only source failed', () => {
		show([], [], [load('failed')]);

		expect(screen.getByText(/incomplete.*Tasking/)).toBeTruthy();
		expect(screen.queryByText('Nothing needs you right now.')).toBeNull();
	});

	it('says how many rows the source did not list and links to where they are', () => {
		const partial: NeedsYouLoad = {
			label: 'Tasking',
			state: 'partial',
			unlisted: 3,
			href: '/org/org-1/calendar/taskings',
			retry: vi.fn()
		};
		show([leaving('p-patel', null)], [], [partial]);

		expect(screen.getByText(/3 more Tasking items are not listed/)).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Open Taskings' }).getAttribute('href')).toBe(
			'/org/org-1/calendar/taskings'
		);
	});
});
