// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import type { ActionResult } from '@sveltejs/kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { enhanceRequests, frameworkOutcome, simulateEnhance } from '$lib/test-support/sveltekitEnhance';
import { stubToolbarWidths } from '$lib/test-support/toolbarWidths';

type Callback = (options: { result: ActionResult; update: () => Promise<void> }) => Promise<void>;
type Submit = (input: { formElement: HTMLFormElement; cancel: () => void }) => Callback;
const forms = vi.hoisted(() => ({ submits: new Map<string, Submit>() }));
vi.mock('$app/forms', () => ({
	enhance: (form: HTMLFormElement, submit: Submit) => {
		forms.submits.set(form.getAttribute('action') ?? '', submit);
		return simulateEnhance(form, submit);
	}
}));

const invitation = {
	id: 'invitation-1',
	organizationId: 'org-bravo',
	organizationName: 'Bravo Company',
	createdAt: '2026-04-26T12:00:00Z'
};

function invitationData(pendingInvitations = [invitation]) {
	return { viewer: null, organizations: [], pendingInvitations };
}

async function respond(action: string, result: ActionResult, applyForm: (form: unknown) => Promise<void>) {
	const form = screen
		.getAllByRole('button')
		.map((button) => button.closest('form'))
		.find((element) => element?.getAttribute('action') === action);
	if (!form) throw new Error(`Missing form ${action}`);
	await forms.submits.get(action)?.({ formElement: form, cancel: () => {} })(
		frameworkOutcome(result, { form, applyForm })
	);
}

