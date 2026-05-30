import { describe, expect, it, vi } from 'vitest';
import type { PersonnelDetailStreams, PersonnelFollowUp } from '$features/personnel/personnel-detail.types';
import type { Personnel } from '$lib/types';
import { createPersonnelDetailWorkspace } from './personnelDetailWorkspace.svelte';

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
			dutyRoster: Promise.resolve({
				label: 'Duty Roster',
				value: 'Eligible',
				detail: 'No DA6 exemption.',
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

		workspace.followUpTitle = ' Schedule packet review ';
		workspace.followUpNotes = ' Bring checklist ';

		await workspace.submitFollowUp();

		expect(fetchMock).toHaveBeenCalledWith('/org/org-1/api/personnel/person-1/follow-ups', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				title: 'Schedule packet review',
				notes: 'Bring checklist',
				dueDate: null
			})
		});
		expect(workspace.followUpTitle).toBe('');
		expect(workspace.followUpNotes).toBe('');
		expect(workspace.mergeUpdatedFollowUps([])).toEqual([created]);
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
