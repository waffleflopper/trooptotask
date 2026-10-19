// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PersonnelLogPageData } from '../contracts';
import { jsonResponse, makeFollowUp, makeLeaderNote } from '../logFixtures.testHelper';
import type { Personnel } from '../personnel.types';
import PersonnelLogPageView from './PersonnelLogPageView.svelte';

vi.mock('$app/navigation', () => ({ invalidate: vi.fn().mockResolvedValue(undefined) }));

const person: Personnel = {
	id: 'person-1',
	slug: 'okafor-ada',
	rank: 'SGT',
	lastName: 'Okafor',
	firstName: 'Ada',
	mos: '68W',
	clinicRole: 'Medic',
	ets: null,
	deros: null,
	groupId: 'group-1',
	groupName: 'Alpha',
	archivedAt: null
};

const TODAY = '2026-10-19';

const followUps = [
	makeFollowUp({ id: 'f-dental', title: 'Dental readiness', dueDate: '2026-10-15' }),
	makeFollowUp({ id: 'f-range', title: 'Range card', notes: '', dueDate: '2026-10-30' }),
	makeFollowUp({
		id: 'f-done',
		title: 'Profile update',
		status: 'completed',
		completedAt: '2026-10-12T09:00:00.000Z',
		completedBy: 'SFC Diaz'
	})
];

function note(day: number, text: string) {
	return makeLeaderNote({
		id: `note-${day}`,
		text,
		createdAt: `2026-10-${String(day).padStart(2, '0')}T12:00:00.000Z`
	});
}

function renderLog(overrides: Partial<PersonnelLogPageData> = {}, addIntent: string | null = null) {
	const data: PersonnelLogPageData = {
		followUps: Promise.resolve(followUps),
		notes: Promise.resolve({ notes: [note(15, 'Strong week at the range.')], total: 1 }),
		...overrides
	};
	return render(PersonnelLogPageView, { props: { orgId: 'org-1', person, today: TODAY, data, addIntent } });
}

function stubFetch(respond: (url: string, init: RequestInit | undefined) => Response | Promise<Response>) {
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => respond(String(input), init));
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

