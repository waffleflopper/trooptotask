// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import PersonnelDetailPageView from './PersonnelDetailPageView.svelte';
import type { PersonnelDetailStreams } from '$features/personnel/personnel-detail.types';
import type { Personnel } from '$lib/types';

afterEach(() => {
	cleanup();
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
				roster: [person],
				orgName: 'Test Org',
				detail: makeDetail()
			}
		});

		expect(await screen.findByText('TDY')).toBeTruthy();
		expect(await screen.findByText('2 due')).toBeTruthy();
		expect(screen.getByText('HIPAA expired 4d ago. Cyber Awareness 6d left.')).toBeTruthy();
		expect(screen.queryByText('No active leave, pass, quarters, TDY, or other duty conflict today.')).toBeNull();
	});

	it('shows a per-lane skeleton while an individual readiness lane loads', () => {
		render(PersonnelDetailPageView, {
			props: {
				orgId: 'org-1',
				person,
				roster: [person],
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
});
