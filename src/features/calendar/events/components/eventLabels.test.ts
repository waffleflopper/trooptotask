import { describe, expect, it } from 'vitest';
import { describeActivity } from './eventLabels';

const KIM = '00000000-0000-4000-8000-000000000001';
const LEE = '00000000-0000-4000-8000-000000000002';
const members = { [KIM]: 'sgt.kim@example.mil' };
const organization = { kind: 'organization' } as const;

describe('describeActivity', () => {
	it('names only what changed in the coordination', () => {
		const { summary } = describeActivity(
			{
				kind: 'coordination_changed',
				from: { host: organization, coordinatorUserId: KIM },
				to: { host: { kind: 'external', name: '1-1 BN' }, coordinatorUserId: KIM }
			},
			members,
			'A Co'
		);
		expect(summary).toContain('A Co');
		expect(summary).toContain('1-1 BN');
		expect(summary).not.toContain('sgt.kim@example.mil');
	});

	it('labels a coordinator who has left without exposing their id', () => {
		const { summary } = describeActivity(
			{
				kind: 'coordination_changed',
				from: { host: organization, coordinatorUserId: LEE },
				to: { host: organization, coordinatorUserId: KIM }
			},
			members,
			'A Co'
		);
		expect(summary).toContain('sgt.kim@example.mil');
		expect(summary).not.toContain(LEE);
		expect(summary).not.toContain('A Co');
	});

	it('keeps the cancellation reason apart from the summary', () => {
		const line = describeActivity({ kind: 'cancelled', reason: 'Range closed' }, members, 'A Co');
		expect(line.note).toBe('Range closed');
		expect(line.summary).not.toContain('Range closed');
	});
});
