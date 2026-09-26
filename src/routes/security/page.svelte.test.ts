// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';

afterEach(cleanup);

describe('security disclosure contact', () => {
	it('preserves the vulnerability mailbox and subject line', () => {
		render(Page, { props: { data: { session: null, user: null } } });

		expect(screen.getByRole('link', { name: 'security@trooptotask.org' }).getAttribute('href')).toBe(
			'mailto:security@trooptotask.org?subject=Security%20vulnerability%20report'
		);
	});
});
