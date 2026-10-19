import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _putConfig } from './+server';

const PERSON_ID = '00000000-0000-4000-8000-0000000000a1';
const OTHER_PERSON_ID = '00000000-0000-4000-8000-0000000000a2';

function putEvent(id: string, body: unknown) {
	return {
		params: { id },
		request: new Request('http://localhost', { method: 'PUT', body: JSON.stringify(body) })
	} as never;
}

describe('/api/personnel/[id]/data-sheet', () => {
	it('takes the Personnel id from the route and ignores one in the body', async () => {
		await expect(
			_putConfig.parseInput?.(putEvent(PERSON_ID, { personnelId: OTHER_PERSON_ID, basicInfo: {} }))
		).resolves.toEqual({
			personnelId: PERSON_ID,
			body: { personnelId: OTHER_PERSON_ID, basicInfo: {} }
		});
	});

	it('answers a non-UUID route segment like a missing record', async () => {
		await expect(_putConfig.parseInput?.(putEvent('not-a-uuid', {}))).rejects.toMatchObject({ status: 404 });
	});

	it('answers a rejected field with a 400 that names the field', async () => {
		const response = _putConfig.formatOutput?.({
			saved: false,
			field: 'personalEmail',
			message: 'Enter a valid email.'
		});
		expect(response?.status).toBe(400);
		await expect(response?.json()).resolves.toEqual({
			saved: false,
			field: 'personalEmail',
			message: 'Enter a valid email.'
		});
	});

	it('requires Personnel operate capability', async () => {
		const ctx = createTestContext({
			auth: {
				capabilityMap: {
					calendar: 'view',
					personnel: 'view',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			}
		});
		await expect(
			handleUseCaseRequest(_putConfig, ctx, { personnelId: PERSON_ID, body: {} }, () => ctx)
		).rejects.toMatchObject({ status: 403 });
	});
});
