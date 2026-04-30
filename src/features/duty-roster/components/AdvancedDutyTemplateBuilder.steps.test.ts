// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import TemplateStarterStep from './TemplateStarterStep.svelte';
import TemplateBasicsStep from './TemplateBasicsStep.svelte';
import TemplatePolicyStep from './TemplatePolicyStep.svelte';
import TemplateSeriesStep from './TemplateSeriesStep.svelte';
import TemplateReviewStep from './TemplateReviewStep.svelte';

describe('AdvancedDutyTemplateBuilder step components', () => {
	it('TemplateStarterStep switches setup mode and applies presets', async () => {
		const onSetupModeChange = vi.fn();
		const onApplyPreset = vi.fn();
		render(TemplateStarterStep, {
			props: {
				setupMode: 'quick',
				presets: [
					{
						id: 'preset-1',
						label: 'Company CQ',
						description: 'Preset',
						name: 'Company CQ',
						templateDescription: '',
						scopeType: 'organization',
						scopeGroupIds: [],
						coverageMode: 'timed',
						startTime: '08:00',
						endTime: '08:00',
						isBlocking: true,
						cooldownHours: 12,
						slots: []
					}
				],
				onSetupModeChange,
				onApplyPreset
			}
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Full' }));
		await fireEvent.click(screen.getByRole('button', { name: /Company CQ/ }));
		expect(onSetupModeChange).toHaveBeenCalledWith('full');
		expect(onApplyPreset).toHaveBeenCalledWith('preset-1');
	});

	it('TemplateBasicsStep edits fields and advances', async () => {
		const onNameChange = vi.fn();
		const onNext = vi.fn();
		render(TemplateBasicsStep, {
			props: {
				templateName: '',
				templateDescription: '',
				templateStatus: 'draft',
				canSaveDraft: true,
				selectedTemplateCanArchive: false,
				onNameChange,
				onDescriptionChange: vi.fn(),
				onStatusChange: vi.fn(),
				onNext,
				onArchive: vi.fn()
			}
		});
		await fireEvent.input(screen.getByPlaceholderText('e.g. Battalion Staff Duty'), {
			target: { value: 'Battalion Staff Duty' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Policy' }));
		expect(onNameChange).toHaveBeenCalled();
		expect(onNext).toHaveBeenCalled();
	});

	it('TemplatePolicyStep shows status availability as status-owned and navigates', async () => {
		const onNext = vi.fn();
		render(TemplatePolicyStep, {
			props: {
				setupMode: 'quick',
				scopeType: 'organization',
				scopeGroupIds: [],
				exemptPersonnelIds: [],
				coverageMode: 'all-day',
				startTime: '',
				endTime: '',
				spansMidnight: false,
				isBlocking: true,
				cooldownHours: 24,
				groupTagOptions: [],
				personnelTagOptions: [],
				draftSoftPreferences: [],
				softPreferenceOptions: [],
				onScopeTypeChange: vi.fn(),
				onScopeGroupIdsChange: vi.fn(),
				onExemptPersonnelIdsChange: vi.fn(),
				onCoverageModeChange: vi.fn(),
				onStartTimeChange: vi.fn(),
				onEndTimeChange: vi.fn(),
				onSpansMidnightChange: vi.fn(),
				onIsBlockingChange: vi.fn(),
				onCooldownHoursChange: vi.fn(),
				onMoveSoftPreference: vi.fn(),
				onUpdateSoftPreference: vi.fn(),
				onBack: vi.fn(),
				onNext
			}
		});
		expect(screen.getByText('Status availability')).toBeTruthy();
		expect(screen.getByText('Handled by Calendar status treatments.')).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Slots' }));
		expect(onNext).toHaveBeenCalled();
	});

	it('TemplateSeriesStep adds slots and baselines through callbacks', async () => {
		const onAddSlot = vi.fn();
		const onAddBaseline = vi.fn();
		render(TemplateSeriesStep, {
			props: {
				setupMode: 'full',
				draftSlots: [],
				collapsedSlots: new Set<string>(),
				draftRotationBaselines: [],
				rotationPoolOptions: [],
				rankTagOptions: [],
				groupTagOptions: [],
				mosTagOptions: [],
				roleTagOptions: [],
				personnel: [],
				formatPersonLabel: () => 'SGT Nolan',
				slotSummaryLine: () => '1× NCO',
				onAddSlot,
				onRemoveSlot: vi.fn(),
				onToggleSlotCollapsed: vi.fn(),
				onUpdateSlot: vi.fn(),
				onAddBaseline,
				onRemoveBaseline: vi.fn(),
				onUpdateBaseline: vi.fn(),
				onBack: vi.fn(),
				onReview: vi.fn()
			}
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Add Slot' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Add Baseline' }));
		expect(onAddSlot).toHaveBeenCalled();
		expect(onAddBaseline).toHaveBeenCalled();
	});

	it('TemplateReviewStep exposes save actions', async () => {
		const onSave = vi.fn();
		render(TemplateReviewStep, {
			props: {
				templateName: 'Battalion Staff Duty',
				templateStatus: 'draft',
				scopeType: 'organization',
				scopeGroupIds: [],
				coverageMode: 'all-day',
				startTime: '',
				endTime: '',
				isBlocking: true,
				cooldownHours: 24,
				draftSlots: [{ key: 'slot-1', quantity: 1, roleLabel: 'NCO' }],
				draftRotationBaselines: [],
				enabledSoftPreferenceSummary: 'Longest break',
				saveError: '',
				isDirty: true,
				canSaveDraft: true,
				canSave: true,
				isSaving: false,
				onBack: vi.fn(),
				onSaveDraft: vi.fn(),
				onSave
			}
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Save Template' }));
		expect(onSave).toHaveBeenCalled();
	});
});
