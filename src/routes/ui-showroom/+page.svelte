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
	import * as Field from '$lib/components/ui/field/index.js';
	import * as MultiSelect from '$lib/components/ui/multi-select/index.js';
	import * as NavigationMenu from '$lib/components/ui/navigation-menu/index.js';
	import { NativeSelect } from '$lib/components/ui/native-select/index.js';
	import * as Pagination from '$lib/components/ui/pagination/index.js';
	import { DatePicker } from '$lib/components/ui/date-picker/index.js';
	import * as OnboardingPacketList from '$lib/components/ui/onboarding-packet-list/index.js';
	import * as OperationalMatrix from '$lib/components/ui/operational-matrix/index.js';
	import type { OperationalMatrixCellSelection } from '$lib/components/ui/operational-matrix/index.js';
	import { Progress } from '$lib/components/ui/progress/index.js';
	import * as RadioGroup from '$lib/components/ui/radio-group/index.js';
	import * as ReportWorkspace from '$lib/components/ui/report-workspace/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import Stepper from '$lib/components/ui/Stepper.svelte';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import * as WorkspaceToolbar from '$lib/components/ui/workspace-toolbar/index.js';
	import * as BulkImportWorkspace from '$lib/components/ui/bulk-import-workspace/index.js';
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
	const largePersonnelList = Array.from({ length: 80 }, (_, index) => ({
		value: `person-${String(index + 1).padStart(2, '0')}`,
		label: `Personnel ${String(index + 1).padStart(2, '0')}`,
		description: index % 2 === 0 ? 'HQ' : 'Line company',
		group: index < 20 ? 'HQ' : index < 50 ? 'A Co' : 'B Co'
	}));

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

	type MatrixRow = OperationalMatrix.OperationalMatrixRow & {
		meta: {
			rank: string;
			group: string;
			role: string;
			status: string;
			readiness: number;
		};
	};

	type MatrixColumn = OperationalMatrix.OperationalMatrixColumn & {
		meta: {
			month: 'May' | 'Jun';
			day: string;
			weekday: string;
			window: string;
			today?: boolean;
		};
	};

	type MatrixCellStatus = 'leave' | 'school' | 'field' | 'tdy' | 'appointment' | 'sick' | 'empty';

	const matrixRows: MatrixRow[] = [
		{
			id: 'avery',
			label: 'Brooks, Avery',
			meta: { rank: '1LT', group: 'HQ', role: 'Section lead', status: 'Ready', readiness: 96 }
		},
		{
			id: 'chen',
			label: 'Chen, Maya',
			meta: { rank: 'SFC', group: 'A Co', role: 'Training NCO', status: 'Watch', readiness: 82 }
		},
		{
			id: 'ortiz',
			label: 'Ortiz, Sam',
			meta: { rank: 'SSG', group: 'A Co', role: 'Team leader', status: 'Action', readiness: 68 }
		},
		{
			id: 'bell',
			label: 'Bell, Jon',
			disabled: true,
			meta: { rank: 'SGT', group: 'B Co', role: 'Supply', status: 'Read-only', readiness: 74 }
		},
		{
			id: 'price',
			label: 'Price, Morgan',
			meta: { rank: 'SPC', group: 'B Co', role: 'Platoon sergeant', status: 'Ready', readiness: 91 }
		}
	];

	const matrixColumns: MatrixColumn[] = [
		{ id: 'may-01', label: '1', meta: { month: 'May', day: '1', weekday: 'Fri', window: 'Range week' } },
		{ id: 'may-02', label: '2', meta: { month: 'May', day: '2', weekday: 'Sat', window: 'Range week' } },
		{ id: 'may-03', label: '3', meta: { month: 'May', day: '3', weekday: 'Sun', window: 'Range week' } },
		{ id: 'may-04', label: '4', meta: { month: 'May', day: '4', weekday: 'Mon', window: 'Range week' } },
		{ id: 'may-05', label: '5', meta: { month: 'May', day: '5', weekday: 'Tue', window: 'Range week' } },
		{ id: 'may-06', label: '6', meta: { month: 'May', day: '6', weekday: 'Wed', window: 'Range week' } },
		{ id: 'may-07', label: '7', meta: { month: 'May', day: '7', weekday: 'Thu', window: 'Range week' } },
		{ id: 'may-08', label: '8', meta: { month: 'May', day: '8', weekday: 'Fri', window: 'Range week', today: true } },
		{ id: 'may-09', label: '9', meta: { month: 'May', day: '9', weekday: 'Sat', window: 'Range week' } },
		{ id: 'may-10', label: '10', meta: { month: 'May', day: '10', weekday: 'Sun', window: 'Range week' } },
		{ id: 'may-11', label: '11', meta: { month: 'May', day: '11', weekday: 'Mon', window: 'Field week' } },
		{ id: 'may-12', label: '12', meta: { month: 'May', day: '12', weekday: 'Tue', window: 'Field week' } },
		{ id: 'may-13', label: '13', meta: { month: 'May', day: '13', weekday: 'Wed', window: 'Field week' } },
		{ id: 'jun-02', label: '2', meta: { month: 'Jun', day: '2', weekday: 'Tue', window: 'School' } },
		{ id: 'jun-03', label: '3', meta: { month: 'Jun', day: '3', weekday: 'Wed', window: 'School' } },
		{
			id: 'jun-04',
			label: '4',
			readOnly: true,
			meta: { month: 'Jun', day: '4', weekday: 'Thu', window: 'Locked window' }
		}
	];

	const matrixRowGroups: OperationalMatrix.OperationalMatrixRowGroup[] = [
		{ id: 'hq', label: 'Headquarters', rowIds: ['avery'] },
		{ id: 'alpha', label: 'A Company', rowIds: ['chen', 'ortiz'] },
		{ id: 'bravo', label: 'B Company', rowIds: ['bell', 'price'] }
	];

	const matrixColumnGroups = [
		{ id: 'may', label: 'May 2026', columnSpan: 13 },
		{ id: 'jun', label: 'June 2026', columnSpan: 3 }
	];

	const matrixStatusByCell: Record<string, Record<string, MatrixCellStatus>> = {
		avery: {
			'jun-02': 'school',
			'jun-03': 'school',
			'jun-04': 'school'
		},
		chen: {
			'may-01': 'school',
			'may-02': 'school',
			'may-11': 'school',
			'may-12': 'school',
			'may-13': 'school'
		},
		ortiz: {
			'may-03': 'leave',
			'may-04': 'leave',
			'may-05': 'leave',
			'may-06': 'leave',
			'may-07': 'leave',
			'may-08': 'leave',
			'may-09': 'leave',
			'jun-03': 'sick'
		},
		bell: {
			'may-04': 'tdy',
			'may-08': 'field'
		},
		price: {
			'may-08': 'school',
			'may-09': 'school',
			'may-10': 'school',
			'may-11': 'school',
			'may-12': 'school',
			'may-13': 'school',
			'jun-02': 'appointment'
		}
	};

	let selectedStatus = $state('ready');
	let nativeStatus = $state('ready');
	let selectedPerson = $state('person-12');
	let tab = $state('account');
	let date = $state('2026-05-06');
	let page = $state(2);
	let includeDetached = $state(false);
	let requireReview = $state(true);
	let radioValue = $state('standard');
	let files = $state<FileList>();
	let selectedFrameworks = $state<string[]>(['Next.js']);
	let selectedToolbarFilters = $state<string[]>(['SvelteKit', 'Astro']);
	let importSource = $state<'upload' | 'paste' | 'manual'>('upload');
	let pasteImportRows = $state('Last Name,First Name,Rank\nBrooks,Avery,CPT\nChen,Maya,SGT');
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
	let matrixDialogOpen = $state(false);
	let packetListOpen = $state('active-packet');
	let packetNotesOpen = $state(true);
	let emptyPacketNotesOpen = $state(false);
	let clickedRow = $state('No row selected');
	let expandedDataTableRow = $state('2');
	let selectedMatrixCell = $state({ rowId: 'avery', columnId: 'may-27' });
	let activeMatrixSelection = $state<OperationalMatrixCellSelection | undefined>();
	const tableSelection = useDataTableSelection({
		rows: () => dataTablePeople,
		rowKey: (row) => row.id,
		disabledRow: (row) => row.disabled ?? false
	});
	const importSelection = useDataTableSelection({
		rows: () => dataTablePeople,
		rowKey: (row) => row.id,
		disabledRow: (row) => row.disabled ?? false
	});

	const selectedStatusLabel = $derived(statuses.find((status) => status.value === selectedStatus)?.label ?? 'Status');
	const selectedPersonLabel = $derived(
		largePersonnelList.find((person) => person.value === selectedPerson)?.label ?? 'Search personnel'
	);
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

	function showroomImportRowStatus(row: DataTablePerson): BulkImportWorkspace.BulkImportRowStatus {
		if (row.disabled) {
			return { tone: 'error', label: 'Missing group', description: 'Resolve validation errors before import.' };
		}

		if (row.status === 'Action') {
			return { tone: 'warning', description: 'Import is allowed, but this row needs review.' };
		}

		if (row.status === 'Watch') {
			return { tone: 'duplicate', description: 'Possible duplicate matched by name.' };
		}

		return { tone: 'valid', description: 'Ready to import.' };
	}

	function matrixCellStatus(row: MatrixRow, column: MatrixColumn): MatrixCellStatus {
		return matrixStatusByCell[row.id]?.[column.id] ?? 'empty';
	}

	function matrixCellTone(status: MatrixCellStatus) {
		if (status === 'leave') {
			return 'bg-emerald-600 text-white';
		}

		if (status === 'school') {
			return 'bg-sky-600 text-white';
		}

		if (status === 'field') {
			return 'bg-amber-700 text-white';
		}

		if (status === 'tdy') {
			return 'bg-violet-600 text-white';
		}

		if (status === 'appointment') {
			return 'bg-orange-500 text-white';
		}

		if (status === 'sick') {
			return 'bg-red-600 text-white';
		}

		return 'bg-transparent text-transparent';
	}

	function matrixCellText(status: MatrixCellStatus) {
		const labels: Record<MatrixCellStatus, string> = {
			leave: 'Leave',
			school: 'School',
			field: 'Field',
			tdy: 'TDY',
			appointment: 'Appointment',
			sick: 'Sick',
			empty: 'Available'
		};

		return labels[status];
	}

	function matrixCellLabel(row: MatrixRow, column: MatrixColumn) {
		const state = row.disabled
			? 'disabled'
			: column.readOnly
				? 'read only'
				: matrixCellText(matrixCellStatus(row, column));
		return `${row.label}, ${column.meta.month} ${column.meta.day}, ${state}`;
	}

	function handleMatrixCellSelect(selection: OperationalMatrixCellSelection) {
		selectedMatrixCell = { rowId: selection.rowId, columnId: selection.columnId };
		activeMatrixSelection = selection;
		matrixDialogOpen = true;
	}
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
						<Button variant="link">Link</Button>
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
						<Field.Root>
							<Field.Label for="showroom-title">Task title <span aria-hidden="true">*</span></Field.Label>
							<Field.Control>
								<Input id="showroom-title" value="Weapons qualification follow-up" required />
							</Field.Control>
							<Field.Description>Shown in task lists, reports, and import review.</Field.Description>
						</Field.Root>
						<Field.Root data-invalid>
							<Field.Label for="showroom-invalid">Invalid</Field.Label>
							<Field.Control>
								<Input
									id="showroom-invalid"
									value="Missing date"
									aria-invalid="true"
									aria-describedby="showroom-invalid-error"
								/>
							</Field.Control>
							<Field.Error id="showroom-invalid-error">A completion date is required.</Field.Error>
						</Field.Root>
						<Field.Root>
							<Field.Label for="showroom-disabled">Disabled</Field.Label>
							<Field.Control>
								<Input id="showroom-disabled" value="Locked after approval" disabled />
							</Field.Control>
						</Field.Root>
						<Field.Root>
							<Field.Label for="showroom-readonly">Read-only</Field.Label>
							<Field.Control>
								<Input id="showroom-readonly" value="System managed" readonly />
							</Field.Control>
						</Field.Root>
						<div class="grid gap-2">
							<Label for="showroom-native-status">Native select</Label>
							<NativeSelect id="showroom-native-status" bind:value={nativeStatus}>
								{#each statuses as status (status.value)}
									<option value={status.value}>{status.label}</option>
								{/each}
							</NativeSelect>
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
						<Field.Root>
							<Field.Label>Large-list combobox</Field.Label>
							<Field.Control>
								<Combobox.Root
									items={largePersonnelList}
									name="showroomPersonId"
									autoHighlight
									bind:value={selectedPerson}
									label="Personnel lookup"
								>
									<Combobox.Trigger clearable aria-label="Personnel lookup">{selectedPersonLabel}</Combobox.Trigger>
									<Combobox.Content>
										<Combobox.Empty>No personnel found.</Combobox.Empty>
										<Combobox.List>
											{#snippet children(value, option)}
												<Combobox.Item {value} label={option.label} description={option.description} />
											{/snippet}
										</Combobox.List>
									</Combobox.Content>
								</Combobox.Root>
							</Field.Control>
							<Field.Description>Clearable search for long option lists.</Field.Description>
						</Field.Root>
						<Field.Root>
							<Field.Label>Loading options</Field.Label>
							<Field.Control>
								<Combobox.Root items={[]} loading loadingText="Loading personnel..." label="Loading personnel">
									<Combobox.Trigger aria-label="Loading personnel">Search personnel</Combobox.Trigger>
									<Combobox.Content>
										<Combobox.List />
									</Combobox.Content>
								</Combobox.Root>
							</Field.Control>
						</Field.Root>
					</div>
					<div class="grid gap-4 md:grid-cols-2">
						<Field.Group>
							<Field.Root orientation="horizontal">
								<Checkbox id="include-detached" bind:checked={includeDetached} />
								<Field.Label for="include-detached">Include detached personnel</Field.Label>
							</Field.Root>
							<Field.Root orientation="horizontal">
								<Switch id="require-review" bind:checked={requireReview} />
								<Field.Label for="require-review">Require review</Field.Label>
							</Field.Root>
						</Field.Group>
						<RadioGroup.Root bind:value={radioValue}>
							<Field.Root orientation="horizontal">
								<RadioGroup.Item value="standard" id="standard" />
								<Field.Label for="standard">Standard</Field.Label>
							</Field.Root>
							<Field.Root orientation="horizontal">
								<RadioGroup.Item value="expedited" id="expedited" />
								<Field.Label for="expedited">Expedited</Field.Label>
							</Field.Root>
						</RadioGroup.Root>
					</div>
					<InputGroup.Root>
						<InputGroup.Addon>
							<Search />
						</InputGroup.Addon>
						<InputGroup.Input placeholder="Search personnel" />
						<InputGroup.Button variant="ghost" size="icon-sm" aria-label="Search options">
							<ChevronDown />
						</InputGroup.Button>
					</InputGroup.Root>
					<div class="sr-only" aria-live="polite">
						{selectedToolbarFilters.length} toolbar filters selected
					</div>
				</section>

				<section class="grid gap-4" aria-labelledby="legacy-forms-title">
					<h2 id="legacy-forms-title" class="text-xl font-semibold tracking-tight">Legacy baseline references</h2>
					<div class="grid gap-4 md:grid-cols-2">
						<div class="grid gap-2">
							<Label for="showroom-title-legacy">Legacy-shaped input reference</Label>
							<Input id="showroom-title-legacy" value="Weapons qualification follow-up" />
						</div>
					</div>
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

						<WorkspaceToolbar.Group label="Framework filters" activeCount={selectedToolbarFilters.length}>
							<MultiSelect.Root
								items={frameworks}
								multiple
								name="showroomFrameworkFilters"
								bind:value={selectedToolbarFilters}
								label="Framework filters"
							>
								<MultiSelect.Trigger>
									<MultiSelect.Value>
										{#snippet children(values)}
											{#if values.length === 0}
												<MultiSelect.Input placeholder="Frameworks" aria-label="Framework filters" />
											{:else}
												<span>{values.length} selected</span>
												<MultiSelect.Input aria-label="Framework filters" />
											{/if}
										{/snippet}
									</MultiSelect.Value>
								</MultiSelect.Trigger>
								<MultiSelect.Content>
									<MultiSelect.Empty>No filters found.</MultiSelect.Empty>
									<MultiSelect.List>
										{#snippet children(item)}
											<MultiSelect.Item value={item}>{item}</MultiSelect.Item>
										{/snippet}
									</MultiSelect.List>
								</MultiSelect.Content>
							</MultiSelect.Root>
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
						<MultiSelect.Root
							items={frameworks}
							multiple
							name="showroomTrainingFilters"
							autoHighlight
							bind:value={selectedFrameworks}
							label="Training filters"
						>
							<MultiSelect.Trigger>
								<MultiSelect.Value>
									{#snippet children(values)}
										{#each values as framework (framework)}
											<MultiSelect.Chip value={framework}>{framework}</MultiSelect.Chip>
										{/each}
										<MultiSelect.Input placeholder="Select training filters" aria-label="Training filters" />
									{/snippet}
								</MultiSelect.Value>
							</MultiSelect.Trigger>
							<MultiSelect.Content>
								<MultiSelect.Empty>No filters found.</MultiSelect.Empty>
								<MultiSelect.List>
									{#snippet children(item)}
										<MultiSelect.Item value={item}>{item}</MultiSelect.Item>
									{/snippet}
								</MultiSelect.List>
							</MultiSelect.Content>
						</MultiSelect.Root>
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

				<section class="grid gap-5" aria-labelledby="operational-matrix-title">
					<div class="flex flex-col gap-1">
						<h2 id="operational-matrix-title" class="text-xl font-semibold tracking-tight">Operational matrix</h2>
						<p class="max-w-3xl text-sm text-muted-foreground">
							Headless compound table primitive for dense row-by-column workflows. The example styles live in the
							showroom wrapper; the shared primitive only provides structure, identity, selection, and data hooks.
						</p>
					</div>

					<OperationalMatrix.Root
						rows={matrixRows}
						columns={matrixColumns}
						rowGroups={matrixRowGroups}
						selectedCell={selectedMatrixCell}
						onCellSelect={handleMatrixCellSelect}
						class="grid gap-3"
					>
						<div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
							<Badge variant="outline">Grouped rows</Badge>
							<Badge variant="outline">Sticky axes</Badge>
							<Badge variant="outline">Dialog-trigger cells</Badge>
							<Badge variant="outline">Color cells include accessible labels</Badge>
						</div>

						<OperationalMatrix.Viewport
							ariaLabel="Operational matrix showroom viewport"
							maxHeight="28rem"
							class="rounded-md border border-border bg-card shadow-xs"
						>
							<OperationalMatrix.Table
								ariaLabel="Operational matrix showroom example"
								class="min-w-[76rem] table-fixed text-sm [&_[data-matrix-column-header]]:border [&_[data-matrix-column-header]]:border-border [&_[data-matrix-column-header]]:bg-muted/70 [&_[data-matrix-column-header]]:text-left [&_[data-matrix-column-header]]:font-mono [&_[data-matrix-column-header]]:text-[10px] [&_[data-matrix-column-header]]:font-semibold [&_[data-matrix-column-header]]:uppercase [&_[data-matrix-cell]]:h-10 [&_[data-matrix-cell]]:w-12 [&_[data-matrix-cell]]:border [&_[data-matrix-cell]]:border-border [&_[data-matrix-cell]]:p-0 [&_[data-slot=operational-matrix-cell-content]]:flex [&_[data-slot=operational-matrix-cell-content]]:h-10 [&_[data-slot=operational-matrix-cell-content]]:w-full [&_[data-slot=operational-matrix-cell-content]]:items-stretch [&_[data-slot=operational-matrix-cell-content]]:justify-stretch [&_[data-slot=operational-matrix-cell-trigger]]:flex [&_[data-slot=operational-matrix-cell-trigger]]:h-10 [&_[data-slot=operational-matrix-cell-trigger]]:w-full [&_[data-slot=operational-matrix-cell-trigger]]:items-stretch [&_[data-slot=operational-matrix-cell-trigger]]:justify-stretch [&_[data-slot=operational-matrix-cell-trigger]]:focus-visible:outline-hidden [&_[data-slot=operational-matrix-cell-trigger]]:focus-visible:ring-2 [&_[data-slot=operational-matrix-cell-trigger]]:focus-visible:ring-ring [&_[data-slot=operational-matrix-cell-trigger]]:focus-visible:ring-inset [&_[data-selected=true]]:ring-2 [&_[data-selected=true]]:ring-foreground [&_[data-selected=true]]:ring-inset [&_[data-disabled=true]]:opacity-45 [&_[data-readonly=true]]:bg-muted/30"
							>
								<colgroup>
									<col class="w-64" />
									{#each matrixColumns as column (column.id)}
										<col class="w-14" />
									{/each}
								</colgroup>
								<OperationalMatrix.Header>
									<OperationalMatrix.HeaderRow>
										<OperationalMatrix.CornerCell
											rowSpan={2}
											sticky
											class="sticky left-0 top-0 z-30 w-64 min-w-64 bg-muted"
										>
											Personnel
										</OperationalMatrix.CornerCell>
										{#each matrixColumnGroups as group (group.id)}
											<OperationalMatrix.ColumnGroup
												label={group.label}
												columnSpan={group.columnSpan}
												sticky
												class="sticky top-0 z-20 h-8 bg-muted px-3 text-left"
											/>
										{/each}
									</OperationalMatrix.HeaderRow>
									<OperationalMatrix.HeaderRow>
										{#each matrixColumns as column (column.id)}
											<OperationalMatrix.ColumnHeader
												{column}
												sticky
												class={`sticky top-8 z-20 h-14 w-14 min-w-14 bg-muted px-1 text-center ${column.meta.today ? 'bg-amber-50 shadow-[inset_0_-2px_0_var(--foreground)]' : ''}`}
											>
												<span class="grid gap-0.5 leading-none">
													<span class="text-[10px] tracking-[0.14em] text-muted-foreground">{column.meta.weekday}</span>
													<span class="font-serif text-2xl font-bold normal-case tracking-normal text-foreground">
														{column.label}
													</span>
												</span>
											</OperationalMatrix.ColumnHeader>
										{/each}
									</OperationalMatrix.HeaderRow>
								</OperationalMatrix.Header>

								<OperationalMatrix.Body>
									{#each matrixRowGroups as group (group.id)}
										<OperationalMatrix.RowGroup
											{group}
											columnSpan={matrixColumns.length + 1}
											class="h-4 bg-muted/40 text-[10px] font-semibold uppercase leading-none tracking-[0.18em] text-muted-foreground [&_th]:px-2 [&_th]:py-0 [&_th]:text-center"
										>
											{group.label}
										</OperationalMatrix.RowGroup>

										{#each matrixRows.filter((row) => group.rowIds.includes(row.id)) as row (row.id)}
											<OperationalMatrix.Row {row} class="bg-card hover:bg-muted/20">
												<OperationalMatrix.RowHeader
													{row}
													sticky
													class="sticky left-0 z-10 w-64 min-w-64 border border-border bg-card px-4 py-2 text-left align-middle"
												>
													<span class="flex items-baseline gap-4">
														<span class="w-8 font-mono text-sm font-semibold text-amber-700">{row.meta.rank}</span>
														<span class="grid gap-0.5">
															<span class="font-serif text-base font-semibold">{row.label}</span>
															<span class="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
																{row.meta.role} · {row.meta.group} · {row.meta.readiness}%
															</span>
														</span>
													</span>
												</OperationalMatrix.RowHeader>

												{#each matrixColumns as column (column.id)}
													{@const status = matrixCellStatus(row, column)}
													<OperationalMatrix.Cell
														{row}
														{column}
														readOnly={column.readOnly}
														ariaLabel={`${matrixCellLabel(row, column)}. Open matrix detail.`}
														class={`min-w-12 bg-card ${column.meta.today ? 'bg-amber-50/50' : ''}`}
													>
														<span
															class={`flex h-10 w-full items-start justify-start overflow-hidden px-1.5 py-1 font-mono text-[9px] font-bold uppercase leading-none tracking-[0.06em] ${matrixCellTone(status)}`}
														>
															<span class="truncate" aria-hidden="true">
																{status === 'empty' ? '' : matrixCellText(status)}
															</span>
															<span class="sr-only">{matrixCellLabel(row, column)}</span>
														</span>
													</OperationalMatrix.Cell>
												{/each}
											</OperationalMatrix.Row>
										{/each}
									{/each}
								</OperationalMatrix.Body>
							</OperationalMatrix.Table>
						</OperationalMatrix.Viewport>
					</OperationalMatrix.Root>

					<div class="flex flex-wrap gap-2 text-sm">
						<span class="rounded-sm bg-emerald-600 px-3 py-1 text-white">Leave</span>
						<span class="rounded-sm bg-sky-600 px-3 py-1 text-white">School</span>
						<span class="rounded-sm bg-amber-700 px-3 py-1 text-white">Field/Training</span>
						<span class="rounded-sm bg-violet-600 px-3 py-1 text-white">TDY</span>
						<span class="rounded-sm bg-orange-500 px-3 py-1 text-white">Appointment</span>
						<span class="rounded-sm bg-red-600 px-3 py-1 text-white">Sick</span>
					</div>

					<div class="grid gap-4 md:grid-cols-2">
						<div class="grid gap-3 rounded-lg border bg-card p-4">
							<div class="grid gap-1">
								<h3 class="text-sm font-medium">Loading wrapper</h3>
								<p class="text-sm text-muted-foreground">
									Wrappers own loading state while preserving matrix layout space.
								</p>
							</div>
							<div class="grid gap-2">
								<Skeleton class="h-9 w-full" />
								<Skeleton class="h-9 w-full" />
								<Skeleton class="h-9 w-4/5" />
							</div>
						</div>

						<Empty.Root>
							<Empty.Header>
								<Empty.Media variant="icon">
									<ClipboardList />
								</Empty.Media>
								<Empty.Title>No matrix rows</Empty.Title>
								<Empty.Description
									>Wrapper state renders empty copy without changing the headless primitive.</Empty.Description
								>
							</Empty.Header>
							<Empty.Content>
								<Button variant="outline">Adjust filters</Button>
							</Empty.Content>
						</Empty.Root>
					</div>
				</section>

				{#if matrixDialogOpen && activeMatrixSelection}
					<AppDialog.Root bind:open={matrixDialogOpen} onClose={() => (matrixDialogOpen = false)}>
						<AppDialog.Content>
							<AppDialog.Header>
								<AppDialog.Title>Matrix detail</AppDialog.Title>
								<AppDialog.Description>
									Dialog state is owned by the wrapper. The matrix only emitted row and column identity.
								</AppDialog.Description>
							</AppDialog.Header>
							<AppDialog.Body>
								<div class="grid gap-2 text-sm">
									<p><span class="font-medium">Row:</span> {activeMatrixSelection.row.label}</p>
									<p><span class="font-medium">Column:</span> {activeMatrixSelection.column.label}</p>
									<p>
										<span class="font-medium">Identity:</span>
										{activeMatrixSelection.rowId}:{activeMatrixSelection.columnId}
									</p>
								</div>
							</AppDialog.Body>
							<AppDialog.Footer>
								<Button variant="outline" onclick={() => (matrixDialogOpen = false)}>Close</Button>
							</AppDialog.Footer>
						</AppDialog.Content>
					</AppDialog.Root>
				{/if}

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

				<section class="grid gap-5" aria-labelledby="report-workspace-title">
					<h2 id="report-workspace-title" class="text-xl font-semibold tracking-tight">Report workspace</h2>

					<ReportWorkspace.Root ariaLabel="Showroom report workspace">
						<ReportWorkspace.Header
							title="Calendar readiness report"
							description="Shared report shell for filters, export actions, chart sections, table sections, and durable report states."
							meta={[
								{ label: 'Scope', value: 'A Co' },
								{ label: 'Window', value: '30 days' },
								{ label: 'Rows', value: dataTablePeople.length }
							]}
						/>

						<ReportWorkspace.Toolbar ariaLabel="Showroom report toolbar">
							<WorkspaceToolbar.Group label="Report filters" activeCount={activeToolbarFilters}>
								<WorkspaceToolbar.Select
									options={toolbarGroupOptions}
									value={toolbarGroup}
									ariaLabel="Report group filter"
									onValueChange={(value) => (toolbarGroup = value)}
								/>
								<WorkspaceToolbar.Select
									options={toolbarStatusOptions}
									value={toolbarStatus}
									ariaLabel="Report status filter"
									onValueChange={(value) => (toolbarStatus = value)}
								/>
							</WorkspaceToolbar.Group>
							<WorkspaceToolbar.Group label="Report export actions" zone="actions">
								<ReportWorkspace.ExportActions>
									<ReportWorkspace.ExportAction label="Export CSV" href="/ui-showroom/export.csv" />
									<ReportWorkspace.ExportAction
										label="Export PDF"
										state="disabled"
										disabledReason="Select a date range first"
									/>
									<ReportWorkspace.ExportAction label="Export XLSX" state="loading" loadingLabel="Preparing" />
									<ReportWorkspace.ExportAction
										label="Export packet"
										state="error"
										errorReason="Export service is unavailable"
									/>
								</ReportWorkspace.ExportActions>
							</WorkspaceToolbar.Group>
						</ReportWorkspace.Toolbar>

						<ReportWorkspace.Filters
							title="Report configuration"
							description="Routes provide controls and handlers. The shared component owns structure."
						>
							<Field.Root>
								<Field.Label for="showroom-report-group">Group</Field.Label>
								<NativeSelect id="showroom-report-group" bind:value={nativeStatus}>
									<option value="ready">A Co</option>
									<option value="watch">B Co</option>
								</NativeSelect>
							</Field.Root>
							<Field.Root>
								<Field.Label for="showroom-report-search">Search</Field.Label>
								<Input id="showroom-report-search" bind:value={toolbarSearch} placeholder="Name or MOS" />
							</Field.Root>
							{#snippet dateRange()}
								<div class="flex flex-wrap items-end gap-2" role="group" aria-label="Report date range controls">
									<DatePicker id="report-start-date" bind:value={date} />
									<ButtonGroup.Root aria-label="Quick ranges">
										<Button variant="outline" size="sm">7 days</Button>
										<Button variant="outline" size="sm">30 days</Button>
									</ButtonGroup.Root>
								</div>
							{/snippet}
						</ReportWorkspace.Filters>

						<ReportWorkspace.Content layout="split">
							<ReportWorkspace.Chart
								title="Readiness trend"
								description="Chart shell for report visualizations."
								ariaLabel="Showroom report readiness chart"
								meta="Chart section"
							>
								<Chart.Container config={chartConfig} class="min-h-[180px] w-full">
									<svg viewBox="0 0 480 200" role="img" aria-label="Report readiness trend bars">
										{#each chartRows as row, index (row.label)}
											{@const x = 60 + index * 95}
											<rect
												{x}
												y={180 - row.ready * 1.5}
												width="36"
												height={row.ready * 1.5}
												fill="var(--color-ready)"
											/>
											<text x={x + 18} y="196" text-anchor="middle" class="fill-muted-foreground text-xs"
												>{row.label}</text
											>
										{/each}
									</svg>
								</Chart.Container>
							</ReportWorkspace.Chart>
							<ReportWorkspace.Table
								title="Report rows"
								description="DataTable-backed section for sortable report detail."
								data={dataTablePeople}
								columns={dataTableColumns}
								ariaLabel="Showroom report rows"
								showSearch
								searchPlaceholder="Search report rows"
								pageSize={3}
							/>
						</ReportWorkspace.Content>

						<div class="grid gap-3 md:grid-cols-3">
							<ReportWorkspace.State state="loading" title="Loading report" />
							<ReportWorkspace.State
								state="no-data"
								title="No matching data"
								description="Adjust filters or date range."
							/>
							<ReportWorkspace.State
								state="error"
								title="Report failed"
								description="Refresh the report and try again."
							/>
						</div>

						<div class="dark rounded-md border border-border bg-background p-4 text-foreground">
							<ReportWorkspace.State
								state="no-data"
								title="Dark mode report state"
								description="Shared states preserve contrast."
							/>
						</div>
					</ReportWorkspace.Root>
				</section>

				<section class="grid gap-5" aria-labelledby="bulk-import-workspace-title">
					<h2 id="bulk-import-workspace-title" class="text-xl font-semibold tracking-tight">Bulk import workspace</h2>

					<BulkImportWorkspace.Root ariaLabel="Showroom bulk import workspace">
						<BulkImportWorkspace.Header
							step="Step 1"
							title="Personnel bulk import"
							description="Shared import shell for upload, paste, manual entry, preview, validation, progress, and result states."
							meta={[
								{ label: 'Required', value: 'Rank, first name, last name' },
								{ label: 'Rows', value: dataTablePeople.length }
							]}
						/>

						<BulkImportWorkspace.SourcePicker label="Showroom import source">
							<BulkImportWorkspace.SourceOption
								label="Upload"
								description="Use CSV or XLSX."
								selected={importSource === 'upload'}
								onSelect={() => (importSource = 'upload')}
							/>
							<BulkImportWorkspace.SourceOption
								label="Paste"
								description="Paste copied rows."
								selected={importSource === 'paste'}
								onSelect={() => (importSource = 'paste')}
							/>
							<BulkImportWorkspace.SourceOption
								label="Manual"
								description="Add records one at a time."
								selected={importSource === 'manual'}
								onSelect={() => (importSource = 'manual')}
							/>
						</BulkImportWorkspace.SourcePicker>

						<div class="grid gap-4 lg:grid-cols-2">
							<BulkImportWorkspace.InputPanel
								title="Upload import flow"
								description="File input uses shared field and input primitives."
							>
								<BulkImportWorkspace.FileInput label="Upload personnel file" />
								{#snippet examples()}
									<Button variant="outline" size="sm">Download template</Button>
								{/snippet}
							</BulkImportWorkspace.InputPanel>

							<BulkImportWorkspace.InputPanel
								title="Paste import flow"
								description="Paste input uses the shared textarea presentation."
							>
								<BulkImportWorkspace.PasteInput
									bind:value={pasteImportRows}
									label="Paste personnel rows"
									description="Headers are allowed."
								/>
								{#snippet examples()}
									<Button variant="outline" size="sm">Use example rows</Button>
								{/snippet}
							</BulkImportWorkspace.InputPanel>
						</div>

						<BulkImportWorkspace.ValidationSummary
							title="Validation summary"
							description="Shared UI reports counts. Feature code owns validation rules."
							issues={[
								{ label: 'ready rows', count: 3, tone: 'neutral' },
								{ label: 'warnings', count: 1, tone: 'warning' },
								{ label: 'errors', count: 1, tone: 'error' }
							]}
						/>

						<BulkImportWorkspace.PreviewTable
							rows={dataTablePeople}
							columns={dataTableColumns}
							selection={importSelection}
							rowKey={(row) => row.id}
							disabledRow={(row) => row.disabled ?? false}
							disabledReason={(row) =>
								row.disabled ? 'Resolve validation errors before selecting this row.' : undefined}
							rowStatus={showroomImportRowStatus}
							selectedCountLabel={(selected, total) => `${selected} selected from ${total} preview rows`}
							ariaLabel="Showroom import preview table"
						/>

						<BulkImportWorkspace.ProgressState
							title="Importing selected rows"
							description="Progress state for long-running imports."
							value={60}
						/>

						<div class="grid gap-3 md:grid-cols-3">
							<BulkImportWorkspace.ResultSummary
								status="success"
								items={[
									{ label: 'Created', value: 24 },
									{ label: 'Failed', value: 0 }
								]}
							/>
							<BulkImportWorkspace.ResultSummary
								status="partial"
								description="Some rows imported and some failed."
								items={[
									{ label: 'Created', value: 18 },
									{ label: 'Failed', value: 4 }
								]}
							/>
							<BulkImportWorkspace.ResultSummary
								status="failed"
								description="No rows were saved."
								items={[{ label: 'Failed', value: 22 }]}
							/>
						</div>

						<BulkImportWorkspace.FooterActions disabledReason="Select at least one valid row before importing.">
							<Button variant="outline">Back</Button>
							<Button disabled>Import checked rows</Button>
						</BulkImportWorkspace.FooterActions>

						<div class="dark rounded-md border border-border bg-background p-4 text-foreground">
							<BulkImportWorkspace.ResultSummary
								status="partial"
								description="Dark mode result state."
								items={[
									{ label: 'Created', value: 8 },
									{ label: 'Failed', value: 1 }
								]}
							/>
						</div>
					</BulkImportWorkspace.Root>
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

				<section class="grid gap-4" aria-labelledby="onboarding-packet-list-title">
					<div class="flex flex-col gap-1">
						<h2 id="onboarding-packet-list-title" class="text-xl font-semibold tracking-tight">
							Onboarding packet list
						</h2>
						<p class="max-w-3xl text-sm text-muted-foreground">
							Shared composite workflow list for active, complete, inactive, note-heavy, read-only, and constrained
							packet states.
						</p>
					</div>

					<div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
						<OnboardingPacketList.Root bind:value={packetListOpen}>
							<OnboardingPacketList.Item value="active-packet">
								<OnboardingPacketList.Trigger>
									<OnboardingPacketList.Summary>
										<OnboardingPacketList.SummaryTitle
											title="Lee, Jordan"
											meta={['Initial Entry', 'HQ', 'Started May 1, 2026']}
										/>
										{#snippet progress()}
											<OnboardingPacketList.Progress value={2} max={5} />
										{/snippet}
									</OnboardingPacketList.Summary>
								</OnboardingPacketList.Trigger>
								<OnboardingPacketList.Content>
									<OnboardingPacketList.Actions>
										<Button size="sm">Mark Complete</Button>
										<Button size="sm" variant="outline"><Spinner />Re-sync</Button>
										<Button size="sm" variant="outline">Switch Template</Button>
										<Button size="sm" variant="destructive">Cancel</Button>
									</OnboardingPacketList.Actions>
									<OnboardingPacketList.StepList>
										<OnboardingPacketList.Step
											label="Sponsor brief"
											typeLabel="Checkbox"
											tone="checkbox"
											state="complete"
										>
											{#snippet status()}
												<Checkbox checked aria-label="Mark sponsor brief incomplete" />
											{/snippet}
											<OnboardingPacketList.Notes bind:open={packetNotesOpen} count={2}>
												<OnboardingPacketList.NoteInput value="" onAdd={() => undefined} />
												<OnboardingPacketList.Note text="Sponsor assigned by S1." time="May 1" />
												<OnboardingPacketList.Note text="Brief scheduled after formation." time="May 2" />
											</OnboardingPacketList.Notes>
										</OnboardingPacketList.Step>

										<OnboardingPacketList.Step
											label="Cyber Awareness"
											typeLabel="Training"
											tone="training"
											state="incomplete"
											meta="Annual training"
										>
											{#snippet status()}
												<OnboardingPacketList.StatusIcon state="incomplete" label="Training incomplete" />
												<Button href="/org/demo/training" variant="outline" size="sm">Record Training</Button>
											{/snippet}
										</OnboardingPacketList.Step>

										<OnboardingPacketList.Step
											label="Finance packet"
											typeLabel="Paperwork"
											tone="paperwork"
											state="pending"
										>
											{#snippet status()}
												<Stepper stages={['Issued', 'Submitted', 'Reviewed']} currentStage="Submitted" />
											{/snippet}
											<OnboardingPacketList.Notes bind:open={emptyPacketNotesOpen} count={0}>
												<OnboardingPacketList.NoteInput value="" onAdd={() => undefined} />
											</OnboardingPacketList.Notes>
										</OnboardingPacketList.Step>

										<OnboardingPacketList.Step
											label="Legacy welcome form"
											typeLabel="Removed"
											tone="inactive"
											state="inactive"
											inactiveNote="Removed from template"
										>
											{#snippet status()}
												<Button size="sm" variant="destructive">Remove</Button>
											{/snippet}
										</OnboardingPacketList.Step>
									</OnboardingPacketList.StepList>
								</OnboardingPacketList.Content>
							</OnboardingPacketList.Item>

							<OnboardingPacketList.Item value="complete-packet">
								<OnboardingPacketList.Trigger>
									<OnboardingPacketList.Summary>
										<OnboardingPacketList.SummaryTitle title="Price, Morgan" meta={['Officer Transfer', 'A Co']} />
										{#snippet progress()}
											<OnboardingPacketList.Progress value={3} max={3} label="3/3 complete" />
										{/snippet}
										{#snippet status()}
											<Badge variant="success">Completed</Badge>
										{/snippet}
									</OnboardingPacketList.Summary>
								</OnboardingPacketList.Trigger>
								<OnboardingPacketList.Content>
									<OnboardingPacketList.StepList ariaLabel="Read-only packet steps">
										<OnboardingPacketList.Step
											label="All required steps"
											typeLabel="Checkbox"
											tone="checkbox"
											state="complete"
										>
											{#snippet status()}
												<OnboardingPacketList.StatusIcon state="complete" label="Complete" />
											{/snippet}
											<OnboardingPacketList.Notes count={1} readOnly>
												<OnboardingPacketList.Note text="Closed by onboarding manager." time="May 4" />
											</OnboardingPacketList.Notes>
										</OnboardingPacketList.Step>
									</OnboardingPacketList.StepList>
								</OnboardingPacketList.Content>
							</OnboardingPacketList.Item>
						</OnboardingPacketList.Root>

						<div class="max-w-[360px]">
							<OnboardingPacketList.Root value="history-packet" ariaLabel="Constrained packet example">
								<OnboardingPacketList.Item value="history-packet">
									<OnboardingPacketList.Trigger>
										<OnboardingPacketList.Summary>
											<OnboardingPacketList.SummaryTitle title="Chen, Maya" meta={['History', 'Cancelled May 3']} />
											{#snippet progress()}
												<OnboardingPacketList.Progress value={1} max={4} prefixLabel="Final Progress" />
											{/snippet}
											{#snippet status()}
												<Badge variant="secondary">Cancelled</Badge>
											{/snippet}
										</OnboardingPacketList.Summary>
									</OnboardingPacketList.Trigger>
									<OnboardingPacketList.Content>
										<OnboardingPacketList.StepList ariaLabel="Constrained read-only steps">
											<OnboardingPacketList.Step
												label="Archived checklist"
												typeLabel="Removed"
												tone="inactive"
												state="inactive"
												inactiveNote="Previously completed"
											>
												{#snippet status()}
													<OnboardingPacketList.StatusIcon state="complete" label="Previously completed" />
												{/snippet}
											</OnboardingPacketList.Step>
										</OnboardingPacketList.StepList>
									</OnboardingPacketList.Content>
								</OnboardingPacketList.Item>
							</OnboardingPacketList.Root>
						</div>
					</div>
				</section>

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
