import { error } from '@sveltejs/kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_REFERENCE_HEADER } from '$lib/errors';
import { captureHandle, handleServerError } from './errorCapture.server';
import { rethrowOrWrap, toActionFailure } from './httpAdapter';

const rpc = vi.fn();
vi.mock('$lib/server/supabase', () => ({ getAdminClient: () => ({ rpc }) }));

const ORG_ID = '22222222-2222-4222-8222-222222222222';

function makeEvent(routeId = '/org/[orgId]/api/availability', method = 'POST') {
	return {
		route: { id: routeId },
		params: { orgId: 'alpha' },
		request: new Request('https://app.example.test/org/alpha/api/availability', { method }),
		locals: {
			actor: { userId: 'user-1' },
			organizationAdmissions: new Map([['alpha', Promise.resolve({ id: ORG_ID })]])
		}
	} as never;
}

function recordedCalls() {
	return rpc.mock.calls.map(([name, args]) => ({ name, ...args }));
}

beforeEach(() => {
	rpc.mockReset();
	rpc.mockResolvedValue({ data: null, error: null });
	vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('capturing a request', () => {
	it('does not capture a 4xx response or an app-raised 4xx', async () => {
		const event = makeEvent();
		const response = await captureHandle({
			event,
			resolve: async () => {
				try {
					rethrowOrWrap(error(404, 'Not found'));
				} catch {
					/* the framework turns this into the 404 response */
				}
				return new Response('missing', { status: 404 });
			}
		});

		expect(response.headers.get(ERROR_REFERENCE_HEADER)).toBeNull();
		expect(rpc).not.toHaveBeenCalled();
	});

	it('records an unknown exception wrapped by a route and names its reference in the response header', async () => {
		const response = await captureHandle({
			event: makeEvent(),
			resolve: async () => {
				try {
					rethrowOrWrap(Object.assign(new Error('relation does not exist'), { code: '42P01' }));
				} catch (thrown) {
					expect(thrown).toMatchObject({
						status: 500,
						body: { message: 'Internal server error', errorReference: expect.any(String) }
					});
				}
				return new Response('failed', { status: 500 });
			}
		});

		const reference = response.headers.get(ERROR_REFERENCE_HEADER);
		expect(reference).toMatch(/^[0-9a-f-]{36}$/);
		expect(recordedCalls()).toEqual([
			expect.objectContaining({
				name: 'record_platform_error',
				p_reference: reference,
				p_origin: 'server',
				p_kind: 'server_exception',
				p_code: '42P01',
				p_route_id: '/org/[orgId]/api/availability',
				p_method: 'POST',
				p_http_status: 500,
				p_user_id: 'user-1',
				p_organization_id: ORG_ID
			})
		]);
	});

	it('records a failed action once, with the reference in its data path', async () => {
		let failure: ReturnType<typeof toActionFailure> | undefined;
		const response = await captureHandle({
			event: makeEvent('/org/[orgId]/settings'),
			resolve: async () => {
				failure = toActionFailure('saveError', new Error('boom'));
				return new Response('failed', { status: 500 });
			}
		});

		expect(failure?.status).toBe(500);
		expect(response.headers.get(ERROR_REFERENCE_HEADER)).toMatch(/^[0-9a-f-]{36}$/);
		expect(rpc).toHaveBeenCalledTimes(1);
	});

	it('records a bare 5xx response that nothing noted as a generic server response', async () => {
		const response = await captureHandle({
			event: makeEvent(),
			resolve: async () => new Response('{"error":"down"}', { status: 503 })
		});

		expect(response.headers.get(ERROR_REFERENCE_HEADER)).toMatch(/^[0-9a-f-]{36}$/);
		expect(recordedCalls()).toEqual([
			expect.objectContaining({ p_kind: 'server_response', p_name: 'ServerResponse', p_http_status: 503 })
		]);
	});

	it('keeps the original response when recording fails', async () => {
		rpc.mockRejectedValue(new Error('database down'));

		const response = await captureHandle({
			event: makeEvent(),
			resolve: async () => new Response('failed', { status: 500 })
		});

		expect(response.status).toBe(500);
		await expect(response.text()).resolves.toBe('failed');
	});

	it('does not record a failure of the report endpoint itself', async () => {
		const response = await captureHandle({
			event: makeEvent('/org/[orgId]/api/errors'),
			resolve: async () => new Response('', { status: 503 })
		});

		expect(response.headers.get(ERROR_REFERENCE_HEADER)).toBeNull();
		expect(rpc).not.toHaveBeenCalled();
	});
});

describe('handling errors SvelteKit catches', () => {
	it.each([
		['validation', { kind: 'validation', error: { status: 400, message: 'Bad Request' }, issues: [] }],
		['framework 404', { kind: 'framework', error: { status: 404, message: 'Not Found' } }],
		['app 403', { kind: 'app', error: { status: 403, message: 'Forbidden' } }],
		['app 429', { kind: 'app', error: { status: 429, message: 'Too many requests' } }]
	])('does not capture %s', (_name, input) => {
		expect(handleServerError({ ...input, event: makeEvent() } as never)).toBeUndefined();
		expect(rpc).not.toHaveBeenCalled();
	});

	it('records an unknown exception outside any request scope and returns its reference', async () => {
		const result = await handleServerError({
			kind: 'unknown',
			error: new Error('render failed'),
			event: makeEvent('/org/[orgId]/calendar', 'GET')
		} as never);

		expect(result).toEqual({ errorReference: expect.stringMatching(/^[0-9a-f-]{36}$/) });
		expect(recordedCalls()).toEqual([
			expect.objectContaining({ p_kind: 'server_exception', p_route_id: '/org/[orgId]/calendar', p_method: 'GET' })
		]);
	});

	it('does not record again an error the adapter already captured', async () => {
		const result = handleServerError({
			kind: 'app',
			error: { status: 500, message: 'Internal server error', errorReference: 'a0000000-0000-4000-8000-000000190001' },
			event: makeEvent()
		} as never);

		expect(result).toEqual({ errorReference: 'a0000000-0000-4000-8000-000000190001' });
		expect(rpc).not.toHaveBeenCalled();
	});

	it('returns the original error unchanged when the recorder is down', async () => {
		rpc.mockRejectedValue(new Error('database down'));

		const result = await handleServerError({
			kind: 'unknown',
			error: new Error('render failed'),
			event: makeEvent()
		} as never);

		expect(result).toEqual({ errorReference: expect.any(String) });
		expect(console.error).toHaveBeenCalledWith('[error-capture] Not recorded:', expect.anything());
	});
});
