<script lang="ts">
	import Minus from '@lucide/svelte/icons/minus';
	import Plus from '@lucide/svelte/icons/plus';
	import { untrack } from 'svelte';
	import * as Alert from '$lib/components/ui/alert';
	import { Badge, type BadgeVariant } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Spinner } from '$lib/components/ui/spinner';
	import {
		EQUIPMENT_NAME_MAX,
		TASKING_LIST_LIMIT,
		equipmentChangeSchema,
		equipmentDraftSchema,
		equipmentReadiness,
		equipmentState,
		movedIds,
		type EquipmentRequirement,
		type EquipmentState
	} from '../taskingListsModel';
	import {
		addEquipmentRequest,
		changeEquipmentRequest,
		removeEquipmentRequest,
		reorderListRequest
	} from '../taskingListsRequests';
	import ListItemActions from './ListItemActions.svelte';
	import { ListWrites } from './listWrites.svelte';
	import { equipmentSummary } from './taskingLabels';

	interface Props {
		orgId: string;
		taskingId: string;
		items: EquipmentRequirement[];
		canEdit: boolean;
		onChanged: () => void;
	}

	let { orgId, taskingId, items: loaded, canEdit, onChanged }: Props = $props();

	const STATES: Record<EquipmentState, { label: string; variant: BadgeVariant }> = {
		ready: { label: 'Ready', variant: 'success' },
		partial: { label: 'Partial', variant: 'warning' },
		none: { label: 'Not secured', variant: 'outline' }
	};

	const writes = new ListWrites();
	let items = $state.raw(untrack(() => loaded));
	let addId = crypto.randomUUID();
	let adding = $state({ name: '', quantity: '1' });
	let triedAdd = $state(false);
	let editing = $state<{ id: string; name: string; quantity: string; securedQuantity: string } | null>(null);
	let triedEdit = $state(false);

	$effect(() => () => writes.stop());
	// A refreshed load replaces what is shown only while no write of ours is still on its way.
	$effect(() => {
		const next = loaded;
		untrack(() => {
			if (!writes.saving.pending) items = next;
		});
	});

	const readiness = $derived(equipmentReadiness(items));
	const full = $derived(items.length >= TASKING_LIST_LIMIT);
	const addParsed = $derived(
		equipmentDraftSchema.safeParse({ name: adding.name, quantity: Number(adding.quantity), securedQuantity: 0 })
	);
	const editParsed = $derived(
		editing
			? equipmentDraftSchema.safeParse({
					name: editing.name,
					quantity: Number(editing.quantity),
					securedQuantity: Number(editing.securedQuantity)
				})
			: null
	);

	const problem = (parsed: typeof addParsed | null, field: string) =>
		parsed && !parsed.success ? parsed.error.issues.find((issue) => issue.path[0] === field)?.message : undefined;

	function put(item: EquipmentRequirement) {
		items = items.some((existing) => existing.id === item.id)
			? items.map((existing) => (existing.id === item.id ? item : existing))
			: [...items, item];
	}

	function add() {
		triedAdd = true;
		if (!addParsed.success) return;
		const [id, draft] = [addId, addParsed.data];
		void writes.run(
			() => addEquipmentRequest(orgId, taskingId, id, draft),
			(item) => {
				put(item);
				addId = crypto.randomUUID();
				adding = { name: '', quantity: '1' };
				triedAdd = false;
				onChanged();
			},
			'The equipment was not added. Your entry is kept, so try again.'
		);
	}

	function change(item: EquipmentRequirement, patch: Record<string, unknown>, done?: () => void) {
		const parsed = equipmentChangeSchema.safeParse(patch);
		if (!parsed.success) return;
		void writes.run(
			() => changeEquipmentRequest(orgId, taskingId, item.id, parsed.data),
			(saved) => {
				put(saved);
				done?.();
				onChanged();
			},
			'The equipment did not change. Try again.'
		);
	}

	const secure = (item: EquipmentRequirement, to: number) => {
		const securedQuantity = Math.min(item.quantity, Math.max(0, to));
		if (securedQuantity !== item.securedQuantity) change(item, { securedQuantity });
	};

	function startEdit(item: EquipmentRequirement) {
		triedEdit = false;
		editing = {
			id: item.id,
			name: item.name,
			quantity: String(item.quantity),
			securedQuantity: String(item.securedQuantity)
		};
	}

	function saveEdit(item: EquipmentRequirement) {
		triedEdit = true;
		if (!editParsed?.success) return;
		const { name, quantity, securedQuantity } = editParsed.data;
		const patch = {
			...(name !== item.name && { name }),
			...(quantity !== item.quantity && { quantity }),
			...(securedQuantity !== item.securedQuantity && { securedQuantity })
		};
		if (Object.keys(patch).length === 0) editing = null;
		else change(item, patch, () => (editing = null));
	}

	function remove(item: EquipmentRequirement) {
		void writes.run(
			() => removeEquipmentRequest(orgId, taskingId, item.id),
			() => {
				items = items.filter((existing) => existing.id !== item.id);
				onChanged();
			},
			'The equipment was not removed. Try again.'
		);
	}

	function move(item: EquipmentRequirement, step: -1 | 1) {
		const ids = movedIds(
			items.map((existing) => existing.id),
			item.id,
			step
		);
		if (!ids) return;
		void writes.run(
			() => reorderListRequest(orgId, taskingId, 'equipment', ids),
			(lists) => {
				items = lists.equipment;
				onChanged();
			},
			'The order did not change. Try again.'
		);
	}
</script>

