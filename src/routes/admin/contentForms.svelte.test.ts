// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import type { ActionResult, SubmitFunction } from '@sveltejs/kit';
import { frameworkOutcome } from '$lib/test-support/sveltekitEnhance';
import Announcements from './announcements/+page.svelte';
import Feedback from './feedback/+page.svelte';
import Dashboard from './+page.svelte';
import type { PageData as AnnouncementData } from './announcements/$types';
import type { PageData as FeedbackData } from './feedback/$types';
import type { PageData as DashboardData } from './$types';

const { forms, invalidateAll, navigation } = vi.hoisted(() => ({
	forms: new Map<string, SubmitFunction>(),
	invalidateAll: vi.fn(),
	navigation: [] as Array<() => void>
}));
vi.mock('$app/navigation', () => ({
	invalidateAll,
	beforeNavigate: (callback: () => void) => navigation.push(callback)
}));
vi.mock('$app/forms', () => ({
	enhance: (form: HTMLFormElement, submit: SubmitFunction) => {
		forms.set(formKey(form), submit);
		return { destroy: () => forms.delete(formKey(form)) };
	}
}));

const notice: AnnouncementData['announcements'][number] = {
	id: '11111111-1111-4111-8111-111111111111',
	title: 'Active notice',
	message: 'Keep this notice',
	type: 'info',
	is_active: true,
	created_at: '2026-10-01T12:00:00Z',
	expires_at: null
};
function adminData(
	actorId: string
): Pick<
	AnnouncementData,
	'session' | 'adminUserId' | 'visibleNavGroups' | 'adminEmail' | 'adminRole' | 'accessiblePages'
> {
	return {
		session: null,
		adminUserId: actorId,
		visibleNavGroups: [],
		adminEmail: 'admin@example.test',
		adminRole: 'super_admin',
		accessiblePages: ['dashboard', 'announcements', 'feedback', 'audit']
	};
}
function announcementData(actorId = 'admin-a'): AnnouncementData {
	return {
		...adminData(actorId),
		announcements: [
			notice,
			{ ...notice, id: '22222222-2222-4222-8222-222222222222', title: 'Peer notice', is_active: false }
		]
	};
}
const feedbackA: FeedbackData['newItems'][number] = {
	id: 'feedback-a',
	user_email: 'first@example.test',
	category: 'bug',
	message: 'First feedback',
	created_at: '2026-10-01T12:00:00Z',
	organization_name: 'Alpha',
	page_url: '/org/alpha',
	status: 'new',
	admin_notes: null
};
const feedbackB = {
	...feedbackA,
	id: 'feedback-b',
	user_email: 'peer@example.test',
	message: 'Peer feedback',
	admin_notes: 'Saved peer note'
};
function feedbackData(actorId = 'admin-a'): FeedbackData {
	return { ...adminData(actorId), newItems: [feedbackA, feedbackB], reviewedItems: [], resolvedItems: [] };
}
const failed: ActionResult = { type: 'failure', status: 400, data: { error: 'Current request failed' } };
const succeeded: ActionResult = { type: 'success', status: 200, data: { success: true } };
const uncertainResults: ActionResult[] = [
	{ type: 'error', status: 500, error: new Error('Private transport detail') },
	{ type: 'failure', status: 500, data: { error: 'Private provider detail' } }
];

beforeEach(() => {
	invalidateAll.mockResolvedValue(undefined);
});
afterEach(() => {
	cleanup();
	forms.clear();
	navigation.length = 0;
	vi.resetAllMocks();
	vi.unstubAllGlobals();
});

function formKey(form: HTMLFormElement) {
	const fields = new FormData(form);
	return `${form.getAttribute('action')}:${fields.get('id') ?? fields.get('feedbackId') ?? ''}`;
}

