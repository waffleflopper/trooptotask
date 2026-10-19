// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import type {
	PersonnelCounselingRecord,
	PersonnelDocument,
	PersonnelCounselingsPageData,
	PersonnelDocumentsPageData,
	PersonnelFilesPageData
} from '$features/personnel/contracts';
import FilesPage from './files/+page.svelte';

const basePageData = {
	orgId: 'org-1',
	personnelId: 'person-1',
	emptyState: 'No artifact records yet'
};

function filesPage(
	slot: { counselings: PersonnelCounselingsPageData } | { documents: PersonnelDocumentsPageData }
): PersonnelFilesPageData {
	const { orgId, personnelId } = 'counselings' in slot ? slot.counselings : slot.documents;
	const empty = { orgId, personnelId, title: '', emptyState: 'No companion records', records: [] };
	return { counselings: empty, documents: empty, ...slot };
}

let fetchMock: ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { 'content-type': 'application/json' }
	});
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

function renderDocuments(records: PersonnelDocument[] = []) {
	const data: PersonnelDocumentsPageData = {
		...basePageData,
		title: 'Documents',
		records
	};
	return render(FilesPage, { props: { data: filesPage({ documents: data }) } });
}

function renderCounselings(records: PersonnelCounselingRecord[] = []) {
	const data: PersonnelCounselingsPageData = {
		...basePageData,
		title: 'Counseling Records',
		records
	};
	return render(FilesPage, { props: { data: filesPage({ counselings: data }) } });
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
	{
		name: 'document',
		field: 'Document title',
		endpoint: 'documents',
		fileField: 'Document file',
		saveFailure: 'Unable to upload document.',
		missing: { control: 'Document file', message: 'Choose a PDF, JPEG, PNG, or HEIC file.' }
	},
	{
		name: 'counseling',
		field: 'Counseling title',
		endpoint: 'counseling-records',
		fileField: 'Counseling PDF',
		saveFailure: 'Unable to upload counseling PDF.',
		missing: { control: 'Counseling PDF', message: 'Choose a signed counseling PDF.' }
	}
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
	return family.name === 'document'
		? makeDocument({ ...overrides, title: text })
		: makeCounselingRecord({ ...overrides, title: text });
}

function renderFamily(family: ArtifactFamily, context: ArtifactContext, texts: string[] = []) {
	const shared = { ...basePageData, title: family.name };
	if (family.name === 'document') {
		const data = (ctx: ArtifactContext, values: string[]): PersonnelDocumentsPageData => ({
			...shared,
			...ctx,
			records: values.map((title) =>
				makeDocument({ id: `document-${ctx.personnelId}-${title}`, personnelId: ctx.personnelId, title })
			)
		});
		const view = render(FilesPage, { props: { data: filesPage({ documents: data(context, texts) }) } });
		return {
			rerender: (ctx: ArtifactContext, values: string[]) =>
				view.rerender({ data: filesPage({ documents: data(ctx, values) }) })
		};
	}
	const data = (ctx: ArtifactContext, values: string[]): PersonnelCounselingsPageData => ({
		...shared,
		...ctx,
		records: values.map((title) =>
			makeCounselingRecord({ id: `counseling-${ctx.personnelId}-${title}`, personnelId: ctx.personnelId, title })
		)
	});
	const view = render(FilesPage, { props: { data: filesPage({ counselings: data(context, texts) }) } });
	return {
		rerender: (ctx: ArtifactContext, values: string[]) =>
			view.rerender({ data: filesPage({ counselings: data(ctx, values) }) })
	};
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
	await fireEvent.click(within(form).getByRole('button', { name: /^(Upload|Upload PDF)$/ }));
}

async function settleResponse(pending: ReturnType<typeof deferredResponse>, response: Response) {
	const receipt = response.clone();
	await act(async () => {
		pending.resolve(response);
		await pending.promise;
		await receipt.text();
	});
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
		it('keeps the entered draft and file and reports the save failure after a rejected save', async () => {
			fetchMock.mockResolvedValueOnce(new Response('', { status: 500 }));
			renderFamily(family, basePageData);
			await fillArtifact(family, 'Rejected draft');
			await submitArtifact(family);

			expect((await screen.findByRole('alert')).textContent).toBe(family.saveFailure);
			expect((screen.getByLabelText(family.field) as HTMLInputElement).value).toBe('Rejected draft');
			if (family.fileField)
				expect((screen.getByLabelText(family.fileField) as HTMLInputElement).files?.[0]?.name).toBe(
					'Rejected draft.pdf'
				);
			expect(screen.queryByText('Rejected draft', { selector: 'h3, p' })).toBeNull();
		});

		it('ties the missing-field message to the control that needs input', async () => {
			renderFamily(family, basePageData);
			await fireEvent.submit(screen.getByLabelText(family.field).closest('form') as HTMLFormElement);

			const control = screen.getByLabelText(family.missing.control);
			expect(control.getAttribute('aria-invalid')).toBe('true');
			const messageId = control.getAttribute('aria-describedby');
			expect(document.getElementById(messageId ?? '')?.textContent).toBe(family.missing.message);
			expect(fetchMock).not.toHaveBeenCalled();
			expect(screen.queryByRole('alert', { name: /unable/i })).toBeNull();
			const otherControl = screen.getByLabelText(family.field);
			if (otherControl !== control) expect(otherControl.getAttribute('aria-invalid')).toBeNull();
		});

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

	it.each([
		{ family: artifactFamilies[0], message: 'Enter a document title.' },
		{ family: artifactFamilies[1], message: 'Enter a counseling title.' }
	])('ties a missing $family.name title to the title field once a file is chosen', async ({ family, message }) => {
		renderFamily(family, basePageData);
		await selectArtifactFile(family.fileField, 'orders.pdf');
		await fireEvent.input(screen.getByLabelText(family.field), { target: { value: '' } });
		await submitArtifact(family);

		const title = screen.getByLabelText(family.field);
		expect(title.getAttribute('aria-invalid')).toBe('true');
		expect(document.getElementById(title.getAttribute('aria-describedby') ?? '')?.textContent).toBe(message);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('keeps a same-Person document draft and file through refreshed page data', async () => {
		const family = artifactFamilies[0];
		const view = renderFamily(family, basePageData, ['Earlier document']);
		await fillArtifact(family, 'Still editing');
		await view.rerender(basePageData, ['Refreshed document']);
		expect(screen.getByText('Refreshed document')).toBeTruthy();
		expect((screen.getByLabelText('Document title') as HTMLInputElement).value).toBe('Still editing');
		expect((screen.getByLabelText('Document file') as HTMLInputElement).files?.[0]?.name).toBe('Still editing.pdf');
	});

	it('does not open the previous Person document after its delayed download response', async () => {
		const pending = deferredResponse();
		const open = vi.spyOn(window, 'open').mockImplementation(() => null);
		fetchMock
			.mockReturnValueOnce(pending.promise)
			.mockResolvedValueOnce(jsonResponse({ url: 'https://example.invalid/b.pdf' }));
		const view = renderFamily(artifactFamilies[0], basePageData, ['A document']);
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
});
