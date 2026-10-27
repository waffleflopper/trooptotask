// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import PublicFooter from './PublicFooter.svelte';

afterEach(cleanup);

describe('public footer', () => {
	it('carries every public destination for narrow screens that hide the navigation', () => {
		render(PublicFooter);

		const destinations = Object.fromEntries(
			screen.getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')])
		);
		expect(destinations).toEqual({
			Platform: '/#platform',
			"What's next": '/#whats-next',
			FAQ: '/#faq',
			About: '/about',
			Security: '/security',
			Privacy: '/privacy',
			Terms: '/terms'
		});
	});

	it('marks the current page', () => {
		render(PublicFooter, { props: { active: 'about' } });

		expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('aria-current', 'page');
		expect(screen.getByRole('link', { name: 'Security' })).not.toHaveAttribute('aria-current');
	});
});
