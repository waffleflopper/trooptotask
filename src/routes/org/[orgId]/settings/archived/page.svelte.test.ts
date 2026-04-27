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

describe('settings archived personnel page toolbar', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it('keeps the retention summary as passive toolbar meta', () => {
		render(Page, {
			props: {
				data: {
					retentionMonths: 36,
					archivedPersonnel: []
				} as never
			}
		});

		expect(screen.getByRole('toolbar', { name: 'Archived personnel status' })).toBeTruthy();
		expect(screen.getByRole('status', { name: 'Retention: 36 mo' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Retention: 36 mo' })).toBeNull();
	});
});
