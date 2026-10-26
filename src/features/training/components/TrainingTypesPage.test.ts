// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TrainingTypesPage from './TrainingTypesPage.svelte';
import { personnelRosterHydration } from '$features/personnel';
import { trainingRankCatalogStore } from '$features/training/stores/rankCatalog.svelte';
import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';
import type { Personnel } from '$features/personnel/contracts';
import type { PersonnelTraining, TrainingType } from '$features/training/training.types';
import { toastStore } from '$lib/stores/toast.svelte';

const { invalidateMock } = vi.hoisted(() => ({ invalidateMock: vi.fn() }));
vi.mock('$app/navigation', async (importOriginal) => ({
	...(await importOriginal<typeof import('$app/navigation')>()),
	invalidate: invalidateMock
}));

function accessFor(allowed: boolean, orgId = 'org-1') {
	return {
		orgId,
		orgUrlSegment: 'test-unit',
		affordanceForFeatureAction: () => ({
			allowed,
			visible: true,
			disabled: !allowed,
			reason: allowed ? 'allowed:capability' : 'denied:capability',
			explanation: '',
			decision: {}
		})
	} as unknown as import('../contracts').TrainingPageAccess;
}

const personnel = [
	{ id: 'p-1', rank: 'SGT', lastName: 'Smith', firstName: 'Jane', mos: '68W', clinicRole: 'Medic' },
	{ id: 'p-2', rank: 'SPC', lastName: 'Ortiz', firstName: 'Ana', mos: '88M', clinicRole: 'Driver' },
	{ id: 'p-3', rank: 'PFC', lastName: 'Brooks', firstName: 'Lee', mos: '88M', clinicRole: 'Driver' }
] as Personnel[];

const cpr: TrainingType = {
	id: 'type-1',
	name: 'CPR',
	description: 'Annual CPR',
	expirationMonths: 12,
	warningDaysYellow: 60,
	warningDaysOrange: 30,
	appliesToRoles: [],
	appliesToMos: [],
	appliesToRanks: [],
	excludedRoles: [],
	excludedMos: ['68W'],
	excludedRanks: [],
	color: '#22c55e',
	sortOrder: 0,
	expirationDateOnly: false,
	canBeExempted: true,
	exemptPersonnelIds: ['p-1'],
	isOptional: false
};

const license: TrainingType = {
	...cpr,
	id: 'type-2',
	name: 'Mil license',
	description: null,
	expirationMonths: 18,
	expirationDateOnly: true,
	warningDaysYellow: 75,
	warningDaysOrange: 25,
	appliesToRoles: ['Driver'],
	excludedMos: [],
	canBeExempted: false,
	exemptPersonnelIds: [],
	sortOrder: 1
};

const legacyNever: TrainingType = {
	...cpr,
	id: 'type-3',
	name: 'SHARP',
	description: null,
	expirationMonths: null,
	warningDaysYellow: 45,
	warningDaysOrange: 15,
	excludedMos: [],
	canBeExempted: false,
	exemptPersonnelIds: [],
	sortOrder: 2
};

type Request = { method: string; body: Record<string, unknown> };

/** Answers Training type writes the way the server does; `fail` and `hold` shape the PUT and POST answers. */
function stubServer(
	options: { fail?: { status: number; message: string }; failIds?: string[]; hold?: Promise<void> } = {}
) {
	const requests: Request[] = [];
	vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
		const body = JSON.parse(init.body as string) as Record<string, unknown> & { id: string };
		requests.push({ method: init.method as string, body });
		await options.hold;
		if (init.method === 'DELETE') return Response.json({ success: true });
		if (options.fail) return Response.json({ message: options.fail.message }, { status: options.fail.status });
		if (options.failIds?.includes(body.id)) return Response.json({ message: 'Internal server error' }, { status: 500 });
		const saved = trainingTypesStore.items.find((type) => type.id === body.id);
		return Response.json({ ...saved, ...body, id: body.id ?? 'type-new' });
	});
	return requests;
}

const rowOf = (name: string) => screen.getByRole('button', { name }).closest('[role="listitem"]') as HTMLElement;
const field = (name: string) => screen.getByRole('textbox', { name }) as HTMLInputElement;
const numberField = (name: string) => screen.getByRole('spinbutton', { name }) as HTMLInputElement;

