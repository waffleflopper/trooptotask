// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import VisibleStub from '$lib/test-stubs/VisibleStub.svelte';

vi.mock('$app/stores', async () => {
	const { readable } = await import('svelte/store');

	return {
		page: readable({
			url: new URL('http://localhost/admin')
		})
	};
});

vi.mock('$lib/components/admin/AdminSearch.svelte', () => ({
	default: VisibleStub
}));

import Layout from './+layout.svelte';

afterEach(() => {
	cleanup();
});

const children = createRawSnippet(() => ({
	render: () => '<section>Admin child</section>'
}));

function renderLayout(accessiblePages: string[]) {
	return render(Layout, {
		props: {
			children,
			data: {
				session: null,
				adminUserId: 'admin-1',
				adminEmail: 'admin@example.test',
				adminRole: 'billing',
				accessiblePages,
				visibleNavGroups: [
					{
						label: null,
						items: [{ label: 'Dashboard', href: '/admin', page: 'dashboard' }]
					}
				]
			}
		}
	});
}

describe('admin layout', () => {
	it('hides global admin search when the admin cannot access users or organizations', () => {
		renderLayout(['dashboard', 'subscriptions', 'billing-events', 'gifting']);

		expect(screen.queryByTestId('visible-stub')).toBeNull();
	});

	it('shows global admin search when the admin can access support search targets', () => {
		renderLayout(['dashboard', 'users', 'organizations']);

		expect(screen.getAllByTestId('visible-stub')).toHaveLength(2);
	});
});
