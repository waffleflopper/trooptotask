// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';

afterEach(() => {
	cleanup();
});

describe('suspended page contact', () => {
	it('renders the canonical support mailbox', () => {
		render(Page);

		expect(screen.getByText('support@trooptotask.org')).toBeTruthy();
	});
});
