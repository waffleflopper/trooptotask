// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import type { ComponentProps } from 'svelte';
import AppShellHeader from './AppShellHeader.svelte';
import type { CapabilityMap } from '$lib/access/memberAccessShape';
import { createRawSnippet, tick } from 'svelte';
import { toastStore } from '$lib/stores/toast.svelte';

const { pageStore } = vi.hoisted(() => {
	let current = {
		url: new URL('https://example.test/org/org-1/personnel'),
		data: {} as Record<string, unknown>
	};
	const subscribers = new Set<(value: typeof current) => void>();

	return {
		pageStore: {
			subscribe(fn: (value: typeof current) => void) {
				subscribers.add(fn);
				fn(current);
				return () => subscribers.delete(fn);
			},
			setPath(pathname: string, data: Record<string, unknown> = {}) {
				current = {
					url: new URL(`https://example.test${pathname}`),
					data
				};
				for (const subscriber of subscribers) subscriber(current);
			}
		}
	};
});

const { goto } = vi.hoisted(() => {
	return { goto: vi.fn() };
});

vi.mock('$app/navigation', () => {
	return { goto, afterNavigate: vi.fn() };
});

vi.mock('$app/stores', () => {
	return {
		page: {
			subscribe: pageStore.subscribe
		}
	};
});

const baseCapabilityMap: CapabilityMap = {
	calendar: 'view',
	personnel: 'view',
	training: 'none',
	criticalTasks: 'none',
	onboarding: 'none',
	ratingScheme: 'none'
};

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.useRealTimers();
	pageStore.setPath('/org/org-1/personnel');
	setWindowSize(1024, 768);
});

beforeEach(() => {
	vi.stubGlobal(
		'fetch',
		vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);

			if (url.includes('part=notification-count')) {
				return {
					ok: true,
					json: async () => ({ ok: true, unreadNotificationCount: 2 })
				};
			}

			if (url.includes('part=organization-switcher')) {
				return {
					ok: true,
					json: async () => ({ ok: true, organizations: [] })
				};
			}

			return {
				ok: true,
				json: async () => []
			};
		})
	);
});

function renderHeader(overrides: Partial<ComponentProps<typeof AppShellHeader>> = {}) {
	return render(AppShellHeader, {
		props: {
			orgId: 'org-1',
			userId: 'account-1',
			orgName: 'Test Org',
			userRole: 'admin',
			membershipId: 'membership-1',
			capabilityMap: baseCapabilityMap,
			onToggleTheme: vi.fn(),
			isDarkTheme: false,
			...overrides
		}
	});
}

function notificationResponse(body: unknown, ok = true): Response {
	return { ok, json: async () => body } as Response;
}