const sentBody = (fetchMock: ReturnType<typeof stubFetch>, call = 0) =>
	JSON.parse(String(fetchMock.mock.calls[call][1]?.body));

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('PersonnelLogPageView follow-ups', () => {
	it('counts open and overdue follow-ups from today', async () => {
		renderLog();

		expect(await screen.findByText('2 open')).toBeTruthy();
		expect(screen.getByText('1 overdue')).toBeTruthy();
		expect(screen.getByText('Overdue 4 days')).toBeTruthy();
	});

	it('completes a follow-up in one click and files it under Completed', async () => {
		const fetchMock = stubFetch(() => jsonResponse({ status: 'completed', completedAt: '2026-10-19T14:00:00.000Z' }));
		renderLog();

		await fireEvent.click(await screen.findByRole('checkbox', { name: 'Complete Dental readiness' }));

		expect(await screen.findByText('Completed · 2')).toBeTruthy();
		expect(screen.getByText('1 open')).toBeTruthy();
		expect(sentBody(fetchMock)).toEqual({ status: 'completed' });
	});

	it('puts the follow-up back and says why when completing fails', async () => {
		stubFetch(() => jsonResponse({ message: 'This follow-up was archived.' }, 409));
		renderLog();

		await fireEvent.click(await screen.findByRole('checkbox', { name: 'Complete Dental readiness' }));

		expect(await screen.findByText('This follow-up was archived.')).toBeTruthy();
		expect(screen.getByText('2 open')).toBeTruthy();
		expect(screen.queryByText('Completed · 2')).toBeNull();
	});

	it('reopens a completed follow-up', async () => {
		const fetchMock = stubFetch(() => jsonResponse({ status: 'open', completedAt: null, completedBy: null }));
		renderLog();

		await fireEvent.click(await screen.findByRole('button', { name: 'Reopen' }));

		await waitFor(() => expect(screen.getByText('3 open')).toBeTruthy());
		expect(sentBody(fetchMock)).toEqual({ status: 'open' });
	});

	it('shows who completed it and when', async () => {
		renderLog();

		expect(await screen.findByText('Done 12 Oct · SFC Diaz')).toBeTruthy();
	});

	it('adds a follow-up when Enter is pressed in the quick-add input', async () => {
		const fetchMock = stubFetch(() =>
			jsonResponse(makeFollowUp({ id: 'f-new', title: 'Update roster', notes: '', dueDate: null }))
		);
		renderLog();

		const input = await screen.findByLabelText('Follow-up title');
		await fireEvent.input(input, { target: { value: ' Update roster ' } });
		await fireEvent.submit(input.closest('form')!);

		expect(await screen.findByRole('button', { name: 'Update roster' })).toBeTruthy();
		expect(sentBody(fetchMock)).toEqual({ title: 'Update roster', notes: '', dueDate: null });
		expect((input as HTMLInputElement).value).toBe('');
	});

	it('refuses an empty quick-add without sending it', async () => {
		const fetchMock = stubFetch(() => jsonResponse({}));
		renderLog();

		const input = await screen.findByLabelText('Follow-up title');
		await fireEvent.submit(input.closest('form')!);

		expect(await screen.findByText('Enter a follow-up title.')).toBeTruthy();
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe('PersonnelLogPageView inline editing', () => {
	it('opens the editor with the title focused and offers Archive only there', async () => {
		renderLog();
		expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull();

		await fireEvent.click(await screen.findByRole('button', { name: 'Dental readiness' }));

		const editor = screen.getByRole('form', { name: 'Edit follow-up Dental readiness' });
		const title = within(editor).getByLabelText('Follow-up title');
		expect(document.activeElement).toBe(title);
		expect((within(editor).getByLabelText('Follow-up notes') as HTMLTextAreaElement).value).toBe('Needs appointment');
		expect(within(editor).getByRole('button', { name: 'Archive' })).toBeTruthy();
	});

	it('saves the edit when Enter is pressed in the title', async () => {
		const fetchMock = stubFetch(() => jsonResponse({ title: 'Dental exam', notes: 'Needs appointment' }));
		renderLog();
		await fireEvent.click(await screen.findByRole('button', { name: 'Dental readiness' }));

		const editor = screen.getByRole('form', { name: 'Edit follow-up Dental readiness' });
		await fireEvent.input(within(editor).getByLabelText('Follow-up title'), { target: { value: 'Dental exam' } });
		await fireEvent.submit(editor);

		expect(await screen.findByRole('button', { name: 'Dental exam' })).toBeTruthy();
		expect(screen.queryByRole('form')).toBeNull();
		expect(sentBody(fetchMock)).toEqual({ title: 'Dental exam', notes: 'Needs appointment', dueDate: '2026-10-15' });
	});

	it('cancels on Escape and returns focus to the title', async () => {
		const fetchMock = stubFetch(() => jsonResponse({}));
		renderLog();
		await fireEvent.click(await screen.findByRole('button', { name: 'Dental readiness' }));

		const editor = screen.getByRole('form', { name: 'Edit follow-up Dental readiness' });
		await fireEvent.input(within(editor).getByLabelText('Follow-up title'), { target: { value: 'Changed my mind' } });
		await fireEvent.keyDown(within(editor).getByLabelText('Follow-up title'), { key: 'Escape' });

		await waitFor(() => expect(screen.queryByRole('form')).toBeNull());
		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Dental readiness' }));
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('keeps the editor open and shows the reason when the save is refused', async () => {
		stubFetch(() => jsonResponse({ message: 'This follow-up was archived.' }, 404));
		renderLog();
		await fireEvent.click(await screen.findByRole('button', { name: 'Dental readiness' }));

		const editor = screen.getByRole('form', { name: 'Edit follow-up Dental readiness' });
		await fireEvent.input(within(editor).getByLabelText('Follow-up title'), { target: { value: 'Dental exam' } });
		await fireEvent.submit(editor);

		expect(await within(editor).findByText('This follow-up was archived.')).toBeTruthy();
		expect((within(editor).getByLabelText('Follow-up title') as HTMLInputElement).value).toBe('Dental exam');
	});

	it('archives from the editor and drops the follow-up from the list', async () => {
		const fetchMock = stubFetch(() => jsonResponse({ id: 'f-dental', status: 'archived' }));
		renderLog();
		await fireEvent.click(await screen.findByRole('button', { name: 'Dental readiness' }));

		await fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

		await waitFor(() => expect(screen.queryByRole('form')).toBeNull());
		expect(screen.queryByRole('button', { name: 'Dental readiness' })).toBeNull();
		expect(screen.getByText('1 open')).toBeTruthy();
		expect(sentBody(fetchMock)).toEqual({ status: 'archived' });
	});

	it('edits one row at a time across follow-ups and notes', async () => {
		renderLog();
		await fireEvent.click(await screen.findByRole('button', { name: 'Dental readiness' }));
		expect(screen.getAllByRole('form')).toHaveLength(1);

		await fireEvent.click(screen.getByRole('button', { name: 'Strong week at the range.' }));

		expect(screen.getAllByRole('form')).toHaveLength(1);
		expect(screen.getByRole('form', { name: 'Edit note' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Dental readiness' })).toBeTruthy();
	});

	it('leaves a newer editor open when an earlier save finishes after it', async () => {
		let finishSave: (response: Response) => void = () => {};
		stubFetch(() => new Promise<Response>((resolve) => (finishSave = resolve)));
		renderLog();
		await fireEvent.click(await screen.findByRole('button', { name: 'Dental readiness' }));
		const editor = screen.getByRole('form', { name: 'Edit follow-up Dental readiness' });
		await fireEvent.input(within(editor).getByLabelText('Follow-up title'), { target: { value: 'Dental exam' } });
		await fireEvent.submit(editor);

		await fireEvent.click(screen.getByRole('button', { name: 'Strong week at the range.' }));
		finishSave(jsonResponse({ title: 'Dental exam' }));

		await screen.findByRole('button', { name: 'Dental exam' });
		expect(screen.getByRole('form', { name: 'Edit note' })).toBeTruthy();
	});
});

describe('PersonnelLogPageView leader notes', () => {
	it('names the Soldier in the composer and saves a note', async () => {
		const fetchMock = stubFetch(() => jsonResponse(note(18, 'Volunteered for the detail.')));
		renderLog();

		const composer = await screen.findByPlaceholderText('Write a note about SGT OKAFOR…');
		await fireEvent.input(composer, { target: { value: 'Volunteered for the detail.' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save note' }));

		expect(await screen.findByText('2 notes')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Volunteered for the detail.' })).toBeTruthy();
		expect(sentBody(fetchMock)).toEqual({ text: 'Volunteered for the detail.' });
	});

	it('saves edited note text in place', async () => {
		const fetchMock = stubFetch(() => jsonResponse({ text: 'Excellent week at the range.' }));
		renderLog();
		await fireEvent.click(await screen.findByRole('button', { name: 'Strong week at the range.' }));

		const editor = screen.getByRole('form', { name: 'Edit note' });
		await fireEvent.input(within(editor).getByLabelText('Note text'), {
			target: { value: 'Excellent week at the range.' }
		});
		await fireEvent.click(within(editor).getByRole('button', { name: 'Save' }));

		expect(await screen.findByRole('button', { name: 'Excellent week at the range.' })).toBeTruthy();
		expect(sentBody(fetchMock)).toEqual({ text: 'Excellent week at the range.' });
	});

	it('archives a note from its editor', async () => {
		const fetchMock = stubFetch(() => jsonResponse({ id: 'note-15' }));
		renderLog();
		await fireEvent.click(await screen.findByRole('button', { name: 'Strong week at the range.' }));

		await fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

		expect(await screen.findByText('0 notes')).toBeTruthy();
		expect(sentBody(fetchMock)).toEqual({ action: 'archive' });
	});

	it('brings in older notes only when asked', async () => {
		const fetchMock = stubFetch(() => jsonResponse([note(12, 'Passed the ACFT.'), note(11, 'Led the safety brief.')]));
		renderLog({ notes: Promise.resolve({ notes: [note(15, 'Strong week at the range.')], total: 3 }) });

		expect(screen.queryByRole('button', { name: 'Passed the ACFT.' })).toBeNull();
		await fireEvent.click(await screen.findByRole('button', { name: 'Show 2 older notes' }));

		expect(await screen.findByRole('button', { name: 'Passed the ACFT.' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Led the safety brief.' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: /older note/ })).toBeNull();
		expect(String(fetchMock.mock.calls[0][0])).toContain('beforeId=note-15');
	});
});

describe('PersonnelLogPageView after the layout refreshes its counts', () => {
	it('keeps what was just added when the page receives a new data object holding the same loads', async () => {
		stubFetch(() => jsonResponse(makeFollowUp({ id: 'f-new', title: 'Update roster', notes: '', dueDate: null })));
		const loads = { followUps: Promise.resolve(followUps), notes: Promise.resolve({ notes: [], total: 0 }) };
		const view = render(PersonnelLogPageView, {
			props: { orgId: 'org-1', person, today: TODAY, data: { ...loads }, addIntent: null }
		});
		const input = await screen.findByLabelText('Follow-up title');
		await fireEvent.input(input, { target: { value: 'Update roster' } });
		await fireEvent.submit(input.closest('form')!);
		await screen.findByRole('button', { name: 'Update roster' });

		await view.rerender({ orgId: 'org-1', person: { ...person }, today: TODAY, data: { ...loads }, addIntent: null });

		expect(await screen.findByText('3 open')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Update roster' })).toBeTruthy();
	});

	it('keeps a note just saved through the same refresh', async () => {
		stubFetch(() => jsonResponse(note(18, 'Volunteered for the detail.')));
		const loads = { followUps: Promise.resolve([]), notes: Promise.resolve({ notes: [], total: 0 }) };
		const view = render(PersonnelLogPageView, {
			props: { orgId: 'org-1', person, today: TODAY, data: { ...loads }, addIntent: null }
		});
		const composer = await screen.findByPlaceholderText('Write a note about SGT OKAFOR…');
		await fireEvent.input(composer, { target: { value: 'Volunteered for the detail.' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
		await screen.findByRole('button', { name: 'Volunteered for the detail.' });

		await view.rerender({ orgId: 'org-1', person: { ...person }, today: TODAY, data: { ...loads }, addIntent: null });

		expect(await screen.findByText('1 note')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Volunteered for the detail.' })).toBeTruthy();
	});
});

describe('PersonnelLogPageView add intent', () => {
	it('focuses the quick-add input for a follow-up intent', async () => {
		renderLog({}, 'follow-up');

		const input = await screen.findByLabelText('Follow-up title');
		await waitFor(() => expect(document.activeElement).toBe(input));
	});

	it('focuses the composer for a note intent', async () => {
		renderLog({}, 'note');

		const composer = await screen.findByPlaceholderText('Write a note about SGT OKAFOR…');
		await waitFor(() => expect(document.activeElement).toBe(composer));
	});
});

describe('PersonnelLogPageView loading failures', () => {
	it('reports a failed follow-ups load without hiding the notes', async () => {
		renderLog({ followUps: Promise.reject(new Error('read failed')) });

		expect(await screen.findByText(/Follow-ups could not be loaded/)).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Strong week at the range.' })).toBeTruthy();
	});

	it('reports a failed notes load without hiding the follow-ups', async () => {
		renderLog({ notes: Promise.reject(new Error('read failed')) });

		expect(await screen.findByText(/Leader notes could not be loaded/)).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Dental readiness' })).toBeTruthy();
	});
});
