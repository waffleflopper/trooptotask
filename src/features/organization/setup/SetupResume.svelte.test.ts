// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SetupEntryData } from './entry';
import SetupResume from './SetupResume.svelte';

const { invalidate } = vi.hoisted(() => ({ invalidate: vi.fn(async (_dependency: string) => {}) }));
vi.mock('$app/navigation', () => ({ invalidate, goto: vi.fn() }));

const requests: string[] = [];
let progress: () => Response;

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
	vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
		requests.push(String(input));
		return progress();
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
		entry: { prompt: null, resume }
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
		expect(requests).toEqual(['/org/alpha/api/organization/setup/progress']);
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
});
