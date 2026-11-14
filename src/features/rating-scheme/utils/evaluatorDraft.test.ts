import { describe, expect, it } from 'vitest';
import { evaluatorDraft, setEvaluatorFromPicker, type EvaluatorDraft } from './evaluatorDraft';

describe('evaluator draft', () => {
	it.each([
		[null, { kind: 'empty' }],
		[{ personId: 'person-1' }, { kind: 'person', personId: 'person-1' }],
		[{ personId: '' }, { kind: 'empty' }],
		[{ externalName: '  COL External  ' }, { kind: 'external', name: 'COL External' }],
		[{ externalName: ' \t ' }, { kind: 'empty' }]
	] satisfies [Parameters<typeof setEvaluatorFromPicker>[0], EvaluatorDraft][])(
		'normalizes picker selection %j',
		(value, expected) => {
			expect(setEvaluatorFromPicker(value)).toEqual(expected);
		}
	);

	it('prefers a Person in the unit over a stored outside name', () => {
		expect(evaluatorDraft('evaluator-1', 'ignored external name')).toEqual({ kind: 'person', personId: 'evaluator-1' });
		expect(evaluatorDraft(null, 'MAJ Smith')).toEqual({ kind: 'external', name: 'MAJ Smith' });
		expect(evaluatorDraft(null, null)).toEqual({ kind: 'empty' });
	});
});
