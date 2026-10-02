// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import type { PersonnelLeaderNote } from '$features/personnel/contracts';
import type {
	PersonnelCounselingRecord,
	PersonnelArchivedArtifactsPageData,
	PersonnelCounselingsPageData,
	PersonnelDocument,
	PersonnelDocumentsPageData,
	PersonnelFollowUp,
	PersonnelFollowUpsPageData,
	PersonnelNotesPageData
} from '$features/personnel/personnel-detail.types';
import FollowUpsPage from './follow-ups/+page.svelte';
import DocumentsPage from './documents/+page.svelte';
import CounselingsPage from './counselings/+page.svelte';
import NotesPage from './notes/+page.svelte';
import ArchivedPage from './archived/+page.svelte';

const basePageData = {
	orgId: 'org-1',
	personnelId: 'person-1',
	emptyState: 'No artifact records yet'
};

let fetchMock: ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { 'content-type': 'application/json' }
	});
}

function makeFollowUp(overrides: Partial<PersonnelFollowUp> = {}): PersonnelFollowUp {
	return {
		id: 'follow-up-1',
		personnelId: 'person-1',
		title: 'Dental readiness',
		notes: 'Needs appointment',
		dueDate: null,
		status: 'open',
		createdBy: '1SG Ramos',
		createdAt: '2026-06-08T10:00:00.000Z',
		updatedAt: '2026-06-08T10:00:00.000Z',
		completedAt: null,
		archivedAt: null,
		...overrides
	};
}

function makeDocument(overrides: Partial<PersonnelDocument> = {}): PersonnelDocument {
	return {
		id: 'document-1',
		personnelId: 'person-1',
		title: 'BLS Card 2026',
		fileName: 'BLS_Card-2026.pdf',
		fileSizeBytes: 1024,
		contentType: 'application/pdf',
		uploadedBy: 'SSG Miller',
		createdAt: '2026-06-08T10:00:00.000Z',
		archivedAt: null,
		...overrides
	};
}

function makeCounselingRecord(overrides: Partial<PersonnelCounselingRecord> = {}): PersonnelCounselingRecord {
	return {
		id: 'counseling-1',
		personnelId: 'person-1',
		dateConducted: '2026-01-31',
		title: 'Monthly counseling',
		summary: 'Goals reviewed',
		status: 'uploaded',
		uploadedBy: 'SSG Miller',
		fileName: 'monthly-counseling.pdf',
		createdAt: '2026-06-08T10:00:00.000Z',
		archivedAt: null,
		...overrides
	};
}

function makeLeaderNote(overrides: Partial<PersonnelLeaderNote> = {}): PersonnelLeaderNote {
	return {
		id: 'leader-note-1',
		personnelId: 'person-1',
		author: '1SG Ramos',
		date: '2026-06-08',
		text: 'Strong range card prep',
		createdAt: '2026-06-08T10:00:00.000Z',
		archivedAt: null,
		...overrides
	};
}

function renderFollowUps(records: PersonnelFollowUp[] = []) {
	const data: PersonnelFollowUpsPageData = {
		...basePageData,
		title: 'Follow-Ups',
		records
	};
	return render(FollowUpsPage, { props: { data } });
}

function renderDocuments(records: PersonnelDocument[] = []) {
	const data: PersonnelDocumentsPageData = {
		...basePageData,
		title: 'Documents',
		records
	};
	return render(DocumentsPage, { props: { data } });
}

function renderCounselings(records: PersonnelCounselingRecord[] = []) {
	const data: PersonnelCounselingsPageData = {
		...basePageData,
		title: 'Counseling Records',
		records
	};
	return render(CounselingsPage, { props: { data } });
}

function renderNotes(notes: PersonnelLeaderNote[] = []) {
	const data: PersonnelNotesPageData = {
		...basePageData,
		title: 'Leader Notes',
		notes
	};
	return render(NotesPage, { props: { data } });
}

