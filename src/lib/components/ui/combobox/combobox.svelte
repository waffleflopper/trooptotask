<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import type { ClassValue } from 'clsx';
	import * as Command from '$lib/components/ui/command/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { cn } from '$lib/utils.js';
	import { setComboboxContext, type ComboboxContext, type ComboboxItemInput, type ComboboxOption } from './context.js';

	type ComboboxValue = string | string[];

	interface Props {
		items?: readonly ComboboxItemInput[];
		value?: ComboboxValue;
		defaultValue?: ComboboxValue;
		name?: string;
		multiple?: boolean;
		autoHighlight?: boolean;
		disabled?: boolean;
		loading?: boolean;
		loadingText?: string;
		open?: boolean;
		label?: string;
		class?: ClassValue;
		onValueChange?: (value: ComboboxValue) => void;
		children?: Snippet;
	}

	let {
		items = [],
		value = $bindable(),
		defaultValue,
		name,
		multiple = false,
		autoHighlight = false,
		disabled = false,
		loading = false,
		loadingText = 'Loading options...',
		open = $bindable(false),
		label = 'Combobox',
		class: className,
		onValueChange,
		children
	}: Props = $props();

	let search = $state('');
	let commandValue = $state('');
	let anchor = $state<HTMLElement | null>(null);
	let content = $state<HTMLElement | null>(null);

	function normalizeOption(item: ComboboxItemInput): ComboboxOption {
		if (typeof item === 'string') {
			return { value: item, label: item };
		}

		return {
			value: item.value,
			label: item.label ?? item.value,
			description: item.description,
			group: item.group,
			disabled: item.disabled
		};
	}

	const normalizedItems = $derived(items.map(normalizeOption));

	function selectedValues() {
		const currentValue = value ?? defaultValue ?? (multiple ? [] : '');
		if (Array.isArray(currentValue)) return currentValue;
		return currentValue ? [currentValue] : [];
	}

	function getOption(itemValue: string) {
		return normalizedItems.find((item) => item.value === itemValue);
	}

	function selectedLabels() {
		return selectedValues().map((selectedValue) => getOption(selectedValue)?.label ?? selectedValue);
	}

	function commit(next: ComboboxValue) {
		value = next;
		onValueChange?.(next);
	}

	const context: ComboboxContext = {
		get multiple() {
			return multiple;
		},
		get disabled() {
			return disabled;
		},
		get loading() {
			return loading;
		},
		get loadingText() {
			return loadingText;
		},
		get open() {
			return open;
		},
		get items() {
			return normalizedItems;
		},
		get search() {
			return search;
		},
		get anchor() {
			return anchor;
		},
		get content() {
			return content;
		},
		getSelectedValues: selectedValues,
		getSelectedLabels: selectedLabels,
		getOption,
		isSelected(itemValue: string) {
			return selectedValues().includes(itemValue);
		},
		setSearch(nextSearch: string) {
			search = nextSearch;
		},
		setAnchor(nextAnchor: HTMLElement | null) {
			anchor = nextAnchor;
		},
		setContent(nextContent: HTMLElement | null) {
			content = nextContent;
		},
		setOpen(nextOpen: boolean) {
			if (!disabled) {
				open = nextOpen;
			}
		},
		toggleValue(itemValue: string) {
			if (disabled || getOption(itemValue)?.disabled) return;

			if (multiple) {
				const current = selectedValues();
				const next = current.includes(itemValue)
					? current.filter((selectedValue) => selectedValue !== itemValue)
					: [...current, itemValue];

				commit(next);
				search = '';
				open = true;
				return;
			}

			commit(itemValue);
			search = '';
			open = false;
		},
		removeValue(itemValue: string) {
			if (disabled) return;

			if (multiple) {
				commit(selectedValues().filter((selectedValue) => selectedValue !== itemValue));
				return;
			}

			if (value === itemValue) {
				commit('');
			}
		},
		clearLastValue() {
			if (disabled || !multiple || search) return;

			const current = selectedValues();
			if (current.length > 0) {
				commit(current.slice(0, -1));
			}
		}
	};

	setComboboxContext(context);

	function containsTarget(node: HTMLElement | null, target: EventTarget | null) {
		return target instanceof Node && node?.contains(target);
	}

	const outsidePointerAttachment: Attachment<HTMLDivElement> = (node) => {
		function handlePointerDown(event: PointerEvent) {
			if (
				!open ||
				containsTarget(node, event.target) ||
				containsTarget(anchor, event.target) ||
				containsTarget(content, event.target)
			) {
				return;
			}

			open = false;
		}

		document.addEventListener('pointerdown', handlePointerDown, true);

		return () => {
			document.removeEventListener('pointerdown', handlePointerDown, true);
		};
	};
</script>

<div {@attach outsidePointerAttachment} data-slot="combobox" class={cn('w-full', className)}>
	{#if name}
		{#if multiple}
			{#each selectedValues() as selectedValue (selectedValue)}
				<input type="hidden" {name} value={selectedValue} />
			{/each}
		{:else}
			<input type="hidden" {name} value={selectedValues()[0] ?? ''} />
		{/if}
	{/if}
	<Popover.Root bind:open>
		<Command.Root bind:value={commandValue} {label} loop disableInitialScroll={!autoHighlight}>
			{@render children?.()}
		</Command.Root>
	</Popover.Root>
</div>
