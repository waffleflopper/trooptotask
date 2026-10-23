import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { loadDa6View, loadDa6Setup } = vi.hoisted(() => ({
	loadDa6View: vi.fn(async (_ctx: unknown, input: unknown) => input),
	loadDa6Setup: vi.fn(async (_ctx: unknown, input: unknown) => input)
}));
vi.mock('$features/calendar/index.server', async (importOriginal) => ({
	...(await importOriginal<typeof import('$features/calendar/index.server')>()),
	loadDa6View,
	loadDa6Setup
}));
vi.mock('$lib/server/adapters/httpAdapter', () => ({
	loadWithContext: vi.fn(async (_locals, _cookies, _orgId, config) => ({ data: config.fn({}) }))
}));

import { load } from './+page.server';

const serverZone = process.env.TZ;

beforeEach(() => {
	process.env.TZ = 'UTC';
});

afterEach(() => {
	if (serverZone === undefined) delete process.env.TZ;
	else process.env.TZ = serverZone;
	vi.useRealTimers();
	loadDa6View.mockClear();
	loadDa6Setup.mockClear();
});

function event(query: string, zone?: string) {
	const depends = vi.fn();
	return {
		depends,
		args: {
			params: { orgId: 'org-1', typeId: 'type-1' },
			url: new URL(`https://app.test/org/c-co/calendar/rosters/type-1${query}`),
			locals: {} as App.Locals,
			cookies: { get: (name: string) => (name === 't2t_tz' ? zone : undefined) },
			depends
		} as never
	};
}

describe('DA 6 page load', () => {
	it("opens the viewer's month and today when the server day is already in the next month", async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-11-01T02:00:00Z'));
		const { args, depends } = event('', 'America/Anchorage');

		const result = await load(args);

		expect(result).toMatchObject({ month: '2026-10' });
		expect(loadDa6View).toHaveBeenCalledWith(expect.anything(), {
			typeId: 'type-1',
			month: '2026-10',
			today: '2026-10-31'
		});
		expect(depends).toHaveBeenCalledWith('app:org-core', 'app:calendar-data', 'app:viewer-day', 'app:da6');
	});

	it('keeps the month the link names while today still follows the viewer', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-11-01T02:00:00Z'));

		await load(event('?month=2026-09', 'America/Anchorage').args);

		expect(loadDa6View).toHaveBeenCalledWith(expect.anything(), {
			typeId: 'type-1',
			month: '2026-09',
			today: '2026-10-31'
		});
	});

	it('opens setup mode for the viewer’s day instead of the month', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-11-01T02:00:00Z'));

		const result = await load(event('?setup=1', 'America/Anchorage').args);

		expect(loadDa6Setup).toHaveBeenCalledWith(expect.anything(), { typeId: 'type-1', today: '2026-10-31' });
		expect(loadDa6View).not.toHaveBeenCalled();
		expect(result?.da6).toBeNull();
		await expect(result?.setup?.data).resolves.toEqual({ typeId: 'type-1', today: '2026-10-31' });
	});
});
