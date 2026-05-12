<script lang="ts">
	import type { AssignmentType } from '$lib/types';
	import { TypeManager } from '$lib/components/ui/type-manager';
	import { CalendarStatusBadge } from '$lib/components/ui/calendar-status-badge';
	import { Input } from '$lib/components/ui/input';
	import { NativeSelect } from '$lib/components/ui/native-select';

	interface Props {
		assignmentTypes: AssignmentType[];
		onAdd: (data: Omit<AssignmentType, 'id'>) => void;
		onUpdate: (id: string, data: Partial<Omit<AssignmentType, 'id'>>) => void;
		onRemove: (id: string) => void;
		onClose: () => void;
	}

	let { assignmentTypes, onAdd, onUpdate, onRemove, onClose }: Props = $props();

	let newName = $state('');
	let newShortName = $state('');
	let newAssignTo = $state<'personnel' | 'group'>('personnel');
	let newColor = $state('#3b82f6');

	let editName = $state('');
	let editShortName = $state('');
	let editAssignTo = $state<'personnel' | 'group'>('personnel');
	let editColor = $state('');
</script>

<TypeManager
	items={assignmentTypes}
	title="Manage Assignment Types"
	noun="Assignment Type"
	titleId="assign-types-title"
	width="560px"
	{onAdd}
	{onUpdate}
	{onRemove}
	{onClose}
	getAddData={() =>
		newName.trim() && newShortName.trim()
			? {
					name: newName.trim(),
					shortName: newShortName.trim().toUpperCase(),
					assignTo: newAssignTo,
					color: newColor,
					exemptPersonnelIds: [],
					showInDateHeader: false
				}
			: null}
	resetAddForm={() => {
		newName = '';
		newShortName = '';
		newAssignTo = 'personnel';
		newColor = '#3b82f6';
	}}
	onEditStart={(t) => {
		editName = t.name;
		editShortName = t.shortName;
		editAssignTo = t.assignTo;
		editColor = t.color;
	}}
	getEditData={() =>
		editName.trim() && editShortName.trim()
			? {
					name: editName.trim(),
					shortName: editShortName.trim().toUpperCase(),
					assignTo: editAssignTo,
					color: editColor
				}
			: null}
	removeConfirmMessage={(t) =>
		`Remove "${t.name}"? All assignments using this type will also be removed. This cannot be undone.`}
>
	{#snippet addForm()}
		<div class="flex flex-wrap items-center gap-2 [&_.input]:min-w-[150px] [&_.input]:flex-1">
			<Input type="text" bind:value={newName} placeholder="Full name (e.g., Staff Duty)" aria-label="Full name" />
			<Input
				type="text"
				class="max-w-20 uppercase"
				bind:value={newShortName}
				placeholder="Short (e.g., SD)"
				aria-label="Short name"
				maxlength={5}
			/>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<NativeSelect aria-label="Assign to" bind:value={newAssignTo} class="w-[160px]">
				<option value="personnel">Assign to Person</option>
				<option value="group">Assign to Group</option>
			</NativeSelect>
			<label class="text-muted-foreground flex flex-col items-center gap-0.5 text-[10px] uppercase">
				<span>Color</span>
				<input type="color" bind:value={newColor} class="h-8 w-8 cursor-pointer rounded-md border p-0" />
			</label>
			{#if newName.trim() && newShortName.trim()}
				<CalendarStatusBadge
					statusType={{
						id: 'new-assignment-type',
						name: newShortName.toUpperCase() || '?',
						color: newColor,
						textColor: '#ffffff'
					}}
					class="font-mono font-bold tracking-widest uppercase"
				>
					{newShortName.toUpperCase() || '?'}
				</CalendarStatusBadge>
			{/if}
		</div>
		<p class="text-muted-foreground mt-2 text-xs leading-relaxed">
			<strong>Assign to Person:</strong> Shows on individual's calendar row (e.g., MOD, CQ)<br />
			<strong>Assign to Group:</strong> Shows in date header column (e.g., Front Desk duty group)
		</p>
	{/snippet}

	{#snippet itemDisplay(type)}
		<CalendarStatusBadge
			statusType={{ id: type.id, name: type.shortName, color: type.color, textColor: '#ffffff' }}
			class="font-mono font-bold tracking-widest uppercase"
		>
			{type.shortName}
		</CalendarStatusBadge>
		<div class="ml-2 flex min-w-0 flex-col">
			<span class="truncate text-sm font-medium">{type.name}</span>
			<span class="text-muted-foreground text-xs">
				{type.assignTo === 'personnel' ? 'Assigned to person' : 'Assigned to group'}
			</span>
		</div>
	{/snippet}

	{#snippet editForm()}
		<div class="flex flex-wrap items-center gap-2 [&_.input]:min-w-[150px] [&_.input]:flex-1">
			<Input type="text" bind:value={editName} placeholder="Full name" aria-label="Full name" />
			<Input
				type="text"
				class="max-w-20 uppercase"
				bind:value={editShortName}
				placeholder="Short"
				aria-label="Short name"
				maxlength={5}
			/>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<NativeSelect aria-label="Assign to" bind:value={editAssignTo} class="w-[160px]">
				<option value="personnel">Person</option>
				<option value="group">Group</option>
			</NativeSelect>
			<label class="text-muted-foreground flex flex-col items-center gap-0.5 text-[10px] uppercase">
				<span>Color</span>
				<input type="color" bind:value={editColor} class="h-8 w-8 cursor-pointer rounded-md border p-0" />
			</label>
			<CalendarStatusBadge
				statusType={{
					id: 'edit-assignment-type',
					name: editShortName.toUpperCase() || '?',
					color: editColor,
					textColor: '#ffffff'
				}}
				class="font-mono font-bold tracking-widest uppercase"
			>
				{editShortName.toUpperCase() || '?'}
			</CalendarStatusBadge>
		</div>
	{/snippet}
</TypeManager>
