<script lang="ts">
	import Badge from '$lib/components/ui/Badge.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import WizardStepper from './WizardStepper.svelte';
	import type { TagOption } from './MultiTagSelect.svelte';
	import { ALL_RANKS } from '$lib/types';
	import type { StatusType } from '$lib/types';
	import { cloneDefaultSoftPreferences, type DutyTemplate, type DutyTemplateWriteInput } from '../duty-roster.types';
	import TemplateStarterStep from './TemplateStarterStep.svelte';
	import TemplateBasicsStep from './TemplateBasicsStep.svelte';
	import TemplatePolicyStep from './TemplatePolicyStep.svelte';
	import TemplateSeriesStep from './TemplateSeriesStep.svelte';
	import TemplateReviewStep from './TemplateReviewStep.svelte';
	import TemplateRail from './TemplateRail.svelte';
	import {
		BUILDER_STEPS,
		buildPayload,
		createBlankBaseline,
		createBlankBuilderState,
		createBlankSlot,
		createBuilderStateFromPreset,
		createBuilderStateFromTemplate,
		createTemplateStarterPresets,
		enabledSoftPreferenceSummary,
		formatPersonLabel,
		slotSummaryLine,
		softPreferenceOptions,
		type BuilderFormState,
		type BuilderStep,
		type EditableBaseline,
		type EditableSlot,
		type GroupOption,
		type PersonnelOption,
		type SetupMode
	} from './advancedDutyTemplateBuilder.helpers';

	interface Props {
		templates: DutyTemplate[];
		groups: GroupOption[];
		personnel: PersonnelOption[];
		statusTypes: StatusType[];
		canManageTemplates: boolean;
		onCreateTemplate: (payload: DutyTemplateWriteInput) => Promise<DutyTemplate | null>;
		onUpdateTemplate: (payload: DutyTemplateWriteInput & { id: string }) => Promise<DutyTemplate | null>;
		onArchiveTemplate: (templateId: string) => Promise<DutyTemplate | null>;
	}

	let {
		templates,
		groups,
		personnel,
		statusTypes,
		canManageTemplates,
		onCreateTemplate,
		onUpdateTemplate,
		onArchiveTemplate
	}: Props = $props();

	let selectedTemplateId = $state<string | null>(null);
	let isCreatingNew = $state(false);
	let initialized = false;
	let saveError = $state('');
	let isSaving = $state(false);
	let isDirty = $state(false);
	let slotKeyIndex = 0;
	let setupMode = $state<SetupMode>('quick');
	let builderStep = $state<BuilderStep>('basics');
	let showArchivedTemplates = $state(false);
	let collapsedSlots = $state<Set<string>>(new Set());
	let pendingArchiveTemplateId = $state<string | null>(null);

	let templateName = $state('');
	let templateDescription = $state('');
	let templateStatus = $state<'draft' | 'active' | 'archived'>('draft');
	let scopeType = $state<'organization' | 'groups'>('organization');
	let scopeGroupIds = $state<string[]>([]);
	let exemptPersonnelIds = $state<string[]>([]);
	let exemptStatusTypeIds = $state<string[]>([]);
	let coverageMode = $state<'all-day' | 'timed'>('all-day');
	let startTime = $state('');
	let endTime = $state('');
	let spansMidnight = $state(false);
	let isBlocking = $state(false);
	let cooldownHours = $state(0);
	let draftSoftPreferences = $state(cloneDefaultSoftPreferences());
	let draftSlots = $state<EditableSlot[]>([]);
	let draftRotationBaselines = $state<EditableBaseline[]>([]);

	const templateStarterPresets = $derived.by(() => createTemplateStarterPresets(groups));
	const availableMosValues = $derived(
		[...new Set(personnel.map((person) => person.mos.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
	);
	const availableRoleValues = $derived(
		[...new Set(personnel.map((person) => person.clinicRole.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
	);
	const visibleTemplates = $derived(
		showArchivedTemplates ? templates : templates.filter((template) => template.status !== 'archived')
	);
	const selectedTemplate = $derived(templates.find((template) => template.id === selectedTemplateId) ?? null);
	const hasInvalidSlots = $derived(draftSlots.some((slot) => !slot.roleLabel.trim() || slot.quantity < 1));
	const canSave = $derived(templateName.trim().length > 0 && !hasInvalidSlots);
	const canSaveDraft = $derived(templateName.trim().length > 0);
	const rotationPoolOptions = $derived(
		[...new Set(draftSlots.map((slot) => slot.rotationPoolKey.trim()).filter(Boolean))].sort((a, b) =>
			a.localeCompare(b)
		)
	);
	const rankTagOptions = $derived<TagOption[]>(ALL_RANKS.map((rank) => ({ value: rank, label: rank })));
	const groupTagOptions = $derived<TagOption[]>(groups.map((group) => ({ value: group.id, label: group.name })));
	const mosTagOptions = $derived<TagOption[]>(availableMosValues.map((value) => ({ value, label: value })));
	const roleTagOptions = $derived<TagOption[]>(availableRoleValues.map((value) => ({ value, label: value })));
	const personnelTagOptions = $derived<TagOption[]>(
		personnel.map((person) => ({ value: person.id, label: formatPersonLabel(person) }))
	);
	const enabledSoftPreferenceSummaryText = $derived(
		enabledSoftPreferenceSummary(draftSoftPreferences, softPreferenceOptions)
	);

	function applyState(state: BuilderFormState) {
		templateName = state.templateName;
		templateDescription = state.templateDescription;
		templateStatus = state.templateStatus;
		scopeType = state.scopeType;
		scopeGroupIds = state.scopeGroupIds;
		exemptPersonnelIds = state.exemptPersonnelIds;
		exemptStatusTypeIds = state.exemptStatusTypeIds;
		coverageMode = state.coverageMode;
		startTime = state.startTime;
		endTime = state.endTime;
		spansMidnight = state.spansMidnight;
		isBlocking = state.isBlocking;
		cooldownHours = state.cooldownHours;
		draftSoftPreferences = state.draftSoftPreferences;
		draftSlots = state.draftSlots;
		draftRotationBaselines = state.draftRotationBaselines;
	}

	function nextSlotKey(): string {
		slotKeyIndex += 1;
		return `slot-${slotKeyIndex}`;
	}

	function markDirty() {
		isDirty = true;
	}

	function loadTemplate(template: DutyTemplate) {
		selectedTemplateId = template.id;
		isCreatingNew = false;
		isDirty = false;
		setupMode = 'full';
		builderStep = 'basics';
		saveError = '';
		applyState(createBuilderStateFromTemplate(template, nextSlotKey));
	}

	function resetForNew() {
		selectedTemplateId = null;
		isCreatingNew = true;
		isDirty = false;
		setupMode = 'quick';
		builderStep = 'basics';
		saveError = '';
		applyState(createBlankBuilderState());
	}

	function applyStarterPreset(presetId: string | null) {
		resetForNew();
		const preset = templateStarterPresets.find((candidate) => candidate.id === presetId);
		if (!preset) return;
		applyState(createBuilderStateFromPreset(preset, nextSlotKey));
	}

	$effect(() => {
		if (initialized) return;
		initialized = true;
		if (visibleTemplates.length > 0) {
			loadTemplate(visibleTemplates[0]);
			return;
		}
		resetForNew();
	});

	$effect(() => {
		if (!selectedTemplateId) return;
		if (visibleTemplates.some((template) => template.id === selectedTemplateId)) return;
		if (visibleTemplates.length > 0) {
			loadTemplate(visibleTemplates[0]);
		} else {
			resetForNew();
		}
	});

	function addSlot() {
		markDirty();
		const newSlot = createBlankSlot(nextSlotKey);
		collapsedSlots = new Set(draftSlots.map((slot) => slot.key));
		draftSlots = [...draftSlots, newSlot];
	}
	function removeSlot(key: string) {
		markDirty();
		collapsedSlots = new Set([...collapsedSlots].filter((value) => value !== key));
		draftSlots = draftSlots.filter((slot) => slot.key !== key);
	}
	function toggleSlotCollapsed(key: string) {
		const next = new Set(collapsedSlots);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		collapsedSlots = next;
	}
	function updateSlot(key: string, patch: Partial<EditableSlot>) {
		markDirty();
		draftSlots = draftSlots.map((slot) => (slot.key === key ? { ...slot, ...patch } : slot));
	}
	function addBaseline() {
		markDirty();
		draftRotationBaselines = [
			...draftRotationBaselines,
			createBlankBaseline(nextSlotKey, rotationPoolOptions[0] ?? '')
		];
	}
	function removeBaseline(key: string) {
		markDirty();
		draftRotationBaselines = draftRotationBaselines.filter((baseline) => baseline.key !== key);
	}
	function updateBaseline(key: string, patch: Partial<EditableBaseline>) {
		markDirty();
		draftRotationBaselines = draftRotationBaselines.map((baseline) =>
			baseline.key === key ? { ...baseline, ...patch } : baseline
		);
	}
	function moveSoftPreference(type: string, direction: -1 | 1) {
		const index = draftSoftPreferences.findIndex((preference) => preference.type === type);
		const nextIndex = index + direction;
		if (index === -1 || nextIndex < 0 || nextIndex >= draftSoftPreferences.length) return;
		markDirty();
		const next = [...draftSoftPreferences];
		const [item] = next.splice(index, 1);
		next.splice(nextIndex, 0, item);
		draftSoftPreferences = next;
	}
	function updateSoftPreference(type: string, enabled: boolean) {
		markDirty();
		draftSoftPreferences = draftSoftPreferences.map((preference) =>
			preference.type === type ? { ...preference, enabled } : preference
		);
	}
	function toggleExemptStatusType(statusTypeId: string) {
		markDirty();
		exemptStatusTypeIds = exemptStatusTypeIds.includes(statusTypeId)
			? exemptStatusTypeIds.filter((id) => id !== statusTypeId)
			: [...exemptStatusTypeIds, statusTypeId];
	}

	async function handleSave(status: 'draft' | 'active' | 'archived' | null = null) {
		if ((status === 'draft' && !canSaveDraft) || (status !== 'draft' && !canSave)) return;
		saveError = '';
		isSaving = true;
		try {
			const payload = {
				...buildPayload({
					templateStatus,
					templateName,
					templateDescription,
					scopeType,
					scopeGroupIds,
					exemptPersonnelIds,
					exemptStatusTypeIds,
					coverageMode,
					startTime,
					endTime,
					spansMidnight,
					isBlocking,
					cooldownHours,
					draftSoftPreferences,
					draftSlots,
					draftRotationBaselines
				}),
				status: status ?? templateStatus
			};
			const saved =
				selectedTemplateId && !isCreatingNew
					? await onUpdateTemplate({ ...payload, id: selectedTemplateId })
					: await onCreateTemplate(payload);
			if (saved) {
				loadTemplate(saved);
				return;
			}
			saveError = status === 'draft' ? 'The draft could not be saved.' : 'The template could not be saved.';
		} catch (error) {
			saveError = error instanceof Error ? error.message : 'The template could not be saved.';
		} finally {
			isSaving = false;
		}
	}

	function goToPreviousStep() {
		const index = BUILDER_STEPS.findIndex((step) => step.id === builderStep);
		if (index <= 0) return;
		builderStep = BUILDER_STEPS[index - 1].id;
	}
	function goToNextStep() {
		const index = BUILDER_STEPS.findIndex((step) => step.id === builderStep);
		if (index < 0 || index >= BUILDER_STEPS.length - 1) return;
		builderStep = BUILDER_STEPS[index + 1].id;
	}
	async function handleArchiveSelectedTemplate() {
		const templateId = pendingArchiveTemplateId ?? selectedTemplateId;
		if (!templateId) return;
		const archived = await onArchiveTemplate(templateId);
		if (archived) loadTemplate(archived);
		pendingArchiveTemplateId = null;
	}

	$effect(() => {
		function handleBeforeUnload(event: BeforeUnloadEvent) {
			if (isDirty) event.preventDefault();
		}
		window.addEventListener('beforeunload', handleBeforeUnload);
		return () => window.removeEventListener('beforeunload', handleBeforeUnload);
	});
</script>

<section class="advanced-builder">
	<header class="builder-header">
		<div>
			<p class="eyebrow">Advanced Duty Templates</p>
			<h2>Draft and review reusable duty policies.</h2>
			<p class="builder-copy">
				Build the reusable rule set here first. Generation and apply flows can layer on top of these templates later.
			</p>
		</div>
	</header>

	{#if canManageTemplates}
		<WizardStepper steps={BUILDER_STEPS} current={builderStep} />
	{/if}

	{#if !canManageTemplates}
		<section class="restricted-state">
			<h3>Advanced templates are admin-only right now.</h3>
			<p>
				Owners and admins can create or edit reusable advanced duty templates. Full editors can still use the current
				duty roster generator.
			</p>
		</section>
	{:else}
		<div class="builder-layout">
			<TemplateRail
				{visibleTemplates}
				{selectedTemplateId}
				{isCreatingNew}
				{showArchivedTemplates}
				onToggleShowArchived={(value) => (showArchivedTemplates = value)}
				onLoadTemplate={loadTemplate}
			/>

			<div class="builder-main">
				{#if builderStep === 'basics'}
					<TemplateStarterStep
						{setupMode}
						presets={templateStarterPresets}
						onSetupModeChange={(mode) => (setupMode = mode)}
						onApplyPreset={applyStarterPreset}
					/>
					<TemplateBasicsStep
						{templateName}
						{templateDescription}
						{templateStatus}
						{canSaveDraft}
						selectedTemplateCanArchive={Boolean(
							selectedTemplateId && !isCreatingNew && selectedTemplate?.status !== 'archived'
						)}
						onNameChange={(value) => {
							templateName = value;
							markDirty();
						}}
						onDescriptionChange={(value) => {
							templateDescription = value;
							markDirty();
						}}
						onStatusChange={(value) => {
							templateStatus = value;
							markDirty();
						}}
						onNext={goToNextStep}
						onArchive={() => {
							pendingArchiveTemplateId = selectedTemplateId;
						}}
					/>
				{:else if builderStep === 'policy'}
					<TemplatePolicyStep
						{setupMode}
						{scopeType}
						{scopeGroupIds}
						{exemptPersonnelIds}
						{exemptStatusTypeIds}
						{coverageMode}
						{startTime}
						{endTime}
						{spansMidnight}
						{isBlocking}
						{cooldownHours}
						{groupTagOptions}
						{personnelTagOptions}
						{statusTypes}
						{draftSoftPreferences}
						{softPreferenceOptions}
						onScopeTypeChange={(value) => {
							scopeType = value;
							markDirty();
						}}
						onScopeGroupIdsChange={(value) => {
							scopeGroupIds = value;
							markDirty();
						}}
						onExemptPersonnelIdsChange={(value) => {
							exemptPersonnelIds = value;
							markDirty();
						}}
						onToggleExemptStatusType={toggleExemptStatusType}
						onCoverageModeChange={(value) => {
							coverageMode = value;
							markDirty();
						}}
						onStartTimeChange={(value) => {
							startTime = value;
							markDirty();
						}}
						onEndTimeChange={(value) => {
							endTime = value;
							markDirty();
						}}
						onSpansMidnightChange={(value) => {
							spansMidnight = value;
							markDirty();
						}}
						onIsBlockingChange={(value) => {
							isBlocking = value;
							markDirty();
						}}
						onCooldownHoursChange={(value) => {
							cooldownHours = value;
							markDirty();
						}}
						onMoveSoftPreference={moveSoftPreference}
						onUpdateSoftPreference={updateSoftPreference}
						onBack={goToPreviousStep}
						onNext={goToNextStep}
					/>
				{:else if builderStep === 'series'}
					<TemplateSeriesStep
						{setupMode}
						{draftSlots}
						{collapsedSlots}
						{draftRotationBaselines}
						{rotationPoolOptions}
						{rankTagOptions}
						{groupTagOptions}
						{mosTagOptions}
						{roleTagOptions}
						{personnel}
						{formatPersonLabel}
						slotSummaryLine={(slot) => slotSummaryLine(slot, groups)}
						onAddSlot={addSlot}
						onRemoveSlot={removeSlot}
						onToggleSlotCollapsed={toggleSlotCollapsed}
						onUpdateSlot={updateSlot}
						onAddBaseline={addBaseline}
						onRemoveBaseline={removeBaseline}
						onUpdateBaseline={updateBaseline}
						onBack={goToPreviousStep}
						onReview={goToNextStep}
					/>
				{:else}
					<TemplateReviewStep
						{templateName}
						{templateStatus}
						{scopeType}
						{scopeGroupIds}
						{coverageMode}
						{startTime}
						{endTime}
						{isBlocking}
						{cooldownHours}
						{draftSlots}
						{draftRotationBaselines}
						{exemptStatusTypeIds}
						enabledSoftPreferenceSummary={enabledSoftPreferenceSummaryText}
						{saveError}
						{isDirty}
						{canSaveDraft}
						{canSave}
						{isSaving}
						onBack={goToPreviousStep}
						onSaveDraft={() => handleSave('draft')}
						onSave={() => handleSave()}
					/>
				{/if}
			</div>
		</div>
	{/if}
</section>

{#if pendingArchiveTemplateId}
	<ConfirmDialog
		title="Archive Template?"
		message="Archive this advanced template? Existing applied history remains, but this template is hidden from apply pickers until reactivated."
		confirmLabel="Archive Template"
		cancelLabel="Cancel"
		variant="warning"
		onConfirm={handleArchiveSelectedTemplate}
		onCancel={() => {
			pendingArchiveTemplateId = null;
		}}
	/>
{/if}

<style>
	.advanced-builder {
		display: grid;
		gap: var(--sp-5);
	}
	.builder-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: var(--sp-4);
	}
	.builder-layout {
		display: grid;
		gap: var(--sp-4);
		grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
	}
	.builder-main {
		display: grid;
		gap: var(--sp-4);
	}
	.restricted-state {
		padding: var(--sp-5);
		border: 1px dashed var(--border-default);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
	}
	.eyebrow {
		margin: 0 0 var(--sp-2);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}
	h2,
	h3 {
		margin: 0;
	}
	.builder-copy {
		margin: var(--sp-2) 0 0;
		color: var(--text-secondary);
	}
	@media (max-width: 900px) {
		.builder-layout {
			grid-template-columns: 1fr;
		}
	}
</style>
