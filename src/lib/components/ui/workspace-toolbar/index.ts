import Root from './workspace-toolbar.svelte';
import Group from './workspace-toolbar-group.svelte';
import Meta from './workspace-toolbar-meta.svelte';
import Actions from './workspace-toolbar-actions.svelte';
import Select from './workspace-toolbar-select.svelte';
import Search from './workspace-toolbar-search.svelte';
import MultiSelect from './workspace-toolbar-multi-select.svelte';
import Nav from './workspace-toolbar-nav.svelte';

export type {
	WorkspaceToolbarAction,
	WorkspaceToolbarActionVariant,
	WorkspaceToolbarIcon,
	WorkspaceToolbarMenuItem,
	WorkspaceToolbarNavItem,
	WorkspaceToolbarOption
} from './types.js';

export {
	Root,
	Group,
	Meta,
	Actions,
	Select,
	Search,
	MultiSelect,
	Nav,
	//
	Root as WorkspaceToolbar,
	Group as WorkspaceToolbarGroup,
	Meta as WorkspaceToolbarMeta,
	Actions as WorkspaceToolbarActions,
	Select as WorkspaceToolbarSelect,
	Search as WorkspaceToolbarSearch,
	MultiSelect as WorkspaceToolbarMultiSelect,
	Nav as WorkspaceToolbarNav
};
