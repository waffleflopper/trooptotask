// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import type { SubmitFunction } from '@sveltejs/kit';

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
	it('is titled Feedback', () => {
		renderNewItem();
		expect(screen.getByRole('heading', { level: 1 }).textContent?.trim()).toBe('Feedback');
	});

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
		await act(() => callback?.({ ...input, result: { type: 'success', status: 200 }, update: async () => {} }));
		expect(toastSuccess).toHaveBeenCalledWith('Feedback saved');
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
