// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
	PersonnelCounselingRecord,
	PersonnelCounselingsRead,
	PersonnelDocument,
	PersonnelDocumentsRead
} from '../contracts';
import PersonnelFilesPageView from './PersonnelFilesPageView.svelte';

const navigation = vi.hoisted(() => ({
	afterNavigate: [] as Array<(navigation: { to: { url: URL } | null }) => void>,
	invalidate: vi.fn(async (..._keys: unknown[]) => {}),
	replaceState: vi.fn()
}));

vi.mock('$app/state', () => ({
	page: { state: {}, params: { orgId: 'org-1', personnelSlug: 'rivera-monica' } }
}));
vi.mock('$app/navigation', () => ({
	afterNavigate: (callback: (typeof navigation.afterNavigate)[number]) => navigation.afterNavigate.push(callback),
	invalidate: navigation.invalidate,
	replaceState: navigation.replaceState
}));

const asOf = '2026-10-19';
const MB = 1024 * 1024;
const FILES_KEY = 'app:personnel-detail-files';
const COUNTS_KEY = 'app:personnel-detail-counts';

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
	fetchMock = vi.fn();
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	navigation.afterNavigate.length = 0;
	navigation.invalidate.mockClear();
	navigation.replaceState.mockClear();
	window.history.replaceState({}, '', '/');
});

function makeCounseling(id: string, dateConducted: string, overrides: Partial<PersonnelCounselingRecord> = {}) {
	return {
		id,
		personnelId: 'person-1',
		dateConducted,
		title: `Counseling ${id}`,
		status: 'uploaded',
		conductedBy: null,
		uploadedBy: 'SSG Miller',
		fileName: `${id}.pdf`,
		createdAt: `${dateConducted}T15:00:00.000Z`,
		archivedAt: null,
		...overrides
	} satisfies PersonnelCounselingRecord;
}

function makeDocument(id: string, overrides: Partial<PersonnelDocument> = {}) {
	return {
		id,
		personnelId: 'person-1',
		title: `Document ${id}`,
		fileName: `${id}.pdf`,
		fileSizeBytes: 1.2 * MB,
		contentType: 'application/pdf',
		uploadedBy: 'Alvarez',
		createdAt: '2026-04-02T15:00:00.000Z',
		archivedAt: null,
		...overrides
	} satisfies PersonnelDocument;
}

function counselingsRead(overrides: Partial<PersonnelCounselingsRead> = {}): PersonnelCounselingsRead {
	return {
		records: [
			makeCounseling('c1', '2026-10-02'),
			makeCounseling('c2', '2026-08-14'),
			makeCounseling('c3', '2026-06-01')
		],
		total: 5,
		uploaderLabel: 'SSG Miller',
		coveredMonths: ['2026-10', '2026-08', '2026-06', '2025-12'],
		lastConductedOn: '2026-10-02',
		...overrides
	};
}

function documentsRead(overrides: Partial<PersonnelDocumentsRead> = {}): PersonnelDocumentsRead {
	return {
		records: [makeDocument('d1'), makeDocument('d2')],
		total: 4,
		usedBytes: 3 * MB,
		capBytes: 25 * MB,
		...overrides
	};
}

function files(
	counselings: Promise<PersonnelCounselingsRead> = Promise.resolve(counselingsRead()),
	documents: Promise<PersonnelDocumentsRead> = Promise.resolve(documentsRead())
) {
	return { counselings, documents };
}

function mount(props: Partial<{ files: ReturnType<typeof files>; canManage: boolean; personnelId: string }> = {}) {
	const view = render(PersonnelFilesPageView, {
		props: { orgId: 'org-1', personnelId: 'person-1', asOf, files: files(), canManage: true, ...props }
	});
	return view;
}

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

async function offer(file: File) {
	const input = dropzoneInput();
	await fireEvent.change(input, { target: { files: [file] } });
}

function dropzoneInput() {
	return screen.getByLabelText(/Drop files to upload/) as HTMLInputElement;
}

const pdf = () => new File(['%PDF-1.7'], 'da4856-oct.pdf', { type: 'application/pdf' });
const png = () => new File(['png'], 'range-card.png', { type: 'image/png' });

function oversize() {
	const file = new File(['x'], 'big.pdf', { type: 'application/pdf' });
	Object.defineProperty(file, 'size', { value: 11 * MB });
	return file;
}

