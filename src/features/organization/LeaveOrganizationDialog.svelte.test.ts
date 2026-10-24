// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, expect, it } from 'vitest';
import LeaveOrganizationDialog from './LeaveOrganizationDialog.svelte';

afterEach(() => cleanup());

it('posts the membership to the leave action only after YES is typed', async () => {
	render(LeaveOrganizationDialog, {
		props: { open: true, orgName: 'Test Org', orgUrlSegment: 'alpha', membershipId: 'membership-1' }
	});

	expect(await screen.findByRole('dialog', { name: 'Leave Organization' })).toBeTruthy();
	const submit = screen.getByRole('button', { name: 'Leave Organization' });
	expect(submit).toBeDisabled();
	const membership = screen.getByDisplayValue('membership-1');
	expect(membership).toHaveAttribute('name', 'membershipId');
	expect(membership.closest('form')).toHaveAttribute('action', '/org/alpha?/leaveOrganization');

	await fireEvent.input(screen.getByRole('textbox', { name: 'Type YES to confirm' }), { target: { value: 'yes' } });
	expect(submit).toBeDisabled();
	await fireEvent.input(screen.getByRole('textbox', { name: 'Type YES to confirm' }), { target: { value: 'YES' } });
	expect(submit).toBeEnabled();
});

it('explains a missing membership and keeps the leave disabled', async () => {
	render(LeaveOrganizationDialog, {
		props: { open: true, orgName: 'Test Org', orgUrlSegment: 'alpha', membershipId: null }
	});

	await fireEvent.input(await screen.findByRole('textbox', { name: 'Type YES to confirm' }), {
		target: { value: 'YES' }
	});
	expect(
		screen.getByText('We could not identify your organization membership. Refresh the page and try again.')
	).toBeTruthy();
	expect(screen.getByRole('button', { name: 'Leave Organization' })).toBeDisabled();
});
