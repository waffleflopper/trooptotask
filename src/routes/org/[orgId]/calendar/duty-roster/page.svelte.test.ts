// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';

describe('legacy duty roster page component', () => {
	it('keeps a deprecated fallback without depending on legacy roster payloads', () => {
		render(Page);

		expect(screen.getByRole('heading', { name: 'Duty Rosters moved.' })).toBeTruthy();
		expect(
			screen.getByText('This legacy Calendar route now redirects to the replacement Duty Rosters surface.')
		).toBeTruthy();
	});
});
