// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import type { FeedbackReply, FeedbackStaffCommand, FeedbackStaffDetail } from '$features/feedback/contracts';
import type { InboxDetailOf } from '../../inboxTypes';

vi.mock('$app/forms', () => ({ enhance: () => ({ destroy: () => {} }), applyAction: vi.fn() }));

import FeedbackDetail from './FeedbackDetail.svelte';

const ID = '11111111-1111-4111-8111-111111111111';
const ISSUE = { issueNumber: 42, issueUrl: 'https://github.com/waffleflopper/trooptotask/issues/42' };

const inboxDetail = (overrides: Partial<InboxDetailOf<'feedback'>> = {}): InboxDetailOf<'feedback'> => ({
	kind: 'feedback',
	id: ID,
	category: 'bug',
	message: 'Leave that crosses into November will not save',
	pageUrl: '/org/hhc/calendar',
	pageSection: 'Calendar',
	person: 'CPT Oduya',
	organizationName: 'HHC, 1-8 CAV',
	status: 'new',
	receivedAt: '2026-10-23T02:40:00Z',
	closedAt: null,
	...overrides
});

const reply = (id: string, body: string, sentAt: string): FeedbackReply => ({
	id,
	feedbackId: ID,
	body,
	sentBy: 'operator',
	sentAt
});

const staffDetail = (overrides: Partial<FeedbackStaffDetail> = {}): FeedbackStaffDetail => ({
	id: ID,
	category: 'bug',
	message: 'Leave that crosses into November will not save',
	pageUrl: '/org/hhc/calendar',
	status: 'new',
	createdAt: '2026-10-23T02:40:00Z',
	replies: [],
	userId: 'reporter',
	userEmail: 'oduya@example.test',
	organizationId: 'org-1',
	organizationName: 'HHC, 1-8 CAV',
	pageSection: 'Calendar',
	staffNotes: [],
	issue: null,
	issuePrefill: {
		title: 'Leave that crosses into November will not save',
		description: 'Leave that crosses into November will not save\n\nCategory: bug\nSection: Calendar',
		labels: ['bug', 'user-feedback'],
		includeOrganization: false
	},
	...overrides
});

interface Call {
	method: string;
	command: FeedbackStaffCommand | null;
	respond: (response: Response) => void;
}

let stored: FeedbackStaffDetail;
let calls: Call[];
let reads: number;
let failReads: boolean;
let holdReads: boolean;
let commandResult: (command: FeedbackStaffCommand) => Response;
let holdCommands: boolean;
let heldReads: Array<() => void>;

const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
	stored = staffDetail();
	calls = [];
	reads = 0;
	failReads = false;
	holdReads = false;
	holdCommands = false;
	heldReads = [];
	commandResult = () => ok({ status: 'noteSaved' });
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string, init?: RequestInit) => {
			expect(url).toBe(`/admin/api/feedback/${ID}`);
			if (!init?.method || init.method === 'GET') {
				reads++;
				if (holdReads) await new Promise<void>((release) => heldReads.push(release));
				return failReads ? ok({ message: 'unavailable' }, 500) : ok({ status: 'ok', detail: stored });
			}
			const command = JSON.parse(String(init.body)) as FeedbackStaffCommand;
			if (!holdCommands) return commandResult(command);
			return new Promise<Response>((resolve) => {
				calls.push({ method: init.method!, command, respond: resolve });
			});
		})
	);
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

function mount(overrides: Partial<InboxDetailOf<'feedback'>> = {}, onChanged = vi.fn()) {
	const view = render(FeedbackDetail, { props: { detail: inboxDetail(overrides), onChanged } });
	return { view, onChanged };
}

const posted = () => vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'POST');
const postedCommands = () => posted().map(([, init]) => JSON.parse(String(init!.body)) as FeedbackStaffCommand);

