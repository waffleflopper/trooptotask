import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LatestAddressWriter, writeAddress } from './addressWriter';

type Entry = { href: string; state: App.PageState };

const history = vi.hoisted(() => ({
	entries: [] as Entry[],
	index: 0,
	landing: null as null | (() => void),
	hold: false,
	fail: false,
	writes: 0
}));

const page = vi.hoisted(() => ({
	url: new URL('https://app.test/org/a/personnel'),
	shallow: null as { url: URL } | null,
	state: {} as App.PageState
}));

vi.mock('$app/state', () => ({ page }));
vi.mock('$app/navigation', () => ({
	goto: (href: string, options: { shallow?: boolean; replace?: boolean; state?: App.PageState }) => {
		if (!options.shallow) throw new Error('only shallow writes are expected');
		history.writes++;
		if (history.fail) return Promise.reject(new Error('history is full'));
		const land = () => {
			const entry = { href: new URL(href, page.url).href, state: options.state ?? {} };
			if (options.replace) history.entries[history.index] = entry;
			else history.entries.splice(++history.index, Infinity, entry);
			page.shallow = { url: new URL(entry.href) };
			page.state = entry.state;
		};
		if (!history.hold) {
			land();
			return Promise.resolve();
		}
		return new Promise<void>((done) => {
			history.landing = () => {
				history.landing = null;
				land();
				done();
			};
		});
	}
}));

function open(href: string, state: App.PageState = {}) {
	page.url = new URL(href);
	page.shallow = null;
	page.state = state;
	history.entries = [{ href, state }];
	history.index = 0;
	history.hold = false;
	history.fail = false;
	history.landing = null;
	history.writes = 0;
}

const shown = () => history.entries.map((entry) => entry.href.replace('https://app.test', ''));

async function landNext() {
	await vi.waitFor(() => expect(history.landing).not.toBeNull());
	history.landing!();
}

beforeEach(() => open('https://app.test/org/a/personnel?show=present'));

describe('writeAddress', () => {
	it('sets and deletes params in place, keeping the other params and the open page state', async () => {
		open('https://app.test/org/a/personnel?show=present&add=note', { help: { guide: null, depth: 1 } });

		await writeAddress({ url: (url) => url.searchParams.set('q', 'Garcia') });
		await writeAddress({ url: (url) => url.searchParams.delete('add') });

		expect(shown()).toEqual(['/org/a/personnel?show=present&q=Garcia']);
		expect(page.state).toEqual({ help: { guide: null, depth: 1 } });
	});

	it('pushes an entry for a push, so Back returns to the address before it', async () => {
		await writeAddress({ push: true, state: { personSearch: true } });

		expect(shown()).toEqual(['/org/a/personnel?show=present', '/org/a/personnel?show=present']);
		expect(history.entries[1].state).toEqual({ personSearch: true });
	});

	it('writes new state on the same address', async () => {
		await writeAddress({ state: { importStep: 'review' } });

		expect(history.entries).toEqual([
			{ href: 'https://app.test/org/a/personnel?show=present', state: { importStep: 'review' } }
		]);
	});

	it('writes nothing when the address and state would not change', async () => {
		await writeAddress({ url: (url) => url.searchParams.set('show', 'present') });
		await writeAddress({ url: (url) => url.searchParams.delete('q') });

		expect(history.writes).toBe(0);
	});

	it('edits the address on screen, not the one the page loaded with', async () => {
		page.shallow = { url: new URL('https://app.test/org/a/personnel?q=Smith') };

		await writeAddress({ url: (url) => url.searchParams.set('show', 'away') });

		expect(shown()).toEqual(['/org/a/personnel?q=Smith&show=away']);
	});
});

describe('LatestAddressWriter', () => {
	const search = (text: string) => ({ url: (url: URL) => url.searchParams.set('q', text) });

	it('writes the latest text last and skips the writes overtaken while one was landing', async () => {
		history.hold = true;
		const writer = new LatestAddressWriter();
		const landed: string[] = [];

		const done = writer.write(search('G'));
		void writer.write(search('Ga'));
		void writer.write(search('Gar'));
		expect(writer.writing).toBe(true);
		await landNext();
		landed.push(shown()[0]);
		await landNext();
		landed.push(shown()[0]);
		await done;

		expect(landed).toEqual(['/org/a/personnel?show=present&q=G', '/org/a/personnel?show=present&q=Gar']);
		expect(history.entries).toHaveLength(1);
		expect(writer.writing).toBe(false);
	});

	it('drops the waiting write once the reader has left the page', async () => {
		history.hold = true;
		const writer = new LatestAddressWriter();

		const done = writer.write(search('G'));
		void writer.write(search('Gar'));
		await vi.waitFor(() => expect(history.landing).not.toBeNull());
		history.landing!();
		page.shallow = null;
		page.url = new URL('https://app.test/org/a/calendar');
		await done;

		expect(shown()).toEqual(['/org/a/personnel?show=present&q=G']);
	});

	it('drops the rest after a failed write and writes again on the next change', async () => {
		const writer = new LatestAddressWriter();
		history.fail = true;

		await expect(writer.write(search('G'))).rejects.toThrow('history is full');
		history.fail = false;
		await writer.write(search('Gar'));

		expect(shown()).toEqual(['/org/a/personnel?show=present&q=Gar']);
	});
});
