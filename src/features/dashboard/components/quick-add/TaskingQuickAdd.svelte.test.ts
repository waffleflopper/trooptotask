// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { toastStore } from '$lib/stores/toast.svelte';
import type { DashboardScreenModel } from '../../read-model/dashboardScreenModel.svelte';
import TaskingFormTestDouble from './TaskingFormTestDouble.svelte';
import TaskingQuickAdd from './TaskingQuickAdd.svelte';

vi.mock('$features/calendar', async () => ({
	...(await vi.importActual<typeof import('$features/calendar')>('$features/calendar')),
	loadTaskingForm: async () => ({ default: TaskingFormTestDouble })
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
	const onClose = vi.fn(() => unmount());
	const refreshTaskings = vi.fn(async () => {});
	const model = {
		data: { orgId: 'org-1' },
		inputs: { page: { orgName: 'Test Unit' } }
	} as unknown as DashboardScreenModel;
	const { unmount } = render(TaskingQuickAdd, {
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

function heldChoices() {
	let answer!: (response: Response) => void;
	fetchMock.mockReturnValue(new Promise<Response>((resolve) => (answer = resolve)));
	return () => answer(new Response(JSON.stringify(choices)));
}

async function openedForm() {
	fetchMock.mockResolvedValue(new Response(JSON.stringify(choices)));
	const handlers = open();
	await screen.findByLabelText('Required outcome');
	return { ...handlers, sheet: screen.getByRole('dialog', { name: 'Create tasking' }) };
}

describe('Create tasking from the Dashboard', () => {
	it('opens the sheet on the choices it reads, then rereads the Tasking rows once saved', async () => {
		const { onClose, refreshTaskings, sheet } = await openedForm();

		expect(fetchMock.mock.calls[0][0]).toBe('/org/org-1/api/calendar-taskings/choices');
		expect(within(sheet).getByText('Alpha')).toBeTruthy();

		await fireEvent.click(within(sheet).getByRole('button', { name: 'Save' }));

		expect(onClose).toHaveBeenCalledOnce();
		await waitFor(() => expect(refreshTaskings).toHaveBeenCalledOnce());
	});

	it('fills the sheet it opened with the form once the choices arrive, without a second sheet', async () => {
		const answer = heldChoices();
		open();

		const sheet = await screen.findByRole('dialog', { name: 'Create tasking' });
		expect(within(sheet).queryByLabelText('Required outcome')).toBeNull();
		answer();

		expect(await within(sheet).findByLabelText('Required outcome')).toBeTruthy();
		expect(within(sheet).getByText('Alpha')).toBeTruthy();
		expect(screen.getAllByRole('dialog')).toEqual([sheet]);
	});

	it('moves focus to the first field when the form arrives', async () => {
		const answer = heldChoices();
		open();
		await screen.findByRole('button', { name: 'Cancel' });
		answer();

		const outcome = await screen.findByLabelText('Required outcome');
		await waitFor(() => expect(document.activeElement).toBe(outcome));
	});

	it('closes once on Cancel while the choices load', async () => {
		heldChoices();
		const { onClose } = open();

		const pending = await screen.findByRole('dialog', { name: 'Create tasking' });
		await fireEvent.click(within(pending).getByRole('button', { name: 'Cancel' }));

		expect(onClose).toHaveBeenCalledOnce();
	});

	it('closes once on Escape while the choices load, and a late answer opens nothing', async () => {
		const answer = heldChoices();
		const { onClose, refreshTaskings } = open();

		await fireEvent.keyDown(await screen.findByRole('dialog', { name: 'Create tasking' }), { key: 'Escape' });
		expect(onClose).toHaveBeenCalledOnce();
		expect(screen.queryByRole('dialog')).toBeNull();

		answer();
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(screen.queryByRole('dialog')).toBeNull();
		expect(onClose).toHaveBeenCalledOnce();
		expect(refreshTaskings).not.toHaveBeenCalled();
	});

	it('closes on Escape while the form has no entries', async () => {
		const { onClose, sheet } = await openedForm();

		await fireEvent.keyDown(sheet, { key: 'Escape' });
		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
	});

	it('does not close on Escape after the form reports entries', async () => {
		const { onClose, sheet } = await openedForm();
		await fireEvent.input(screen.getByLabelText('Required outcome'), { target: { value: 'Provide medics' } });

		await fireEvent.keyDown(sheet, { key: 'Escape' });

		expect(onClose).not.toHaveBeenCalled();
		expect(screen.getByRole('dialog', { name: 'Create tasking' })).toBe(sheet);
	});

	it('does not close on Escape while the form is saving', async () => {
		const { onClose, sheet } = await openedForm();
		await fireEvent.click(screen.getByRole('button', { name: 'Start saving' }));

		await fireEvent.keyDown(sheet, { key: 'Escape' });

		expect(sheet.getAttribute('aria-busy')).toBe('true');
		expect(onClose).not.toHaveBeenCalled();
		expect(screen.getByRole('dialog', { name: 'Create tasking' })).toBe(sheet);
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
