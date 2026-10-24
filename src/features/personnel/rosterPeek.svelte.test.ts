import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Personnel } from './personnel.types';
import type { RosterPeekRead, RosterPeekSection } from './rosterPeek';
import { RosterPeek } from './rosterPeek.svelte';

function person(id: string, rank = 'SGT'): Personnel {
	return { id, rank, lastName: id, firstName: 'Test', mos: '68W', clinicRole: '', groupId: null, groupName: '' };
}

const OKAFOR = person('okafor');
const BANKS = person('banks');
const CHEN = person('chen');

interface Call {
	personnelId: string;
	section: RosterPeekSection;
	signal: AbortSignal;
	reply: PromiseWithResolvers<RosterPeekRead>;
}

function setup() {
	const calls: Call[] = [];
	const readSection = vi.fn((_orgId: string, personnelId: string, section: RosterPeekSection, signal: AbortSignal) => {
		const reply = Promise.withResolvers<RosterPeekRead>();
		calls.push({ personnelId, section, signal, reply });
		return reply.promise;
	});
	const peek = new RosterPeek('org-1', { readSection });
	const answer = async (personnelId: string, section: RosterPeekSection, read: RosterPeekRead | Error) => {
		const call = calls.findLast((entry) => entry.personnelId === personnelId && entry.section === section);
		if (!call) throw new Error(`no read of ${personnelId} ${section}`);
		if (read instanceof Error) call.reply.reject(read);
		else call.reply.resolve(read);
		await Promise.resolve();
		await Promise.resolve();
	};
	const reads = () => calls.map((call) => `${call.personnelId}:${call.section}`);
	return { peek, calls, answer, reads };
}

const note = (text: string): RosterPeekRead => ({
	state: 'ready',
	value: { id: text, text, author: 'SFC Whitaker', createdAt: '2026-09-30T10:00:00Z' } as never
});
const states = (peek: RosterPeek, id: string) =>
	Object.fromEntries(Object.entries(peek.sections(id)).map(([section, value]) => [section, value.state]));

afterEach(() => {
	vi.useRealTimers();
});

