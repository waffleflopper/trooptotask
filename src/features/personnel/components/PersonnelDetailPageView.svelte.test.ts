// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PersonnelDetailStreams } from '$features/personnel/personnel-detail.types';
import type { Personnel } from '$lib/types';

const { gotoMock, invalidateAllMock } = vi.hoisted(() => ({
	gotoMock: vi.fn(),
	invalidateAllMock: vi.fn()
}));

vi.mock('$app/navigation', () => ({
	goto: gotoMock,
	invalidateAll: invalidateAllMock
}));

import PersonnelDetailPageView from './PersonnelDetailPageView.svelte';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	gotoMock.mockReset();
	invalidateAllMock.mockReset();
});

const person: Personnel = {
	id: 'person-1',
	slug: 'rivera-monica',
	rank: 'SGT',
	lastName: 'Rivera',
	firstName: 'Monica',
	mos: '68W',
	clinicRole: 'Medic',
	ets: '2026-06-20',
	deros: null,
	groupId: 'group-1',
	groupName: 'Alpha',
	archivedAt: null
};

function makeDetail(overrides: Partial<PersonnelDetailStreams> = {}): PersonnelDetailStreams {
	return {
		readinessLanes: {
			availability: Promise.resolve({
				label: 'Availability',
				value: 'TDY',
				detail: 'TDY through May 15, 2026.',
				tone: 'watch'
			}),
			training: Promise.resolve({
				label: 'Training',
				value: '2 due',
				detail: 'HIPAA expired 4d ago. Cyber Awareness 6d left.',
				tone: 'bad'
			}),
			criticalTasks: Promise.resolve({
				label: 'Critical Tasks',
				value: '50%',
				detail: '1 of 2 applicable ICT tasks current. 1 task needs attention.',
				tone: 'bad'
			}),
			dutyRoster: Promise.resolve({
				label: 'Duty Roster',
				value: 'Eligible',
				detail: 'No DA6 exemption. Last duty was 11 days ago.',
				tone: 'good'
			}),
			ratingScheme: Promise.resolve({
				label: 'Rating Scheme',
				value: 'Aligned',
				detail: 'Rater and senior rater assigned.',
				tone: 'info'
			}),
			lossTracking: Promise.resolve({
				label: 'Loss Tracking',
				value: 'Action needed',
				detail: 'ETS Jun 20, 2026 is 37 days away.',
				tone: 'watch'
			})
		},
		extendedInfo: Promise.resolve(null),
		counselingRecords: Promise.resolve([]),
		documents: Promise.resolve([]),
		leaderNotes: Promise.resolve([]),
		followUps: Promise.resolve([]),
		...overrides
	};
}

