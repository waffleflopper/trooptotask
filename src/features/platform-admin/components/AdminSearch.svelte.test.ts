// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import AdminSearch from './AdminSearch.svelte';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

function pendingResponse() {
	let resolve!: (response: Response) => void;
	const promise = new Promise<Response>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

function userResult(id: string) {
	return Response.json({ users: [{ id, email: `${id}@example.test`, orgCount: 1 }], organizations: [] });
}

it('keeps cleared input empty when an obsolete response arrives', async () => {
	vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
	const pending = pendingResponse();
	vi.stubGlobal(
		'fetch',
		vi.fn(() => pending.promise)
	);
	render(AdminSearch);
	const input = screen.getByRole('combobox');
	input.focus();
	await fireEvent.input(input, { target: { value: 'obsolete' } });
	await vi.advanceTimersByTimeAsync(250);
	await fireEvent.input(input, { target: { value: '' } });
	pending.resolve(userResult('obsolete'));
	await vi.advanceTimersByTimeAsync(0);
	expect(screen.queryByRole('listbox')).toBeNull();
	expect(screen.queryByRole('option')).toBeNull();
	expect(input.getAttribute('aria-expanded')).toBe('false');
});

it('keeps the current matches when responses arrive in reverse order', async () => {
	vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
	const old = pendingResponse(),
		current = pendingResponse();
	vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise));
	render(AdminSearch);
	const input = screen.getByRole('combobox');
	input.focus();
	await fireEvent.input(input, { target: { value: 'old-query' } });
	await vi.advanceTimersByTimeAsync(250);
	await fireEvent.input(input, { target: { value: 'current-query' } });
	await vi.advanceTimersByTimeAsync(250);
	current.resolve(userResult('current'));
	await vi.advanceTimersByTimeAsync(0);
	old.resolve(userResult('obsolete'));
	await vi.advanceTimersByTimeAsync(0);
	expect(screen.getByRole('option', { name: /current@example.test/ })).toBeTruthy();
	expect(screen.queryByRole('option', { name: /obsolete@example.test/ })).toBeNull();
});

it('does not reopen a blurred search when its response arrives', async () => {
	vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
	const pending = pendingResponse();
	vi.stubGlobal(
		'fetch',
		vi.fn(() => pending.promise)
	);
	render(AdminSearch);
	const input = screen.getByRole('combobox');
	input.focus();
	await fireEvent.input(input, { target: { value: 'current' } });
	await vi.advanceTimersByTimeAsync(250);
	input.blur();
	await vi.advanceTimersByTimeAsync(160);
	pending.resolve(userResult('current'));
	await vi.advanceTimersByTimeAsync(0);
	expect(screen.queryByRole('listbox')).toBeNull();
	input.focus();
	await vi.advanceTimersByTimeAsync(0);
	expect(screen.getByRole('option', { name: /current@example.test/ })).toBeTruthy();
});

it('cancels scheduled lookup on unmount and reports a failed lookup with a working retry', async () => {
	vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
	const fetch = vi
		.fn()
		.mockResolvedValueOnce(new Response('', { status: 503 }))
		.mockResolvedValueOnce(userResult('recovered'));
	vi.stubGlobal('fetch', fetch);
	const first = render(AdminSearch);
	await fireEvent.input(screen.getByRole('combobox'), { target: { value: 'scheduled' } });
	first.unmount();
	await vi.advanceTimersByTimeAsync(250);
	expect(fetch).not.toHaveBeenCalled();
	render(AdminSearch);
	const input = screen.getByRole('combobox');
	input.focus();
	await fireEvent.input(input, { target: { value: 'failed' } });
	await vi.advanceTimersByTimeAsync(250);
	expect(screen.getByRole('alert').textContent).toContain('Search could not be loaded');
	expect(screen.queryByRole('option')).toBeNull();
	await fireEvent.input(input, { target: { value: 'recovered' } });
	await vi.advanceTimersByTimeAsync(250);
	expect(screen.queryByRole('alert')).toBeNull();
	expect(screen.getByRole('option', { name: /recovered@example.test/ })).toBeTruthy();
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

it('opens each Organization by keyboard when result labels are identical', async () => {
	vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
	vi.stubGlobal(
		'fetch',
		vi.fn().mockResolvedValue(
			Response.json({
				users: [],
				organizations: [
					{ id: 'org-first', name: 'Duplicate Clinic', personnelCount: 0 },
					{ id: 'org-second', name: 'Duplicate Clinic', personnelCount: 0 }
				]
			})
		)
	);
	const { container } = render(AdminSearch);
	const input = screen.getByRole('combobox', { name: 'Search platform admin records' });
	input.focus();
	await fireEvent.input(input, { target: { value: 'Duplicate' } });
	await vi.advanceTimersByTimeAsync(250);
	vi.useRealTimers();
	await screen.findAllByRole('option', { name: /Duplicate Clinic/ });
	const destinations: string[] = [];
	container.addEventListener('click', (event) => {
		const link = (event.target as Element).closest('a');
		if (link) {
			event.preventDefault();
			destinations.push(link.getAttribute('href')!);
		}
	});
	await fireEvent.keyDown(input, { key: 'Home' });
	await fireEvent.keyDown(input, { key: 'Enter' });
	await fireEvent.keyDown(input, { key: 'ArrowDown' });
	await fireEvent.keyDown(input, { key: 'Enter' });
	await waitFor(() =>
		expect(destinations).toEqual(['/admin/organizations/org-first', '/admin/organizations/org-second'])
	);
	const selected = screen.getByRole('option', { selected: true });
	expect(input.getAttribute('aria-activedescendant')).toBe(selected.id);
});

it('announces a pending lookup and its empty result through a status message', async () => {
	vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
	const pending = pendingResponse();
	vi.stubGlobal(
		'fetch',
		vi.fn(() => pending.promise)
	);
	render(AdminSearch);
	const input = screen.getByRole('combobox', { name: 'Search platform admin records' });
	input.focus();
	await fireEvent.input(input, { target: { value: 'zzzz-no-match' } });
	await vi.advanceTimersByTimeAsync(250);
	expect(screen.getByRole('status').textContent).toBe('Searching');
	expect(screen.getByRole('listbox').getAttribute('aria-busy')).toBe('true');
	pending.resolve(Response.json({ users: [], organizations: [] }));
	await vi.advanceTimersByTimeAsync(0);
	expect(screen.getByRole('status').textContent).toBe('No admin records found.');
	expect(screen.getByRole('listbox').getAttribute('aria-busy')).toBe('false');
});

it('closes the open results on Escape and keeps focus in the search', async () => {
	vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
	vi.stubGlobal('fetch', vi.fn().mockResolvedValue(userResult('alpha')));
	render(AdminSearch);
	const input = screen.getByRole('combobox', { name: 'Search platform admin records' });
	input.focus();
	await fireEvent.input(input, { target: { value: 'alpha' } });
	await vi.advanceTimersByTimeAsync(250);
	expect(screen.getByRole('option', { name: /alpha@example.test/ })).toBeTruthy();
	await fireEvent.keyDown(input, { key: 'Escape' });
	expect(screen.queryByRole('listbox')).toBeNull();
	expect(input.getAttribute('aria-expanded')).toBe('false');
	expect(document.activeElement).toBe(input);
	expect((input as HTMLInputElement).value).toBe('alpha');
});
