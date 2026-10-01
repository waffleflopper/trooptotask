// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { groupCatalogHydration, personnelStore, PersonnelPageContext, loadPersonnelModals } from '$features/personnel';
import type { Personnel } from '$features/personnel/contracts';
import { createTestOrgContext, NONE_TEST_CAPABILITY_MAP } from '$lib/test-support/orgContextBuilder';
import { toastStore } from '$lib/stores/toast.svelte';
import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
import { requestPersonnelArchiveApproval as requestArchiveApproval } from '$lib/personnelArchiveRequestDelivery';

vi.mock('$app/navigation', () => ({ goto: vi.fn(), invalidateAll: vi.fn() }));
const { default: PersonnelModals } = await loadPersonnelModals();

afterEach(async () => {
	cleanup();
	await new Promise((resolve) => setTimeout(resolve, 30));
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('Personnel Edit archive recovery', () => {
	const originalPerson: Personnel = {
		id: 'person-archive',
		rank: 'SPC',
		firstName: 'Synthetic',
		lastName: 'Recovery',
		mos: '68W',
		clinicRole: 'Medic',
		groupId: 'alpha',
		groupName: 'Alpha'
	};

	function openEditor() {
		groupCatalogHydration.load([{ id: 'alpha', name: 'Alpha', sortOrder: 0 }], 'org-a');
		personnelStore.load([structuredClone(originalPerson)], 'org-a');
		const modals = new ModalRegistry();
		const ctx = new PersonnelPageContext(
			{ orgId: 'org-a', orgName: 'A', pinnedGroups: [], rankCatalog: [] },
			modals,
			createTestOrgContext({
				orgId: 'org-a',
				userRole: 'member',
				capabilityMap: { ...NONE_TEST_CAPABILITY_MAP, personnel: 'operate' }
			})
		);
		modals.open('personnel-modal', { person: structuredClone(originalPerson) });
		render(PersonnelModals, { props: { ctx, modals, requestArchiveApproval } });
		return modals;
	}

	async function archive() {
		await fireEvent.click(screen.getByTestId('personnel-archive'));
		await fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Archive' }));
	}

	it.each(['direct', 'approval'] as const)(
		'retains the draft after failed %s archive and supports retry',
		async (mode) => {
			let failed = true;
			const writes: { url: string; method: string; body: unknown }[] = [];
			vi.stubGlobal(
				'fetch',
				vi.fn(async (url, init) => {
					writes.push({ url: String(url), method: init.method, body: JSON.parse(init.body) });
					if (String(url).endsWith('/deletion-requests')) {
						return failed ? Response.json({}, { status: 503 }) : Response.json({}, { status: 201 });
					}
					if (mode === 'approval') return Response.json({ requiresApproval: true }, { status: 202 });
					return failed ? Response.json({}, { status: 503 }) : Response.json({});
				})
			);
			vi.spyOn(toastStore, 'error').mockReturnValue('error');
			const success = vi.spyOn(toastStore, 'success').mockReturnValue('success');
			const modals = openEditor();
			await fireEvent.input(screen.getByLabelText('Duty Role'), { target: { value: 'Unsaved recovery duty' } });
			await archive();
			await waitFor(() => expect(toastStore.error).toHaveBeenCalled());
			expect(modals.isOpen('personnel-modal')).toBe(true);
			expect((screen.getByLabelText('Duty Role') as HTMLInputElement).value).toBe('Unsaved recovery duty');
			expect(personnelStore.items).toEqual([originalPerson]);
			expect(success).not.toHaveBeenCalled();
			// A failed confirmation may remain open; dismiss it before retrying the same draft.
			const confirmation = screen.queryByRole('alertdialog');
			if (confirmation) await fireEvent.click(within(confirmation).getByRole('button', { name: 'Cancel' }));
			failed = false;
			await archive();
			await waitFor(() => expect(modals.isOpen('personnel-modal')).toBe(false));
			expect(personnelStore.items).toEqual(mode === 'approval' ? [originalPerson] : []);
			expect(writes.filter((w) => w.url.endsWith('/personnel'))).toEqual([
				{ url: '/org/org-a/api/personnel', method: 'DELETE', body: { id: originalPerson.id } },
				{ url: '/org/org-a/api/personnel', method: 'DELETE', body: { id: originalPerson.id } }
			]);
			expect(writes.every((w) => w.method === 'DELETE' || w.method === 'POST')).toBe(true);
		}
	);

	it('acknowledges an already-pending approval without removing the active Person', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url) =>
				String(url).endsWith('/deletion-requests')
					? Response.json({}, { status: 409 })
					: Response.json({ requiresApproval: true }, { status: 202 })
			)
		);
		const error = vi.spyOn(toastStore, 'error').mockReturnValue('error');
		const modals = openEditor();
		await fireEvent.input(screen.getByLabelText('Duty Role'), { target: { value: 'Unrelated unsaved duty' } });
		await archive();
		await waitFor(() => expect(modals.isOpen('personnel-modal')).toBe(false));
		expect(personnelStore.items).toEqual([originalPerson]);
		expect(error).not.toHaveBeenCalled();
	});

	it('blocks saving or closing the editor while archive is pending, then retains its draft on failure', async () => {
		let respond!: (response: Response) => void;
		const response = new Promise<Response>((resolve) => {
			respond = resolve;
		});
		const fetch = vi.fn(() => response);
		vi.stubGlobal('fetch', fetch);
		vi.spyOn(toastStore, 'error').mockReturnValue('error');
		const modals = openEditor();
		await fireEvent.input(screen.getByLabelText('Duty Role'), { target: { value: 'Held archive duty' } });
		await archive();
		await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
		const editor = screen.getByRole('dialog', { name: 'Edit Personnel' });
		expect((within(editor).getByRole('button', { name: 'Save Changes' }) as HTMLButtonElement).disabled).toBe(true);
		expect((within(editor).getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true);
		await fireEvent.keyDown(document, { key: 'Escape' });
		expect(modals.isOpen('personnel-modal')).toBe(true);
		respond(Response.json({}, { status: 503 }));
		await waitFor(() => expect(toastStore.error).toHaveBeenCalled());
		expect(modals.isOpen('personnel-modal')).toBe(true);
		expect((screen.getByLabelText('Duty Role') as HTMLInputElement).value).toBe('Held archive duty');
		expect((screen.getByRole('button', { name: 'Save Changes' }) as HTMLButtonElement).disabled).toBe(false);
		expect(personnelStore.items).toEqual([originalPerson]);
	});
});
