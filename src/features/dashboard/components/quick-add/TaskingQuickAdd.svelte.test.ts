// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { toastStore } from '$lib/stores/toast.svelte';
import type { DashboardScreenModel } from '../../read-model/dashboardScreenModel.svelte';
import TaskingDialogTestDouble from './TaskingDialogTestDouble.svelte';
import TaskingQuickAdd from './TaskingQuickAdd.svelte';

vi.mock('$features/calendar', async () => ({
	...(await vi.importActual<typeof import('$features/calendar')>('$features/calendar')),
	loadTaskingDialog: async () => ({ default: TaskingDialogTestDouble })
}));

const fetchMock = vi.fn();

beforeEach(() => {
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
	cleanup();
	fetchMock.mockReset();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

function open() {
	const onClose = vi.fn();
	const refreshTaskings = vi.fn(async () => {});
	const model = {
		data: { orgId: 'org-1' },
		inputs: { page: { orgName: 'Test Unit' } }
	} as unknown as DashboardScreenModel;
	render(TaskingQuickAdd, {
		props: {
			model,
			access: { can: () => true, isPrivileged: false },
			onClose,
			updates: { refreshSummary: vi.fn(), refreshTaskings, retryTaskings: vi.fn(), putRecord: vi.fn() }
		}
	});
	return { onClose, refreshTaskings };
}

const choices = { groups: [{ id: 'alpha', name: 'Alpha' }], events: [] };

describe('Create tasking from the Dashboard', () => {
	it('opens the sheet on the choices it reads, then rereads the Tasking rows once saved', async () => {
		fetchMock.mockResolvedValue(new Response(JSON.stringify(choices)));
		const { onClose, refreshTaskings } = open();

		const sheet = await screen.findByRole('dialog', { name: /Test Unit/ });
		expect(fetchMock.mock.calls[0][0]).toBe('/org/org-1/api/calendar-taskings/choices');
		expect(within(sheet).getByText('Alpha')).toBeTruthy();

		await fireEvent.click(within(sheet).getByRole('button', { name: 'Save' }));

		expect(onClose).toHaveBeenCalledOnce();
		await waitFor(() => expect(refreshTaskings).toHaveBeenCalledOnce());
	});

	it('closes with an error instead of opening an empty sheet when the choices cannot be read', async () => {
		const error = vi.spyOn(toastStore, 'error');
		fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: 'Forbidden' }), { status: 403 }));
		const { onClose, refreshTaskings } = open();

		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(error).toHaveBeenCalledOnce();
		expect(screen.queryByRole('dialog')).toBeNull();
		expect(refreshTaskings).not.toHaveBeenCalled();
	});
});
