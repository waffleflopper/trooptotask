// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import EvalBadge, { getEvalBadgeClass, getEvalDueRequirementStatus } from './EvalBadge.svelte';

describe('EvalBadge', () => {
	afterEach(() => {
		cleanup();
	});

	it('maps eval due statuses to the shared requirement lifecycle language', () => {
		expect(getEvalDueRequirementStatus('current')).toBe('current');
		expect(getEvalDueRequirementStatus('due-60')).toBe('expiring-soon');
		expect(getEvalDueRequirementStatus('due-30')).toBe('expiring');
		expect(getEvalDueRequirementStatus('overdue')).toBe('expired');
	});

	it('uses token-backed classes for eval type, due, and workflow badges', () => {
		expect(getEvalBadgeClass('type', 'NCOER')).toContain('emerald');
		expect(getEvalBadgeClass('type', 'OER')).toContain('sky');
		expect(getEvalBadgeClass('type', 'WOER')).toContain('violet');
		expect(getEvalBadgeClass('due', 'overdue')).toContain('danger');
		expect(getEvalBadgeClass('workflow', 'completed')).toContain('success');
	});

	it('renders report type labels through the badge component', () => {
		render(EvalBadge, { kind: 'type', value: 'NCOER', reportType: 'AN' });

		expect(screen.getByText('NCOER/AN')).toBeTruthy();
	});
});
