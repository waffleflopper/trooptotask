// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import Page from './+page.svelte';

type ObserverCallback = (entries: Partial<IntersectionObserverEntry>[]) => void;

/** An IntersectionObserver that reports every observed element as on screen, and motion allowed. */
function stubMotion() {
	vi.stubGlobal(
		'IntersectionObserver',
		class {
			constructor(private callback: ObserverCallback) {}
			observe() {
				this.callback([{ isIntersecting: true }]);
			}
			disconnect() {}
		}
	);
	vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('no-preference') }));
}

function renderPage(signedIn = false) {
	return render(Page, { props: { data: { viewer: null, signedIn } } });
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe('landing page', () => {
	it('sends a signed-out visitor to reviewed access', () => {
		const page = within(renderPage(false).getByRole('main'));

		const links = page.getAllByRole('link', { name: /request access/i });
		expect(links.length).toBeGreaterThan(0);
		for (const link of links) expect(link).toHaveAttribute('href', '/auth/request-access');
		expect(page.queryByRole('link', { name: /go to dashboard/i })).not.toBeInTheDocument();
	});

	it('sends a signed-in visitor to the dashboard instead', () => {
		const page = within(renderPage(true).getByRole('main'));

		const links = page.getAllByRole('link', { name: /go to dashboard/i });
		expect(links.length).toBeGreaterThan(0);
		for (const link of links) expect(link).toHaveAttribute('href', '/dashboard?show=all');
		expect(page.queryByRole('link', { name: /request access/i })).not.toBeInTheDocument();
	});

	it('keeps one FAQ answer open at a time, by mouse and by keyboard', async () => {
		const user = userEvent.setup();
		renderPage();
		const statuses = screen.getByRole('button', { name: /calendar statuses fixed/i });
		const roster = screen.getByRole('button', { name: /roster in a spreadsheet/i });
		const exports = screen.getByRole('button', { name: /export data/i });

		expect(roster).toHaveAttribute('aria-expanded', 'true');
		expect(statuses).toHaveAttribute('aria-expanded', 'false');

		await user.click(statuses);
		expect(statuses).toHaveAttribute('aria-expanded', 'true');
		expect(roster).toHaveAttribute('aria-expanded', 'false');

		exports.focus();
		await user.keyboard('{Enter}');
		expect(exports).toHaveAttribute('aria-expanded', 'true');
		expect(statuses).toHaveAttribute('aria-expanded', 'false');

		await user.keyboard(' ');
		expect(exports).toHaveAttribute('aria-expanded', 'false');
	});

	it('lights the chosen leader tier and the Soldiers it covers', async () => {
		const user = userEvent.setup();
		renderPage();
		const tiers = within(screen.getByRole('group', { name: 'Access tiers' }));
		const squad = tiers.getByRole('button', { name: /squad leader/i });
		const platoon = tiers.getByRole('button', { name: /platoon sergeant/i });
		const team = tiers.getByRole('button', { name: /team leader/i });

		expect(squad).toHaveAttribute('aria-pressed', 'true');
		expect(screen.getByText(/SEES 9 · UPDATES 9/)).toBeInTheDocument();

		await user.click(platoon);
		expect(platoon).toHaveAttribute('aria-pressed', 'true');
		expect(squad).toHaveAttribute('aria-pressed', 'false');
		expect(screen.getByText(/SEES 27 · UPDATES 27/)).toBeInTheDocument();

		await fireEvent.focus(team);
		expect(team).toHaveAttribute('aria-pressed', 'true');
		expect(screen.getByText(/SEES 4 · UPDATES 4/)).toBeInTheDocument();
		expect(squad).toHaveAttribute('aria-pressed', 'false');
		expect(platoon).toHaveAttribute('aria-pressed', 'false');
	});

	it('cycles through the tiers on its own until a visitor points at one', async () => {
		vi.useFakeTimers();
		stubMotion();
		renderPage();
		const tiers = within(screen.getByRole('group', { name: 'Access tiers' }));
		const squad = tiers.getByRole('button', { name: /squad leader/i });
		const team = tiers.getByRole('button', { name: /team leader/i });
		const commander = tiers.getByRole('button', { name: /commander/i });

		expect(squad).toHaveAttribute('aria-pressed', 'true');
		await vi.advanceTimersByTimeAsync(2400);
		expect(team).toHaveAttribute('aria-pressed', 'true');
		await vi.advanceTimersByTimeAsync(2400);
		expect(commander).toHaveAttribute('aria-pressed', 'true');

		await fireEvent.pointerEnter(squad);
		await vi.advanceTimersByTimeAsync(5000);
		expect(squad).toHaveAttribute('aria-pressed', 'true');
	});
});