describe('personnel artifact subpages', () => {
	beforeEach(() => {
		fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		cleanup();
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it.each([
		{ archivedAt: new Date(2026, 7, 1, 12).toISOString(), expectedDate: 'Aug 1, 2026' },
		{ archivedAt: null, expectedDate: 'Oct 1, 2026' }
	])(
		'shows the saved follow-up archive date, falling back only when absent ($expectedDate)',
		({ archivedAt, expectedDate }) => {
			const data: PersonnelArchivedArtifactsPageData = {
				...basePageData,
				title: 'Archived items',
				records: [
					{
						...makeFollowUp({
							status: 'archived',
							archivedAt,
							updatedAt: new Date(2026, 9, 1, 12).toISOString()
						}),
						kind: 'follow-up'
					}
				]
			};
			render(ArchivedPage, { props: { data } });

			expect(screen.getByText(new RegExp(`Archived ${expectedDate}$`))).toBeTruthy();
		}
	);

	it('creates follow-ups with the shared JSON draft contract', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse(makeFollowUp()));
		renderFollowUps();

		await fireEvent.input(screen.getByLabelText('Follow-up title'), {
			target: { value: '  Dental readiness  ' }
		});
		await fireEvent.input(screen.getByLabelText('Follow-up notes'), {
			target: { value: '  Needs appointment  ' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Add' }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('/org/org-1/api/personnel/person-1/follow-ups');
		expect(request.method).toBe('POST');
		expect(request.headers).toEqual({ 'content-type': 'application/json' });
		expect(JSON.parse(request.body as string)).toEqual({
			title: 'Dental readiness',
			notes: 'Needs appointment',
			dueDate: null
		});
		await screen.findByText('Dental readiness');
		expect((screen.getByLabelText('Follow-up title') as HTMLInputElement).value).toBe('');
	});

	it('exits edit mode when archiving the follow-up being edited', async () => {
		fetchMock.mockResolvedValueOnce(
			jsonResponse(makeFollowUp({ status: 'archived', archivedAt: '2026-06-08T10:05:00.000Z' }))
		);
		renderFollowUps([makeFollowUp()]);

		await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
		const titleInput = screen.getByLabelText('Follow-up title') as HTMLInputElement;
		expect(titleInput.value).toBe('Dental readiness');

		await fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		expect(fetchMock).toHaveBeenCalledWith('/org/org-1/api/personnel/person-1/follow-ups/follow-up-1', {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ status: 'archived' })
		});
		await screen.findByText('No artifact records yet');
		expect(titleInput.value).toBe('');
		expect(screen.queryByRole('button', { name: 'Cancel edit' })).toBeNull();
		expect(screen.getByRole('button', { name: 'Add' })).toBeTruthy();
	});

	it('creates leader notes with the shared JSON draft contract', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse(makeLeaderNote()));
		renderNotes();

		await fireEvent.input(screen.getByLabelText('New leader note'), {
			target: { value: '  Strong range card prep  ' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Add note' }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('/org/org-1/api/personnel/person-1/leader-notes');
		expect(request.method).toBe('POST');
		expect(request.headers).toEqual({ 'content-type': 'application/json' });
		expect(JSON.parse(request.body as string)).toEqual({ text: 'Strong range card prep' });
		await screen.findByText('Strong range card prep');
		expect((screen.getByLabelText('New leader note') as HTMLTextAreaElement).value).toBe('');
	});

	it('creates documents with the shared multipart draft contract', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse(makeDocument()));
		renderDocuments();

		const file = new File(['card'], 'BLS_Card-2026.pdf', { type: 'application/pdf' });
		const fileInput = screen.getByLabelText('Document file') as HTMLInputElement;
		await fireEvent.change(fileInput, {
			target: { files: [file] }
		});

		const titleInput = screen.getByLabelText('Document title') as HTMLInputElement;
		expect(titleInput.value).toBe('BLS Card 2026');

		await fireEvent.submit(titleInput.closest('form') as HTMLFormElement);

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('/org/org-1/api/personnel/person-1/documents');
		expect(request.method).toBe('POST');
		expect(request.headers).toBeUndefined();
		expect(request.body).toBeInstanceOf(FormData);
		expect((request.body as FormData).get('title')).toBe('BLS Card 2026');
		expect((request.body as FormData).get('file')).toBe(file);
		await screen.findByText('BLS Card 2026');
		expect(titleInput.value).toBe('');
		expect(fileInput.files?.length ?? 0).toBe(0);
	});

	it('creates counseling records with the shared local-date multipart draft contract', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date(2026, 0, 31, 23, 45));
		fetchMock.mockResolvedValueOnce(jsonResponse(makeCounselingRecord()));
		renderCounselings();

		const file = new File(['counseling'], 'monthly-counseling.pdf', { type: 'application/pdf' });
		const fileInput = screen.getByLabelText('Counseling PDF') as HTMLInputElement;
		await fireEvent.input(screen.getByLabelText('Counseling title'), {
			target: { value: '  Monthly counseling  ' }
		});
		await fireEvent.input(screen.getByLabelText('Counseling summary'), {
			target: { value: '  Goals reviewed  ' }
		});
		await fireEvent.change(fileInput, {
			target: { files: [file] }
		});
		await fireEvent.submit(screen.getByLabelText('Counseling title').closest('form') as HTMLFormElement);

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('/org/org-1/api/personnel/person-1/counseling-records');
		expect(request.method).toBe('POST');
		expect(request.body).toBeInstanceOf(FormData);
		expect((request.body as FormData).get('dateConducted')).toBe('2026-01-31');
		expect((request.body as FormData).get('title')).toBe('Monthly counseling');
		expect((request.body as FormData).get('summary')).toBe('Goals reviewed');
		expect((request.body as FormData).get('file')).toBe(file);
		await screen.findByText('Monthly counseling');
		expect((screen.getByLabelText('Counseling title') as HTMLInputElement).value).toBe('');
		expect(fileInput.files?.length ?? 0).toBe(0);
	});
});

