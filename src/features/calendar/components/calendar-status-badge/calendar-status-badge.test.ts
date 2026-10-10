// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { CalendarStatusBadge } from './index';

afterEach(cleanup);

describe('CalendarStatusBadge', () => {
	it('paints the user-chosen status colors and keeps caller classes', () => {
		render(CalendarStatusBadge, {
			props: {
				statusType: { id: 'leave', name: 'Leave', color: '#dc2626', textColor: '#ffffff' },
				class: 'font-mono',
				children: createRawSnippet(() => ({ render: () => '<span>Leave</span>' }))
			}
		});

		const badge = screen.getByText('Leave').parentElement!;
		expect(badge.style.backgroundColor).toBe('#dc2626');
		expect(badge.style.color).toBe('#ffffff');
		expect(badge.classList.contains('font-mono')).toBe(true);
	});
});
