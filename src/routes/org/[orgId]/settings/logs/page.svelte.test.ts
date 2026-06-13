// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import Page from './+page.svelte';

afterEach(() => {
	cleanup();
});

describe('logs settings page', () => {
	it('renders a safe fallback when logs settings are unavailable', () => {
		render(Page, {
			props: {
				data: {} as never,
				form: null,
				params: { orgId: 'org-1' }
			}
		});

		expect(screen.getByRole('heading', { name: 'Audit Log' })).toBeTruthy();
		expect(screen.getByText('Organization logs are not available.')).toBeTruthy();
	});
});
