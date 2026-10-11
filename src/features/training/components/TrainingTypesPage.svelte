<script lang="ts">
	import { tick } from 'svelte';
	import { DEFAULT_TRAINING_TYPE_COLOR, type TrainingPageAccess } from '../contracts';
	import { ArrowDown, ArrowUp, Trash2 } from '@lucide/svelte';
	import * as Empty from '$lib/components/ui/empty';
	import * as Field from '$lib/components/ui/field';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import * as RadioGroup from '$lib/components/ui/radio-group';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as TypeWorkspace from '$lib/components/patterns/type-management-workspace';
	import * as WorkspaceToolbar from '$lib/components/patterns/workspace-toolbar';
	import { ConfirmDialog } from '$lib/components/ui/confirm-dialog';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import type { Personnel } from '$features/personnel/contracts';
	import type { RankCatalogEntry } from '$features/personnel/contracts';
	import { rankCodesForOptions } from '$features/personnel/contracts';
	import { createRosterReadModel } from '$features/personnel/contracts';
	import { rosterStore } from '$features/personnel';
	import { trainingRankCatalogStore } from '$features/training/stores/rankCatalog.svelte';
	import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
	import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';
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

	let {
		data,
		org
	}: {
		data: {
			[key: string]: unknown;
			training?: { data?: Partial<import('../contracts').TrainingWorkspaceData> };
			personnel?: Personnel[];
		};
		org: TrainingPageAccess;
	} = $props();

	const configureAffordance = $derived(
		org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.training.configureRequirements, { kind: 'organization' })
	);
	const canMutate = $derived(configureAffordance.allowed);
	const workspaceData = $derived(data.training?.data);

	let selectedTypeId: string | null = $state(null);
	let editing = $state(false);
	let creating = $state(false);
	let saving = $state(false);
	let error = $state('');
	let mobileDetailOpen = $state(false);
	let confirmDelete: { id: string; name: string } | null = $state(null);
	let typeList = $state<ReturnType<typeof TypeWorkspace.ItemList>>();

	let editName = $state('');
	let editDescription = $state('');
	let editColor = $state(DEFAULT_TRAINING_TYPE_COLOR);
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
	const selectedType = $derived(
		creating
			? null
			: (selectedTypeId ? (types.find((t) => t.id === selectedTypeId) ?? null) : null) || orderedTypes[0] || null
	);

	const fallbackPersonnel = $derived(
		Array.isArray(workspaceData?.personnel)
			? workspaceData.personnel
			: Array.isArray(data.personnel)
				? data.personnel
				: []
	);
	const personnel = $derived(
		rosterStore.orgId === org.orgId
			? rosterStore.readModel().full({ status: 'active' }).flatPersonnel
			: createRosterReadModel({ personnel: fallbackPersonnel }).full({ status: 'active' }).flatPersonnel
	);

	const availableRoles = $derived(
		[...new Set(personnel.map((p: { clinicRole: string }) => p.clinicRole))].filter(Boolean).sort() as string[]
	);

	const availableMos = $derived(
		[...new Set(personnel.map((p: { mos: string }) => p.mos))].filter(Boolean).sort() as string[]
	);

	const routeRankCatalog = $derived(
		Array.isArray(workspaceData?.rankCatalog) ? (workspaceData.rankCatalog as RankCatalogEntry[]) : undefined
	);
	const rankCatalog = $derived(
		routeRankCatalog ??
			(trainingRankCatalogStore.orgId === org.orgId
				? (trainingRankCatalogStore.items as RankCatalogEntry[])
				: undefined)
	);
	const preservedApplicabilityRanks = $derived(
		creating || editing
			? [...editAppliesToRanks, ...editExcludedRanks]
			: selectedType
				? [...selectedType.appliesToRanks, ...selectedType.excludedRanks]
				: []
	);
	const availableRanks = $derived(
		rankCodesForOptions({
			rankCatalog,
			observedRanks: personnel.map((p: { rank: string }) => p.rank),
			preserveRanks: preservedApplicabilityRanks
		})
	);

	function selectType(id: string) {
		if (editing || creating) return;
		selectedTypeId = id;
		mobileDetailOpen = true;
	}

	function startEdit() {
		if (!selectedType || !canMutate) return;
		error = '';
		mobileDetailOpen = true;
		selectedTypeId = selectedType.id;
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
		const wasCreating = creating;
		editing = false;
		creating = false;
		saving = false;
		error = '';
		if (wasCreating) mobileDetailOpen = false;
	}

	function startCreate() {
		if (!canMutate) return;
		error = '';
		mobileDetailOpen = true;
		selectedTypeId = null;
		editName = '';
		editDescription = '';
		editColor = DEFAULT_TRAINING_TYPE_COLOR;
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
		error = '';
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
				if (!newType) {
					error = 'Failed to save training type.';
					return;
				}
				selectedTypeId = newType.id;
				creating = false;
				mobileDetailOpen = true;
				editing = false;
				saving = false;
				await tick();
				typeList?.focusSelected();
			} else if (selectedTypeId) {
				if (!(await trainingTypesStore.update(selectedTypeId, payload))) {
					error = 'Failed to save training type.';
					return;
				}
			}
			editing = false;
		} catch {
			error = 'Failed to save training type.';
		} finally {
			saving = false;
		}
	}

	async function deleteType(id: string) {
		if ((await trainingTypesStore.remove(id)) === 'deleted') {
			personnelTrainingsStore.removeByTrainingTypeLocal(id);
		}
		if (selectedTypeId === id) selectedTypeId = null;
		mobileDetailOpen = false;
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

	function closeMobileDetail() {
		if (creating || editing) {
			cancelEdit();
		}
		mobileDetailOpen = false;
	}

	const typeActionDisabled = $derived(creating || editing);
</script>

<TypeWorkspace.Root aria-label="Training type management workspace" class="overflow-hidden">
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

	<TypeWorkspace.Layout>
		<TypeWorkspace.List mobileHidden={mobileDetailOpen || creating || editing}>
			{#if orderedTypes.length === 0 && !creating}
				<Empty.Root>
					<Empty.Header>
						<Empty.Title level={3}>No training types yet.</Empty.Title>
						<Empty.Description>Create one to get started.</Empty.Description>
					</Empty.Header>
					{#if canMutate}
						<Empty.Content>
							<Button type="button" onclick={startCreate}>+ New Type</Button>
						</Empty.Content>
					{/if}
				</Empty.Root>
			{:else}
				<TypeWorkspace.ItemList bind:this={typeList} aria-label="Training types">
					{#each orderedTypes as type, i (type.id)}
						<TypeWorkspace.ListItem
							selected={selectedType?.id === type.id && !creating}
							color={type.color}
							title={type.name}
							description={getTypeSummaryLine(type)}
							onselect={() => selectType(type.id)}
							disabled={editing || creating}
						>
							{#snippet actions()}
								{#if canMutate && !editing && !creating}
									<Button
										variant="outline"
										size="icon"
										type="button"
										onclick={() => moveUp(i)}
										disabled={i === 0}
										aria-label={`Move ${type.name} up`}
									>
										<ArrowUp aria-hidden="true" />
									</Button>
									<Button
										variant="outline"
										size="icon"
										type="button"
										onclick={() => moveDown(i)}
										disabled={i === orderedTypes.length - 1}
										aria-label={`Move ${type.name} down`}
									>
										<ArrowDown aria-hidden="true" />
									</Button>
								{/if}
							{/snippet}
						</TypeWorkspace.ListItem>
					{/each}
				</TypeWorkspace.ItemList>
			{/if}
		</TypeWorkspace.List>

		<TypeWorkspace.Detail
			mobileHidden={!mobileDetailOpen && !creating && !editing}
			class={creating || editing ? 'flex flex-col overflow-hidden pr-0' : undefined}
		>
			{#if creating || editing || selectedType}
				<TypeWorkspace.MobileBack onclick={closeMobileDetail}>Training types</TypeWorkspace.MobileBack>
			{/if}

			{#if creating || editing}
				<div class="grid min-h-0 flex-1 gap-6 overflow-y-auto pr-2 pb-8 [scrollbar-gutter:stable]">
					<TypeWorkspace.DetailHeader title={creating ? 'New Training Type' : 'Edit Training Type'} />

					<TypeWorkspace.FormSection title="Basics" class="sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-end">
						<Field.Root>
							<Field.Label for="type-name">Name</Field.Label>
							<Input id="type-name" type="text" bind:value={editName} placeholder="e.g. First Aid" />
							{#if error}
								<Field.Error>{error}</Field.Error>
							{/if}
						</Field.Root>
						<Field.Root>
							<Field.Label for="type-color">Color</Field.Label>
							<TypeWorkspace.ColorInput id="type-color" bind:value={editColor} />
						</Field.Root>
						<Field.Root class="sm:col-span-2">
							<Field.Label for="type-desc">Description</Field.Label>
							<Textarea id="type-desc" rows={2} bind:value={editDescription} placeholder="Optional description" />
						</Field.Root>
					</TypeWorkspace.FormSection>

					<TypeWorkspace.FormSection title="Expiration">
						<RadioGroup.Root bind:value={editExpirationMode} class="md:grid-cols-[1fr_0.8fr_1.2fr]">
							{#each ['fixed', 'never', 'date-only'] as const as mode (mode)}
								<TypeWorkspace.Choice>
									<label for="expiration-{mode}" class="flex min-h-10 cursor-pointer items-center gap-3 text-sm">
										<RadioGroup.Item id="expiration-{mode}" value={mode} aria-label={getExpirationLabel(mode)} />
										<span>{getExpirationLabel(mode)}</span>
									</label>
								</TypeWorkspace.Choice>
							{/each}
						</RadioGroup.Root>
						{#if editExpirationMode === 'fixed'}
							<Field.Root>
								<Field.Label for="exp-months">Months until expiration</Field.Label>
								<Input id="exp-months" type="number" min="1" max="120" bind:value={editExpirationMonths} />
							</Field.Root>
						{/if}
					</TypeWorkspace.FormSection>

					{#if editExpirationMode !== 'never'}
						<TypeWorkspace.FormSection title="Warning Thresholds" layout="two-column">
							<Field.Root>
								<Field.Label for="warn-yellow">Yellow warning (days)</Field.Label>
								<Input id="warn-yellow" type="number" min="1" bind:value={editWarningYellow} />
							</Field.Root>
							<Field.Root>
								<Field.Label for="warn-orange">Orange warning (days)</Field.Label>
								<Input id="warn-orange" type="number" min="1" bind:value={editWarningOrange} />
							</Field.Root>
						</TypeWorkspace.FormSection>
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

					<TypeWorkspace.FormSection title="Options">
						<Field.Root orientation="horizontal">
							<Checkbox id="can-be-exempted" bind:checked={editCanBeExempted} />
							<Field.Label for="can-be-exempted">Can be exempted</Field.Label>
						</Field.Root>
					</TypeWorkspace.FormSection>
				</div>

				<TypeWorkspace.FooterActions class="shrink-0 bg-background py-3 pr-2">
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
					<TypeWorkspace.ActionSpacer />
					<Button variant="outline" size="sm" type="button" onclick={cancelEdit}>Cancel</Button>
					<Button size="sm" type="button" onclick={saveEdit} disabled={!editName.trim() || saving}>
						{#if saving}<Spinner />{/if}
						{creating ? 'Create' : 'Save'}
					</Button>
				</TypeWorkspace.FooterActions>
			{:else if selectedType}
				<TypeWorkspace.Stack>
					<TypeWorkspace.DetailHeader title={selectedType.name} color={selectedType.color}>
						{#snippet actions()}
							{#if canMutate}
								<Button variant="outline" size="sm" type="button" onclick={startEdit}>Edit</Button>
							{/if}
						{/snippet}
					</TypeWorkspace.DetailHeader>

					<TypeWorkspace.Description>
						{selectedType.description ?? 'No description has been added for this training type.'}
					</TypeWorkspace.Description>

					<TypeWorkspace.FactList>
						<TypeWorkspace.Fact label="Expiration">
							{getExpirationLabel(getExpirationMode(selectedType))}
						</TypeWorkspace.Fact>

						{#if getExpirationMode(selectedType) === 'fixed'}
							<TypeWorkspace.Fact label="Duration">{selectedType.expirationMonths} months</TypeWorkspace.Fact>
						{/if}

						{#if getExpirationMode(selectedType) !== 'never'}
							<TypeWorkspace.Fact label="Warning Thresholds">
								Yellow at {selectedType.warningDaysYellow} days, Orange at {selectedType.warningDaysOrange} days
							</TypeWorkspace.Fact>
						{/if}

						<TypeWorkspace.Fact label="Applies to">
							{formatApplicability(selectedType)}
						</TypeWorkspace.Fact>

						<TypeWorkspace.Fact label="Optional">
							{selectedType.isOptional
								? 'Yes. People without records are not treated as missing this type.'
								: 'No. Matching personnel are expected to have this training.'}
						</TypeWorkspace.Fact>

						<TypeWorkspace.Fact label="Can be exempted">
							{selectedType.canBeExempted ? 'Yes' : 'No'}
						</TypeWorkspace.Fact>

						<TypeWorkspace.Fact label="List order">
							{orderedTypes.findIndex((type) => type.id === selectedType.id) + 1} of {orderedTypes.length}
						</TypeWorkspace.Fact>
					</TypeWorkspace.FactList>

					{#if canMutate}
						<TypeWorkspace.FooterActions>
							<Button
								variant="destructive"
								size="sm"
								type="button"
								onclick={() => (confirmDelete = { id: selectedType.id, name: selectedType.name })}
							>
								Delete Type
							</Button>
						</TypeWorkspace.FooterActions>
					{/if}
				</TypeWorkspace.Stack>
			{:else}
				<Empty.Root>
					<Empty.Header>
						<Empty.Title level={3}>Select a training type</Empty.Title>
						<Empty.Description>Choose a type from the list to view details.</Empty.Description>
					</Empty.Header>
				</Empty.Root>
			{/if}
		</TypeWorkspace.Detail>
	</TypeWorkspace.Layout>
</TypeWorkspace.Root>

{#if confirmDelete}
	<ConfirmDialog
		title="Delete Training Type"
		message="Are you sure you want to delete '{confirmDelete.name}'? All associated training records will also be deleted. This cannot be undone."
		confirmLabel="Delete"
		variant="danger"
		onConfirm={() => {
			if (confirmDelete) return deleteType(confirmDelete.id);
		}}
		onCancel={() => (confirmDelete = null)}
	/>
{/if}