const contextChanges = [
	{ name: 'another Person', orgId: 'org-1', personnelId: 'person-2' },
	{ name: 'another Organization and Person', orgId: 'org-2', personnelId: 'person-2' }
];
const artifactFamilies = [
	{ name: 'follow-up', field: 'Follow-up title', endpoint: 'follow-ups', fileField: null },
	{ name: 'document', field: 'Document title', endpoint: 'documents', fileField: 'Document file' },
	{ name: 'counseling', field: 'Counseling title', endpoint: 'counseling-records', fileField: 'Counseling PDF' },
	{ name: 'note', field: 'New leader note', endpoint: 'leader-notes', fileField: null }
] as const;
type ArtifactFamily = (typeof artifactFamilies)[number];
type ArtifactContext = Pick<typeof basePageData, 'orgId' | 'personnelId'>;

function deferredResponse() {
	let resolve!: (response: Response) => void;
	const promise = new Promise<Response>((respond) => {
		resolve = respond;
	});
	return { promise, resolve };
}

function recordFor(family: ArtifactFamily, context: ArtifactContext, text: string) {
	const overrides = { id: `${family.name}-${context.personnelId}-${text}`, personnelId: context.personnelId };
	if (family.name === 'follow-up') return makeFollowUp({ ...overrides, title: text });
	if (family.name === 'document') return makeDocument({ ...overrides, title: text });
	if (family.name === 'counseling') return makeCounselingRecord({ ...overrides, title: text });
	return makeLeaderNote({ ...overrides, text });
}

