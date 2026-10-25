// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import type { ActionResult, SubmitFunction } from '@sveltejs/kit';
import { frameworkOutcome } from '$lib/test-support/sveltekitEnhance';
import type { WhatsNewListEntry } from '$features/platform-admin/contracts';
import type { PageData } from './$types';

const { forms, invalidateAll, gotoMock, navigation } = vi.hoisted(() => ({
	gotoMock: vi.fn(),
	forms: new Map<string, SubmitFunction>(),
	invalidateAll: vi.fn(),
	navigation: [] as Array<(event: { to: { url: URL } | null; from: { url: URL } | null }) => void>
}));
vi.mock('$app/navigation', () => ({
	goto: gotoMock,
	invalidateAll,
	beforeNavigate: (callback: (typeof navigation)[number]) => navigation.push(callback)
}));
vi.mock('$app/state', async () => {
	const { SvelteURL } = await import('svelte/reactivity');
	return { page: { url: new SvelteURL('http://localhost/admin/announcements/whats-new') } };
});
vi.mock('$app/forms', () => ({
	enhance: (form: HTMLFormElement, submit: SubmitFunction) => {
		forms.set(form.getAttribute('action') ?? '', submit);
		return { destroy: () => forms.delete(form.getAttribute('action') ?? '') };
	}
}));

