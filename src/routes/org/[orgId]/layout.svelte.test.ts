// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { readable } from 'svelte/store';
import Layout from './+layout.svelte';

vi.mock('$app/navigation', () => ({
	invalidate: vi.fn()
}));

vi.mock('$app/stores', () => ({
	page: readable({
		url: new URL('http://localhost/org/org-1')
	})
}));

const children = createRawSnippet(() => ({
	render: () => '<section>Org child</section>'
}));

afterEach(() => {
	cleanup();
});

describe('organization layout suspended contact', () => {
	it('renders the canonical support mailbox in the suspended shell', () => {
		render(Layout, {
			props: {
				children,
				data: {
					session: null,
					shell: {
						kind: 'suspended',
						org: {
							id: 'org-1',
							name: 'Demo Org',
							urlSegment: 'demo-org'
						},
						state: {
							isReadOnly: true,
							orgSuspended: true
						}
					}
				}
			}
		});

		expect(screen.getByText('support@trooptotask.org')).toBeTruthy();
	});
});
