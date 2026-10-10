// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toastStore } from '$lib/stores/toast.svelte';
import type { PersonnelExtendedInfo } from '$features/personnel/contracts';
import SoldierDataSheetModal from './SoldierDataSheetModal.svelte';

vi.mock('$app/navigation', () => ({ invalidate: vi.fn() }));

const initialInfo: PersonnelExtendedInfo = {
	bloodType: 'O+',
	basd: '',
	dateOfRank: '',
	maritalStatus: '',
	numberOfDependents: null,
	children: [],
	civilianEducation: '',
	militaryEducation: [],
	emergencyContactName: '',
	emergencyContactRelationship: '',
	emergencyContactPhone: '',
	spouseName: '',
	spousePhone: '',
	vehicleMakeModel: '',
	vehiclePlate: '',
	vehicleColor: '',
	personalEmail: '',
	personalPhone: '',
	addressStreet: '',
	addressCity: '',
	addressState: '',
	addressZip: '',
	address: ''
};

function renderSheet() {
	render(SoldierDataSheetModal, { props: { orgId: 'org-a', personnelId: 'person-1', initialInfo, onClose: vi.fn() } });
	return screen.getByRole('dialog', { name: 'Soldier Data Sheet' });
}

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('SoldierDataSheetModal', () => {
	it('points every label at exactly one control in both the tabbed and the wide layout', () => {
		const dialog = renderSheet();
		const targets = [...dialog.querySelectorAll('label[for]')].map((label) => label.getAttribute('for'));

		// The wide layout alone labels 19 controls; the tabbed layout may render its panels too.
		expect(targets.length).toBeGreaterThanOrEqual(19);
		for (const id of targets) {
			expect(document.querySelectorAll(`[id="${id}"]`).length).toBe(1);
		}
	});

	it('locks the draft while a save is held and unlocks it with the draft after a failure', async () => {
		let respond!: (response: Response) => void;
		const fetchMock = vi.fn(() => new Promise<Response>((resolve) => (respond = resolve)));
		vi.stubGlobal('fetch', fetchMock);
		vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
		const dialog = renderSheet();
		const [bloodType] = screen.getAllByLabelText('Blood type') as HTMLInputElement[];
		await fireEvent.input(bloodType, { target: { value: 'A-' } });

		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(dialog.getAttribute('aria-busy')).toBe('true');
		expect(bloodType.closest('fieldset')?.disabled).toBe(true);

		respond(new Response('Save denied', { status: 500 }));

		await waitFor(() => expect(dialog.hasAttribute('aria-busy')).toBe(false));
		expect(bloodType.value).toBe('A-');
		expect(bloodType.closest('fieldset')?.disabled).toBe(false);
	});
	it.each([
		['a SvelteKit error body', JSON.stringify({ message: 'Service unavailable' }), 'Service unavailable'],
		['a non-JSON body', 'upstream down', 'Failed to save Soldier Data Sheet'],
		['a JSON body without a message', JSON.stringify({ code: 503 }), 'Failed to save Soldier Data Sheet']
	])('shows the failure message for %s and keeps the draft in the open sheet', async (_shape, body, expected) => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(body, { status: 503 }))
		);
		const toastError = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
		const onClose = vi.fn();
		render(SoldierDataSheetModal, { props: { orgId: 'org-a', personnelId: 'person-1', initialInfo, onClose } });
		const dialog = screen.getByRole('dialog', { name: 'Soldier Data Sheet' });
		const [bloodType] = screen.getAllByLabelText('Blood type') as HTMLInputElement[];
		await fireEvent.input(bloodType, { target: { value: 'A-' } });

		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

		await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toBe(expected));
		expect(toastError).toHaveBeenCalledWith(expected);
		expect(bloodType.value).toBe('A-');
		expect(screen.getByRole('dialog', { name: 'Soldier Data Sheet' })).toBe(dialog);
		expect(onClose).not.toHaveBeenCalled();
	});

	it('keeps the sheet and the typed value when Escape is pressed with a draft', async () => {
		const onClose = vi.fn();
		render(SoldierDataSheetModal, { props: { orgId: 'org-a', personnelId: 'person-1', initialInfo, onClose } });
		const dialog = screen.getByRole('dialog', { name: 'Soldier Data Sheet' });
		const [bloodType] = screen.getAllByLabelText('Blood type') as HTMLInputElement[];
		await fireEvent.input(bloodType, { target: { value: 'A-' } });

		await fireEvent.keyDown(dialog, { key: 'Escape' });

		expect(screen.getByRole('dialog', { name: 'Soldier Data Sheet' })).toBe(dialog);
		expect(bloodType.value).toBe('A-');
		expect(onClose).not.toHaveBeenCalled();
	});

	it('closes on Escape when nothing was changed', async () => {
		const onClose = vi.fn();
		render(SoldierDataSheetModal, { props: { orgId: 'org-a', personnelId: 'person-1', initialInfo, onClose } });

		await fireEvent.keyDown(screen.getByRole('dialog', { name: 'Soldier Data Sheet' }), { key: 'Escape' });

		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('discards the draft when Cancel is pressed', async () => {
		const onClose = vi.fn();
		render(SoldierDataSheetModal, { props: { orgId: 'org-a', personnelId: 'person-1', initialInfo, onClose } });

		const [bloodType] = screen.getAllByLabelText('Blood type') as HTMLInputElement[];
		await fireEvent.input(bloodType, { target: { value: 'A-' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(onClose).toHaveBeenCalledTimes(1);
	});
});
