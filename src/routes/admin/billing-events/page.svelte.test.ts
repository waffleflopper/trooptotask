// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';

import Page from './+page.svelte';

afterEach(() => {
	cleanup();
});

const baseEvent = {
	id: 'evt_retryable_failed_123456789',
	type: 'checkout.session.completed',
	objectId: 'cs_123',
	secondaryDedupeKey: 'checkout.session.completed:cs_123',
	eventCreatedAt: '2026-05-23T00:00:00.000Z',
	processed: false,
	processedAt: null,
	processingState: 'retryable_failed',
	attemptCount: 2,
	lastError: 'temporary database timeout',
	processingResult: 'retryable processing failure',
	createdAt: '2026-05-23T00:00:01.000Z',
	updatedAt: '2026-05-23T00:00:02.000Z',
	canRetry: true,
	organization: { id: 'org-123456789', name: 'Alpha Company' }
} as const;

describe('admin billing events page', () => {
	it('shows safe event diagnostics and retry action for retryable failures', () => {
		render(Page, {
			props: {
				data: {
					events: [baseEvent],
					diagnosticsError: false
				} as never,
				form: null
			}
		});

		expect(screen.getByText('Billing Events')).toBeTruthy();
		expect(screen.getByText('checkout.session.completed')).toBeTruthy();
		expect(screen.getByText('Retryable Failed')).toBeTruthy();
		expect(screen.getByText('Alpha Company')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
		expect(document.querySelector('[data-slot="table"]')?.className).toContain('table-fixed');
		expect(screen.getByText('retryable processing failure').className).toContain('whitespace-normal');
		expect(screen.getByText('temporary database timeout').className).toContain('whitespace-normal');
	});

	it('does not show retry controls for processed events or raw payload content', () => {
		render(Page, {
			props: {
				data: {
					events: [
						{
							...baseEvent,
							id: 'evt_processed_123456789',
							processingState: 'processed',
							canRetry: false,
							lastError: null,
							processingResult: 'processed safely'
						}
					],
					diagnosticsError: false
				} as never,
				form: null
			}
		});

		expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
		expect(screen.getByText('Unavailable')).toBeTruthy();
		expect(screen.queryByText('not-for-admin-ui')).toBeNull();
	});

	it('warns when linked diagnostics are incomplete', () => {
		render(Page, {
			props: {
				data: {
					events: [],
					diagnosticsError: true
				} as never,
				form: null
			}
		});

		expect(screen.getByText('Some billing diagnostics could not be loaded.')).toBeTruthy();
		expect(screen.getByText(/organization links may be incomplete/)).toBeTruthy();
	});
});
