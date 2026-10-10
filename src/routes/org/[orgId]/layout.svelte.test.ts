// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { createRawSnippet, getAllContexts, mount, unmount } from 'svelte';
import { toast } from 'svelte-sonner';
import { toastStore } from '$lib/stores/toast.svelte';
import { getDefaultUserOrgPreferences } from '$features/identity/contracts';
import type { ReadyAppShell } from '$features/app-shell/contracts';
import { createCapabilityMap } from '$lib/access/memberAccessShape';
import Layout from './+layout.svelte';
import PreferenceProbe from '$features/app-shell/test-support/PreferenceProbe.svelte';
import type { LayoutData } from './$types';

const { pageStore, invalidate } = vi.hoisted(() => {
	let current = { url: new URL('https://example.test/org/alpha'), data: {} };
	const subscribers = new Set<(value: typeof current) => void>();
	return {
		invalidate: vi.fn(),
		pageStore: {
			subscribe(fn: (value: typeof current) => void) {
				subscribers.add(fn);
				fn(current);
				return () => subscribers.delete(fn);
			},
			setPath(path: string) {
				current = { url: new URL(`https://example.test${path}`), data: {} };
				for (const subscriber of subscribers) subscriber(current);
			}
		}
	};
});
vi.mock('$app/navigation', () => ({ invalidate, goto: vi.fn(), afterNavigate: vi.fn() }));
vi.mock('$app/stores', () => ({ page: { subscribe: pageStore.subscribe } }));
vi.mock('$app/environment', () => ({ browser: true, dev: true, building: false, version: 'test' }));
// The neutral browser-storage adapter intentionally refuses Node, including happy-dom.
vi.mock('$lib/utils/browserStorage', () => ({ getBrowserLocalStorage: () => window.localStorage }));

const children = createRawSnippet(() => ({ render: () => '<section>Org child</section>' }));
const preferenceChildren = createRawSnippet(() => {
	const context = getAllContexts();
	return {
		render: () => '<section></section>',
		setup(element) {
			const probe = mount(PreferenceProbe, { target: element, context });
			return () => {
				void unmount(probe);
			};
		}
	};
});

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}
function workspace(userId = 'user-a', orgId = 'org-a', sessionId = 'session-1') {
	const shell: ReadyAppShell = {
		kind: 'ready',
		org: { id: orgId, urlSegment: orgId === 'org-a' ? 'alpha' : 'bravo', name: orgId === 'org-a' ? 'Alpha' : 'Bravo' },
		user: { id: userId },
		member: {
			membershipId: `membership-${userId}-${orgId}`,
			role: 'member',
			capabilityMap: { ...createCapabilityMap('none'), calendar: 'view', personnel: 'view' },
			scopeSet: { kind: 'organization' },
			isOwner: false,
			isAdmin: false
		},
		state: { orgSuspended: false },
		preferences: getDefaultUserOrgPreferences(),
		announcements: []
	};
	return { session: null, shell, identitySessionScope: { userId, sessionId } } satisfies LayoutData;
}
function statusCheckbox() {
	return screen.getByRole('checkbox', { name: 'Show status text' }) as HTMLInputElement;
}
function grouping() {
	return screen.getByRole('status', { name: 'Training grouping' }).textContent;
}
async function accountAction(name: string, root: HTMLElement = document.body) {
	await fireEvent.click(within(root).getByRole('button', { name: 'Account menu' }));
	await fireEvent.click(await screen.findByRole('menuitem', { name }));
}

beforeEach(() => {
	vi.spyOn(toastStore, 'success').mockReturnValue('success-toast');
	vi.spyOn(toastStore, 'error').mockReturnValue('error-toast');
	vi.spyOn(toast, 'error').mockReturnValue('preference-error');
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => Response.json({ ok: true, unreadNotificationCount: 0 }))
	);
	localStorage.clear();
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.clearAllMocks();
	vi.unstubAllGlobals();
	vi.useRealTimers();
	pageStore.setPath('/org/alpha');
});

