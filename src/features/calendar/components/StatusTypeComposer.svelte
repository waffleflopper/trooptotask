<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import type { StatusType } from '$features/calendar/contracts';
	import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
	import {
		fitsOneDayLabel,
		normalizeShortLabel,
		ONE_DAY_LABEL_LENGTH,
		suggestOneDayLabel
	} from '$features/calendar/utils/oneDayLabel';
	import StatusBar from './calendar-bars/StatusBar.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Spinner } from '$lib/components/ui/spinner';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { PendingSave } from '$lib/utils/pendingSave.svelte';

	interface Props {
		/** The type to edit in place. Without it the composer adds a new type. */
		status?: StatusType;
		onClose: () => void;
	}

	let { status, onClose }: Props = $props();

	const WHITE_TEXT = '#ffffff';
	const DARK_TEXT = '#1c1b19';
	const SWATCHES = [
		{ color: '#48bb78', name: 'Green' },
		{ color: '#4299e1', name: 'Blue' },
		{ color: '#9f7aea', name: 'Purple' },
		{ color: '#ed8936', name: 'Orange' },
		{ color: '#e53e3e', name: 'Red' },
		{ color: '#a0522d', name: 'Brown' },
		{ color: '#319795', name: 'Teal' },
		{ color: '#4a5568', name: 'Slate' }
	] as const;
	const DEFAULT_COLOR = '#4a5568';

	const initial = untrack(() => status);
	const id = initial?.id ?? 'new';
	let name = $state(initial?.name ?? '');
	// A saved label shows as typed; with none saved the field follows the name until someone types in it.
	let typedLabel = $state<string | null>(initial?.shortLabel ?? null);
	let color = $state(initial?.color ?? DEFAULT_COLOR);
	let textColor = $state(initial?.textColor ?? WHITE_TEXT);
	let nameInput = $state<HTMLInputElement | null>(null);
	const saving = new PendingSave();

	const draft = $derived({
		name: name.trim(),
		shortLabel: typedLabel === null ? null : normalizeShortLabel(typedLabel),
		color,
		textColor
	});
	const shownLabel = $derived(draft.shortLabel ?? suggestOneDayLabel(draft.name));
	const labelFits = $derived(fitsOneDayLabel(draft.shortLabel ?? ''));
	const valid = $derived(draft.name !== '' && labelFits);
	const dirty = $derived(
		initial
			? draft.name !== initial.name ||
					draft.shortLabel !== initial.shortLabel ||
					color !== initial.color ||
					textColor !== initial.textColor
			: draft.name !== '' || typedLabel !== null || color !== DEFAULT_COLOR || textColor !== WHITE_TEXT
	);
	const textChoice = $derived(textColor === WHITE_TEXT ? 'white' : textColor === DARK_TEXT ? 'dark' : '');
	const swatch = $derived(SWATCHES.some((option) => option.color === color) ? color : '');
	const previewName = $derived(draft.name || 'Status');

	export function isDirty() {
		return dirty;
	}

	onMount(() => nameInput?.focus());

	async function save() {
		if (!valid) return;
		const failure = initial ? 'Failed to save status type' : 'Failed to add status type';
		try {
			const saved = initial ? await statusTypesStore.update(initial.id, draft) : await statusTypesStore.add(draft);
			if (!saved) {
				toastStore.error(failure);
				return;
			}
		} catch (error) {
			toastStore.error(error instanceof Error ? error.message : failure);
			return;
		}
		onClose();
	}
</script>

<form
	class="flex w-full flex-col gap-5 rounded-lg border-2 border-foreground bg-card p-5"
	aria-label={initial ? `Edit ${initial.name}` : 'New status type'}
	onsubmit={(event) => {
		event.preventDefault();
		void saving.run(save);
	}}
>
	<fieldset class="contents" disabled={saving.pending}>
		<div class="flex flex-wrap items-start gap-4">
			<Field.Root class="min-w-48 flex-1">
				<Field.Label for="status-{id}-name">Name</Field.Label>
				<Input
					id="status-{id}-name"
					type="text"
					placeholder="e.g., Leave, TDY, School"
					bind:ref={nameInput}
					bind:value={name}
				/>
			</Field.Root>
			<Field.Root class="w-32">
				<Field.Label for="status-{id}-label">One-day label</Field.Label>
				<Input
					id="status-{id}-label"
					type="text"
					class="font-mono uppercase"
					maxlength={ONE_DAY_LABEL_LENGTH}
					aria-invalid={!labelFits}
					value={typedLabel ?? shownLabel}
					oninput={(event) => (typedLabel = event.currentTarget.value)}
				/>
				<Field.Description>Up to 3 letters</Field.Description>
			</Field.Root>
			<Field.Root class="w-auto">
				<Field.Label id="status-{id}-text">Text</Field.Label>
				<ToggleGroup.Root
					type="single"
					aria-labelledby="status-{id}-text"
					value={textChoice}
					onValueChange={(value) => {
						if (value === 'white') textColor = WHITE_TEXT;
						if (value === 'dark') textColor = DARK_TEXT;
					}}
				>
					<ToggleGroup.Item value="white">White</ToggleGroup.Item>
					<ToggleGroup.Item value="dark">Dark</ToggleGroup.Item>
				</ToggleGroup.Root>
			</Field.Root>
		</div>
		<Field.Root>
			<Field.Label id="status-{id}-color">Color</Field.Label>
			<div class="flex flex-wrap items-center gap-2">
				<ToggleGroup.Root
					type="single"
					class="gap-2 bg-transparent p-0"
					aria-labelledby="status-{id}-color"
					value={swatch}
					onValueChange={(value) => {
						if (value) color = value;
					}}
				>
					{#each SWATCHES as option (option.color)}
						<ToggleGroup.Item
							value={option.color}
							aria-label={option.name}
							class="size-7 min-w-7 rounded-md p-0 ring-offset-2 ring-offset-card data-[state=on]:ring-2 data-[state=on]:ring-foreground"
							style="background-color: {option.color}"
						/>
					{/each}
				</ToggleGroup.Root>
				<Input
					type="color"
					aria-label="Custom color"
					class="size-7 cursor-pointer rounded-md border-dashed p-0.5"
					bind:value={color}
				/>
			</div>
		</Field.Root>
		<div class="flex flex-wrap items-end justify-between gap-4">
			<div class="flex min-w-0 flex-col gap-2">
				<span class="font-mono text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
					Preview
				</span>
				<div class="flex flex-wrap items-center gap-2" aria-hidden="true">
					<StatusBar status={draft} label={{ kind: 'one-day', text: shownLabel }} />
					<StatusBar class="w-24" status={draft} label={{ kind: 'name', text: previewName }} />
					<StatusBar
						class="w-44"
						status={draft}
						label={{ kind: 'name-note', name: previewName, note: 'Sample note' }}
					/>
				</div>
				<p class="text-sm text-muted-foreground">One day · two to three days · room for the note</p>
			</div>
			<div class="ml-auto flex gap-2">
				<Button type="button" variant="outline" onclick={onClose} disabled={saving.pending}>Cancel</Button>
				<Button type="submit" disabled={saving.pending || statusTypesStore.orderBusy || !valid || !dirty}>
					{#if saving.pending}<Spinner />{/if}
					{initial ? 'Save changes' : 'Add status type'}
				</Button>
			</div>
		</div>
	</fieldset>
</form>
