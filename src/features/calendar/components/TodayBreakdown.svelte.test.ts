// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import TodayBreakdown from './TodayBreakdown.svelte';
import type { AvailabilityEntry, StatusType, Personnel } from '$lib/types';
import { formatDate } from '$lib/utils/dates';

function person(overrides: Partial<Personnel>): Personnel {
	return {
		id: 'person-1',
		rank: 'SGT',
		lastName: 'Smith',
		firstName: 'Jane',
		mos: '68W',
		clinicRole: 'Medic',
		groupId: 'alpha',
		groupName: 'Alpha',
		...overrides
	};
}

function statusType(overrides: Partial<StatusType>): StatusType {
	return {
		id: 'leave',
		name: 'Leave',
		color: '#2563eb',
		textColor: '#ffffff',
		da6TreatmentReviewed: true,
		da6AvailabilityTreatment: 'authorized-absence',
		...overrides
	};
}

function availability(overrides: Partial<AvailabilityEntry>): AvailabilityEntry {
	return {
		id: 'availability-1',
		personnelId: 'person-1',
		statusTypeId: 'leave',
		startDate: formatDate(new Date()),
		endDate: formatDate(new Date()),
		note: null,
		...overrides
	};
}

afterEach(() => {
	cleanup();
});

describe('TodayBreakdown', () => {
	it('classifies available personnel, unavailable personnel, and multiple same-day statuses', () => {
		const today = formatDate(new Date());
		render(TodayBreakdown, {
			props: {
				personnelByGroup: [
					{
						group: 'Alpha',
						personnel: [
							person({ id: 'available', rank: 'SGT', lastName: 'Able' }),
							person({ id: 'unavailable', rank: 'SSG', lastName: 'Baker' }),
							person({ id: 'multi', rank: 'SFC', lastName: 'Clark' })
						]
					}
				],
				availabilityEntries: [
					availability({ id: 'baker-leave', personnelId: 'unavailable', statusTypeId: 'leave' }),
					availability({ id: 'clark-leave', personnelId: 'multi', statusTypeId: 'leave' }),
					availability({ id: 'clark-school', personnelId: 'multi', statusTypeId: 'school' }),
					availability({
						id: 'old-entry',
						personnelId: 'available',
						statusTypeId: 'leave',
						startDate: '2026-01-01',
						endDate: '2026-01-02'
					})
				],
				statusTypes: [
					statusType({ id: 'leave', name: 'Leave' }),
					statusType({ id: 'school', name: 'School', color: '#16a34a' })
				],
				assignmentTypes: [],
				assignments: [],
				onClose: () => {}
			}
		});

		expect(screen.getByRole('heading', { name: /Available\s+1/ })).toBeTruthy();
		expect(screen.getByRole('heading', { name: /Unavailable\s+2/ })).toBeTruthy();
		expect(screen.getByText('Total').parentElement?.textContent).toContain('3');

		const availableSection = screen.getByRole('heading', { name: /Available/ }).closest('section');
		expect(within(availableSection as HTMLElement).getByText('Able')).toBeTruthy();
		expect(within(availableSection as HTMLElement).queryByText('Baker')).toBeNull();

		const leaveGroup = screen.getByText('Leave').closest('div')?.parentElement;
		expect(within(leaveGroup as HTMLElement).getByText('Baker')).toBeTruthy();
		expect(within(leaveGroup as HTMLElement).getByText('Clark')).toBeTruthy();

		const schoolGroup = screen.getByText('School').closest('div')?.parentElement;
		expect(within(schoolGroup as HTMLElement).getByText('Clark')).toBeTruthy();
		expect(screen.queryByText(today)).toBeNull();
	});

	it('renders available personnel under the existing group order and omits empty groups', () => {
		render(TodayBreakdown, {
			props: {
				personnelByGroup: [
					{
						group: 'Bravo',
						personnel: [person({ id: 'bravo', rank: 'SPC', lastName: 'Bravo', groupId: 'bravo', groupName: 'Bravo' })]
					},
					{
						group: 'Alpha',
						personnel: [person({ id: 'alpha', rank: 'SGT', lastName: 'Alpha', groupId: 'alpha', groupName: 'Alpha' })]
					},
					{
						group: 'Charlie',
						personnel: [
							person({ id: 'charlie', rank: 'SSG', lastName: 'Charlie', groupId: 'charlie', groupName: 'Charlie' })
						]
					}
				],
				availabilityEntries: [availability({ id: 'charlie-leave', personnelId: 'charlie', statusTypeId: 'leave' })],
				statusTypes: [statusType({ id: 'leave', name: 'Leave' })],
				assignmentTypes: [],
				assignments: [],
				onClose: () => {}
			}
		});

		const availableSection = screen.getByRole('heading', { name: /Available\s+2/ }).closest('section') as HTMLElement;
		const availableText = availableSection.textContent ?? '';

		expect(availableText).toContain('Bravo');
		expect(availableText).toContain('Alpha');
		expect(availableText).not.toContain('Charlie');
		expect(availableText.indexOf('Bravo')).toBeLessThan(availableText.indexOf('Alpha'));
		expect(within(availableSection).queryByText('Charlie')).toBeNull();
	});
});
