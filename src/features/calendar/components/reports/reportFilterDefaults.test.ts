// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import type { Personnel, StatusType } from '$lib/types';
import StatusDaysSummary from './StatusDaysSummary.svelte';
import PersonnelTempo from './PersonnelTempo.svelte';
import GroupReadiness from './GroupReadiness.svelte';

afterEach(cleanup);

const personnel: Personnel[] = [
	{
		id: 'person-1',
		firstName: 'Alex',
		lastName: 'Smith',
		rank: 'SGT',
		groupId: 'group-1',
		groupName: 'Alpha',
		clinicRole: 'Medic',
		mos: '68W'
	}
];

const statusTypes: StatusType[] = [
	{ id: 'leave', name: 'Leave', color: '#48bb78', textColor: '#ffffff', da6TreatmentReviewed: true },
	{ id: 'tdy', name: 'TDY', color: '#9f7aea', textColor: '#ffffff', da6TreatmentReviewed: true }
];

const groups = [
	{ id: 'group-1', name: 'Alpha' },
	{ id: 'group-2', name: 'Bravo' }
];

describe('calendar report filter defaults', () => {
	it('selects status day status filters when status types load after render', async () => {
		const view = render(StatusDaysSummary, {
			props: { orgId: 'org-1', personnel, statusTypes: [], groups }
		});

		expect(screen.getByText('0 of 0 selected')).toBeTruthy();

		await view.rerender({ orgId: 'org-1', personnel, statusTypes, groups });

		expect(screen.getByText('2 of 2 selected')).toBeTruthy();
	});

	it('selects personnel tempo away status filters when status types load after render', async () => {
		const view = render(PersonnelTempo, {
			props: { orgId: 'org-1', personnel, statusTypes: [], groups }
		});

		expect(screen.getByText('0 of 0 selected')).toBeTruthy();

		await view.rerender({ orgId: 'org-1', personnel, statusTypes, groups });

		expect(screen.getByText('2 of 2 selected')).toBeTruthy();
	});

	it('selects group readiness groups when groups load after render', async () => {
		const view = render(GroupReadiness, {
			props: { orgId: 'org-1', personnel, statusTypes, groups: [] }
		});

		expect(screen.getByText('0 of 0 selected')).toBeTruthy();

		await view.rerender({ orgId: 'org-1', personnel, statusTypes, groups });

		expect(screen.getByText('2 of 2 selected')).toBeTruthy();
	});
});
