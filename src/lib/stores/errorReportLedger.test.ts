import { afterEach, describe, expect, it } from 'vitest';
import {
	FRESH_ERROR_REFERENCE_MS,
	clearErrorReferences,
	recordErrorReference,
	reportClientFailure,
	setClientFailureSink,
	takeFreshErrorReference
} from './errorReportLedger';

afterEach(() => clearErrorReferences());

describe('error report ledger', () => {
	it('hands a fresh reference to the first toast only', () => {
		recordErrorReference('ref-1', 'alpha', 1000);

		expect(takeFreshErrorReference('alpha', 1500)).toBe('ref-1');
		expect(takeFreshErrorReference('alpha', 1600)).toBeNull();
	});

	it('offers the newest failure when several happened', () => {
		recordErrorReference('older', 'alpha', 1000);
		recordErrorReference('newer', 'alpha', 1200);

		expect(takeFreshErrorReference('alpha', 1300)).toBe('newer');
	});

	it('offers nothing once the failure is stale', () => {
		recordErrorReference('ref-1', 'alpha', 1000);

		expect(takeFreshErrorReference('alpha', 1000 + FRESH_ERROR_REFERENCE_MS + 1)).toBeNull();
	});

	it('never offers a failure from another organization, and keeps it for its own', () => {
		recordErrorReference('ref-1', 'alpha', 1000);

		expect(takeFreshErrorReference('bravo', 1100)).toBeNull();
		expect(takeFreshErrorReference(null, 1100)).toBeNull();
		expect(takeFreshErrorReference('alpha', 1200)).toBe('ref-1');
	});

	it('hands out a report that is still being sent as a promise', async () => {
		const pending = Promise.resolve('ref-late');
		recordErrorReference(pending, 'alpha', 1000);

		await expect(takeFreshErrorReference('alpha', 1100)).resolves.toBe('ref-late');
	});
});

describe('reporting a caught failure', () => {
	it('hands it to the page capture, and is silent before one is registered', () => {
		const received: unknown[] = [];
		const failure = new Error('PDF failed');

		expect(() => reportClientFailure(failure)).not.toThrow();
		setClientFailureSink((value) => received.push(value));
		reportClientFailure(failure);
		setClientFailureSink(null);
		reportClientFailure(new Error('after'));

		expect(received).toEqual([failure]);
	});
});
