// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { openToolbarMore, openToolbarSubmenu, stubToolbarWidths } from '$lib/test-support/toolbarWidths';
import AuditPage from './+page.svelte';
import type { PageData } from './$types';

const { goto, current } = vi.hoisted(() => ({
	goto: vi.fn(async () => {}),
	current: { url: 'http://localhost/admin/audit?page=2' }
}));
vi.mock('$app/navigation', () => ({ goto }));
vi.mock('$app/stores', () => ({
	page: {
		subscribe(run: (value: { url: URL }) => void) {
			run({ url: new URL(current.url) });
			return () => {};
		}
	}
}));

afterEach(() => {
	cleanup();
	goto.mockClear();
	current.url = 'http://localhost/admin/audit?page=2';
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

	async function chooseOption(trigger: HTMLElement, option: string) {
		trigger.focus();
		await fireEvent.keyDown(trigger, { key: 'ArrowDown' });
		await fireEvent.pointerUp(await screen.findByRole('option', { name: option }));
	}

	it('applies a filter on change from the first page and keeps focus on it', async () => {
		render(AuditPage, { data });
		const severity = within(screen.getByRole('toolbar', { name: 'Audit Log controls' })).getByRole('button', {
			name: 'Severity'
		});

		await chooseOption(severity, 'Info');

		expect(goto).toHaveBeenCalledOnce();
		expect(goto).toHaveBeenCalledWith('/admin/audit?page=1&severity=info', { keepFocus: true });
		expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
	});

	it('keeps the other filter when one changes and drops a filter chosen back to All', async () => {
		const filtered = { ...data, actionFilter: 'verification.audit_a', severityFilter: 'info' } as unknown as PageData;
		current.url = 'http://localhost/admin/audit?page=4&action=verification.audit_a&severity=info';
		render(AuditPage, { data: filtered });
		const toolbar = within(screen.getByRole('toolbar', { name: 'Audit Log controls' }));
		expect(toolbar.getByRole('button', { name: 'Action' }).textContent).toContain('Verification.Audit A');
		expect(toolbar.getByRole('button', { name: 'Severity' }).textContent).toContain('Info');

		await chooseOption(toolbar.getByRole('button', { name: 'Severity' }), 'All severities');

		expect(goto).toHaveBeenLastCalledWith('/admin/audit?page=1&action=verification.audit_a', { keepFocus: true });
	});

	it('changes the Action filter from More when the row folds it', async () => {
		const toolbarWidths = stubToolbarWidths();
		render(AuditPage, { data });
		await toolbarWidths.foldAll();
		const toolbar = within(screen.getByRole('toolbar', { name: 'Audit Log controls' }));
		expect(toolbar.queryByRole('button', { name: 'Action' })).toBeNull();

		await openToolbarMore('Audit Log controls');
		await openToolbarSubmenu('Action, All actions');
		await fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Verification.Audit A' }));

		expect(goto).toHaveBeenLastCalledWith('/admin/audit?page=1&action=verification.audit_a', { keepFocus: true });
	});
});
