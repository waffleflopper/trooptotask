// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SetupEntry, SetupEntryData, SetupInvitationProgress } from './entry';
import SetupEntryPrompt from './SetupEntryPrompt.svelte';

const { invalidate } = vi.hoisted(() => ({ invalidate: vi.fn(async (_dependency: string) => {}) }));
vi.mock('$app/navigation', () => ({ invalidate, goto: vi.fn() }));

const posts: unknown[] = [];
let respond: () => Response;

beforeEach(() => {
	posts.length = 0;
	invalidate.mockClear();
	respond = () => Response.json({ branch: null, answers: {}, finishedAt: null, prompts: {} });
	vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
		if (String(input) !== '/org/alpha/api/organization/setup/prompt') throw new Error(`Unexpected ${input}`);
		posts.push(JSON.parse(String(init?.body)));
		return respond();
	});
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

function entry(prompt: SetupEntry['prompt'], orgId = 'org-1'): Promise<SetupEntryData> {
	return Promise.resolve({
		orgId,
		today: '2026-10-27',
		state: { branch: 'army', answers: {}, finishedAt: null, prompts: {} },
		entry: { prompt, resume: false }
	});
}

const progress = (overrides: Partial<SetupInvitationProgress> = {}): Promise<SetupInvitationProgress> =>
	Promise.resolve({
		orgId: 'org-1',
		done: 2,
		total: 12,
		completedSteps: [
			{ key: 'ranks', slug: 'ranks', group: 'unit', title: 'Ranks', pitch: '', state: 'done', loadErrors: [] },
			{
				key: 'personnel',
				slug: 'personnel',
				group: 'unit',
				title: 'Personnel',
				pitch: '',
				state: 'done',
				loadErrors: []
			}
		],
		loadErrors: [],
		...overrides
	});

function renderPrompt(props: {
	entry: Promise<SetupEntryData | null> | null;
	invitationProgress?: Promise<SetupInvitationProgress | null> | null;
	onDecide?: (prompted: boolean) => void;
}) {
	return render(SetupEntryPrompt, {
		props: { orgId: 'org-1', orgUrlSegment: 'alpha', orgName: 'C Co', invitationProgress: null, ...props }
	});
}

describe('SetupEntryPrompt', () => {
	it('shows the owner the invitation with the count of steps the unit already completes', async () => {
		renderPrompt({ entry: entry({ kind: 'invitation' }), invitationProgress: progress() });

		const dialog = await screen.findByRole('dialog');
		expect(dialog).toHaveTextContent('2 of 12');
		const done = within(dialog)
			.getAllByRole('listitem')
			.map((row) => row.textContent);
		expect(done).toEqual([expect.stringContaining('Ranks'), expect.stringContaining('Personnel')]);
		expect(within(dialog).getByRole('link', { name: 'Start setup' })).toHaveAttribute('href', '/org/alpha/setup');
	});

	it('does not present a count with failed sources as complete', async () => {
		const headline = async (invitationProgress: Promise<SetupInvitationProgress>) => {
			const view = renderPrompt({ entry: entry({ kind: 'invitation' }), invitationProgress });
			const text = (await screen.findByRole('dialog')).querySelector('[data-setup-done-count]')?.textContent?.trim();
			view.unmount();
			return text;
		};

		const complete = await headline(progress());
		const partial = await headline(progress({ loadErrors: [{ source: 'trainingTypes', message: 'Timed out' }] }));

		expect(partial).toContain('2 of 12');
		expect(partial).not.toBe(complete);
	});

	it('snoozes until tomorrow and opens no second prompt in the same visit after the reload', async () => {
		const view = renderPrompt({ entry: entry({ kind: 'invitation' }), invitationProgress: progress() });

		await fireEvent.click(await screen.findByRole('button', { name: 'Not now' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Remind me tomorrow' }));

		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		expect(posts).toEqual([{ key: 'setup', choice: 'tomorrow' }]);
		expect(invalidate).toHaveBeenLastCalledWith('app:organization-setup');

		await view.rerender({ entry: entry({ kind: 'newFeature', step: 'eventsAndTaskings' }), invitationProgress: null });
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('keeps the prompt open with the error when the choice fails to save', async () => {
		respond = () => Response.json({ message: 'Setup state is unavailable' }, { status: 503 });
		renderPrompt({ entry: entry({ kind: 'invitation' }), invitationProgress: progress() });

		await fireEvent.click(await screen.findByRole('button', { name: 'Not now' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Never ask again' }));

		const alert = await screen.findByRole('alert');
		expect(alert).toHaveTextContent('Setup state is unavailable');
		expect(screen.getByRole('dialog')).toBeInTheDocument();
		expect(posts).toEqual([{ key: 'setup', choice: 'never' }]);
		expect(invalidate).not.toHaveBeenCalled();
	});

	it('opens setup at the new step and answers for that step only', async () => {
		renderPrompt({ entry: entry({ kind: 'newFeature', step: 'eventsAndTaskings' }) });

		const dialog = await screen.findByRole('dialog');
		expect(within(dialog).getByRole('link', { name: 'Set it up' })).toHaveAttribute(
			'href',
			'/org/alpha/setup/events-and-taskings'
		);
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Never ask again' }));

		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		expect(posts).toEqual([{ key: 'eventsAndTaskings', choice: 'never' }]);
	});

	it('renders nothing without a prompt or for another Organization', async () => {
		const decisions: boolean[] = [];
		const onDecide = (prompted: boolean) => decisions.push(prompted);
		const view = renderPrompt({ entry: Promise.resolve(null), onDecide });
		await waitFor(() => expect(decisions).toEqual([false]));
		view.unmount();

		renderPrompt({ entry: entry({ kind: 'invitation' }, 'org-2'), invitationProgress: progress(), onDecide });
		await waitFor(() => expect(decisions).toEqual([false, false]));
		expect(screen.queryByRole('dialog')).toBeNull();
	});
});
