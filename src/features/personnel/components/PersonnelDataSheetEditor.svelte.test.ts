// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Personnel } from '../personnel.types';
import type { PersonnelExtendedInfo } from '../personnelExtendedInfo.types';

const { gotoMock, beforeNavigateMock } = vi.hoisted(() => ({ gotoMock: vi.fn(), beforeNavigateMock: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto: gotoMock, invalidate: vi.fn(), beforeNavigate: beforeNavigateMock }));
vi.mock('$lib/components/ui/date-picker', async () => ({
	DatePicker: (await import('$features/calendar/test-support/DatePickerInputStub.svelte')).default
}));

import { toastStore } from '$lib/stores/toast.svelte';
import type { PersonnelWorkspaceResult } from '../contracts';
import type { OrganizationRankCatalogEntry } from '../rankCatalogContracts';
import DataSheetEditorHarness from '../test-support/DataSheetEditorHarness.svelte';
import DataSheetPageHarness from '../test-support/DataSheetPageHarness.svelte';

const person: Personnel = {
	id: 'person-1',
	slug: 'rivera-monica',
	rank: 'SGT',
	lastName: 'Rivera',
	firstName: 'Monica',
	mos: '68W',
	clinicRole: 'Medic',
	ets: '2027-03-14',
	deros: null,
	groupId: 'group-1',
	groupName: 'Alpha',
	archivedAt: null
};

const info: PersonnelExtendedInfo = {
	dodId: '0123456789',
	bloodType: 'O+',
	basd: '',
	dateOfRank: '',
	maritalStatus: '',
	maritalStatusDate: '',
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
	address: '',
	updatedAt: null,
	updatedBy: null
};

beforeEach(() => {
	gotoMock.mockReset();
	beforeNavigateMock.mockReset();
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

const catalogs = {
	groups: [{ id: 'group-1', name: 'Alpha', sortOrder: 0 }],
	rankCatalog: [
		{
			organizationId: 'org-1',
			source: 'built-in',
			code: 'SGT',
			label: 'Sergeant',
			service: 'army',
			category: 'enlisted',
			payGrade: 'E-5',
			state: 'active',
			sortOrder: 0
		}
	] satisfies OrganizationRankCatalogEntry[],
	lossWarningWindowDays: 180
};

function renderEditor() {
	render(DataSheetEditorHarness, {
		props: { orgId: 'org-1', orgUrlSegment: 'org-alpha', person, info, ...catalogs, today: '2026-10-18' }
	});
}

describe('PersonnelDataSheetEditor', () => {
	it('shows the server message beside the refused field and focuses it', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValue(
					Response.json(
						{ saved: false, field: 'personalEmail', message: 'Enter a valid email address.' },
						{ status: 400 }
					)
				)
		);
		renderEditor();
		const email = screen.getByLabelText('Personal email') as HTMLInputElement;
		await fireEvent.input(email, { target: { value: 'not-an-email' } });

		await fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(() => expect(screen.getByText('Enter a valid email address.')).toBeTruthy());
		expect(email.getAttribute('aria-invalid')).toBe('true');
		expect(email.getAttribute('aria-describedby')).toBeTruthy();
		await waitFor(() => expect(document.activeElement).toBe(email));
		expect(gotoMock).not.toHaveBeenCalled();
	});

	it.each([
		{ field: 'lastName', label: 'Last name' },
		{ field: 'spouseName', label: 'Spouse name' },
		{ field: 'vehiclePlate', label: 'Plate' }
	])('names the $field message from the input it refuses', async ({ field, label }) => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(Response.json({ saved: false, field, message: `Fix ${field}.` }, { status: 400 }))
		);
		renderEditor();
		const input = screen.getByLabelText(label) as HTMLInputElement;
		await fireEvent.input(input, { target: { value: 'x' } });

		await fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		const message = await screen.findByText(`Fix ${field}.`);
		expect(input.getAttribute('aria-invalid')).toBe('true');
		expect(document.getElementById(input.getAttribute('aria-describedby') ?? '')).toBe(message);
	});

	it('navigates to the saved record after a successful save', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				Response.json({
					saved: true,
					person: { ...person, lastName: 'Rivera-Cole', slug: 'rivera-cole-monica' },
					extendedInfo: info
				})
			)
		);
		renderEditor();
		await fireEvent.input(screen.getByLabelText('Last name'), { target: { value: 'Rivera-Cole' } });

		await fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(() =>
			expect(gotoMock).toHaveBeenCalledWith('/org/org-alpha/personnel/rivera-cole-monica/data-sheet', {
				replaceState: true,
				invalidate: ['app:personnel-detail-header', 'app:personnel-detail-data-sheet']
			})
		);
	});

	it('does not navigate or announce a save that finishes after the editor is gone', async () => {
		let release: (response: Response) => void = () => {};
		vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>((resolve) => (release = resolve))));
		const success = vi.spyOn(toastStore, 'success');
		renderEditor();
		await fireEvent.input(screen.getByLabelText('Last name'), { target: { value: 'Rivera-Cole' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		cleanup();
		release(
			Response.json({
				saved: true,
				person: { ...person, lastName: 'Rivera-Cole', slug: 'rivera-cole-monica' },
				extendedInfo: info
			})
		);
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(gotoMock).not.toHaveBeenCalled();
		expect(success).not.toHaveBeenCalled();
	});

	it('asks before Escape discards a changed field, and keeps editing on request', async () => {
		renderEditor();
		await fireEvent.input(screen.getByLabelText('Personal phone'), { target: { value: '(910) 555-0148' } });

		await fireEvent.keyDown(window, { key: 'Escape' });

		const dialog = await screen.findByRole('alertdialog');
		expect(within(dialog).getByText(/1 unsaved change on this data sheet/)).toBeTruthy();
		expect(gotoMock).not.toHaveBeenCalled();
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
		expect(screen.queryByRole('alertdialog')).toBeNull();
		expect((screen.getByLabelText('Personal phone') as HTMLInputElement).value).toBe('(910) 555-0148');
	});

	it('leaves straight away on Cancel when nothing changed', async () => {
		renderEditor();

		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

		await waitFor(() =>
			expect(gotoMock).toHaveBeenCalledWith('/org/org-alpha/personnel/rivera-monica/data-sheet', {
				replaceState: true
			})
		);
	});

	it('cancels a navigation away from a changed form and offers to discard', async () => {
		renderEditor();
		await fireEvent.input(screen.getByLabelText('Personal phone'), { target: { value: '(910) 555-0148' } });
		const guard = beforeNavigateMock.mock.calls[0][0] as (navigation: unknown) => void;
		const cancel = vi.fn();

		guard({
			cancel,
			willUnload: false,
			to: { url: new URL('http://localhost/org/org-alpha/personnel') },
			type: 'link'
		});

		expect(cancel).toHaveBeenCalledTimes(1);
		const dialog = await screen.findByRole('alertdialog');
		expect(within(dialog).getByRole('button', { name: 'Discard changes' })).toBeTruthy();
	});

	it('lets a navigation through when nothing changed', () => {
		renderEditor();
		const guard = beforeNavigateMock.mock.calls[0][0] as (navigation: unknown) => void;
		const cancel = vi.fn();

		guard({
			cancel,
			willUnload: false,
			to: { url: new URL('http://localhost/org/org-alpha/personnel') },
			type: 'link'
		});

		expect(cancel).not.toHaveBeenCalled();
	});
});