describe('PersonnelDetailPageView', () => {
	it('renders readiness cards from streamed lane data instead of mock values', async () => {
		render(PersonnelDetailPageView, {
			props: {
				orgId: 'org-1',
				person,
				orgName: 'Test Org',
				detail: makeDetail()
			}
		});

		expect(await screen.findByText('TDY')).toBeTruthy();
		expect(await screen.findByText('2 due')).toBeTruthy();
		expect(screen.getByText('HIPAA expired 4d ago. Cyber Awareness 6d left.')).toBeTruthy();
		expect(screen.queryByText('No active leave, pass, quarters, TDY, or other duty conflict today.')).toBeNull();
	});

	it('exports the current personnel record from the detail page', async () => {
		const blob = new Blob(['personnel workbook'], {
			type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
		});
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			headers: new Headers({ 'Content-Disposition': 'attachment; filename="rivera-records.xlsx"' }),
			blob: () => Promise.resolve(blob)
		});
		const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:personnel-export');
		vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
		vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
		vi.stubGlobal('fetch', fetchMock);

		render(PersonnelDetailPageView, {
			props: {
				orgId: 'org-1',
				person,
				orgName: 'Test Org',
				detail: makeDetail()
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Export records' }));

		expect(fetchMock).toHaveBeenCalledWith('/org/org-1/api/personnel/person-1/export');
		await waitFor(() => expect(createObjectURL).toHaveBeenCalledWith(blob));
		const link = document.querySelector('a[download="rivera-records.xlsx"]') as HTMLAnchorElement | null;
		expect(link).toBeNull();
	});

	it('shows a per-lane skeleton while an individual readiness lane loads', () => {
		render(PersonnelDetailPageView, {
			props: {
				orgId: 'org-1',
				person,
				orgName: 'Test Org',
				detail: makeDetail({
					readinessLanes: {
						...makeDetail().readinessLanes,
						availability: new Promise(() => {})
					}
				})
			}
		});

		expect(screen.getByLabelText('Availability loading')).toBeTruthy();
	});

	it('shows recent document uploads with upload and show-all actions', async () => {
		render(PersonnelDetailPageView, {
			props: {
				orgId: 'org-1',
				person,
				orgName: 'Test Org',
				detail: makeDetail({
					documents: Promise.resolve([
						{
							id: 'document-1',
							personnelId: 'person-1',
							title: 'BLS Card',
							fileName: 'bls.pdf',
							fileSizeBytes: 2048,
							contentType: 'application/pdf',
							uploadedBy: 'test-user',
							createdAt: '2026-05-01T10:00:00Z'
						}
					])
				})
			}
		});

		expect(await screen.findByText('Recent documents')).toBeTruthy();
		expect(screen.getByText('BLS Card')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Upload' })).toBeTruthy();
		expect(
			screen
				.getAllByRole('link', { name: 'Show all' })
				.some((link) => link.getAttribute('href')?.endsWith('/documents'))
		).toBe(true);
	});

	it('completes a dashboard follow-up without reloading the page', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					id: 'follow-up-1',
					personnelId: 'person-1',
					title: 'Complete BLC packet',
					notes: '',
					dueDate: null,
					status: 'completed',
					createdBy: 'leader-1',
					createdAt: '2026-05-01T10:00:00Z',
					updatedAt: '2026-05-02T10:00:00Z',
					completedAt: '2026-05-02T10:00:00Z'
				})
		});
		vi.stubGlobal('fetch', fetchMock);

		render(PersonnelDetailPageView, {
			props: {
				orgId: 'org-1',
				person,
				orgName: 'Test Org',
				detail: makeDetail({
					followUps: Promise.resolve([
						{
							id: 'follow-up-1',
							personnelId: 'person-1',
							title: 'Complete BLC packet',
							notes: '',
							dueDate: null,
							status: 'open',
							createdBy: 'leader-1',
							createdAt: '2026-05-01T10:00:00Z',
							updatedAt: '2026-05-01T10:00:00Z',
							completedAt: null
						}
					])
				})
			}
		});

		await fireEvent.click(await screen.findByRole('button', { name: 'Complete Complete BLC packet' }));

		expect(fetchMock).toHaveBeenCalledWith('/org/org-1/api/personnel/person-1/follow-ups/follow-up-1', {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ status: 'completed' })
		});
		await waitFor(() => expect(screen.getByText('0 open')).toBeTruthy());
		expect(screen.queryByRole('button', { name: 'Reopen Complete BLC packet' })).toBeNull();
		expect(screen.getByText('No open follow-ups.')).toBeTruthy();
	});

	it('adds a dashboard follow-up without reloading the page', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					id: 'follow-up-2',
					personnelId: 'person-1',
					title: 'Schedule packet review',
					notes: 'Bring checklist',
					dueDate: '2026-06-10',
					status: 'open',
					createdBy: 'leader-1',
					createdAt: '2026-05-01T10:00:00Z',
					updatedAt: '2026-05-01T10:00:00Z',
					completedAt: null
				})
		});
		vi.stubGlobal('fetch', fetchMock);

		render(PersonnelDetailPageView, {
			props: {
				orgId: 'org-1',
				person,
				orgName: 'Test Org',
				detail: makeDetail({ followUps: Promise.resolve([]) })
			}
		});

		await fireEvent.input(await screen.findByLabelText('Follow-up title'), {
			target: { value: 'Schedule packet review' }
		});
		await fireEvent.input(screen.getByLabelText('Follow-up notes'), { target: { value: 'Bring checklist' } });
		expect(screen.getByRole('button', { name: 'Follow-up due date' })).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Add' }));

		expect(fetchMock).toHaveBeenCalledWith('/org/org-1/api/personnel/person-1/follow-ups', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				title: 'Schedule packet review',
				notes: 'Bring checklist',
				dueDate: null
			})
		});
		await waitFor(() => expect(screen.getByText('Schedule packet review')).toBeTruthy());
		expect(screen.getByText('1 open')).toBeTruthy();
	});

	it('counts all open dashboard follow-ups while rendering a short preview', async () => {
		const followUps = Array.from({ length: 7 }, (_, index) => ({
			id: `follow-up-${index + 1}`,
			personnelId: 'person-1',
			title: `Follow-up ${index + 1}`,
			notes: '',
			dueDate: null,
			status: 'open' as const,
			createdBy: 'leader-1',
			createdAt: `2026-05-0${index + 1}T10:00:00Z`,
			updatedAt: `2026-05-0${index + 1}T10:00:00Z`,
			completedAt: null
		}));

		render(PersonnelDetailPageView, {
			props: {
				orgId: 'org-1',
				person,
				orgName: 'Test Org',
				detail: makeDetail({ followUps: Promise.resolve(followUps) })
			}
		});

		expect(await screen.findByText('7 open')).toBeTruthy();
		expect(screen.getByText('Follow-up 7')).toBeTruthy();
		expect(screen.queryByText('Follow-up 2')).toBeNull();
	});

	it('saves basic personnel info from the dashboard sidebar', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					...person,
					slug: 'rivera-jones-monica',
					rank: 'SSG',
					lastName: 'Rivera-Jones',
					firstName: 'Monica'
				})
		});
		vi.stubGlobal('fetch', fetchMock);

		render(PersonnelDetailPageView, {
			props: {
				orgId: 'org-1',
				person,
				orgName: 'Test Org',
				detail: makeDetail()
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Edit basic info' }));
		await fireEvent.input(screen.getByLabelText('Rank'), { target: { value: 'SSG' } });
		await fireEvent.input(screen.getByLabelText('Last name'), { target: { value: 'Rivera-Jones' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save basic info' }));

		expect(fetchMock).toHaveBeenCalledWith('/org/org-1/api/personnel', {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				id: 'person-1',
				rank: 'SSG',
				lastName: 'Rivera-Jones',
				firstName: 'Monica',
				mos: '68W',
				clinicRole: 'Medic',
				groupId: 'group-1',
				ets: '2026-06-20',
				deros: null
			})
		});
		await waitFor(() => expect(document.title).toBe('SSG Rivera-Jones, Monica - Personnel'));
	});

	it('offers canonical Organization groups when editing basic personnel info', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: () =>
				Promise.resolve({
					...person,
					groupId: 'group-empty',
					groupName: 'Bravo'
				})
		});
		vi.stubGlobal('fetch', fetchMock);

		render(PersonnelDetailPageView, {
			props: {
				orgId: 'org-1',
				person,
				groups: [
					{ id: 'group-1', name: 'Alpha', sortOrder: 0 },
					{ id: 'group-empty', name: 'Bravo', sortOrder: 1 }
				],
				orgName: 'Test Org',
				detail: makeDetail()
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Edit basic info' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Group' }));
		await fireEvent.click(await screen.findByRole('option', { name: 'Bravo' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Save basic info' }));

		expect(fetchMock).toHaveBeenCalledWith('/org/org-1/api/personnel', {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: expect.stringContaining('"groupId":"group-empty"')
		});
	});

	it('archives the personnel record from the detail page and returns to the roster', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ success: true })
		});
		vi.stubGlobal('fetch', fetchMock);

		render(PersonnelDetailPageView, {
			props: {
				orgId: 'org-1',
				person,
				orgName: 'Test Org',
				detail: makeDetail(),
				canArchivePersonnel: true
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Archive SGT Rivera, Monica' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

		expect(fetchMock).toHaveBeenCalledWith('/org/org-1/api/personnel', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id: 'person-1' })
		});
		await waitFor(() => expect(invalidateAllMock).toHaveBeenCalled());
		expect(gotoMock).toHaveBeenCalledWith('/org/org-1/personnel');
	});

	it('shows inline errors when quick actions fail', async () => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: false });
		vi.stubGlobal('fetch', fetchMock);

		render(PersonnelDetailPageView, {
			props: {
				orgId: 'org-1',
				person,
				orgName: 'Test Org',
				detail: makeDetail({
					followUps: Promise.resolve([
						{
							id: 'follow-up-1',
							personnelId: 'person-1',
							title: 'Complete BLC packet',
							notes: '',
							dueDate: null,
							status: 'open',
							createdBy: 'leader-1',
							createdAt: '2026-05-01T10:00:00Z',
							updatedAt: '2026-05-01T10:00:00Z',
							completedAt: null
						}
					])
				})
			}
		});

		await fireEvent.click(await screen.findByRole('button', { name: 'Complete Complete BLC packet' }));
		expect(await screen.findByText('Unable to update follow-up.')).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Edit basic info' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Save basic info' }));
		expect(await screen.findByText('Unable to update basic info.')).toBeTruthy();
	});
});
