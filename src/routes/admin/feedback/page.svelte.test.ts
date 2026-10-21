// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { ActionResult, SubmitFunction } from '@sveltejs/kit';
import { frameworkOutcome } from '$lib/test-support/sveltekitEnhance';

const { submits, toastSuccess } = vi.hoisted(() => ({
	submits: [] as SubmitFunction[],
	toastSuccess: vi.fn()
}));

vi.mock('$app/navigation', () => ({ beforeNavigate: vi.fn(), invalidateAll: vi.fn() }));
vi.mock('$app/forms', () => ({
	enhance: (_form: HTMLFormElement, submit: SubmitFunction) => {
		submits.push(submit);
		return { destroy: () => {} };
	}
}));
vi.mock('$lib/stores/toast.svelte', () => ({ toastStore: { success: toastSuccess, error: vi.fn() } }));

import { invalidateAll } from '$app/navigation';
import Page from './+page.svelte';
import type { PageData } from './$types';

afterEach(() => {
	cleanup();
	submits.length = 0;
	toastSuccess.mockReset();
});

const item = {
	id: 'feedback-1',
	user_email: 'tester@example.mil',
	category: 'bug',
	message: 'Calendar export fails',
	created_at: '2026-10-01T12:00:00.000Z',
	organization_name: null,
	page_url: null,
	status: 'new' as const,
	admin_notes: null
};

function renderNewItem() {
	return render(Page, {
		data: { adminUserId: 'admin-1', newItems: [item], reviewedItems: [], resolvedItems: [] } as unknown as PageData,
		form: null
	});
}

describe('Admin Feedback status tabs', () => {
	it('opens and closes the editor from a card trigger that reports its state and controls the editor', async () => {
		renderNewItem();
		const toggle = screen.getByRole('button', { name: /tester@example\.mil/ });
		expect(toggle.getAttribute('aria-expanded')).toBe('false');

		await fireEvent.click(toggle);
		expect(toggle.getAttribute('aria-expanded')).toBe('true');
		const editor = document.getElementById(toggle.getAttribute('aria-controls') ?? '');
		expect(editor?.contains(screen.getByLabelText('Admin Notes'))).toBe(true);

		await fireEvent.click(toggle);
		expect(toggle.getAttribute('aria-expanded')).toBe('false');
		expect(screen.queryByLabelText('Admin Notes')).toBeNull();
	});

	it('confirms a saved note with the app toast', async () => {
		renderNewItem();
		await fireEvent.click(screen.getByRole('button', { name: /tester@example\.mil/ }));
		const form = screen.getByRole('button', { name: 'Save Notes' }).closest('form')!;
		const input = {
			formElement: form,
			formData: new FormData(form),
			action: new URL('http://localhost/admin/feedback?/update'),
			controller: new AbortController(),
			submitter: null,
			cancel: vi.fn()
		};
		const callback = await submits.at(-1)!(input);
		await act(() =>
			callback?.({
				...input,
				...frameworkOutcome(
					{ type: 'success', status: 200 },
					{ form, applyForm: async () => {}, invalidate: () => invalidateAll() }
				)
			})
		);
		expect(toastSuccess).toHaveBeenCalledWith('Feedback saved');
	});

	describe('focus after Save Notes', () => {
		async function saveNotes(result: ActionResult, movesToReviewed = false) {
			const view = renderNewItem();
			if (movesToReviewed)
				vi.mocked(invalidateAll).mockImplementationOnce(async () => {
					await view.rerender({
						data: {
							adminUserId: 'admin-1',
							newItems: [],
							reviewedItems: [{ ...item, status: 'reviewed' as const }],
							resolvedItems: []
						} as unknown as PageData
					});
				});
			const trigger = screen.getByRole('button', { name: /tester@example\.mil/ });
			await fireEvent.click(trigger);
			const save = screen.getByRole('button', { name: 'Save Notes' });
			const form = save.closest('form')!;
			const input = {
				formElement: form,
				formData: new FormData(form),
				action: new URL('http://localhost/admin/feedback?/update'),
				controller: new AbortController(),
				submitter: save,
				cancel: vi.fn()
			};
			const callback = await act(() => submits.at(-1)!(input));
			await act(() =>
				callback?.({
					...input,
					...frameworkOutcome(result, { form, applyForm: async () => {}, invalidate: () => invalidateAll() })
				})
			);
			return { trigger, save };
		}

		it('returns to Save Notes after a saved note', async () => {
			const { save } = await saveNotes({ type: 'success', status: 200 });
			await waitFor(() => expect(document.activeElement).toBe(save));
		});

		it('returns to Save Notes after a rejected save', async () => {
			const { save } = await saveNotes({ type: 'failure', status: 400, data: { error: 'Notes are too long' } });
			expect(screen.getByText('Notes are too long')).toBeTruthy();
			await waitFor(() => expect(document.activeElement).toBe(save));
		});

		it('keeps focus in the page when the saved status moves the item to another tab', async () => {
			await saveNotes({ type: 'success', status: 200 }, true);
			expect(screen.queryByRole('button', { name: 'Save Notes' })).toBeNull();
			await waitFor(() => expect(document.activeElement).not.toBe(document.body));
		});

		it('returns to the item trigger while Save Notes stays disabled for a reload', async () => {
			const { trigger, save } = await saveNotes({ type: 'error', error: new Error('offline') });
			expect((save as HTMLButtonElement).disabled).toBe(true);
			await waitFor(() => expect(document.activeElement).toBe(trigger));
		});
	});

	it('gives every status tab a panel its aria-controls resolves to', async () => {
		render(Page, {
			data: {
				adminUserId: 'admin-1',
				newItems: [item],
				reviewedItems: [{ ...item, id: 'feedback-2', message: 'Roster import stalls', status: 'reviewed' as const }],
				resolvedItems: []
			} as unknown as PageData,
			form: null
		});

		const tabs = screen.getAllByRole('tab');
		expect(tabs.map((tab) => tab.textContent?.replace(/\d+/g, '').trim())).toEqual(['New', 'Reviewed', 'Resolved']);
		for (const tab of tabs) {
			const panel = document.getElementById(tab.getAttribute('aria-controls') ?? '');
			expect(panel?.getAttribute('role')).toBe('tabpanel');
			expect(panel?.getAttribute('aria-labelledby')).toBe(tab.id);
		}

		await fireEvent.click(screen.getByRole('tab', { name: /Reviewed/ }));
		const reviewed = screen.getByRole('tab', { name: /Reviewed/ });
		const panel = document.getElementById(reviewed.getAttribute('aria-controls') ?? '');
		expect(panel?.hidden).toBe(false);
		expect(panel?.textContent).toContain('Roster import stalls');
		expect(panel?.textContent).not.toContain('Calendar export fails');
	});
});
