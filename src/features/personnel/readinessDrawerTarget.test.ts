import { describe, expect, it } from 'vitest';
import { readinessDrawerFromSearch, readinessTargetSearch } from './readinessDrawerTarget';

const read = (query: string) => readinessDrawerFromSearch(new URLSearchParams(query));

describe('readinessDrawerFromSearch', () => {
	it('opens one item or the picker for an Add to record intent', () => {
		expect(read('item=training:cpr')).toEqual({ kind: 'training', id: 'cpr' });
		expect(read('item=critical-task:081-833-0210')).toEqual({ kind: 'critical-task', id: '081-833-0210' });
		expect(read('add=training')).toEqual({ kind: 'training', id: null });
		expect(read('add=critical-task')).toEqual({ kind: 'critical-task', id: null });
	});

	it('ignores unknown kinds and malformed items', () => {
		expect(read('')).toBeNull();
		expect(read('add=note')).toBeNull();
		expect(read('item=document:abc')).toBeNull();
		expect(read('item=training')).toBeNull();
		expect(read('item=training:')).toBeNull();
		expect(read('item=:cpr')).toBeNull();
	});

	it('reads back the query an attention row links to', () => {
		const search = readinessTargetSearch({ tab: 'readiness', item: { kind: 'critical-task', id: 'a:b' } });
		expect(search).toBe('?item=critical-task%3Aa%3Ab');
		expect(read(search.slice(1))).toEqual({ kind: 'critical-task', id: 'a:b' });
		expect(readinessTargetSearch({ tab: 'readiness', item: null })).toBe('');
	});
});
