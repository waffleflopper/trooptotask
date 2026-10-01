// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ratingSchemeStore } from '../stores/ratingScheme.svelte';
import type { RatingSchemeEntry } from '../rating-scheme.types';
import type { RatingSchemePageContext } from '../contexts/RatingSchemePageContext.svelte';
import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
import { toastStore } from '$lib/stores/toast.svelte';
import RatingSchemeModals from './RatingSchemeModals.svelte';

const entry: RatingSchemeEntry = {
	id: 'evaluation-a',
	ratedPersonId: 'person-a',
	evalType: 'NCOER',
	raterPersonId: null,
	raterName: 'External Rater',
	seniorRaterPersonId: null,
	seniorRaterName: 'External Senior Rater',
	intermediateRaterPersonId: null,
	intermediateRaterName: null,
	reviewerPersonId: null,
	reviewerName: null,
	ratingPeriodStart: '2026-01-01',
	ratingPeriodEnd: '2026-12-31',
	status: 'active',
	notes: 'Saved notes',
	reportType: 'AN',
	workflowStatus: null
};
const otherEntry = { ...entry, id: 'evaluation-b', ratedPersonId: 'person-b', notes: 'Other evaluation' };

function openEditor() {
	ratingSchemeStore.load([entry, otherEntry], 'org-a');
	const modals = new ModalRegistry();
	modals.open('rating-modal', { entry });
	render(RatingSchemeModals, {
		ctx: { orgId: 'org-a' } as RatingSchemePageContext,
		modals,
		personnelLookup: [{ id: 'person-a', rank: 'SGT', firstName: 'Synthetic', lastName: 'Able' }]
	});
	return modals;
}

async function confirmDeletion() {
	await fireEvent.click(screen.getByRole('button', { name: 'Delete', exact: true }));
	await fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: /Delete Entry/ }));
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	ratingSchemeStore.load([], 'org-reset');
});