describe('organization layout scope lifetime', () => {
	it.each([
		[
			'Organization A–B–A',
			[
				['user-a', 'org-b', 'session-1'],
				['user-a', 'org-a', 'session-1']
			]
		],
		['different account in the same Organization', [['user-b', 'org-a', 'session-1']]],
		['different session for the same account and Organization', [['user-a', 'org-a', 'session-2']]]
	] as const)('retires queued preferences and an old count for %s', async (_name, replacements) => {
		vi.useFakeTimers();
		const oldSave = deferred<Response>();
		const oldCount = deferred<Response>();
		const submitted: unknown[] = [];
		let counts = 0;
		vi.mocked(fetch).mockImplementation(async (input, init) => {
			if (init?.method === 'PATCH') {
				submitted.push(JSON.parse(init.body as string));
				return oldSave.promise;
			}
			if (String(input).includes('notification-count'))
				return ++counts === 1 ? oldCount.promise : Response.json({ ok: true, unreadNotificationCount: 5 });
			throw new Error('Unexpected request');
		});
		const view = render(Layout, { data: workspace(), children: preferenceChildren });
		await fireEvent.click(statusCheckbox());
		await vi.advanceTimersByTimeAsync(350);
		await fireEvent.click(screen.getByRole('button', { name: 'Choose alphabetical' }));
		await vi.advanceTimersByTimeAsync(350);
		for (const [user, org, session] of replacements) {
			const data = workspace(user, org, session);
			pageStore.setPath(`/org/${data.shell.org.urlSegment}`);
			await view.rerender({ data });
		}
		await vi.advanceTimersByTimeAsync(0);
		expect(statusCheckbox().checked).toBe(false);
		expect(grouping()).toBe('by-group');
		expect(screen.getByRole('button', { name: '5 unread notifications' })).toBeTruthy();
		await act(async () => {
			oldCount.resolve(Response.json({ ok: true, unreadNotificationCount: 99 }));
			oldSave.reject(new Error('Retired save failed'));
			await Promise.allSettled([oldCount.promise, oldSave.promise]);
		});
		await vi.advanceTimersByTimeAsync(1_000);
		expect(submitted).toEqual([{ calendar: { showStatusText: true } }]);
		expect(statusCheckbox().checked).toBe(false);
		expect(grouping()).toBe('by-group');
		expect(screen.getByRole('button', { name: '5 unread notifications' })).toBeTruthy();
		expect(toast.error).not.toHaveBeenCalled();
		expect(toastStore.error).not.toHaveBeenCalled();
	});

	it('keeps pending latest choices across same-session navigation and stale seeds while applying current grants', async () => {
		vi.useFakeTimers();
		const firstSave = deferred<Response>();
		const submitted: unknown[] = [];
		vi.mocked(fetch).mockImplementation(async (_input, init) => {
			if (init?.method !== 'PATCH') return Response.json({ ok: true, unreadNotificationCount: 0 });
			submitted.push(JSON.parse(init.body as string));
			if (submitted.length === 1) return firstSave.promise;
			return Response.json({
				calendar: { showStatusText: true, showPersonnelRoles: false, highlightOnboarding: true },
				training: { selectedGroupId: null, selectedViewId: null, matrixViewMode: 'alphabetical' }
			});
		});
		const view = render(Layout, { data: workspace(), children: preferenceChildren });
		expect(screen.queryByRole('link', { name: 'Training' })).toBeNull();
		await fireEvent.click(statusCheckbox());
		await vi.advanceTimersByTimeAsync(350);
		await fireEvent.click(screen.getByRole('button', { name: 'Choose alphabetical' }));
		pageStore.setPath('/org/alpha/training');
		const refresh = workspace();
		refresh.shell.member.capabilityMap.training = 'configure';
		await view.rerender({ data: refresh });
		expect(statusCheckbox().checked).toBe(true);
		expect(grouping()).toBe('alphabetical');
		expect(
			screen
				.getAllByRole('link', { name: 'Training' })
				.some((link) => link.getAttribute('href') === '/org/alpha/training')
		).toBe(true);
		await vi.advanceTimersByTimeAsync(350);
		expect(submitted).toEqual([{ calendar: { showStatusText: true } }]);
		firstSave.resolve(
			Response.json({
				calendar: { showStatusText: true, showPersonnelRoles: false, highlightOnboarding: true },
				training: { selectedGroupId: null, selectedViewId: null, matrixViewMode: 'by-group' }
			})
		);
		await vi.advanceTimersByTimeAsync(0);
		expect(submitted).toEqual([
			{ calendar: { showStatusText: true } },
			{ training: { matrixViewMode: 'alphabetical' } }
		]);
		expect(statusCheckbox().checked).toBe(true);
		expect(grouping()).toBe('alphabetical');
		expect(toast.error).not.toHaveBeenCalled();
		expect(invalidate).not.toHaveBeenCalled();
	});

	it('resets leave confirmation and What’s New visibility when its account/session owner is replaced', async () => {
		const view = render(Layout, { data: workspace(), children });
		await accountAction('Leave Organization');
		await fireEvent.input(await screen.findByRole('textbox', { name: 'Type YES to confirm' }), {
			target: { value: 'YES' }
		});
		expect((screen.getByRole('button', { name: 'Leave Organization' }) as HTMLButtonElement).disabled).toBe(false);
		await view.rerender({ data: workspace('user-b') });
		expect(screen.queryByRole('dialog', { name: 'Leave Organization' })).toBeNull();
		await accountAction('Leave Organization');
		expect(((await screen.findByRole('textbox', { name: 'Type YES to confirm' })) as HTMLInputElement).value).toBe('');
		expect((screen.getByRole('button', { name: 'Leave Organization' }) as HTMLButtonElement).disabled).toBe(true);
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		await accountAction("What's New");
		await screen.findByRole('dialog', { name: "What's New" });
		await view.rerender({ data: workspace('user-b', 'org-a', 'session-2') });
		expect(screen.queryByRole('dialog', { name: "What's New" })).toBeNull();
	});

	it('unmounts real submitted Feedback on scope replacement and suppresses its held success', async () => {
		const response = deferred<Response>();
		vi.mocked(fetch).mockImplementation(async (_input, init) =>
			init?.method === 'POST' ? response.promise : Response.json({ ok: true, unreadNotificationCount: 0 })
		);
		const view = render(Layout, { data: workspace(), children });
		await fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));
		await screen.findByRole('dialog', { name: 'Send Feedback' });
		await fireEvent.input(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'Alpha feedback' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
		await view.rerender({ data: workspace('user-a', 'org-b') });
		expect(screen.queryByRole('dialog', { name: 'Send Feedback' })).toBeNull();
		await act(async () => {
			response.resolve(Response.json({ success: true }));
			await response.promise;
		});
		expect(toastStore.success).not.toHaveBeenCalled();
		expect(toastStore.error).not.toHaveBeenCalled();
		await fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));
		expect(((await screen.findByRole('textbox', { name: 'Message' })) as HTMLTextAreaElement).value).toBe('');
	});

	it('keeps preferences and What’s New opening independent in simultaneous account/Organization trees', async () => {
		vi.mocked(fetch).mockImplementation(async (_input, init) =>
			init?.method === 'PATCH'
				? new Promise<Response>(() => {})
				: Response.json({ ok: true, unreadNotificationCount: 0 })
		);
		const first = render(Layout, { data: workspace(), children: preferenceChildren });
		const second = render(Layout, { data: workspace('user-b', 'org-b'), children: preferenceChildren });
		const firstStatus = within(first.container).getByRole('checkbox', { name: 'Show status text' }) as HTMLInputElement;
		const secondStatus = within(second.container).getByRole('checkbox', {
			name: 'Show status text'
		}) as HTMLInputElement;
		await fireEvent.click(firstStatus);
		expect(firstStatus.checked).toBe(true);
		expect(secondStatus.checked).toBe(false);
		await accountAction("What's New", first.container);
		await screen.findByRole('dialog', { name: "What's New" });
		// A single owner's action must not also open a dialog in the other tree.
		expect(screen.getByRole('dialog', { name: "What's New", hidden: true })).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
		expect(screen.queryByRole('dialog', { name: "What's New" })).toBeNull();
		await accountAction("What's New", second.container);
		await screen.findByRole('dialog', { name: "What's New" });
		first.unmount();
		expect(screen.getByRole('dialog', { name: "What's New" })).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
		expect(secondStatus.checked).toBe(false);
	});

	it('allows manual updates when storage reads/writes throw and remembers normal dismissal per account', async () => {
		const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new Error('Storage read blocked');
		});
		const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('Storage write blocked');
		});
		const first = render(Layout, { data: workspace(), children: preferenceChildren });
		await fireEvent.click(screen.getByRole('button', { name: 'Check updates' }));
		expect(screen.queryByRole('dialog', { name: "What's New" })).toBeNull();
		await accountAction("What's New");
		await screen.findByRole('dialog', { name: "What's New" });
		await fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
		expect(screen.queryByRole('dialog', { name: "What's New" })).toBeNull();
		getItem.mockRestore();
		setItem.mockRestore();
		await accountAction("What's New");
		await screen.findByRole('dialog', { name: "What's New" });
		await fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
		const accountASeen = localStorage.getItem('changelog-last-seen-user-a');
		expect(accountASeen).toEqual(expect.any(String));
		expect(localStorage.getItem('changelog-last-seen-user-b')).toBeNull();
		first.unmount();
		render(Layout, { data: workspace('user-b', 'org-b'), children: preferenceChildren });
		await fireEvent.click(screen.getByRole('button', { name: 'Check updates' }));
		await screen.findByRole('dialog', { name: "What's New" });
		await fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
		expect(localStorage.getItem('changelog-last-seen-user-b')).toEqual(expect.any(String));
		expect(localStorage.getItem('changelog-last-seen-user-a')).toBe(accountASeen);
		await fireEvent.click(screen.getByRole('button', { name: 'Check updates' }));
		expect(screen.queryByRole('dialog', { name: "What's New" })).toBeNull();
	});

	it.each([null, { userId: 'another-user', sessionId: 'session-1' }])(
		'does not mount workspace children or dispatch chrome for an invalid session binding (%j)',
		(identitySessionScope) => {
			render(Layout, { data: { ...workspace(), identitySessionScope }, children });
			expect(screen.getByRole('alert')).toBeTruthy();
			expect(screen.queryByText('Org child')).toBeNull();
			expect(fetch).not.toHaveBeenCalled();
		}
	);
});

describe('organization layout suspended contact', () => {
	it('renders the canonical support mailbox in the suspended shell', () => {
		render(Layout, {
			children,
			data: {
				session: null,
				identitySessionScope: null,
				shell: {
					kind: 'suspended',
					org: { id: 'org-1', name: 'Demo Org', urlSegment: 'demo-org' },
					state: { orgSuspended: true }
				}
			} satisfies LayoutData
		});
		expect(screen.getByText('support@trooptotask.org')).toBeTruthy();
		expect(screen.queryByText('Org child')).toBeNull();
		expect(screen.getByRole('link', { name: 'Back to Dashboard' }).getAttribute('href')).toBe('/dashboard?show=all');
	});
});
