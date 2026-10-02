import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PersonnelDetailStreams, PersonnelFollowUp } from '$features/personnel/personnel-detail.types';
import type { Personnel } from '../personnel.types';
import { personnelStore } from '../stores/personnel.svelte';
import { createPersonnelDetailWorkspace } from './personnelDetailWorkspace.svelte';

afterEach(() => vi.unstubAllGlobals());

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
				value: 'Ready',
				detail: 'No current availability conflict.',
				tone: 'good'
			}),
			training: Promise.resolve({
				label: 'Training',
				value: 'Current',
				detail: 'All required training is current.',
				tone: 'good'
			}),
			criticalTasks: Promise.resolve({
				label: 'Critical Tasks',
				value: 'Current',
				detail: 'All applicable ICT tasks are current.',
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
				value: 'Stable',
				detail: 'No upcoming loss action needed.',
				tone: 'good'
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

function makeWorkspace(deps: Parameters<typeof createPersonnelDetailWorkspace>[1] = {}) {
	return createPersonnelDetailWorkspace(
		{
			orgId: 'org-1',
			requestArchiveApproval: async () => false,
			orgUrlSegment: 'org-alpha',
			person,
			orgName: 'Test Org',
			detail: makeDetail()
		},
		deps
	);
}

describe('PersonnelDetailWorkspace', () => {
	it('posts dashboard follow-ups behind the workspace interface', async () => {
		const created: PersonnelFollowUp = {
			id: 'follow-up-1',
			personnelId: 'person-1',
			title: 'Schedule packet review',
			notes: 'Bring checklist',
			dueDate: null,
			status: 'open',
			createdBy: 'leader-1',
			createdAt: '2026-05-01T10:00:00Z',
			updatedAt: '2026-05-01T10:00:00Z',
			completedAt: null
		};
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(created)
		});
		const workspace = makeWorkspace({ fetch: fetchMock as typeof fetch });

		workspace.followUps.fields.title = ' Schedule packet review ';
		workspace.followUps.fields.notes = ' Bring checklist ';

		await workspace.followUps.submit();

		expect(fetchMock).toHaveBeenCalledWith('/org/org-1/api/personnel/person-1/follow-ups', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				title: 'Schedule packet review',
				notes: 'Bring checklist',
				dueDate: null
			})
		});
		expect(workspace.followUps.fields.title).toBe('');
		expect(workspace.followUps.fields.notes).toBe('');
		expect(workspace.mergeUpdatedFollowUps([])).toEqual([created]);
	});

	it('updates dashboard follow-up status through the draft-backed collection', async () => {
		const loaded: PersonnelFollowUp = {
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
		};
		const updated: PersonnelFollowUp = {
			...loaded,
			status: 'completed',
			updatedAt: '2026-05-02T10:00:00Z',
			completedAt: '2026-05-02T10:00:00Z'
		};
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(updated)
		});
		const workspace = makeWorkspace({ fetch: fetchMock as typeof fetch });

		await workspace.setFollowUpStatus(loaded, 'completed');

		expect(fetchMock).toHaveBeenCalledWith('/org/org-1/api/personnel/person-1/follow-ups/follow-up-1', {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ status: 'completed' })
		});
		expect(workspace.followUps.items).toEqual([updated]);
		expect(workspace.mergeUpdatedFollowUps([loaded])).toEqual([updated]);
	});

	it('surfaces follow-up status update failures on the follow-up draft', async () => {
		const loaded: PersonnelFollowUp = {
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
		};
		const fetchMock = vi.fn().mockResolvedValue({ ok: false });
		const workspace = makeWorkspace({ fetch: fetchMock as typeof fetch });

		await workspace.setFollowUpStatus(loaded, 'completed');

		expect(workspace.followUps.error).toBe('Unable to update follow-up.');
		expect(workspace.followUps.items).toEqual([]);
		expect(workspace.mergeUpdatedFollowUps([loaded])).toEqual([loaded]);
	});

	it('keeps basic info save and slug navigation inside the workspace', async () => {
		const savedPerson = {
			...person,
			slug: 'rivera-jones-monica',
			rank: 'SSG',
			lastName: 'Rivera-Jones'
		};
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: () => Promise.resolve(savedPerson)
		});
		const gotoMock = vi.fn();
		const workspace = makeWorkspace({
			fetch: fetchMock as typeof fetch,
			goto: gotoMock as unknown as typeof import('$app/navigation').goto
		});

		workspace.startBasicInfoEdit();
		workspace.basicInfoRank = 'SSG';
		workspace.basicInfoLastName = 'Rivera-Jones';

		await workspace.saveBasicInfo();

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
		expect(workspace.currentPerson).toEqual(savedPerson);
		expect(gotoMock).toHaveBeenCalledWith('/org/org-alpha/personnel/rivera-jones-monica', {
			replaceState: true,
			invalidateAll: true
		});
	});

	it.each([false, true])(
		'handles an uncached detail archive requiring approval (acknowledged: %s)',
		async (accepted) => {
			personnelStore.load([], 'another-org');
			const fetchMock = vi.fn().mockResolvedValue(Response.json({ requiresApproval: true }, { status: 202 }));
			vi.stubGlobal('fetch', fetchMock);
			const requestArchiveApproval = vi.fn().mockResolvedValue(accepted);
			const goto = vi.fn();
			const invalidateAll = vi.fn();
			const workspace = createPersonnelDetailWorkspace(
				{
					orgId: 'org-1',
					orgUrlSegment: 'org-alpha',
					person,
					orgName: 'Test Org',
					detail: makeDetail(),
					requestArchiveApproval
				},
				{ goto, invalidateAll }
			);
			workspace.showArchiveConfirm = true;
			await workspace.confirmArchive();
			expect(fetchMock).toHaveBeenCalledWith('/org/org-1/api/personnel', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: 'person-1' })
			});
			expect(requestArchiveApproval).toHaveBeenCalledWith({
				orgId: 'org-1',
				personnelId: 'person-1',
				description: expect.any(String),
				resourceUrl: '/org/org-1/personnel/rivera-monica'
			});
			expect(workspace.currentPerson).toEqual(person);
			expect(personnelStore.orgId).toBe('another-org');
			expect(personnelStore.items).toEqual([]);
			expect(workspace.showArchiveConfirm).toBe(false);
			expect(workspace.archiveSubmitting).toBe(false);
			expect(goto).not.toHaveBeenCalled();
			expect(invalidateAll).not.toHaveBeenCalled();
		}
	);

	it('centralizes personnel export download behavior', async () => {
		const blob = new Blob(['records']);
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			headers: new Headers({ 'Content-Disposition': 'attachment; filename="rivera-records.xlsx"' }),
			blob: () => Promise.resolve(blob)
		});
		const downloadBlobMock = vi.fn();
		const workspace = makeWorkspace({
			fetch: fetchMock as typeof fetch,
			downloadBlob: downloadBlobMock
		});

		await workspace.exportPersonnelRecords();

		expect(fetchMock).toHaveBeenCalledWith('/org/org-1/api/personnel/person-1/export');
		expect(downloadBlobMock).toHaveBeenCalledWith(blob, 'rivera-records.xlsx');
	});
});

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((respond) => {
		resolve = respond;
	});
	return { promise, resolve };
}

