// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupEntry, type SetupEntryData } from './entry';
import { SETUP_STEPS } from './registry';
import SetupResume from './SetupResume.svelte';

const { invalidate } = vi.hoisted(() => ({ invalidate: vi.fn(async (_dependency: string) => {}) }));
vi.mock('$app/navigation', () => ({ invalidate, goto: vi.fn() }));

const requests: string[] = [];
let progress: () => Response;
let prompt: () => Promise<Response>;

const step = (key: string, slug: string, title: string, group: string) => ({
	key,
	slug,
	title,
	group,
	pitch: '',
	state: 'notAnswered',
	loadErrors: []
});

beforeEach(() => {
	requests.length = 0;
	invalidate.mockClear();
	prompt = async () =>
		Response.json({ branch: 'army', answers: {}, finishedAt: null, prompts: { setup: { never: true } } });
	progress = () =>
		Response.json({
			steps: [],
			on: [],
			later: [],
			off: [],
			unanswered: [
				step('criticalTasks', 'critical-tasks', 'Critical tasks', 'features'),
				step('invite', 'invite', 'Invite your team', 'team')
			],
			reviewed: 10,
			total: 12,
			firstUnansweredSlug: 'critical-tasks'
		});
	vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
		requests.push(`${init?.method ?? 'GET'} ${input}`);
		return init?.method === 'POST' ? prompt() : progress();
	});
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

const entry = (resume: boolean): Promise<SetupEntryData> =>
	Promise.resolve({
		orgId: 'org-1',
		today: '2026-10-27',
		state: { branch: 'army', answers: {}, finishedAt: null, prompts: { setup: { snoozedUntil: '2026-10-28' } } },
		entry: { prompt: null, resume: resume ? { kind: 'setup' } : null }
	});

const renderResume = (data: Promise<SetupEntryData | null>) =>
	render(SetupResume, { props: { orgId: 'org-1', orgUrlSegment: 'alpha', entry: data } });

describe('SetupResume', () => {
	it('loads progress only when opened and continues at the first unanswered step', async () => {
		renderResume(entry(true));
		const button = await screen.findByRole('button', { name: 'Resume setup' });
		expect(requests).toEqual([]);

		await fireEvent.click(button);

		expect(await screen.findByText('10 of 12')).toBeInTheDocument();
		expect(requests).toEqual(['GET /org/alpha/api/organization/setup/progress']);
		expect(screen.getByRole('link', { name: /Critical tasks/ })).toHaveAttribute(
			'href',
			'/org/alpha/setup/critical-tasks'
		);
	});

	it('shows a progress load error inside the popover', async () => {
		progress = () => Response.json({ message: 'Setup facts timed out' }, { status: 503 });
		renderResume(entry(true));

		await fireEvent.click(await screen.findByRole('button', { name: 'Resume setup' }));

		expect(await screen.findByRole('alert')).toHaveTextContent('Setup facts timed out');
		expect(screen.queryByRole('link')).toBeNull();
	});

	it('shows the button only when the owner has a reason to resume', async () => {
		const view = renderResume(Promise.resolve(null));
		await view.rerender({ entry: entry(false) });
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(screen.queryByRole('button')).toBeNull();

		await view.rerender({ entry: entry(true) });
		expect(await screen.findByRole('button', { name: 'Resume setup' })).toBeInTheDocument();
	});

	it('refreshes after Never ask again even when Escape is pressed while it saves', async () => {
		let reply!: (response: Response) => void;
		prompt = () => new Promise((resolve) => (reply = resolve));
		renderResume(entry(true));
		await fireEvent.click(await screen.findByRole('button', { name: 'Resume setup' }));
		await screen.findByText('10 of 12');

		await fireEvent.click(screen.getByRole('button', { name: 'Never ask again' }));
		await fireEvent.keyDown(document.body, { key: 'Escape' });
		reply(Response.json({ branch: 'army', answers: {}, finishedAt: null, prompts: { setup: { never: true } } }));

		await waitFor(() => expect(invalidate).toHaveBeenCalledWith('app:organization-setup'));
		expect(requests).toEqual([
			'GET /org/alpha/api/organization/setup/progress',
			'POST /org/alpha/api/organization/setup/prompt'
		]);
	});

	it('names a pending new feature after Never ask again and links to its step', async () => {
		const events = SETUP_STEPS.find(({ key }) => key === 'eventsAndTaskings')!;
		const state: SetupEntryData['state'] = {
			branch: 'army',
			answers: {},
			finishedAt: null,
			prompts: { setup: { never: true } }
		};
		const decision = setupEntry({
			isOwner: true,
			state,
			registry: [{ ...events, since: '2026-10-20' }],
			disabledFeatures: [],
			organizationCreatedOn: '2026-01-05',
			today: '2026-10-27'
		});
		renderResume(Promise.resolve({ orgId: 'org-1', today: '2026-10-27', state, entry: decision }));

		const link = await screen.findByRole('link', { name: /Events & Taskings/ });
		expect(link).toHaveAttribute('href', '/org/alpha/setup/events-and-taskings');
		expect(screen.queryByRole('button', { name: 'Resume setup' })).toBeNull();
	});
});
