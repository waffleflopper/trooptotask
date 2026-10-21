// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { DashboardScreenModel } from '../read-model/dashboardScreenModel.svelte';
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

function show(items: NeedsYouItem[]) {
	const updates = { refreshSummary: vi.fn(), putRecord: vi.fn() };
	render(NeedsYouQueue, {
		props: {
			queue: buildNeedsYouQueue([items]),
			model: {} as DashboardScreenModel,
			access: { can: () => true },
			updates
		}
	});
	return { updates };
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
	it('saves from the row, disables the action meanwhile, and keeps a failed row with its message', async () => {
		const first = deferred();
		const run = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce(undefined);
		const { updates } = show([leaving('p-patel', { label: 'Award started', policy, mode: 'run', run })]);
		const button = screen.getByRole('button', { name: 'Award started' }) as HTMLButtonElement;

		await fireEvent.click(button);
		expect(button.disabled).toBe(true);
		expect(run).toHaveBeenCalledWith(updates);
		first.reject(new Error('You cannot manage this person'));

		expect((await screen.findByRole('alert')).textContent).toBe('You cannot manage this person');
		expect(screen.getByRole('link', { name: 'Row p-patel' })).toBeTruthy();
		expect(button.disabled).toBe(false);

		await fireEvent.click(button);
		await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
		expect(run).toHaveBeenCalledTimes(2);
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

		await fireEvent.click(screen.getByRole('button', { name: 'Close panel' }));
		expect(toggle.getAttribute('aria-expanded')).toBe('false');
		expect(screen.getByRole('alert').textContent).toBe('Assignment type is archived');
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
