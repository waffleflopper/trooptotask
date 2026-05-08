<script lang="ts">
	import type { StatusType } from '$lib/types';
	import TypeManager from '$lib/components/ui/TypeManager.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import {
		DA6_AVAILABILITY_HELP,
		DA6_AVAILABILITY_TREATMENT_OPTIONS,
		DA6_TREATMENT_NONE,
		formatDa6AvailabilityTreatment,
		toDa6AvailabilityTreatment,
		type Da6AvailabilityTreatmentOption
	} from '$features/calendar/utils/da6AvailabilityTreatment';

	interface Props {
		statusTypes: StatusType[];
		onAdd: (data: Omit<StatusType, 'id'>) => void;
		onUpdate: (id: string, data: Partial<Omit<StatusType, 'id'>>) => void;
		onRemove: (id: string) => void;
		onClose: () => void;
	}

	let { statusTypes, onAdd, onUpdate, onRemove, onClose }: Props = $props();

	let newName = $state('');
	let newColor = $state('#6b7280');
	let newTextColor = $state('#ffffff');
	let newDa6Treatment = $state<Da6AvailabilityTreatmentOption>(DA6_TREATMENT_NONE);

	let editName = $state('');
	let editColor = $state('');
	let editTextColor = $state('');
	let editDa6Treatment = $state<Da6AvailabilityTreatmentOption>(DA6_TREATMENT_NONE);
</script>

<TypeManager
	items={statusTypes}
	title="Manage Status Types"
	noun="Status Type"
	titleId="status-manager-title"
	{onAdd}
	{onUpdate}
	{onRemove}
	{onClose}
	getAddData={() =>
		newName.trim()
			? {
					name: newName.trim(),
					color: newColor,
					textColor: newTextColor,
					da6AvailabilityTreatment: toDa6AvailabilityTreatment(newDa6Treatment),
					da6TreatmentReviewed: true
				}
			: null}
	resetAddForm={() => {
		newName = '';
		newColor = '#6b7280';
		newTextColor = '#ffffff';
		newDa6Treatment = DA6_TREATMENT_NONE;
	}}
	onEditStart={(s) => {
		editName = s.name;
		editColor = s.color;
		editTextColor = s.textColor;
		editDa6Treatment = s.da6AvailabilityTreatment ?? DA6_TREATMENT_NONE;
	}}
	getEditData={() =>
		editName.trim()
			? {
					name: editName.trim(),
					color: editColor,
					textColor: editTextColor,
					da6AvailabilityTreatment: toDa6AvailabilityTreatment(editDa6Treatment),
					da6TreatmentReviewed: true
				}
			: null}
	removeConfirmMessage={(s) =>
		`Remove "${s.name}"? All schedule entries using this status will also be removed. This cannot be undone.`}
>
	{#snippet addForm()}
		<div class="flex flex-wrap items-center gap-2 [&_.input]:min-w-[150px] [&_.input]:flex-1">
			<Input type="text" bind:value={newName} placeholder="Status name (e.g., Leave, TDY)" aria-label="Status name" />
			<div class="flex gap-2">
				<label class="text-muted-foreground flex flex-col items-center gap-0.5 text-[10px] uppercase">
					<span>Background</span>
					<input type="color" bind:value={newColor} class="h-8 w-8 cursor-pointer rounded-md border p-0" />
				</label>
				<label class="text-muted-foreground flex flex-col items-center gap-0.5 text-[10px] uppercase">
					<span>Text</span>
					<input type="color" bind:value={newTextColor} class="h-8 w-8 cursor-pointer rounded-md border p-0" />
				</label>
			</div>
			{#if newName.trim()}
				<Badge label={newName} color={newColor} textColor={newTextColor} />
			{/if}
			<div class="flex min-w-full flex-col gap-1 sm:min-w-[18rem]">
				<label
					class="text-muted-foreground inline-flex items-center gap-1 text-xs font-semibold uppercase"
					for="new-da6-treatment"
				>
					<span>Duty roster treatment</span>
					<span class="group relative inline-flex">
						<Button variant="outline" size="icon-xs" type="button" aria-label="Duty roster treatment help">
							<span aria-hidden="true">?</span>
						</Button>
						<span
							class="bg-popover text-popover-foreground pointer-events-none absolute bottom-[calc(100%+0.5rem)] left-1/2 z-50 w-[min(18rem,80vw)] -translate-x-1/2 rounded-md border p-2 text-xs leading-snug font-medium normal-case opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
							role="tooltip">{DA6_AVAILABILITY_HELP}</span
						>
					</span>
				</label>
				<NativeSelect id="new-da6-treatment" bind:value={newDa6Treatment} class="w-full">
					{#each DA6_AVAILABILITY_TREATMENT_OPTIONS as option (option.value)}
						<option value={option.value} disabled={option.disabled}>{option.label}</option>
					{/each}
				</NativeSelect>
			</div>
		</div>
	{/snippet}

	{#snippet itemDisplay(status)}
		<div class="flex flex-wrap items-center gap-2">
			<Badge label={status.name} color={status.color} textColor={status.textColor} />
			<span class="text-muted-foreground text-xs"
				>{formatDa6AvailabilityTreatment(status.da6AvailabilityTreatment)}</span
			>
		</div>
	{/snippet}

	{#snippet editForm()}
		<div class="flex flex-wrap items-center gap-2 [&_.input]:min-w-[150px] [&_.input]:flex-1">
			<Input type="text" bind:value={editName} placeholder="Status name" aria-label="Status name" />
			<div class="flex gap-2">
				<label class="text-muted-foreground flex flex-col items-center gap-0.5 text-[10px] uppercase">
					<span>BG</span>
					<input type="color" bind:value={editColor} class="h-8 w-8 cursor-pointer rounded-md border p-0" />
				</label>
				<label class="text-muted-foreground flex flex-col items-center gap-0.5 text-[10px] uppercase">
					<span>Text</span>
					<input type="color" bind:value={editTextColor} class="h-8 w-8 cursor-pointer rounded-md border p-0" />
				</label>
			</div>
			<Badge label={editName || 'Preview'} color={editColor} textColor={editTextColor} />
			<div class="flex min-w-full flex-col gap-1 sm:min-w-[18rem]">
				<label class="text-muted-foreground text-xs font-semibold uppercase" for="edit-da6-treatment"
					>Duty roster treatment</label
				>
				<NativeSelect id="edit-da6-treatment" bind:value={editDa6Treatment} class="w-full">
					{#each DA6_AVAILABILITY_TREATMENT_OPTIONS as option (option.value)}
						<option value={option.value} disabled={option.disabled}>{option.label}</option>
					{/each}
				</NativeSelect>
			</div>
		</div>
	{/snippet}
</TypeManager>
