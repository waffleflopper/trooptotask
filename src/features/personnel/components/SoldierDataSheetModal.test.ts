// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
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
});