describe('Files tab', () => {
	it('shows skeletons while the reads are pending and the settled records after', async () => {
		const counselings = deferred<PersonnelCounselingsRead>();
		const documents = deferred<PersonnelDocumentsRead>();
		mount({ files: files(counselings.promise, documents.promise) });

		expect(
			screen.getAllByLabelText(/^(Counselings|Documents)$/).every((s) => s.getAttribute('aria-busy') === 'true')
		).toBe(true);

		await act(async () => {
			counselings.resolve(counselingsRead());
			documents.resolve(documentsRead());
		});

		expect(await screen.findByRole('heading', { name: 'Last counseled 17 days ago' })).toBeTruthy();
		expect(screen.getByRole('heading', { name: '4 documents' })).toBeTruthy();
		expect(screen.getByText('3 of 25 MB')).toBeTruthy();
		expect(screen.queryByLabelText('Counselings')).toBeNull();
	});

	it('names the months without a counseling beside the coverage bar', async () => {
		mount();

		expect(
			await screen.findByText(/4 of the last 12 months have a counseling on record\. Gaps in .*Nov.*Jan.*/)
		).toBeTruthy();
		expect(screen.getByRole('list', { name: 'Counseling coverage, last 12 months' })).toBeTruthy();
	});

	it('says what is on a counseling row and which of two attributions applies', async () => {
		mount({
			files: files(
				Promise.resolve(
					counselingsRead({
						records: [
							makeCounseling('c1', '2026-10-02', {
								title: 'October counseling',
								summary: 'Reviewed board prep.',
								conductedBy: 'SFC Jones',
								createdAt: '2026-10-03T15:00:00.000Z'
							}),
							makeCounseling('c2', '2026-08-14', { uploadedBy: 'SSG Miller' })
						]
					})
				)
			)
		});

		const first = (await screen.findByText('October counseling')).closest('article') as HTMLElement;
		expect(within(first).getByText('Reviewed board prep.')).toBeTruthy();
		expect(within(first).getByText('Conducted by SFC Jones · uploaded 3 Oct')).toBeTruthy();
		const second = screen.getByText('Counseling c2').closest('article') as HTMLElement;
		expect(within(second).getByText('Uploaded by SSG Miller')).toBeTruthy();
	});

	it('offers no PDF to open on a counseling that has no stored file', async () => {
		mount({
			files: files(
				Promise.resolve(
					counselingsRead({
						records: [makeCounseling('c1', '2026-10-02', { title: 'Legacy counseling', status: 'needs-title' })]
					})
				)
			)
		});

		const row = (await screen.findByText('Legacy counseling')).closest('article') as HTMLElement;

		expect(within(row).getByText('No file')).toBeTruthy();
		expect(within(row).queryByRole('button', { name: /PDF/ })).toBeNull();
	});

	it('counts the last counseling from the read, not from the rows on the page', async () => {
		mount({
			files: files(
				Promise.resolve(
					counselingsRead({
						records: [
							makeCounseling('c1', '2026-12-03'),
							makeCounseling('c2', '2026-12-02'),
							makeCounseling('c3', '2026-12-01')
						],
						lastConductedOn: '2026-10-09'
					})
				)
			)
		});

		expect(await screen.findByRole('heading', { name: 'Last counseled 10 days ago' })).toBeTruthy();
	});

	it('says no counseling is on record when none has been held yet', async () => {
		mount({
			files: files(
				Promise.resolve(
					counselingsRead({ records: [makeCounseling('c1', '2026-12-01')], total: 1, lastConductedOn: null })
				)
			)
		});

		expect(await screen.findByRole('heading', { name: 'No counseling on record' })).toBeTruthy();
	});

	it('keeps the other section when one read fails', async () => {
		mount({ files: files(Promise.reject(new Error('down')), Promise.resolve(documentsRead())) });

		expect(await screen.findByText(/Couldn't load counselings/)).toBeTruthy();
		expect(screen.getByRole('heading', { name: '4 documents' })).toBeTruthy();
	});

	it('keeps showing the last records while a refreshed read settles', async () => {
		const view = mount();
		await screen.findByText('Counseling c1');
		const next = deferred<PersonnelCounselingsRead>();

		await view.rerender({ files: files(next.promise, Promise.resolve(documentsRead())) });

		expect(screen.getByText('Counseling c1')).toBeTruthy();
		expect(screen.queryByLabelText('Counselings')).toBeNull();
		await act(async () => next.resolve(counselingsRead({ records: [makeCounseling('c9', '2026-10-10')], total: 1 })));
		expect(await screen.findByText('Counseling c9')).toBeTruthy();
		expect(screen.queryByText('Counseling c1')).toBeNull();
	});

	it('opens a counseling PDF from a fresh signed link', async () => {
		const open = vi.spyOn(window, 'open').mockImplementation(() => null);
		fetchMock.mockResolvedValueOnce(json({ url: 'https://files.invalid/c1.pdf' }));
		mount();

		await fireEvent.click(await screen.findByRole('button', { name: 'Open Counseling c1 PDF' }));

		await waitFor(() =>
			expect(open).toHaveBeenCalledWith('https://files.invalid/c1.pdf', '_blank', 'noopener,noreferrer')
		);
		expect(fetchMock).toHaveBeenCalledWith('/org/org-1/api/personnel/person-1/counseling-records/c1/download');
	});

	it('does not open a document after the Person was switched away', async () => {
		const open = vi.spyOn(window, 'open').mockImplementation(() => null);
		const pending = deferred<Response>();
		fetchMock.mockReturnValueOnce(pending.promise);
		const view = mount();
		await fireEvent.click(await screen.findByRole('button', { name: 'Open Document d1' }));

		await view.rerender({ personnelId: 'person-2', files: files() });
		await act(async () => pending.resolve(json({ url: 'https://files.invalid/d1.pdf' })));

		expect(open).not.toHaveBeenCalled();
	});

	it('pages older counselings in from the rows already shown', async () => {
		fetchMock.mockResolvedValueOnce(
			json([makeCounseling('c4', '2025-12-20', { title: 'December counseling' }), makeCounseling('c5', '2025-01-05')])
		);
		mount();

		await fireEvent.click(await screen.findByRole('button', { name: 'Show 2 older counselings' }));

		expect(await screen.findByText('December counseling')).toBeTruthy();
		expect(fetchMock).toHaveBeenCalledWith('/org/org-1/api/personnel/person-1/counseling-records?offset=3', undefined);
		expect(screen.queryByRole('button', { name: /older counseling/ })).toBeNull();
	});

	it('drops a page that arrives after the Person changed', async () => {
		const pending = deferred<Response>();
		fetchMock.mockReturnValueOnce(pending.promise);
		const view = mount();
		await fireEvent.click(await screen.findByRole('button', { name: 'Show 2 older counselings' }));

		await view.rerender({
			personnelId: 'person-2',
			files: files(
				Promise.resolve(counselingsRead({ records: [makeCounseling('n1', '2026-10-05')], total: 1 })),
				Promise.resolve(documentsRead())
			)
		});
		await act(async () =>
			pending.resolve(json([makeCounseling('c4', '2025-12-20', { title: 'December counseling' })]))
		);

		expect(await screen.findByText('Counseling n1')).toBeTruthy();
		expect(screen.queryByText('December counseling')).toBeNull();
	});

	it('does not repeat a row when another writer shifted the list before the next page', async () => {
		fetchMock.mockResolvedValueOnce(
			json([makeCounseling('c3', '2026-06-01'), makeCounseling('c4', '2025-12-20', { title: 'December counseling' })])
		);
		mount();

		await fireEvent.click(await screen.findByRole('button', { name: 'Show 2 older counselings' }));

		expect(await screen.findByText('December counseling')).toBeTruthy();
		expect(screen.getAllByText('Counseling c3')).toHaveLength(1);
	});

	it('pages more documents in and counts what is left', async () => {
		fetchMock.mockResolvedValueOnce(json([makeDocument('d3'), makeDocument('d4')]));
		mount();

		await fireEvent.click(await screen.findByRole('button', { name: 'Show 2 more' }));

		expect(await screen.findByText('Document d4')).toBeTruthy();
		expect(fetchMock).toHaveBeenCalledWith('/org/org-1/api/personnel/person-1/documents?offset=2', undefined);
	});

	it('archives a counseling and refreshes only the Files reads and the tab counts', async () => {
		fetchMock.mockResolvedValueOnce(json({}));
		mount();

		await fireEvent.click(await screen.findByRole('button', { name: 'Archive Counseling c1' }));

		await waitFor(() => expect(navigation.invalidate).toHaveBeenCalledWith(FILES_KEY));
		expect(navigation.invalidate).toHaveBeenCalledWith(COUNTS_KEY);
		expect(navigation.invalidate).toHaveBeenCalledTimes(2);
		expect(fetchMock).toHaveBeenCalledWith('/org/org-1/api/personnel/person-1/counseling-records/c1', {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ action: 'archive' })
		});
	});

	it('refreshes nothing when an archive response arrives after leaving Files', async () => {
		const pending = deferred<Response>();
		fetchMock.mockReturnValueOnce(pending.promise);
		const view = mount();
		await fireEvent.click(await screen.findByRole('button', { name: 'Archive Counseling c1' }));
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

		view.unmount();
		await act(async () => {
			pending.resolve(json({}));
			await pending.promise;
		});

		expect(navigation.invalidate).not.toHaveBeenCalled();
	});

	it('keeps the row and says so when archiving fails', async () => {
		fetchMock.mockResolvedValueOnce(json({}, 500));
		mount();

		await fireEvent.click(await screen.findByRole('button', { name: 'Archive Document d1' }));

		expect(await screen.findByRole('alert')).toBeTruthy();
		expect(screen.getByText('Document d1')).toBeTruthy();
		expect(navigation.invalidate).not.toHaveBeenCalled();
	});

	it('offers neither upload nor archive without permission to manage records', async () => {
		mount({ canManage: false });

		await screen.findByText('Counseling c1');
		expect(screen.queryByLabelText(/Drop files to upload/)).toBeNull();
		expect(screen.queryByRole('button', { name: /^Archive / })).toBeNull();
	});
});

