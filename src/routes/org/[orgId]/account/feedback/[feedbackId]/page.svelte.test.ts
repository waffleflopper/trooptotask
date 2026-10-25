// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionResult } from '@sveltejs/kit';
import type { FeedbackStatus, ReporterFeedback } from '$features/feedback/contracts';
import Page from './+page.svelte';

const { actionResult, invalidateAll } = vi.hoisted(() => ({
	actionResult: { current: null as ActionResult | null },
	invalidateAll: vi.fn(async () => {})
}));

vi.mock('$features/app-shell', () => ({ getAppShellContext: () => ({ orgId: 'org-1', orgUrlSegment: 'alpha' }) }));
vi.mock('$app/navigation', () => ({ invalidateAll }));
vi.mock('$app/forms', () => ({
	enhance: (form: HTMLFormElement, submit: (input: { cancel: () => void }) => unknown) => {
		form.addEventListener('submit', async (event) => {
			event.preventDefault();
			let cancelled = false;
			const settle = submit({ cancel: () => (cancelled = true) }) as
				| ((outcome: { result: ActionResult; update: () => Promise<void> }) => Promise<void>)
				| undefined;
			if (!cancelled && settle && actionResult.current)
				await settle({ result: actionResult.current, update: async () => {} });
		});
	}
}));

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	actionResult.current = null;
});

const feedback = (status: FeedbackStatus): ReporterFeedback => ({
	id: '50000000-0000-4000-8000-000000186911',
	category: 'bug',
	message: 'Leave that crosses into November will not save',
	pageUrl: null,
	status,
	createdAt: '2026-10-23T02:40:00Z',
	replies: []
});

const renderPage = (status: FeedbackStatus) =>
	render(Page, { props: { data: { feedback: feedback(status) } } as never });

describe('reporter reply composer', () => {
	it.each<[FeedbackStatus, boolean]>([
		['new', true],
		['reviewed', true],
		['resolved', false]
	])('a %s item offers a reply: %s', (status, offered) => {
		renderPage(status);
		expect(screen.getByText('Leave that crosses into November will not save')).toBeTruthy();
		expect(screen.queryByRole('textbox', { name: 'Reply' }) !== null).toBe(offered);
		expect(screen.queryByRole('button', { name: 'Send reply' }) !== null).toBe(offered);
		expect(screen.queryByText(/This feedback is closed/) !== null).toBe(!offered);
	});

	it('keeps the draft and shows a failed send beside the field', async () => {
		actionResult.current = { type: 'failure', status: 503, data: { message: 'Unable to send your reply. Try again.' } };
		renderPage('reviewed');
		const field = screen.getByRole('textbox', { name: 'Reply' });
		await fireEvent.input(field, { target: { value: 'One more detail' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));

		await waitFor(() => expect(field.getAttribute('aria-invalid')).toBe('true'));
		expect((field as HTMLTextAreaElement).value).toBe('One more detail');
		expect(screen.getByRole('alert').textContent).toContain('Unable to send your reply. Try again.');
		expect(invalidateAll).not.toHaveBeenCalled();
	});

	it('reloads the item when the send is refused because it closed meanwhile', async () => {
		actionResult.current = { type: 'failure', status: 409, data: { message: 'This feedback is closed.' } };
		renderPage('reviewed');
		await fireEvent.input(screen.getByRole('textbox', { name: 'Reply' }), { target: { value: 'One more detail' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));

		await waitFor(() => expect(invalidateAll).toHaveBeenCalledOnce());
	});
});

it('shows a failed thread read as a retryable error with the way back to the list', async () => {
	render(Page, { props: { data: { feedback: null } } as never });

	expect(screen.getByRole('alert')).toBeTruthy();
	expect(screen.getByRole('link', { name: 'All feedback' }).getAttribute('href')).toBe('/org/alpha/account/feedback');
	expect(screen.queryByRole('textbox')).toBeNull();
	await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
	expect(invalidateAll).toHaveBeenCalledTimes(1);
});

it('keeps a draft when the same item reloads and starts over when another item opens', async () => {
	const view = render(Page, { props: { data: { feedback: feedback('reviewed') } } as never });
	await fireEvent.input(screen.getByRole('textbox', { name: 'Reply' }), { target: { value: 'Half a thought' } });

	await view.rerender({ data: { feedback: { ...feedback('reviewed') } } } as never);
	expect((screen.getByRole('textbox', { name: 'Reply' }) as HTMLTextAreaElement).value).toBe('Half a thought');

	await view.rerender({
		data: { feedback: { ...feedback('reviewed'), id: '22222222-2222-4222-8222-222222222222' } }
	} as never);
	expect((screen.getByRole('textbox', { name: 'Reply' }) as HTMLTextAreaElement).value).toBe('');
});
