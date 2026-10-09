// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';

vi.mock('$app/navigation', () => ({ beforeNavigate: vi.fn(), invalidateAll: vi.fn() }));
vi.mock('$app/forms', () => ({ enhance: () => ({ destroy: () => {} }) }));

import Page from './+page.svelte';
import type { PageData } from './$types';

afterEach(() => cleanup());

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

describe('Admin Feedback status tabs', () => {
	it('gives every status tab a panel its aria-controls resolves to', async () => {
		render(Page, {
			data: {
				adminUserId: 'admin-1',
				newItems: [item],
				reviewedItems: [{ ...item, id: 'feedback-2', status: 'reviewed' as const }],
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
		expect(panel?.textContent).toContain('Calendar export fails');
	});
});
