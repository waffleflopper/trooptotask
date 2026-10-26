// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DashboardScreenModel } from '../../read-model/dashboardScreenModel.svelte';
import PickPeopleDialogTestDouble from './PickPeopleDialogTestDouble.svelte';
import PickPeoplePanel from './PickPeoplePanel.svelte';

afterEach(cleanup);

function open(refreshTaskings: () => Promise<void>) {
	const updates = { refreshSummary: vi.fn(), refreshTaskings, retryTaskings: vi.fn(), putRecord: vi.fn() };
	const close = vi.fn();
	render(PickPeoplePanel, {
		props: {
			model: {} as DashboardScreenModel,
			access: { can: () => true, isPrivileged: false },
			updates,
			save: (command: () => Promise<void>) => command(),
			saving: false,
			failure: null,
			close,
			orgId: 'org-1',
			tasking: { id: 't-1', responsibility: { kind: 'organization' as const }, requirement: null },
			groups: {},
			Dialog: PickPeopleDialogTestDouble
		}
	});
	return { close };
}

describe('PickPeoplePanel', () => {
	it('rereads the Taskings after a save and closes only once the row has the saved picks', async () => {
		let landed!: () => void;
		const refreshTaskings = vi.fn(() => new Promise<void>((resolve) => (landed = resolve)));
		const { close } = open(refreshTaskings);

		await fireEvent.click(screen.getByRole('button', { name: 'Save picks' }));

		expect(refreshTaskings).toHaveBeenCalledOnce();
		expect(close).not.toHaveBeenCalled();
		landed();
		await waitFor(() => expect(close).toHaveBeenCalledOnce());
	});

	it('closes without rereading when the picker is cancelled', async () => {
		const refreshTaskings = vi.fn(async () => {});
		const { close } = open(refreshTaskings);

		await fireEvent.click(screen.getByRole('button', { name: 'Cancel picks' }));

		expect(close).toHaveBeenCalledOnce();
		expect(refreshTaskings).not.toHaveBeenCalled();
	});
});
