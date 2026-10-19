import { afterEach, describe, expect, it, vi } from 'vitest';
import { PERSONNEL_LAST_NAME_REQUIRED_MESSAGE, type PersonnelFollowUp } from '$features/personnel/contracts';
import type { PersonnelDetailStreams } from '$features/personnel/personnel-detail.types';
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

	it('lands a slug-changing save on the new URL with fresh detail data and patches the roster', async () => {
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
		const invalidate = vi.fn();
		personnelStore.load([person, { ...person, id: 'person-2', slug: 'able-sam', lastName: 'Able' }], 'org-1');
		const workspace = makeWorkspace({
			fetch: fetchMock as typeof fetch,
			goto: gotoMock as unknown as typeof import('$app/navigation').goto,
			invalidate
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
		expect(gotoMock.mock.calls).toEqual([
			[
				'/org/org-alpha/personnel/rivera-jones-monica',
				{ replaceState: true, invalidate: ['app:personnel-detail-header', 'app:personnel-detail'] }
			]
		]);
		expect(invalidate).not.toHaveBeenCalled();
		expect(personnelStore.items.map(({ id, slug, lastName }) => ({ id, slug, lastName }))).toEqual([
			{ id: 'person-1', slug: 'rivera-jones-monica', lastName: 'Rivera-Jones' },
			{ id: 'person-2', slug: 'able-sam', lastName: 'Able' }
		]);
	});

	it('shows why a basic info save was refused and keeps the edit open', async () => {
		const workspace = makeWorkspace({
			fetch: vi
				.fn()
				.mockResolvedValue(
					Response.json({ message: 'This person is no longer available.' }, { status: 404 })
				) as typeof fetch
		});
		workspace.startBasicInfoEdit();
		workspace.basicInfoRank = 'SSG';

		await workspace.saveBasicInfo();

		expect(workspace.basicInfoError).toBe('This person is no longer available.');
		expect(workspace.basicInfoNameError).toBeNull();
		expect(workspace.editingBasicInfo).toBe(true);
		expect(workspace.basicInfoRank).toBe('SSG');
	});

	it('maps a refused name to its field and keeps the generic message for a server failure', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(Response.json({ message: PERSONNEL_LAST_NAME_REQUIRED_MESSAGE }, { status: 400 }))
			.mockResolvedValueOnce(Response.json({ message: 'relation missing' }, { status: 500 }));
		const workspace = makeWorkspace({ fetch: fetchMock as typeof fetch });
		workspace.startBasicInfoEdit();

		await workspace.saveBasicInfo();
		expect(workspace.basicInfoNameError).toEqual({ field: 'lastName', message: PERSONNEL_LAST_NAME_REQUIRED_MESSAGE });
		expect(workspace.basicInfoError).toBe('');

		await workspace.saveBasicInfo();
		expect(workspace.basicInfoError).toBe('Unable to update basic info.');
		expect(workspace.editingBasicInfo).toBe(true);
	});

	it('shows why a follow-up status update was refused', async () => {
		const workspace = makeWorkspace({
			fetch: vi
				.fn()
				.mockResolvedValue(Response.json({ message: 'This follow-up was archived.' }, { status: 409 })) as typeof fetch
		});

		await workspace.setFollowUpStatus(
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
			},
			'completed'
		);

		expect(workspace.followUps.error).toBe('This follow-up was archived.');
	});

	it('clears ETS and refreshes only the detail loads without changing the personnel URL', async () => {
		const originalPerson = { ...person, ets: '2027-05-02' };
		const savedPerson = { ...originalPerson, ets: null };
		const requestBodies: unknown[] = [];
		const invalidated: string[] = [];
		const goto = vi.fn();
		const workspace = createPersonnelDetailWorkspace(
			{
				orgId: 'org-1',
				orgUrlSegment: 'org-alpha',
				person: originalPerson,
				orgName: 'Test Org',
				detail: makeDetail()
			},
			{
				fetch: async (_url, init) => {
					requestBodies.push(JSON.parse(String(init?.body)));
					return Response.json(savedPerson);
				},
				invalidate: async (key) => {
					invalidated.push(String(key));
				},
				goto
			}
		);

		workspace.startBasicInfoEdit();
		workspace.basicInfoEts = '';
		await workspace.saveBasicInfo();

		expect(requestBodies).toEqual([expect.objectContaining({ ets: null })]);
		expect(invalidated).toEqual(['app:personnel-detail-header', 'app:personnel-detail']);
		expect(goto).not.toHaveBeenCalled();
		expect(workspace.currentPerson.ets).toBeNull();
		expect(workspace.editingBasicInfo).toBe(false);
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
});
