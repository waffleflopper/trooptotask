<script lang="ts">
	import {
		BadgeCheck,
		BarChart3,
		CalendarIcon,
		ChevronDown,
		ClipboardList,
		Download,
		Filter,
		FileText,
		Home,
		Inbox,
		MoreHorizontal,
		Printer,
		Search,
		Settings,
		Trash2,
		Upload,
		Users
	} from '@lucide/svelte';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as AppDialog from '$lib/components/ui/app-dialog/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as ButtonGroup from '$lib/components/ui/button-group/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import * as Chart from '$lib/components/ui/chart/index.js';
	import type { ChartConfig } from '$lib/components/ui/chart/index.js';
	import * as Command from '$lib/components/ui/command/index.js';
	import * as Combobox from '$lib/components/ui/combobox/index.js';
	import * as DataTable from '$lib/components/ui/data-table/index.js';
	import { useDataTableSelection } from '$lib/components/ui/data-table/index.js';
	import type { ColumnDef, DataTableRowAction } from '$lib/components/ui/data-table/index.js';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as InputGroup from '$lib/components/ui/input-group/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as NavigationMenu from '$lib/components/ui/navigation-menu/index.js';
	import * as Pagination from '$lib/components/ui/pagination/index.js';
	import { DatePicker } from '$lib/components/ui/date-picker/index.js';
	import { Progress } from '$lib/components/ui/progress/index.js';
	import * as RadioGroup from '$lib/components/ui/radio-group/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import * as WorkspaceToolbar from '$lib/components/ui/workspace-toolbar/index.js';
	import {
		selectedShowroomComponents,
		showroomCoverage,
		showroomDarkModeContract
	} from '$lib/components/ui/showroom/showroomInventory';

	const statuses = [
		{ value: 'ready', label: 'Ready' },
		{ value: 'watch', label: 'Watch' },
		{ value: 'action', label: 'Action required' }
	];

	const frameworks = ['Next.js', 'SvelteKit', 'Nuxt.js', 'Remix', 'Astro'];

	const personnel = [
		{ name: 'Avery Brooks', group: 'HQ', status: 'Ready', readiness: 96 },
		{ name: 'Maya Chen', group: 'A Co', status: 'Action', readiness: 72 },
		{ name: 'Jon Bell', group: 'B Co', status: 'Watch', readiness: 84 }
	];

	type DataTablePerson = {
		id: string;
		name: string;
		group: string;
		status: string;
		readiness: number;
		disabled?: boolean;
	};

	const dataTablePeople: DataTablePerson[] = [
		{ id: '1', name: 'Avery Brooks', group: 'HQ', status: 'Ready', readiness: 96 },
		{ id: '2', name: 'Maya Chen', group: 'A Co', status: 'Action', readiness: 72 },
		{ id: '3', name: 'Jon Bell', group: 'B Co', status: 'Watch', readiness: 84 },
		{ id: '4', name: 'Sam Ortiz', group: 'A Co', status: 'Ready', readiness: 91 },
		{ id: '5', name: 'Nadia Price', group: 'B Co', status: 'Disabled', readiness: 64, disabled: true }
	];

	const sampleStatusType = {
		id: 'leave',
		name: 'Leave',
		color: '#4d6b35',
		textColor: '#f7f8f4'
	};

	const dataTableColumns: ColumnDef<DataTablePerson>[] = [
		{ key: 'name', header: 'Name', value: (row) => row.name },
		{ key: 'group', header: 'Group', value: (row) => row.group },
		{ key: 'status', header: 'Status', value: (row) => row.status },
		{ key: 'readiness', header: 'Readiness', value: (row) => row.readiness, align: 'right' }
	];

	const actionColumns: ColumnDef<DataTablePerson>[] = [
		...dataTableColumns,
		{ key: 'actions', header: 'Actions', value: () => '', sortable: false, searchable: false, align: 'right' }
	];

	const selectionColumns: ColumnDef<DataTablePerson>[] = [
		{ key: 'select', header: 'Select', value: () => '', sortable: false, searchable: false },
		...dataTableColumns
	];

	const rowActions: DataTableRowAction<DataTablePerson>[] = [
		{ label: 'Open record', onSelect: () => undefined },
		{ label: 'Assign task', onSelect: () => undefined },
		{ label: 'Archive', onSelect: () => undefined, destructive: true }
	];

	const chartConfig = {
		ready: {
			label: 'Ready',
			color: 'var(--chart-1)'
		},
		gaps: {
			label: 'Gaps',
			color: 'var(--chart-2)'
		}
	} satisfies ChartConfig;

	const chartRows = [
		{ label: 'Mon', ready: 72, gaps: 28 },
		{ label: 'Tue', ready: 84, gaps: 16 },
		{ label: 'Wed', ready: 78, gaps: 22 },
		{ label: 'Thu', ready: 91, gaps: 9 }
	];

	let selectedStatus = $state('ready');
	let tab = $state('account');
	let date = $state('2026-05-06');
	let page = $state(2);
	let includeDetached = $state(false);
	let requireReview = $state(true);
	let radioValue = $state('standard');
	let files = $state<FileList>();
	let selectedFrameworks = $state<string[]>(['Next.js']);
	let toolbarView = $state<'month' | 'long-range'>('month');
	let toolbarGroup = $state('all');
	let toolbarStatus = $state('all');
	let toolbarSearch = $state('');
	let toolbarGapsOnly = $state(false);
	let standardDialogOpen = $state(false);
	let editDialogOpen = $state(false);
	let longDialogOpen = $state(false);
	let destructiveConfirmOpen = $state(false);
	let warningConfirmOpen = $state(false);
	let asyncConfirmOpen = $state(false);
	let disabledConfirmOpen = $state(false);
	let blockedDialogOpen = $state(false);
	let clickedRow = $state('No row selected');
	let expandedDataTableRow = $state('2');
	const tableSelection = useDataTableSelection({
		rows: () => dataTablePeople,
		rowKey: (row) => row.id,
		disabledRow: (row) => row.disabled ?? false
	});

	const selectedStatusLabel = $derived(statuses.find((status) => status.value === selectedStatus)?.label ?? 'Status');
	const toolbarGroupOptions = [
		{ value: 'all', label: 'Group: All' },
		{ value: 'hq', label: 'HQ' },
		{ value: 'alpha', label: 'A Co' },
		{ value: 'bravo', label: 'B Co' }
	];
	const toolbarStatusOptions = [
		{ value: 'all', label: 'Status: All' },
		{ value: 'ready', label: 'Ready' },
		{ value: 'watch', label: 'Watch' },
		{ value: 'action', label: 'Action required' }
	];
	const toolbarGroupLabel = $derived(
		toolbarGroupOptions.find((option) => option.value === toolbarGroup)?.label ?? 'Group'
	);
	const toolbarStatusLabel = $derived(
		toolbarStatusOptions.find((option) => option.value === toolbarStatus)?.label ?? 'Status'
	);
	const activeToolbarFilters = $derived(
		(toolbarGroup !== 'all' ? 1 : 0) + (toolbarStatus !== 'all' ? 1 : 0) + (toolbarGapsOnly ? 1 : 0)
	);
