// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type {
	PersonnelCounselingRecord,
	PersonnelCounselingsPageData,
	PersonnelDocument,
	PersonnelDocumentsPageData,
	PersonnelFollowUp,
	PersonnelFollowUpsPageData,
	PersonnelLeaderNote,
	PersonnelNotesPageData
} from '$features/personnel/personnel-detail.types';
import FollowUpsPage from './follow-ups/+page.svelte';
import DocumentsPage from './documents/+page.svelte';
import CounselingsPage from './counselings/+page.svelte';
import NotesPage from './notes/+page.svelte';

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
		date: 'Jun 8, 2026',
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
