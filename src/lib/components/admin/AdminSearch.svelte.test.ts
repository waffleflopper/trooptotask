// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import AdminSearch from './AdminSearch.svelte';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

it('opens server-matched User and Organization records by keyboard with accessible selection', async () => {
	vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
	vi.stubGlobal(
		'fetch',
		vi.fn().mockResolvedValue(
			Response.json({
				users: [{ id: 'user-alpha', email: 'alpha@example.test', orgCount: 1 }],
				organizations: [{ id: 'org-bravo', name: 'Bravo Clinic', personnelCount: 2 }]
			})
		)
	);
	const { container } = render(AdminSearch);
	const input = screen.getByRole('combobox');
	expect(input.getAttribute('aria-expanded')).toBe('false');
	input.focus();
	// Server matches may use fields that are absent from the displayed label.
	await fireEvent.input(input, { target: { value: 'server-match' } });
	await vi.advanceTimersByTimeAsync(250);
	vi.useRealTimers();
	const user = await screen.findByRole('option', { name: /alpha@example.test/ });
	const org = screen.getByRole('option', { name: /Bravo Clinic/ });
	const destinations: string[] = [];
	container.addEventListener('click', (event) => {
		const link = (event.target as Element).closest('a');
		if (link) {
			event.preventDefault();
			destinations.push(link.getAttribute('href')!);
		}
	});
	await fireEvent.keyDown(input, { key: 'ArrowDown' });
	await fireEvent.keyDown(input, { key: 'Enter' });
	await waitFor(() => expect(destinations).toEqual(['/admin/organizations/org-bravo']));
	expect(screen.getByRole('combobox', { name: 'Search platform admin records' })).toBe(input);
	expect(input.getAttribute('aria-controls')).toBe(screen.getByRole('listbox').id);
	expect(input.getAttribute('aria-expanded')).toBe('true');
	expect(input.getAttribute('aria-activedescendant')).toBe(org.id);
	expect(org.getAttribute('aria-selected')).toBe('true');
	expect(document.activeElement).toBe(input);
	await fireEvent.keyDown(input, { key: 'ArrowUp' });
	await fireEvent.keyDown(input, { key: 'Enter' });
	expect(destinations).toEqual(['/admin/organizations/org-bravo', '/admin/users/user-alpha']);
	expect(input.getAttribute('aria-activedescendant')).toBe(user.id);
});

it('dismisses on blur, reopens on focus and preserves mouse navigation', async () => {
	vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
	vi.stubGlobal(
		'fetch',
		vi.fn().mockResolvedValue(
			Response.json({
				users: [],
				organizations: [{ id: 'org-bravo', name: 'Bravo Clinic', personnelCount: 2 }]
			})
		)
	);
	render(AdminSearch);
	const input = screen.getByRole('combobox', { name: 'Search platform admin records' });
	input.focus();
	await fireEvent.input(input, { target: { value: 'Bravo' } });
	await vi.advanceTimersByTimeAsync(250);
	const option = screen.getByRole('option', { name: /Bravo Clinic/ });
	const destinations: string[] = [];
	option.addEventListener('click', (event) => {
		event.preventDefault();
		destinations.push(option.getAttribute('href')!);
	});
	// Native mouse ordering moves focus before click; blur must leave time to activate the link.
	await fireEvent.mouseDown(option);
	input.blur();
	await fireEvent.mouseUp(option);
	await fireEvent.click(option);
	expect(destinations).toEqual(['/admin/organizations/org-bravo']);
	await vi.advanceTimersByTimeAsync(160);
	expect(screen.queryByRole('listbox')).toBeNull();
	expect(input.getAttribute('aria-expanded')).toBe('false');
	expect(input.hasAttribute('aria-activedescendant')).toBe(false);
	input.focus();
	await vi.advanceTimersByTimeAsync(0);
	expect(screen.getByRole('listbox')).toBeTruthy();
	expect(input.getAttribute('aria-expanded')).toBe('true');
	await fireEvent.input(input, { target: { value: 'Br' } });
	expect(screen.queryByRole('listbox')).toBeNull();
	expect(input.getAttribute('aria-expanded')).toBe('false');
});
