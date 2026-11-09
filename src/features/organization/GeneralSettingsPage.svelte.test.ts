// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	enhanceRequests,
	frameworkOutcome,
	simulateEnhance,
	type FrameworkPage
} from '$lib/test-support/sveltekitEnhance';
import GeneralSettingsPage from './GeneralSettingsPage.svelte';
import type { GeneralSettingsData } from './generalSettingsTypes';

vi.mock('$app/forms', () => ({ enhance: simulateEnhance }));
vi.mock('$app/state', () => ({ page: { url: new URL('http://app.invalid/org/alpha/settings/general') } }));

const settings: GeneralSettingsData = {
	organization: { id: 'org-1', name: 'Alpha Company', urlSlug: null, urlSegment: 'alpha' },
	lastRenamed: null,
	calendarCounts: Promise.resolve({
		statusTypes: { status: 'ready', value: 2 },
		assignmentTypes: { status: 'ready', value: 3 },
		specialDays: { status: 'ready', value: 4 }
	} as never)
};

const framework: FrameworkPage = { applyForm: async () => {} };
const thrown = { type: 'error', status: 500, error: { status: 500, message: 'private detail' } } as const;

afterEach(() => {
	cleanup();
	enhanceRequests.length = 0;
});

describe('General settings forms', () => {
	it('keeps the typed unit name and shows an alert when the rename throws', async () => {
		render(GeneralSettingsPage, { settings, form: null });
		await fireEvent.click(screen.getByRole('button', { name: 'Edit unit name' }));
		const name = screen.getByLabelText('Unit name');
		await fireEvent.input(name, { target: { value: 'Bravo Company' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		await waitFor(() => expect(enhanceRequests).toHaveLength(1));

		await enhanceRequests[0](frameworkOutcome(thrown, framework));

		expect(await screen.findByRole('alert')).toBeInTheDocument();
		expect(document.body.querySelector('h1')).toBeNull();
		expect(screen.getByLabelText('Unit name')).toHaveValue('Bravo Company');
		await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).not.toHaveAttribute('aria-disabled'));
	});

	it('keeps the typed web address and shows an alert when the update throws', async () => {
		render(GeneralSettingsPage, { settings, form: null });
		const address = screen.getByLabelText(/^Web address|urlSlug/i);
		await fireEvent.input(address, { target: { value: 'alpha-co' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Update' }));
		await fireEvent.click(await screen.findByRole('button', { name: 'Update address' }));
		await waitFor(() => expect(enhanceRequests).toHaveLength(1));

		await enhanceRequests[0](frameworkOutcome(thrown, framework));

		expect(await screen.findByRole('alert')).toBeInTheDocument();
		expect(document.body.querySelector('h1')).toBeNull();
		expect(screen.getByLabelText(/^Web address|urlSlug/i)).toHaveValue('alpha-co');
	});
});
