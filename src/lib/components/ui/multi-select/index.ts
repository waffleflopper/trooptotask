import Root from '$lib/components/ui/combobox/combobox.svelte';
import Trigger from '$lib/components/ui/combobox/combobox-chips.svelte';
import Content from '$lib/components/ui/combobox/combobox-content.svelte';
import Item from '$lib/components/ui/combobox/combobox-item.svelte';
import Chip from '$lib/components/ui/combobox/combobox-chip.svelte';
import Value from '$lib/components/ui/combobox/combobox-value.svelte';
import Input from '$lib/components/ui/combobox/combobox-chips-input.svelte';
import Empty from '$lib/components/ui/combobox/combobox-empty.svelte';
import List from '$lib/components/ui/combobox/combobox-list.svelte';
import type { ComboboxItemInput, ComboboxOption } from '$lib/components/ui/combobox/context.js';

export type { ComboboxItemInput as MultiSelectItemInput, ComboboxOption as MultiSelectOption };

export {
	Root,
	Trigger,
	Content,
	Item,
	Chip,
	Value,
	Input,
	Empty,
	List,
	//
	Root as MultiSelect,
	Trigger as MultiSelectTrigger,
	Content as MultiSelectContent,
	Item as MultiSelectItem,
	Chip as MultiSelectChip,
	Value as MultiSelectValue,
	Input as MultiSelectInput,
	Empty as MultiSelectEmpty,
	List as MultiSelectList
};
