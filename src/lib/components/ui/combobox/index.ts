import Root from './combobox.svelte';
import Trigger from './combobox-trigger.svelte';
import Chip from './combobox-chip.svelte';
import Chips from './combobox-chips.svelte';
import ChipsInput from './combobox-chips-input.svelte';
import Content from './combobox-content.svelte';
import Empty from './combobox-empty.svelte';
import Item from './combobox-item.svelte';
import List from './combobox-list.svelte';
import Search from './combobox-search.svelte';
import Value from './combobox-value.svelte';
import type { ComboboxItemInput, ComboboxOption } from './context.js';

export type { ComboboxItemInput, ComboboxOption };

export {
	Root,
	Trigger,
	Chip,
	Chips,
	ChipsInput,
	Content,
	Empty,
	Item,
	List,
	Search,
	Value,
	//
	Root as Combobox,
	Trigger as ComboboxTrigger,
	Chip as ComboboxChip,
	Chips as ComboboxChips,
	ChipsInput as ComboboxChipsInput,
	Content as ComboboxContent,
	Empty as ComboboxEmpty,
	Item as ComboboxItem,
	List as ComboboxList,
	Search as ComboboxSearch,
	Value as ComboboxValue
};
