// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import type { DutyTemplate } from '../duty-roster.types';
import type { Personnel } from '$lib/types';
import LaneChooserStep from './LaneChooserStep.svelte';
import SimpleTemplateListStep from './SimpleTemplateListStep.svelte';
import AdvancedTemplateListStep from './AdvancedTemplateListStep.svelte';
import AdvancedPolicyReviewStep from './AdvancedPolicyReviewStep.svelte';
import AdvancedDatePatternStep from './AdvancedDatePatternStep.svelte';
import AdvancedCandidateReviewStep from './AdvancedCandidateReviewStep.svelte';

function makeTemplate(overrides: Partial<DutyTemplate> = {}): DutyTemplate {
	return {
		id: 'tmpl-1',
		orgId: 'org-1',
		mode: 'advanced',
		status: 'active',
		name: 'Battalion Staff Duty',
		description: 'Overnight',
		scopeType: 'groups',
		scopeGroupIds: ['group-hq'],
		exemptPersonnelIds: [],
		exemptStatusTypeIds: [],
		coverageMode: 'timed',
		startTime: '08:00',
		endTime: '08:00',
		spansMidnight: false,
		isBlocking: true,
		cooldownHours: 24,
		softPreferences: [{ type: 'longest-break', enabled: true }],
		slots: [
			{
				id: 'slot-1',
				templateId: 'tmpl-1',
				roleLabel: 'NCO',
				quantity: 1,
				allowedRanks: ['SGT'],
				allowedGroupIds: ['group-hq'],
				preferredGroupIds: [],
				allowedMosValues: [],
				allowedRoleValues: [],
				rotationPoolKey: 'pool',
				sortOrder: 0
			}
		],
		rotationBaselines: [],
		createdAt: '',
		updatedAt: '',
		...overrides
	};
}
function makePerson(overrides: Partial<Personnel> = {}): Personnel {
	return {
		id: 'p1',
		firstName: 'Casey',
		lastName: 'Nolan',
		rank: 'SGT',
		groupId: 'group-hq',
		groupName: 'HQ',
		mos: '11B',
		clinicRole: 'Squad Leader',
		archivedAt: null,
		...overrides
	};
}

describe('DutyRosterWizard step components', () => {
	it('LaneChooserStep routes lane selections', async () => {
		const onChooseSimple = vi.fn();
		const onChooseAdvanced = vi.fn();
		render(LaneChooserStep, { props: { canManageAdvancedTemplates: true, onChooseSimple, onChooseAdvanced } });
		await fireEvent.click(screen.getByRole('button', { name: 'Use Automatic Assignment Generator' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Use Advanced Duty' }));
		expect(onChooseSimple).toHaveBeenCalled();
		expect(onChooseAdvanced).toHaveBeenCalled();
	});

	it('SimpleTemplateListStep emits the selected assignment type', async () => {
		const onChooseTemplate = vi.fn();
		render(SimpleTemplateListStep, {
			props: {
				simpleTemplates: [
					{
						id: 'legacy-sd',
						name: 'Staff Duty',
						shortName: 'SD',
						exemptPersonnelCount: 1,
						description: 'Legacy',
						assignmentTypeId: 'at-sd'
					}
				],
				onBack: vi.fn(),
				onChooseTemplate
			}
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Use Staff Duty' }));
		expect(onChooseTemplate).toHaveBeenCalledWith('at-sd');
	});

	it('AdvancedTemplateListStep supports template selection and builder routing', async () => {
		const onChooseTemplate = vi.fn();
		const onBuildFromScratch = vi.fn();
		render(AdvancedTemplateListStep, {
			props: { activeAdvancedTemplates: [makeTemplate()], onBack: vi.fn(), onChooseTemplate, onBuildFromScratch }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'New' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Use Battalion Staff Duty' }));
		expect(onBuildFromScratch).toHaveBeenCalled();
		expect(onChooseTemplate).toHaveBeenCalledWith('tmpl-1');
	});

	it('AdvancedPolicyReviewStep renders policy summary and continues', async () => {
		const onContinue = vi.fn();
		render(AdvancedPolicyReviewStep, {
			props: {
				template: makeTemplate(),
				hasRotationBaselines: false,
				onBack: vi.fn(),
				onEditTemplate: vi.fn(),
				onContinue
			}
		});
		expect(screen.getByText(/DA6 ranking: Single DA6 sequence/)).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Set Date Pattern' }));
		expect(onContinue).toHaveBeenCalled();
	});

	it('AdvancedDatePatternStep updates date pattern controls', async () => {
		const onPatternChange = vi.fn();
		const onAddCustomDate = vi.fn();
		render(AdvancedDatePatternStep, {
			props: {
				advancedPattern: 'custom-dates',
				advancedStartDate: '',
				advancedEndDate: '',
				selectedWeekdays: new Set([1]),
				weekdayOptions: [{ value: 1, label: 'Monday' }],
				customDateDraft: '2026-04-10',
				customDateEntries: ['2026-04-11'],
				isPreviewing: false,
				canPreviewSingle: true,
				canPreviewSeries: true,
				onBack: vi.fn(),
				onPatternChange,
				onStartDateChange: vi.fn(),
				onEndDateChange: vi.fn(),
				onToggleWeekday: vi.fn(),
				onCustomDateDraftChange: vi.fn(),
				onAddCustomDate,
				onRemoveCustomDate: vi.fn(),
				onReviewCandidates: vi.fn(),
				onPreviewSingle: vi.fn(),
				onPreviewSeries: vi.fn()
			}
		});
		await fireEvent.change(screen.getByLabelText('Date Pattern'), { target: { value: 'daily' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Add' }));
		expect(onPatternChange).toHaveBeenCalledWith('daily');
		expect(onAddCustomDate).toHaveBeenCalled();
	});

	it('AdvancedCandidateReviewStep toggles candidate inclusion', async () => {
		const onToggleCandidate = vi.fn();
		const person = makePerson();
		render(AdvancedCandidateReviewStep, {
			props: {
				templateName: 'Battalion Staff Duty',
				candidates: [person],
				columns: [
					{ key: 'include', header: 'Include', value: () => '', searchable: false },
					{ key: 'name', header: 'Candidate', value: () => 'SGT Nolan, Casey' },
					{ key: 'details', header: 'Details', value: () => 'HQ · 11B' }
				],
				selectedCount: 1,
				totalCount: 1,
				isPreviewing: false,
				canPreviewSingle: true,
				canPreviewSeries: true,
				isSelected: () => true,
				formatLabel: () => 'SGT Nolan, Casey',
				onToggleCandidate,
				onBack: vi.fn(),
				onPreviewSingle: vi.fn(),
				onPreviewSeries: vi.fn()
			}
		});
		await fireEvent.click(screen.getByLabelText('Include SGT Nolan, Casey in this run'));
		expect(onToggleCandidate).toHaveBeenCalledWith('p1');
	});
});
