<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import { untrack } from 'svelte';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Spinner } from '$lib/components/ui/spinner';
	import {
		EQUIPMENT_NAME_MAX,
		TASKING_LIST_LIMIT,
		equipmentChangeSchema,
		equipmentDraftSchema,
		securedSchema,
		equipmentReadiness,
		equipmentState,
		movedIds,
		type EquipmentRequirement
	} from '../taskingListsModel';
	import {
		addEquipmentRequest,
		changeEquipmentRequest,
		removeEquipmentRequest,
		reorderListRequest
	} from '../taskingListsRequests';
	import ListItemActions from './ListItemActions.svelte';
	import { ListWrites } from './listWrites.svelte';

	interface Props {
		orgId: string;
		taskingId: string;
		items: EquipmentRequirement[];
		canEdit: boolean;
		/** A Completed Tasking counts what came back instead of what was secured. */
		returning: boolean;
		/** Whether the reader may record returns on a Completed Tasking. */
		canReturn: boolean;
		/** A Blocked Tasking shows missing equipment as the problem it is. */
		blocked: boolean;
		onChanged: () => void;
	}

	let { orgId, taskingId, items: loaded, canEdit, returning, canReturn, blocked, onChanged }: Props = $props();

	const writes = new ListWrites();
	let items = $state.raw(untrack(() => loaded));
	let addId = crypto.randomUUID();
	let adding = $state({ name: '', quantity: '1' });
	let triedAdd = $state(false);
	let addOpen = $state(false);
	let editing = $state<{ id: string; name: string; quantity: string; securedQuantity: string } | null>(null);
	let counting = $state<{ id: string; returnedQuantity: string } | null>(null);
	let triedEdit = $state(false);

	$effect(() => () => writes.stop());
	$effect(() => {
		if (!canEdit) editing = null;
		if (!canReturn) counting = null;
	});
	// A refreshed load replaces what is shown only while no write of ours is still on its way.
	$effect(() => {
		const next = loaded;
		untrack(() => {
			if (!writes.saving.pending) items = next;
		});
	});

	const readiness = $derived(equipmentReadiness(items));
	const returned = (item: EquipmentRequirement) => (item.returnedQuantity ?? 0) >= item.quantity;
	const summary = $derived.by(() => {
		if (!readiness) return { text: 'None needed', tone: 'text-muted-foreground' };
		if (returning) {
			const back = items.filter(returned).length;
			return {
				text: `${back} of ${items.length} returned`,
				tone: back === items.length ? 'text-success-foreground' : 'text-accent-text'
			};
		}
		const done = readiness.ready === readiness.total;
		return {
			text: `${readiness.ready} of ${readiness.total} ready`,
			tone: done ? 'text-success-foreground' : blocked ? 'text-danger-foreground' : 'text-accent-text'
		};
	});
	const shortTone = $derived(blocked ? 'text-danger-foreground' : 'text-accent-text');
	const full = $derived(items.length >= TASKING_LIST_LIMIT);
	const countParsed = $derived(
		counting ? securedSchema.safeParse(Number(counting.returnedQuantity)) : null
	);
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
		const [id, draft, submitted] = [addId, addParsed.data, { ...adding }];
		void writes.run(
			() => addEquipmentRequest(orgId, taskingId, id, draft),
			(item) => {
				put(item);
				addId = crypto.randomUUID();
				if (adding.name === submitted.name && adding.quantity === submitted.quantity) {
					adding = { name: '', quantity: '1' };
					triedAdd = false;
					addOpen = false;
				}
				onChanged();
			},
			'The equipment was not added. Your entry is kept, so try again.',
			reseed
		);
	}

	const reseed = () => (items = loaded);

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
			'The equipment did not change. Try again.',
			reseed
		);
	}

	const secure = (item: EquipmentRequirement, all: boolean) =>
		change(item, { securedQuantity: all ? item.quantity : 0 });
	const giveBack = (item: EquipmentRequirement, all: boolean) =>
		change(item, { returnedQuantity: all ? item.quantity : 0 });

	function saveCount(item: EquipmentRequirement) {
		if (!counting || !countParsed?.success) return;
		const returnedQuantity = Math.min(item.quantity, countParsed.data);
		const submitted = counting.returnedQuantity;
		if (returnedQuantity === (item.returnedQuantity ?? 0)) counting = null;
		else
			change(item, { returnedQuantity }, () => {
				if (counting?.returnedQuantity === submitted) counting = null;
			});
	}

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
		else {
			const submitted = { ...editing! };
			change(item, patch, () => {
				if (
					editing &&
					editing.name === submitted.name &&
					editing.quantity === submitted.quantity &&
					editing.securedQuantity === submitted.securedQuantity
				)
					editing = null;
			});
		}
	}

	function remove(item: EquipmentRequirement) {
		void writes.run(
			() => removeEquipmentRequest(orgId, taskingId, item.id),
			() => {
				items = items.filter((existing) => existing.id !== item.id);
				onChanged();
			},
			'The equipment was not removed. Try again.',
			reseed
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
			'The order did not change. Try again.',
			reseed
		);
	}
</script>

<section
	class="grid min-w-0 content-start gap-[10px] rounded-lg border border-border bg-card px-4 py-[14px]"
	aria-labelledby="tasking-equipment-heading"