import { page as pageState } from '$app/state';
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

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}
type Entries = PageData['entries'];
function data(entries: WhatsNewListEntry[] | Entries = [draft, live, old], actor = 'admin-a'): PageData {
	return {
		viewer: null,
		adminUserId: actor,
		visibleNavGroups: [],
		adminEmail: 'admin@example.test',
		accessiblePages: ['announcements'],
		entries: Array.isArray(entries) ? Promise.resolve({ status: 'loaded' as const, entries }) : entries
	};
}
function open(search = '') {
	pageState.url.search = search;
}
async function renderPage(search = '', pageData = data()) {
	open(search);
	const view = render(WhatsNew, { props: { data: pageData, form: null } });
	await screen.findByRole('link', { name: /Draft entry|Live entry|Old entry/ }).catch(() => {});
	return view;
}
async function submit(button: HTMLElement) {
	await act();
	const form = (button as HTMLButtonElement).form!;
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
		const draftRow = screen.getByRole('link', { name: /Draft entry/ });
		expect(within(draftRow).getByText('Draft')).toBeTruthy();
		expect(within(draftRow).queryByText(/Shown in app/)).toBeNull();
		const liveRow = screen.getByRole('link', { name: /Live entry/ });
		expect(within(liveRow).getByText('Published')).toBeTruthy();
		expect(within(liveRow).getByText(/Shown in app/)).toBeTruthy();
		const oldRow = screen.getByRole('link', { name: /Old entry/ });
		expect(within(oldRow).getByText('Published')).toBeTruthy();
		expect(within(oldRow).queryByText(/Shown in app/)).toBeNull();
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

	it('offers Publish and Delete draft for a draft but neither for a published entry', async () => {
		const view = await renderPage('?entry=draft-1');
		expect(await screen.findByRole('button', { name: 'Publish' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Delete draft' })).toBeTruthy();
		view.unmount();
		await renderPage('?entry=live-1');
		expect(await screen.findByRole('button', { name: 'Save changes' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Delete draft' })).toBeNull();
	});

	it('sends the operator’s calendar date only when publishing', async () => {
		await renderPage('?entry=draft-1');
		const publish = await screen.findByRole('button', { name: 'Publish' });
		const published = await submit(publish);
		expect(published.input.formData.get('publishOn')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		await published.finish({ type: 'failure', status: 400, data: { error: 'Add a paragraph before publishing' } });
		const saved = await submit(screen.getByRole('button', { name: 'Save draft' }));
		expect(saved.input.formData.has('publishOn')).toBe(false);
	});

	it('reorders and removes paragraphs before saving', async () => {
		await renderPage('?entry=live-1');
		await fireEvent.click(await screen.findByRole('button', { name: 'Move paragraph 2 up' }));
		expect(screen.getByLabelText('Paragraph 1')).toHaveProperty('value', 'Second');
		await fireEvent.click(screen.getByRole('button', { name: 'Remove paragraph 1' }));
		expect(screen.queryByLabelText('Paragraph 2')).toBeNull();
		expect(screen.getByLabelText('Paragraph 1')).toHaveProperty('value', 'First');
		await fireEvent.click(screen.getByRole('button', { name: 'Add paragraph' }));
		expect(screen.getByLabelText('Paragraph 2')).toHaveProperty('value', '');
	});

	it('locks the editor from submit until the fresh read lands, then shows the saved version', async () => {
		const view = await renderPage('?entry=live-1');
		const request = await submit(await screen.findByRole('button', { name: 'Save changes' }));
		const title = screen.getByLabelText('Title') as HTMLInputElement;
		expect(title.readOnly).toBe(true);
		expect(screen.getByRole('button', { name: 'Move paragraph 2 up' })).toHaveProperty('disabled', true);
		await request.finish({ type: 'success', status: 200, data: { id: 'live-1' } });
		expect(title.readOnly).toBe(true);
		expect(screen.getByRole('button', { name: /Save changes/ }).getAttribute('aria-busy')).toBe('true');

		const readback = deferred<Awaited<Entries>>();
		await act(async () => {
			await view.rerender({ data: data(readback.promise), form: null });
		});
		expect(title.readOnly).toBe(true);
		await act(async () => {
			readback.resolve({
				status: 'loaded',
				entries: [draft, { ...live, title: 'Live entry, as saved', paragraphs: ['Trimmed'] }, old]
			});
		});
		await waitFor(() => expect(title.readOnly).toBe(false));
		expect(title.value).toBe('Live entry, as saved');
		expect(screen.getByLabelText('Paragraph 1')).toHaveProperty('value', 'Trimmed');
		expect(screen.getByRole('button', { name: /Save changes/ }).getAttribute('aria-busy')).toBeNull();
	});

	it('opens a new entry only after the read that includes it has landed', async () => {
		const view = await renderPage('?entry=new');
		await fireEvent.input(await screen.findByLabelText('Title'), { target: { value: 'Brand new' } });
		const request = await submit(screen.getByRole('button', { name: 'Save draft' }));
		await request.finish({ type: 'success', status: 200, data: { id: 'created-1' } });
		expect(gotoMock).not.toHaveBeenCalled();

		await act(async () => {
			await view.rerender({
				data: data([{ ...draft, id: 'created-1', title: 'Brand new' }, draft, live, old]),
				form: null
			});
		});
		await waitFor(() =>
			expect(gotoMock).toHaveBeenCalledWith('/admin/announcements/whats-new?entry=created-1', expect.anything())
		);
	});

	it('keeps writes blocked when the read after a save fails, until a reload lands', async () => {
		const view = await renderPage('?entry=live-1');
		await (
			await submit(await screen.findByRole('button', { name: 'Save changes' }))
		).finish({ type: 'success', status: 200, data: { id: 'live-1' } });
		await act(async () => {
			await view.rerender({ data: data(Promise.resolve({ status: 'failed' as const })), form: null });
		});
		expect(await screen.findByText(/Saved, but entries could not be refreshed/)).toBeTruthy();
		const reloadButton = screen.getByRole('button', { name: 'Reload entries' });

		await fireEvent.click(reloadButton);
		const readback = deferred<Awaited<Entries>>();
		await act(async () => {
			await view.rerender({ data: data(readback.promise), form: null });
		});
		expect(screen.getByRole('button', { name: 'Save changes' })).toHaveProperty('disabled', true);
		await act(async () => {
			readback.resolve({ status: 'loaded', entries: [draft, live, old] });
		});
		await waitFor(() => expect(screen.getByRole('button', { name: 'Save changes' })).toHaveProperty('disabled', false));
		expect(screen.queryByRole('button', { name: 'Reload entries' })).toBeNull();
	});

	it('keeps typed text through a failed save and shows the reason', async () => {
		await renderPage('?entry=draft-1');
		await fireEvent.input(await screen.findByLabelText('Title'), { target: { value: 'Typed title' } });
		await (
			await submit(screen.getByRole('button', { name: 'Save draft' }))
		).finish({
			type: 'failure',
			status: 400,
			data: { error: 'Title is required' }
		});
		expect(screen.getByLabelText('Title')).toHaveProperty('value', 'Typed title');
		expect(screen.getByText('Title is required')).toBeTruthy();
	});

	it('requires a read-only reload after a save whose result is unknown', async () => {
		const view = await renderPage('?entry=draft-1');
		await (
			await submit(await screen.findByRole('button', { name: 'Save draft' }))
		).finish({
			type: 'error',
			status: 500,
			error: new Error('Private transport detail')
		});
		expect(screen.queryByText(/Private transport detail/)).toBeNull();
		expect(screen.getByRole('button', { name: 'Save draft' })).toHaveProperty('disabled', true);
		invalidateAll.mockClear();
		await fireEvent.click(screen.getByRole('button', { name: 'Reload entries' }));
		expect(screen.getByRole('button', { name: 'Save draft' })).toHaveProperty('disabled', true);
		await act(async () => {
			await view.rerender({ data: data(), form: null });
		});
		await waitFor(() => expect(screen.getByRole('button', { name: 'Save draft' })).toHaveProperty('disabled', false));
		expect(invalidateAll).toHaveBeenCalledOnce();
	});

	it('keeps the typed draft through a failed reload and the reload that follows', async () => {
		const view = await renderPage('?entry=draft-1');
		await fireEvent.input(await screen.findByLabelText('Title'), { target: { value: 'Typed title' } });
		await fireEvent.input(screen.getByLabelText('Paragraph 1'), { target: { value: 'Typed body' } });
		await (
			await submit(screen.getByRole('button', { name: 'Save draft' }))
		).finish({ type: 'error', status: 500, error: new Error('dropped') });

		await fireEvent.click(screen.getByRole('button', { name: 'Reload entries' }));
		await act(async () => {
			await view.rerender({ data: data(Promise.resolve({ status: 'failed' as const })), form: null });
		});
		expect(await screen.findByText(/could not be refreshed/)).toBeTruthy();
		expect(screen.getByLabelText('Title')).toHaveProperty('value', 'Typed title');
		expect(screen.getByLabelText('Paragraph 1')).toHaveProperty('value', 'Typed body');

		await fireEvent.click(screen.getByRole('button', { name: 'Reload entries' }));
		await act(async () => {
			await view.rerender({ data: data(), form: null });
		});
		await waitFor(() => expect(screen.getByRole('button', { name: 'Save draft' })).toHaveProperty('disabled', false));
		expect(screen.getByLabelText('Title')).toHaveProperty('value', 'Typed title');
		expect(screen.getByLabelText('Paragraph 1')).toHaveProperty('value', 'Typed body');
	});

	it('leaves the deleted entry’s address once the delete succeeds, even after its editor is gone', async () => {
		await renderPage('?entry=draft-1');
		await submit(await screen.findByRole('button', { name: 'Delete draft' }));
		await fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
		const deleteForm = screen.getByRole('button', { name: 'Delete draft' }).closest('form')!;
		const detached = document.createElement('form');
		const input = {
			formElement: detached,
			formData: new FormData(deleteForm),
			action: new URL(deleteForm.action),
			controller: new AbortController(),
			submitter: null,
			cancel: vi.fn()
		};
		let callback: Awaited<ReturnType<SubmitFunction>>;
		await act(async () => {
			callback = await forms.get('?/delete')!(input);
		});
		expect(input.cancel).not.toHaveBeenCalled();
		await act(async () => {
			await callback!({
				...input,
				...frameworkOutcome(
					{ type: 'success', status: 200, data: { deleted: true } },
					{ form: deleteForm, applyForm: async () => {}, invalidate: () => invalidateAll() }
				)
			});
		});
		expect(gotoMock).toHaveBeenCalledWith('/admin/announcements/whats-new', expect.anything());
	});

	it('closes the delete confirmation when Back lands on another entry', async () => {
		await renderPage('?entry=draft-1');
		await submit(await screen.findByRole('button', { name: 'Delete draft' }));
		expect(screen.getByRole('alertdialog').textContent).toContain('Delete "Draft entry"?');
		await act(async () => {
			pageState.url.search = '?entry=live-1';
		});
		expect(screen.queryByRole('alertdialog')).toBeNull();
		expect(await screen.findByLabelText('Title')).toHaveProperty('value', 'Live entry');
	});

	it('asks before deleting a draft and ignores a reply that arrives after leaving the page', async () => {
		await renderPage('?entry=draft-1');
		const request = await submit(await screen.findByRole('button', { name: 'Delete draft' }));
		expect(request.input.cancel).toHaveBeenCalledOnce();
		expect(screen.getByRole('alertdialog').textContent).toContain('Delete "Draft entry"?');
		const old = await submit(screen.getByRole('button', { name: 'Save draft' }));
		await act(() =>
			navigation[0]({ to: { url: new URL('http://localhost/admin/audit') }, from: { url: pageState.url } })
		);
		await old.finish({ type: 'failure', status: 400, data: { error: 'Stale reply' } });
		expect(screen.queryByText('Stale reply')).toBeNull();
	});
});