</script>

<svelte:head>
	<title>UI Showroom | TroopToTask</title>
</svelte:head>

<Tooltip.Provider>
	<Sidebar.Provider class="min-h-max bg-background font-sans">
		<Sidebar.Root collapsible="icon">
			<Sidebar.Header>
				<Sidebar.Menu>
					<Sidebar.MenuItem>
						<Sidebar.MenuButton size="lg">
							<BadgeCheck />
							<span>UI Showroom</span>
						</Sidebar.MenuButton>
					</Sidebar.MenuItem>
				</Sidebar.Menu>
			</Sidebar.Header>
			<Sidebar.Content>
				<Sidebar.Group>
					<Sidebar.GroupLabel>Components</Sidebar.GroupLabel>
					<Sidebar.GroupContent>
						<Sidebar.Menu>
							<Sidebar.MenuItem>
								<Sidebar.MenuButton isActive>
									<Home />
									<span>Foundation</span>
								</Sidebar.MenuButton>
							</Sidebar.MenuItem>
							<Sidebar.MenuItem>
								<Sidebar.MenuButton>
									<ClipboardList />
									<span>Data display</span>
								</Sidebar.MenuButton>
							</Sidebar.MenuItem>
							<Sidebar.MenuItem>
								<Sidebar.MenuButton>
									<Users />
									<span>Selection</span>
								</Sidebar.MenuButton>
							</Sidebar.MenuItem>
							<Sidebar.MenuItem>
								<Sidebar.MenuButton>
									<Settings />
									<span>Overlays</span>
								</Sidebar.MenuButton>
							</Sidebar.MenuItem>
						</Sidebar.Menu>
					</Sidebar.GroupContent>
				</Sidebar.Group>
			</Sidebar.Content>
			<Sidebar.Footer>
				<Sidebar.Menu>
					<Sidebar.MenuItem>
						<Sidebar.MenuButton>
							<BarChart3 />
							<span>{selectedShowroomComponents.length} components</span>
						</Sidebar.MenuButton>
					</Sidebar.MenuItem>
				</Sidebar.Menu>
			</Sidebar.Footer>
		</Sidebar.Root>

		<Sidebar.Inset class="min-h-max">
			<main class="flex w-full max-w-6xl flex-col gap-12 p-6 md:p-10">
				<header class="grid gap-3">
					<div class="flex items-center gap-2">
						<Sidebar.Trigger />
						<Separator orientation="vertical" class="h-4" />
						<Badge variant="outline">Development only</Badge>
					</div>
					<div class="grid gap-2">
						<h1 class="text-3xl font-bold tracking-tight">shadcn-svelte showroom</h1>
						<p class="max-w-3xl text-muted-foreground">
							Native generated shadcn-svelte components in one route. Project colors are not mapped into these tokens
							yet.
						</p>
					</div>
					<div class="flex flex-wrap gap-2 text-sm text-muted-foreground">
						<span>{showroomCoverage.length} states tracked</span>
						<span>{showroomDarkModeContract.current} theme source</span>
					</div>
				</header>

				<section class="grid gap-4" aria-labelledby="navigation-title">
					<h2 id="navigation-title" class="text-xl font-semibold tracking-tight">Navigation</h2>
					<NavigationMenu.Root>
						<NavigationMenu.List>
							<NavigationMenu.Item>
								<NavigationMenu.Trigger>Getting started</NavigationMenu.Trigger>
								<NavigationMenu.Content>
									<div class="grid w-[400px] gap-3 p-4">
										<NavigationMenu.Link href="/ui-showroom">
											<div class="text-sm font-medium leading-none">Showroom</div>
											<p class="line-clamp-2 text-sm leading-snug text-muted-foreground">
												A development-only calibration route for generated components.
											</p>
										</NavigationMenu.Link>
										<NavigationMenu.Link href="/ui-showroom">
											<div class="text-sm font-medium leading-none">Foundation</div>
											<p class="line-clamp-2 text-sm leading-snug text-muted-foreground">
												Tailwind v4 tokens and shadcn-svelte primitives.
											</p>
										</NavigationMenu.Link>
									</div>
								</NavigationMenu.Content>
							</NavigationMenu.Item>
							<NavigationMenu.Item>
								<NavigationMenu.Link href="/ui-showroom">Components</NavigationMenu.Link>
							</NavigationMenu.Item>
						</NavigationMenu.List>
					</NavigationMenu.Root>
				</section>

				<section class="grid gap-4" aria-labelledby="buttons-title">
					<h2 id="buttons-title" class="text-xl font-semibold tracking-tight">Buttons and badges</h2>
					<div class="flex flex-wrap gap-2">
						<Button>Button</Button>
						<Button variant="secondary">Secondary</Button>
						<Button variant="outline">Outline</Button>
						<Button variant="destructive">Destructive</Button>
						<Button disabled>Disabled</Button>
						<Button size="icon" aria-label="Upload">
							<Upload />
						</Button>
						<Button disabled>
							<Spinner />
							Please wait
						</Button>
					</div>
					<div class="flex flex-wrap gap-2">
						<Badge>Badge</Badge>
						<Badge variant="secondary">Secondary</Badge>
						<Badge variant="outline">Outline</Badge>
						<Badge variant="destructive">Destructive</Badge>
						<Badge variant="danger">Danger</Badge>
						<Badge variant="warning">Warning</Badge>
						<Badge variant="info">Info</Badge>
						<Badge variant="success">Success</Badge>
						<Badge statusType={sampleStatusType}>Status Type</Badge>
					</div>
					<ButtonGroup.Root>
						<Button variant="outline">Roster</Button>
						<Button variant="outline">Training</Button>
						<Button variant="outline">Tasks</Button>
					</ButtonGroup.Root>
				</section>

				<section class="grid gap-4" aria-labelledby="forms-title">
					<h2 id="forms-title" class="text-xl font-semibold tracking-tight">Forms</h2>
					<div class="grid gap-4 md:grid-cols-2">
						<div class="grid gap-2">
							<Label for="showroom-title">Task title</Label>
							<Input id="showroom-title" value="Weapons qualification follow-up" />
						</div>
						<div class="grid gap-2">
							<Label for="showroom-disabled">Disabled</Label>
							<Input id="showroom-disabled" value="Locked after approval" disabled />
						</div>
						<div class="grid gap-2">
							<Label for="showroom-invalid">Invalid</Label>
							<Input id="showroom-invalid" value="Missing date" aria-invalid="true" />
						</div>
						<div class="grid gap-2">
							<Label>Status</Label>
							<Select.Root type="single" bind:value={selectedStatus}>
								<Select.Trigger>{selectedStatusLabel}</Select.Trigger>
								<Select.Content>
									{#each statuses as status (status.value)}
										<Select.Item value={status.value} label={status.label} />
									{/each}
								</Select.Content>
							</Select.Root>
						</div>
						<div class="grid gap-2">
							<Label for="showroom-notes">Notes</Label>
							<Textarea id="showroom-notes" value="Bring documentation to the training room before closeout." />
						</div>
						<div class="grid gap-2">
							<Label for="showroom-file">File upload</Label>
							<Input id="showroom-file" type="file" bind:files />
							<p class="text-sm text-muted-foreground">
								{files?.length ? `${files.length} file selected` : 'No file selected'}
							</p>
						</div>
					</div>
					<div class="flex flex-wrap gap-6">
						<div class="flex items-center gap-2">
							<Checkbox id="include-detached" bind:checked={includeDetached} />
							<Label for="include-detached">Include detached personnel</Label>
						</div>
						<div class="flex items-center gap-2">
							<Switch id="require-review" bind:checked={requireReview} />
							<Label for="require-review">Require review</Label>
						</div>
					</div>
					<RadioGroup.Root bind:value={radioValue}>
						<div class="flex items-center gap-2">
							<RadioGroup.Item value="standard" id="standard" />
							<Label for="standard">Standard</Label>
						</div>
						<div class="flex items-center gap-2">
							<RadioGroup.Item value="expedited" id="expedited" />
							<Label for="expedited">Expedited</Label>
						</div>
					</RadioGroup.Root>
					<InputGroup.Root>
						<InputGroup.Addon>
							<Search />
						</InputGroup.Addon>
						<InputGroup.Input placeholder="Search personnel" />
						<InputGroup.Button variant="ghost" size="icon-sm" aria-label="Search options">
							<ChevronDown />
						</InputGroup.Button>
					</InputGroup.Root>
				</section>

				<section class="grid gap-4" aria-labelledby="toolbar-title">
					<h2 id="toolbar-title" class="text-xl font-semibold tracking-tight">Route toolbar</h2>

					{#snippet toolbarFilters()}
						<Select.Root type="single" bind:value={toolbarGroup}>
							<Select.Trigger class="w-full" aria-label="Calendar group filter">
								{toolbarGroupLabel}
							</Select.Trigger>
							<Select.Content>
								{#each toolbarGroupOptions as option (option.value)}
									<Select.Item value={option.value} label={option.label} />
								{/each}
							</Select.Content>
						</Select.Root>

						<Select.Root type="single" bind:value={toolbarStatus}>
							<Select.Trigger class="w-full" aria-label="Calendar status filter">
								{toolbarStatusLabel}
							</Select.Trigger>
							<Select.Content>
								{#each toolbarStatusOptions as option (option.value)}
									<Select.Item value={option.value} label={option.label} />
								{/each}
							</Select.Content>
						</Select.Root>

						<Button
							variant={toolbarGapsOnly ? 'secondary' : 'outline'}
							aria-pressed={toolbarGapsOnly}
							onclick={() => (toolbarGapsOnly = !toolbarGapsOnly)}
						>
							Gaps only
						</Button>
					{/snippet}

					<WorkspaceToolbar.Root ariaLabel="Showroom route toolbar controls">
						<WorkspaceToolbar.Group label="Calendar view mode">
							<ButtonGroup.Root aria-label="Calendar view mode">
								<Button
									variant={toolbarView === 'month' ? 'secondary' : 'outline'}
									aria-pressed={toolbarView === 'month'}
									onclick={() => (toolbarView = 'month')}
								>
									Month
								</Button>
								<Button
									variant={toolbarView === 'long-range' ? 'secondary' : 'outline'}
									aria-pressed={toolbarView === 'long-range'}
									onclick={() => (toolbarView = 'long-range')}
								>
									Long range
								</Button>
							</ButtonGroup.Root>
						</WorkspaceToolbar.Group>

						<WorkspaceToolbar.Group label="Calendar filters" activeCount={activeToolbarFilters}>
							<DropdownMenu.Root>
								<DropdownMenu.Trigger>
									{#snippet child({ props })}
										<Button variant="outline" {...props}>
											<Filter />
											Filters
											{#if activeToolbarFilters > 0}
												<span class="rounded-full bg-primary px-1.5 py-0.5 text-[0.625rem] text-primary-foreground">
													{activeToolbarFilters}
												</span>
											{/if}
										</Button>
									{/snippet}
								</DropdownMenu.Trigger>
								<DropdownMenu.Content class="w-[min(22rem,calc(100vw-2rem))] p-2" align="start">
									<div class="grid gap-2">
										{@render toolbarFilters()}
									</div>
								</DropdownMenu.Content>
							</DropdownMenu.Root>
						</WorkspaceToolbar.Group>

						<WorkspaceToolbar.Group label="Calendar search" class="min-w-0 shrink">
							<InputGroup.Root class="w-40 sm:w-56">
								<InputGroup.Addon>
									<Search />
								</InputGroup.Addon>
								<InputGroup.Input
									bind:value={toolbarSearch}
									type="search"
									placeholder="Search..."
									aria-label="Search roster"
								/>
							</InputGroup.Root>
						</WorkspaceToolbar.Group>

						<WorkspaceToolbar.Group label="Calendar actions" zone="actions">
							<Button variant="default" class="hidden sm:inline-flex">
								<CalendarIcon />
								Add status
							</Button>
							<Button variant="default" size="icon" class="sm:hidden" aria-label="Add status">
								<CalendarIcon />
							</Button>
							<DropdownMenu.Root>
								<DropdownMenu.Trigger>
									{#snippet child({ props })}
										<Button variant="outline" size="icon" aria-label="More calendar actions" {...props}>
											<MoreHorizontal />
										</Button>
									{/snippet}
								</DropdownMenu.Trigger>
								<DropdownMenu.Content align="end">
									<DropdownMenu.Label>Calendar actions</DropdownMenu.Label>
									<DropdownMenu.Item>
										<Upload />
										Import CSV
									</DropdownMenu.Item>
									<DropdownMenu.Item>
										<Download />
										Export Excel
									</DropdownMenu.Item>
									<DropdownMenu.Item>
										<Printer />
										Print / PDF
									</DropdownMenu.Item>
									<DropdownMenu.Separator />
									<DropdownMenu.Item>
										<Settings />
										Settings
									</DropdownMenu.Item>
								</DropdownMenu.Content>
							</DropdownMenu.Root>
						</WorkspaceToolbar.Group>
					</WorkspaceToolbar.Root>

					<div class="grid gap-3">
						<p class="text-sm text-muted-foreground">
							Constrained row with icon-only actions, disabled, and loading states.
						</p>
						<WorkspaceToolbar.Root ariaLabel="Constrained route toolbar controls" class="max-w-[30rem]">
							<WorkspaceToolbar.Group label="Compact view mode">
								<ButtonGroup.Root aria-label="Compact view mode">
									<Button
										size="icon"
										variant={toolbarView === 'month' ? 'secondary' : 'outline'}
										aria-pressed={toolbarView === 'month'}
										aria-label="Month view"
										onclick={() => (toolbarView = 'month')}
									>
										<CalendarIcon />
									</Button>
									<Button
										size="icon"
										variant={toolbarView === 'long-range' ? 'secondary' : 'outline'}
										aria-pressed={toolbarView === 'long-range'}
										aria-label="Long range view"
										onclick={() => (toolbarView = 'long-range')}
									>
										<ClipboardList />
									</Button>
								</ButtonGroup.Root>
							</WorkspaceToolbar.Group>

							<WorkspaceToolbar.Group label="Constrained filters" activeCount={activeToolbarFilters}>
								<DropdownMenu.Root>
									<DropdownMenu.Trigger>
										{#snippet child({ props })}
											<Button variant="outline" size="icon" aria-label="Open constrained filters" {...props}>
												<Filter />
											</Button>
										{/snippet}
									</DropdownMenu.Trigger>
									<DropdownMenu.Content class="w-[min(22rem,calc(100vw-2rem))] p-2" align="start">
										<div class="grid gap-2">
											{@render toolbarFilters()}
										</div>
									</DropdownMenu.Content>
								</DropdownMenu.Root>
							</WorkspaceToolbar.Group>

							<WorkspaceToolbar.Group label="Constrained search" class="min-w-0 shrink">
								<InputGroup.Root class="w-32">
									<InputGroup.Addon>
										<Search />
									</InputGroup.Addon>
									<InputGroup.Input
										bind:value={toolbarSearch}
										type="search"
										placeholder="Search"
										aria-label="Compact search roster"
									/>
								</InputGroup.Root>
							</WorkspaceToolbar.Group>

							<WorkspaceToolbar.Group label="Constrained actions" zone="actions">
								<Button variant="default" size="icon" aria-label="Add status">
									<CalendarIcon />
								</Button>
								<Button variant="outline" size="icon" aria-label="Export roster">
									<Download />
								</Button>
								<Button variant="outline" size="icon" aria-label="Import roster disabled" disabled>
									<Upload />
								</Button>
								<Button variant="outline" size="icon" aria-label="Syncing roster" disabled>
									<Spinner />
								</Button>
								<DropdownMenu.Root>
									<DropdownMenu.Trigger>
										{#snippet child({ props })}
											<Button variant="outline" size="icon" aria-label="More constrained actions" {...props}>
												<MoreHorizontal />
											</Button>
										{/snippet}
									</DropdownMenu.Trigger>
									<DropdownMenu.Content align="end">
										<DropdownMenu.Label>More actions</DropdownMenu.Label>
										<DropdownMenu.Item>
											<Printer />
											Print / PDF
										</DropdownMenu.Item>
										<DropdownMenu.Item>
											<Settings />
											Settings
										</DropdownMenu.Item>
									</DropdownMenu.Content>
								</DropdownMenu.Root>
							</WorkspaceToolbar.Group>
						</WorkspaceToolbar.Root>
					</div>
				</section>

				<section class="grid gap-4" aria-labelledby="selection-title">
					<h2 id="selection-title" class="text-xl font-semibold tracking-tight">Search and multi-select</h2>
					<div class="grid gap-4 md:grid-cols-2">
						<Command.Root>
							<Command.Input placeholder="Search personnel..." />
							<Command.List>
								<Command.Empty>No results found.</Command.Empty>
								<Command.Group heading="Personnel">
									<Command.Item value="avery">Avery Brooks</Command.Item>
									<Command.Item value="maya">Maya Chen</Command.Item>
									<Command.Item value="jon">Jon Bell</Command.Item>
								</Command.Group>
							</Command.List>
						</Command.Root>
						<Combobox.Root items={frameworks} multiple autoHighlight bind:value={selectedFrameworks} label="Frameworks">
							<Combobox.Chips>
								<Combobox.Value>
									{#snippet children(values)}
										{#each values as framework (framework)}
											<Combobox.Chip value={framework}>{framework}</Combobox.Chip>
										{/each}
										<Combobox.ChipsInput placeholder="Add framework" aria-label="Add framework" />
									{/snippet}
								</Combobox.Value>
							</Combobox.Chips>
							<Combobox.Content>
								<Combobox.Empty>No items found.</Combobox.Empty>
								<Combobox.List>
									{#snippet children(item)}
										<Combobox.Item value={item}>{item}</Combobox.Item>
									{/snippet}
								</Combobox.List>
							</Combobox.Content>
						</Combobox.Root>
					</div>
				</section>

				<section class="grid gap-4" aria-labelledby="tabs-title">
					<h2 id="tabs-title" class="text-xl font-semibold tracking-tight">Tabs</h2>
					<Tabs.Root bind:value={tab} class="w-[400px]">
						<Tabs.List>
							<Tabs.Trigger value="account">Account</Tabs.Trigger>
							<Tabs.Trigger value="password">Password</Tabs.Trigger>
						</Tabs.List>
						<Tabs.Content value="account">Make changes to your account here.</Tabs.Content>
						<Tabs.Content value="password">Change your password here.</Tabs.Content>
					</Tabs.Root>
				</section>

				<section class="grid gap-4" aria-labelledby="table-title">
					<h2 id="table-title" class="text-xl font-semibold tracking-tight">Table and pagination</h2>
					<Table.Root>
						<Table.Caption>A list of personnel readiness records.</Table.Caption>
						<Table.Header>
							<Table.Row>
								<Table.Head>Name</Table.Head>
								<Table.Head>Group</Table.Head>
								<Table.Head>Status</Table.Head>
								<Table.Head class="text-right">Readiness</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each personnel as row (row.name)}
								<Table.Row>
									<Table.Cell class="font-medium">{row.name}</Table.Cell>
									<Table.Cell>{row.group}</Table.Cell>
									<Table.Cell>{row.status}</Table.Cell>
									<Table.Cell class="text-right">{row.readiness}%</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
					<Pagination.Root count={30} perPage={10} bind:page>
						{#snippet children({ pages, currentPage })}
							<Pagination.Content>
								<Pagination.Item>
									<Pagination.PrevButton />
								</Pagination.Item>
								{#each pages as pageItem (pageItem.key)}
									{#if pageItem.type === 'ellipsis'}
										<Pagination.Item>
											<Pagination.Ellipsis />
										</Pagination.Item>
									{:else}
										<Pagination.Item>
											<Pagination.Link page={pageItem} isActive={currentPage === pageItem.value} />
										</Pagination.Item>
									{/if}
								{/each}
								<Pagination.Item>
									<Pagination.NextButton />
								</Pagination.Item>
							</Pagination.Content>
						{/snippet}
					</Pagination.Root>
				</section>

				<section class="grid gap-5" aria-labelledby="data-table-title">
					<h2 id="data-table-title" class="text-xl font-semibold tracking-tight">Composable DataTable</h2>

					<div class="grid gap-3">
						<h3 class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
							Basic static table
						</h3>
						<DataTable.DataTable
							data={dataTablePeople.slice(0, 3)}
							columns={dataTableColumns}
							ariaLabel="Basic personnel DataTable"
						/>
					</div>

					<div class="grid gap-3">
						<h3 class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
							Sortable, searchable, paginated, row click
						</h3>
						<DataTable.DataTable
							data={dataTablePeople}
							columns={dataTableColumns}
							ariaLabel="Interactive personnel DataTable"
							showSearch
							searchPlaceholder="Search personnel"
							pageSize={2}
							striped
							onRowClick={(row) => (clickedRow = row.name)}
							rowActionLabel={(row) => `Open ${row.name}`}
						/>
						<p class="text-sm text-muted-foreground">{clickedRow}</p>
					</div>

					<div class="grid gap-3">
						<h3 class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
							Toolbar controls, row actions, disabled action states
						</h3>
						<DataTable.DataTable
							data={dataTablePeople}
							columns={actionColumns}
							ariaLabel="Personnel DataTable with toolbar and row actions"
							disabledRow={(row) => row.disabled ?? false}
						>
							{#snippet toolbar(table)}
								<WorkspaceToolbar.Root ariaLabel="DataTable toolbar controls">
									<WorkspaceToolbar.Group label="DataTable search" class="min-w-0 shrink">
										<DataTable.Search {table} ariaLabel="Search action table" placeholder="Search rows" />
									</WorkspaceToolbar.Group>
									<WorkspaceToolbar.Group label="DataTable actions" zone="actions">
										<Button variant="outline">
											<Download />
											Export
										</Button>
										<Button variant="outline" disabled>
											<Upload />
											Import disabled
										</Button>
									</WorkspaceToolbar.Group>
								</WorkspaceToolbar.Root>
							{/snippet}
							{#snippet cell(row: DataTablePerson, column: ColumnDef<DataTablePerson>)}
								{#if column.key === 'actions'}
									<DataTable.RowActions
										{row}
										actions={rowActions.map((action) => ({
											...action,
											disabled: row.disabled || action.disabled
										}))}
										ariaLabel={`Actions for ${row.name}`}
									/>
								{:else if column.key === 'status'}
									<Badge variant={row.disabled ? 'outline' : 'secondary'}>{row.status}</Badge>
								{:else}
									{String(column.value(row))}
								{/if}
							{/snippet}
						</DataTable.DataTable>
					</div>

					<div class="grid gap-3">
						<h3 class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
							Expandable detail rows
						</h3>
						<DataTable.DataTable
							data={dataTablePeople}
							columns={dataTableColumns}
							ariaLabel="Personnel DataTable with expandable detail rows"
							onRowClick={(row) => (expandedDataTableRow = expandedDataTableRow === row.id ? '' : row.id)}
							rowActionLabel={(row) =>
								`${expandedDataTableRow === row.id ? 'Collapse' : 'Expand'} detail row for ${row.name}`}
							rowDetailVisible={(row) => expandedDataTableRow === row.id}
						>
							{#snippet rowDetail(row: DataTablePerson)}
								<div class="grid gap-1 text-sm text-muted-foreground">
									<span class="font-medium text-foreground">{row.name}</span>
									<span>{row.group} readiness: {row.readiness}%</span>
								</div>
							{/snippet}
						</DataTable.DataTable>
					</div>

					<div class="grid gap-3">
						<h3 class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
							Bulk selection
						</h3>
						<DataTable.DataTable
							data={dataTablePeople}
							columns={selectionColumns}
							ariaLabel="Personnel DataTable with bulk selection"
							disabledRow={(row) => row.disabled ?? false}
						>
							{#snippet toolbar()}
								<DataTable.BulkActions selectedCount={tableSelection.selectedCount} totalCount={dataTablePeople.length}>
									<Button variant="outline" size="sm" disabled={tableSelection.selectedCount === 0}>
										<Trash2 />
										Bulk archive
									</Button>
								</DataTable.BulkActions>
							{/snippet}
							{#snippet headerCell(column: ColumnDef<DataTablePerson>)}
								{#if column.key === 'select'}
									<DataTable.SelectionCheckbox
										checked={tableSelection.allPageRowsSelected}
										indeterminate={tableSelection.somePageRowsSelected}
										ariaLabel="Select all visible personnel"
										onCheckedChange={(checked) => tableSelection.toggleAllPageRows(checked)}
									/>
								{:else}
									{column.header}
								{/if}
							{/snippet}
							{#snippet cell(row: DataTablePerson, column: ColumnDef<DataTablePerson>)}
								{#if column.key === 'select'}
									<DataTable.SelectionCheckbox
										checked={tableSelection.isSelected(row, dataTablePeople.indexOf(row))}
										disabled={row.disabled}
										ariaLabel={`Select ${row.name}`}
										onCheckedChange={(checked) => tableSelection.toggleRow(row, dataTablePeople.indexOf(row), checked)}
									/>
								{:else}
									{String(column.value(row))}
								{/if}
							{/snippet}
						</DataTable.DataTable>
					</div>

					<div class="grid gap-3 md:grid-cols-2">
						<div class="grid gap-3">
							<h3 class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
								Loading state
							</h3>
							<DataTable.DataTable
								data={dataTablePeople}
								columns={dataTableColumns}
								ariaLabel="Loading personnel DataTable"
								loading
								loadingRows={3}
							/>
						</div>
						<div class="grid gap-3">
							<h3 class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
								Empty state
							</h3>
							<DataTable.DataTable
								data={[]}
								columns={dataTableColumns}
								ariaLabel="Empty personnel DataTable"
								emptyMessage="No matching personnel."
							/>
						</div>
					</div>

					<div class="grid gap-3">
						<h3 class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
							Dense operational, grouped, sticky, constrained width
						</h3>
						<div class="max-w-[24rem] overflow-hidden">
							<DataTable.DataTable
								data={dataTablePeople}
								columns={dataTableColumns}
								ariaLabel="Dense grouped personnel DataTable"
								groupBy={{ key: (row) => row.group, label: (key) => `Group ${key}` }}
								compact
								striped
								stickyHeader
								stickyFirstColumn
								maxHeight="18rem"
							/>
						</div>
					</div>

					<div class="dark grid gap-3 rounded-md border border-border bg-background p-4 text-foreground">
						<h3 class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
							Dark mode sample
						</h3>
						<DataTable.DataTable
							data={dataTablePeople.slice(0, 3)}
							columns={dataTableColumns}
							ariaLabel="Dark mode personnel DataTable"
							striped
						/>
					</div>
				</section>

				<section class="grid gap-4" aria-labelledby="date-title">
					<h2 id="date-title" class="text-xl font-semibold tracking-tight">Date picker</h2>
					<div class="max-w-60">
						<DatePicker id="showroom-date-picker" bind:value={date} />
					</div>
				</section>

				<section class="grid gap-4" aria-labelledby="chart-title">
					<h2 id="chart-title" class="text-xl font-semibold tracking-tight">Chart</h2>
					<Chart.Container config={chartConfig} class="min-h-[200px] w-full">
						<svg viewBox="0 0 480 240" role="img" aria-label="Readiness and gaps by day">
							<line x1="40" y1="200" x2="440" y2="200" stroke="hsl(var(--border))" />
							{#each chartRows as row, index (row.label)}
								{@const x = 70 + index * 95}
								{@const readyHeight = row.ready * 1.6}
								{@const gapsHeight = row.gaps * 1.6}
								<rect {x} y={200 - readyHeight} width="28" height={readyHeight} fill="var(--color-ready)" />
								<rect x={x + 34} y={200 - gapsHeight} width="28" height={gapsHeight} fill="var(--color-gaps)" />
								<text x={x + 31} y="224" text-anchor="middle" class="fill-muted-foreground text-xs">{row.label}</text>
							{/each}
						</svg>
					</Chart.Container>
				</section>

				<section class="grid gap-4" aria-labelledby="overlays-title">
					<h2 id="overlays-title" class="text-xl font-semibold tracking-tight">Overlays</h2>
					<div class="flex flex-wrap gap-2">
						<DropdownMenu.Root>
							<DropdownMenu.Trigger>
								{#snippet child({ props })}
									<Button variant="outline" {...props}>
										<MoreHorizontal />
										Open menu
									</Button>
								{/snippet}
							</DropdownMenu.Trigger>
							<DropdownMenu.Content>
								<DropdownMenu.Item>Open record</DropdownMenu.Item>
								<DropdownMenu.Item>Assign task</DropdownMenu.Item>
								<DropdownMenu.Item variant="destructive">Delete draft</DropdownMenu.Item>
							</DropdownMenu.Content>
						</DropdownMenu.Root>

						<Button variant="outline" onclick={() => (standardDialogOpen = true)}>Standard dialog</Button>
						<Button variant="outline" onclick={() => (editDialogOpen = true)}>Edit form dialog</Button>
						<Button variant="outline" onclick={() => (longDialogOpen = true)}>Long body dialog</Button>
						<Button variant="outline" onclick={() => (destructiveConfirmOpen = true)}>Destructive confirm</Button>
						<Button variant="outline" onclick={() => (warningConfirmOpen = true)}>Warning confirm</Button>
						<Button variant="outline" onclick={() => (asyncConfirmOpen = true)}>Async confirm</Button>
						<Button variant="outline" onclick={() => (disabledConfirmOpen = true)}>Disabled confirm</Button>
						<Button variant="outline" onclick={() => (blockedDialogOpen = true)}>Close-blocked dialog</Button>

						<Sheet.Root>
							<Sheet.Trigger>
								{#snippet child({ props })}
									<Button variant="outline" {...props}>Open sheet</Button>
								{/snippet}
							</Sheet.Trigger>
							<Sheet.Content>
								<Sheet.Header>
									<Sheet.Title>Sheet title</Sheet.Title>
									<Sheet.Description>A native shadcn-svelte sheet example.</Sheet.Description>
								</Sheet.Header>
							</Sheet.Content>
						</Sheet.Root>

						<Tooltip.Root>
							<Tooltip.Trigger>
								{#snippet child({ props })}
									<Button variant="outline" {...props}>Tooltip</Button>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content>Native tooltip content</Tooltip.Content>
						</Tooltip.Root>
					</div>
				</section>

				{#if standardDialogOpen}
					<AppDialog.Root bind:open={standardDialogOpen} onClose={() => (standardDialogOpen = false)}>
						<AppDialog.Content>
							<AppDialog.Header>
								<AppDialog.Title>Readiness summary</AppDialog.Title>
								<AppDialog.Description>
									A standard information dialog for short review and acknowledgement flows.
								</AppDialog.Description>
							</AppDialog.Header>
							<AppDialog.Body>
								<p class="text-muted-foreground">
									This shell uses the shared title, description, scroll body, close behavior, and focus path.
								</p>
							</AppDialog.Body>
							<AppDialog.Footer>
								<Button variant="outline" onclick={() => (standardDialogOpen = false)}>Close</Button>
							</AppDialog.Footer>
						</AppDialog.Content>
					</AppDialog.Root>
				{/if}

				{#if editDialogOpen}
					<AppDialog.Root bind:open={editDialogOpen} onClose={() => (editDialogOpen = false)}>
						<AppDialog.Content>
							<AppDialog.Header>
								<AppDialog.Title>Edit personnel metadata</AppDialog.Title>
								<AppDialog.Description
									>Form dialogs keep fields in the scrollable body and actions in the footer.</AppDialog.Description
								>
							</AppDialog.Header>
							<AppDialog.Body>
								<form id="showroom-edit-dialog" class="grid gap-4">
									<div class="grid gap-2">
										<Label for="dialog-name">Name</Label>
										<Input id="dialog-name" value="Avery Brooks" />
									</div>
									<div class="grid gap-2">
										<Label for="dialog-notes">Notes</Label>
										<Textarea id="dialog-notes" rows={4} value="Command review pending." />
									</div>
								</form>
							</AppDialog.Body>
							<AppDialog.Footer>
								<Button variant="outline" onclick={() => (editDialogOpen = false)}>Cancel</Button>
								<Button type="submit" form="showroom-edit-dialog">Save changes</Button>
							</AppDialog.Footer>
						</AppDialog.Content>
					</AppDialog.Root>
				{/if}

				{#if longDialogOpen}
					<AppDialog.Root bind:open={longDialogOpen} onClose={() => (longDialogOpen = false)}>
						<AppDialog.Content size="wide">
							<AppDialog.Header>
								<AppDialog.Title>Review import warnings</AppDialog.Title>
								<AppDialog.Description>
									Long dialogs keep body content scrollable while footer actions remain reachable.
								</AppDialog.Description>
							</AppDialog.Header>
							<AppDialog.Body class="grid gap-3">
								{#each Array.from({ length: 16 }) as _, index (index)}
									<div class="rounded-lg border p-3">
										<p class="font-medium">Row {index + 1}</p>
										<p class="text-muted-foreground">
											Review the incoming record, confirm the group assignment, and correct missing readiness metadata.
										</p>
									</div>
								{/each}
							</AppDialog.Body>
							<AppDialog.Footer>
								<Button variant="outline" onclick={() => (longDialogOpen = false)}>Back</Button>
								<Button>Accept reviewed rows</Button>
							</AppDialog.Footer>
						</AppDialog.Content>
					</AppDialog.Root>
				{/if}

				{#if blockedDialogOpen}
					<AppDialog.Root bind:open={blockedDialogOpen} closeBlocked onClose={() => (blockedDialogOpen = false)}>
						<AppDialog.Content closeBlocked>
							<AppDialog.Header>
								<AppDialog.Title>Saving organization policy</AppDialog.Title>
								<AppDialog.Description>
									Escape, outside click, and the close button are blocked while the operation is in flight.
								</AppDialog.Description>
							</AppDialog.Header>
							<AppDialog.Body>
								<div class="flex items-center gap-2 text-muted-foreground">
									<Spinner />
									<span>Saving policy changes...</span>
								</div>
							</AppDialog.Body>
							<AppDialog.Footer>
								<Button variant="outline" disabled>Cancel</Button>
								<Button disabled><Spinner />Saving</Button>
							</AppDialog.Footer>
						</AppDialog.Content>
					</AppDialog.Root>
				{/if}

				{#if destructiveConfirmOpen}
					<ConfirmDialog
						title="Delete training draft"
						message="This removes the draft and cannot be undone."
						confirmLabel="Delete draft"
						variant="destructive"
						onConfirm={() => {
							destructiveConfirmOpen = false;
						}}
						onCancel={() => (destructiveConfirmOpen = false)}
					/>
				{/if}

				{#if warningConfirmOpen}
					<ConfirmDialog
						title="Archive selected personnel"
						message="Archived personnel leave active rosters and reports, but their records remain available."
						confirmLabel="Archive personnel"
						variant="warning"
						onConfirm={() => {
							warningConfirmOpen = false;
						}}
						onCancel={() => (warningConfirmOpen = false)}
					/>
				{/if}

				{#if asyncConfirmOpen}
					<ConfirmDialog
						title="Apply access changes"
						message="The confirm action is intentionally shown in a busy state."
						confirmLabel="Applying"
						variant="primary"
						loading
						onConfirm={() => undefined}
						onCancel={() => (asyncConfirmOpen = false)}
					/>
				{/if}

				{#if disabledConfirmOpen}
					<ConfirmDialog
						title="Transfer ownership"
						message="Select a receiving owner before this confirmation can be submitted."
						confirmLabel="Transfer ownership"
						variant="secondary"
						disabled
						onConfirm={() => undefined}
						onCancel={() => (disabledConfirmOpen = false)}
					/>
				{/if}

				<section class="grid gap-4" aria-labelledby="feedback-title">
					<h2 id="feedback-title" class="text-xl font-semibold tracking-tight">Feedback and empty states</h2>
					<Alert.Root>
						<FileText />
						<Alert.Title>Heads up!</Alert.Title>
						<Alert.Description>This is a default alert example.</Alert.Description>
					</Alert.Root>
					<div class="grid gap-4 md:grid-cols-2">
						<Empty.Root>
							<Empty.Header>
								<Empty.Media variant="icon">
									<Inbox />
								</Empty.Media>
								<Empty.Title>No results found</Empty.Title>
								<Empty.Description>Try adjusting your search or filters.</Empty.Description>
							</Empty.Header>
							<Empty.Content>
								<Button variant="outline">Clear filters</Button>
							</Empty.Content>
						</Empty.Root>
						<div class="grid gap-4">
							<Progress value={64} />
							<div class="flex items-center gap-2">
								<Spinner />
								<span class="text-sm text-muted-foreground">Loading</span>
							</div>
							<Skeleton class="h-4 w-[250px]" />
							<Skeleton class="h-4 w-[200px]" />
						</div>
					</div>
				</section>
			</main>
		</Sidebar.Inset>
	</Sidebar.Provider>
</Tooltip.Provider>
