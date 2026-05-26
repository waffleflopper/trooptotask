import { describe, expect, it } from 'vitest';
import { DutyTemplateEntity } from './dutyTemplate';
import { DutyTemplateSlotEntity } from './dutyTemplateSlot';
import { DutyTemplateRotationBaselineEntity } from './dutyTemplateRotationBaseline';

describe('advanced duty template entities', () => {
	it('keeps legacy permission metadata out of persistence-only entities', () => {
		expect('permission' in DutyTemplateEntity).toBe(false);
		expect('permission' in DutyTemplateSlotEntity).toBe(false);
		expect('permission' in DutyTemplateRotationBaselineEntity).toBe(false);
	});
});
