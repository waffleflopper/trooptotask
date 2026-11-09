// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import DailyAssignmentModal from './DailyAssignmentModal.svelte';
import type { Personnel } from '$features/personnel/contracts';
import type { AssignmentType, StatusType } from '$features/calendar/contracts';
import { indexDutyAvailability } from '$features/calendar/utils/dutyReadModel';

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
				availabilityByPerson: new Map(),
				statusTypes: [],
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
			availabilityByPerson: new Map(),
			statusTypes: [],
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
				availabilityByPerson: new Map(),
				statusTypes: [],
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
		availabilityByPerson: new Map(),
		statusTypes: [],
		onSetAssignment,
		onRemoveAssignment: vi.fn(),
		onClose: vi.fn()
	};
	render(DailyAssignmentModal, { props });
	const picker = screen.getByRole('button', { name: /^Set Group Duty group/ });
	expect(picker.textContent).toContain('Alpha Renamed');
	await fireEvent.click(picker);
	await fireEvent.click(screen.getByRole('treeitem', { name: /Bravo/ }));
	expect(onSetAssignment).toHaveBeenCalledWith('2026-09-19', 'group-duty', 'group-bravo');
});

describe('DailyAssignmentModal: choosing someone who is unavailable that day', () => {
	const type: AssignmentType = {
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
	};
	const person = (id: string, lastName: string): Personnel => ({
		id,
		firstName: 'Alex',
		lastName,
		rank: 'SGT',
		groupId: 'group-1',
		groupName: 'Alpha',
		clinicRole: '',
		mos: '11B'
	});
	const leave: StatusType = {
		id: 'leave',
		name: 'Leave',
		color: '#2563eb',
		textColor: '#ffffff',
		shortLabel: 'L',
		sortOrder: 0,
		rosterEffect: 'A',
		archivedAt: null
	};
	// Smith is on leave 5 to 7 April, Taylor on 8 April only.
	const availabilityByPerson = indexDutyAvailability([
		{ id: 'e-1', personnelId: 'person-1', statusTypeId: 'leave', startDate: '2026-04-05', endDate: '2026-04-07' },
		{ id: 'e-2', personnelId: 'person-2', statusTypeId: 'leave', startDate: '2026-04-08', endDate: '2026-04-08' }
	]);

	function open(assigneeId?: string, saved = true) {
		const onSetAssignment = vi.fn(async () => saved);
		render(DailyAssignmentModal, {
			props: {
				date: new Date(2026, 3, 6),
				assignmentTypes: [type],
				assignments: assigneeId ? [{ id: 'a-1', date: '2026-04-06', assignmentTypeId: 'type-1', assigneeId }] : [],
				personnelByGroup: [{ group: 'Alpha', personnel: [person('person-1', 'Smith'), person('person-2', 'Taylor')] }],
				groups: [],
				availabilityByPerson,
				statusTypes: [leave],
				onSetAssignment,
				onRemoveAssignment: vi.fn(),
				onClose: vi.fn()
			}
		});
		return { onSetAssignment };
	}
	const trigger = () => screen.getByRole('button', { name: 'Set Charge of Quarters assignee' });

	it('shows why a person is unavailable on the shown date and no one else', async () => {
		open();
		await fireEvent.click(trigger());

		expect(screen.getByRole('option', { name: /Smith/ }).textContent).toContain('Leave 5–7 Apr');
		expect(screen.getByRole('option', { name: /Taylor/ }).textContent).not.toContain('Leave');
	});

	it('asks first, and assigns only after Assign anyway', async () => {
		const { onSetAssignment } = open();
		await fireEvent.click(trigger());
		await fireEvent.click(screen.getByRole('option', { name: /Smith/ }));

		const confirm = await screen.findByRole('alertdialog');
		expect(confirm.textContent).toContain('SGT Smith, Alex is unavailable: Leave 5–7 Apr');
		expect(onSetAssignment).not.toHaveBeenCalled();
		await fireEvent.click(within(confirm).getByRole('button', { name: 'Assign anyway' }));

		expect(onSetAssignment).toHaveBeenCalledExactlyOnceWith('2026-04-06', 'type-1', 'person-1');
		await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
	});

	it('keeps the confirmation open when the save fails', async () => {
		const { onSetAssignment } = open(undefined, false);
		await fireEvent.click(trigger());
		await fireEvent.click(screen.getByRole('option', { name: /Smith/ }));
		const confirm = await screen.findByRole('alertdialog');
		await fireEvent.click(within(confirm).getByRole('button', { name: 'Assign anyway' }));

		await waitFor(() => expect(onSetAssignment).toHaveBeenCalledExactlyOnceWith('2026-04-06', 'type-1', 'person-1'));
		await waitFor(() =>
			expect(within(confirm).getByRole('button', { name: 'Assign anyway' })).toHaveProperty('disabled', false)
		);
		expect(screen.getByRole('alertdialog')).toBe(confirm);
	});

	it('leaves the slot and the shown assignee alone on Cancel', async () => {
		const { onSetAssignment } = open('person-2');
		await fireEvent.click(trigger());
		await fireEvent.click(screen.getByRole('option', { name: /Smith/ }));
		await fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));

		await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
		expect(onSetAssignment).not.toHaveBeenCalled();
		expect(trigger().textContent).toContain('Taylor');
		expect(trigger().textContent).not.toContain('Smith');
	});

	it('does not ask about someone available that day or about the person already assigned', async () => {
		const { onSetAssignment } = open('person-1');
		await fireEvent.click(trigger());
		await fireEvent.click(screen.getByRole('option', { name: /Taylor/ }));
		expect(onSetAssignment).toHaveBeenCalledWith('2026-04-06', 'type-1', 'person-2');
		expect(screen.queryByRole('alertdialog')).toBeNull();

		onSetAssignment.mockClear();
		await fireEvent.click(trigger());
		await fireEvent.click(screen.getByRole('option', { name: /Smith/ }));
		expect(onSetAssignment).toHaveBeenCalledWith('2026-04-06', 'type-1', 'person-1');
		expect(screen.queryByRole('alertdialog')).toBeNull();
	});
});