describe('PersonnelDataSheetPageView', () => {
	it('keeps an open edit when the page receives a new data object holding the same loads', async () => {
		const loads = {
			dataSheet: Promise.resolve(info),
			workspace: Promise.resolve({ data: catalogs } as unknown as PersonnelWorkspaceResult)
		};
		const props = {
			orgId: 'org-1',
			orgUrlSegment: 'org-alpha',
			person,
			today: '2026-10-18',
			editing: true,
			disabledFeatures: []
		};
		const view = render(DataSheetPageHarness, { props: { ...props, ...loads } });
		const email = (await screen.findByLabelText('Personal email')) as HTMLInputElement;
		await fireEvent.input(email, { target: { value: 'rivera@example.com' } });

		await view.rerender({ ...props, ...loads });
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect((screen.getByLabelText('Personal email') as HTMLInputElement).value).toBe('rivera@example.com');
	});

	it.each([
		{ disabledFeatures: [], warnsAboutWindow: true },
		{ disabledFeatures: ['lossesAndAwards' as const], warnsAboutWindow: false }
	])(
		'shows the saved ETS and warns about the loss window: $warnsAboutWindow, with $disabledFeatures off',
		async ({ disabledFeatures, warnsAboutWindow }) => {
			render(DataSheetPageHarness, {
				props: {
					orgId: 'org-1',
					orgUrlSegment: 'org-alpha',
					person,
					today: '2026-10-18',
					editing: true,
					disabledFeatures,
					dataSheet: Promise.resolve(info),
					workspace: Promise.resolve({ data: catalogs } as unknown as PersonnelWorkspaceResult)
				}
			});
			const ets = (await screen.findByLabelText('ETS')) as HTMLInputElement;

			await fireEvent.input(ets, { target: { value: '2028-01-01' } });

			const hint = await screen.findByText(/14 Mar 2027/);
			expect(/loss window/.test(hint.textContent ?? '')).toBe(warnsAboutWindow);
		}
	);
});
