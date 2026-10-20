import { describe, expect, it } from 'vitest';
import { attentionTargetHref, readinessDrawerFromSearch } from './readinessDrawerTarget';

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

	it('reads back the item an attention row links to', () => {
		const href = attentionTargetHref(
			{ tab: 'readiness', item: { kind: 'critical-task', id: 'a:b' } },
			{ person: '/org/o/personnel/sgt-okafor', org: '/org/o' }
		);
		expect(href).toBe('/org/o/personnel/sgt-okafor/readiness?item=critical-task%3Aa%3Ab');
		expect(read(href.split('?')[1])).toEqual({ kind: 'critical-task', id: 'a:b' });
	});
});

describe('attentionTargetHref', () => {
	const paths = { person: '/org/o/personnel/sgt-okafor', org: '/org/o' };

	it('opens the Evals entry for an evaluation and the Data sheet for a loss', () => {
		expect(attentionTargetHref({ tab: 'evals', entryId: 'eval-1' }, paths)).toBe('/org/o/evals?entry=eval-1');
		expect(attentionTargetHref({ tab: 'data-sheet' }, paths)).toBe('/org/o/personnel/sgt-okafor/data-sheet');
	});
});
