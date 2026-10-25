// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import type { ActionResult, SubmitFunction } from '@sveltejs/kit';
import { frameworkOutcome } from '$lib/test-support/sveltekitEnhance';
import type { WhatsNewListEntry } from '$features/platform-admin/contracts';
import type { PageData } from './$types';

const { forms, invalidateAll, gotoMock, navigation, pageState } = vi.hoisted(() => ({
	gotoMock: vi.fn(),
	forms: new Map<string, SubmitFunction>(),
	invalidateAll: vi.fn(),
	navigation: [] as Array<(event: { to: { url: URL } | null; from: { url: URL } | null }) => void>,
	pageState: { url: new URL('http://localhost/admin/announcements/whats-new') }
}));
vi.mock('$app/navigation', () => ({
	goto: gotoMock,
	invalidateAll,
	beforeNavigate: (callback: (typeof navigation)[number]) => navigation.push(callback)
}));
vi.mock('$app/state', () => ({ page: pageState }));
vi.mock('$app/forms', () => ({
	enhance: (form: HTMLFormElement, submit: SubmitFunction) => {
		forms.set(form.getAttribute('action') ?? '', submit);
		return { destroy: () => forms.delete(form.getAttribute('action') ?? '') };
	}
}));

import WhatsNew from './+page.svelte';

const draft: WhatsNewListEntry = {
	id: 'draft-1',
	title: 'Draft entry',
	paragraphs: ['Draft body'],
	publishedOn: null,
	updatedBy: 'operator-1',
	updatedAt: '2026-10-24T00:00:00Z',
	shownToUsers: false
};
const live: WhatsNewListEntry = {
	...draft,
	id: 'live-1',
	title: 'Live entry',
	paragraphs: ['First', 'Second'],
	publishedOn: '2026-10-20',
	shownToUsers: true
};
const old: WhatsNewListEntry = {
	...live,
	id: 'old-1',
	title: 'Old entry',
	publishedOn: '2026-01-01',
	shownToUsers: false
};

function data(entries: WhatsNewListEntry[] = [draft, live, old], actor = 'admin-a'): PageData {
	return {
		viewer: null,
		adminUserId: actor,
		visibleNavGroups: [],
		adminEmail: 'admin@example.test',
		accessiblePages: ['announcements'],
		entries: Promise.resolve({ status: 'loaded' as const, entries })
	};
}
function open(search = '') {
	pageState.url = new URL(`http://localhost/admin/announcements/whats-new${search}`);
}
async function renderPage(search = '', pageData = data()) {
	open(search);
	const view = render(WhatsNew, { props: { data: pageData, form: null } });
	await screen.findByRole('link', { name: /Draft entry|Live entry|Old entry/ }).catch(() => {});
	return view;
}
async function submit(button: HTMLElement) {
	await act();
	const form = button.closest('form')!;
	const input = {
		formElement: form,
		formData: new FormData(form),
		action: new URL(form.action),
		controller: new AbortController(),
		submitter: button,
		cancel: vi.fn()
	};
	let callback: Awaited<ReturnType<SubmitFunction>>;
	await act(async () => {
		callback = await forms.get(form.getAttribute('action') ?? '')!(input);
	});
	return {
		input,
		finish: async (result: ActionResult) => {
			await act(async () => {
				await callback!({
					...input,
					...frameworkOutcome(result, { form, applyForm: async () => {}, invalidate: () => invalidateAll() })
				});
			});
		}
	};
}

beforeEach(() => {
	invalidateAll.mockResolvedValue(undefined);
});
afterEach(() => {
	cleanup();
	forms.clear();
	navigation.length = 0;
	vi.resetAllMocks();
	open();
});

