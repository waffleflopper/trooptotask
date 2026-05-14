// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, test } from 'vitest';
import DutyRosterSharedWrappersTest from './DutyRosterSharedWrappersTest.svelte';
import { getDutyRosterStatusBadge, type DutyRosterStatus } from './index.js';

describe('duty roster shared wrappers', () => {
	afterEach(async () => {
		cleanup();
		await new Promise((resolve) => setTimeout(resolve, 250));
	});

	test('maps domain statuses to locked badge variants and labels', () => {
		const statuses: DutyRosterStatus[] = [
			'active',
			'archived',
			'draft-preview',
			'official',
			'applied',
			'needs-sync',
			'invalidated',
			'latest',
			'correction-pending',
			'accepted',
			'manual',
			'review',
			'ok',
			'unresolved',
			'override',
			'locked'
		];

		for (const status of statuses) {
			const config = getDutyRosterStatusBadge(status);
			expect(config.label.length).toBeGreaterThan(0);
			expect(config.ariaLabel).toContain('Duty roster status');
			expect(config.variant).toBeTruthy();
		}

		expect(getDutyRosterStatusBadge('invalidated').variant).toBe('danger');
		expect(getDutyRosterStatusBadge('correction-pending').label).toBe('Correction Pending');
	});

	test('renders DA6 matrix with accessible cells, metadata, footer rows, and legend', () => {
		render(DutyRosterSharedWrappersTest);

		const table = screen.getByRole('table', { name: 'Test DA6 Matrix' });
		expect(table).toBeTruthy();
		expect(within(table).getByText('Mon')).toBeTruthy();
		expect(within(table).getByText('1-Jun')).toBeTruthy();
		expect(within(table).getByText('SGT Able')).toBeTruthy();
		expect(screen.getByLabelText(/SGT Able assigned on Mon 1-Jun/)).toBeTruthy();
		expect(screen.getByText('Assigned Count')).toBeTruthy();
		expect(screen.getByText('Authorized absence pauses the count.')).toBeTruthy();
		expect(screen.getByText('Manual override requiring review.')).toBeTruthy();
	});

	test('renders required panel and timeline states', () => {
		render(DutyRosterSharedWrappersTest);

		expect(screen.getByText('Correction Pending')).toBeTruthy();
		expect(screen.getByText('Latest')).toBeTruthy();
		expect(screen.getByText('Warnings (1)')).toBeTruthy();
		expect(screen.getByText('Run accepted')).toBeTruthy();
		expect(screen.getByText('Manual Preview Change')).toBeTruthy();
		expect(screen.getByText('Duty Roster Correction')).toBeTruthy();
		expect(screen.getAllByText('SSG David Wilson').length).toBeGreaterThan(0);
		expect(screen.getByText('Outside Pool Warning')).toBeTruthy();
	});
});
