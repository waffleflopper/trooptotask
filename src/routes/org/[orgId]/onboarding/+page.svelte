<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { PersonnelOnboarding, OnboardingStepProgress } from '$features/onboarding/onboarding.types';
	import type { TrainingType, PersonnelTraining } from '$features/training/training.types';
	import { invalidate } from '$app/navigation';
	import { formatDisplayDate } from '$lib/utils/dates';
	import { onboardingTemplateStore } from '$features/onboarding/stores/onboardingTemplate.svelte';
	import { onboardingStore } from '$features/onboarding/stores/onboarding.svelte';
	import { personnelStore } from '$features/personnel/stores/personnel.svelte';
	import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
	import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';
	import { groupsStore } from '$lib/stores/groups.svelte';
	import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
	import { subscriptionStore } from '$lib/stores/subscription.svelte';
	import OnboardingTemplateManager from '$features/onboarding/components/OnboardingTemplateManager.svelte';
	import OnboardingReportModal from '$features/onboarding/components/OnboardingReportModal.svelte';
	import PageToolbar from '$lib/components/PageToolbar.svelte';
	import type { OverflowItem } from '$lib/components/ui/OverflowMenu.svelte';
	import StartOnboardingModal from '$features/onboarding/components/StartOnboardingModal.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import TrainingRecordModal from '$features/training/components/TrainingRecordModal.svelte';
	import Modal from '$lib/components/Modal.svelte';

	let { data } = $props();

	// Hydrate stores with server data
	$effect(() => {
		personnelStore.load(data.personnel ?? [], data.orgId);
		groupsStore.load(data.groups ?? [], data.orgId);
		statusTypesStore.load(data.statusTypes ?? [], data.orgId);
		trainingTypesStore.load(data.trainingTypes ?? [], data.orgId);
		personnelTrainingsStore.load(data.personnelTrainings ?? [], data.orgId);
		onboardingTemplateStore.load(data.onboardingTemplates, data.onboardingTemplateSteps, data.orgId);
		onboardingStore.load(data.onboardings, data.orgId);
	});

	const readOnly = $derived(subscriptionStore.billingEnabled && subscriptionStore.isReadOnly);
	const canManageConfig = $derived(data.isOwner || data.isAdmin || data.isFullEditor);

	let showTemplateManager = $state(false);
	let showStartModal = $state(false);
	let showReport = $state(false);
	let editingTrainingStep = $state<{
		person: Personnel;
		trainingType: TrainingType;
		existingTraining: PersonnelTraining | undefined;
		onboardingId: string;
	} | null>(null);

	const hasTemplateSteps = $derived(onboardingTemplateStore.list.length > 0);

	const onboardingOverflowItems = $derived.by<OverflowItem[]>(() => {
		const items: OverflowItem[] = [];
		items.push({ label: 'View Report', onclick: () => (showReport = true) });
		if (canManageConfig) {
			items.push({ label: 'Manage Templates', onclick: () => (showTemplateManager = true), disabled: readOnly });
		}
		return items;
	});
	let expandedOnboardingId = $state<string | null>(null);
	let showFilter = $state<'active' | 'all'>('active');
	let cancellingId = $state<string | null>(null);

	// Step type colors and labels (matching OnboardingTemplateManager)
	const stepTypeColors: Record<string, string> = {
		training: '#3b82f6',
		paperwork: '#f59e0b',
		checkbox: '#6b7280'
	};

	const stepTypeLabels: Record<string, string> = {
		training: 'Training',
		paperwork: 'Paperwork',
		checkbox: 'Checkbox'
	};

	const statusColors: Record<string, string> = {
		in_progress: '#3b82f6',
		completed: '#22c55e',
		cancelled: '#6b7280'
	};

	const statusLabels: Record<string, string> = {
		in_progress: 'In Progress',
		completed: 'Completed',
		cancelled: 'Cancelled'
	};

	// Personnel IDs already being onboarded (active)
	const existingOnboardingPersonnelIds = $derived(onboardingStore.activeList.map((o) => o.personnelId));

	// Filtered onboardings based on filter toggle
	const filteredOnboardings = $derived(
		showFilter === 'active' ? onboardingStore.list.filter((o) => o.status === 'in_progress') : onboardingStore.list
	);

	// Get person name for an onboarding
	function getPersonName(personnelId: string): string {
		const p = personnelStore.getById(personnelId);
		return p ? `${p.rank} ${p.lastName}, ${p.firstName}` : 'Unknown';
	}

	// Check if a step is deprecated: has a templateStepId that no longer exists in ANY template
	function isStepDeprecated(step: OnboardingStepProgress): boolean {
		return step.templateStepId !== null && onboardingTemplateStore.getById(step.templateStepId) === undefined;
	}

	// Check if a training step is complete (auto-detect from training records)
	function isTrainingStepComplete(step: OnboardingStepProgress, personnelId: string): boolean {
		if (!step.trainingTypeId) return false;

		// Look up training type
		const type = trainingTypesStore.getById(step.trainingTypeId);

		// Exempt counts as complete for onboarding
		if (type && type.canBeExempted && type.exemptPersonnelIds.includes(personnelId)) {
			return true;
		}

		const training = personnelTrainingsStore.list.find(
			(t) => t.personnelId === personnelId && t.trainingTypeId === step.trainingTypeId
		);
		if (!training) return false;

		// Never-expires: any record existing means complete
		if (type && type.expirationMonths === null && !type.expirationDateOnly) {
			return true;
		}

		// Has an expiration date — check if still valid
		if (training.expirationDate) {
			return new Date(training.expirationDate) >= new Date();
		}
		return training.completionDate !== null;
	}

	// Calculate progress for an onboarding (deprecated steps excluded)
	function getProgress(onboarding: PersonnelOnboarding): { completed: number; total: number } {
		let completed = 0;
		let total = 0;
		for (const step of onboarding.steps) {
			if (isStepDeprecated(step)) continue; // Skip deprecated steps in progress count
			total++;
			if (step.stepType === 'training') {
				if (isTrainingStepComplete(step, onboarding.personnelId)) completed++;
			} else if (step.stepType === 'paperwork') {
				const stages = step.stages ?? [];
				if (stages.length > 0 && step.currentStage === stages[stages.length - 1]) completed++;
				else if (step.completed) completed++;
			} else {
				if (step.completed) completed++;
			}
		}
		return { completed, total };
	}

	// Event handlers
	async function handleStartOnboarding(personnelId: string, startedAt: string, templateId: string | null) {
		await onboardingStore.startOnboarding(personnelId, startedAt, templateId);
		showStartModal = false;
	}

	async function handleAddPerson(data: Omit<Personnel, 'id'>): Promise<string | null> {
		const newPerson = await personnelStore.add(data);
		return newPerson?.id ?? null;
	}

	// Check if all steps are complete and auto-mark onboarding as completed
	async function checkAutoComplete(onboardingId: string) {
		const onboarding = onboardingStore.getById(onboardingId);
		if (!onboarding || onboarding.status !== 'in_progress') return;
		const progress = getProgress(onboarding);
		if (progress.total > 0 && progress.completed === progress.total) {
			await onboardingStore.completeOnboarding(onboardingId);
		}
	}

	async function handleToggleCheckbox(step: OnboardingStepProgress) {
		await onboardingStore.updateStepProgress(step.id, { completed: !step.completed });
		// Check auto-completion
		const onboarding = onboardingStore.list.find((o) => o.steps.some((s) => s.id === step.id));
		if (onboarding) await checkAutoComplete(onboarding.id);
	}

	async function handleAdvanceStage(step: OnboardingStepProgress) {
		const stages = step.stages ?? [];
		const currentIndex = stages.indexOf(step.currentStage ?? '');
		if (currentIndex < stages.length - 1) {
			const nextStage = stages[currentIndex + 1];
			const isLast = currentIndex + 1 === stages.length - 1;
			await onboardingStore.updateStepProgress(step.id, {
				currentStage: nextStage,
				completed: isLast
			});
			// Check auto-completion
			if (isLast) {
				const onboarding = onboardingStore.list.find((o) => o.steps.some((s) => s.id === step.id));
				if (onboarding) await checkAutoComplete(onboarding.id);
			}
		}
	}

	async function handleRetreatStage(step: OnboardingStepProgress) {
		const stages = step.stages ?? [];
		const currentIndex = stages.indexOf(step.currentStage ?? '');
		if (currentIndex > 0) {
			await onboardingStore.updateStepProgress(step.id, {
				currentStage: stages[currentIndex - 1],
				completed: false
			});
		}
	}

	// Note adding
	let noteInputs = $state<Record<string, string>>({});
	let expandedNotes = $state<Set<string>>(new Set());

	function toggleNotes(stepId: string) {
		const newSet = new Set(expandedNotes);
		if (newSet.has(stepId)) newSet.delete(stepId);
		else newSet.add(stepId);
		expandedNotes = newSet;
	}

	async function handleAddNote(step: OnboardingStepProgress) {
		const text = noteInputs[step.id]?.trim();
		if (!text) return;
		const newNote = { text, timestamp: new Date().toISOString() };
		const updatedNotes = [newNote, ...step.notes];
		await onboardingStore.updateStepProgress(step.id, { notes: updatedNotes });
		noteInputs[step.id] = '';
	}

	function handleTrainingStepClick(step: OnboardingStepProgress, onboarding: PersonnelOnboarding) {
		if (!step.trainingTypeId) return;
		const person = personnelStore.getById(onboarding.personnelId);
		const trainingType = trainingTypesStore.getById(step.trainingTypeId);
		if (!person || !trainingType) return;
		const existingTraining = personnelTrainingsStore.getByPersonnelAndType(person.id, trainingType.id);
		editingTrainingStep = { person, trainingType, existingTraining, onboardingId: onboarding.id };
	}

	async function handleTrainingSave(trainingData: Omit<PersonnelTraining, 'id'>) {
		await personnelTrainingsStore.add(trainingData);
		if (editingTrainingStep) {
			await checkAutoComplete(editingTrainingStep.onboardingId);
		}
		editingTrainingStep = null;
		invalidate('app:shared-data');
	}

	async function handleTrainingRemove(id: string) {
		await personnelTrainingsStore.remove(id);
		editingTrainingStep = null;
		invalidate('app:shared-data');
	}

	async function handleTrainingToggleExempt(exempt: boolean) {
		if (!editingTrainingStep) return;
		const type = editingTrainingStep.trainingType;
		const personId = editingTrainingStep.person.id;
		const updatedIds = exempt
			? [...type.exemptPersonnelIds, personId]
			: type.exemptPersonnelIds.filter((id) => id !== personId);
		await trainingTypesStore.update(type.id, { exemptPersonnelIds: updatedIds });
		await checkAutoComplete(editingTrainingStep.onboardingId);
		editingTrainingStep = null;
		invalidate('app:shared-data');
	}

	async function handleCancelOnboarding(id: string) {
		await onboardingStore.cancelOnboarding(id);
		cancellingId = null;
	}

	async function handleCompleteOnboarding(id: string) {
		await onboardingStore.completeOnboarding(id);
	}

	function toggleExpand(id: string) {
		expandedOnboardingId = expandedOnboardingId === id ? null : id;
	}

	function formatTimestamp(isoStr: string): string {
		const d = new Date(isoStr);
		const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
		const h = d.getHours();
		const m = String(d.getMinutes()).padStart(2, '0');
		const ampm = h >= 12 ? 'PM' : 'AM';
		const hour = h % 12 || 12;
		return `${months[d.getMonth()]} ${d.getDate()} at ${hour}:${m} ${ampm}`;
	}

	function getPaperworkStageIndex(step: OnboardingStepProgress): number {
		const stages = step.stages ?? [];
		if (!step.currentStage) return 0;
		const idx = stages.indexOf(step.currentStage);
		return idx >= 0 ? idx : 0;
	}

	// ── Re-sync & assign-template state ───────────────────────────

	let resyncingId = $state<string | null>(null);
	let resyncError = $state<string | null>(null);

	async function handleResync(onboardingId: string) {
		resyncingId = onboardingId;
		resyncError = null;
		const result = await onboardingStore.resync(onboardingId);
		resyncingId = null;
		if (!result.success) {
			resyncError = result.error ?? 'Re-sync failed';
		}
	}

	let assigningTemplateId = $state<string | null>(null);
	let assignTemplateSelected = $state('');
	let assigningTemplate = $state(false);
	let assignTemplateError = $state('');

	function openAssignTemplate(onboardingId: string) {
		assigningTemplateId = onboardingId;
		assignTemplateSelected = onboardingTemplateStore.templates[0]?.id ?? '';
		assignTemplateError = '';
	}

	async function handleAssignTemplate() {
		if (!assigningTemplateId || !assignTemplateSelected) return;
		assigningTemplate = true;
		assignTemplateError = '';
		const result = await onboardingStore.assignTemplate(assigningTemplateId, assignTemplateSelected);
		assigningTemplate = false;
		if (result.success) {
			assigningTemplateId = null;
		} else {
			assignTemplateError = result.error ?? 'Failed to assign template';
		}
	}

	let removingDeprecatedStepId = $state<string | null>(null);

	async function handleRemoveDeprecatedStep(stepId: string) {
		removingDeprecatedStepId = stepId;
		await onboardingStore.removeDeprecatedStep(stepId);
		removingDeprecatedStepId = null;
	}
