// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	RatingSchemePageContext,
	ratingSchemeWorkspaceHydrator,
	loadRatingSchemeModals
} from '$features/rating-scheme';
import type { RatingSchemeEntry } from '$features/rating-scheme/contracts';
import type { PersonnelLookup } from '$features/personnel/contracts';
import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
import { toastStore } from '$lib/stores/toast.svelte';
import { submitDeletionRequest } from '$features/deletion-requests';
import * as deletionRequests from '$features/deletion-requests';
import {
	evaluationStore,
	ratingSchemeEntries,
	ratingSchemeEntryFixture,
	ratingSchemeStore,
	splitRatingSchemeEntries
} from '$features/rating-scheme/ratingSchemeStore.test-support.svelte';
import { settles } from '$lib/test-support/settles';
const { default: RatingSchemeModals } = await loadRatingSchemeModals();
let snapshot = 0;
let ctx: RatingSchemePageContext;

const entry: RatingSchemeEntry = ratingSchemeEntryFixture({
	id: 'evaluation-a',
	ratingSchemeId: 'scheme-a',
	ratedPersonId: 'person-a',
	raterName: 'External Rater',
	seniorRaterName: 'External Senior Rater',
	ratingPeriodStart: '2026-01-01',
	ratingPeriodEnd: '2026-12-31',
	notes: 'Saved notes',
	workflowStatus: null
});
const otherEntry = {
	...entry,
	id: 'evaluation-b',
	ratingSchemeId: 'scheme-b',
	ratedPersonId: 'person-b',
	notes: 'Other evaluation'
};
const foreignEntry = {
	...otherEntry,
	id: 'foreign-evaluation',
	ratingSchemeId: 'foreign-scheme',
	notes: 'B saved notes'
};

/** The Evals hydration that lists these page rows. */
function hydration(orgId: string, items: readonly RatingSchemeEntry[], snapshotKey: string) {
	const { ratingSchemes, evaluations } = splitRatingSchemeEntries(items);
	return {
		orgId,
		ratingSchemes: { mode: 'replace' as const, snapshotKey, items: ratingSchemes },
		evaluations: { mode: 'replace' as const, snapshotKey, items: evaluations }
	};
}

/** The saved Evaluation the server answers an edit of this row with. */
const savedEvaluation = (row: RatingSchemeEntry) => splitRatingSchemeEntries([row]).evaluations[0];

const foreignEditorOptions = {
	orgId: 'org-b',
	items: [foreignEntry],
	editingEntry: foreignEntry,
	personnelLookup: [{ id: 'person-b', rank: 'SPC', firstName: 'Synthetic', lastName: 'Foreign' }]
};

async function openEditor({
	orgId = 'org-a',
	items = [entry, otherEntry],
	editingEntry = entry,
	personnelLookup = [{ id: 'person-a', rank: 'SGT', firstName: 'Synthetic', lastName: 'Able' }]
}: {
	orgId?: string;
	items?: RatingSchemeEntry[];
	editingEntry?: RatingSchemeEntry | null;
	personnelLookup?: PersonnelLookup[];
} = {}) {
	await ratingSchemeWorkspaceHydrator.hydrate(hydration(orgId, items, `recovery-${++snapshot}`));
	const modals = new ModalRegistry();
	modals.open('rating-modal', { entry: editingEntry });
	ctx = new RatingSchemePageContext(
		{ orgId, orgName: 'Synthetic workspace', personnelLookup: [] },
		modals,
		{} as ConstructorParameters<typeof RatingSchemePageContext>[2]
	);
	const editor = render(RatingSchemeModals, {
		orgId,
		modals,
		personnelLookup,
		onRequestDeletion: (id, description, isCurrent) =>
			submitDeletionRequest(orgId, 'evaluation', id, description, `/org/${orgId}/evals`, isCurrent)
	});
	return { modals, ...editor };
}

async function confirmDeletion() {
	await fireEvent.click(screen.getByRole('button', { name: 'Delete entry' }));
	await fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: /Delete Entry/ }));
}

