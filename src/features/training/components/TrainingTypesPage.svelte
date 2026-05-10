<script lang="ts">
	import { ArrowDown, ArrowUp, Trash2 } from '@lucide/svelte';
	import * as Empty from '$lib/components/ui/empty';
	import * as Field from '$lib/components/ui/field';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import * as RadioGroup from '$lib/components/ui/radio-group';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as WorkflowPanel from '$lib/components/ui/workflow-panel';
	import * as WorkspaceToolbar from '$lib/components/ui/workspace-toolbar';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import { personnelStore } from '$features/personnel/stores/personnel.svelte';
	import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
	import {
		getExpirationMode,
		toExpirationFields,
		formatApplicability,
		getTypeSummaryLine,
		type ExpirationMode
	} from '$features/training/utils/trainingTypeDisplay';
	import ApplicabilityEditor from './ApplicabilityEditor.svelte';
	import type { ApplicabilityFields } from './ApplicabilityEditor.svelte';
	import type { TrainingType } from '$features/training/training.types';

	let { data } = $props();

	const org = getOrgContext();
	const configureAffordance = $derived(
		org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.training.configureRequirements, { kind: 'unscoped' })
	);
	const canMutate = $derived(configureAffordance.allowed);
	const workspaceData = $derived(data.training?.data);

	let selectedTypeId: string | null = $state(null);
	let editing = $state(false);
	let creating = $state(false);
	let saving = $state(false);
	let confirmDelete: { id: string; name: string } | null = $state(null);

	let editName = $state('');
	let editDescription = $state('');
	let editColor = $state('#6b7280');
	let editExpirationMode: ExpirationMode = $state('never');
	let editExpirationMonths = $state<number | null>(12);
	let editWarningYellow = $state(60);
	let editWarningOrange = $state(30);
	let editAppliesToRoles = $state<string[]>([]);
	let editAppliesToMos = $state<string[]>([]);
	let editAppliesToRanks = $state<string[]>([]);
	let editExcludedRoles = $state<string[]>([]);
	let editExcludedMos = $state<string[]>([]);
	let editExcludedRanks = $state<string[]>([]);
	let editCanBeExempted = $state(false);
	let editIsOptional = $state(false);

	const types = $derived(trainingTypesStore.items);
	const orderedTypes = $derived([...types].sort((a, b) => a.sortOrder - b.sortOrder));
	const selectedType = $derived(selectedTypeId ? (types.find((t) => t.id === selectedTypeId) ?? null) : null);

	const personnel = $derived(
		personnelStore.orgId === org.orgId
			? personnelStore.items
			: Array.isArray(workspaceData?.personnel)
				? workspaceData.personnel
				: Array.isArray(data.personnel)
					? data.personnel
					: []
	);

	const availableRoles = $derived(
		[...new Set(personnel.map((p: { clinicRole: string }) => p.clinicRole))].filter(Boolean).sort() as string[]
	);

	const availableMos = $derived(
		[...new Set(personnel.map((p: { mos: string }) => p.mos))].filter(Boolean).sort() as string[]
	);

	const availableRanks = $derived(
		[...new Set(personnel.map((p: { rank: string }) => p.rank))].filter(Boolean).sort() as string[]
	);

	function selectType(id: string) {
		if (editing || creating) return;
		selectedTypeId = id;
	}

	function startEdit() {
		if (!selectedType || !canMutate) return;
		editName = selectedType.name;
		editDescription = selectedType.description ?? '';
		editColor = selectedType.color;
		editExpirationMode = getExpirationMode(selectedType);
		editExpirationMonths = selectedType.expirationMonths ?? 12;
		editWarningYellow = selectedType.warningDaysYellow;
		editWarningOrange = selectedType.warningDaysOrange;
		editAppliesToRoles = [...selectedType.appliesToRoles];
		editAppliesToMos = [...selectedType.appliesToMos];
		editAppliesToRanks = [...selectedType.appliesToRanks];
		editExcludedRoles = [...selectedType.excludedRoles];
		editExcludedMos = [...selectedType.excludedMos];
		editExcludedRanks = [...selectedType.excludedRanks];
		editCanBeExempted = selectedType.canBeExempted;
		editIsOptional = selectedType.isOptional;
		editing = true;
	}

	function cancelEdit() {
		editing = false;
		creating = false;
		saving = false;
	}

	function startCreate() {
		if (!canMutate) return;
		selectedTypeId = null;
		editName = '';
		editDescription = '';
		editColor = '#6b7280';
		editExpirationMode = 'fixed';
		editExpirationMonths = 12;
		editWarningYellow = 60;
		editWarningOrange = 30;
		editAppliesToRoles = [];
		editAppliesToMos = [];
		editAppliesToRanks = [];
		editExcludedRoles = [];
		editExcludedMos = [];
		editExcludedRanks = [];
		editCanBeExempted = false;
		editIsOptional = false;
		creating = true;
		editing = false;
	}

	async function saveEdit() {
		if (!editName.trim() || saving) return;
		saving = true;
		try {
			const expirationFields = toExpirationFields(
				editExpirationMode,
				editExpirationMode === 'fixed' ? editExpirationMonths : null
			);
			const payload = {
				name: editName.trim(),
				description: editDescription.trim() || null,
				color: editColor,
				...expirationFields,
				warningDaysYellow: editExpirationMode === 'never' ? 60 : editWarningYellow,
				warningDaysOrange: editExpirationMode === 'never' ? 30 : editWarningOrange,
				appliesToRoles: editAppliesToRoles,
				appliesToMos: editAppliesToMos,
				appliesToRanks: editAppliesToRanks,
				excludedRoles: editExcludedRoles,
				excludedMos: editExcludedMos,
				excludedRanks: editExcludedRanks,
				canBeExempted: editCanBeExempted,
				isOptional: editIsOptional
			};

			if (creating) {
				const newType = await trainingTypesStore.add({
					...payload,
					sortOrder: orderedTypes.length,
					exemptPersonnelIds: []
				} as Omit<TrainingType, 'id'>);
				if (newType) selectedTypeId = newType.id;
				creating = false;
			} else if (selectedTypeId) {
				await trainingTypesStore.update(selectedTypeId, payload);
			}
			editing = false;
		} finally {
			saving = false;
		}
	}

	async function deleteType(id: string) {
		await trainingTypesStore.remove(id);
		if (selectedTypeId === id) selectedTypeId = null;
		confirmDelete = null;
	}

	async function moveUp(index: number) {
		if (index === 0) return;
		const current = orderedTypes[index];
		const above = orderedTypes[index - 1];
		await Promise.all([
			trainingTypesStore.update(current.id, { sortOrder: above.sortOrder }),
			trainingTypesStore.update(above.id, { sortOrder: current.sortOrder })
		]);
	}

	async function moveDown(index: number) {
		if (index === orderedTypes.length - 1) return;
		await moveUp(index + 1);
	}

	function handleApplicabilityChange(fields: ApplicabilityFields) {
		editAppliesToRoles = fields.appliesToRoles;
		editAppliesToMos = fields.appliesToMos;
		editAppliesToRanks = fields.appliesToRanks;
		editExcludedRoles = fields.excludedRoles;
		editExcludedMos = fields.excludedMos;
		editExcludedRanks = fields.excludedRanks;
		editIsOptional = fields.isOptional;
	}

	function getExpirationLabel(mode: ExpirationMode): string {
		switch (mode) {
			case 'fixed':
				return 'Expires after a set number of months';
			case 'never':
				return 'Never expires';
			case 'date-only':
				return 'Expiration date varies per person';
		}
	}

	const typeActionDisabled = $derived(creating || editing);