async function submit(button: HTMLElement) {
	await act();
	const form = button.closest('form')!;
	const input = {
		formElement: form,
		formData: new FormData(form),
		action: new URL(form.action),
		controller: new AbortController(),
		submitter: button,
		cancel: vi.fn()
	};
	let callback: Awaited<ReturnType<SubmitFunction>>;
	await act(async () => {
		const handler = forms.get(formKey(form));
		if (!handler)
			throw new Error(
				`Form enhancement unavailable: ${forms.size} registrations, selected ${form?.getAttribute('action')}`
			);
		callback = await handler(input);
	});
	return {
		cancel: input.cancel,
		finish: async (result: ActionResult) => {
			if (!callback) throw new Error('Submission was canceled');
			await act(async () => {
				await callback!({
					...input,
					...frameworkOutcome(result, { form, applyForm: async () => {}, invalidate: () => invalidateAll() })
				});
			});
		}
	};
}
async function openAnnouncement() {
	await fireEvent.click(screen.getByRole('button', { name: 'Create Announcement' }));
	await fireEvent.input(screen.getByLabelText('Title'), { target: { value: 'Unsent title' } });
	await fireEvent.input(screen.getByLabelText('Message'), { target: { value: 'Unsent message' } });
}
async function openFeedback(message = 'First feedback') {
	await fireEvent.click(screen.getByRole('button', { name: new RegExp(message) }));
}

