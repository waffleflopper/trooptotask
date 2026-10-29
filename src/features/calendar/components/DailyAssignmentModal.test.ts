// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import DailyAssignmentModal from './DailyAssignmentModal.svelte';
import type { Personnel } from '$features/personnel/contracts';
import type { AssignmentType } from '$features/calendar/contracts';

afterEach(cleanup);

describe('DailyAssignmentModal — searchable assignments', () => {
	const assignmentTypes: AssignmentType[] = [
		{
			id: 'type-1',
			name: 'Charge of Quarters',
			shortName: 'CQ',
			assignTo: 'personnel',
			color: '#2563eb',
			poolRules: null,
			weekendMode: 'same',
			excusals: [],
			showOnCalendar: false,
			sortOrder: 0
		}
	];
	const personnel: Personnel[] = [
		{
			id: 'person-1',
			firstName: 'Alex',
			lastName: 'Smith',
			rank: 'SGT',
			groupId: 'group-1',
			groupName: 'Alpha',
			clinicRole: '',
			mos: '11B'
		},
		{
			id: 'person-2',
			firstName: 'Jamie',
			lastName: 'Taylor',
			rank: 'CPT',
			groupId: 'group-1',
			groupName: 'Alpha',
			clinicRole: '',
			mos: '68W'
		}
	];

	it('filters personnel assignment options by typed text', async () => {
		const onSetAssignment = vi.fn();
		render(DailyAssignmentModal, {
			props: {
				date: new Date(2026, 3, 6),
				assignmentTypes,
				assignments: [],
				personnelByGroup: [{ group: 'Alpha', personnel }],
				groups: [],
				onSetAssignment,
				onRemoveAssignment: vi.fn(),
				onClose: vi.fn()
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Set Charge of Quarters assignee' }));
		await fireEvent.input(screen.getByPlaceholderText('Search assignments...'), {
			target: { value: 'tay' }
		});

		expect(screen.queryByRole('option', { name: 'SGT Smith, Alex - Alpha' })).toBeNull();
		await fireEvent.click(screen.getByRole('option', { name: 'CPT Taylor, Jamie - Alpha' }));

		expect(onSetAssignment).toHaveBeenCalledWith('2026-04-06', 'type-1', 'person-2');
	});

	it('omits exempt people from that duty unless they already hold it', async () => {
		const exemptType = {
			...assignmentTypes[0],
			excusals: [{ personId: 'person-1', reason: 'Excused', startsOn: '2026-01-01' }]
		};
		const props = {
			date: new Date(2026, 3, 6),
			assignmentTypes: [exemptType],
			personnelByGroup: [{ group: 'Alpha', personnel }],
			groups: [],
			onSetAssignment: vi.fn(),
			onRemoveAssignment: vi.fn(),
			onClose: vi.fn()
		};
		render(DailyAssignmentModal, { props: { ...props, assignments: [] } });

		await fireEvent.click(screen.getByRole('button', { name: 'Set Charge of Quarters assignee' }));
		expect(screen.queryByRole('option', { name: 'SGT Smith, Alex - Alpha' })).toBeNull();
		expect(screen.getByRole('option', { name: 'CPT Taylor, Jamie - Alpha' })).toBeTruthy();
		cleanup();

		render(DailyAssignmentModal, {
			props: {
				...props,
				assignments: [{ id: 'a-1', date: '2026-04-06', assignmentTypeId: 'type-1', assigneeId: 'person-1' }]
			}
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Set Charge of Quarters assignee' }));
		expect(screen.getByRole('option', { name: 'SGT Smith, Alex - Alpha' })).toBeTruthy();
	});

	it('does not offer archived assignment types as editable daily choices', () => {
		render(DailyAssignmentModal, {
			props: {
				date: new Date(2026, 3, 6),
				assignmentTypes: [
					...assignmentTypes,
					{
						id: 'type-archived',
						name: 'Archived Duty',
						shortName: 'OLD',
						assignTo: 'personnel',
						color: '#6b7280',
						poolRules: null,
						weekendMode: 'same',
						excusals: [],
						showOnCalendar: false,
						sortOrder: 0,
						archivedAt: '2026-05-04T12:00:00.000Z'
					}
				],
				assignments: [],
				personnelByGroup: [{ group: 'Alpha', personnel }],
				groups: [],
				onSetAssignment: vi.fn(),
				onRemoveAssignment: vi.fn(),
				onClose: vi.fn()
			}
		});

		expect(screen.getByRole('button', { name: 'Set Charge of Quarters assignee' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Set Archived Duty assignee' })).toBeNull();
	});
});

it('shows Group names while submitting stable Group IDs, including after a rename', async () => {
	const onSetAssignment = vi.fn();
	const props = {
		date: new Date(2026, 8, 19),
		assignmentTypes: [
			{
				id: 'group-duty',
				name: 'Group Duty',
				shortName: 'GD',
				assignTo: 'group',
				color: '#123456',
				poolRules: null,
				weekendMode: 'same',
				excusals: [],
				showOnCalendar: true,
				sortOrder: 0
			}
		] as AssignmentType[],
		assignments: [{ id: 'saved', date: '2026-09-19', assignmentTypeId: 'group-duty', assigneeId: 'group-alpha' }],
		personnelByGroup: [],
		groups: [
			{ id: 'group-alpha', name: 'Alpha Renamed', sortOrder: 0, parentId: null, depth: 1 as const },
			{ id: 'group-bravo', name: 'Bravo', sortOrder: 1, parentId: null, depth: 1 as const }
		],
		onSetAssignment,
		onRemoveAssignment: vi.fn(),
		onClose: vi.fn()
	};
	render(DailyAssignmentModal, { props });
	expect(screen.getByRole('button', { name: 'Set Group Duty group' }).textContent).toContain('Alpha Renamed');
	await fireEvent.click(screen.getByRole('button', { name: 'Set Group Duty group' }));
	await fireEvent.click(screen.getByRole('option', { name: 'Bravo' }));
	expect(onSetAssignment).toHaveBeenCalledWith('2026-09-19', 'group-duty', 'group-bravo');
});