describe('/dashboard page', () => {
	afterEach(() => {
		cleanup();
		forms.submits.clear();
		enhanceRequests.length = 0;
	});

	it('links organization cards to the preferred URL segment', async () => {
		const { default: Page } = await import('./+page.svelte');

		render(Page, {
			props: {
				data: {
					viewer: null,
					organizations: [{ id: 'org-1', name: 'Alpha Company', role: 'admin', urlSegment: '1-11-bde' }],
					pendingInvitations: []
				},
				form: null
			}
		});

		expect(screen.getByRole('link', { name: /Alpha Company/ }).getAttribute('href')).toBe('/org/1-11-bde');
		expect(screen.getAllByRole('main')).toHaveLength(1);
	});

	it('names invitation actions after their Organization', async () => {
		const { default: Page } = await import('./+page.svelte');
		render(Page, { props: { data: invitationData(), form: null } });

		expect(screen.getByRole('button', { name: 'Accept invitation to Bravo Company' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Decline invitation to Bravo Company' })).toBeTruthy();
	});

	it('keeps focus on Accept while the response is pending and sends a second press nowhere', async () => {
		const { default: Page } = await import('./+page.svelte');
		render(Page, { props: { data: invitationData(), form: null } });
		const accept = screen.getByRole('button', { name: 'Accept invitation to Bravo Company' }) as HTMLButtonElement;
		const decline = screen.getByRole('button', { name: 'Decline invitation to Bravo Company' });
		accept.focus();

		await fireEvent.click(accept);
		await fireEvent.click(accept);
		await fireEvent.click(decline);

		expect(enhanceRequests).toHaveLength(1);
		expect(accept.disabled).toBe(false);
		expect(accept.getAttribute('aria-disabled')).toBe('true');
		expect(decline.getAttribute('aria-disabled')).toBe('true');
		expect(document.activeElement).toBe(accept);
	});

	it('hides an earlier failure while a new response to the invitation is pending', async () => {
		const { default: Page } = await import('./+page.svelte');
		const view = render(Page, { props: { data: invitationData(), form: null } });
		await respond(
			'?/declineInvitation',
			{ type: 'failure', status: 409, data: { error: 'Invitation expired' } },
			(form) => view.rerender({ data: invitationData(), form: form as never })
		);
		const row = screen.getByText('Bravo Company').parentElement!;
		await waitFor(() => expect(within(row).getByRole('alert').textContent).toContain('Invitation expired'));

		await fireEvent.click(screen.getByRole('button', { name: 'Accept invitation to Bravo Company' }));

		expect(within(row).queryByRole('alert')).toBeNull();
	});

	it('moves focus to the workspace heading when a declined invitation leaves the list', async () => {
		const { default: Page } = await import('./+page.svelte');
		const view = render(Page, { props: { data: invitationData(), form: null } });

		await respond('?/declineInvitation', { type: 'success', status: 200 }, (form) =>
			view.rerender({ data: invitationData([]), form: form as never })
		);

		await waitFor(() =>
			expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Available workspaces' }))
		);
		expect(screen.getByRole('status').textContent?.trim()).toBe('Invitation declined.');
	});

	it('refreshes after an accepted invitation only while the dashboard is still open', async () => {
		const { default: Page } = await import('./+page.svelte');
		const refreshes: string[] = [];
		const view = render(Page, { props: { data: invitationData(), form: null } });
		await fireEvent.click(screen.getByRole('button', { name: 'Accept invitation to Bravo Company' }));
		await enhanceRequests[0](
			frameworkOutcome(
				{ type: 'success', status: 200 },
				{ applyForm: async () => {}, invalidate: async () => void refreshes.push('open') }
			)
		);
		await waitFor(() => expect(screen.getByRole('status').textContent?.trim()).toBe('Joined Bravo Company.'));

		await fireEvent.click(screen.getByRole('button', { name: 'Accept invitation to Bravo Company' }));
		view.unmount();
		await enhanceRequests[1](
			frameworkOutcome(
				{ type: 'success', status: 200 },
				{ applyForm: async () => {}, away: true, invalidate: async () => void refreshes.push('left') }
			)
		);

		expect(refreshes).toEqual(['open']);
	});

	it.each([
		[
			'?/acceptInvitation',
			'Accept',
			'failure',
			{ type: 'failure', status: 409, data: { error: 'Invitation expired' } }
		],
		['?/acceptInvitation', 'Accept', 'error', { type: 'error', status: 500, error: { message: 'Internal Error' } }],
		[
			'?/declineInvitation',
			'Decline',
			'failure',
			{ type: 'failure', status: 409, data: { error: 'Invitation expired' } }
		],
		['?/declineInvitation', 'Decline', 'error', { type: 'error', status: 500, error: { message: 'Internal Error' } }]
	] as const)(
		'keeps the invitation with an Alert in its row after a %s %s %s',
		async (action, label, _kind, result) => {
			const { default: Page } = await import('./+page.svelte');
			const view = render(Page, { props: { data: invitationData(), form: null } });

			await respond(action, result, (form) => view.rerender({ data: invitationData(), form: form as never }));

			const row = screen.getByText('Bravo Company').parentElement!;
			await waitFor(() => expect(within(row).getByRole('alert')).toBeTruthy());
			expect(document.activeElement).toBe(screen.getByRole('button', { name: `${label} invitation to Bravo Company` }));
		}
	);

	describe('organization filter', () => {
		const organizations = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'].map((name) => ({
			id: `org-${name.toLowerCase()}`,
			name: `${name} Company`,
			role: 'member'
		}));
		const chooser = () => screen.getByRole('toolbar', { name: 'Organization controls' });

		it('narrows the organization links as the filter changes and names a filter that matches nothing', async () => {
			const { default: Page } = await import('./+page.svelte');
			render(Page, { props: { data: { viewer: null, organizations, pendingInvitations: [] }, form: null } });
			const filter = within(chooser()).getByRole('searchbox', { name: 'Filter organizations' });

			await fireEvent.input(filter, { target: { value: ' ech ' } });
			expect(screen.getAllByRole('link', { name: /Company/ })).toHaveLength(1);
			expect(screen.getByRole('link', { name: /Echo Company/ }).getAttribute('href')).toBe('/org/org-echo');

			await fireEvent.input(filter, { target: { value: 'zulu' } });
			expect(screen.queryByRole('link', { name: /Company/ })).toBeNull();
			expect(screen.getByText('No organizations match "zulu"')).toBeTruthy();
		});

		it('filters from the collapsed search icon', async () => {
			const widths = stubToolbarWidths();
			const { default: Page } = await import('./+page.svelte');
			render(Page, { props: { data: { viewer: null, organizations, pendingInvitations: [] }, form: null } });
			await widths.foldAll();
			expect(screen.queryByRole('searchbox', { name: 'Filter organizations' })).toBeNull();

			await fireEvent.click(within(chooser()).getByRole('button', { name: 'Filter organizations' }));
			await fireEvent.input(await screen.findByRole('searchbox', { name: 'Filter organizations' }), {
				target: { value: 'bravo' }
			});

			expect(screen.getAllByRole('link', { name: /Company/ })).toHaveLength(1);
			expect(screen.getByRole('link', { name: /Bravo Company/ })).toBeTruthy();
		});
	});
});