describe('Feedback detail', () => {
	it('shows the thread oldest first and the private note once the staff region loads', async () => {
		stored = staffDetail({
			replies: [reply('r1', 'Thanks, I can reproduce it.', '2026-10-23T04:00:00Z')],
			staffNotes: [
				{
					feedbackId: ID,
					body: 'Looks like the month boundary',
					updatedBy: 'operator',
					updatedAt: '2026-10-23T05:00:00Z'
				}
			]
		});
		mount();

		expect(screen.getByRole('status', { name: 'Loading replies and notes' })).toBeTruthy();
		const thread = await screen.findByRole('list', { name: 'Replies' });
		expect(within(thread).getByText('Thanks, I can reproduce it.')).toBeTruthy();
		expect((screen.getByLabelText('Staff note') as HTMLTextAreaElement).value).toBe('Looks like the month boundary');
		expect(screen.getByText('Private')).toBeTruthy();
	});

	it('sends a trimmed reply, clears the draft and asks the Inbox to refresh only after the server confirms', async () => {
		const { onChanged } = mount();
		const composer = (await screen.findByLabelText(/^Reply to/)) as HTMLTextAreaElement;
		holdCommands = true;
		await fireEvent.input(composer, { target: { value: '  We can reproduce this.  ' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));

		await waitFor(() => expect(calls).toHaveLength(1));
		expect(calls[0].command).toEqual({ kind: 'reply', body: 'We can reproduce this.' });
		expect(composer.readOnly).toBe(true);
		expect(onChanged).not.toHaveBeenCalled();
		await fireEvent.click(screen.getByRole('button', { name: 'Reply and close' }));
		expect(calls).toHaveLength(1);

		stored = staffDetail({
			status: 'reviewed',
			replies: [reply('r1', 'We can reproduce this.', '2026-10-24T01:00:00Z')]
		});
		await act(() => calls[0].respond(ok({ status: 'replied', reply: stored.replies[0], feedbackStatus: 'reviewed' })));

		await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
		expect(composer.value).toBe('');
		expect(composer.readOnly).toBe(false);
		const thread = await screen.findByRole('list', { name: 'Replies' });
		expect(within(thread).getByText('We can reproduce this.')).toBeTruthy();
	});

	it('Reply and close sends its own command', async () => {
		commandResult = () =>
			ok({ status: 'replied', reply: reply('r1', 'Fixed.', '2026-10-24T01:00:00Z'), feedbackStatus: 'resolved' });
		const { onChanged } = mount();
		await fireEvent.input(await screen.findByLabelText(/^Reply to/), { target: { value: 'Fixed.' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Reply and close' }));

		await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
		expect(postedCommands()).toEqual([{ kind: 'replyAndClose', body: 'Fixed.' }]);
	});

	it('keeps the draft, shows the error and refreshes the Inbox when a reply fails after it may have saved', async () => {
		commandResult = () =>
			ok({ message: 'Unable to complete the feedback command. Reload the feedback before trying again.' }, 500);
		const { onChanged } = mount();
		const composer = (await screen.findByLabelText(/^Reply to/)) as HTMLTextAreaElement;
		await fireEvent.input(composer, { target: { value: 'We can reproduce this.' } });
		const readsBefore = reads;
		await fireEvent.click(screen.getByRole('button', { name: 'Reply and close' }));

		expect(await screen.findByText(/Reload the feedback before trying again/)).toBeTruthy();
		expect(composer.value).toBe('We can reproduce this.');
		await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(reads).toBeGreaterThan(readsBefore));
	});

	it('holds every write after an uncertain result until a read shows the thread', async () => {
		commandResult = () => ok({ message: 'Unable to complete the feedback command.' }, 500);
		mount();
		const composer = (await screen.findByLabelText(/^Reply to/)) as HTMLTextAreaElement;
		await fireEvent.input(composer, { target: { value: 'We can reproduce this.' } });
		holdReads = true;
		await fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
		await waitFor(() => expect(heldReads).toHaveLength(1));

		const send = screen.getByRole('button', { name: 'Send reply' }) as HTMLButtonElement;
		expect(send.disabled).toBe(true);
		expect((screen.getByRole('button', { name: 'Reply and close' }) as HTMLButtonElement).disabled).toBe(true);
		expect((screen.getByRole('button', { name: 'Make it a GitHub issue' }) as HTMLButtonElement).disabled).toBe(true);
		await fireEvent.submit(composer.closest('form')!);
		expect(postedCommands()).toHaveLength(1);

		stored = staffDetail({ replies: [reply('r1', 'We can reproduce this.', '2026-10-24T01:00:00Z')] });
		holdReads = false;
		await act(() => heldReads[0]());

		const thread = await screen.findByRole('list', { name: 'Replies' });
		expect(within(thread).getByText('We can reproduce this.')).toBeTruthy();
		await waitFor(() => expect(send.disabled).toBe(false));
	});

	it('keeps writes held while the read after an uncertain result keeps failing', async () => {
		commandResult = () => ok({ message: 'Unable to complete the feedback command.' }, 500);
		mount();
		const composer = (await screen.findByLabelText(/^Reply to/)) as HTMLTextAreaElement;
		await fireEvent.input(composer, { target: { value: 'We can reproduce this.' } });
		failReads = true;
		await fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));

		expect(await screen.findByText(/could not be reloaded/)).toBeTruthy();
		const send = screen.getByRole('button', { name: 'Send reply' }) as HTMLButtonElement;
		expect(send.disabled).toBe(true);

		failReads = false;
		await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
		await waitFor(() => expect(send.disabled).toBe(false));
	});

	it('shows the closed refusal, keeps the draft and reloads only when the operator asks', async () => {
		commandResult = () => ok({ status: 'closed', message: 'This feedback was closed. Reload to see it.' }, 409);
		const { onChanged } = mount();
		const composer = (await screen.findByLabelText(/^Reply to/)) as HTMLTextAreaElement;
		await fireEvent.input(composer, { target: { value: 'We can reproduce this.' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));

		expect(await screen.findByText('This feedback was closed. Reload to see it.')).toBeTruthy();
		expect(composer.value).toBe('We can reproduce this.');
		expect(onChanged).not.toHaveBeenCalled();
		expect((screen.getByRole('button', { name: 'Send reply' }) as HTMLButtonElement).disabled).toBe(false);

		await fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
		expect(onChanged).toHaveBeenCalledTimes(1);
		expect(screen.queryByText('This feedback was closed. Reload to see it.')).toBeNull();
	});

	it('ignores a reply result that arrives after the operator left the item', async () => {
		holdCommands = true;
		const { view, onChanged } = mount();
		await fireEvent.input(await screen.findByLabelText(/^Reply to/), { target: { value: 'Hello' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
		await waitFor(() => expect(calls).toHaveLength(1));
		const readsBefore = reads;

		view.unmount();
		await act(() =>
			calls[0].respond(
				ok({ status: 'replied', reply: reply('r1', 'Hello', '2026-10-24T01:00:00Z'), feedbackStatus: 'reviewed' })
			)
		);

		expect(onChanged).not.toHaveBeenCalled();
		expect(reads).toBe(readsBefore);
	});

	it('shows its own load error with a retry while Close without replying stays available', async () => {
		failReads = true;
		mount();
		expect(await screen.findByText(/could not be loaded/)).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Close without replying' })).toBeTruthy();

		failReads = false;
		await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
		expect(await screen.findByLabelText(/^Reply to/)).toBeTruthy();
	});

	it('offers no reply or close controls on a closed item but keeps the note and the issue', async () => {
		stored = staffDetail({ status: 'resolved' });
		mount({ status: 'resolved', closedAt: '2026-10-24T01:00:00Z' });

		await screen.findByLabelText('Staff note');
		expect(screen.queryByLabelText(/^Reply to/)).toBeNull();
		expect(screen.queryByRole('button', { name: 'Send reply' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Close without replying' })).toBeNull();
		expect(screen.getByRole('button', { name: 'Make it a GitHub issue' })).toBeTruthy();
	});

	it('saves a note only after it is edited', async () => {
		commandResult = () => ok({ status: 'noteSaved' });
		mount();
		const note = (await screen.findByLabelText('Staff note')) as HTMLTextAreaElement;
		const save = screen.getByRole('button', { name: 'Save note' }) as HTMLButtonElement;
		expect(save.disabled).toBe(true);

		await fireEvent.input(note, { target: { value: ' Check the month boundary ' } });
		expect(save.disabled).toBe(false);
		await fireEvent.click(save);

		await screen.findByText('Note saved.');
		expect(postedCommands()).toEqual([{ kind: 'saveNote', body: 'Check the month boundary' }]);
	});
});

describe('Make it a GitHub issue', () => {
	async function openDialog() {
		await fireEvent.click(await screen.findByRole('button', { name: 'Make it a GitHub issue' }));
		return screen.findByRole('dialog');
	}

	it('prefills the draft without identity and creates it with the Organization left out by default', async () => {
		commandResult = () => ok({ status: 'issueCreated', issue: ISSUE });
		mount();
		const dialog = await openDialog();

		expect((within(dialog).getByLabelText('Title') as HTMLInputElement).value).toBe(stored.issuePrefill.title);
		expect((within(dialog).getByLabelText('Description') as HTMLTextAreaElement).value).toBe(
			stored.issuePrefill.description
		);
		expect(within(dialog).getByText('bug')).toBeTruthy();
		expect(within(dialog).getByText('user-feedback')).toBeTruthy();
		expect(dialog.textContent).not.toContain('oduya@example.test');
		expect(
			(within(dialog).getByRole('checkbox', { name: 'Include the Organization name' }) as HTMLElement).getAttribute(
				'aria-checked'
			)
		).toBe('false');

		stored = staffDetail({ issue: ISSUE });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Create issue' }));

		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		expect(postedCommands()).toEqual([
			{
				kind: 'makeGitHubIssue',
				title: stored.issuePrefill.title,
				description: stored.issuePrefill.description,
				includeOrganization: false
			}
		]);
		const link = await screen.findByRole('link', { name: 'GitHub issue #42' });
		expect(link.getAttribute('href')).toBe(ISSUE.issueUrl);
		expect(screen.queryByRole('button', { name: 'Make it a GitHub issue' })).toBeNull();
	});

	it('adds the Organization only when the checkbox is set, and never edits the description itself', async () => {
		commandResult = () => ok({ status: 'issueCreated', issue: ISSUE });
		mount();
		const dialog = await openDialog();
		await fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Include the Organization name' }));
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Create issue' }));

		await waitFor(() => expect(postedCommands()).toHaveLength(1));
		expect(postedCommands()[0]).toMatchObject({
			includeOrganization: true,
			description: stored.issuePrefill.description
		});
	});

	it('offers no Organization choice for feedback sent outside an Organization', async () => {
		stored = staffDetail({ organizationName: null });
		mount({ organizationName: null });
		const dialog = await openDialog();

		expect(within(dialog).queryByRole('checkbox')).toBeNull();
	});

	it("keeps the dialog open with GitHub's error, the edited draft and the feedback unchanged", async () => {
		commandResult = () => ok({ status: 'githubError', message: 'GitHub rejected the issue (HTTP 422).' }, 502);
		mount();
		const dialog = await openDialog();
		const title = within(dialog).getByLabelText('Title') as HTMLInputElement;
		await fireEvent.input(title, { target: { value: 'Calendar drops leave' } });
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Create issue' }));

		expect(await within(dialog).findByText('GitHub rejected the issue (HTTP 422).')).toBeTruthy();
		expect(screen.getByRole('dialog')).toBeTruthy();
		expect(title.value).toBe('Calendar drops leave');
		expect(within(dialog).getByRole('button', { name: 'Create issue' })).toBeTruthy();
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
		expect(screen.getByRole('button', { name: 'Make it a GitHub issue' })).toBeTruthy();
	});

	it('shows the created issue and withholds Create issue when GitHub made it but the link was not saved', async () => {
		commandResult = () =>
			ok(
				{
					status: 'issuePersistenceError',
					issue: ISSUE,
					message: 'GitHub created the issue, but its link could not be saved.'
				},
				500
			);
		mount();
		const dialog = await openDialog();
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Create issue' }));

		const link = await within(dialog).findByRole('link', { name: 'Open issue #42 on GitHub' });
		expect(link.getAttribute('href')).toBe(ISSUE.issueUrl);
		expect(within(dialog).queryByRole('button', { name: 'Create issue' })).toBeNull();
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));

		expect(await screen.findByRole('link', { name: 'GitHub issue #42' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Make it a GitHub issue' })).toBeNull();
		expect(postedCommands()).toHaveLength(1);
	});
});