</script>

<main class="flex h-full min-h-0 flex-col gap-3 bg-background p-2">
	<WorkspaceToolbar.Root ariaLabel="Training type controls">
		{#if canMutate}
			<WorkspaceToolbar.Group label="Training type actions" zone="actions">
				<Button
					type="button"
					onclick={startCreate}
					disabled={typeActionDisabled}
					title={typeActionDisabled ? 'Finish the current edit first' : undefined}
				>
					+ New Type
				</Button>
			</WorkspaceToolbar.Group>
		{/if}
	</WorkspaceToolbar.Root>

	<WorkflowPanel.Grid class="min-h-0 flex-1 lg:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)]">
		<section class="min-h-0 overflow-y-auto">
			{#if orderedTypes.length === 0 && !creating}
				<Empty.Root>
					<Empty.Header>
						<Empty.Title>No training types yet.</Empty.Title>
						<Empty.Description>Create one to get started.</Empty.Description>
					</Empty.Header>
					{#if canMutate}
						<Empty.Content>
							<Button type="button" onclick={startCreate}>+ New Type</Button>
						</Empty.Content>
					{/if}
				</Empty.Root>
			{:else}
				<ul class="grid gap-2" role="listbox" aria-label="Training types">
					{#each orderedTypes as type, i (type.id)}
						<li>
							<WorkflowPanel.Item
								selected={selectedTypeId === type.id && !creating}
								role="option"
								aria-selected={selectedTypeId === type.id && !creating}
								class="flex items-center gap-2 p-2"
							>
								<button
									type="button"
									class="flex min-w-0 flex-1 items-center gap-3 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
									onclick={() => selectType(type.id)}
									disabled={editing || creating}
								>
									<span class="size-3 shrink-0 rounded-sm" style:background-color={type.color}></span>
									<span class="grid min-w-0 gap-1">
										<span class="truncate text-sm font-semibold text-foreground">{type.name}</span>
										<span class="truncate text-xs text-muted-foreground">{getTypeSummaryLine(type)}</span>
									</span>
								</button>
								{#if canMutate && !editing && !creating}
									<div class="ml-auto flex shrink-0 items-center gap-1" role="toolbar" tabindex="-1">
										<Button
											variant="outline"
											size="icon"
											type="button"
											onclick={() => moveUp(i)}
											disabled={i === 0}
											aria-label="Move up"
										>
											<ArrowUp aria-hidden="true" />
										</Button>
										<Button
											variant="outline"
											size="icon"
											type="button"
											onclick={() => moveDown(i)}
											disabled={i === orderedTypes.length - 1}
											aria-label="Move down"
										>
											<ArrowDown aria-hidden="true" />
										</Button>
									</div>
								{/if}
							</WorkflowPanel.Item>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="min-h-0 overflow-y-auto">
			{#if creating || editing}
				<div class="grid gap-5 pb-8">
					<WorkflowPanel.Header>
						<WorkflowPanel.Title>{creating ? 'New Training Type' : 'Edit Training Type'}</WorkflowPanel.Title>
					</WorkflowPanel.Header>

					<Field.Set class="grid gap-3 rounded-lg border border-border bg-card p-4">
						<Field.Legend>Basics</Field.Legend>
						<Field.Root>
							<Field.Label for="type-name">Name</Field.Label>
							<Input id="type-name" type="text" bind:value={editName} placeholder="e.g. First Aid" />
						</Field.Root>
						<Field.Root>
							<Field.Label for="type-desc">Description</Field.Label>
							<Textarea id="type-desc" rows={2} bind:value={editDescription} placeholder="Optional description" />
						</Field.Root>
						<Field.Root>
							<Field.Label for="type-color">Color</Field.Label>
							<div class="flex items-center gap-3">
								<Input id="type-color" type="color" bind:value={editColor} class="h-10 w-16 p-1" />
								<span class="font-mono text-sm uppercase text-muted-foreground">{editColor}</span>
							</div>
						</Field.Root>
					</Field.Set>

					<Field.Set class="grid gap-3 rounded-lg border border-border bg-card p-4">
						<Field.Legend>Expiration</Field.Legend>
						<RadioGroup.Root bind:value={editExpirationMode}>
							{#each ['fixed', 'never', 'date-only'] as const as mode (mode)}
								<Field.Root orientation="horizontal" class="rounded-lg border border-border bg-background p-3">
									<RadioGroup.Item id="expiration-{mode}" value={mode} />
									<Field.Label for="expiration-{mode}">{getExpirationLabel(mode)}</Field.Label>
								</Field.Root>
							{/each}
						</RadioGroup.Root>
						{#if editExpirationMode === 'fixed'}
							<Field.Root>
								<Field.Label for="exp-months">Months until expiration</Field.Label>
								<Input
									id="exp-months"
									type="number"
									min="1"
									max="120"
									bind:value={editExpirationMonths}
									class="max-w-28"
								/>
							</Field.Root>
						{/if}
					</Field.Set>

					{#if editExpirationMode !== 'never'}
						<Field.Set class="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2">
							<Field.Legend>Warning Thresholds</Field.Legend>
							<Field.Root>
								<Field.Label for="warn-yellow">Yellow warning (days)</Field.Label>
								<Input id="warn-yellow" type="number" min="1" bind:value={editWarningYellow} />
							</Field.Root>
							<Field.Root>
								<Field.Label for="warn-orange">Orange warning (days)</Field.Label>
								<Input id="warn-orange" type="number" min="1" bind:value={editWarningOrange} />
							</Field.Root>
						</Field.Set>
					{/if}

					{#key selectedTypeId ?? 'new-training-type'}
						<ApplicabilityEditor
							appliesToRoles={editAppliesToRoles}
							appliesToMos={editAppliesToMos}
							appliesToRanks={editAppliesToRanks}
							excludedRoles={editExcludedRoles}
							excludedMos={editExcludedMos}
							excludedRanks={editExcludedRanks}
							isOptional={editIsOptional}
							{availableRoles}
							{availableMos}
							{availableRanks}
							onchange={handleApplicabilityChange}
						/>
					{/key}

					<Field.Set class="grid gap-3 rounded-lg border border-border bg-card p-4">
						<Field.Legend>Options</Field.Legend>
						<Field.Root orientation="horizontal">
							<Checkbox id="can-be-exempted" bind:checked={editCanBeExempted} />
							<Field.Label for="can-be-exempted">Can be exempted</Field.Label>
						</Field.Root>
					</Field.Set>

					<div class="flex items-center gap-3 border-t border-border pt-4">
						{#if !creating && selectedTypeId && canMutate}
							<Button
								variant="destructive"
								size="sm"
								type="button"
								onclick={() => (confirmDelete = selectedType ? { id: selectedType.id, name: selectedType.name } : null)}
							>
								<Trash2 aria-hidden="true" />
								Delete
							</Button>
						{/if}
						<div class="flex-1"></div>
						<Button variant="outline" size="sm" type="button" onclick={cancelEdit}>Cancel</Button>
						<Button size="sm" type="button" onclick={saveEdit} disabled={!editName.trim() || saving}>
							{#if saving}<Spinner class="size-3" />{/if}
							{creating ? 'Create' : 'Save'}
						</Button>
					</div>
				</div>
			{:else if selectedType}
				<div class="grid gap-5">
					<div class="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
						<div class="flex min-w-0 items-center gap-3">
							<span class="size-4 shrink-0 rounded-sm" style:background-color={selectedType.color}></span>
							<h3 class="truncate text-xl font-semibold text-foreground">{selectedType.name}</h3>
						</div>
						{#if canMutate}
							<Button variant="outline" size="sm" type="button" onclick={startEdit}>Edit</Button>
						{/if}
					</div>

					{#if selectedType.description}
						<p class="text-sm leading-relaxed text-muted-foreground">{selectedType.description}</p>
					{/if}

					<dl class="grid gap-3">
						<div class="rounded-lg border border-border bg-muted/30 p-3">
							<dt class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
								Expiration
							</dt>
							<dd class="mt-1 text-sm text-foreground">{getExpirationLabel(getExpirationMode(selectedType))}</dd>
						</div>

						{#if getExpirationMode(selectedType) === 'fixed'}
							<div class="rounded-lg border border-border bg-muted/30 p-3">
								<dt class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
									Duration
								</dt>
								<dd class="mt-1 text-sm text-foreground">{selectedType.expirationMonths} months</dd>
							</div>
						{/if}

						{#if getExpirationMode(selectedType) !== 'never'}
							<div class="rounded-lg border border-border bg-muted/30 p-3">
								<dt class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
									Warning Thresholds
								</dt>
								<dd class="mt-1 text-sm text-foreground">
									Yellow at {selectedType.warningDaysYellow} days, Orange at {selectedType.warningDaysOrange} days
								</dd>
							</div>
						{/if}

						<div class="rounded-lg border border-border bg-muted/30 p-3">
							<dt class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
								Applies to
							</dt>
							<dd class="mt-1 text-sm text-foreground">{formatApplicability(selectedType)}</dd>
						</div>

						<div class="rounded-lg border border-border bg-muted/30 p-3">
							<dt class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
								Can be exempted
							</dt>
							<dd class="mt-1 text-sm text-foreground">{selectedType.canBeExempted ? 'Yes' : 'No'}</dd>
						</div>
					</dl>

					{#if canMutate}
						<div class="border-t border-border pt-4">
							<Button
								variant="destructive"
								size="sm"
								type="button"
								onclick={() => (confirmDelete = { id: selectedType.id, name: selectedType.name })}
							>
								Delete Type
							</Button>
						</div>
					{/if}
				</div>
			{:else}
				<Empty.Root>
					<Empty.Header>
						<Empty.Title>Select a training type</Empty.Title>
						<Empty.Description>Choose a type from the list to view details.</Empty.Description>
					</Empty.Header>
				</Empty.Root>
			{/if}
		</section>
	</WorkflowPanel.Grid>
</main>

{#if confirmDelete}
	<ConfirmDialog
		title="Delete Training Type"
		message="Are you sure you want to delete '{confirmDelete.name}'? All associated training records will also be deleted. This cannot be undone."
		confirmLabel="Delete"
		variant="danger"
		onConfirm={() => {
			if (confirmDelete) deleteType(confirmDelete.id);
		}}
		onCancel={() => (confirmDelete = null)}
	/>
{/if}
