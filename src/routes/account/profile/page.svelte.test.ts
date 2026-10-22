// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ProfilePage from './+page.svelte';

vi.mock('$app/forms', () => ({
	enhance: (form: HTMLFormElement, submit?: (input: { formData: FormData; cancel: () => void }) => unknown) => {
		const onSubmit = (event: Event) => {
			event.preventDefault();
			submit?.({ formData: new FormData(form), cancel: () => {} });
		};
		form.addEventListener('submit', onSubmit);
		return { destroy: () => form.removeEventListener('submit', onSubmit) };
	}
}));

afterEach(() => {
	cleanup();
});

describe('account profile page', () => {
	it('offers the account ranks in order with the saved rank selected, and requires a choice', () => {
		render(ProfilePage, {
			props: {
				data: {
					viewer: null,
					accountPathname: '/account/profile',
					profile: { userId: 'user-1', firstName: 'Emma', lastName: 'Hayes', rank: 'SGT' },
					ranks: ['CPT', 'SGT', 'SFC']
				},
				form: null
			}
		});

		const rank = screen.getByLabelText('Rank') as HTMLSelectElement;
		expect(rank.name).toBe('rank');
		expect(rank.getAttribute('aria-required')).toBe('true');
		expect([...rank.options].map((option) => option.textContent)).toEqual(['Select rank', 'CPT', 'SGT', 'SFC']);
		expect(rank.value).toBe('SGT');
	});

	it('starts on the empty choice when the account has no saved rank', () => {
		render(ProfilePage, {
			props: {
				data: {
					viewer: null,
					accountPathname: '/account/profile',
					profile: null,
					ranks: ['CPT', 'SGT']
				},
				form: null
			}
		});

		expect((screen.getByLabelText('Rank') as HTMLSelectElement).value).toBe('');
	});

	it('flags the empty rank only after a failed submit, and clears it once a rank is chosen', async () => {
		render(ProfilePage, {
			props: {
				data: { viewer: null, accountPathname: '/account/profile', profile: null, ranks: ['CPT', 'SGT'] },
				form: null
			}
		});
		const rank = screen.getByLabelText('Rank') as HTMLSelectElement;

		expect(rank.validity.valid).toBe(true);
		expect(rank.getAttribute('aria-invalid')).toBeNull();

		await fireEvent.submit(rank.form!);
		expect(rank.getAttribute('aria-invalid')).toBe('true');
		expect(screen.getByText('Select a rank.')).toBeTruthy();

		await fireEvent.change(rank, { target: { value: 'SGT' } });
		expect(rank.getAttribute('aria-invalid')).toBeNull();
		expect(screen.queryByText('Select a rank.')).toBeNull();
	});
});