describe('announcement form ownership', () => {
	it.each(uncertainResults)(
		'requires readback after an unconfirmed $type before permitting another mutation',
		async (result) => {
			render(Announcements, { props: { data: announcementData(), form: null } });
			await openAnnouncement();
			await (await submit(screen.getByRole('button', { name: 'Save' }))).finish(result);
			expect(screen.getByLabelText('Title')).toHaveProperty('value', 'Unsent title');
			expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', true);
			expect(screen.queryByText(/Private (transport|provider) detail/)).toBeNull();
			expect(
				(await submit(screen.getByRole('button', { name: 'Deactivate Active notice' }))).cancel
			).toHaveBeenCalledOnce();
			expect(invalidateAll).not.toHaveBeenCalled();
			await fireEvent.click(screen.getByRole('button', { name: 'Reload Announcements' }));
			await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', false));
			expect(invalidateAll).toHaveBeenCalledOnce();
		}
	);
	it('asks for confirmation naming the announcement before a Delete can dispatch or lock the page', async () => {
		render(Announcements, { props: { data: announcementData(), form: null } });
		const deleteButton = screen.getByRole('button', { name: 'Delete Active notice' });
		const request = await submit(deleteButton);
		expect(request.cancel).toHaveBeenCalledOnce();
		const dialog = screen.getByRole('alertdialog');
		expect(dialog.textContent).toContain('Delete "Active notice"? This cannot be undone.');
		expect(deleteButton).toHaveProperty('disabled', false);
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
		await waitFor(() => expect(document.activeElement).toBe(deleteButton));
		expect(screen.queryByRole('alertdialog')).toBeNull();
		expect(invalidateAll).not.toHaveBeenCalled();
	});

	it('submits the Delete only after its confirmation, stays busy until the result, then focuses Create Announcement', async () => {
		const view = render(Announcements, { props: { data: announcementData(), form: null } });
		const deleteButton = screen.getByRole('button', { name: 'Delete Active notice' });
		const requestSubmit = vi.spyOn(deleteButton.closest('form')!, 'requestSubmit').mockImplementation(() => {});
		await submit(deleteButton);
		await fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
		expect(requestSubmit).toHaveBeenCalledWith(deleteButton);
		const confirmed = await submit(deleteButton);
		expect(confirmed.cancel).not.toHaveBeenCalled();
		invalidateAll.mockImplementationOnce(async () => {
			const remaining = announcementData();
			await view.rerender({
				data: { ...remaining, announcements: remaining.announcements.slice(1) },
				form: null
			});
		});
		expect(screen.getByRole('alertdialog').getAttribute('aria-busy')).toBe('true');
		await confirmed.finish(succeeded);
		expect(screen.queryByRole('alertdialog')).toBeNull();
		await waitFor(() =>
			expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Create Announcement' }))
		);
	});

	it('focuses Title on open and Create Announcement on cancel and after a save', async () => {
		render(Announcements, { props: { data: announcementData(), form: null } });
		await openAnnouncement();
		await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Title')));
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		await waitFor(() =>
			expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Create Announcement' }))
		);
		await openAnnouncement();
		await (await submit(screen.getByRole('button', { name: 'Save' }))).finish(succeeded);
		await waitFor(() =>
			expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Create Announcement' }))
		);
	});

	it('returns focus to the toggled announcement button after its re-read', async () => {
		render(Announcements, { props: { data: announcementData(), form: null } });
		const toggle = screen.getByRole('button', { name: 'Deactivate Active notice' });
		await (await submit(toggle)).finish(succeeded);
		await waitFor(() => expect(document.activeElement).toBe(toggle));
	});

	it('keeps the pressed toggle focusable and busy while its save is held, and ignores another press', async () => {
		render(Announcements, { props: { data: announcementData(), form: null } });
		const toggle = screen.getByRole('button', { name: 'Deactivate Active notice' });
		toggle.focus();
		const request = await submit(toggle);
		expect(toggle).toHaveProperty('disabled', false);
		expect(toggle.getAttribute('aria-disabled')).toBe('true');
		expect(toggle.getAttribute('aria-busy')).toBe('true');
		expect(document.activeElement).toBe(toggle);
		expect((await submit(toggle)).cancel).toHaveBeenCalledOnce();
		await request.finish(succeeded);
		expect(toggle.getAttribute('aria-busy')).toBeNull();
		expect(invalidateAll).toHaveBeenCalledOnce();
	});

	it('retains the current create draft after failure and closes it only after its own successful retry', async () => {
		render(Announcements, { props: { data: announcementData(), form: null } });
		await openAnnouncement();
		await (await submit(screen.getByRole('button', { name: 'Save' }))).finish(failed);
		expect(screen.getByLabelText('Title')).toHaveProperty('value', 'Unsent title');
		expect(screen.getByLabelText('Message')).toHaveProperty('value', 'Unsent message');
		expect(screen.getByText('Current request failed')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', false);
		await (await submit(screen.getByRole('button', { name: 'Save' }))).finish(succeeded);
		expect(screen.queryByLabelText('Title')).toBeNull();
		expect(invalidateAll).toHaveBeenCalledOnce();
	});

	it.each([failed, succeeded])(
		'keeps a reopened unsent draft when the retired editor completes with $type',
		async (result) => {
			render(Announcements, { props: { data: announcementData(), form: null } });
			await openAnnouncement();
			const request = await submit(screen.getByRole('button', { name: 'Save' }));
			await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
			await openAnnouncement();
			await fireEvent.input(screen.getByLabelText('Title'), { target: { value: 'Fresh unsent title' } });
			await request.finish(result);
			expect(screen.getByLabelText('Title')).toHaveProperty('value', 'Fresh unsent title');
			expect(screen.queryByText('Current request failed')).toBeNull();
			expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', false);
			expect(invalidateAll).toHaveBeenCalledTimes(result.type === 'success' ? 1 : 0);
		}
	);

	it('holds the whole-page write lock until authoritative readback finishes', async () => {
		let release!: () => void;
		invalidateAll.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					release = resolve;
				})
		);
		render(Announcements, { props: { data: announcementData(), form: null } });
		const request = await submit(screen.getByRole('button', { name: 'Deactivate Active notice' }));
		expect((await submit(screen.getByRole('button', { name: 'Activate Peer notice' }))).cancel).toHaveBeenCalledOnce();
		const completion = request.finish(succeeded);
		await waitFor(() => expect(invalidateAll).toHaveBeenCalledOnce());
		expect(screen.getByRole('button', { name: 'Activate Peer notice' }).getAttribute('aria-disabled')).toBe('true');
		expect((await submit(screen.getByRole('button', { name: 'Delete Peer notice' }))).cancel).toHaveBeenCalledOnce();
		release();
		await completion;
		expect(screen.getByRole('button', { name: 'Activate Peer notice' }).getAttribute('aria-disabled')).toBeNull();
	});

	it('blocks repeat mutations after read failure and recovers using a read-only reload', async () => {
		invalidateAll.mockRejectedValueOnce(new Error('Private provider failure'));
		render(Announcements, { props: { data: announcementData(), form: null } });
		await (await submit(screen.getByRole('button', { name: 'Deactivate Active notice' }))).finish(succeeded);
		expect(screen.getByRole('button', { name: 'Activate Peer notice' })).toHaveProperty('disabled', true);
		expect(screen.queryByText('Private provider failure')).toBeNull();
		expect(
			screen.getByText('Saved, but announcements could not be refreshed. Reload them before another save.')
		).toBeTruthy();
		expect(
			(await submit(screen.getByRole('button', { name: 'Deactivate Active notice' }))).cancel
		).toHaveBeenCalledOnce();
		const reload = screen.getByRole('button', { name: 'Reload Announcements' });
		reload.focus();
		await fireEvent.click(reload);
		await waitFor(() =>
			expect(screen.getByRole('button', { name: 'Deactivate Active notice' })).toHaveProperty('disabled', false)
		);
		expect(invalidateAll).toHaveBeenCalledTimes(2);
		await waitFor(() =>
			expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Create Announcement' }))
		);
	});

	it.each([failed, succeeded])('ignores a previous page reply after leaving and returning ($type)', async (result) => {
		render(Announcements, { props: { data: announcementData(), form: null } });
		await openAnnouncement();
		const old = await submit(screen.getByRole('button', { name: 'Save' }));
		await act(() => navigation[0]());
		await openAnnouncement();
		const fresh = await submit(screen.getByRole('button', { name: 'Save' }));
		await old.finish(result);
		expect(screen.getByRole('button', { name: /Saving/ }).getAttribute('aria-busy')).toBe('true');
		expect(screen.getByLabelText('Title')).toHaveProperty('value', 'Unsent title');
		expect(invalidateAll).not.toHaveBeenCalled();
		await fresh.finish(failed);
		expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', false);
	});

	it('retires pending state when the admitted actor changes', async () => {
		const view = render(Announcements, { props: { data: announcementData(), form: null } });
		const old = await submit(screen.getByRole('button', { name: 'Deactivate Active notice' }));
		await view.rerender({ data: announcementData('admin-b'), form: null });
		expect(screen.getByRole('button', { name: 'Deactivate Active notice' })).toHaveProperty('disabled', false);
		await old.finish(failed);
		expect(screen.queryByText('Current request failed')).toBeNull();
	});
});

