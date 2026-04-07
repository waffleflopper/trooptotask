import { describe, expect, it } from 'vitest';
import { DutyTemplateEntity } from './dutyTemplate';
import { DutyTemplateSlotEntity } from './dutyTemplateSlot';
import { DutyTemplateRotationBaselineEntity } from './dutyTemplateRotationBaseline';

describe('advanced duty template entities', () => {
	it('declare calendar permission consistently', () => {
		expect(DutyTemplateEntity.permission).toBe('calendar');
		expect(DutyTemplateSlotEntity.permission).toBe('calendar');
		expect(DutyTemplateRotationBaselineEntity.permission).toBe('calendar');
	});
});
