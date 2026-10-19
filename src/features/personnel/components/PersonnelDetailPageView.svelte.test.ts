// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
	PersonnelFollowUp,
	PersonnelDocument,
	PersonnelCounselingRecord,
	PersonnelLeaderNote
} from '$features/personnel/contracts';
import type { PersonnelDetailStreams } from '$features/personnel/personnel-detail.types';
import type { Personnel } from '../personnel.types';

const { gotoMock, invalidateMock } = vi.hoisted(() => ({
	gotoMock: vi.fn(),
	invalidateMock: vi.fn()
}));

vi.mock('$app/navigation', () => ({
	goto: gotoMock,
	invalidate: invalidateMock
}));

import PersonnelDetailPageView from './PersonnelDetailPageView.svelte';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	gotoMock.mockReset();
	invalidateMock.mockReset();
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
		expect(screen.queryByText('Duty Roster')).toBeNull();
		expect(screen.getByText('HIPAA expired 4d ago. Cyber Awareness 6d left.')).toBeTruthy();
		expect(screen.queryByText('No active leave, pass, quarters, TDY, or other duty conflict today.')).toBeNull();
	});

	it('renders settled siblings while one readiness lane remains pending', async () => {
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
		expect(await screen.findByText('2 due')).toBeTruthy();
		expect(await screen.findByText('50%')).toBeTruthy();
		expect(await screen.findByText('Aligned')).toBeTruthy();
	});

	it('keeps settled sibling lanes visible when another lane rejects', async () => {
		let rejectLane!: (error: Error) => void;
		const availability = new Promise<never>((_resolve, reject) => {
			rejectLane = reject;
		});
		render(PersonnelDetailPageView, {
			props: {
				orgId: 'org-1',
				person,
				orgName: 'Test Org',
				detail: makeDetail({ readinessLanes: { ...makeDetail().readinessLanes, availability } })
			}
		});
		expect(await screen.findByText('2 due')).toBeTruthy();
		rejectLane(new Error('Calendar unavailable'));
		expect(await screen.findByText('Unavailable')).toBeTruthy();
		expect(screen.getByText('2 due')).toBeTruthy();
		expect(screen.getByText('50%')).toBeTruthy();
		expect(screen.getByText('Aligned')).toBeTruthy();
		expect(screen.getByText('Action needed')).toBeTruthy();
		expect(screen.queryByLabelText('Availability loading')).toBeNull();
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
			screen.getAllByRole('link', { name: 'Show all' }).some((link) => link.getAttribute('href')?.endsWith('/files'))
		).toBe(true);
	});

	it('keeps the dashboard usable when one record stream fails', async () => {
		render(PersonnelDetailPageView, {
			props: {
				orgId: 'org-1',
				person,
				orgName: 'Test Org',
				detail: makeDetail({ documents: Promise.reject(new Error('documents unavailable')) })
			}
		});

		expect(await screen.findByText('Recent documents could not be loaded.')).toBeTruthy();
		expect(screen.getByText('Leader follow-ups')).toBeTruthy();
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
	});

	it('ties a missing follow-up title to its field on the dashboard', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		render(PersonnelDetailPageView, { props: dashboardProps() });

		const title = await screen.findByLabelText('Follow-up title');
		await fireEvent.submit(title.closest('form') as HTMLFormElement);

		const message = await screen.findByText('Enter a follow-up title.');
		expect(title.getAttribute('aria-invalid')).toBe('true');
		expect(title.getAttribute('aria-describedby')?.split(' ')).toContain(message.id);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

const dashboardContextChanges = [
	{ name: 'another Person', orgId: 'org-1', personId: 'person-2' },
	{ name: 'another Organization and Person', orgId: 'org-2', personId: 'person-2' }
];
const dashboardFamilies = [
	{ name: 'follow-up', key: 'followUp', field: 'Follow-up title', endpoint: 'follow-ups', fileField: null },
	{ name: 'document', key: 'document', field: 'Document title', endpoint: 'documents', fileField: 'Document file' },
	{
		name: 'counseling',
		key: 'counseling',
		field: 'Counseling title',
		endpoint: 'counseling-records',
		fileField: 'Counseling PDF'
	},
	{ name: 'note', key: 'note', field: 'New leader note', endpoint: 'leader-notes', fileField: null }
] as const;
type DashboardFamily = (typeof dashboardFamilies)[number];

function dashboardArtifacts(personnelId: string, marker: string) {
	const common = { personnelId, createdAt: '2026-06-08T10:00:00.000Z', archivedAt: null };
	return {
		followUp: {
			...common,
			id: `follow-up-${personnelId}`,
			title: `${marker} follow-up`,
			notes: '',
			dueDate: null,
			status: 'open',
			createdBy: 'Synthetic leader',
			updatedAt: common.createdAt,
			completedAt: null
		} satisfies PersonnelFollowUp,
		document: {
			...common,
			id: `document-${personnelId}`,
			title: `${marker} document`,
			fileName: 'document.pdf',
			fileSizeBytes: 1024,
			contentType: 'application/pdf',
			uploadedBy: 'Synthetic leader'
		} satisfies PersonnelDocument,
		counseling: {
			...common,
			id: `counseling-${personnelId}`,
			title: `${marker} counseling`,
			dateConducted: '2026-06-08',
			summary: 'Synthetic goals',
			status: 'uploaded',
			uploadedBy: 'Synthetic leader',
			fileName: 'counseling.pdf'
		} satisfies PersonnelCounselingRecord,
		note: {
			...common,
			id: `note-${personnelId}`,
			text: `${marker} note`,
			author: 'Synthetic leader'
		} satisfies PersonnelLeaderNote
	};
}

function dashboardDetail(personnelId: string, marker: string) {
	const rows = dashboardArtifacts(personnelId, marker);
	return makeDetail({
		followUps: Promise.resolve([rows.followUp]),
		documents: Promise.resolve([rows.document]),
		counselingRecords: Promise.resolve([rows.counseling]),
		leaderNotes: Promise.resolve([rows.note])
	});
}

function dashboardProps(orgId = 'org-1', personId = 'person-1', detail = makeDetail()) {
	return {
		orgId,
		orgName: 'Synthetic unit',
		person: { ...person, id: personId, slug: `synthetic-${personId}` },
		detail
	};
}

function dashboardDeferred() {
	let resolve!: (response: Response) => void;
	const promise = new Promise<Response>((respond) => {
		resolve = respond;
	});
	return { promise, resolve };
}

async function settleDashboardResponse(pending: ReturnType<typeof dashboardDeferred>, body: unknown) {
	const response = Response.json(body);
	const receipt = response.clone();
	await act(async () => {
		pending.resolve(response);
		await pending.promise;
		await receipt.text();
	});
}

async function fillDashboardArtifact(family: DashboardFamily, text: string) {
	const field = await screen.findByLabelText(family.field);
	if (family.fileField) {
		const input = screen.getByLabelText(family.fileField) as HTMLInputElement;
		const transfer = new DataTransfer();
		transfer.items.add(new File(['%PDF-1.4\nsynthetic'], `${text}.pdf`, { type: 'application/pdf' }));
		// Preserve the native files setter so value='' can actually clear the picker.
		input.files = transfer.files;
		await fireEvent.change(input);
		expect(input.files?.[0]?.name).toBe(`${text}.pdf`);
	}
	await fireEvent.input(field, { target: { value: text } });
}

async function submitDashboardArtifact(family: DashboardFamily) {
	const form = screen.getByLabelText(family.field).closest('form');
	if (!form) throw new Error('Dashboard artifact form not found');
	await fireEvent.click(within(form).getByRole('button', { name: /^(Add|Add note|Upload|Upload PDF)$/ }));
}

describe('Personnel Dashboard artifact context and pickers', () => {
	describe.each(dashboardFamilies)('$name', (family) => {
		it.each(dashboardContextChanges)('clears the previous draft and created rows on $name', async (next) => {
			const fetchMock = vi
				.fn()
				.mockResolvedValueOnce(Response.json(dashboardArtifacts('person-1', 'Saved A')[family.key]));
			vi.stubGlobal('fetch', fetchMock);
			const view = render(PersonnelDetailPageView, { props: dashboardProps() });
			await fillDashboardArtifact(family, `Saved A ${family.name}`);
			await submitDashboardArtifact(family);
			await screen.findByText(`Saved A ${family.name}`);
			await fillDashboardArtifact(family, 'A unsaved draft');
			await view.rerender(dashboardProps(next.orgId, next.personId, dashboardDetail(next.personId, 'Loaded B')));

			await screen.findByText('Loaded B document');
			expect.soft(screen.queryByText(`Loaded B ${family.name}`)).not.toBeNull();
			expect.soft((screen.getByLabelText(family.field) as HTMLInputElement).value).toBe('');
			expect.soft(screen.queryByText(`Saved A ${family.name}`)).toBeNull();
			if (family.fileField) {
				expect.soft((screen.getByLabelText(family.fileField) as HTMLInputElement).files?.length ?? 0).toBe(0);
				// A remounted picker can look empty while its old File remains in the draft.
				await fireEvent.input(screen.getByLabelText(family.field), { target: { value: 'B title without a file' } });
				await fireEvent.submit(screen.getByLabelText(family.field).closest('form') as HTMLFormElement);
				expect.soft(fetchMock).toHaveBeenCalledTimes(1);
			}
		});

		it('preserves the next record draft when the old create completes', async () => {
			const pending = dashboardDeferred();
			const fetchMock = vi.fn().mockReturnValueOnce(pending.promise);
			vi.stubGlobal('fetch', fetchMock);
			const view = render(PersonnelDetailPageView, { props: dashboardProps() });
			await fillDashboardArtifact(family, `Pending A ${family.name}`);
			await submitDashboardArtifact(family);
			expect(fetchMock.mock.calls[0][0]).toBe(`/org/org-1/api/personnel/person-1/${family.endpoint}`);
			await view.rerender(dashboardProps('org-2', 'person-2', dashboardDetail('person-2', 'Loaded B')));
			await fillDashboardArtifact(family, 'B unsaved draft');
			await settleDashboardResponse(pending, dashboardArtifacts('person-1', 'Pending A')[family.key]);

			expect.soft((screen.getByLabelText(family.field) as HTMLInputElement).value).toBe('B unsaved draft');
			expect.soft(screen.queryByText(`Pending A ${family.name}`)).toBeNull();
			expect.soft(screen.queryByText(`Loaded B ${family.name}`)).not.toBeNull();
			if (family.fileField)
				expect
					.soft((screen.getByLabelText(family.fileField) as HTMLInputElement).files?.[0]?.name)
					.toBe('B unsaved draft.pdf');
		});
	});

	it.each([dashboardFamilies[1], dashboardFamilies[2]])(
		'retains the $name picker on failure and clears it after successful retry',
		async (family) => {
			const fetchMock = vi
				.fn()
				.mockResolvedValueOnce(new Response(null, { status: 503 }))
				.mockResolvedValueOnce(Response.json(dashboardArtifacts('person-1', 'Retried')[family.key]));
			vi.stubGlobal('fetch', fetchMock);
			render(PersonnelDetailPageView, { props: dashboardProps() });
			await fillDashboardArtifact(family, `Retried ${family.name}`);
			await submitDashboardArtifact(family);
			const form = screen.getByLabelText(family.field).closest('form');
			if (!form) throw new Error('Dashboard artifact form not found');
			await waitFor(() =>
				expect(
					within(form)
						.getByRole('button', { name: /^(Upload|Upload PDF)$/ })
						.hasAttribute('disabled')
				).toBe(false)
			);
			expect((screen.getByLabelText(family.field) as HTMLInputElement).value).toBe(`Retried ${family.name}`);
			expect((screen.getByLabelText(family.fileField) as HTMLInputElement).files?.[0]?.name).toBe(
				`Retried ${family.name}.pdf`
			);
			await submitDashboardArtifact(family);
			await screen.findByText(`Retried ${family.name}`);
			expect((fetchMock.mock.calls[1][1].body as FormData).get('file')).toMatchObject({
				name: `Retried ${family.name}.pdf`
			});
			expect.soft((screen.getByLabelText(family.field) as HTMLInputElement).value).toBe('');
			expect.soft((screen.getByLabelText(family.fileField) as HTMLInputElement).files?.length ?? 0).toBe(0);
		}
	);

	it('preserves current drafts and submitted files when the same record streams refresh', async () => {
		const fetchMock = vi.fn((url: string, _request?: RequestInit) => {
			const family = dashboardFamilies.find((item) => url.endsWith(`/${item.endpoint}`));
			if (!family) throw new Error('Unexpected artifact request');
			return Promise.resolve(
				Response.json({ ...dashboardArtifacts('person-1', 'Submitted')[family.key], id: `created-${family.key}` })
			);
		});
		vi.stubGlobal('fetch', fetchMock);
		const view = render(PersonnelDetailPageView, {
			props: dashboardProps('org-1', 'person-1', dashboardDetail('person-1', 'Earlier'))
		});
		for (const family of dashboardFamilies) await fillDashboardArtifact(family, `Still editing ${family.name}`);
		await view.rerender(dashboardProps('org-1', 'person-1', dashboardDetail('person-1', 'Refreshed')));
		for (const family of dashboardFamilies) {
			expect(await screen.findByText(`Refreshed ${family.name}`)).toBeTruthy();
			expect((screen.getByLabelText(family.field) as HTMLInputElement).value).toBe(`Still editing ${family.name}`);
			if (family.fileField) {
				expect((screen.getByLabelText(family.fileField) as HTMLInputElement).files?.[0]?.name).toBe(
					`Still editing ${family.name}.pdf`
				);
			}
			await submitDashboardArtifact(family);
			await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(dashboardFamilies.indexOf(family) + 1));
			if (family.fileField) {
				const request = fetchMock.mock.calls.at(-1)?.[1] as RequestInit;
				expect((request.body as FormData).get('file')).toMatchObject({ name: `Still editing ${family.name}.pdf` });
			}
		}
		await view.rerender(dashboardProps('org-1', 'person-1', dashboardDetail('person-1', 'After upload')));
		for (const family of dashboardFamilies) {
			if (family.fileField) {
				const picker = (await screen.findByLabelText(family.fileField)) as HTMLInputElement;
				expect(picker.files?.length ?? 0).toBe(0);
			}
		}
	});

	it('clears a draft and saved override when only the Organization changes', async () => {
		const family = dashboardFamilies[0];
		const fetchMock = vi.fn().mockResolvedValue(Response.json(dashboardArtifacts('person-1', 'A saved').followUp));
		vi.stubGlobal('fetch', fetchMock);
		const view = render(PersonnelDetailPageView, { props: dashboardProps() });
		await fillDashboardArtifact(family, 'A saved follow-up');
		await submitDashboardArtifact(family);
		await screen.findByText('A saved follow-up');
		await fillDashboardArtifact(family, 'A unsaved draft');
		await view.rerender(dashboardProps('org-2', 'person-1', dashboardDetail('person-1', 'B')));

		expect.soft((screen.getByLabelText(family.field) as HTMLInputElement).value).toBe('');
		expect.soft(screen.queryByText('A saved follow-up')).toBeNull();
		expect.soft(screen.queryByText('B follow-up')).not.toBeNull();
	});

	it('keeps a fresh visit to A free of a failed create from its previous visit', async () => {
		const family = dashboardFamilies[0];
		const pending = dashboardDeferred();
		vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(pending.promise));
		const view = render(PersonnelDetailPageView, { props: dashboardProps() });
		await fillDashboardArtifact(family, 'A previous pending draft');
		await submitDashboardArtifact(family);
		await view.rerender(dashboardProps('org-2', 'person-2', dashboardDetail('person-2', 'B')));
		await screen.findByText('B follow-up');
		await view.rerender(dashboardProps('org-1', 'person-1', dashboardDetail('person-1', 'Fresh A')));
		await fillDashboardArtifact(family, 'A current unsaved draft');
		await act(async () => {
			pending.resolve(new Response('', { status: 503 }));
			await pending.promise;
		});

		expect.soft((screen.getByLabelText(family.field) as HTMLInputElement).value).toBe('A current unsaved draft');
		expect.soft(screen.queryByText('Unable to add follow-up.')).toBeNull();
		expect.soft(screen.queryByText('Fresh A follow-up')).not.toBeNull();
	});

	it('does not clear a new Person pending status action when the old action completes', async () => {
		const pendingA = dashboardDeferred();
		const pendingB = dashboardDeferred();
		const fetchMock = vi.fn().mockReturnValueOnce(pendingA.promise).mockReturnValueOnce(pendingB.promise);
		vi.stubGlobal('fetch', fetchMock);
		const view = render(PersonnelDetailPageView, {
			props: dashboardProps('org-1', 'person-1', dashboardDetail('person-1', 'A'))
		});
		await fireEvent.click(await screen.findByRole('button', { name: 'Complete A follow-up' }));
		await view.rerender(dashboardProps('org-1', 'person-2', dashboardDetail('person-2', 'B')));
		await fireEvent.click(await screen.findByRole('button', { name: 'Complete B follow-up' }));
		expect(screen.getByRole('button', { name: 'Complete B follow-up' }).hasAttribute('disabled')).toBe(true);
		await settleDashboardResponse(pendingA, {
			...dashboardArtifacts('person-1', 'A').followUp,
			status: 'completed',
			completedAt: '2026-06-08T10:10:00.000Z'
		});
		expect.soft(screen.getByRole('button', { name: 'Complete B follow-up' }).hasAttribute('disabled')).toBe(true);
		await settleDashboardResponse(pendingB, {
			...dashboardArtifacts('person-2', 'B').followUp,
			status: 'completed',
			completedAt: '2026-06-08T10:11:00.000Z'
		});
		expect(screen.queryByRole('button', { name: 'Complete B follow-up' })).toBeNull();
	});

	it('ignores the previous Organization document Open response and opens the current one', async () => {
		const pending = dashboardDeferred();
		const open = vi.spyOn(window, 'open').mockImplementation(() => null);
		const fetchMock = vi
			.fn()
			.mockReturnValueOnce(pending.promise)
			.mockResolvedValueOnce(Response.json({ url: 'https://example.invalid/b.pdf' }));
		vi.stubGlobal('fetch', fetchMock);
		const view = render(PersonnelDetailPageView, {
			props: dashboardProps('org-1', 'person-1', dashboardDetail('person-1', 'A'))
		});
		await fireEvent.click(await screen.findByRole('button', { name: 'Open' }));
		await view.rerender(dashboardProps('org-2', 'person-2', dashboardDetail('person-2', 'B')));
		await screen.findByText('B document');
		await settleDashboardResponse(pending, { url: 'https://example.invalid/a.pdf' });
		expect.soft(open).not.toHaveBeenCalled();
		await fireEvent.click(screen.getByRole('button', { name: 'Open' }));
		await waitFor(() =>
			expect(open).toHaveBeenCalledWith('https://example.invalid/b.pdf', '_blank', 'noopener,noreferrer')
		);
		expect(fetchMock.mock.calls[1][0]).toBe('/org/org-2/api/personnel/person-2/documents/document-person-2/download');
	});
});
