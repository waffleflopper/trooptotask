import { describe, expect, it } from 'vitest';
import {
	buildUniqueDutyRosterTemplateSlug,
	isDutyRosterTemplateView,
	normalizeDutyRosterShortCode,
	normalizeDutyRosterTemplateName,
	slugifyDutyRosterTemplateName
} from './dutyRosterTemplates';

describe('Duty Roster Template rules', () => {
	it('normalizes template names and short codes', () => {
		expect(normalizeDutyRosterTemplateName('  Staff   Duty   NCO  ')).toBe('Staff Duty NCO');
		expect(normalizeDutyRosterShortCode(' cq nco ')).toBe('CQ NCO');
		expect(normalizeDutyRosterShortCode('')).toBeNull();
	});

	it('builds human-readable slugs from template names', () => {
		expect(slugifyDutyRosterTemplateName('CQ NCO')).toBe('cq-nco');
		expect(slugifyDutyRosterTemplateName('Staff Duty / Runner')).toBe('staff-duty-runner');
		expect(slugifyDutyRosterTemplateName('***')).toBe('duty-roster');
	});

	it('handles Organization-scoped slug collisions', () => {
		expect(
			buildUniqueDutyRosterTemplateSlug({
				name: 'CQ NCO',
				existingSlugs: ['cq-nco', 'cq-nco-2']
			})
		).toBe('cq-nco-3');
	});

	it('recognizes URL-backed workspace views', () => {
		expect(isDutyRosterTemplateView('generate')).toBe(true);
		expect(isDutyRosterTemplateView('history')).toBe(true);
		expect(isDutyRosterTemplateView('settings')).toBe(true);
		expect(isDutyRosterTemplateView('preview')).toBe(false);
	});
});