describe('Files tab upload flow', () => {
	it.each([
		{
			name: 'a wrong type',
			file: () => new File(['x'], 'notes.txt', { type: 'text/plain' }),
			message: /notes\.txt isn't a PDF/
		},
		{ name: 'an oversize file', file: oversize, message: /big\.pdf is over the 10 MB limit\./ }
	])('rejects $name beside the dropzone before anything uploads', async ({ file, message }) => {
		mount();
		await screen.findByText('Counseling c1');

		await offer(file());

		expect((await screen.findByRole('alert')).textContent).toMatch(message);
		expect(screen.queryByRole('dialog')).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('takes one file at a time', async () => {
		mount();
		await screen.findByText('Counseling c1');

		await fireEvent.change(dropzoneInput(), { target: { files: [pdf(), png()] } });

		expect((await screen.findByRole('alert')).textContent).toMatch(/one file/i);
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('uploads a dropped PDF as a counseling that defaults to the uploader as conductor', async () => {
		fetchMock.mockResolvedValueOnce(json(makeCounseling('c9', '2026-10-19')));
		mount();
		await screen.findByText('Counseling c1');

		await offer(pdf());
		const dialog = await screen.findByRole('dialog');
		await fireEvent.click(within(dialog).getByRole('radio', { name: 'Counseling' }));
		await fireEvent.input(within(dialog).getByLabelText('Title'), { target: { value: 'October counseling' } });
		expect((within(dialog).getByLabelText('Conducted by') as HTMLInputElement).value).toBe('SSG Miller');
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Upload' }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
		const body = request.body as FormData;
		expect(url).toBe('/org/org-1/api/personnel/person-1/counseling-records');
		expect(request.method).toBe('POST');
		expect(body.get('title')).toBe('October counseling');
		expect(body.get('conductedBy')).toBe('SSG Miller');
		expect((body.get('file') as File).name).toBe('da4856-oct.pdf');
		await waitFor(() => expect(navigation.invalidate).toHaveBeenCalledWith(FILES_KEY));
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
	});

	async function openCounselingFlowBeforeUploaderIsKnown() {
		const settled = deferred<PersonnelCounselingsRead>();
		mount({ files: files(settled.promise) });
		await act(async () =>
			navigation.afterNavigate[0]({ to: { url: new URL('http://localhost/files?add=counseling') } })
		);
		const dialog = await screen.findByRole('dialog');
		await fireEvent.change(within(dialog).getByLabelText('File'), { target: { files: [pdf()] } });
		const conductedBy = () => within(dialog).getByLabelText('Conducted by') as HTMLInputElement;
		return { settled, conductedBy };
	}

	it('fills the conductor with the uploader once the uploader is known', async () => {
		const { settled, conductedBy } = await openCounselingFlowBeforeUploaderIsKnown();
		expect(conductedBy().value).toBe('');

		await act(async () => settled.resolve(counselingsRead()));

		await waitFor(() => expect(conductedBy().value).toBe('SSG Miller'));
	});

	it('keeps the conductor the user typed when the uploader becomes known afterwards', async () => {
		const { settled, conductedBy } = await openCounselingFlowBeforeUploaderIsKnown();
		await fireEvent.input(conductedBy(), { target: { value: 'SFC Jones' } });

		await act(async () => settled.resolve(counselingsRead()));

		await waitFor(() => expect(screen.getByRole('heading', { name: 'Last counseled 17 days ago' })).toBeTruthy());
		expect(conductedBy().value).toBe('SFC Jones');
	});

	it('forgets the earlier file when a replacement is refused', async () => {
		mount();
		await screen.findByText('Counseling c1');
		await offer(pdf());
		const dialog = await screen.findByRole('dialog');
		await fireEvent.click(within(dialog).getByRole('radio', { name: 'Counseling' }));
		await fireEvent.input(within(dialog).getByLabelText('Title'), { target: { value: 'October counseling' } });

		await fireEvent.change(within(dialog).getByLabelText('File'), { target: { files: [oversize()] } });

		expect(within(dialog).getByText(/big\.pdf is over the 10 MB limit/)).toBeTruthy();
		expect(within(dialog).queryByText('da4856-oct.pdf')).toBeNull();
		expect((within(dialog).getByRole('button', { name: 'Upload' }) as HTMLButtonElement).disabled).toBe(true);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('uploads a dropped image as a document titled from its file name', async () => {
		fetchMock.mockResolvedValueOnce(json(makeDocument('d9')));
		mount();
		await screen.findByText('Counseling c1');

		await offer(png());
		const dialog = await screen.findByRole('dialog');

		expect(within(dialog).getByRole('radio', { name: 'Counseling' }).hasAttribute('disabled')).toBe(true);
		expect((within(dialog).getByLabelText('Title') as HTMLInputElement).value).toBe('range card');
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Upload' }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('/org/org-1/api/personnel/person-1/documents');
		expect((request.body as FormData).get('title')).toBe('range card');
		await waitFor(() => expect(navigation.invalidate).toHaveBeenCalledWith(FILES_KEY));
	});

	it('keeps the dialog and the typed title when the upload fails', async () => {
		fetchMock.mockResolvedValueOnce(json({}, 500));
		mount();
		await screen.findByText('Counseling c1');
		await offer(png());
		const dialog = await screen.findByRole('dialog');

		await fireEvent.click(within(dialog).getByRole('button', { name: 'Upload' }));

		expect(await within(dialog).findByRole('alert')).toBeTruthy();
		expect((within(dialog).getByLabelText('Title') as HTMLInputElement).value).toBe('range card');
		expect(navigation.invalidate).not.toHaveBeenCalledWith(FILES_KEY);
	});

	it('keeps every counseling entry and the file after a failed upload so the same draft can be retried', async () => {
		fetchMock.mockResolvedValueOnce(json({}, 500));
		mount();
		await screen.findByText('Counseling c1');
		await offer(pdf());
		const dialog = await screen.findByRole('dialog');
		await fireEvent.click(within(dialog).getByRole('radio', { name: 'Counseling' }));
		await fireEvent.input(within(dialog).getByLabelText('Title'), { target: { value: 'October counseling' } });
		await fireEvent.input(within(dialog).getByLabelText('Summary'), { target: { value: 'Reviewed board prep.' } });
		await fireEvent.input(within(dialog).getByLabelText('Conducted by'), { target: { value: 'SFC Jones' } });

		await fireEvent.click(within(dialog).getByRole('button', { name: 'Upload' }));

		expect(await within(dialog).findByRole('alert')).toBeTruthy();
		expect((within(dialog).getByLabelText('Title') as HTMLInputElement).value).toBe('October counseling');
		expect((within(dialog).getByLabelText('Summary') as HTMLTextAreaElement).value).toBe('Reviewed board prep.');
		expect((within(dialog).getByLabelText('Conducted by') as HTMLInputElement).value).toBe('SFC Jones');
		expect(within(dialog).getByText('da4856-oct.pdf')).toBeTruthy();

		fetchMock.mockResolvedValueOnce(json(makeCounseling('c9', '2026-10-19')));
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Upload' }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
		const retry = (fetchMock.mock.calls[1] as [string, RequestInit])[1].body as FormData;
		expect([retry.get('title'), retry.get('summary'), retry.get('conductedBy')]).toEqual([
			'October counseling',
			'Reviewed board prep.',
			'SFC Jones'
		]);
		expect((retry.get('file') as File).name).toBe('da4856-oct.pdf');
	});

	it.each([
		{ name: 'counseling', file: pdf, radio: 'Counseling' },
		{ name: 'document', file: png, radio: 'Document' }
	])('ties a missing $name title to the title field and uploads nothing', async ({ file, radio }) => {
		mount();
		await screen.findByText('Counseling c1');
		await offer(file());
		const dialog = await screen.findByRole('dialog');
		const choice = within(dialog).getByRole('radio', { name: radio });
		if (choice.getAttribute('aria-checked') !== 'true') await fireEvent.click(choice);
		await fireEvent.input(within(dialog).getByLabelText('Title'), { target: { value: '' } });

		await fireEvent.click(within(dialog).getByRole('button', { name: 'Upload' }));

		const title = within(dialog).getByLabelText('Title');
		expect(title.getAttribute('aria-invalid')).toBe('true');
		const message = document.getElementById(title.getAttribute('aria-describedby') ?? '');
		expect(message?.textContent).toMatch(/title/i);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('keeps the open upload form and what was typed when the page data refreshes', async () => {
		const view = mount();
		await screen.findByText('Counseling c1');
		await offer(png());
		const dialog = await screen.findByRole('dialog');
		await fireEvent.input(within(dialog).getByLabelText('Title'), { target: { value: 'Still editing' } });

		await view.rerender({ files: files() });
		await screen.findByText('Counseling c1');

		expect((within(await screen.findByRole('dialog')).getByLabelText('Title') as HTMLInputElement).value).toBe(
			'Still editing'
		);
		expect(screen.getByText('range-card.png')).toBeTruthy();
	});

	it('refreshes nothing when an upload response arrives after leaving Files', async () => {
		const pending = deferred<Response>();
		fetchMock.mockReturnValueOnce(pending.promise);
		const view = mount();
		await screen.findByText('Counseling c1');
		await offer(png());
		const dialog = await screen.findByRole('dialog');
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Upload' }));
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

		view.unmount();
		await act(async () => {
			pending.resolve(json(makeDocument('d9')));
			await pending.promise;
		});

		expect(navigation.invalidate).not.toHaveBeenCalled();
	});

	it.each([
		{ add: 'counseling', radio: 'Counseling' },
		{ add: 'document', radio: 'Document' }
	])('opens the flow with $radio chosen and the picker focused for ?add=$add', async ({ add, radio }) => {
		mount();
		await screen.findByText('Counseling c1');

		await act(async () => navigation.afterNavigate[0]({ to: { url: new URL(`http://localhost/files?add=${add}`) } }));

		const dialog = await screen.findByRole('dialog');
		expect(within(dialog).getByRole('radio', { name: radio }).getAttribute('aria-checked')).toBe('true');
		await waitFor(() =>
			expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Choose a file' }))
		);
	});

	it('ignores ?add= without permission to manage records', async () => {
		mount({ canManage: false });
		await screen.findByText('Counseling c1');

		await act(async () => navigation.afterNavigate[0]({ to: { url: new URL('http://localhost/files?add=document') } }));

		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('drops only the add intent from the address when the flow is cancelled', async () => {
		window.history.replaceState({}, '', '/org/org-1/personnel/rivera/files?add=document&tab=x');
		mount();
		await screen.findByText('Counseling c1');
		await act(async () => navigation.afterNavigate[0]({ to: { url: new URL(window.location.href) } }));

		await fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }));

		expect(navigation.replaceState).toHaveBeenCalledWith('/org/org-1/personnel/rivera-monica/files?tab=x', {});
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
	});
});