async function chooseExternal(role: string, name: string) {
	await fireEvent.click(screen.getByRole('button', { name: role }));
	const search = screen
		.getAllByPlaceholderText('Search unit or type a name...')
		.find((input) => input.closest('[data-state="open"]'));
	await fireEvent.input(search!, { target: { value: name } });
	await fireEvent.click(await screen.findByRole('option', { name: `Use "${name}" as an external rater` }));
}

async function prepareNewEntry() {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
	await fireEvent.click(screen.getByRole('button', { name: 'Rated Soldier' }));
	const search = screen.getByPlaceholderText('Search personnel...');
	await fireEvent.input(search, { target: { value: 'Able' } });
	await fireEvent.keyDown(search, { key: 'Enter' });
	await fireEvent.click(screen.getByRole('button', { name: 'Report' }));
	await fireEvent.keyDown(screen.getByRole('button', { name: 'Report' }), { key: 'ArrowDown' });
	await fireEvent.keyDown(screen.getByRole('button', { name: 'Report' }), { key: 'Enter' });
	await chooseExternal('Rater', 'MAJ Current Rater');
	await chooseExternal('Senior rater', 'COL Current Senior');
	await fireEvent.click(screen.getByRole('button', { name: 'Start' }));
	await fireEvent.click(screen.getByRole('button', { name: 'Thursday, January 1, 2026' }));
}

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	ratingSchemeWorkspaceHydrator.restrict('org-reset');
});

