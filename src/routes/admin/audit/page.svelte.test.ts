// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import AuditPage from './+page.svelte';
import type { PageData } from './$types';

const { goto } = vi.hoisted(() => ({ goto: vi.fn(async () => {}) }));
vi.mock('$app/navigation', () => ({ goto }));
vi.mock('$app/stores', async () => {
	const { readable } = await import('svelte/store');
	return { page: readable({ url: new URL('http://localhost/admin/audit?page=2') }) };
});

afterEach(() => {
	cleanup();
	goto.mockClear();
});

const data = {
	logs: [
		{
			id: 'log-1',
			createdAt: '2026-10-10T12:00:00.000Z',
			severity: 'info',
			action: 'verification.audit_a',
			userId: null,
			resourceType: 'organization',
			resourceId: null,
			ipAddress: null,
			details: { reason: 'masked detail' }
		}
	],
	totalCount: 120,
	page: 2,
	limit: 50,
	availableActions: ['verification.audit_a'],
	actionFilter: '',
	severityFilter: ''
} as unknown as PageData;

describe('platform Audit page', () => {
	it('expands details from a named Button disclosure that controls the details panel', async () => {
		render(AuditPage, { data });
		const trigger = screen.getByRole('button', { name: /^View details for Verification\.Audit A at / });
		expect(trigger.textContent?.trim()).toBe('View details');
		expect(trigger.getAttribute('aria-expanded')).toBe('false');

		await fireEvent.click(trigger);

		expect(trigger.getAttribute('aria-expanded')).toBe('true');
		const panel = document.getElementById(trigger.getAttribute('aria-controls')!);
		expect(panel?.textContent).toContain('masked detail');
	});

	it('keeps focus on a filter while it navigates to the first filtered page', async () => {
		render(AuditPage, { data });
		const severity = screen.getByLabelText('Severity') as HTMLSelectElement;
		severity.focus();

		await fireEvent.change(severity, { target: { value: 'info' } });

		expect(goto).toHaveBeenCalledWith('/admin/audit?page=1&severity=info', { keepFocus: true });
	});
});