describe('RosterPeek', () => {
	it('reads each section separately when a Person opens, and each settles on its own', async () => {
		const { peek, answer, reads } = setup();

		peek.show(OKAFOR);
		expect(reads()).toEqual(['okafor:identity', 'okafor:next7', 'okafor:attention', 'okafor:followUps', 'okafor:note']);

		await answer('okafor', 'note', note('Wants BLC'));
		await answer('okafor', 'next7', { state: 'hidden' });
		await answer('okafor', 'attention', new Error('provider down'));

		expect(states(peek, 'okafor')).toEqual({
			identity: 'loading',
			next7: 'hidden',
			attention: 'failed',
			followUps: 'loading',
			note: 'ready'
		});
		expect(peek.sections('okafor').note).toMatchObject({ state: 'ready', value: { text: 'Wants BLC' } });
	});

	it('retries only the failed section', async () => {
		const { peek, answer, reads } = setup();
		peek.show(OKAFOR);
		await answer('okafor', 'attention', new Error('provider down'));

		peek.retry('okafor', 'attention');

		expect(reads().slice(5)).toEqual(['okafor:attention']);
		expect(peek.sections('okafor').attention.state).toBe('loading');
	});

	it('waits while J/K skims and reads only the Person browsing stops on', () => {
		vi.useFakeTimers();
		const { peek, reads } = setup();

		peek.show(OKAFOR, { browsing: true });
		vi.advanceTimersByTime(100);
		peek.show(BANKS, { browsing: true });
		vi.advanceTimersByTime(149);
		expect(reads()).toEqual([]);

		vi.advanceTimersByTime(1);
		expect(new Set(reads().map((read) => read.split(':')[0]))).toEqual(new Set(['banks']));
	});

	it("aborts the previous Person's reads and never shows their late replies", async () => {
		const { peek, calls, answer } = setup();
		peek.show(OKAFOR);
		const okaforSignals = calls.map((call) => call.signal);

		peek.show(BANKS);
		await answer('okafor', 'note', note('Late'));

		expect(okaforSignals.every((signal) => signal.aborted)).toBe(true);
		expect(peek.sections('okafor').note.state).toBe('loading');

		peek.show(OKAFOR);
		expect(calls.filter((call) => call.personnelId === 'okafor')).toHaveLength(10);
	});

	it('shows a recently viewed Person from the cache without reading again', async () => {
		const { peek, answer, reads } = setup();
		peek.show(OKAFOR);
		for (const section of ['identity', 'next7', 'attention', 'followUps'] as const)
			await answer('okafor', section, { state: 'hidden' });
		await answer('okafor', 'note', note('Wants BLC'));

		peek.show(BANKS);
		peek.show(OKAFOR);

		expect(reads().filter((read) => read.startsWith('okafor'))).toHaveLength(5);
		expect(peek.sections('okafor').note).toMatchObject({ state: 'ready', value: { text: 'Wants BLC' } });
	});

	it('reads readiness again on the next open while a source could not be checked, and keeps it once complete', async () => {
		const { peek, answer, reads } = setup();
		const attention = (failed: string[]): RosterPeekRead => ({
			state: 'ready',
			value: { items: [], failed, checked: {}, readinessBadge: { count: 0, complete: failed.length === 0 } } as never
		});
		peek.show(OKAFOR);
		for (const section of ['identity', 'next7', 'followUps', 'note'] as const)
			await answer('okafor', section, { state: 'hidden' });
		await answer('okafor', 'attention', attention(['training']));

		peek.show(BANKS);
		peek.show(OKAFOR);
		expect(reads().filter((read) => read.startsWith('okafor'))).toEqual([
			...['identity', 'next7', 'attention', 'followUps', 'note'].map((section) => `okafor:${section}`),
			'okafor:attention'
		]);

		await answer('okafor', 'attention', attention([]));
		peek.show(BANKS);
		peek.show(OKAFOR);
		expect(reads().filter((read) => read.startsWith('okafor'))).toHaveLength(6);
	});

	it('reads a changed section again in place for the shown Person, keeping the old value until the new one lands', async () => {
		const { peek, answer, reads } = setup();
		peek.show(OKAFOR);
		await answer('okafor', 'note', note('Wants BLC'));

		peek.invalidate(['okafor'], ['note']);

		expect(reads().slice(5)).toEqual(['okafor:note']);
		expect(peek.sections('okafor').note).toMatchObject({ state: 'ready', value: { text: 'Wants BLC' } });
		await answer('okafor', 'note', note('Talk to 1SG'));
		expect(peek.sections('okafor').note).toMatchObject({ state: 'ready', value: { text: 'Talk to 1SG' } });
	});

	it('keeps a section the panel already updated, then reads it again on the next open', async () => {
		const { peek, answer, reads } = setup();
		peek.show(OKAFOR);
		for (const section of ['identity', 'next7', 'attention', 'followUps', 'note'] as const)
			await answer('okafor', section, { state: 'hidden' });

		peek.invalidate(['okafor'], ['followUps'], { refetchShown: false });
		expect(reads()).toHaveLength(5);
		peek.show(CHEN);
		peek.show(OKAFOR);

		expect(reads().slice(10)).toEqual(['okafor:followUps']);
	});

	it('reads the shown Person again when their record changes, as after a quick edit', async () => {
		const { peek, answer, reads } = setup();
		peek.show(OKAFOR);
		for (const section of ['identity', 'next7', 'attention', 'followUps', 'note'] as const)
			await answer('okafor', section, { state: 'hidden' });

		peek.show(OKAFOR);
		expect(reads()).toHaveLength(5);
		peek.show(person('okafor', 'SSG'));

		expect(reads()).toHaveLength(10);
	});

	it('stops reading when closed', () => {
		vi.useFakeTimers();
		const { peek, calls, reads } = setup();
		peek.show(OKAFOR);
		peek.close();
		peek.show(BANKS, { browsing: true });
		peek.close();
		vi.advanceTimersByTime(500);

		expect(calls.every((call) => call.signal.aborted)).toBe(true);
		expect(reads().every((read) => read.startsWith('okafor'))).toBe(true);
	});
});