>
	<div class="flex flex-wrap items-baseline gap-x-2.5">
		<h2 id="tasking-equipment-heading" class="font-heading text-xl leading-6 font-semibold">Equipment</h2>
		<span class={['font-mono text-[13px] font-semibold tabular-nums', summary.tone]} aria-live="polite">
			{summary.text}
		</span>
	</div>

	{#if writes.error}
		<Alert.Root variant="destructive">
			<Alert.Description>{writes.error}</Alert.Description>
		</Alert.Root>
	{/if}

	{#if items.length > 0}
		<ul class="m-0 grid list-none gap-1.5 p-0">
			{#each items as item, index (item.id)}
				{@const state = equipmentState(item)}
				{@const checkId = `equipment-check-${item.id}`}
				<li class="min-h-7">
					{#if canEdit && editing?.id === item.id}
						<form
							class="grid gap-3 py-1"
							novalidate
							onsubmit={(submit) => {
								submit.preventDefault();
								saveEdit(item);
							}}
						>
							<Field.Root>
								<Field.Label for={`equipment-name-${item.id}`}>Equipment</Field.Label>
								<Input
									id={`equipment-name-${item.id}`}
									autocomplete="off"
									maxlength={EQUIPMENT_NAME_MAX * 2}
									bind:value={editing.name}
								/>
								{#if triedEdit && problem(editParsed, 'name')}<Field.Error>{problem(editParsed, 'name')}</Field.Error>{/if}
							</Field.Root>
							<div class="grid grid-cols-2 gap-3">
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
								<Button variant="outline" size="sm" disabled={writes.saving.pending} onclick={() => (editing = null)}>
									Cancel
								</Button>
							</div>
						</form>
					{:else if canReturn && counting?.id === item.id}
						<form
							class="grid gap-3 py-1"
							novalidate
							onsubmit={(submit) => {
								submit.preventDefault();
								saveCount(item);
							}}
						>
							<Field.Root>
								<Field.Label for={`equipment-returned-${item.id}`}>Returned of {item.quantity} {item.name}</Field.Label>
								<Input
									id={`equipment-returned-${item.id}`}
									inputmode="numeric"
									autocomplete="off"
									class="w-24"
									bind:value={counting.returnedQuantity}
								/>
								{#if countParsed && !countParsed.success}
									<Field.Error>{countParsed.error.issues[0]?.message}</Field.Error>
								{/if}
							</Field.Root>
							<div class="flex flex-wrap gap-2">
								<Button type="submit" size="sm" disabled={writes.saving.pending}>
									{#if writes.saving.pending}<Spinner />{/if}
									Save
								</Button>
								<Button variant="outline" size="sm" disabled={writes.saving.pending} onclick={() => (counting = null)}>
									Cancel
								</Button>
							</div>
						</form>
					{:else}
						{@const back = item.returnedQuantity ?? 0}
						{@const active = returning ? canReturn : canEdit}
						<div class="flex min-h-7 items-center gap-[10px]">
							<Checkbox
								id={checkId}
								class={[
									!active && 'disabled:cursor-default disabled:opacity-100',
									!returning && state !== 'ready' && blocked && 'border-danger',
									!returning && state === 'partial' && !blocked && 'border-accent'
								]
									.filter(Boolean)
									.join(' ')}
								checked={returning ? returned(item) : state === 'ready'}
								disabled={!active || writes.saving.pending}
								onCheckedChange={(checked) => (returning ? giveBack(item, checked) : secure(item, checked))}
							/>
							<label for={checkId} class="min-w-0 flex-1 text-sm wrap-anywhere">{item.name}</label>
							{#if returning && back > 0 && back < item.quantity}
								<span class="shrink-0 font-mono text-xs text-accent-text tabular-nums">
									{back} of {item.quantity} returned
								</span>
							{:else if !returning && state === 'partial'}
								<span class={['shrink-0 font-mono text-xs tabular-nums', shortTone]}>
									{item.securedQuantity} of {item.quantity} secured
								</span>
							{:else}
								<span class="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">× {item.quantity}</span>
							{/if}
							{#if canEdit}
								<ListItemActions
									name={item.name}
									first={index === 0}
									last={index === items.length - 1}
									disabled={writes.saving.pending}
									onMove={(step) => move(item, step)}
									onEdit={() => startEdit(item)}
									onRemove={() => remove(item)}
								/>
							{:else if canReturn}
								<ListItemActions
									name={item.name}
									first={index === 0}
									last={index === items.length - 1}
									disabled={writes.saving.pending}
									editLabel="Count returned…"
									onEdit={() => (counting = { id: item.id, returnedQuantity: String(back) })}
								/>
							{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{:else if !canEdit}
		<p class="m-0 text-[13px] text-muted-foreground">Nothing to bring.</p>
	{/if}

	{#if canEdit && addOpen}
		<form
			class="grid gap-3 border-t border-border pt-3"
			novalidate
			onsubmit={(submit) => {
				submit.preventDefault();
				add();
			}}
		>
			<div class="grid grid-cols-[minmax(0,1fr)_5rem] gap-3">
				<Field.Root>
					<Field.Label for="equipment-add-name">Equipment</Field.Label>
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
					{#if triedAdd && problem(addParsed, 'quantity')}<Field.Error>{problem(addParsed, 'quantity')}</Field.Error
						>{/if}
				</Field.Root>
			</div>
			<div class="flex flex-wrap gap-2">
				<Button type="submit" size="sm" aria-label="Add to equipment" disabled={writes.saving.pending || full}>
					{#if writes.saving.pending}<Spinner />{/if}
					Add
				</Button>
				<Button variant="outline" size="sm" disabled={writes.saving.pending} onclick={() => (addOpen = false)}>
					Cancel
				</Button>
			</div>
		</form>
	{:else if canEdit && !full}
		<Button variant="ghost" size="sm" class="-ml-2 justify-self-start text-muted-foreground" onclick={() => (addOpen = true)}>
			<Plus data-icon="inline-start" aria-hidden="true" />Add equipment
		</Button>
	{/if}
</section>