describe('Feedback editor ownership', () => {
	it.each(uncertainResults)(
		'preserves a draft but blocks saves after an unconfirmed $type until readback',
		async (result) => {
			render(Feedback, { props: { data: feedbackData(), form: null } });
			await openFeedback();
			await fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'reviewed' } });
			await fireEvent.input(screen.getByLabelText('Admin Notes'), { target: { value: 'Unconfirmed note' } });
			await (await submit(screen.getByRole('button', { name: 'Save Notes' }))).finish(result);
			expect(screen.getByLabelText('Status')).toHaveProperty('value', 'reviewed');
			expect(screen.getByLabelText('Admin Notes')).toHaveProperty('value', 'Unconfirmed note');
			expect(screen.getByRole('button', { name: 'Save Notes' })).toHaveProperty('disabled', true);
			expect(screen.queryByText(/Private (transport|provider) detail/)).toBeNull();
			expect((await submit(screen.getByRole('button', { name: 'Save Notes' }))).cancel).toHaveBeenCalledOnce();
			expect(invalidateAll).not.toHaveBeenCalled();
			await fireEvent.click(screen.getByRole('button', { name: 'Reload Feedback' }));
			await waitFor(() => expect(screen.getByRole('button', { name: 'Save Notes' })).toHaveProperty('disabled', false));
			expect(invalidateAll).toHaveBeenCalledOnce();
		}
	);

	it('retires the editor through the visible tab interaction while retaining its pending write', async () => {
		render(Feedback, { props: { data: feedbackData(), form: null } });
		await openFeedback();
		const old = await submit(screen.getByRole('button', { name: 'Save Notes' }));
		await fireEvent.click(screen.getByRole('tab', { name: 'Reviewed' }));
		expect(screen.queryByLabelText('Admin Notes')).toBeNull();
		await fireEvent.click(screen.getByRole('tab', { name: /New 2/ }));
		await openFeedback();
		await fireEvent.input(screen.getByLabelText('Admin Notes'), { target: { value: 'Fresh after tabs' } });
		expect((await submit(screen.getByRole('button', { name: /Save Notes/ }))).cancel).toHaveBeenCalledOnce();
		await old.finish(failed);
		expect(screen.getByLabelText('Admin Notes')).toHaveProperty('value', 'Fresh after tabs');
		expect(screen.queryByText('Current request failed')).toBeNull();
		expect(screen.getByRole('button', { name: 'Save Notes' })).toHaveProperty('disabled', false);
	});
	it('keeps the saved Status and Notes in the open editor after a save', async () => {
		render(Feedback, { props: { data: feedbackData(), form: null } });
		await openFeedback();
		await fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'reviewed' } });
		await fireEvent.input(screen.getByLabelText('Admin Notes'), { target: { value: 'Saved review' } });
		await (await submit(screen.getByRole('button', { name: 'Save Notes' }))).finish(succeeded);
		expect(screen.getByLabelText('Status')).toHaveProperty('value', 'reviewed');
		expect(screen.getByLabelText('Admin Notes')).toHaveProperty('value', 'Saved review');
		await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Save Notes' })));
	});

	it('retains the selected status and unsaved notes on a current failure', async () => {
		render(Feedback, { props: { data: feedbackData(), form: null } });
		await openFeedback();
		await fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'reviewed' } });
		await fireEvent.input(screen.getByLabelText('Admin Notes'), { target: { value: 'Unsent review' } });
		await (await submit(screen.getByRole('button', { name: 'Save Notes' }))).finish(failed);
		expect(screen.getByLabelText('Status')).toHaveProperty('value', 'reviewed');
		expect(screen.getByLabelText('Admin Notes')).toHaveProperty('value', 'Unsent review');
		expect(screen.getByRole('button', { name: 'Save Notes' })).toHaveProperty('disabled', false);
	});

	it.each([failed, succeeded])('keeps peer drafts and releases only its own lock after $type', async (result) => {
		const view = render(Feedback, { props: { data: feedbackData(), form: null } });
		await openFeedback();
		const old = await submit(screen.getByRole('button', { name: 'Save Notes' }));
		await openFeedback('Peer feedback');
		await fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'resolved' } });
		await fireEvent.input(screen.getByLabelText('Admin Notes'), { target: { value: 'Fresh peer draft' } });
		expect((await submit(screen.getByRole('button', { name: 'Save Notes' }))).cancel).toHaveBeenCalledOnce();
		invalidateAll.mockImplementation(async () => {
			await view.rerender({
				data: {
					...feedbackData(),
					newItems: [feedbackB],
					reviewedItems: [{ ...feedbackA, status: 'reviewed', admin_notes: 'Saved first note' }]
				},
				form: null
			});
		});
		await old.finish(result);
		expect(screen.getByLabelText('Status')).toHaveProperty('value', 'resolved');
		expect(screen.getByLabelText('Admin Notes')).toHaveProperty('value', 'Fresh peer draft');
		expect(screen.queryByText('Current request failed')).toBeNull();
		expect(screen.getByRole('button', { name: 'Save Notes' })).toHaveProperty('disabled', false);
		expect(invalidateAll).toHaveBeenCalledTimes(result.type === 'success' ? 1 : 0);
	});

	it('does not apply the old error after switching away and reopening the same record', async () => {
		render(Feedback, { props: { data: feedbackData(), form: null } });
		await openFeedback();
		const old = await submit(screen.getByRole('button', { name: 'Save Notes' }));
		await openFeedback('Peer feedback');
		await openFeedback();
		await fireEvent.input(screen.getByLabelText('Admin Notes'), { target: { value: 'Reopened unsent note' } });
		await old.finish(failed);
		expect(screen.getByLabelText('Admin Notes')).toHaveProperty('value', 'Reopened unsent note');
		expect(screen.queryByText('Current request failed')).toBeNull();
	});

	it('keeps saves blocked through readback failure until a read-only reload succeeds', async () => {
		invalidateAll.mockRejectedValueOnce(new Error('Unavailable'));
		render(Feedback, { props: { data: feedbackData(), form: null } });
		await openFeedback();
		await (await submit(screen.getByRole('button', { name: 'Save Notes' }))).finish(succeeded);
		expect(screen.getByRole('button', { name: 'Save Notes' })).toHaveProperty('disabled', true);
		expect(screen.getByText('Saved, but feedback could not be refreshed. Reload it before another save.')).toBeTruthy();
		expect((await submit(screen.getByRole('button', { name: 'Save Notes' }))).cancel).toHaveBeenCalledOnce();
		const reload = screen.getByRole('button', { name: 'Reload Feedback' });
		reload.focus();
		await fireEvent.click(reload);
		await waitFor(() => expect(screen.getByRole('button', { name: 'Save Notes' })).toHaveProperty('disabled', false));
		expect(invalidateAll).toHaveBeenCalledTimes(2);
		await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: /First feedback/ })));
	});

	it('ignores a read failure after the page lifetime has retired', async () => {
		let reject!: (error: Error) => void;
		invalidateAll.mockImplementation(
			() =>
				new Promise<void>((_, fail) => {
					reject = fail;
				})
		);
		render(Feedback, { props: { data: feedbackData(), form: null } });
		await openFeedback();
		const old = await submit(screen.getByRole('button', { name: 'Save Notes' }));
		const completion = old.finish(succeeded);
		await waitFor(() => expect(invalidateAll).toHaveBeenCalledOnce());
		await act(() => navigation[0]());
		await openFeedback('Peer feedback');
		await fireEvent.input(screen.getByLabelText('Admin Notes'), { target: { value: 'Fresh after navigation' } });
		reject(new Error('Old read failed'));
		await completion;
		expect(screen.getByLabelText('Admin Notes')).toHaveProperty('value', 'Fresh after navigation');
		expect(screen.queryByRole('button', { name: 'Reload Feedback' })).toBeNull();
		expect(screen.getByRole('button', { name: 'Save Notes' })).toHaveProperty('disabled', false);
	});

	it('retires and clears owned state for an actor change', async () => {
		const view = render(Feedback, { props: { data: feedbackData(), form: null } });
		await openFeedback();
		const old = await submit(screen.getByRole('button', { name: 'Save Notes' }));
		await view.rerender({ data: feedbackData('admin-b'), form: null });
		await openFeedback();
		await old.finish(succeeded);
		expect(screen.getByRole('button', { name: 'Save Notes' })).toHaveProperty('disabled', false);
		expect(invalidateAll).not.toHaveBeenCalled();
	});
});