function mount(types: TrainingType[] = [cpr, license, legacyNever], access = accessFor(true)) {
	trainingTypesStore.load(types, 'org-1');
	return render(TrainingTypesPage, { props: { org: access, orgName: 'Test Unit', data: { personnel: [] } } });
}

describe('TrainingTypesPage', () => {
	beforeEach(() => {
		personnelRosterHydration.load(personnel, 'org-1');
		trainingRankCatalogStore.load([], 'org-1');
	});

	afterEach(() => {
		invalidateMock.mockReset();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		cleanup();
		personnelRosterHydration.load([], 'org-test-reset');
		trainingRankCatalogStore.load([], 'org-test-reset');
		trainingTypesStore.load([], 'org-test-reset');
		personnelTrainingsStore.load([], 'org-test-reset');
	});

	describe('table', () => {
		it('shows each type with how it renews, when it warns, who needs it and how many that is', () => {
			mount();

			const cprRow = within(rowOf('CPR'));
			expect(cprRow.getByText('Every 12 months')).toBeTruthy();
			expect(cprRow.getByText('60d · 30d')).toBeTruthy();
			expect(cprRow.getByText('Everyone except MOS 68W')).toBeTruthy();
			expect(cprRow.getByText('2 of 3')).toBeTruthy();
			expect(cprRow.getByText('Allowed')).toBeTruthy();

			const licenseRow = within(rowOf('Mil license'));
			expect(licenseRow.getByText('Date on the card')).toBeTruthy();
			expect(licenseRow.getByText('75d · 25d')).toBeTruthy();
			expect(licenseRow.getByText('Role: Driver')).toBeTruthy();
			expect(licenseRow.getByText('2 of 3')).toBeTruthy();

			const neverRow = within(rowOf('SHARP'));
			expect(neverRow.getByText('Never expires')).toBeTruthy();
			expect(neverRow.getByText('3 of 3')).toBeTruthy();
		});

		it('gives a viewer the rules but nothing that changes a type', () => {
			mount([cpr], accessFor(false));

			expect(screen.getByText('Every 12 months')).toBeTruthy();
			expect(screen.queryByRole('button', { name: 'New type' })).toBeNull();
			expect(screen.queryByRole('button', { name: 'CPR' })).toBeNull();
			expect(screen.queryByRole('button', { name: /^Reorder/ })).toBeNull();
		});

		it('holds the place of the table with a loading status while the types load', () => {
			trainingTypesStore.load([], 'org-1');
			render(TrainingTypesPage, {
				props: { org: accessFor(true), orgName: 'Test Unit', data: { personnel: [] }, loading: true }
			});

			expect(screen.getByRole('status', { name: 'Loading training types' })).toBeTruthy();
			expect(screen.queryByText('No training types yet.')).toBeNull();
			expect((screen.getByRole('button', { name: 'New type' }) as HTMLButtonElement).disabled).toBe(true);
		});
	});

	describe('creating a type', () => {
		it.each([
			['months', 'Every few months', { expirationMonths: 12, expirationDateOnly: false, warningDaysYellow: 60 }],
			['a card date', 'Date on the card', { expirationMonths: null, expirationDateOnly: true, warningDaysYellow: 60 }],
			['never', 'Never expires', { expirationMonths: null, expirationDateOnly: false, warningDaysYellow: 60 }]
		])('saves a %s type to the end of the order', async (_label, renewal, saved) => {
			const requests = stubServer();
			mount();

			await fireEvent.click(screen.getByRole('button', { name: 'New type' }));
			await fireEvent.input(field('Name'), { target: { value: '  Range safety ' } });
			await fireEvent.click(screen.getByRole('radio', { name: renewal }));
			await fireEvent.click(screen.getByRole('button', { name: 'Create type' }));

			await waitFor(() => expect(requests).toHaveLength(1));
			expect(requests[0].method).toBe('POST');
			expect(requests[0].body).toMatchObject({ name: 'Range safety', sortOrder: 3, isOptional: false, ...saved });
			await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
			await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Range safety' })));
		});

		it('puts a new type after the last saved position, not after the type count', async () => {
			const requests = stubServer();
			mount([
				{ ...cpr, sortOrder: 10 },
				{ ...license, sortOrder: 20 },
				{ ...legacyNever, sortOrder: 30 }
			]);

			await fireEvent.click(screen.getByRole('button', { name: 'New type' }));
			await fireEvent.input(field('Name'), { target: { value: 'Range safety' } });
			await fireEvent.click(screen.getByRole('button', { name: 'Create type' }));

			await waitFor(() => expect(requests).toHaveLength(1));
			expect(requests[0].body).toMatchObject({ name: 'Range safety', sortOrder: 31 });
		});

		it('says what is missing on the field after a save attempt and moves focus to it', async () => {
			const requests = stubServer();
			mount();

			await fireEvent.click(screen.getByRole('button', { name: 'New type' }));
			expect(screen.queryByRole('alert')).toBeNull();
			await fireEvent.click(screen.getByRole('button', { name: 'Create type' }));

			expect(await screen.findByRole('alert')).toBeTruthy();
			expect(document.activeElement).toBe(field('Name'));
			expect(requests).toEqual([]);
		});

		it('shows an error when a field loses focus, without waiting for a save', async () => {
			mount();

			await fireEvent.click(screen.getByRole('button', { name: 'New type' }));
			await fireEvent.blur(field('Name'));

			expect(await screen.findByRole('alert')).toBeTruthy();
		});

		it('blocks a final warning that is not shorter than the first and focuses it', async () => {
			const requests = stubServer();
			mount();

			await fireEvent.click(screen.getByRole('button', { name: 'New type' }));
			await fireEvent.input(field('Name'), { target: { value: 'Range safety' } });
			await fireEvent.input(numberField('Final warning'), { target: { value: '60' } });
			await fireEvent.click(screen.getByRole('button', { name: 'Create type' }));

			await waitFor(() => expect(document.activeElement).toBe(numberField('Final warning')));
			expect(numberField('Final warning').getAttribute('aria-invalid')).toBe('true');
			expect(requests).toEqual([]);
		});

		it('blocks months outside 1 to 120 and focuses the months field', async () => {
			const requests = stubServer();
			mount();

			await fireEvent.click(screen.getByRole('button', { name: 'New type' }));
			await fireEvent.input(field('Name'), { target: { value: 'Range safety' } });
			await fireEvent.input(numberField('Good for'), { target: { value: '121' } });
			await fireEvent.click(screen.getByRole('button', { name: 'Create type' }));

			await waitFor(() => expect(document.activeElement).toBe(numberField('Good for')));
			expect(requests).toEqual([]);
		});

		it('hides the warnings for a type that never expires and the months for a card date', async () => {
			mount();
			await fireEvent.click(screen.getByRole('button', { name: 'New type' }));

			await fireEvent.click(screen.getByRole('radio', { name: 'Date on the card' }));
			expect(screen.queryByRole('spinbutton', { name: 'Good for' })).toBeNull();
			expect(numberField('First warning').value).toBe('60');

			await fireEvent.click(screen.getByRole('radio', { name: 'Never expires' }));
			expect(screen.queryByRole('spinbutton', { name: 'First warning' })).toBeNull();
		});

		it('counts who an Only some rule catches as the rule changes and says who they are', async () => {
			mount();
			await fireEvent.click(screen.getByRole('button', { name: 'New type' }));
			expect(screen.getByText('Applies to 3 of 3 personnel')).toBeTruthy();

			await fireEvent.click(screen.getByRole('radio', { name: 'Only some' }));
			const only = screen.getByRole('combobox', { name: 'Only these roles, MOS and ranks' });
			await fireEvent.focus(only);
			await fireEvent.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Driver' }));

			await waitFor(() => expect(screen.getByText('Applies to 2 of 3 personnel')).toBeTruthy());
			expect(screen.getByText(/Matches 2: SPC Ortiz, PFC Brooks/)).toBeTruthy();
		});

		it('keeps the sheet open with the server reason when the save is rejected', async () => {
			stubServer({ fail: { status: 409, message: 'A Training type with that name already exists.' } });
			mount();

			await fireEvent.click(screen.getByRole('button', { name: 'New type' }));
			await fireEvent.input(field('Name'), { target: { value: 'CPR' } });
			await fireEvent.click(screen.getByRole('button', { name: 'Create type' }));

			expect(await screen.findByText('A Training type with that name already exists.')).toBeTruthy();
			expect(field('Name').value).toBe('CPR');
		});

		it('keeps one message for a server failure the user cannot correct', async () => {
			stubServer({ fail: { status: 500, message: 'Internal server error' } });
			mount();

			await fireEvent.click(screen.getByRole('button', { name: 'New type' }));
			await fireEvent.input(field('Name'), { target: { value: 'Range safety' } });
			await fireEvent.click(screen.getByRole('button', { name: 'Create type' }));

			expect(await screen.findByText('Failed to save training type.')).toBeTruthy();
			expect(screen.queryByText('Internal server error')).toBeNull();
		});
	});

	describe('editing a type', () => {
		it('saves an untouched type with the fields it already had', async () => {
			const requests = stubServer();
			mount();

			await fireEvent.click(screen.getByRole('button', { name: 'SHARP' }));
			await fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

			await waitFor(() => expect(requests).toHaveLength(1));
			expect(requests[0].method).toBe('PUT');
			expect(requests[0].body).toEqual({
				id: 'type-3',
				name: 'SHARP',
				description: null,
				color: '#22c55e',
				expirationMonths: null,
				expirationDateOnly: false,
				warningDaysYellow: 45,
				warningDaysOrange: 15,
				appliesToRoles: [],
				appliesToMos: [],
				appliesToRanks: [],
				excludedRoles: [],
				excludedMos: [],
				excludedRanks: [],
				canBeExempted: false,
				isOptional: false
			});
		});

		it('keeps the stored interval of a card-date type and its exemptions when only the name changes', async () => {
			const requests = stubServer();
			mount();

			await fireEvent.click(screen.getByRole('button', { name: 'Mil license' }));
			await fireEvent.input(field('Name'), { target: { value: 'Military license' } });
			await fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

			await waitFor(() => expect(requests).toHaveLength(1));
			expect(requests[0].body).toMatchObject({
				name: 'Military license',
				expirationMonths: 18,
				expirationDateOnly: true,
				warningDaysYellow: 75,
				warningDaysOrange: 25,
				appliesToRoles: ['Driver']
			});
			expect(requests[0].body).not.toHaveProperty('exemptPersonnelIds');
			expect(requests[0].body).not.toHaveProperty('sortOrder');
		});

		it('shows who an exception removes and how many people the type applies to', async () => {
			mount();

			await fireEvent.click(screen.getByRole('button', { name: 'CPR' }));

			expect(screen.getByText('Applies to 2 of 3 personnel')).toBeTruthy();
			expect(screen.getByText(/Excludes 1: SGT Smith/)).toBeTruthy();
			expect(screen.getByText(/1 is exempt now/)).toBeTruthy();
		});

		it('saves an Only some rule with an exception as the stored lists', async () => {
			const requests = stubServer();
			mount();

			await fireEvent.click(screen.getByRole('button', { name: 'Mil license' }));
			await fireEvent.click(screen.getByRole('button', { name: /Add an exception/ }));
			const except = screen.getByRole('combobox', { name: 'Except these roles, MOS and ranks' });
			await fireEvent.focus(except);
			await fireEvent.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'PFC' }));
			await fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

			await waitFor(() => expect(requests).toHaveLength(1));
			expect(requests[0].body).toMatchObject({ appliesToRoles: ['Driver'], excludedRanks: ['PFC'], isOptional: false });
		});

		it('keeps the sheet open on Escape while there are unsaved edits and closes it on Cancel', async () => {
			mount();

			await fireEvent.click(screen.getByRole('button', { name: 'CPR' }));
			await fireEvent.input(field('Name'), { target: { value: 'CPR renewal' } });
			await fireEvent.keyDown(field('Name'), { key: 'Escape' });
			expect(screen.getByRole('dialog')).toBeTruthy();

			await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
			await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
			expect(trainingTypesStore.items.find((type) => type.id === 'type-1')?.name).toBe('CPR');
		});

		it('returns focus to the row that opened the sheet', async () => {
			mount();
			const row = screen.getByRole('button', { name: 'Mil license' });
			row.focus();

			await fireEvent.click(row);
			await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

			await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Mil license' })));
		});

		it('returns focus to New type when a new type is abandoned', async () => {
			mount();
			const open = screen.getByRole('button', { name: 'New type' });
			open.focus();

			await fireEvent.click(open);
			await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

			await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'New type' })));
		});

		it('writes nothing to the sheet after the Organization changed under a slow save', async () => {
			let release!: () => void;
			stubServer({ fail: { status: 409, message: 'Taken.' }, hold: new Promise((resolve) => (release = resolve)) });
			const access = accessFor(true);
			mount([cpr], access);

			await fireEvent.click(screen.getByRole('button', { name: 'CPR' }));
			await fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
			(access as { orgId: string }).orgId = 'org-2';
			release();

			await waitFor(() =>
				expect(screen.getByRole('button', { name: 'Save changes' }).hasAttribute('disabled')).toBe(false)
			);
			expect(screen.queryByText('Taken.')).toBeNull();
		});
	});

	describe('deleting a type', () => {
		it('asks first, then removes the type and its records and closes the sheet', async () => {
			personnelTrainingsStore.load(
				[
					{ id: 'c-1', personnelId: 'p-1', trainingTypeId: 'type-1' } as PersonnelTraining,
					{ id: 'c-2', personnelId: 'p-1', trainingTypeId: 'type-2' } as PersonnelTraining
				],
				'org-1'
			);
			const requests = stubServer();
			mount();

			await fireEvent.click(screen.getByRole('button', { name: 'CPR' }));
			await fireEvent.click(screen.getByRole('button', { name: 'Delete type' }));
			expect(requests).toEqual([]);
			await fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));

			await waitFor(() => expect(screen.queryByRole('button', { name: 'CPR' })).toBeNull());
			expect(requests.map(({ method, body }) => [method, body.id])).toEqual([['DELETE', 'type-1']]);
			await waitFor(() => expect(personnelTrainingsStore.items.map((record) => record.id)).toEqual(['c-2']));
			expect(screen.queryByRole('dialog')).toBeNull();
		});

		it('keeps a failed delete open with its reason', async () => {
			vi.spyOn(trainingTypesStore, 'remove').mockResolvedValueOnce('error');
			mount();

			await fireEvent.click(screen.getByRole('button', { name: 'CPR' }));
			await fireEvent.click(screen.getByRole('button', { name: 'Delete type' }));
			await fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));

			expect(
				await within(screen.getByRole('alertdialog')).findByText('Failed to delete training type. Try again.')
			).toBeTruthy();
			expect(screen.getByRole('button', { name: 'CPR' })).toBeTruthy();
		});
	});

	describe('reordering', () => {
		const savedOrders = (requests: Request[]) =>
			Object.fromEntries(requests.map(({ body }) => [body.id as string, body.sortOrder]));
		const order = () =>
			screen
				.getAllByRole('listitem')
				.map((item) => ['CPR', 'Mil license', 'SHARP'].find((name) => item.textContent?.includes(name)));

		it('moves a type with its handle and saves only the positions that changed', async () => {
			const requests = stubServer();
			mount();

			await fireEvent.keyDown(screen.getByRole('button', { name: 'Reorder SHARP' }), { key: 'ArrowUp' });

			await waitFor(() => expect(requests).toHaveLength(2));
			expect(savedOrders(requests)).toEqual({ 'type-3': 1, 'type-2': 2 });
			expect(order()).toEqual(['CPR', 'SHARP', 'Mil license']);
		});

		it('gives every type its own position when a move starts from shared positions', async () => {
			const requests = stubServer();
			mount([
				{ ...cpr, sortOrder: 0 },
				{ ...license, sortOrder: 0 },
				{ ...legacyNever, sortOrder: 0 }
			]);

			await fireEvent.keyDown(screen.getByRole('button', { name: 'Reorder CPR' }), { key: 'ArrowDown' });

			await waitFor(() => expect(requests).toHaveLength(2));
			expect(savedOrders(requests)).toEqual({ 'type-1': 1, 'type-3': 2 });
			expect(order()).toEqual(['Mil license', 'CPR', 'SHARP']);
		});

		it('says a half-saved reorder failed and re-reads the saved order', async () => {
			const requests = stubServer({ failIds: ['type-2'] });
			invalidateMock.mockResolvedValue(undefined);
			const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
			mount();

			await fireEvent.keyDown(screen.getByRole('button', { name: 'Reorder SHARP' }), { key: 'ArrowUp' });

			await waitFor(() => expect(invalidateMock).toHaveBeenCalledWith('app:training-data'));
			expect(errorToast).toHaveBeenCalledOnce();
			expect(requests).toHaveLength(2);
			expect(trainingTypesStore.items.map((type) => [type.id, type.sortOrder])).toEqual([
				['type-1', 0],
				['type-2', 1],
				['type-3', 1]
			]);
		});
	});
});
