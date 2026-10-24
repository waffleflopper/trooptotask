import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { _postConfig } from './+server';

const ID = '11111111-1111-4111-8111-111111111111';

function event(body: unknown) {
	return {
		request: new Request('http://localhost/org/org-1/api/personnel/roster-signals', {
			method: 'POST',
			body: JSON.stringify(body)
		}),
		cookies: { get: () => 'America/New_York' }
	} as unknown as RequestEvent;
}

afterEach(() => {
	vi.useRealTimers();
});

describe('/api/personnel/roster-signals', () => {
	it('reads with roster permission and changes nothing', () => {
		expect(_postConfig).toMatchObject({
			policyAction: POLICY_ACTION_CATALOG.personnel.viewRoster,
			policyResource: { kind: 'unscoped' }
		});
		expect('mutation' in _postConfig).toBe(false);
	});

	it('reads the listed People for the viewer day in their time zone', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-10-24T02:00:00Z'));
		await expect(_postConfig.parseInput(event({ personnelIds: [ID] }))).resolves.toEqual({
			personnelIds: [ID],
			asOf: '2026-10-23'
		});
	});

	it('refuses an empty list, more than 500 People and an invalid ID', async () => {
		const many = Array.from(
			{ length: 501 },
			(_, index) => `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`
		);
		for (const personnelIds of [[], many, ['not-an-id']]) {
			await expect(_postConfig.parseInput(event({ personnelIds }))).rejects.toMatchObject({ status: 400 });
		}
	});
});