describe('Dashboard admitted navigation', () => {
	it.each([
		{
			role: 'super_admin',
			pages: ['dashboard', 'users', 'organizations', 'access-requests', 'feedback', 'audit', 'announcements'],
			targets: ['/admin/audit', '/admin/users', '/admin/access-requests', '/admin/feedback', '/admin/organizations']
		},
		{
			role: 'support',
			pages: ['dashboard', 'users', 'organizations', 'access-requests', 'feedback'],
			targets: ['/admin/users', '/admin/access-requests', '/admin/feedback', '/admin/organizations']
		},
		{ role: 'billing', pages: ['dashboard'], targets: [] }
	] satisfies Array<{ role: DashboardData['adminRole']; pages: DashboardData['accessiblePages']; targets: string[] }>)(
		'shows only destinations admitted for $role',
		({ role, pages, targets }) => {
			render(Dashboard, {
				props: {
					data: {
						...adminData('admin-a'),
						adminRole: role,
						accessiblePages: pages,
						userStats: { total: 3, last_30_days: 1 },
						totalOrganizations: 2,
						pendingAccessRequests: 1,
						pendingFeedback: 1,
						signupTrend: [],
						recentActivity: []
					}
				}
			});
			expect([...new Set(screen.queryAllByRole('link').map((link) => link.getAttribute('href')))].sort()).toEqual(
				targets.toSorted()
			);
			if (role === 'billing') expect(screen.queryByText(/Use global admin search/)).toBeNull();
			else expect(screen.getByText(/Use global admin search/)).toBeTruthy();
		}
	);

	it('gives the signup chart a canonical data table', () => {
		render(Dashboard, {
			props: {
				data: {
					...adminData('admin-a'),
					userStats: { total: 3, last_30_days: 1 },
					totalOrganizations: 2,
					pendingAccessRequests: 0,
					pendingFeedback: 0,
					signupTrend: [{ date: '2026-10-01', count: 2 }],
					recentActivity: []
				}
			}
		});
		const table = screen.getByRole('table', { name: 'Admin signup trend data' });
		expect(
			within(table)
				.getAllByRole('columnheader')
				.map((header) => header.textContent?.trim())
		).toEqual(['Date', 'New accounts']);
		expect(
			within(table)
				.getAllByRole('row')
				.map((row) => row.textContent?.trim())
		).toEqual(['Date New accounts', '2026-10-01 2']);
	});
});
