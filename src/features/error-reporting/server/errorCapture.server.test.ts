import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	captureFailure,
	fingerprintFailure,
	noteServerFailure,
	recordingAfterResponse,
	runInErrorScope,
	type CaptureConfig,
	type StoredErrorOccurrence
} from './errorCapture.server';

afterEach(() => vi.restoreAllMocks());

function makeConfig(overrides: Partial<CaptureConfig> = {}) {
	const stored: StoredErrorOccurrence[] = [];
	const config: CaptureConfig = {
		record: async (occurrence) => {
			stored.push(occurrence);
		},
		routeId: '/org/[orgId]/api/availability',
		method: 'POST',
		userId: () => 'user-1',
		organizationId: async () => 'org-1',
		...overrides
	};
	return { config, stored };
}

const REFERENCE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('capturing a failure', () => {
	it('stores the sanitized failure with the server-attributed user, organization and route', async () => {
		const { config, stored } = makeConfig();
		const failure = Object.assign(new Error('Key (email)=(jane@example.test) already exists for 42 rows'), {
			code: '23505',
			details: 'Key (email)=(jane@example.test) already exists.'
		});

		const { reference, recorded } = captureFailure(config, {
			failure,
			origin: 'server',
			kind: 'server_exception',
			status: 500
		});

		await expect(recorded).resolves.toBe(true);
		expect(reference).toMatch(REFERENCE);
		expect(stored).toEqual([
			expect.objectContaining({
				reference,
				origin: 'server',
				kind: 'server_exception',
				name: 'Error',
				code: '23505',
				message: 'Key ? already exists for [n] rows',
				routeId: '/org/[orgId]/api/availability',
				method: 'POST',
				httpStatus: 500,
				userId: 'user-1',
				organizationId: 'org-1'
			})
		]);
		expect(JSON.stringify(stored)).not.toContain('jane@example.test');
	});

	it('gives two failures with different volatile values the same fingerprint, and different origins different ones', async () => {
		const { config, stored } = makeConfig();
		for (const id of ['1111', '2222']) {
			await captureFailure(config, {
				failure: new Error(`Row ${id} could not be saved`),
				origin: 'server',
				kind: 'server_exception',
				status: 500
			}).recorded;
		}
		await captureFailure(config, {
			failure: new Error('Row 1111 could not be saved'),
			origin: 'client_reported',
			kind: 'server_exception',
			status: 500
		}).recorded;

		expect(stored[0].fingerprint).toBe(stored[1].fingerprint);
		expect(stored[2].fingerprint).not.toBe(stored[0].fingerprint);
		expect(stored[0].fingerprint).toBe(
			fingerprintFailure({
				origin: 'server',
				kind: 'server_exception',
				routeId: '/org/[orgId]/api/availability',
				method: 'POST',
				name: 'Error',
				code: null,
				message: 'Row [n] could not be saved'
			})
		);
	});

	it('settles false and logs when the store rejects, never throwing into the request', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { config } = makeConfig({
			record: async () => {
				throw new Error('connection refused');
			}
		});

		const { recorded } = captureFailure(config, {
			failure: new Error('Save failed'),
			origin: 'server',
			kind: 'server_exception',
			status: 500
		});

		await expect(recorded).resolves.toBe(false);
		expect(consoleError).toHaveBeenCalledWith(
			'[error-capture] Not recorded:',
			expect.objectContaining({ message: 'Save failed', routeId: '/org/[orgId]/api/availability' })
		);
	});

	it('stops waiting for a store that does not answer within the timeout', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { config } = makeConfig({ record: () => new Promise(() => {}), timeoutMs: 20 });

		const { recorded } = captureFailure(config, {
			failure: new Error('Save failed'),
			origin: 'server',
			kind: 'server_exception',
			status: 500
		});

		await expect(recorded).resolves.toBe(false);
	});

	it('still stores the failure when the organization cannot be resolved', async () => {
		const { config, stored } = makeConfig({
			organizationId: async () => {
				throw new Error('admission failed');
			}
		});

		await captureFailure(config, {
			failure: new Error('Save failed'),
			origin: 'server',
			kind: 'server_exception',
			status: 500
		}).recorded;

		expect(stored[0]).toMatchObject({ organizationId: null, userId: 'user-1' });
	});
});

describe('the request scope', () => {
	it('returns nothing to note outside a request', () => {
		expect(noteServerFailure({ failure: new Error('x'), kind: 'server_exception', status: 500 })).toBeNull();
	});

	it('awaits every recording before it settles and reports the newest reference', async () => {
		let finish: () => void = () => {};
		const stored: string[] = [];
		const { config } = makeConfig({
			record: (occurrence) =>
				new Promise<void>((resolve) => {
					finish = () => {
						stored.push(occurrence.reference);
						resolve();
					};
				})
		});

		let settled = false;
		const scoped = runInErrorScope(config, async () => {
			noteServerFailure({ failure: new Error('Save failed'), kind: 'server_exception', status: 500 });
			return 'response';
		}).then((result) => {
			settled = true;
			return result;
		});

		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(settled).toBe(false);
		finish();
		const { result, reference } = await scoped;

		expect(result).toBe('response');
		expect(stored).toEqual([reference]);
	});

	it('records the failure and rethrows the original when the work throws', async () => {
		const { config, stored } = makeConfig();
		const original = new Error('Render blew up');

		await expect(
			runInErrorScope(config, async () => {
				noteServerFailure({ failure: original, kind: 'server_exception', status: 500 });
				throw original;
			})
		).rejects.toBe(original);

		expect(stored).toHaveLength(1);
	});

	it('records a failure noted after the response and hands its write to the caller', async () => {
		const { config, stored } = makeConfig();
		let lateReference: string | null = null;
		let lateRecording: Promise<boolean> | null = null;

		await runInErrorScope(config, async () => {
			setTimeout(() => {
				lateReference = noteServerFailure({ failure: new Error('Streamed'), kind: 'server_exception', status: 500 });
				lateRecording = lateReference ? recordingAfterResponse(lateReference) : null;
			}, 5);
			return 'response';
		});
		await new Promise((resolve) => setTimeout(resolve, 20));

		expect(lateReference).toMatch(REFERENCE);
		await expect(lateRecording).resolves.toBe(true);
		expect(stored.map((occurrence) => occurrence.reference)).toEqual([lateReference]);
	});
});