describe('admin What’s New', () => {
	it('lists drafts and published entries and marks the ones users see', async () => {
		await renderPage();
		const list = screen.getByRole('region', { name: 'Entries' });
		const items = within(list).getAllByRole('listitem');
		expect(items).toHaveLength(3);
		expect(within(items[0]).getByText('Draft')).toBeTruthy();
		expect(within(items[1]).getByText('Published')).toBeTruthy();
		expect(within(items[1]).getByText('Shown to users')).toBeTruthy();
		expect(within(items[2]).queryByText('Shown to users')).toBeNull();
	});

	it('shows a skeleton while the entries load', () => {
		open();
		render(WhatsNew, {
			props: { data: { ...data(), entries: new Promise(() => {}) } as PageData, form: null }
		});
		expect(screen.getAllByTestId('entry-skeleton').length).toBeGreaterThan(0);
	});

	it('shows the load error with a retry', async () => {
		open();
		render(WhatsNew, {
			props: { data: { ...data(), entries: Promise.resolve({ status: 'failed' as const }) }, form: null }
		});
		await fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
		await waitFor(() => expect(invalidateAll).toHaveBeenCalledOnce());
	});

	it('opens the selected entry from the URL with its paragraphs in order', async () => {
		await renderPage('?entry=live-1');
		expect(await screen.findByLabelText('Title')).toHaveProperty('value', 'Live entry');
		expect(screen.getByLabelText('Paragraph 1')).toHaveProperty('value', 'First');
		expect(screen.getByLabelText('Paragraph 2')).toHaveProperty('value', 'Second');
	});

	it('offers Publish and Delete Draft for a draft but neither for a published entry', async () => {
		const view = await renderPage('?entry=draft-1');
		expect(await screen.findByRole('button', { name: 'Publish' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Delete Draft' })).toBeTruthy();
		view.unmount();
		await renderPage('?entry=live-1');
		expect(await screen.findByRole('button', { name: 'Save Changes' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Delete Draft' })).toBeNull();
	});

	it('sends the operator’s calendar date only when publishing', async () => {
		await renderPage('?entry=draft-1');
		const publish = await screen.findByRole('button', { name: 'Publish' });
		const published = await submit(publish);
		expect(published.input.formData.get('publishOn')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		await published.finish({ type: 'failure', status: 400, data: { error: 'Add a paragraph before publishing' } });
		const saved = await submit(screen.getByRole('button', { name: 'Save Draft' }));
		expect(saved.input.formData.has('publishOn')).toBe(false);
	});

	it('reorders and removes paragraphs before saving', async () => {
		await renderPage('?entry=live-1');
		await fireEvent.click(await screen.findByRole('button', { name: 'Move paragraph 2 up' }));
		expect(screen.getByLabelText('Paragraph 1')).toHaveProperty('value', 'Second');
		await fireEvent.click(screen.getByRole('button', { name: 'Remove paragraph 1' }));
		expect(screen.queryByLabelText('Paragraph 2')).toBeNull();
		expect(screen.getByLabelText('Paragraph 1')).toHaveProperty('value', 'First');
		await fireEvent.click(screen.getByRole('button', { name: 'Add Paragraph' }));
		expect(screen.getByLabelText('Paragraph 2')).toHaveProperty('value', '');
	});

	it('keeps typed text through a failed save and shows the reason', async () => {
		await renderPage('?entry=draft-1');
		await fireEvent.input(await screen.findByLabelText('Title'), { target: { value: 'Typed title' } });
		await (
			await submit(screen.getByRole('button', { name: 'Save Draft' }))
		).finish({
			type: 'failure',
			status: 400,
			data: { error: 'Title is required' }
		});
		expect(screen.getByLabelText('Title')).toHaveProperty('value', 'Typed title');
		expect(screen.getByText('Title is required')).toBeTruthy();
	});

	it('requires a read-only reload after a save whose result is unknown', async () => {
		await renderPage('?entry=draft-1');
		await (
			await submit(await screen.findByRole('button', { name: 'Save Draft' }))
		).finish({
			type: 'error',
			status: 500,
			error: new Error('Private transport detail')
		});
		expect(screen.queryByText(/Private transport detail/)).toBeNull();
		expect(screen.getByRole('button', { name: 'Save Draft' })).toHaveProperty('disabled', true);
		invalidateAll.mockClear();
		await fireEvent.click(screen.getByRole('button', { name: 'Reload Entries' }));
		await waitFor(() => expect(screen.getByRole('button', { name: 'Save Draft' })).toHaveProperty('disabled', false));
		expect(invalidateAll).toHaveBeenCalledOnce();
	});

	it('asks before deleting a draft and ignores a reply that arrives after leaving the page', async () => {
		await renderPage('?entry=draft-1');
		const request = await submit(await screen.findByRole('button', { name: 'Delete Draft' }));
		expect(request.input.cancel).toHaveBeenCalledOnce();
		expect(screen.getByRole('alertdialog').textContent).toContain('Delete "Draft entry"?');
		const old = await submit(screen.getByRole('button', { name: 'Save Draft' }));
		await act(() =>
			navigation[0]({ to: { url: new URL('http://localhost/admin/audit') }, from: { url: pageState.url } })
		);
		await old.finish({ type: 'failure', status: 400, data: { error: 'Stale reply' } });
		expect(screen.queryByText('Stale reply')).toBeNull();
	});
});