describe('Evals deletion recovery', () => {
	it.each(['delete', 'approval request'] as const)(
		'preserves an unsaved draft after failed %s and supports retry',
		async (operation) => {
			let failed = true;
			const requests: { resourceId: string; resourceType: string; resourceUrl: string }[] = [];
			const errorToast = vi.spyOn(toastStore, 'error').mockReturnValue('error');
			vi.spyOn(toastStore, 'info').mockReturnValue('info');
			vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
				if (init.method === 'DELETE') {
					if (operation === 'approval request') return Response.json({ requiresApproval: true }, { status: 202 });
					return Response.json({}, { status: failed ? 503 : 200 });
				}
				if (failed) return Response.json({}, { status: 503 });
				requests.push(JSON.parse(init.body as string));
				return Response.json({ id: 'request-a' }, { status: 201 });
			});
			const modals = openEditor();
			await fireEvent.input(screen.getByLabelText('Notes'), { target: { value: 'Unsaved draft' } });
			await confirmDeletion();
			await waitFor(() => expect(errorToast).toHaveBeenCalledTimes(1));
			expect(modals.isOpen('rating-modal')).toBe(true);
			expect(screen.getByRole('alertdialog')).toBeTruthy();
			expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('Unsaved draft');
			expect(ratingSchemeStore.items).toEqual([entry, otherEntry]);
			expect(requests).toEqual([]);
			await waitFor(() =>
				expect(
					(within(screen.getByRole('alertdialog')).getByRole('button', { name: /Delete Entry/ }) as HTMLButtonElement)
						.disabled
				).toBe(false)
			);
			failed = false;
			await fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: /Delete Entry/ }));
			await waitFor(() => expect(modals.isOpen('rating-modal')).toBe(false));
			expect(ratingSchemeStore.items).toEqual(operation === 'delete' ? [otherEntry] : [entry, otherEntry]);
			if (operation === 'approval request')
				expect(requests).toEqual([
					expect.objectContaining({
						resourceId: entry.id,
						resourceType: 'rating_scheme_entry',
						resourceUrl: '/org/org-a/evals'
					})
				]);
			expect(errorToast).toHaveBeenCalledTimes(1);
		}
	);

	it('accepts an already-pending request without removing the evaluation', async () => {
		const infoToast = vi.spyOn(toastStore, 'info').mockReturnValue('info');
		const errorToast = vi.spyOn(toastStore, 'error').mockReturnValue('error');
		vi.stubGlobal('fetch', async (_url: string, init: RequestInit) =>
			init.method === 'DELETE'
				? Response.json({ requiresApproval: true }, { status: 202 })
				: Response.json({}, { status: 409 })
		);
		const modals = openEditor();
		await confirmDeletion();
		await waitFor(() => expect(modals.isOpen('rating-modal')).toBe(false));
		expect(ratingSchemeStore.items).toEqual([entry, otherEntry]);
		expect(infoToast).toHaveBeenCalledTimes(1);
		expect(errorToast).not.toHaveBeenCalled();
	});

	it.each(['DELETE', 'POST'] as const)(
		'blocks duplicate submission and closing while %s is pending',
		async (pendingMethod) => {
			let release!: (response: Response) => void;
			const pending = new Promise<Response>((resolve) => {
				release = resolve;
			});
			const effects: string[] = [];
			vi.spyOn(toastStore, 'info').mockReturnValue('info');
			vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
				effects.push(init.method!);
				return init.method === pendingMethod ? pending : Response.json({ requiresApproval: true }, { status: 202 });
			});
			const modals = openEditor();
			await confirmDeletion();
			const confirmation = within(screen.getByRole('alertdialog'));
			await fireEvent.click(confirmation.getByRole('button', { name: /Delete Entry/ }));
			await fireEvent.click(confirmation.getByRole('button', { name: 'Cancel' }));
			await fireEvent.keyDown(document, { key: 'Escape' });
			expect(screen.getByRole('alertdialog')).toBeTruthy();
			const editor = within(screen.getByRole('dialog', { name: 'Edit Rating Entry', hidden: true }));
			for (const name of ['Save', 'Delete', 'Cancel']) {
				expect((editor.getByRole('button', { name, exact: true, hidden: true }) as HTMLButtonElement).disabled).toBe(
					true
				);
			}
			expect(modals.isOpen('rating-modal')).toBe(true);
			expect(effects).toEqual(pendingMethod === 'DELETE' ? ['DELETE'] : ['DELETE', 'POST']);
			release(Response.json({}, { status: 200 }));
			await waitFor(() => expect(modals.isOpen('rating-modal')).toBe(false));
			expect(ratingSchemeStore.items).toEqual(pendingMethod === 'DELETE' ? [otherEntry] : [entry, otherEntry]);
		}
	);

	it('blocks deletion and closing during a pending save', async () => {
		let release!: (response: Response) => void;
		const pending = new Promise<Response>((resolve) => {
			release = resolve;
		});
		const effects: string[] = [];
		vi.spyOn(toastStore, 'success').mockReturnValue('success');
		vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
			effects.push(init.method!);
			return pending;
		});
		const modals = openEditor();
		await fireEvent.input(screen.getByLabelText('Notes'), { target: { value: 'Updated notes' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		const deleteButton = screen.getByRole('button', { name: 'Delete', exact: true }) as HTMLButtonElement;
		expect(deleteButton.disabled).toBe(true);
		await fireEvent.click(deleteButton);
		await fireEvent.keyDown(document, { key: 'Escape' });
		expect(screen.queryByRole('alertdialog')).toBeNull();
		expect(modals.isOpen('rating-modal')).toBe(true);
		expect(effects).toEqual(['PUT']);
		release(Response.json({ ...entry, notes: 'Updated notes' }));
		await waitFor(() => expect(modals.isOpen('rating-modal')).toBe(false));
		expect(ratingSchemeStore.getById(entry.id)?.notes).toBe('Updated notes');
	});
});