function renderFamily(family: ArtifactFamily, context: ArtifactContext, texts: string[] = []) {
	const shared = { ...basePageData, title: family.name };
	if (family.name === 'follow-up') {
		const data = (ctx: ArtifactContext, values: string[]): PersonnelFollowUpsPageData => ({
			...shared,
			...ctx,
			records: values.map((title) =>
				makeFollowUp({ id: `follow-up-${ctx.personnelId}-${title}`, personnelId: ctx.personnelId, title })
			)
		});
		const view = render(FollowUpsPage, { props: { data: data(context, texts) } });
		return { rerender: (ctx: ArtifactContext, values: string[]) => view.rerender({ data: data(ctx, values) }) };
	}
	if (family.name === 'document') {
		const data = (ctx: ArtifactContext, values: string[]): PersonnelDocumentsPageData => ({
			...shared,
			...ctx,
			records: values.map((title) =>
				makeDocument({ id: `document-${ctx.personnelId}-${title}`, personnelId: ctx.personnelId, title })
			)
		});
		const view = render(DocumentsPage, { props: { data: data(context, texts) } });
		return { rerender: (ctx: ArtifactContext, values: string[]) => view.rerender({ data: data(ctx, values) }) };
	}
	if (family.name === 'counseling') {
		const data = (ctx: ArtifactContext, values: string[]): PersonnelCounselingsPageData => ({
			...shared,
			...ctx,
			records: values.map((title) =>
				makeCounselingRecord({ id: `counseling-${ctx.personnelId}-${title}`, personnelId: ctx.personnelId, title })
			)
		});
		const view = render(CounselingsPage, { props: { data: data(context, texts) } });
		return { rerender: (ctx: ArtifactContext, values: string[]) => view.rerender({ data: data(ctx, values) }) };
	}
	const data = (ctx: ArtifactContext, values: string[]): PersonnelNotesPageData => ({
		...shared,
		...ctx,
		notes: values.map((text) =>
			makeLeaderNote({ id: `note-${ctx.personnelId}-${text}`, personnelId: ctx.personnelId, text })
		)
	});
	const view = render(NotesPage, { props: { data: data(context, texts) } });
	return { rerender: (ctx: ArtifactContext, values: string[]) => view.rerender({ data: data(ctx, values) }) };
}

async function selectArtifactFile(label: string, name: string) {
	const input = screen.getByLabelText(label) as HTMLInputElement;
	const file = new File(['%PDF-1.4\nsynthetic'], name, { type: 'application/pdf' });
	const transfer = new DataTransfer();
	transfer.items.add(file);
	// Use the actual setter: fireEvent's target.files replaces it with an own property.
	input.files = transfer.files;
	await fireEvent.change(input);
	expect(input.files?.[0]?.name).toBe(name);
	return file;
}

async function fillArtifact(family: ArtifactFamily, text: string) {
	if (family.fileField) await selectArtifactFile(family.fileField, `${text}.pdf`);
	await fireEvent.input(screen.getByLabelText(family.field), { target: { value: text } });
}

async function submitArtifact(family: ArtifactFamily) {
	const form = screen.getByLabelText(family.field).closest('form');
	if (!form) throw new Error('Artifact form not found');
	await fireEvent.click(within(form).getByRole('button', { name: /^(Add|Add note|Upload|Upload PDF)$/ }));
}

async function settleResponse(pending: ReturnType<typeof deferredResponse>, response: Response) {
	const receipt = response.clone();
	await act(async () => {
		pending.resolve(response);
		await pending.promise;
		await receipt.text();
	});
}

function archivedData(context: ArtifactContext, titles: string[]): PersonnelArchivedArtifactsPageData {
	return {
		...basePageData,
		...context,
		title: 'Archived items',
		records: titles.map((title) => ({
			...makeDocument({
				id: `document-${context.personnelId}-${title}`,
				personnelId: context.personnelId,
				title
			}),
			archivedAt: '2026-08-01T12:00:00.000Z',
			kind: 'document' as const
		}))
	};
}

function rowAction(title: string, action: string) {
	const article = screen.getByText(title).closest('article');
	if (!article) throw new Error('Artifact row not found');
	return within(article).getByRole('button', { name: action }) as HTMLButtonElement;
}

