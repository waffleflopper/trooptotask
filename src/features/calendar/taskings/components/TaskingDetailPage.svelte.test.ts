// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CalendarEventsPageAccess } from '../../contracts';
import type { EventRead } from '../../events/eventModel';
import type { Tasking, TaskingActivityLog, TaskingChoices, TaskingDetail } from '../taskingModel';
import type { TaskingStaffing } from '../staffing/staffingModel';
import type { TaskingLists } from '../taskingListsModel';
import TaskingDetailPage from './TaskingDetailPage.svelte';

vi.mock('$app/navigation', () => ({ invalidate: vi.fn(), replaceState: vi.fn() }));

const ALPHA = '00000000-0000-4000-8000-000000000201';
const tasking: Tasking = {
	id: '00000000-0000-4000-8000-000000000101',
	title: 'Provide four trauma-lane medics',
	event: null,
	responsibility: { kind: 'group', groupId: ALPHA },
	suspenseOn: '2026-10-30',
	execution: null,
	requirement: null,
	instructions: null,
	status: { kind: 'in_progress' },
	readiness: { equipment: null, checklist: null }
};
const org: CalendarEventsPageAccess = {
	orgId: 'org-a',
	orgUrlSegment: 'org-a',
	orgName: 'C Co',
	userId: '00000000-0000-4000-8000-000000000003',
	affordanceForFeatureAction: () => ({ allowed: true })
};

afterEach(cleanup);

describe('TaskingDetailPage', () => {
	it('keeps a Block draft when an earlier Edit finishes loading its choices', async () => {
		let resolveChoices!: (value: EventRead<TaskingChoices | null>) => void;
		const detail: EventRead<TaskingDetail> = {
			status: 'loaded',
			value: { tasking, groups: { [ALPHA]: 'Alpha' }, members: {} }
		};
		const lists: EventRead<TaskingLists> = { status: 'loaded', value: { equipment: [], checklist: [] } };
		const activity: EventRead<TaskingActivityLog> = { status: 'loaded', value: { entries: [], eventTitles: {} } };
		render(TaskingDetailPage, {
			org,
			today: '2026-10-26',
			detail: Promise.resolve(detail),
			activity: Promise.resolve(activity),
			people: new Promise<EventRead<TaskingStaffing>>(() => {}),
			lists: Promise.resolve(lists),
			choices: new Promise<EventRead<TaskingChoices | null>>((resolve) => (resolveChoices = resolve))
		});

		await fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Block' }));
		const reason = (await screen.findByLabelText('Reason')) as HTMLTextAreaElement;
		await fireEvent.input(reason, { target: { value: 'Litters short' } });
		resolveChoices({ status: 'loaded', value: { groups: [{ id: ALPHA, name: 'Alpha' }], events: [] } });

		await new Promise((settled) => setTimeout(settled));

		expect(screen.queryByLabelText('Outcome')).toBeNull();
		expect((screen.getByLabelText('Reason') as HTMLTextAreaElement).value).toBe('Litters short');
	});
});