</script>

<svelte:head>
	<title>Onboarding - Troop to Task</title>
</svelte:head>

<div class="page">
	<PageToolbar title="Onboarding" helpTopic="onboarding" overflowItems={onboardingOverflowItems}>
		<div class="filter-toggle">
			<button class="filter-btn" class:active={showFilter === 'active'} onclick={() => (showFilter = 'active')}>
				Active
			</button>
			<button class="filter-btn" class:active={showFilter === 'all'} onclick={() => (showFilter = 'all')}> All </button>
		</div>
		{#if data.permissions?.canEditOnboarding}
			{#if canManageConfig}
				<button class="btn-ghost" onclick={() => (showTemplateManager = true)} disabled={readOnly}>
					Manage Templates
				</button>
			{/if}
			<button
				class="btn btn-primary btn-sm"
				onclick={() => (showStartModal = true)}
				disabled={!hasTemplateSteps || readOnly}
				title={!hasTemplateSteps ? 'Set up template steps before starting an onboarding' : ''}
			>
				Start Onboarding
			</button>
			{#if readOnly}
				<span class="text-muted" style="font-size: var(--font-size-xs);">Upgrade to edit</span>
			{/if}
		{/if}
	</PageToolbar>

	{#if !data.permissions?.canViewOnboarding}
		<div class="no-permission">
			<h2>Access Restricted</h2>
			<p>You don't have permission to view this area. Contact your organization admin for access.</p>
		</div>
	{:else}
		<main class="page-content">
			{#if !hasTemplateSteps && onboardingStore.list.length > 0}
				<div class="warning-banner">
					<span>No template steps defined — new onboardings cannot be started until steps are added.</span>
					{#if data.permissions?.canEditOnboarding}
						<button class="btn btn-sm btn-secondary" onclick={() => (showTemplateManager = true)}>
							Manage Templates
						</button>
					{/if}
				</div>
			{/if}

			{#if resyncError}
				<div class="error-banner">
					<span>{resyncError}</span>
					<button class="btn btn-sm btn-secondary" onclick={() => (resyncError = null)}>Dismiss</button>
				</div>
			{/if}

			{#if filteredOnboardings.length === 0}
				{#if !hasTemplateSteps && onboardingStore.list.length === 0}
					{#if data.permissions?.canEditOnboarding}
						<EmptyState
							message="Set up your onboarding template to get started. Define the steps new members need to complete."
							actionLabel="Set Up Template"
							onAction={() => (showTemplateManager = true)}
						/>
					{:else}
						<EmptyState message="Onboarding has not been configured yet." />
					{/if}
				{:else}
					<EmptyState
						message={showFilter === 'active'
							? 'No active onboardings. Start one to begin tracking a new member.'
							: 'No onboardings found.'}
					/>
				{/if}
			{:else}
				<div class="onboarding-list">
					{#each filteredOnboardings as onboarding (onboarding.id)}
						{@const progress = getProgress(onboarding)}
						{@const pct = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0}
						{@const isExpanded = expandedOnboardingId === onboarding.id}
						{@const isLegacy = onboarding.templateId === null}
						<div class="onboarding-card" class:expanded={isExpanded}>
							<button class="card-summary" onclick={() => toggleExpand(onboarding.id)} aria-expanded={isExpanded}>
								<div class="card-main">
									<span class="expand-icon">{isExpanded ? '\u25BC' : '\u25B6'}</span>
									<div class="card-info">
										<span class="person-name">{getPersonName(onboarding.personnelId)}</span>
										<span class="started-date">Started {formatDisplayDate(onboarding.startedAt)}</span>
									</div>
								</div>
								<div class="card-progress">
									<div class="progress-bar">
										<div
											class="progress-fill"
											style="width: {pct}%; background: {pct === 100 ? 'var(--color-success)' : '#B8943E'}"
										></div>
									</div>
									<span class="progress-text">{progress.completed}/{progress.total} steps</span>
								</div>
								<div class="card-status">
									<Badge label={statusLabels[onboarding.status]} color={statusColors[onboarding.status]} />
								</div>
							</button>

							{#if isExpanded}
								<div class="card-detail">
									{#if data.permissions?.canEditOnboarding && onboarding.status === 'in_progress'}
										<div class="detail-actions">
											{#if pct === 100}
												<button class="btn btn-primary btn-sm" onclick={() => handleCompleteOnboarding(onboarding.id)}>
													Mark Complete
												</button>
											{/if}
											{#if isLegacy}
												<button
													class="btn btn-secondary btn-sm"
													onclick={() => openAssignTemplate(onboarding.id)}
													title="Assign a template to enable re-sync"
												>
													Assign Template
												</button>
											{:else}
												<button
													class="btn btn-secondary btn-sm sync-btn"
													onclick={() => handleResync(onboarding.id)}
													disabled={resyncingId === onboarding.id}
													title="Sync with current template: adds new steps, updates incomplete steps"
												>
													{#if resyncingId === onboarding.id}
														<Spinner color="var(--color-text-secondary)" />
													{:else}
														<svg
															viewBox="0 0 24 24"
															fill="none"
															stroke="currentColor"
															stroke-width="2"
															class="sync-icon"
														>
															<path d="M23 4v6h-6" /><path d="M1 20v-6h6" />
															<path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
														</svg>
													{/if}
													Re-sync
												</button>
											{/if}
											<button class="btn btn-danger btn-sm" onclick={() => (cancellingId = onboarding.id)}>
												Cancel Onboarding
											</button>
										</div>
									{/if}

									<div class="step-list">
										{#each onboarding.steps as step (step.id)}
											{@const deprecated = isStepDeprecated(step)}
											{@const isTrainingComplete =
												step.stepType === 'training' && isTrainingStepComplete(step, onboarding.personnelId)}
											{@const isPaperworkComplete =
												step.stepType === 'paperwork' &&
												(() => {
													const stages = step.stages ?? [];
													return (
														(stages.length > 0 && step.currentStage === stages[stages.length - 1]) || step.completed
													);
												})()}
											{@const isCheckboxComplete = step.stepType === 'checkbox' && step.completed}
											{@const isStepComplete = isTrainingComplete || isPaperworkComplete || isCheckboxComplete}
											<div class="step-row" class:step-complete={isStepComplete} class:step-deprecated={deprecated}>
												<div class="step-main">
													{#if deprecated}
														<Badge label="Deprecated" color="#6b7280" />
													{:else}
														<Badge label={stepTypeLabels[step.stepType]} color={stepTypeColors[step.stepType]} />
													{/if}
													<span class="step-name">{step.stepName}</span>

													{#if deprecated}
														{#if step.completed}
															<span class="deprecated-note">Removed from template</span>
														{:else if data.permissions?.canEditOnboarding && onboarding.status === 'in_progress'}
															<button
																class="btn btn-danger btn-sm"
																onclick={() => handleRemoveDeprecatedStep(step.id)}
																disabled={removingDeprecatedStepId === step.id}
															>
																{#if removingDeprecatedStepId === step.id}<Spinner />{/if}
																Remove Step
															</button>
														{:else}
															<span class="deprecated-note">Removed from template</span>
														{/if}
													{:else}
														<div class="step-status">
															{#if step.stepType === 'checkbox'}
																{#if data.permissions?.canEditOnboarding && onboarding.status === 'in_progress'}
																	<button
																		class="checkbox-toggle"
																		class:checked={step.completed}
																		onclick={() => handleToggleCheckbox(step)}
																		aria-label={step.completed ? 'Mark incomplete' : 'Mark complete'}
																	>
																		{#if step.completed}
																			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
																				<polyline points="20 6 9 17 4 12" />
																			</svg>
																		{/if}
																	</button>
																{:else}
																	<span class="status-icon" class:complete={step.completed}>
																		{step.completed ? '\u2713' : '\u2014'}
																	</span>
																{/if}
															{:else if step.stepType === 'training'}
																{#if data.permissions?.canEditOnboarding && onboarding.status === 'in_progress'}
																	<button
																		class="training-status-btn"
																		class:complete={isTrainingComplete}
																		class:incomplete={!isTrainingComplete}
																		onclick={() => handleTrainingStepClick(step, onboarding)}
																		aria-label="Edit training record"
																	>
																		{isTrainingComplete ? '\u2713' : '\u2717'}
																	</button>
																{:else}
																	<span
																		class="status-icon"
																		class:complete={isTrainingComplete}
																		class:incomplete={!isTrainingComplete}
																	>
																		{isTrainingComplete ? '\u2713' : '\u2717'}
																	</span>
																{/if}
															{:else if step.stepType === 'paperwork'}
																{@const stages = step.stages ?? []}
																{@const stageIndex = getPaperworkStageIndex(step)}
																<div class="stage-indicator">
																	{#if data.permissions?.canEditOnboarding && onboarding.status === 'in_progress'}
																		<button
																			class="stage-arrow"
																			onclick={() => handleRetreatStage(step)}
																			disabled={stageIndex <= 0}
																			aria-label="Previous stage"
																		>
																			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
																				><polyline points="15 18 9 12 15 6" /></svg
																			>
																		</button>
																	{/if}
																	<span class="stage-text">
																		{step.currentStage ?? stages[0] ?? 'N/A'}
																		<span class="stage-count">({stageIndex + 1}/{stages.length})</span>
																	</span>
																	{#if data.permissions?.canEditOnboarding && onboarding.status === 'in_progress'}
																		<button
																			class="stage-arrow"
																			onclick={() => handleAdvanceStage(step)}
																			disabled={stageIndex >= stages.length - 1}
																			aria-label="Next stage"
																		>
																			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
																				><polyline points="9 18 15 12 9 6" /></svg
																			>
																		</button>
																	{/if}
																</div>
															{/if}
														</div>
													{/if}
												</div>

												{#if !deprecated}
													<button class="notes-toggle" onclick={() => toggleNotes(step.id)} aria-label="Toggle notes">
														<svg
															viewBox="0 0 24 24"
															fill="none"
															stroke="currentColor"
															stroke-width="2"
															class="notes-icon"
														>
															<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
														</svg>
														{#if step.notes.length > 0}
															<span class="notes-count">{step.notes.length}</span>
														{/if}
													</button>

													{#if expandedNotes.has(step.id)}
														<div class="step-notes">
															{#if data.permissions?.canEditOnboarding && onboarding.status === 'in_progress'}
																<div class="note-input-row">
																	<input
																		type="text"
																		class="input note-input"
																		placeholder="Add a note..."
																		bind:value={noteInputs[step.id]}
																		onkeydown={(e) => {
																			if (e.key === 'Enter') handleAddNote(step);
																		}}
																	/>
																	<button
																		class="btn btn-primary btn-sm"
																		onclick={() => handleAddNote(step)}
																		disabled={!noteInputs[step.id]?.trim()}
																	>
																		Add
																	</button>
																</div>
															{/if}
															{#if step.notes.length === 0}
																<p class="no-notes">No notes yet.</p>
															{:else}
																<div class="notes-list">
																	{#each step.notes as note}
																		<div class="note-item">
																			<span class="note-text">{note.text}</span>
																			<span class="note-time">{formatTimestamp(note.timestamp)}</span>
																		</div>
																	{/each}
																</div>
															{/if}
														</div>
													{/if}
												{/if}
											</div>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</main>
	{/if}
</div>

{#if showReport}
	<OnboardingReportModal
		onboardings={onboardingStore.list}
		personnel={personnelStore.list}
		trainingTypes={trainingTypesStore.list}
		personnelTrainings={personnelTrainingsStore.list}
		onClose={() => (showReport = false)}
	/>
{/if}

{#if showTemplateManager}
	<OnboardingTemplateManager trainingTypes={trainingTypesStore.list} onClose={() => (showTemplateManager = false)} />
{/if}

{#if showStartModal}
	<StartOnboardingModal
		personnel={personnelStore.list}
		{existingOnboardingPersonnelIds}
		groups={groupsStore.list}
		templates={onboardingTemplateStore.templates}
		{hasTemplateSteps}
		onSubmit={handleStartOnboarding}
		onAddPerson={handleAddPerson}
		onClose={() => (showStartModal = false)}
	/>
{/if}

{#if cancellingId}
	<ConfirmDialog
		title="Cancel Onboarding"
		message="Are you sure you want to cancel this onboarding? This action cannot be undone."
		confirmLabel="Cancel Onboarding"
		variant="danger"
		onConfirm={() => handleCancelOnboarding(cancellingId!)}
		onCancel={() => (cancellingId = null)}
	/>
{/if}

{#if assigningTemplateId}
	<Modal
		title="Assign Template"
		onClose={() => {
			assigningTemplateId = null;
			assignTemplateError = '';
		}}
		width="420px"
		titleId="assign-template-title"
	>
		<p class="assign-desc">
			This onboarding was started before templates were introduced. Assign it to a template to enable re-sync. Steps
			will be matched by name and type.
		</p>
		<div class="form-group">
			<label class="label" for="assign-template-select">Template</label>
			<select id="assign-template-select" class="select" bind:value={assignTemplateSelected}>
				{#each onboardingTemplateStore.templates as t (t.id)}
					<option value={t.id}>{t.name}</option>
				{/each}
			</select>
		</div>
		{#if assignTemplateError}
			<p class="error-text">{assignTemplateError}</p>
		{/if}

		{#snippet footer()}
			<div class="spacer"></div>
			<button
				class="btn btn-secondary"
				onclick={() => {
					assigningTemplateId = null;
					assignTemplateError = '';
				}}>Cancel</button
			>
			<button
				class="btn btn-primary"
				onclick={handleAssignTemplate}
				disabled={!assignTemplateSelected || assigningTemplate}
			>
				{#if assigningTemplate}<Spinner />{/if}
				Assign Template
			</button>
		{/snippet}
	</Modal>
{/if}

{#if editingTrainingStep}
	<TrainingRecordModal
		person={editingTrainingStep.person}
		trainingType={editingTrainingStep.trainingType}
		existingTraining={editingTrainingStep.existingTraining}
		onSave={handleTrainingSave}
		onRemove={handleTrainingRemove}
		onClose={() => (editingTrainingStep = null)}
		canBeExempted={editingTrainingStep.trainingType.canBeExempted}
		isExempt={editingTrainingStep.trainingType.canBeExempted &&
			editingTrainingStep.trainingType.exemptPersonnelIds.includes(editingTrainingStep.person.id)}
		onToggleExempt={handleTrainingToggleExempt}
	/>
{/if}

<style>
	.page {
		height: 100%;
		display: flex;
		flex-direction: column;
		background: var(--color-bg);
	}

	.no-permission {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 300px;
		text-align: center;
		color: var(--color-text-muted);
	}
	.no-permission h2 {
		font-size: var(--font-size-lg);
		margin-bottom: var(--spacing-sm);
		color: var(--color-text);
	}

	/* Filter toggle */
	.filter-toggle {
		display: flex;
		align-items: center;
	}

	.filter-btn {
		padding: var(--spacing-xs) var(--spacing-sm);
		font-size: var(--font-size-sm);
		border: 1px solid var(--color-border);
		background: var(--color-surface);
		color: var(--color-text);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.filter-btn:first-child {
		border-radius: var(--radius-md) 0 0 var(--radius-md);
	}

	.filter-btn:last-child {
		border-radius: 0 var(--radius-md) var(--radius-md) 0;
		border-left: none;
	}

	.filter-btn:hover {
		background: var(--color-bg);
	}

	.filter-btn.active {
		background: #b8943e;
		border-color: #b8943e;
		color: #0f0f0f;
	}

	.btn-ghost {
		background: none;
		border: none;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		font-weight: 500;
		padding: var(--spacing-xs) var(--spacing-sm);
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition: all 0.15s;
	}

	.btn-ghost:hover {
		color: var(--color-text);
		background: var(--color-surface-variant);
	}

	.warning-banner {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
		padding: var(--spacing-sm) var(--spacing-lg);
		background: rgba(245, 158, 11, 0.1);
		border: 1px solid #f59e0b;
		border-radius: var(--radius-md);
		color: #f59e0b;
		font-size: var(--font-size-sm);
		margin-bottom: var(--spacing-md);
	}

	.warning-banner span {
		flex: 1;
	}

	.error-banner {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
		padding: var(--spacing-sm) var(--spacing-lg);
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid var(--color-error);
		border-radius: var(--radius-md);
		color: var(--color-error);
		font-size: var(--font-size-sm);
		margin-bottom: var(--spacing-md);
	}

	.error-banner span {
		flex: 1;
	}

	/* .page-content base + mobile in app.css */

	/* Onboarding list */
	.onboarding-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	/* Onboarding card */
	.onboarding-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		overflow: hidden;
		transition: box-shadow 0.15s ease;
	}

	.onboarding-card:hover {
		box-shadow: var(--shadow-2);
	}

	.onboarding-card.expanded {
		border-color: #b8943e;
	}

	.card-summary {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
		width: 100%;
		padding: var(--spacing-md) var(--spacing-lg);
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		color: var(--color-text);
	}

	.card-summary:hover {
		background: rgba(184, 148, 62, 0.04);
	}

	.card-main {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		flex: 1;
		min-width: 0;
	}

	.expand-icon {
		font-size: 10px;
		width: 14px;
		flex-shrink: 0;
		color: var(--color-text-muted);
	}

	.card-info {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.person-name {
		font-weight: 600;
		font-size: var(--font-size-base);
		color: var(--color-text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.started-date {
		font-family: var(--font-mono);
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}

	.card-progress {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		flex-shrink: 0;
		min-width: 180px;
	}

	.progress-bar {
		flex: 1;
		height: 6px;
		background: var(--color-surface-variant);
		border-radius: var(--radius-full);
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		border-radius: var(--radius-full);
		transition: width 0.3s ease;
	}

	.progress-text {
		font-family: var(--font-mono);
		font-size: var(--font-size-xs);
		color: var(--color-text-secondary);
		white-space: nowrap;
	}

	.card-status {
		flex-shrink: 0;
	}

	/* Expanded detail */
	.card-detail {
		border-top: 1px solid var(--color-divider);
		padding: var(--spacing-md) var(--spacing-lg);
	}

	.detail-actions {
		display: flex;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-md);
		justify-content: flex-end;
		flex-wrap: wrap;
	}

	.sync-btn {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
	}

	.sync-icon {
		width: 14px;
		height: 14px;
		flex-shrink: 0;
	}

	/* Step list */
	.step-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.step-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		background: var(--color-bg);
		transition: background 0.1s ease;
	}

	.step-row.step-complete {
		opacity: 0.7;
	}

	.step-row.step-deprecated {
		opacity: 0.65;
		background: var(--color-surface-variant);
	}

	.step-main {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		flex: 1;
		min-width: 0;
	}

	.step-name {
		font-size: var(--font-size-sm);
		font-weight: 500;
		color: var(--color-text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.deprecated-note {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		font-style: italic;
	}

	.step-status {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		margin-left: auto;
		flex-shrink: 0;
	}

	/* Checkbox toggle */
	.checkbox-toggle {
		width: 22px;
		height: 22px;
		border: 2px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-surface);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		transition: all 0.15s ease;
	}

	.checkbox-toggle:hover {
		border-color: #b8943e;
	}

	.checkbox-toggle.checked {
		background: var(--color-success);
		border-color: var(--color-success);
	}

	.checkbox-toggle svg {
		width: 14px;
		height: 14px;
		color: white;
	}

	/* Status icons */
	.status-icon {
		font-size: var(--font-size-base);
		font-weight: 700;
		color: var(--color-text-muted);
	}

	.status-icon.complete {
		color: var(--color-success);
	}

	.status-icon.incomplete {
		color: var(--color-error);
	}

	/* Training status button (clickable in edit mode) */
	.training-status-btn {
		font-size: var(--font-size-base);
		font-weight: 700;
		color: var(--color-text-muted);
		background: none;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.training-status-btn:hover {
		border-color: #b8943e;
		background: rgba(184, 148, 62, 0.08);
	}

	.training-status-btn.complete {
		color: var(--color-success);
	}

	.training-status-btn.incomplete {
		color: var(--color-error);
	}

	/* Stage indicator */
	.stage-indicator {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
	}

	.stage-arrow {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		padding: 0;
		background: none;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
		cursor: pointer;
		transition: all var(--transition-fast);
	}

	.stage-arrow:hover:not(:disabled) {
		background: var(--color-surface-variant);
		border-color: #b8943e;
		color: #b8943e;
	}

	.stage-arrow:disabled {
		opacity: 0.25;
		cursor: default;
	}

	.stage-arrow svg {
		width: 14px;
		height: 14px;
	}

	.stage-text {
		font-family: var(--font-mono);
		font-size: var(--font-size-xs);
		color: var(--color-text-secondary);
		white-space: nowrap;
	}

	.stage-count {
		color: var(--color-text-muted);
	}

	/* Notes toggle */
	.notes-toggle {
		display: flex;
		align-items: center;
		gap: 2px;
		padding: var(--spacing-xs);
		background: none;
		border: none;
		color: var(--color-text-muted);
		cursor: pointer;
		border-radius: var(--radius-sm);
		transition: all 0.15s ease;
		flex-shrink: 0;
	}

	.notes-toggle:hover {
		background: var(--color-surface-variant);
		color: var(--color-text);
	}

	.notes-icon {
		width: 16px;
		height: 16px;
	}

	.notes-count {
		font-family: var(--font-mono);
		font-size: var(--font-size-xs);
		font-weight: 600;
		color: #b8943e;
	}

	/* Step notes */
	.step-notes {
		width: 100%;
		margin-top: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-md);
		background: var(--color-surface);
		border-radius: var(--radius-md);
		border: 1px solid var(--color-divider);
	}

	.note-input-row {
		display: flex;
		gap: var(--spacing-xs);
		margin-bottom: var(--spacing-sm);
	}

	.note-input {
		flex: 1;
		font-size: var(--font-size-sm);
	}

	.no-notes {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		font-style: italic;
		padding: var(--spacing-xs) 0;
	}

	.notes-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
		max-height: 200px;
		overflow-y: auto;
	}

	.note-item {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: var(--spacing-sm);
		padding: var(--spacing-xs) 0;
		border-bottom: 1px solid var(--color-divider);
	}

	.note-item:last-child {
		border-bottom: none;
	}

	.note-text {
		font-size: var(--font-size-sm);
		color: var(--color-text);
		flex: 1;
		line-height: 1.4;
	}

	.note-time {
		font-family: var(--font-mono);
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		white-space: nowrap;
		flex-shrink: 0;
	}

	/* Assign template modal */
	.assign-desc {
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		margin-bottom: var(--spacing-md);
		line-height: 1.5;
	}

	.error-text {
		font-size: var(--font-size-sm);
		color: var(--color-error);
		margin-top: var(--spacing-xs);
	}

	/* Mobile Responsive Styles */
	@media (max-width: 640px) {
		.page {
			margin-left: 0;
		}

		.page-header.mobile-only {
			display: flex;
		}

		.toolbar-header {
			flex-direction: column;
			align-items: flex-start;
			gap: var(--spacing-sm);
			padding: var(--spacing-sm) var(--spacing-md);
		}

		.toolbar-header h2 {
			display: none;
		}

		.toolbar-actions {
			width: 100%;
			flex-wrap: wrap;
		}

		.card-summary {
			flex-wrap: wrap;
			padding: var(--spacing-sm) var(--spacing-md);
			gap: var(--spacing-sm);
		}

		.card-main {
			width: 100%;
		}

		.card-progress {
			min-width: 0;
			flex: 1;
		}

		.card-detail {
			padding: var(--spacing-sm) var(--spacing-md);
		}

		.step-main {
			flex-wrap: wrap;
		}

		.stage-indicator {
			width: 100%;
			margin-top: var(--spacing-xs);
		}

		.note-input-row {
			flex-direction: column;
		}
	}
</style>