describe('reused Personnel artifact pages', () => {
	beforeEach(() => {
		fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
	});
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	describe.each(artifactFamilies)('$name', (family) => {
		it.each(contextChanges)('clears drafts and transient saved rows when opening $name', async (next) => {
			fetchMock.mockResolvedValueOnce(jsonResponse(recordFor(family, basePageData, 'A saved artifact')));
			const view = renderFamily(family, basePageData);
			await fillArtifact(family, 'A saved artifact');
			await submitArtifact(family);
			await screen.findByText('A saved artifact');
			await fillArtifact(family, 'A unsaved draft');
			await view.rerender(next, ['B loaded artifact']);

			expect(screen.getByText('B loaded artifact')).toBeTruthy();
			expect.soft((screen.getByLabelText(family.field) as HTMLInputElement).value).toBe('');
			expect.soft(screen.queryByText('A saved artifact')).toBeNull();
			if (family.fileField) {
				expect.soft((screen.getByLabelText(family.fileField) as HTMLInputElement).files?.length ?? 0).toBe(0);
				await fireEvent.input(screen.getByLabelText(family.field), { target: { value: 'B title without a file' } });
				await fireEvent.submit(screen.getByLabelText(family.field).closest('form') as HTMLFormElement);
				expect.soft(fetchMock).toHaveBeenCalledTimes(1);
			}
		});

		it('keeps the new Person draft and file when the old create response arrives', async () => {
			const pending = deferredResponse();
			fetchMock.mockReturnValueOnce(pending.promise);
			const view = renderFamily(family, basePageData);
			await fillArtifact(family, 'A pending artifact');
			await submitArtifact(family);
			expect(fetchMock.mock.calls[0][0]).toBe(`/org/org-1/api/personnel/person-1/${family.endpoint}`);
			await view.rerender(contextChanges[0], ['B loaded artifact']);
			await fillArtifact(family, 'B unsaved draft');
			await settleResponse(pending, jsonResponse(recordFor(family, basePageData, 'A pending artifact')));

			expect.soft((screen.getByLabelText(family.field) as HTMLInputElement).value).toBe('B unsaved draft');
			expect.soft(screen.queryByText('A pending artifact')).toBeNull();
			expect.soft(screen.getByText('B loaded artifact')).toBeTruthy();
			if (family.fileField)
				expect
					.soft((screen.getByLabelText(family.fileField) as HTMLInputElement).files?.[0]?.name)
					.toBe('B unsaved draft.pdf');
		});
	});

	it('keeps a same-Person document draft and file through refreshed page data', async () => {
		const family = artifactFamilies[1];
		const view = renderFamily(family, basePageData, ['Earlier document']);
		await fillArtifact(family, 'Still editing');
		await view.rerender(basePageData, ['Refreshed document']);
		expect(screen.getByText('Refreshed document')).toBeTruthy();
		expect((screen.getByLabelText('Document title') as HTMLInputElement).value).toBe('Still editing');
		expect((screen.getByLabelText('Document file') as HTMLInputElement).files?.[0]?.name).toBe('Still editing.pdf');
	});

	it('leaves edit mode and the previous follow-up draft on a Person change', async () => {
		const view = renderFamily(artifactFamilies[0], basePageData, ['A editing follow-up']);
		await fireEvent.click(rowAction('A editing follow-up', 'Edit'));
		await view.rerender(contextChanges[0], ['B follow-up']);
		expect.soft(screen.queryByRole('button', { name: 'Cancel edit' })).toBeNull();
		expect.soft((screen.getByLabelText('Follow-up title') as HTMLInputElement).value).toBe('');
		expect.soft(screen.queryByRole('button', { name: 'Add' })).not.toBeNull();
	});

	it('does not clear the next Person draft or adopt a late follow-up edit', async () => {
		const pending = deferredResponse();
		fetchMock.mockReturnValueOnce(pending.promise);
		const view = renderFamily(artifactFamilies[0], basePageData, ['A editing follow-up']);
		await fireEvent.click(rowAction('A editing follow-up', 'Edit'));
		await fireEvent.input(screen.getByLabelText('Follow-up title'), { target: { value: 'A saved edit' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		await view.rerender(contextChanges[0], ['B follow-up']);
		await fireEvent.input(screen.getByLabelText('Follow-up title'), { target: { value: 'B unsaved draft' } });
		await settleResponse(
			pending,
			jsonResponse(makeFollowUp({ id: 'follow-up-person-1-A editing follow-up', title: 'A saved edit' }))
		);
		expect.soft((screen.getByLabelText('Follow-up title') as HTMLInputElement).value).toBe('B unsaved draft');
		expect.soft(screen.queryByText('A saved edit')).toBeNull();
		expect.soft(screen.getByText('B follow-up')).toBeTruthy();
	});

	it('keeps the next Person status action pending when the old status response finishes', async () => {
		const pendingA = deferredResponse();
		const pendingB = deferredResponse();
		fetchMock.mockReturnValueOnce(pendingA.promise).mockReturnValueOnce(pendingB.promise);
		const view = renderFamily(artifactFamilies[0], basePageData, ['A follow-up']);
		await fireEvent.click(rowAction('A follow-up', 'Complete'));
		await view.rerender(contextChanges[0], ['B follow-up']);
		await fireEvent.click(rowAction('B follow-up', 'Complete'));
		expect(rowAction('B follow-up', 'Complete').disabled).toBe(true);
		await settleResponse(pendingA, jsonResponse(makeFollowUp({ title: 'A follow-up', status: 'completed' })));
		expect.soft(rowAction('B follow-up', 'Complete').disabled).toBe(true);
		expect.soft(screen.queryByText('A follow-up')).toBeNull();
		await settleResponse(
			pendingB,
			jsonResponse(
				makeFollowUp({
					id: 'follow-up-person-2-B follow-up',
					personnelId: 'person-2',
					title: 'B follow-up',
					status: 'completed'
				})
			)
		);
		expect(rowAction('B follow-up', 'Reopen').disabled).toBe(false);
	});

	it('does not open the previous Person document after its delayed download response', async () => {
		const pending = deferredResponse();
		const open = vi.spyOn(window, 'open').mockImplementation(() => null);
		fetchMock
			.mockReturnValueOnce(pending.promise)
			.mockResolvedValueOnce(jsonResponse({ url: 'https://example.invalid/b.pdf' }));
		const view = renderFamily(artifactFamilies[1], basePageData, ['A document']);
		await fireEvent.click(rowAction('A document', 'Open'));
		await view.rerender(contextChanges[1], ['B document']);
		await settleResponse(pending, jsonResponse({ url: 'https://example.invalid/a.pdf' }));
		expect.soft(open).not.toHaveBeenCalled();
		await fireEvent.click(rowAction('B document', 'Open'));
		await waitFor(() =>
			expect(open).toHaveBeenCalledWith('https://example.invalid/b.pdf', '_blank', 'noopener,noreferrer')
		);
		expect(fetchMock.mock.calls[1][0]).toBe(
			'/org/org-2/api/personnel/person-2/documents/document-person-2-B document/download'
		);
	});

	it.each(['Restore', 'Delete'])('drops the previous Archived local list after a settled %s', async (action) => {
		fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));
		const view = render(ArchivedPage, {
			props: { data: archivedData(basePageData, ['A target', 'A retained history']) }
		});
		await fireEvent.click(rowAction('A target', action));
		await waitFor(() => expect(screen.queryByText('A target')).toBeNull());
		await view.rerender({ data: archivedData(contextChanges[1], ['B history']) });
		expect.soft(screen.queryByText('A retained history')).toBeNull();
		expect.soft(screen.queryByText('B history')).not.toBeNull();
	});

	it.each(['Restore', 'Delete'])('does not clear another Person pending Archived %s action', async (action) => {
		const pendingA = deferredResponse();
		const pendingB = deferredResponse();
		fetchMock.mockReturnValueOnce(pendingA.promise).mockReturnValueOnce(pendingB.promise);
		const view = render(ArchivedPage, { props: { data: archivedData(basePageData, ['A history']) } });
		await fireEvent.click(rowAction('A history', action));
		await view.rerender({ data: archivedData(contextChanges[0], ['B history', 'B retained history']) });
		await fireEvent.click(rowAction('B history', action));
		expect(rowAction('B history', action).disabled).toBe(true);
		await settleResponse(pendingA, jsonResponse({ success: true }));
		expect.soft(rowAction('B history', action).disabled).toBe(true);
		expect.soft(screen.getByText('B retained history')).toBeTruthy();
		await settleResponse(pendingB, jsonResponse({ success: true }));
		expect(screen.queryByText('B history')).toBeNull();
		expect(screen.getByText('B retained history')).toBeTruthy();
	});
});