function notification(id: string, title: string, link: string | null = null) {
	return { id, title, message: null, link, read: false, created_at: '2026-09-30T10:00:00Z' };
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function setWindowSize(width: number, height: number) {
	(
		window as unknown as { happyDOM: { setWindowSize(size: { width: number; height: number }): void } }
	).happyDOM.setWindowSize({ width, height });
}

describe('organization switcher lifetime and recovery', () => {
	it.each(['success', 'rejection'])(
		'keeps a new A request pending when retired A finishes with %s after A–B–A',
		async (result) => {
			const old = deferred<Response>();
			const current = deferred<Response>();
			let requests = 0;
			vi.mocked(fetch).mockImplementation(async (input) => {
				if (String(input).includes('organization-switcher')) return ++requests === 1 ? old.promise : current.promise;
				return notificationResponse({ ok: true, unreadNotificationCount: 2 });
			});
			const view = renderHeader();
			await fireEvent.click(screen.getByRole('button', { name: 'Switch organization' }));
			await screen.findByRole('menuitem', { name: /Loading organizations/ });
			await view.rerender({ orgId: 'org-2', orgUrlSegment: 'bravo', orgName: 'Bravo', membershipId: 'membership-2' });
			await view.rerender({
				orgId: 'org-1',
				orgUrlSegment: 'org-1',
				orgName: 'Test Org',
				membershipId: 'membership-1'
			});
			await fireEvent.click(screen.getByRole('button', { name: 'Switch organization' }));
			await screen.findByRole('menuitem', { name: /Loading organizations/ });
			await act(async () => {
				if (result === 'rejection') old.reject(new Error('Retired switcher failed'));
				else
					old.resolve(
						notificationResponse({
							ok: true,
							organizations: [{ id: 'retired-org', name: 'Retired private org', role: 'member' }]
						})
					);
				await old.promise.catch(() => undefined);
			});
			expect(screen.queryByRole('menuitem', { name: /Retired private org/ })).toBeNull();
			expect(screen.getByRole('menuitem', { name: /Loading organizations/ })).toBeTruthy();
			await fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
			await fireEvent.click(screen.getByRole('button', { name: 'Switch organization' }));
			expect(requests).toBe(2);
			current.resolve(
				notificationResponse({
					ok: true,
					organizations: [{ id: 'current-org', name: 'Current admitted org', role: 'member' }]
				})
			);
			await screen.findByRole('menuitem', { name: /Current admitted org/ });
			expect(screen.queryByRole('menuitem', { name: /Retired private org/ })).toBeNull();
		}
	);

	it.each(['HTTP', 'transport', 'JSON'])(
		'offers explicit reopen retry after an active %s failure without looping',
		async (failure) => {
			let requests = 0;
			vi.mocked(fetch).mockImplementation(async (input) => {
				if (!String(input).includes('organization-switcher'))
					return notificationResponse({ ok: true, unreadNotificationCount: 2 });
				if (++requests === 1) {
					if (failure === 'transport') throw new Error('Connection failed');
					if (failure === 'JSON') return new Response('invalid-json', { status: 200 });
					return notificationResponse(null, false);
				}
				return notificationResponse({
					ok: true,
					organizations: [{ id: 'retry-org', name: 'Recovered organization', role: 'member' }]
				});
			});
			renderHeader();
			await fireEvent.click(screen.getByRole('button', { name: 'Switch organization' }));
			await screen.findByRole('menuitem', { name: /Could not load organizations/ });
			await tick();
			expect(requests).toBe(1);
			await fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
			await fireEvent.click(screen.getByRole('button', { name: 'Switch organization' }));
			await screen.findByRole('menuitem', { name: /Recovered organization/ });
			expect(requests).toBe(2);
		}
	);
});

describe('disposed notification writes', () => {
	it.each([true, false])('does not navigate or report a retired linked read after unmount (success=%s)', async (ok) => {
		const write = deferred<Response>();
		const error = vi.spyOn(toastStore, 'error').mockReturnValue('error-toast');
		vi.mocked(fetch).mockImplementation(async (input, init) => {
			if (String(input).includes('notification-count'))
				return notificationResponse({ ok: true, unreadNotificationCount: 2 });
			if (init?.method === 'PUT') return write.promise;
			return notificationResponse([notification('old-link', 'Retired linked notification', '/org/org-1/settings')]);
		});
		const old = renderHeader();
		await fireEvent.click(await screen.findByRole('button', { name: '2 unread notifications' }));
		await fireEvent.click(await screen.findByRole('menuitem', { name: /Retired linked notification/ }));
		old.unmount();
		renderHeader();
		await screen.findByRole('button', { name: '2 unread notifications' });
		await act(async () => {
			write.resolve(notificationResponse({}, ok));
			await write.promise;
		});
		expect(goto).not.toHaveBeenCalled();
		expect(error).not.toHaveBeenCalled();
		expect(screen.getByRole('button', { name: '2 unread notifications' })).toBeTruthy();
	});
});

describe('responsive sidebar interaction', () => {
	it('closes the mobile drawer with Escape from Home focus, restores focus, and closes same-path navigation', async () => {
		setWindowSize(390, 844);
		pageStore.setPath('/org/org-1');
		renderHeader();
		const trigger = within(screen.getByRole('banner')).getByRole('button', { name: 'Toggle Sidebar' });
		trigger.focus();
		await fireEvent.click(trigger);
		const drawer = await screen.findByRole('dialog', { name: 'Sidebar' });
		const home = within(drawer).getByRole('link', { name: 'Home' });
		home.focus();
		await fireEvent.keyDown(home, { key: 'Escape' });
		await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Sidebar' })).toBeNull());
		await waitFor(() => expect(document.activeElement).toBe(trigger));
		await fireEvent.click(trigger);
		await fireEvent.click(
			within(await screen.findByRole('dialog', { name: 'Sidebar' })).getByRole('link', { name: 'Home' })
		);
		await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Sidebar' })).toBeNull());
	});

	it('keeps the mobile drawer open for modified navigation to a new tab', async () => {
		setWindowSize(390, 844);
		renderHeader();
		await fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Toggle Sidebar' }));
		const drawer = await screen.findByRole('dialog', { name: 'Sidebar' });
		await fireEvent.click(within(drawer).getByRole('link', { name: 'Home' }), { ctrlKey: true });
		expect(screen.getByRole('dialog', { name: 'Sidebar' })).toBeTruthy();
	});

	it('names the collapsed Home link tooltip after the link and dismisses it with Escape', async () => {
		setWindowSize(1024, 768);
		renderHeader();
		await fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Toggle Sidebar' }));
		const home = screen.getByRole('link', { name: 'Home' });
		await fireEvent.pointerEnter(home, { pointerType: 'mouse' });
		await fireEvent.pointerMove(home, { pointerType: 'mouse' });
		expect((await screen.findByRole('tooltip')).textContent?.trim()).toBe('Home');
		await fireEvent.keyDown(home, { key: 'Escape' });
		await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
		expect(home.getAttribute('href')).toBe('/org/org-1');
	});

	it('closes the collapsed desktop tooltip when the current Home link is clicked', async () => {
		setWindowSize(1024, 768);
		pageStore.setPath('/org/org-1');
		renderHeader();
		await fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Toggle Sidebar' }));
		const home = screen.getByRole('link', { name: 'Home' });
		await fireEvent.pointerEnter(home, { pointerType: 'mouse' });
		await fireEvent.pointerMove(home, { pointerType: 'mouse' });
		await screen.findByRole('tooltip');
		await fireEvent.click(home);
		await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
	});
});

describe('notification recovery', () => {
	it('waits for successful list recovery before bulk read so a retry cannot restore unread rows', async () => {
		let release!: (response: Response) => void;
		const delayed = new Promise<Response>((resolve) => {
			release = resolve;
		});
		let writes = 0;
		let reads = 0;
		vi.spyOn(toastStore, 'error').mockReturnValue('error-toast');
		vi.mocked(fetch).mockImplementation(async (input, options) => {
			if (String(input).includes('notification-count'))
				return notificationResponse({ ok: true, unreadNotificationCount: 2 });
			if (options?.method === 'PUT') {
				writes++;
				return notificationResponse({ success: true });
			}
			return ++reads === 1 ? notificationResponse(null, false) : delayed;
		});
		renderHeader();
		await fireEvent.click(await screen.findByRole('button', { name: '2 unread notifications' }));
		await screen.findByRole('menuitem', { name: /Could not load notifications/ });
		expect((screen.getByRole('button', { name: 'Mark all read' }) as HTMLButtonElement).disabled).toBe(true);
		await fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
		expect(writes).toBe(0);
		await fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
		await fireEvent.click(screen.getByRole('button', { name: '2 unread notifications' }));
		const bulk = await screen.findByRole('button', { name: 'Mark all read' });
		expect((bulk as HTMLButtonElement).disabled).toBe(true);
		await fireEvent.click(bulk);
		expect(writes).toBe(0);
		release(notificationResponse([notification('own-note', 'Own notification')]));
		await screen.findByRole('menuitem', { name: /Own notification/ });
		await fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
		await screen.findByRole('button', { name: 'Notifications' });
		await fireEvent.click(screen.getByRole('menuitem', { name: /Own notification/ }));
		expect(writes).toBe(1);
	});

	it('reports a failed list without a request loop and reloads when the bell is reopened', async () => {
		vi.spyOn(toastStore, 'error').mockReturnValue('error-toast');
		let requests = 0;
		vi.mocked(fetch).mockImplementation(async (input) => {
			if (String(input).includes('notification-count'))
				return notificationResponse({ ok: true, unreadNotificationCount: 2 });
			return notificationResponse([notification('own-note', 'Own notification')], ++requests > 1);
		});
		renderHeader();
		await fireEvent.click(await screen.findByRole('button', { name: '2 unread notifications' }));
		await screen.findByRole('menuitem', { name: /Could not load notifications/ });
		expect(requests).toBe(1);
		await fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
		await fireEvent.click(screen.getByRole('button', { name: '2 unread notifications' }));
		await screen.findByRole('menuitem', { name: /Own notification/ });
		expect(requests).toBe(2);
	});

	it('keeps a failed linked read unread without navigating and allows a successful retry', async () => {
		const error = vi.spyOn(toastStore, 'error').mockReturnValue('error-toast');
		let attempts = 0;
		vi.mocked(fetch).mockImplementation(async (input, options) => {
			if (String(input).includes('notification-count')) {
				return notificationResponse({ ok: true, unreadNotificationCount: 2 });
			}
			if (options?.method === 'PUT') return notificationResponse({}, ++attempts > 1);
			return notificationResponse([notification('own-note', 'Own notification', '/org/org-1/settings')]);
		});
		renderHeader();
		await fireEvent.click(await screen.findByRole('button', { name: '2 unread notifications' }));
		await fireEvent.click(await screen.findByRole('menuitem', { name: /Own notification/ }));
		await waitFor(() => expect(error).toHaveBeenCalled());
		expect(screen.getByRole('button', { name: '2 unread notifications' })).toBeTruthy();
		expect(goto).not.toHaveBeenCalled();
		await fireEvent.click(screen.getByRole('button', { name: '2 unread notifications' }));
		await fireEvent.click(await screen.findByRole('menuitem', { name: /Own notification/ }));
		await waitFor(() => expect(screen.getByRole('button', { name: '1 unread notifications' })).toBeTruthy());
		expect(attempts).toBe(2);
		expect(goto).toHaveBeenCalledWith('/org/org-1/settings');
	});

	it('retains the count after a failed bulk read and permits retry', async () => {
		const error = vi.spyOn(toastStore, 'error').mockReturnValue('error-toast');
		let attempts = 0;
		vi.mocked(fetch).mockImplementation(async (input, options) => {
			if (String(input).includes('notification-count')) {
				return notificationResponse({ ok: true, unreadNotificationCount: 2 });
			}
			if (options?.method === 'PUT') return notificationResponse({}, ++attempts > 1);
			return notificationResponse([notification('own-note', 'Own notification')]);
		});
		renderHeader();
		await fireEvent.click(await screen.findByRole('button', { name: '2 unread notifications' }));
		await fireEvent.click(await screen.findByRole('button', { name: 'Mark all read' }));
		await waitFor(() => expect(error).toHaveBeenCalled());
		expect(screen.getByRole('button', { name: '2 unread notifications' })).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
		await waitFor(() => expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy());
		expect(attempts).toBe(2);
	});

	it('discards a delayed A list after switching to B', async () => {
		let release!: (response: Response) => void;
		const delayed = new Promise<Response>((resolve) => {
			release = resolve;
		});
		vi.mocked(fetch).mockImplementation(async (input) => {
			const url = String(input);
			if (url.includes('notification-count')) return notificationResponse({ ok: true, unreadNotificationCount: 1 });
			if (url === '/org/org-1/api/notifications') return delayed;
			return notificationResponse([notification('b-note', 'B private notification')]);
		});
		const view = renderHeader();
		await fireEvent.click(await screen.findByRole('button', { name: '1 unread notifications' }));
		await view.rerender({ orgId: 'org-2', orgName: 'Second Org', membershipId: 'membership-2' });
		await fireEvent.click(await screen.findByRole('button', { name: '1 unread notifications' }));
		await screen.findByRole('menuitem', { name: /B private notification/ });
		release(notificationResponse([notification('a-note', 'A private notification')]));
		await delayed;
		await tick();
		await tick();
		expect(screen.queryByRole('menuitem', { name: /A private notification/ })).toBeNull();
		expect(screen.getByRole('menuitem', { name: /B private notification/ })).toBeTruthy();
	});

	it('does not apply an old A read or navigate to its link after switching to B', async () => {
		let release!: (response: Response) => void;
		const delayed = new Promise<Response>((resolve) => {
			release = resolve;
		});
		vi.mocked(fetch).mockImplementation(async (input, options) => {
			const url = String(input);
			if (url.includes('notification-count')) return notificationResponse({ ok: true, unreadNotificationCount: 2 });
			if (options?.method === 'PUT') return delayed;
			return notificationResponse([notification('a-note', 'A private notification', '/org/org-1/settings')]);
		});
		const view = renderHeader();
		await fireEvent.click(await screen.findByRole('button', { name: '2 unread notifications' }));
		await fireEvent.click(await screen.findByRole('menuitem', { name: /A private notification/ }));
		await view.rerender({ orgId: 'org-2', orgName: 'Second Org', membershipId: 'membership-2' });
		await screen.findByRole('button', { name: '2 unread notifications' });
		release(notificationResponse({ success: true }));
		await delayed;
		await tick();
		await tick();
		expect(screen.getByRole('button', { name: '2 unread notifications' })).toBeTruthy();
		expect(goto).not.toHaveBeenCalled();
	});

	it.each(['HTTP', 'transport', 'application'])(
		'does not report an empty inbox after a %s notification count failure, and recovers on reopen',
		async (failure) => {
			let countRequests = 0;
			vi.mocked(fetch).mockImplementation(async (input) => {
				if (!String(input).includes('notification-count')) return notificationResponse([]);
				if (++countRequests === 1) {
					if (failure === 'transport') throw new Error('Connection failed');
					if (failure === 'application') return notificationResponse({ ok: false });
					return notificationResponse(null, false);
				}
				return notificationResponse({ ok: true, unreadNotificationCount: 0 });
			});
			renderHeader();
			await fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
			await screen.findByRole('menuitem', { name: /Could not load notifications/ });
			expect(screen.queryByRole('menuitem', { name: 'No notifications' })).toBeNull();
			await fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
			await fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
			await screen.findByRole('menuitem', { name: 'No notifications' });
			expect(countRequests).toBe(2);
		}
	);

	it('shows the retry as loading, never the stale failure, when the bell opens after a count failure', async () => {
		let countRequests = 0;
		let releaseRetry: (response: Response) => void = () => {};
		vi.mocked(fetch).mockImplementation(async (input) => {
			if (!String(input).includes('notification-count')) return notificationResponse([]);
			if (++countRequests === 1) return notificationResponse(null, false);
			return new Promise<Response>((resolve) => (releaseRetry = resolve));
		});
		renderHeader();
		await waitFor(() => expect(countRequests).toBe(1));
		await new Promise((resolve) => setTimeout(resolve, 0));

		await fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
		await screen.findByRole('menuitem', { name: 'Loading notifications...' });
		expect(screen.queryByRole('menuitem', { name: /Could not load notifications/ })).toBeNull();
		expect(countRequests).toBe(2);

		releaseRetry(notificationResponse({ ok: true, unreadNotificationCount: 0 }));
		await screen.findByRole('menuitem', { name: 'No notifications' });
	});
});

describe('AppShellHeader', () => {
	it('dismisses the theme tooltip after keyboard activation without losing trigger focus', async () => {
		const onToggleTheme = vi.fn();
		renderHeader({ onToggleTheme });
		const trigger = screen.getByRole('button', { name: 'Toggle theme' });
		trigger.focus();
		const tooltip = await screen.findByRole('tooltip');
		expect(trigger.getAttribute('aria-describedby')).toBe(tooltip.id);

		await fireEvent.click(trigger, { detail: 0 });

		expect(onToggleTheme).toHaveBeenCalledTimes(1);
		await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
		expect(trigger.getAttribute('aria-describedby')).toBeNull();
		expect(document.activeElement).toBe(trigger);
	});

	it('renders one main landmark around page content as the skip-link target', () => {
		const children = createRawSnippet(() => ({ render: () => '<section>Roster page</section>' }));
		renderHeader({ children });

		const main = screen.getByRole('main');
		expect(screen.getAllByRole('main')).toHaveLength(1);
		expect(main.id).toBe('main-content');
		expect(main.textContent).toBe('Roster page');
		expect(screen.getByRole('link', { name: 'Skip to main content' }).getAttribute('href')).toBe('#main-content');
	});

	it('puts the skip link before every sidebar tab stop on desktop', () => {
		renderHeader();

		const skip = screen.getByRole('link', { name: 'Skip to main content' });
		const sidebarStops = [
			screen.getByRole('button', { name: 'Switch organization' }),
			screen.getByRole('link', { name: 'Home' })
		];
		for (const stop of sidebarStops) {
			expect(skip.compareDocumentPosition(stop) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		}
	});

	it('puts the skip link before an announcement banner', () => {
		const banner = createRawSnippet(() => ({ render: () => '<button type="button">Dismiss announcement</button>' }));
		renderHeader({ banner });

		const skip = screen.getByRole('link', { name: 'Skip to main content' });
		const dismiss = screen.getByRole('button', { name: 'Dismiss announcement' });
		expect(skip.compareDocumentPosition(dismiss) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});

	it('renders a feedback utility button when a feedback handler is provided', async () => {
		const onFeedback = vi.fn();

		renderHeader({ onFeedback });

		await fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));

		expect(onFeedback).toHaveBeenCalledTimes(1);
	});

	it('does not render the feedback utility button without a feedback handler', () => {
		renderHeader();

		expect(screen.queryByRole('button', { name: 'Send feedback' })).toBeNull();
	});

	it('does not render a standalone help route item in the account menu', async () => {
		renderHeader();

		await fireEvent.click(screen.getByRole('button', { name: /Account menu/i }));

		expect(screen.queryByRole('menuitem', { name: 'Help' })).toBeNull();
	});

	it('keeps account access available in the shadcn sidebar footer', () => {
		renderHeader();

		expect(screen.getByRole('button', { name: /Account menu/i })).toBeTruthy();
	});

	it('puts Organization Settings directly above the account item for admins', () => {
		renderHeader({ userRole: 'admin' });

		const settingsLink = screen.getByRole('link', { name: 'Organization Settings' });
		const accountButton = screen.getByRole('button', { name: /Account menu/i });

		expect(settingsLink.getAttribute('href')).toBe('/org/org-1/settings');
		expect(settingsLink.compareDocumentPosition(accountButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});

	it('does not expose Organization Settings in the sidebar footer for members', () => {
		renderHeader({ userRole: 'member' });

		expect(screen.queryByRole('link', { name: 'Organization Settings' })).toBeNull();
	});

	it('opens the User Account profile from the account menu', async () => {
		renderHeader();

		await fireEvent.click(screen.getByRole('button', { name: /Account menu/i }));
		await fireEvent.click(screen.getByRole('menuitem', { name: 'Account' }));

		expect(goto).toHaveBeenCalledWith('/account/profile');
	});

	it('shows a leave organization action for non-owner members', async () => {
		renderHeader({ userRole: 'member' });

		await fireEvent.click(screen.getByRole('button', { name: /Account menu/i }));

		expect(screen.getByRole('menuitem', { name: 'Leave Organization' })).toBeTruthy();
	});

	it('requires typed confirmation before a non-owner member can leave an organization', async () => {
		renderHeader({ userRole: 'member' });

		await fireEvent.click(screen.getByRole('button', { name: /Account menu/i }));
		await fireEvent.click(screen.getByRole('menuitem', { name: 'Leave Organization' }));

		expect(await screen.findByRole('dialog', { name: 'Leave Organization' })).toBeTruthy();
		expect(screen.getByText(/Are you sure you wish to leave Test Org/)).toBeTruthy();
		const confirmButton = screen.getByRole('button', { name: 'Leave Organization' });
		expect((confirmButton as HTMLButtonElement).disabled).toBe(true);
		expect(screen.getByRole('textbox', { name: 'Type YES to confirm' })).toBeTruthy();
		expect(screen.getByDisplayValue('membership-1').getAttribute('name')).toBe('membershipId');
		expect(screen.getByDisplayValue('membership-1').closest('form')?.getAttribute('action')).toBe(
			'/org/org-1?/leaveOrganization'
		);

		await fireEvent.input(screen.getByRole('textbox', { name: 'Type YES to confirm' }), {
			target: { value: 'YES' }
		});

		expect((confirmButton as HTMLButtonElement).disabled).toBe(false);
	});

	it('shows leave organization for non-owner members even when membership payload is missing', async () => {
		renderHeader({ userRole: 'member', membershipId: null });

		await fireEvent.click(screen.getByRole('button', { name: /Account menu/i }));
		await fireEvent.click(screen.getByRole('menuitem', { name: 'Leave Organization' }));

		expect(
			screen.getByText('We could not identify your organization membership. Refresh the page and try again.')
		).toBeTruthy();
		expect((screen.getByRole('button', { name: 'Leave Organization' }) as HTMLButtonElement).disabled).toBe(true);
	});

	it('shows a leave organization action for admins', async () => {
		renderHeader({ userRole: 'admin' });

		await fireEvent.click(screen.getByRole('button', { name: /Account menu/i }));

		expect(screen.getByRole('menuitem', { name: 'Leave Organization' })).toBeTruthy();
	});

	it('does not show leave organization for owners', async () => {
		renderHeader({ userRole: 'owner' });

		await fireEvent.click(screen.getByRole('button', { name: /Account menu/i }));

		expect(screen.queryByRole('menuitem', { name: 'Leave Organization' })).toBeNull();
	});

	it('keeps organization settings in the org switcher menu for admins', async () => {
		renderHeader();

		await fireEvent.click(screen.getByRole('button', { name: 'Switch organization' }));

		expect(screen.getByRole('menuitem', { name: 'Organization Settings' })).toBeTruthy();
		expect(screen.queryByRole('menuitem', { name: 'Manage Organizations' })).toBeNull();
	});

	it('does not show organization settings in the org switcher menu for members', async () => {
		renderHeader({ userRole: 'member' });

		await fireEvent.click(screen.getByRole('button', { name: 'Switch organization' }));

		expect(screen.queryByRole('menuitem', { name: 'Organization Settings' })).toBeNull();
	});

	it('keeps Calendar and Personnel available after Duty Roster retirement', () => {
		renderHeader();

		expect(screen.queryByRole('link', { name: /Duty Rosters/ })).toBeNull();
		expect(screen.getByRole('link', { name: 'Calendar' }).getAttribute('href')).toBe('/org/org-1/calendar');
		expect(
			screen
				.getAllByRole('link', { name: 'Personnel' })
				.some((link) => link.getAttribute('href') === '/org/org-1/personnel')
		).toBe(true);
	});

	it('shows manage organizations only for multi-org users', async () => {
		vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes('part=organization-switcher')) {
				return {
					ok: true,
					json: async () => ({
						ok: true,
						organizations: [
							{ id: 'org-1', name: 'Test Org', role: 'admin' },
							{ id: 'org-2', name: 'Second Org', role: 'member' }
						]
					})
				} as Response;
			}
			return {
				ok: true,
				json: async () => ({ ok: true, unreadNotificationCount: 2 })
			} as Response;
		});

		renderHeader();

		await fireEvent.click(screen.getByRole('button', { name: 'Switch organization' }));

		expect(await screen.findByRole('menuitem', { name: 'Manage Organizations' })).toBeTruthy();
	});

	it('reloads the deferred notification count when the org route segment changes', async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes('/org/org-2/') && url.includes('part=notification-count')) {
				return {
					ok: true,
					json: async () => ({ ok: true, unreadNotificationCount: 5 })
				} as Response;
			}

			if (url.includes('part=notification-count')) {
				return {
					ok: true,
					json: async () => ({ ok: true, unreadNotificationCount: 2 })
				} as Response;
			}

			return {
				ok: true,
				json: async () => ({ ok: true, organizations: [] })
			} as Response;
		});
		vi.stubGlobal('fetch', fetchMock);

		const view = renderHeader({ orgUrlSegment: 'org-1' });

		await waitFor(() =>
			expect(fetchMock).toHaveBeenCalledWith('/org/org-1/api/app-shell-chrome?part=notification-count')
		);

		await view.rerender({
			orgId: 'org-2',
			orgName: 'Second Org',
			orgUrlSegment: 'org-2',
			userRole: 'admin',
			membershipId: 'membership-2',
			capabilityMap: baseCapabilityMap,
			onToggleTheme: vi.fn(),
			isDarkTheme: false
		});

		await waitFor(() =>
			expect(fetchMock).toHaveBeenCalledWith('/org/org-2/api/app-shell-chrome?part=notification-count')
		);
	});

	it('renders route-aware Calendar breadcrumbs for subpages', () => {
		pageStore.setPath('/org/org-1/calendar/settings');

		renderHeader();

		const breadcrumb = screen.getByLabelText('Current section');
		expect(breadcrumb.textContent).toContain('Test Org');
		expect(breadcrumb.textContent).toContain('Calendar');
		expect(breadcrumb.textContent).toContain('Settings');
	});

	it('links Calendar parent breadcrumbs on subpages', () => {
		pageStore.setPath('/org/org-1/calendar/settings');

		renderHeader();

		const breadcrumb = screen.getByLabelText('Current section');
		expect(within(breadcrumb).getByRole('link', { name: 'Test Org' }).getAttribute('href')).toBe('/org/org-1');
		expect(within(breadcrumb).getByRole('link', { name: 'Calendar' }).getAttribute('href')).toBe('/org/org-1/calendar');
		expect(within(breadcrumb).getByText('Settings').getAttribute('aria-current')).toBe('page');
	});

	it('uses a route-provided breadcrumb label for personnel records', () => {
		pageStore.setPath('/org/org-1/critical-tasks/person-1', { breadcrumbLabel: 'CPT Hayes, Emma' });

		renderHeader({
			capabilityMap: {
				...baseCapabilityMap,
				criticalTasks: 'view'
			}
		});

		const breadcrumb = screen.getByLabelText('Current section');
		expect(breadcrumb.textContent).toContain('Critical Tasks');
		expect(breadcrumb.textContent).toContain('CPT Hayes, Emma');
		expect(breadcrumb.textContent).not.toContain('Person');
	});

	it('uses a client-local dashboard date crumb for the dashboard root', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2026, 3, 26, 9));
		pageStore.setPath('/org/org-1', { breadcrumbLabel: 'Server Date Should Not Render' });

		renderHeader();

		const breadcrumb = screen.getByLabelText('Current section');
		await waitFor(() => expect(breadcrumb.textContent).toContain('Sunday, Apr 26 2026'));
		expect(breadcrumb.textContent).not.toContain('Server Date Should Not Render');
		expect(within(breadcrumb).getByRole('link', { name: 'Dashboard' }).getAttribute('href')).toBe('/org/org-1');
	});
});