describe('Evals deletion recovery', () => {
	it('retains a failed create draft and supports explicit retry through the current form', async () => {
		const successToast = vi.spyOn(toastStore, 'success').mockReturnValue('success');
		const errorToast = vi.spyOn(toastStore, 'error').mockReturnValue('error');
		const requests: { url: string; body: Record<string, unknown> }[] = [];
		vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
			const body = JSON.parse(init.body as string);
			requests.push({ url, body });
			if (requests.length === 1) return Response.json({ message: 'Create temporarily unavailable' }, { status: 503 });
			if (url.endsWith('/evaluations')) {
				return Response.json({
					created: true,
					evaluation: { ...body, id: 'created-evaluation', ratingSchemeId: 'created-scheme', ratedPersonId: 'person-a' }
				});
			}
			return Response.json({ ...body, id: 'created-scheme', archivedAt: null });
		});
		const { modals } = await openEditor({ editingEntry: null, items: [otherEntry] });
		await prepareNewEntry();
		await fireEvent.input(screen.getByLabelText('Notes'), { target: { value: 'New current draft' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));
		await waitFor(() =>
			expect(within(screen.getByRole('dialog')).getByRole('alert').textContent?.replace(/\s+/g, ' ').trim()).toBe(
				'Rating entry was not saved Failed to add rating entry'
			)
		);
		await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add entry' })));
		expect(modals.isOpen('rating-modal')).toBe(true);
		expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('New current draft');
		await waitFor(() =>
			expect((screen.getByRole('button', { name: 'Add entry' }) as HTMLButtonElement).disabled).toBe(false)
		);
		await fireEvent.click(screen.getByRole('button', { name: 'Add entry' }));
		await waitFor(() => expect(modals.isOpen('rating-modal')).toBe(false));
		expect(successToast).toHaveBeenCalledWith('Rating entry added');
		expect(errorToast).not.toHaveBeenCalled();
		expect(requests.map(({ url }) => url)).toEqual([
			'/org/org-a/api/rating-scheme',
			'/org/org-a/api/rating-scheme',
			'/org/org-a/api/rating-scheme/created-scheme/evaluations'
		]);
		expect(requests[0].body).toEqual(requests[1].body);
		expect(requests[1].body).toEqual(
			expect.objectContaining({ ratedPersonId: 'person-a', raterName: 'MAJ Current Rater' })
		);
		expect(requests[2].body).toEqual(
			expect.objectContaining({
				notes: 'New current draft',
				reportType: 'AN',
				ratingPeriodStart: '2026-01-01',
				ratingPeriodEnd: '2026-12-31'
			})
		);
		expect(ratingSchemeEntries.items.map(({ id }) => id)).toEqual(['evaluation-b', 'created-evaluation']);
	});

	it('retires held update feedback after leaving the originating workspace', async () => {
		let release!: (response: Response) => void;
		const pending = new Promise<Response>((resolve) => {
			release = resolve;
		});
		const errorToast = vi.spyOn(toastStore, 'error').mockReturnValue('error');
		const successToast = vi.spyOn(toastStore, 'success').mockReturnValue('success');
		const update = vi.spyOn(evaluationStore, 'updateOrThrow');
		vi.stubGlobal('fetch', () => pending);
		const origin = await openEditor();
		await fireEvent.input(screen.getByLabelText('Notes'), { target: { value: 'Held A edit' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
		expect((screen.getByRole('button', { name: 'Saving...' }) as HTMLButtonElement).disabled).toBe(true);
		origin.unmount();
		const { modals: foreignModals } = await openEditor(foreignEditorOptions);
		await fireEvent.input(screen.getByLabelText('Notes'), { target: { value: 'B retained draft' } });
		await act(async () => {
			release(Response.json(savedEvaluation({ ...entry, notes: 'Held A edit' })));
			expect(await settles(update.mock.results[0].value)).toBe(false);
		});
		expect(errorToast).not.toHaveBeenCalled();
		expect(successToast).not.toHaveBeenCalled();
		expect(ratingSchemeEntries.items).toEqual([foreignEntry]);
		expect(foreignModals.isOpen('rating-modal')).toBe(true);
		expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('B retained draft');
	});

	it.each([
		['create', 'success'],
		['create', 'HTTP failure'],
		['create', 'transport failure'],
		['create with a new scheme', 'success'],
		['create with a new scheme', 'HTTP failure'],
		['update', 'HTTP failure'],
		['update', 'transport failure']
	] as const)('retires held %s %s without touching the new editor', async (operation, outcome) => {
		const held = Promise.withResolvers<Response>();
		const errorToast = vi.spyOn(toastStore, 'error').mockReturnValue('error');
		const successToast = vi.spyOn(toastStore, 'success').mockReturnValue('success');
		// Adding for a person whose listed scheme has another chain saves that chain first; a person with none gets one.
		const mutation =
			operation === 'update'
				? vi.spyOn(evaluationStore, 'updateOrThrow')
				: operation === 'create'
					? vi.spyOn(ratingSchemeStore, 'updateOrThrow')
					: null;
		const merges = [vi.spyOn(ratingSchemeStore, 'mergeBatchResults'), vi.spyOn(evaluationStore, 'mergeBatchResults')];
		let saveData: Record<string, unknown>;
		vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
			saveData = JSON.parse(init.body as string);
			return held.promise;
		});
		const origin = await openEditor({
			editingEntry: operation === 'update' ? entry : null,
			items: operation === 'create with a new scheme' ? [otherEntry] : [entry, otherEntry]
		});
		if (operation !== 'update') await prepareNewEntry();
		await fireEvent.input(screen.getByLabelText('Notes'), { target: { value: 'Retired A draft' } });
		await fireEvent.click(screen.getByRole('button', { name: operation === 'update' ? 'Save changes' : 'Add entry' }));
		expect((screen.getByRole('button', { name: 'Saving...' }) as HTMLButtonElement).disabled).toBe(true);
		origin.unmount();
		const { modals } = await openEditor(foreignEditorOptions);
		await fireEvent.input(screen.getByLabelText('Notes'), { target: { value: 'Fresh B draft' } });
		await act(async () => {
			if (outcome === 'transport failure') held.reject(new TypeError('Old transport failed'));
			else
				held.resolve(
					Response.json({ id: 'created-evaluation', ...saveData }, { status: outcome === 'success' ? 200 : 503 })
				);
			if (mutation) expect(await settles(mutation.mock.results[0].value)).toBe(false);
			else await settles(held.promise);
		});
		expect(errorToast).not.toHaveBeenCalled();
		expect(successToast).not.toHaveBeenCalled();
		for (const merge of merges) expect(merge).not.toHaveBeenCalled();
		expect(modals.isOpen('rating-modal')).toBe(true);
		expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('Fresh B draft');
		expect(ratingSchemeEntries.items).toEqual([foreignEntry]);
	});

	it.each(['success', 'HTTP failure', 'transport failure'] as const)(
		'retires held direct deletion %s without stale feedback',
		async (outcome) => {
			const held = Promise.withResolvers<Response>();
			const errorToast = vi.spyOn(toastStore, 'error').mockReturnValue('error');
			const infoToast = vi.spyOn(toastStore, 'info').mockReturnValue('info');
			const remove = vi.spyOn(evaluationStore, 'remove');
			const methods: string[] = [];
			vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
				methods.push(init.method!);
				return held.promise;
			});
			const origin = await openEditor();
			await confirmDeletion();
			origin.unmount();
			const { modals } = await openEditor(foreignEditorOptions);
			await fireEvent.input(screen.getByLabelText('Notes'), { target: { value: 'Fresh B draft' } });
			await act(async () => {
				if (outcome === 'transport failure') held.reject(new TypeError('Old deletion failed'));
				else held.resolve(Response.json({}, { status: outcome === 'success' ? 200 : 503 }));
				expect(await settles(remove.mock.results[0].value)).toBe(false);
			});
			expect(errorToast).not.toHaveBeenCalled();
			expect(infoToast).not.toHaveBeenCalled();
			expect(methods).toEqual(['DELETE']);
			expect(modals.isOpen('rating-modal')).toBe(true);
			expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('Fresh B draft');
		}
	);

	it.each(['workspace', 'editor only'] as const)(
		'does not submit approval after the initiating %s departs',
		async (departure) => {
			const held = Promise.withResolvers<Response>();
			const errorToast = vi.spyOn(toastStore, 'error').mockReturnValue('error');
			const infoToast = vi.spyOn(toastStore, 'info').mockReturnValue('info');
			const remove = vi.spyOn(evaluationStore, 'remove');
			const methods: string[] = [];
			vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
				methods.push(init.method!);
				return init.method === 'DELETE' ? held.promise : Promise.resolve(Response.json({}, { status: 201 }));
			});
			const origin = await openEditor();
			await confirmDeletion();
			let currentModals = origin.modals;
			if (departure === 'workspace') {
				origin.unmount();
				currentModals = (await openEditor(foreignEditorOptions)).modals;
			} else {
				await act(() => origin.modals.close('rating-modal'));
				expect(screen.queryByRole('dialog')).toBeNull();
				await act(() => origin.modals.open('rating-modal', { entry: otherEntry }));
			}
			await fireEvent.input(screen.getByLabelText('Notes'), { target: { value: 'Replacement editor draft' } });
			await act(async () => {
				held.resolve(Response.json({ requiresApproval: true }, { status: 202 }));
				if (departure === 'workspace') expect(await settles(remove.mock.results[0].value)).toBe(false);
				else await remove.mock.results[0].value;
			});
			expect(methods).toEqual(['DELETE']);
			expect(errorToast).not.toHaveBeenCalled();
			expect(infoToast).not.toHaveBeenCalled();
			expect(currentModals.isOpen('rating-modal')).toBe(true);
			expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('Replacement editor draft');
		}
	);

	it.each([201, 409, 503, 'transport failure'] as const)(
		'retires already-dispatched approval outcome %s',
		async (outcome) => {
			const held = Promise.withResolvers<Response>();
			const errorToast = vi.spyOn(toastStore, 'error').mockReturnValue('error');
			const infoToast = vi.spyOn(toastStore, 'info').mockReturnValue('info');
			const approval = vi.spyOn(deletionRequests, 'submitDeletionRequest');
			const requests: { url: string; method: string; body: unknown }[] = [];
			vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
				requests.push({ url, method: init.method!, body: JSON.parse(init.body as string) });
				return init.method === 'DELETE'
					? Promise.resolve(Response.json({ requiresApproval: true }, { status: 202 }))
					: held.promise;
			});
			const origin = await openEditor();
			await confirmDeletion();
			await waitFor(() => expect(requests.map((request) => request.method)).toEqual(['DELETE', 'POST']));
			expect(requests[1]).toEqual({
				url: '/org/org-a/api/deletion-requests',
				method: 'POST',
				body: {
					resourceType: 'evaluation',
					resourceId: entry.id,
					resourceDescription: 'Evaluation for SGT Able',
					resourceUrl: '/org/org-a/evals'
				}
			});
			origin.unmount();
			const { modals } = await openEditor(foreignEditorOptions);
			await fireEvent.input(screen.getByLabelText('Notes'), { target: { value: 'Fresh B draft' } });
			await act(async () => {
				if (outcome === 'transport failure') held.reject(new TypeError('Old request failed'));
				else held.resolve(Response.json({}, { status: outcome }));
				await approval.mock.results[0].value;
			});
			expect(errorToast).not.toHaveBeenCalled();
			expect(infoToast).not.toHaveBeenCalled();
			expect(modals.isOpen('rating-modal')).toBe(true);
			expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('Fresh B draft');
			expect(ratingSchemeEntries.items).toEqual([foreignEntry]);
		}
	);

	it('keeps the initiating deletion description through a same-Organization personnel refresh', async () => {
		const held = Promise.withResolvers<Response>();
		const infoToast = vi.spyOn(toastStore, 'info').mockReturnValue('info');
		const errorToast = vi.spyOn(toastStore, 'error').mockReturnValue('error');
		const requests: { url: string; method: string; body: unknown }[] = [];
		vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
			requests.push({ url, method: init.method!, body: JSON.parse(init.body as string) });
			return init.method === 'DELETE' ? held.promise : Promise.resolve(Response.json({}, { status: 201 }));
		});
		const origin = await openEditor();
		await confirmDeletion();
		await origin.rerender({
			personnelLookup: [{ id: 'person-a', rank: 'SSG', firstName: 'Refreshed', lastName: 'Changed' }]
		});
		held.resolve(Response.json({ requiresApproval: true }, { status: 202 }));
		await waitFor(() => expect(origin.modals.isOpen('rating-modal')).toBe(false));
		expect(requests).toHaveLength(2);
		expect(requests[1]).toEqual({
			url: '/org/org-a/api/deletion-requests',
			method: 'POST',
			body: {
				resourceType: 'evaluation',
				resourceId: entry.id,
				resourceDescription: 'Evaluation for SGT Able',
				resourceUrl: '/org/org-a/evals'
			}
		});
		expect(infoToast).toHaveBeenCalledTimes(1);
		expect(errorToast).not.toHaveBeenCalled();
		expect(ratingSchemeEntries.items).toEqual([entry, otherEntry]);
	});

	it.each(['same Organization departure', 'A to B to fresh A'] as const)(
		'does not revive the old save after %s',
		async (departure) => {
			const held = Promise.withResolvers<Response>();
			const errorToast = vi.spyOn(toastStore, 'error').mockReturnValue('error');
			const successToast = vi.spyOn(toastStore, 'success').mockReturnValue('success');
			const update = vi.spyOn(evaluationStore, 'updateOrThrow');
			vi.stubGlobal('fetch', () => held.promise);
			const origin = await openEditor();
			await fireEvent.input(screen.getByLabelText('Notes'), { target: { value: 'Retired A save' } });
			await fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
			origin.unmount();
			if (departure === 'A to B to fresh A') (await openEditor(foreignEditorOptions)).unmount();
			const { modals } = await openEditor();
			await fireEvent.input(screen.getByLabelText('Notes'), { target: { value: 'Fresh A draft' } });
			await act(async () => {
				held.resolve(Response.json(savedEvaluation({ ...entry, notes: 'Retired A save' })));
				if (departure === 'A to B to fresh A') expect(await settles(update.mock.results[0].value)).toBe(false);
				else await update.mock.results[0].value;
			});
			expect(errorToast).not.toHaveBeenCalled();
			expect(successToast).not.toHaveBeenCalled();
			expect(modals.isOpen('rating-modal')).toBe(true);
			expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('Fresh A draft');
		}
	);

	it.each(['success', 'failure and retry'] as const)(
		'keeps current save %s functional through same-Organization refresh',
		async (outcome) => {
			const held = Promise.withResolvers<Response>();
			const errorToast = vi.spyOn(toastStore, 'error').mockReturnValue('error');
			const successToast = vi.spyOn(toastStore, 'success').mockReturnValue('success');
			const update = vi.spyOn(evaluationStore, 'updateOrThrow');
			const requests: unknown[] = [];
			vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
				requests.push(JSON.parse(init.body as string));
				return requests.length === 1
					? held.promise
					: Promise.resolve(Response.json(savedEvaluation({ ...entry, notes: 'Current retained draft' })));
			});
			const origin = await openEditor();
			await fireEvent.input(screen.getByLabelText('Notes'), { target: { value: 'Current retained draft' } });
			await fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
			await origin.rerender({
				orgId: 'org-a',
				personnelLookup: [{ id: 'person-a', rank: 'SSG', firstName: 'Refreshed', lastName: 'Able' }]
			});
			await ratingSchemeWorkspaceHydrator.hydrate(
				hydration('org-a', [{ ...entry }, { ...otherEntry }], `refresh-${++snapshot}`)
			);
			await act(async () => {
				held.resolve(
					Response.json(savedEvaluation({ ...entry, notes: 'Current retained draft' }), {
						status: outcome === 'success' ? 200 : 503
					})
				);
				expect(await settles(update.mock.results[0].value)).toBe(true);
			});
			if (outcome === 'failure and retry') {
				expect(within(screen.getByRole('dialog')).getByRole('alert').textContent?.replace(/\s+/g, ' ').trim()).toBe(
					'Rating entry was not saved Failed to update rating entry'
				);
				expect(errorToast).not.toHaveBeenCalled();
				expect(origin.modals.isOpen('rating-modal')).toBe(true);
				expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('Current retained draft');
				expect((screen.getByRole('button', { name: 'Save changes' }) as HTMLButtonElement).disabled).toBe(false);
				await fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
				await waitFor(() => expect(origin.modals.isOpen('rating-modal')).toBe(false));
				expect(requests).toHaveLength(2);
				expect(requests[0]).toEqual(requests[1]);
			} else {
				expect(errorToast).not.toHaveBeenCalled();
				expect(origin.modals.isOpen('rating-modal')).toBe(false);
			}
			expect(successToast).toHaveBeenCalledWith('Rating entry updated');
			expect(ratingSchemeEntries.items.find((item) => item.id === entry.id)?.notes).toBe('Current retained draft');
		}
	);

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
					return Response.json({}, { status: failed ? 409 : 200 });
				}
				if (failed) return Response.json({}, { status: 503 });
				requests.push(JSON.parse(init.body as string));
				return Response.json({ id: 'request-a' }, { status: 201 });
			});
			const { modals } = await openEditor();
			await fireEvent.input(screen.getByLabelText('Notes'), { target: { value: 'Unsaved draft' } });
			await confirmDeletion();
			await waitFor(() => expect(errorToast).toHaveBeenCalledTimes(1));
			expect(modals.isOpen('rating-modal')).toBe(true);
			expect(screen.getByRole('alertdialog')).toBeTruthy();
			expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('Unsaved draft');
			expect(ctx.filteredRatingEntries).toEqual([entry, otherEntry]);
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
			expect(ctx.filteredRatingEntries).toEqual(operation === 'delete' ? [otherEntry] : [entry, otherEntry]);
			if (operation === 'approval request')
				expect(requests).toEqual([
					expect.objectContaining({
						resourceId: entry.id,
						resourceType: 'evaluation',
						resourceUrl: '/org/org-a/evals'
					})
				]);
			expect(errorToast).toHaveBeenCalledTimes(1);
		}
	);

	it('keeps the editor and its draft when the delete reply is lost, and offers a reload', async () => {
		const unconfirmedToast = vi.spyOn(toastStore, 'unconfirmed').mockReturnValue('unconfirmed');
		const errorToast = vi.spyOn(toastStore, 'error').mockReturnValue('error');
		vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
			if (init.method === 'DELETE') throw new TypeError('Failed to fetch');
			return Response.json({}, { status: 409 });
		});
		const { modals } = await openEditor();
		await fireEvent.input(screen.getByLabelText('Notes'), { target: { value: 'Unsaved draft' } });
		await confirmDeletion();
		await waitFor(() => expect(unconfirmedToast).toHaveBeenCalledTimes(1));
		expect(errorToast).not.toHaveBeenCalled();
		expect(modals.isOpen('rating-modal')).toBe(true);
		expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('Unsaved draft');
		expect(ctx.filteredRatingEntries).toEqual([entry, otherEntry]);
	});

	it('accepts an already-pending request without removing the evaluation', async () => {
		const infoToast = vi.spyOn(toastStore, 'info').mockReturnValue('info');
		const errorToast = vi.spyOn(toastStore, 'error').mockReturnValue('error');
		vi.stubGlobal('fetch', async (_url: string, init: RequestInit) =>
			init.method === 'DELETE'
				? Response.json({ requiresApproval: true }, { status: 202 })
				: Response.json({}, { status: 409 })
		);
		const { modals } = await openEditor();
		await confirmDeletion();
		await waitFor(() => expect(modals.isOpen('rating-modal')).toBe(false));
		expect(ctx.filteredRatingEntries).toEqual([entry, otherEntry]);
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
			const { modals } = await openEditor();
			await confirmDeletion();
			const confirmation = within(screen.getByRole('alertdialog'));
			await fireEvent.click(confirmation.getByRole('button', { name: /Delete Entry/ }));
			await fireEvent.click(confirmation.getByRole('button', { name: 'Cancel' }));
			await fireEvent.keyDown(document, { key: 'Escape' });
			expect(screen.getByRole('alertdialog')).toBeTruthy();
			const editor = within(screen.getByRole('dialog', { name: 'SGT Able, Synthetic', hidden: true }));
			for (const name of ['Save changes', 'Delete entry', 'Cancel']) {
				expect((editor.getByRole('button', { name, hidden: true }) as HTMLButtonElement).disabled).toBe(true);
			}
			expect(modals.isOpen('rating-modal')).toBe(true);
			expect(effects).toEqual(pendingMethod === 'DELETE' ? ['DELETE'] : ['DELETE', 'POST']);
			release(Response.json({}, { status: 200 }));
			await waitFor(() => expect(modals.isOpen('rating-modal')).toBe(false));
			expect(ctx.filteredRatingEntries).toEqual(pendingMethod === 'DELETE' ? [otherEntry] : [entry, otherEntry]);
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
		const { modals } = await openEditor();
		await fireEvent.input(screen.getByLabelText('Notes'), { target: { value: 'Updated notes' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
		const deleteButton = screen.getByRole('button', { name: 'Delete entry' }) as HTMLButtonElement;
		expect(deleteButton.disabled).toBe(true);
		await fireEvent.click(deleteButton);
		await fireEvent.keyDown(document, { key: 'Escape' });
		expect(screen.queryByRole('alertdialog')).toBeNull();
		expect(modals.isOpen('rating-modal')).toBe(true);
		expect(effects).toEqual(['PUT']);
		release(Response.json(savedEvaluation({ ...entry, notes: 'Updated notes' })));
		await waitFor(() => expect(modals.isOpen('rating-modal')).toBe(false));
		expect(ctx.filteredRatingEntries.find((item) => item.id === entry.id)?.notes).toBe('Updated notes');
	});
});
