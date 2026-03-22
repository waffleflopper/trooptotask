// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import PageToolbarTest from './PageToolbarTest.svelte';

function renderToolbar(overrides: Record<string, unknown> = {}) {
	return render(PageToolbarTest, {
		props: {
			title: 'Personnel',
			...overrides
		}
	});
}

describe('PageToolbar', () => {
	beforeEach(() => {
		cleanup();
	});

	describe('existing usage', () => {
		it('should render title', () => {
			renderToolbar();
			expect(screen.getByText('Personnel')).toBeTruthy();
		});
	});

	describe('variants', () => {
		it('should apply compact class', () => {
			renderToolbar({ variant: 'compact' });
			const toolbar = screen.getByTestId('page-toolbar');
			expect(toolbar.className).toContain('compact');
		});

		it('should apply transparent class', () => {
			renderToolbar({ variant: 'transparent' });
			const toolbar = screen.getByTestId('page-toolbar');
			expect(toolbar.className).toContain('transparent');
		});
	});

	describe('sticky', () => {
		it('should apply sticky class', () => {
			renderToolbar({ sticky: true });
			const toolbar = screen.getByTestId('page-toolbar');
			expect(toolbar.className).toContain('sticky');
		});
	});

	describe('breadcrumbs', () => {
		it('should render breadcrumb trail', () => {
			renderToolbar({
				breadcrumbs: [{ label: 'Personnel', href: '/personnel' }, { label: 'John Smith' }]
			});

			const links = screen.getAllByRole('link');
			expect(links[0].textContent).toBe('Personnel');
			expect(links[0].getAttribute('href')).toBe('/personnel');

			// Last crumb is current page (no link)
			expect(screen.getByText('John Smith')).toBeTruthy();
		});
	});

	describe('subtitle', () => {
		it('should render subtitle text', () => {
			renderToolbar({ subtitle: '42 total' });
			const sub = screen.getByText('42 total');
			expect(sub).toBeTruthy();
			expect(sub.className).toContain('toolbar-subtitle');
		});
	});

	describe('leading snippet', () => {
		it('should render leading content instead of title', () => {
			renderToolbar({ useLeading: true });
			expect(screen.getByTestId('custom-leading')).toBeTruthy();
			expect(screen.queryByText('Personnel')).toBeNull();
		});
	});

	describe('below snippet', () => {
		it('should render below content', () => {
			renderToolbar({ useBelow: true });
			expect(screen.getByTestId('custom-below')).toBeTruthy();
		});
	});
});
