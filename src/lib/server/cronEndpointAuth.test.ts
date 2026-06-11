import { describe, expect, it } from 'vitest';
import { assertCronEndpointAuthorized } from './cronEndpointAuth';

function captureThrownError(run: () => void): unknown {
	try {
		run();
		return undefined;
	} catch (error) {
		return error;
	}
}

describe('assertCronEndpointAuthorized', () => {
	it('rejects null headers when a secret exists', () => {
		expect(captureThrownError(() => assertCronEndpointAuthorized(null, ['cleanup-secret']))).toMatchObject({
			status: 401
		});
	});

	it('rejects wrong bearer tokens when a secret exists', () => {
		expect(captureThrownError(() => assertCronEndpointAuthorized('Bearer wrong', ['cleanup-secret']))).toMatchObject({
			status: 401
		});
	});

	it('accepts either cleanup-specific or shared cron secrets', () => {
		expect(() =>
			assertCronEndpointAuthorized('Bearer cleanup-secret', ['cleanup-secret', 'cron-secret'])
		).not.toThrow();
		expect(() => assertCronEndpointAuthorized('Bearer cron-secret', ['cleanup-secret', 'cron-secret'])).not.toThrow();
	});

	it('rejects Bearer undefined when secrets are unset', () => {
		expect(
			captureThrownError(() => assertCronEndpointAuthorized('Bearer undefined', [undefined, undefined]))
		).toMatchObject({
			status: 500
		});
	});

	it('rejects Bearer with blank-only configured secrets', () => {
		expect(captureThrownError(() => assertCronEndpointAuthorized('Bearer ', ['', '   ']))).toMatchObject({
			status: 500
		});
	});
});
