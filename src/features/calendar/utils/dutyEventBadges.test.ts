import { describe, expect, it } from 'vitest';
import type { DutyEvent } from '$features/duty-roster/duty-roster.types';
import { buildDutyEventBadgesByPerson, deriveBadgeColor, deriveShortName } from './dutyEventBadges';

function makeSlot(overrides: Partial<DutyEvent['slotInstances'][number]>): DutyEvent['slotInstances'][number] {
	return {
		id: 'slot-1',
		dutyEventId: 'evt-1',
		templateSlotId: 'tslot-1',
		roleLabel: 'NCO',
		slotIndex: 0,
		assigneeId: 'person-1',
		assignmentSource: 'generated',
		warningState: 'none',
		fairnessConfidence: 'high',
		selectionReason: null,
		unfilledReason: null,
		sortOrder: 0,
		...overrides
	};
}

function makeEvent(overrides: Partial<DutyEvent> & { slotInstances?: DutyEvent['slotInstances'] }): DutyEvent {
	return {
		id: 'evt-1',
		orgId: 'org-1',
		templateId: 'tpl-1',
		templateName: 'Battalion Staff Duty',
		eventDate: '2026-04-10',
		coverageMode: 'timed',
		coverageStart: '2026-04-10T08:00:00',
		coverageEnd: '2026-04-11T08:00:00',
		isBlocking: true,
		cooldownHours: 12,
		rulesSnapshot: {
			templateId: 'tpl-1',
			templateName: 'Battalion Staff Duty',
			templateStatus: 'active',
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '08:00',
			scopeType: 'organization',
			scopeGroupIds: [],
			isBlocking: true,
			cooldownHours: 12,
			slots: []
		},
		fillSummary: { totalSlots: 1, filledSlots: 1, unfilledSlots: 0 },
		collisionSummary: { hasConflicts: false, conflicts: [] },
		originalProposal: null,
		createdAt: '2026-04-01T12:00:00Z',
		updatedAt: '2026-04-01T12:00:00Z',
		slotInstances: [makeSlot({})],
		...overrides,
		runId: overrides.runId ?? null
	};
}

describe('deriveShortName', () => {
	it('returns initials for multi-word names, capped at 3 characters', () => {
		expect(deriveShortName('Battalion Staff Duty')).toBe('BSD');
		expect(deriveShortName('Company Charge of Quarters')).toBe('CCO');
	});

	it('returns the first 3 uppercase chars for a single-word name', () => {
		expect(deriveShortName('Guard')).toBe('GUA');
	});

	it('falls back to DTY for empty names', () => {
		expect(deriveShortName('')).toBe('DTY');
		expect(deriveShortName('   ')).toBe('DTY');
	});
});

describe('deriveBadgeColor', () => {
	it('is deterministic for the same template id', () => {
		expect(deriveBadgeColor('tpl-abc')).toEqual(deriveBadgeColor('tpl-abc'));
	});

	it('produces different hues for different template ids', () => {
		const a = deriveBadgeColor('tpl-1');
		const b = deriveBadgeColor('tpl-2');
		expect(a.color).not.toBe(b.color);
	});
});

describe('buildDutyEventBadgesByPerson', () => {
	it('returns an empty map when there are no events', () => {
		expect(buildDutyEventBadgesByPerson([]).size).toBe(0);
	});

	it('skips unfilled slots', () => {
		const event = makeEvent({
			slotInstances: [makeSlot({ assigneeId: null, unfilledReason: 'No eligible personnel' })]
		});
		const result = buildDutyEventBadgesByPerson([event]);
		expect(result.size).toBe(0);
	});

	it('indexes filled slots by personnel id and then by event date', () => {
		const event = makeEvent({
			slotInstances: [
				makeSlot({ id: 'slot-a', assigneeId: 'person-1', roleLabel: 'NCO' }),
				makeSlot({ id: 'slot-b', assigneeId: 'person-2', roleLabel: 'Runner', slotIndex: 1 })
			]
		});
		const result = buildDutyEventBadgesByPerson([event]);
		expect(result.get('person-1')?.get('2026-04-10')).toHaveLength(1);
		expect(result.get('person-2')?.get('2026-04-10')).toHaveLength(1);
		expect(result.get('person-1')?.get('2026-04-10')?.[0].title).toBe('Battalion Staff Duty — NCO');
	});

	it('preserves multiple badges on the same cell when one person holds multiple slots', () => {
		const event = makeEvent({
			slotInstances: [
				makeSlot({ id: 'slot-a', assigneeId: 'person-1', roleLabel: 'NCO' }),
				makeSlot({ id: 'slot-b', assigneeId: 'person-1', roleLabel: 'Runner', slotIndex: 1 })
			]
		});
		const result = buildDutyEventBadgesByPerson([event]);
		const badges = result.get('person-1')?.get('2026-04-10') ?? [];
		expect(badges).toHaveLength(2);
		expect(badges.map((b) => b.slotId).sort()).toEqual(['slot-a', 'slot-b']);
	});

	it('carries a stable short name and color derived from the template', () => {
		const event = makeEvent({ templateId: 'tpl-xyz', templateName: 'Company CQ' });
		const [badge] = buildDutyEventBadgesByPerson([event]).get('person-1')?.get('2026-04-10') ?? [];
		expect(badge.shortName).toBe('CC');
		expect(badge.color).toBe(deriveBadgeColor('tpl-xyz').color);
	});
});
