// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';

afterEach(() => {
	cleanup();
});

describe('privacy page contact', () => {
	it('links to the canonical privacy mailbox', () => {
		render(Page, {
			props: {
				data: { session: null, user: null }
			}
		});

		expect(screen.getByRole('link', { name: 'privacy@trooptotask.org' }).getAttribute('href')).toBe(
			'mailto:privacy@trooptotask.org'
		);
	});
});
