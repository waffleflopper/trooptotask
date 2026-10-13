<script lang="ts">
	import { WorkspaceToolbar, type ToolbarItem } from './index.js';

	type Props = {
		withArchive?: boolean;
		withExport?: boolean;
		withDisplayOption?: boolean;
		abbreviateViewOptions?: boolean;
		destructivePrimary?: boolean;
		initialSearch?: string;
		initialStatus?: string[];
		statusDefaults?: string[];
		importLoading?: boolean;
		importDisabledReason?: string;
		planningDisabled?: boolean;
		reportsDisabled?: boolean;
		onRun?: (name: string) => void;
	};

	let {
		withArchive = true,
		withExport = false,
		withDisplayOption = false,
		abbreviateViewOptions = false,
		destructivePrimary = false,
		initialSearch = '',
		initialStatus = [],
		statusDefaults = [],
		importLoading = false,
		importDisabledReason,
		planningDisabled = false,
		reportsDisabled = false,
		onRun
	}: Props = $props();

	let view = $state('month');
	let group = $state('');
	// svelte-ignore state_referenced_locally
	let status = $state<string[]>(initialStatus);
	let gaps = $state(false);
	let roles = $state(true);
	// svelte-ignore state_referenced_locally
	let search = $state(initialSearch);
	let runs = $state<string[]>([]);

	function log(name: string): void {
		runs = [...runs, `${name}:${document.querySelectorAll('[role=menu]').length}`];
		onRun?.(name);
	}

	const items = $derived.by<ToolbarItem[]>(() => [
		{
			kind: 'view',
			id: 'view',
			label: 'View mode',
			options: [
				{ value: 'month', label: 'Month' },
				abbreviateViewOptions
					? { value: 'long-range', label: 'LR', ariaLabel: 'Long range' }
					: { value: 'long-range', label: 'Long range' }
			],
			value: view,
			onValueChange: (value) => (view = value)
		},
		{
			kind: 'select',
			id: 'group',
			label: 'Group',
			options: [
				{ value: '', label: 'All groups' },
				{ value: 'second', label: '2nd Platoon' }
			],
			value: group,
			defaultValue: '',
			onValueChange: (value) => (group = value)
		},
		{
			kind: 'multiSelect',
			id: 'status',
			label: 'Status',
			options: [
				{ value: 'present', label: 'Present' },
				{ value: 'leave', label: 'Leave' },
				{ value: 'tdy', label: 'TDY' }
			],
			values: status,
			defaultValues: statusDefaults,
			onValuesChange: (values) => (status = values)
		},
		{ kind: 'toggle', id: 'gaps', label: 'Gaps only', pressed: gaps, onPressedChange: (pressed) => (gaps = pressed) },
		...(withDisplayOption
			? [
					{
						kind: 'toggle',
						id: 'roles',
						label: 'Show roles',
						menuOnly: true,
						defaultPressed: true,
						pressed: roles,
						onPressedChange: (pressed: boolean) => (roles = pressed)
					} satisfies ToolbarItem
				]
			: []),
		{ kind: 'action', id: 'reports', label: 'Reports', href: '/reports', icon: 'chart', disabled: reportsDisabled },
		{
			kind: 'action',
			id: 'planning',
			label: 'Planning',
			disabled: planningDisabled,
			menuItems: [
				{ kind: 'action', id: 'planner', label: 'Assignment Planner', onclick: () => log('planner') },
				{ kind: 'action', id: 'clear', label: 'Clear Plan', destructive: true, onclick: () => log('clear') },
				{ kind: 'action', id: 'monthly', label: 'Monthly Plan', onclick: () => log('monthly') }
			]
		},
		{
			kind: 'action',
			id: 'import',
			label: 'Import',
			icon: 'upload',
			loading: importLoading,
			disabled: Boolean(importDisabledReason),
			disabledReason: importDisabledReason,
			onclick: () => log('import')
		},
		...(withExport
			? [{ kind: 'action', id: 'export', label: 'Export', onclick: () => log('export') } satisfies ToolbarItem]
			: []),
		...(withArchive
			? [
					{
						kind: 'action',
						id: 'archive',
						label: 'Archive',
						destructive: true,
						menuOnly: true,
						onclick: () => log('archive')
					} satisfies ToolbarItem
				]
			: [])
	]);
</script>

<WorkspaceToolbar
	ariaLabel="Roster controls"
	{items}
	search={{
		label: 'Search roster',
		placeholder: 'Search...',
		value: search,
		onValueChange: (value) => (search = value)
	}}
	primary={{
		kind: 'action',
		id: 'add',
		label: 'Add status',
		icon: 'plus',
		destructive: destructivePrimary,
		onclick: () => log('add')
	}}
/>

<output aria-label="View value">{view}</output>
<output aria-label="Group value">{group || 'all'}</output>
<output aria-label="Status value">{status.join(',') || 'none'}</output>
<output aria-label="Gaps value">{gaps ? 'on' : 'off'}</output>
<output aria-label="Roles value">{roles ? 'on' : 'off'}</output>
<output aria-label="Search value">{search || 'empty'}</output>
<output aria-label="Runs">{runs.join(' ') || 'none'}</output>