describe('destroyed Personnel detail workspace effects', () => {
	it.each(['request', 'body'] as const)('does not open a document after disposal during its %s', async (stage) => {
		const request = deferred<Response>();
		const body = deferred<{ url: string }>();
		const reading = deferred<void>();
		const response = Response.json({ url: 'https://example.invalid/old-person.pdf' });
		vi.spyOn(response, 'json').mockImplementation(() => {
			reading.resolve();
			return body.promise;
		});
		const openDocumentUrl = vi.fn();
		const workspace = makeWorkspace({ fetch: vi.fn(() => request.promise), openDocumentUrl });
		const running = workspace.openDocument('document-1');
		if (stage === 'body') {
			request.resolve(response);
			await reading.promise;
		}
		workspace.dispose();
		request.resolve(response);
		body.resolve({ url: 'https://example.invalid/old-person.pdf' });
		await running;
		expect(openDocumentUrl).not.toHaveBeenCalled();
	});

	it.each(['request', 'body'] as const)('does not download an export after disposal during its %s', async (stage) => {
		const request = deferred<Response>();
		const body = deferred<Blob>();
		const reading = deferred<void>();
		const response = new Response('records', {
			headers: { 'Content-Disposition': 'attachment; filename="old-person.xlsx"' }
		});
		vi.spyOn(response, 'blob').mockImplementation(() => {
			reading.resolve();
			return body.promise;
		});
		const downloadBlob = vi.fn();
		const workspace = makeWorkspace({ fetch: vi.fn(() => request.promise), downloadBlob });
		const running = workspace.exportPersonnelRecords();
		if (stage === 'body') {
			request.resolve(response);
			await reading.promise;
		}
		workspace.dispose();
		request.resolve(response);
		body.resolve(new Blob(['records']));
		await running;
		expect(downloadBlob).not.toHaveBeenCalled();
	});

	it('does not navigate for a basic-info save whose body finishes after disposal', async () => {
		const body = deferred<Personnel>();
		const reading = deferred<void>();
		const response = Response.json(person);
		vi.spyOn(response, 'json').mockImplementation(() => {
			reading.resolve();
			return body.promise;
		});
		const goto = vi.fn();
		const workspace = makeWorkspace({ fetch: vi.fn().mockResolvedValue(response), goto });
		workspace.startBasicInfoEdit();
		workspace.basicInfoLastName = 'Rivera-Jones';
		const running = workspace.saveBasicInfo();
		await reading.promise;
		workspace.dispose();
		body.resolve({ ...person, slug: 'rivera-jones-monica', lastName: 'Rivera-Jones' });
		await running;
		expect(goto).not.toHaveBeenCalled();
	});

	it('does not invalidate or navigate when an admitted archive completes after disposal', async () => {
		const result = deferred<'archived'>();
		const archivePersonnel = vi.fn(() => result.promise);
		const invalidateAll = vi.fn();
		const goto = vi.fn();
		const workspace = makeWorkspace({ archivePersonnel, invalidateAll, goto });
		const running = workspace.confirmArchive();
		expect(archivePersonnel).toHaveBeenCalled();
		workspace.dispose();
		result.resolve('archived');
		await running;
		expect(invalidateAll).not.toHaveBeenCalled();
		expect(goto).not.toHaveBeenCalled();
	});

	it('does not navigate when an admitted archive invalidation finishes after disposal', async () => {
		const invalidation = deferred<void>();
		const invalidating = deferred<void>();
		const invalidateAll = vi.fn(() => {
			invalidating.resolve();
			return invalidation.promise;
		});
		const goto = vi.fn();
		const workspace = makeWorkspace({
			archivePersonnel: vi.fn().mockResolvedValue('archived'),
			invalidateAll,
			goto
		});
		const running = workspace.confirmArchive();
		await invalidating.promise;
		workspace.dispose();
		invalidation.resolve();
		await running;
		expect(goto).not.toHaveBeenCalled();
	});
});