<section class="grid gap-3" aria-labelledby="tasking-equipment-heading">
	<div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
		<h2 id="tasking-equipment-heading" class="font-heading text-lg font-semibold">Equipment</h2>
		<p class="m-0 text-sm text-muted-foreground" aria-live="polite">
			{readiness ? equipmentSummary(readiness) : 'None required'}
		</p>
	</div>

	{#if writes.error}
		<Alert.Root variant="destructive">
			<Alert.Description>{writes.error}</Alert.Description>
		</Alert.Root>
	{/if}

	{#if items.length > 0}
		<ul class="m-0 grid list-none divide-y rounded-lg border p-0">
			{#each items as item, index (item.id)}
				{@const state = STATES[equipmentState(item)]}
				<li class="p-3">
					{#if editing?.id === item.id}
						<form
							class="grid gap-3"
							novalidate
							onsubmit={(submit) => {
								submit.preventDefault();
								saveEdit(item);
							}}
						>
							<div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_6rem_6rem]">
								<Field.Root>
									<Field.Label for={`equipment-name-${item.id}`}>Equipment</Field.Label>
									<Input
										id={`equipment-name-${item.id}`}
										autocomplete="off"
										maxlength={EQUIPMENT_NAME_MAX * 2}
										bind:value={editing.name}
									/>
									{#if triedEdit && problem(editParsed, 'name')}<Field.Error>{problem(editParsed, 'name')}</Field.Error
										>{/if}
								</Field.Root>
								<Field.Root>
									<Field.Label for={`equipment-quantity-${item.id}`}>Quantity</Field.Label>
									<Input
										id={`equipment-quantity-${item.id}`}
										inputmode="numeric"
										autocomplete="off"
										bind:value={editing.quantity}
									/>
									{#if triedEdit && problem(editParsed, 'quantity')}
										<Field.Error>{problem(editParsed, 'quantity')}</Field.Error>
									{/if}
								</Field.Root>
								<Field.Root>
									<Field.Label for={`equipment-secured-${item.id}`}>Secured</Field.Label>
									<Input
										id={`equipment-secured-${item.id}`}
										inputmode="numeric"
										autocomplete="off"
										bind:value={editing.securedQuantity}
									/>
									{#if triedEdit && problem(editParsed, 'securedQuantity')}
										<Field.Error>{problem(editParsed, 'securedQuantity')}</Field.Error>
									{/if}
								</Field.Root>
							</div>
							<div class="flex flex-wrap gap-2">
								<Button type="submit" size="sm" disabled={writes.saving.pending}>
									{#if writes.saving.pending}<Spinner />{/if}
									Save
								</Button>
								<Button
									variant="outline"
									size="sm"
									disabled={writes.saving.pending}
									onclick={() => {
										editing = null;
									}}>Cancel</Button
								>
							</div>
						</form>
					{:else}
						<div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3">
							<div class="grid min-w-0 gap-0.5">
								<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
									<span class="font-medium wrap-anywhere">{item.name}</span>
									<Badge variant={state.variant}>{state.label}</Badge>
								</div>
								<span class="font-mono text-xs text-muted-foreground tabular-nums">
									Secured {item.securedQuantity} of {item.quantity}
								</span>
							</div>
							{#if canEdit}
								<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
									<div class="flex items-center gap-1">
										<Button
											variant="outline"
											size="icon-sm"
											aria-label={`Secure one fewer ${item.name}`}
											disabled={writes.saving.pending || item.securedQuantity === 0}
											onclick={() => secure(item, item.securedQuantity - 1)}
										>
											<Minus />
										</Button>
										<Button
											variant="outline"
											size="icon-sm"
											aria-label={`Secure one more ${item.name}`}
											disabled={writes.saving.pending || item.securedQuantity >= item.quantity}
											onclick={() => secure(item, item.securedQuantity + 1)}
										>
											<Plus />
										</Button>
										<Button
											variant="outline"
											size="sm"
											aria-label={`Mark all ${item.name} secured`}
											disabled={writes.saving.pending || item.securedQuantity >= item.quantity}
											onclick={() => secure(item, item.quantity)}>All secured</Button
										>
									</div>
									<ListItemActions
										name={item.name}
										first={index === 0}
										last={index === items.length - 1}
										disabled={writes.saving.pending}
										onMove={(step) => move(item, step)}
										onEdit={() => startEdit(item)}
										onRemove={() => remove(item)}
									/>
								</div>
							{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if canEdit}
		<form
			class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_6rem_auto] sm:items-start"
			novalidate
			onsubmit={(submit) => {
				submit.preventDefault();
				add();
			}}
		>
			<Field.Root>
				<Field.Label for="equipment-add-name">Add equipment</Field.Label>
				<Input
					id="equipment-add-name"
					autocomplete="off"
					placeholder="e.g., Litters"
					disabled={full}
					bind:value={adding.name}
				/>
				{#if triedAdd && problem(addParsed, 'name')}<Field.Error>{problem(addParsed, 'name')}</Field.Error>{/if}
			</Field.Root>
			<Field.Root>
				<Field.Label for="equipment-add-quantity">Quantity</Field.Label>
				<Input
					id="equipment-add-quantity"
					inputmode="numeric"
					autocomplete="off"
					disabled={full}
					bind:value={adding.quantity}
				/>
				{#if triedAdd && problem(addParsed, 'quantity')}<Field.Error>{problem(addParsed, 'quantity')}</Field.Error>{/if}
			</Field.Root>
			<div class="sm:pt-[1.625rem]">
				<Button
					type="submit"
					variant="outline"
					class="w-full sm:w-auto"
					aria-label="Add to equipment"
					disabled={writes.saving.pending || full}
				>
					{#if writes.saving.pending}<Spinner />{/if}
					Add
				</Button>
			</div>
		</form>
	{/if}
</section>
