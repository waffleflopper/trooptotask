import { describe, expect, it, vi } from 'vitest';
import type { PersonSignalCore, RosterSignalRead, SignalAccess } from './rosterSignals';
import { RosterSignals } from './rosterSignals.svelte';

vi.mock('$app/navigation', () => ({ invalidate: vi.fn() }));

const AS_OF = '2026-10-23';
const LEAVE = { id: 'leave', name: 'Leave', color: '#16a34a', textColor: '#ffffff', sortOrder: 0 };
const ACCESS: SignalAccess = {
	availability: true,
	training: false,
	criticalTasks: false,
	evaluations: false,
	followUps: false,
	counseling: false
};

function core(personnelId: string, today: 'present' | 'leave'): PersonSignalCore {
	return {
		personnelId,
		today: {
			kind: 'known',
			value: today === 'present' ? { kind: 'present' } : { kind: 'away', statusTypeId: 'leave' }
		},
		attention: { kind: 'withheld' },
		matches: {},
		openFollowUps: { kind: 'withheld' }
	};
}

function read(people: PersonSignalCore[], asOf = AS_OF, access = ACCESS): RosterSignalRead {
	return { asOf, access, statusTypes: [LEAVE], people };
}

function setup() {
	const replies: PromiseWithResolvers<RosterSignalRead>[] = [];
	const readPeople = vi.fn((_orgId: string, _ids: string[]) => {
		const reply = Promise.withResolvers<RosterSignalRead>();
		replies.push(reply);
		return reply.promise;
	});
	const invalidate = vi.fn(async (_dependency: string) => {});
	const signals = new RosterSignals({ readPeople, invalidate });
	return { signals, readPeople, invalidate, replies };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const today = (signals: RosterSignals, id: string) => {
	const row = signals.row(id);
	return row.kind === 'ready' ? row.value.today : row.kind;
};

describe('RosterSignals', () => {
	it('shows pending rows until the lane settles, then each Person with a core and the rest withheld', async () => {
		const { signals } = setup();
		const lane = Promise.withResolvers<RosterSignalRead>();
		signals.observe('org-1', AS_OF, lane.promise);
		expect(signals.row('a')).toEqual({ kind: 'pending' });
		expect(signals.summarize(['a'], new Map(), true)).toEqual({ kind: 'pending' });

		lane.resolve(read([core('a', 'present')]));
		await settle();

		expect(signals.status).toBe('ready');
		expect(today(signals, 'a')).toEqual({ kind: 'known', value: { kind: 'present' } });
		expect(today(signals, 'z')).toEqual({ kind: 'withheld' });
	});

	it('marks every row failed when the lane fails, and Reload reruns only the signals lane', async () => {
		const { signals, invalidate } = setup();
		const lane = Promise.withResolvers<RosterSignalRead>();
		signals.observe('org-1', AS_OF, lane.promise);
		lane.reject(new Error('statement timeout'));
		await settle();

		expect(signals.row('a')).toEqual({ kind: 'failed' });
		expect(signals.summarize(['a'], new Map(), true)).toEqual({ kind: 'failed' });
		await signals.reload();
		expect(invalidate).toHaveBeenCalledWith('app:personnel-signals');
	});

	it('keeps a refresh that settled before an older lane, and lets a lane requested after it overwrite', async () => {
		const { signals, replies } = setup();
		const first = Promise.withResolvers<RosterSignalRead>();
		signals.observe('org-1', AS_OF, first.promise);

		const refreshed = signals.refresh(['a']);
		replies[0].resolve(read([core('a', 'leave')]));
		await refreshed;
		first.resolve(read([core('a', 'present'), core('b', 'present')]));
		await settle();
		expect(today(signals, 'a')).toEqual({ kind: 'known', value: { kind: 'away', statusTypeId: 'leave' } });
		expect(today(signals, 'b')).toEqual({ kind: 'known', value: { kind: 'present' } });

		const second = Promise.withResolvers<RosterSignalRead>();
		signals.observe('org-1', AS_OF, second.promise);
		second.resolve(read([core('a', 'present'), core('b', 'present')]));
		await settle();
		expect(today(signals, 'a')).toEqual({ kind: 'known', value: { kind: 'present' } });
	});

	it('keeps independent refreshes for two People and drops an older reply for the same Person', async () => {
		const { signals, replies } = setup();
		signals.observe('org-1', AS_OF, Promise.resolve(read([core('a', 'present'), core('b', 'present')])));
		await settle();

		void signals.refresh(['a']);
		const onlyB = signals.refresh(['b']);
		const newerA = signals.refresh(['a']);
		replies[2].resolve(read([core('a', 'leave')]));
		replies[1].resolve(read([core('b', 'leave')]));
		replies[0].resolve(read([core('a', 'present')]));
		await Promise.all([onlyB, newerA]);
		await settle();

		expect(today(signals, 'a')).toEqual({ kind: 'known', value: { kind: 'away', statusTypeId: 'leave' } });
		expect(today(signals, 'b')).toEqual({ kind: 'known', value: { kind: 'away', statusTypeId: 'leave' } });
	});

	it('moves the page to the new day instead of writing a refresh computed for another day', async () => {
		const { signals, replies, invalidate } = setup();
		signals.observe('org-1', AS_OF, Promise.resolve(read([core('a', 'present')])));
		await settle();

		const refreshed = signals.refresh(['a']);
		replies[0].resolve(read([core('a', 'leave')], '2026-10-24'));
		await refreshed;

		expect(invalidate).toHaveBeenCalledExactlyOnceWith('app:viewer-day');
		expect(today(signals, 'a')).toEqual({ kind: 'known', value: { kind: 'present' } });
	});

	it('keeps the shown cells when a refresh fails', async () => {
		const { signals, replies } = setup();
		signals.observe('org-1', AS_OF, Promise.resolve(read([core('a', 'present')])));
		await settle();

		const refreshed = signals.refresh(['a']);
		expect(today(signals, 'a')).toEqual({ kind: 'known', value: { kind: 'present' } });
		replies[0].reject(new Error('offline'));
		await refreshed;

		expect(today(signals, 'a')).toEqual({ kind: 'known', value: { kind: 'present' } });
	});

	it('drops a lane for an Organization the page has left', async () => {
		const { signals } = setup();
		const left = Promise.withResolvers<RosterSignalRead>();
		signals.observe('org-1', AS_OF, left.promise);
		signals.observe('org-2', AS_OF, Promise.withResolvers<RosterSignalRead>().promise);
		left.resolve(read([core('a', 'present')]));
		await settle();

		expect(signals.status).toBe('pending');
		expect(signals.row('a')).toEqual({ kind: 'pending' });
	});

	describe('ensure', () => {
		async function settled(access = ACCESS) {
			const context = setup();
			context.signals.observe('org-1', AS_OF, Promise.resolve(read([core('a', 'present')], AS_OF, access)));
			await settle();
			context.signals.ensure(['a', 'b']);
			return context;
		}

		it('reads People the roster gained after the lane in one batch, once', async () => {
			const { signals, readPeople, replies } = await settled();
			signals.ensure(['a', 'b', 'c', 'd']);
			expect(signals.row('c')).toEqual({ kind: 'pending' });
			signals.ensure(['a', 'b', 'c', 'd']);
			replies[0].resolve(read([core('c', 'leave')]));
			await settle();

			expect(readPeople).toHaveBeenCalledExactlyOnceWith('org-1', ['c', 'd']);
			expect(today(signals, 'c')).toEqual({ kind: 'known', value: { kind: 'away', statusTypeId: 'leave' } });
			expect(today(signals, 'd')).toEqual({ kind: 'withheld' });
			expect(today(signals, 'b')).toEqual({ kind: 'withheld' });
		});

		it('reads nothing for a viewer who may read no source', async () => {
			const { signals, readPeople } = await settled({ ...ACCESS, availability: false });
			signals.ensure(['a', 'b', 'c']);
			expect(readPeople).not.toHaveBeenCalled();
		});

		it('reloads the lane instead of a batch past 500 People', async () => {
			const { signals, readPeople, invalidate } = await settled();
			signals.ensure(['a', 'b', ...Array.from({ length: 501 }, (_, index) => `new-${index}`)]);
			expect(readPeople).not.toHaveBeenCalled();
			expect(invalidate).toHaveBeenCalledExactlyOnceWith('app:personnel-signals');
		});
	});
});
