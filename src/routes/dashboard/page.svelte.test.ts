// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Callback = (options: { result: { type: string }; update: () => Promise<void> }) => Promise<void>;
type Submit = (input: { formElement: HTMLFormElement }) => Callback;
const forms = vi.hoisted(() => ({ submits: new Map<string, Submit>() }));
vi.mock('$app/forms', () => ({
	enhance: (form: HTMLFormElement, submit: Submit) => {
		forms.submits.set(form.getAttribute('action') ?? '', submit);
	}
}));

const invitation = {
	id: 'invitation-1',
	organizationId: 'org-bravo',
	organizationName: 'Bravo Company',
	createdAt: '2026-04-26T12:00:00Z'
};

function invitationData(pendingInvitations = [invitation]) {
	return { session: null, organizations: [], pendingInvitations };
}

async function respond(action: string, result: string, update: () => Promise<void> = async () => {}) {
	const form = screen
		.getAllByRole('button')
		.map((button) => button.closest('form'))
		.find((element) => element?.getAttribute('action') === action);
	if (!form) throw new Error(`Missing form ${action}`);
	await forms.submits.get(action)?.({ formElement: form })({ result: { type: result }, update });
}

describe('/dashboard page', () => {
	beforeEach(() => {
		Object.defineProperty(globalThis, 'localStorage', {
			configurable: true,
			value: {
				getItem: vi.fn(() => 'dark'),
				setItem: vi.fn(),
				removeItem: vi.fn(),
				clear: vi.fn()
			}
		});
		Object.defineProperty(window, 'localStorage', {
			configurable: true,
			value: {
				getItem: vi.fn(() => 'dark'),
				setItem: vi.fn(),
				removeItem: vi.fn(),
				clear: vi.fn()
			}
		});
		vi.stubGlobal(
			'matchMedia',
			vi.fn(() => ({ matches: false }))
		);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		forms.submits.clear();
	});

	it('hydrates the theme toggle without crashing when the organization chooser is forced visible', async () => {
		const { default: Page } = await import('./+page.svelte');

		expect(() =>
			render(Page, {
				props: {
					data: {
						session: null,
						organizations: [{ id: 'org-1', name: 'Alpha Company', role: 'admin' }],
						pendingInvitations: []
					},
					form: null
				}
			})
		).not.toThrow();

		await fireEvent.click(screen.getByRole('button', { name: 'Toggle theme' }));
		expect(screen.getByRole('button', { name: 'Toggle theme' })).toBeTruthy();
	});

	it('links organization cards to the preferred URL segment', async () => {
		const { default: Page } = await import('./+page.svelte');

		render(Page, {
			props: {
				data: {
					session: null,
					organizations: [{ id: 'org-1', name: 'Alpha Company', role: 'admin', urlSegment: '1-11-bde' }],
					pendingInvitations: []
				},
				form: null
			}
		});

		expect(screen.getByRole('link', { name: /Alpha Company/ }).getAttribute('href')).toBe('/org/1-11-bde');
	});

	it('names invitation actions after their Organization', async () => {
		const { default: Page } = await import('./+page.svelte');
		render(Page, { props: { data: invitationData(), form: null } });

		expect(screen.getByRole('button', { name: 'Accept invitation to Bravo Company' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Decline invitation to Bravo Company' })).toBeTruthy();
	});

	it('moves focus to the workspace heading when a declined invitation leaves the list', async () => {
		const { default: Page } = await import('./+page.svelte');
		const view = render(Page, { props: { data: invitationData(), form: null } });

		await respond('?/declineInvitation', 'success', async () => {
			await view.rerender({ data: invitationData([]), form: null });
		});

		await waitFor(() =>
			expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Available workspaces' }))
		);
		expect(screen.getByRole('status').textContent?.trim()).toBe('Invitation declined.');
	});

	it('returns focus to the pressed action when the invitation response fails', async () => {
		const { default: Page } = await import('./+page.svelte');
		render(Page, { props: { data: invitationData(), form: null } });

		await respond('?/declineInvitation', 'failure');

		await waitFor(() =>
			expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Decline invitation to Bravo Company' }))
		);
	});
});
