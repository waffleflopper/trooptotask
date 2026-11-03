import { afterEach, describe, expect, it, vi } from 'vitest';
import { historyBack } from './historyBack';

const current = vi.hoisted(() => ({ state: {} as { help?: { guide: string | null; depth: number } | null } }));
vi.mock('$app/state', () => ({
	get page() {
		return current;
	}
}));

afterEach(() => vi.unstubAllGlobals());

describe('historyBack', () => {
	it('steps back one entry when Help is closed', () => {
		const back = vi.fn();
		vi.stubGlobal('history', { back });
		current.state = {};
		historyBack();
		expect(back).toHaveBeenCalledOnce();
	});

	it('steps past the entries Help pushed', () => {
		const go = vi.fn();
		vi.stubGlobal('history', { go });
		current.state = { help: { guide: 'import-personnel', depth: 2 } };
		historyBack();
		expect(go).toHaveBeenCalledWith(-3);
	});

	it('adds Help entries to a longer step', () => {
		const go = vi.fn();
		vi.stubGlobal('history', { go });
		current.state = { help: { guide: null, depth: 1 } };
		historyBack(2);
		expect(go).toHaveBeenCalledWith(-3);
	});
});
