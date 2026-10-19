import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PersonnelFollowUp } from '$features/personnel/contracts';
import type { PersonnelDetailStreams } from '$features/personnel/personnel-detail.types';
import type { Personnel } from '../personnel.types';
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
			completedAt: null,
			completedBy: null
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
			completedAt: null,
			completedBy: null
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
			completedAt: null,
			completedBy: null
		};
		const fetchMock = vi.fn().mockResolvedValue({ ok: false });
		const workspace = makeWorkspace({ fetch: fetchMock as typeof fetch });

		await workspace.setFollowUpStatus(loaded, 'completed');

		expect(workspace.followUps.error).toBe('Unable to update follow-up.');
		expect(workspace.followUps.items).toEqual([]);
		expect(workspace.mergeUpdatedFollowUps([loaded])).toEqual([loaded]);
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
				completedAt: null,
				completedBy: null
			},
			'completed'
		);

		expect(workspace.followUps.error).toBe('This follow-up was archived.');
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
});
