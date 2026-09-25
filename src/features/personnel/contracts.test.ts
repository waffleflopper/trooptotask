import { describe, expect, it } from 'vitest';
import { personnelLeaderNoteInputSchema } from './contracts';

describe('Personnel leader-note input contract', () => {
	it('accepts 4,000 characters after trimming and preserves the Personnel identifier', () => {
		const text = 'n'.repeat(4000);
		expect(personnelLeaderNoteInputSchema.parse({ personnelId: 'person-1', text: ` \n${text}\t ` })).toEqual({
			personnelId: 'person-1',
			text
		});
	});

	it('rejects text above the 4,000-character limit', () => {
		expect(personnelLeaderNoteInputSchema.safeParse({ personnelId: 'person-1', text: 'n'.repeat(4001) }).success).toBe(
			false
		);
	});
});
