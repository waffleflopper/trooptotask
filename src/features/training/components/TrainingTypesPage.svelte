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
	import * as TypeWorkspace from '$lib/components/ui/type-workspace';
	import * as WorkspaceToolbar from '$lib/components/ui/workspace-toolbar';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import { createRosterReadModel } from '$lib/domain/rosterReadModel';
	import { rosterStore } from '$lib/stores/roster.svelte';
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
	let mobileDetailOpen = $state(false);
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

	const availableRanks = $derived(
		[...new Set(personnel.map((p: { rank: string }) => p.rank))].filter(Boolean).sort() as string[]
	);

	function selectType(id: string) {
		if (editing || creating) return;
		selectedTypeId = id;
		mobileDetailOpen = true;
	}

	function startEdit() {
		if (!selectedType || !canMutate) return;
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
		if (wasCreating) mobileDetailOpen = false;
	}

	function startCreate() {
		if (!canMutate) return;
		mobileDetailOpen = true;
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
				mobileDetailOpen = true;
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
				<TypeWorkspace.ItemList role="listbox" aria-label="Training types">
					{#each orderedTypes as type, i (type.id)}
						<TypeWorkspace.ListItem
							selected={selectedType?.id === type.id && !creating}
							color={type.color}
							title={type.name}
							description={getTypeSummaryLine(type)}
							onselect={() => selectType(type.id)}
							disabled={editing || creating}
							role="option"
							aria-selected={selectedType?.id === type.id && !creating}
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

					<TypeWorkspace.Form title="Basics" class="sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-end">
						<Field.Root>
							<Field.Label for="type-name">Name</Field.Label>
							<Input id="type-name" type="text" bind:value={editName} placeholder="e.g. First Aid" />
						</Field.Root>
						<Field.Root>
							<Field.Label for="type-color">Color</Field.Label>
							<TypeWorkspace.ColorInput id="type-color" bind:value={editColor} />
						</Field.Root>
						<Field.Root class="sm:col-span-2">
							<Field.Label for="type-desc">Description</Field.Label>
							<Textarea id="type-desc" rows={2} bind:value={editDescription} placeholder="Optional description" />
						</Field.Root>
					</TypeWorkspace.Form>

					<TypeWorkspace.Form title="Expiration">
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
					</TypeWorkspace.Form>

					{#if editExpirationMode !== 'never'}
						<TypeWorkspace.Form title="Warning Thresholds" layout="two-column">
							<Field.Root>
								<Field.Label for="warn-yellow">Yellow warning (days)</Field.Label>
								<Input id="warn-yellow" type="number" min="1" bind:value={editWarningYellow} />
							</Field.Root>
							<Field.Root>
								<Field.Label for="warn-orange">Orange warning (days)</Field.Label>
								<Input id="warn-orange" type="number" min="1" bind:value={editWarningOrange} />
							</Field.Root>
						</TypeWorkspace.Form>
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

					<TypeWorkspace.Form title="Options">
						<Field.Root orientation="horizontal">
							<Checkbox id="can-be-exempted" bind:checked={editCanBeExempted} />
							<Field.Label for="can-be-exempted">Can be exempted</Field.Label>
						</Field.Root>
					</TypeWorkspace.Form>
				</div>

				<TypeWorkspace.Actions class="shrink-0 bg-background py-3 pr-2">
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
				</TypeWorkspace.Actions>
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
						<TypeWorkspace.Impact label="Expiration">
							{getExpirationLabel(getExpirationMode(selectedType))}
						</TypeWorkspace.Impact>

						{#if getExpirationMode(selectedType) === 'fixed'}
							<TypeWorkspace.Impact label="Duration">{selectedType.expirationMonths} months</TypeWorkspace.Impact>
						{/if}

						{#if getExpirationMode(selectedType) !== 'never'}
							<TypeWorkspace.Impact label="Warning Thresholds">
								Yellow at {selectedType.warningDaysYellow} days, Orange at {selectedType.warningDaysOrange} days
							</TypeWorkspace.Impact>
						{/if}

						<TypeWorkspace.Impact label="Applies to">
							{formatApplicability(selectedType)}
						</TypeWorkspace.Impact>

						<TypeWorkspace.Impact label="Optional">
							{selectedType.isOptional
								? 'Yes. People without records are not treated as missing this type.'
								: 'No. Matching personnel are expected to have this training.'}
						</TypeWorkspace.Impact>

						<TypeWorkspace.Impact label="Can be exempted">
							{selectedType.canBeExempted ? 'Yes' : 'No'}
						</TypeWorkspace.Impact>

						<TypeWorkspace.Impact label="List order">
							{orderedTypes.findIndex((type) => type.id === selectedType.id) + 1} of {orderedTypes.length}
						</TypeWorkspace.Impact>
					</TypeWorkspace.FactList>

					{#if canMutate}
						<TypeWorkspace.Actions>
							<Button
								variant="destructive"
								size="sm"
								type="button"
								onclick={() => (confirmDelete = { id: selectedType.id, name: selectedType.name })}
							>
								Delete Type
							</Button>
						</TypeWorkspace.Actions>
					{/if}
				</TypeWorkspace.Stack>
			{:else}
				<Empty.Root>
					<Empty.Header>
						<Empty.Title>Select a training type</Empty.Title>
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
			if (confirmDelete) deleteType(confirmDelete.id);
		}}
		onCancel={() => (confirmDelete = null)}
	/>
{/if}
