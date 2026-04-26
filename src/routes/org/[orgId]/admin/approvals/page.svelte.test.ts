// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/stores', () => ({
	page: {
		subscribe(run: (value: { params: { orgId: string } }) => void) {
			run({ params: { orgId: 'org-1' } });
			return () => {};
		}
	}
}));

vi.mock('$app/navigation', () => ({
	invalidateAll: vi.fn()
}));

import Page from './+page.svelte';

describe('admin approvals page toolbar', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it('keeps the filtered request count as passive toolbar meta', () => {
		render(Page, {
			props: {
				data: {
					requests: [
						{
							id: 'request-1',
							status: 'pending',
							requester_email: 'requester@example.com',
							resource_description: 'Delete record',
							resource_type: 'personnel',
							resource_url: null,
							created_at: '2026-04-01T12:00:00Z',
							denial_reason: null
						}
					]
				} as never
			}
		});

		expect(screen.getByRole('toolbar', { name: 'Approval request filters' })).toBeTruthy();
		expect(screen.getByRole('status', { name: '1 shown' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: '1 shown' })).toBeNull();
	});
});
