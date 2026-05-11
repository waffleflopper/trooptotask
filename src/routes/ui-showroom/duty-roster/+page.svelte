<script lang="ts">
	import {
		AlertTriangle,
		CalendarDays,
		CircleAlert,
		Clock3,
		ExternalLink,
		Filter,
		Info,
		LockKeyhole,
		MoreHorizontal,
		Play,
		Plus,
		Printer,
		Save,
		Search,
		Settings,
		Trash2,
		Wrench
	} from '@lucide/svelte';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Badge, type BadgeVariant } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Combobox from '$lib/components/ui/combobox/index.js';
	import * as DataTable from '$lib/components/ui/data-table/index.js';
	import type { ColumnDef } from '$lib/components/ui/data-table/index.js';
	import { DatePicker } from '$lib/components/ui/date-picker/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as OperationalMatrix from '$lib/components/ui/operational-matrix/index.js';
	import type { OperationalMatrixColumn, OperationalMatrixRow } from '$lib/components/ui/operational-matrix/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import * as Stepper from '$lib/components/ui/stepper/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import BadgeRow from './BadgeRow.svelte';
	import ExemptionPill from './ExemptionPill.svelte';
	import FactRow from './FactRow.svelte';
	import Metric from './Metric.svelte';
	import MultiSelectField from './MultiSelectField.svelte';
	import SettingsSection from './SettingsSection.svelte';
	import SummaryRail from './SummaryRail.svelte';

	type TemplateRow = {
		id: string;
		name: string;
		slug: string;
		poolSize: number;
		exemptions: number;
		updated: string;
		status: 'active' | 'archived';
	};

	type HistoryRun = {
		id: string;
		range: string;
		acceptedAt: string;
		acceptedBy: string;
		calendar: 'published' | 'invalidated';
		corrections: number;
		state: 'official' | 'applied' | 'needs-sync' | 'invalidated';
		latest?: boolean;
	};

	type PreviewRow = {
		date: string;
		weekday: string;
		generated: string;
		final: string;
		warnings: string;
		status: 'ok' | 'review' | 'unresolved';
		action: 'View' | 'Edit' | 'Resolve';
	};

	type MatrixRow = OperationalMatrixRow & {
		group: string;
	};

	type MatrixColumn = OperationalMatrixColumn & {
		weekday: string;
		date: string;
		sequenceKind: 'weekday' | 'weekend-holiday';
		chargeSequenceStart: number;
		chargeableCount: number;
		specialLabel?: string;
	};

	type MatrixCellTone = 'default' | 'assigned' | 'warning' | 'danger';
	type MatrixCellCode =
		| 'assigned'
		| 'available-not-selected'
		| 'authorized-absence'
		| 'blocked-by-duty'
		| 'misconduct-unavailable';
	type MatrixCell = {
		display: string;
		tone: MatrixCellTone;
		code: MatrixCellCode;
		assigned: boolean;
		chargeable: boolean;
		sequenceNumber: number | null;
		queuePosition: number | null;
		reason: string | null;
	};

	let activeTemplateId = $state('staff-duty-nco');
	let routeTab = $state('generate');
	let previewMode = $state('list');
	let wizardStep = $state('pool');
	let selectedRanks = $state(['SGT', 'SSG', 'SFC']);
	let selectedGroups = $state(['enlisted']);
	let selectedMos = $state(['11B', '11C', '68W']);
	let selectedDutyRoles = $state(['NCO', 'Team Leader']);
	let replacementSoldier = $state('david-wilson');
	let correctionSoldier = $state('');
	let correctionReason = $state('');
	let startDate = $state('2026-05-20');
	let endDate = $state('2026-06-02');

	const templates: TemplateRow[] = [
		{
			id: 'cq-nco',
			name: 'CQ NCO',
			slug: 'cq-nco',
			poolSize: 18,
			exemptions: 2,
			updated: 'May 12, 2026 08:41',
			status: 'active'
		},
		{
			id: 'cq-runner',
			name: 'CQ Runner',
			slug: 'cq-runner',
			poolSize: 24,
			exemptions: 3,
			updated: 'May 11, 2026 14:23',
			status: 'active'
		},
		{
			id: 'staff-duty-nco',
			name: 'Staff Duty NCO',
			slug: 'staff-duty-nco',
			poolSize: 22,
			exemptions: 4,
			updated: 'May 12, 2026 09:15',
			status: 'active'
		},
		{
			id: 'staff-duty-runner',
			name: 'Staff Duty Runner',
			slug: 'staff-duty-runner',
			poolSize: 20,
			exemptions: 3,
			updated: 'May 10, 2026 16:02',
			status: 'active'
		},
		{
			id: 'arms-room',
			name: 'Arms Room',
			slug: 'arms-room',
			poolSize: 16,
			exemptions: 2,
			updated: 'May 9, 2026 11:37',
			status: 'archived'
		}
	];

	const templateColumns: ColumnDef<TemplateRow>[] = [
		{ key: 'name', header: 'Template Name', value: (row) => row.name },
		{ key: 'slug', header: 'Slug', value: (row) => row.slug },
		{ key: 'poolSize', header: 'Pool Size', value: (row) => row.poolSize, align: 'right' },
		{ key: 'exemptions', header: 'Exemptions', value: (row) => row.exemptions, align: 'right' },
		{ key: 'updated', header: 'Last Updated', value: (row) => row.updated },
		{ key: 'actions', header: 'Quick Actions', value: () => '', sortable: false, searchable: false, align: 'right' }
	];

	const historyRuns: HistoryRun[] = [
		{
			id: 'run-1',
			range: 'May 12 - May 25, 2026',
			acceptedAt: 'May 12, 2026 09:15',
			acceptedBy: 'SSG Tyler Monroe',
			calendar: 'published',
			corrections: 0,
			state: 'official',
			latest: true
		},
		{
			id: 'run-2',
			range: 'Apr 28 - May 11, 2026',
			acceptedAt: 'Apr 28, 2026 08:42',
			acceptedBy: 'SGT Melissa Grant',
			calendar: 'published',
			corrections: 0,
			state: 'applied'
		},
		{
			id: 'run-3',
			range: 'Apr 14 - Apr 27, 2026',
			acceptedAt: 'Apr 14, 2026 09:03',
			acceptedBy: 'SSG Tyler Monroe',
			calendar: 'published',
			corrections: 1,
			state: 'needs-sync'
		},
		{
			id: 'run-4',
			range: 'Mar 3 - Mar 16, 2026',
			acceptedAt: 'Mar 5, 2026 10:12',
			acceptedBy: 'SSG Tyler Monroe',
			calendar: 'invalidated',
			corrections: 1,
			state: 'invalidated'
		}
	];

	const historyColumns: ColumnDef<HistoryRun>[] = [
		{ key: 'range', header: 'Date Range', value: (row) => row.range },
		{ key: 'acceptedAt', header: 'Accepted Timestamp', value: (row) => row.acceptedAt },
		{ key: 'acceptedBy', header: 'Accepted By', value: (row) => row.acceptedBy },
		{ key: 'calendar', header: 'Calendar State', value: (row) => row.calendar },
		{ key: 'corrections', header: 'Correction Count', value: (row) => row.corrections, align: 'center' },
		{ key: 'state', header: 'State', value: (row) => row.state },
		{ key: 'latest', header: 'Latest', value: (row) => (row.latest ? 'Latest' : '') },
		{ key: 'actions', header: 'Actions', value: () => '', sortable: false, searchable: false, align: 'right' }
	];

	const previewRows: PreviewRow[] = [
		{
			date: 'May 12, 2026',
			weekday: 'Mon',
			generated: 'SGT James Walker',
			final: 'SGT James Walker',
			warnings: '-',
			status: 'ok',
			action: 'View'
		},
		{
			date: 'May 13, 2026',
			weekday: 'Tue',
			generated: 'SGT Christopher Lee',
			final: 'SGT Christopher Lee',
			warnings: '-',
			status: 'ok',
			action: 'View'
		},
		{
			date: 'May 14, 2026',
			weekday: 'Wed',
			generated: 'SGT Michael Brown',
			final: 'SSG David Wilson',
			warnings: 'Risky choice',
			status: 'review',
			action: 'Edit'
		},
		{
			date: 'May 15, 2026',
			weekday: 'Thu',
			generated: 'SGT Matthew Taylor',
			final: 'SGT Matthew Taylor',
			warnings: '-',
			status: 'ok',
			action: 'View'
		},
		{
			date: 'May 18, 2026',
			weekday: 'Sun',
			generated: '-',
			final: '-',
			warnings: 'No eligible personnel',
			status: 'unresolved',
			action: 'Resolve'
		}
	];

	const soldiers = [
		{ value: 'david-wilson', label: 'SSG David Wilson', description: '11B, Squad Leader', group: 'Eligible' },
		{ value: 'michael-brown', label: 'SGT Michael Brown', description: '11C, Team Leader', group: 'Eligible' },
		{ value: 'alex-johnson', label: 'SGT Alex Johnson', description: '11B, Team Leader', group: 'Outside pool' },
		{ value: 'tyler-morgan', label: 'PFC Tyler Morgan', description: '68W, Runner', group: 'Outside pool' }
	];

	const poolRows = [
		{ name: 'SFC Daniel Martinez', rank: 'SFC', mos: '11B', group: 'Enlisted', role: 'NCO' },
		{ name: 'SSG Michael Johnson', rank: 'SSG', mos: '11C', group: 'Enlisted', role: 'Team Leader' },
		{ name: 'SGT James Wilson', rank: 'SGT', mos: '11B', group: 'Enlisted', role: 'Team Leader' },
		{ name: 'SSG Christopher Lee', rank: 'SSG', mos: '68W', group: 'Enlisted', role: 'NCO' },
		{ name: 'SFC John Davis', rank: 'SFC', mos: '11B', group: 'Enlisted', role: 'NCO' }
	];

	const matrixRows: MatrixRow[] = [
		{ id: 'able', label: 'SGT Able', group: 'Alpha' },
		{ id: 'baker', label: 'SGT Baker', group: 'Bravo' },
		{ id: 'cross', label: 'SPC Cross', group: 'Charlie' },
		{ id: 'davis', label: 'SSG Davis', group: 'Alpha' },
		{ id: 'evans', label: 'PFC Evans', group: 'Bravo' }
	];

	const matrixColumns: MatrixColumn[] = [
		{
			id: 'jun-01',
			label: 'Jun 1',
			weekday: 'MON',
			date: 'Jun 1',
			sequenceKind: 'weekday',
			chargeSequenceStart: 1,
			chargeableCount: 5
		},
		{
			id: 'jun-02',
			label: 'Jun 2',
			weekday: 'TUE',
			date: 'Jun 2',
			sequenceKind: 'weekday',
			chargeSequenceStart: 2,
			chargeableCount: 4
		},
		{
			id: 'jun-03',
			label: 'Jun 3',
			weekday: 'WED',
			date: 'Jun 3',
			sequenceKind: 'weekday',
			chargeSequenceStart: 3,
			chargeableCount: 4
		},
		{
			id: 'jun-04',
			label: 'Jun 4',
			weekday: 'THU',
			date: 'Jun 4',
			sequenceKind: 'weekday',
			chargeSequenceStart: 4,
			chargeableCount: 5
		},
		{
			id: 'jun-05',
			label: 'Jun 5',
			weekday: 'FRI',
			date: 'Jun 5',
			sequenceKind: 'weekday',
			chargeSequenceStart: 5,
			chargeableCount: 5
		},
		{
			id: 'jun-06',
			label: 'Jun 6',
			weekday: 'SAT',
			date: 'Jun 6',
			sequenceKind: 'weekend-holiday',
			chargeSequenceStart: 1,
			chargeableCount: 5,
			specialLabel: 'Weekend'
		},
		{
			id: 'jun-07',
			label: 'Jun 7',
			weekday: 'SUN',
			date: 'Jun 7',
			sequenceKind: 'weekend-holiday',
			chargeSequenceStart: 2,
			chargeableCount: 4,
			specialLabel: 'Weekend'
		}
	];

	const matrixCells: Record<string, Record<string, MatrixCell>> = {
		able: {
			'jun-01': da6Cell('X', 'assigned', 'assigned', 20, 1, null),
			'jun-02': da6Cell('A', 'warning', 'authorized-absence', 21, null, 'Authorized absence: Leave'),
			'jun-03': da6Cell('A', 'warning', 'authorized-absence', 21, null, 'Authorized absence: Leave'),
			'jun-04': da6Cell('A', 'warning', 'authorized-absence', 21, null, 'Authorized absence: Leave'),
			'jun-05': da6Cell('A', 'warning', 'authorized-absence', 21, null, 'Authorized absence: Leave'),
			'jun-06': da6Cell('A', 'warning', 'authorized-absence', 21, null, 'Authorized absence: Leave'),
			'jun-07': da6Cell('21', 'default', 'available-not-selected', 21, 4, null)
		},
		baker: {
			'jun-01': da6Cell('20', 'default', 'available-not-selected', 20, 2, null),
			'jun-02': da6Cell('D', 'danger', 'blocked-by-duty', 21, 1, 'Other duty: Staff detail'),
			'jun-03': da6Cell('D', 'danger', 'blocked-by-duty', 22, 1, 'Other duty: Staff detail'),
			'jun-04': da6Cell('D', 'danger', 'blocked-by-duty', 23, 1, 'Other duty: Staff detail'),
			'jun-05': da6Cell('D', 'danger', 'blocked-by-duty', 24, 1, 'Other duty: Staff detail'),
			'jun-06': da6Cell('D', 'danger', 'blocked-by-duty', 25, 1, 'Other duty: Staff detail'),
			'jun-07': da6Cell('26', 'default', 'available-not-selected', 26, 3, null)
		},
		cross: {
			'jun-01': da6Cell('30', 'default', 'available-not-selected', 30, 3, null),
			'jun-02': da6Cell('X', 'assigned', 'assigned', 31, 2, null),
			'jun-03': da6Cell('1', 'default', 'available-not-selected', 1, 2, null),
			'jun-04': da6Cell('2', 'default', 'available-not-selected', 2, 2, null),
			'jun-05': da6Cell('3', 'default', 'available-not-selected', 3, 2, null),
			'jun-06': da6Cell('1', 'default', 'available-not-selected', 1, 2, null),
			'jun-07': da6Cell('X', 'assigned', 'assigned', 2, 1, null)
		},
		davis: {
			'jun-01': da6Cell('18', 'default', 'available-not-selected', 18, 4, null),
			'jun-02': da6Cell('19', 'default', 'available-not-selected', 19, 3, null),
			'jun-03': da6Cell('20', 'default', 'available-not-selected', 20, 3, null),
			'jun-04': da6Cell('X', 'assigned', 'assigned', 21, 3, null),
			'jun-05': da6Cell('1', 'default', 'available-not-selected', 1, 3, null),
			'jun-06': da6Cell('1', 'default', 'available-not-selected', 1, 3, null),
			'jun-07': da6Cell('2', 'default', 'available-not-selected', 2, 2, null)
		},
		evans: {
			'jun-01': da6Cell(
				'U',
				'danger',
				'misconduct-unavailable',
				12,
				5,
				'Unavailable due to misconduct/AWOL-style status'
			),
			'jun-02': da6Cell('13', 'default', 'available-not-selected', 13, 4, null),
			'jun-03': da6Cell('X', 'assigned', 'assigned', 14, 4, null),
			'jun-04': da6Cell('1', 'default', 'available-not-selected', 1, 4, null),
			'jun-05': da6Cell('2', 'default', 'available-not-selected', 2, 4, null),
			'jun-06': da6Cell('2', 'default', 'available-not-selected', 2, 4, null),
			'jun-07': da6Cell('A', 'warning', 'authorized-absence', 3, null, 'Authorized absence: Medical')
		}
	};

	const stepperSteps: Stepper.StepperStep[] = [
		{ value: 'basics', label: 'Basics', completed: true },
		{ value: 'pool', label: 'Pool' },
		{ value: 'baseline', label: 'Baseline' },
		{ value: 'review', label: 'Review' }
	];

	const rankItems = [
		{ value: 'SGT', label: 'SGT' },
		{ value: 'SSG', label: 'SSG' },
		{ value: 'SFC', label: 'SFC' },
		{ value: 'MSG', label: 'MSG' }
	];
	const groupItems = [
		{ value: 'enlisted', label: 'Enlisted' },
		{ value: 'warrant', label: 'Warrant Officer' },
		{ value: 'officer', label: 'Officer' }
	];
	const mosItems = [
		{ value: '11B', label: '11B' },
		{ value: '11C', label: '11C' },
		{ value: '68W', label: '68W' },
		{ value: '13F', label: '13F' }
	];
	const roleItems = [
		{ value: 'NCO', label: 'NCO' },
		{ value: 'Team Leader', label: 'Team Leader' },
		{ value: 'Squad Leader', label: 'Squad Leader' },
		{ value: 'Platoon Sergeant', label: 'Platoon Sergeant' }
	];

	const selectedTemplate = $derived(templates.find((template) => template.id === activeTemplateId) ?? templates[0]);
	const routeTabLabel = $derived(
		routeTab === 'generate' ? 'Generate' : routeTab === 'history' ? 'History' : 'Settings'
	);

	function statusVariant(status: string): BadgeVariant {
		if (
			status === 'active' ||
			status === 'applied' ||
			status === 'official' ||
			status === 'ok' ||
			status === 'accepted'
		) {
			return 'success';
		}
		if (
			status === 'needs-sync' ||
			status === 'review' ||
			status === 'correction-pending' ||
			status === 'manual' ||
			status === 'override'
		) {
			return 'warning';
		}
		if (status === 'invalidated' || status === 'unresolved' || status === 'archived') {
			return 'danger';
		}
		if (status === 'draft-preview' || status === 'latest') {
			return 'info';
		}
		return 'secondary';
	}

	function statusLabel(status: string): string {
		return status
			.split('-')
			.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
			.join(' ');
	}

	function da6Cell(
		display: string,
		tone: MatrixCellTone,
		code: MatrixCellCode,
		sequenceNumber: number | null,
		queuePosition: number | null,
		reason: string | null
	): MatrixCell {
		return {
			display,
			tone,
			code,
			assigned: code === 'assigned',
			chargeable: code !== 'authorized-absence',
			sequenceNumber,
			queuePosition,
			reason
		};
	}

	function matrixCell(row: MatrixRow, column: MatrixColumn): MatrixCell {
		return (
			matrixCells[row.id]?.[column.id] ??
			da6Cell('', 'default', 'available-not-selected', null, null, 'No DA6 cell for this date')
		);
	}

	function matrixCellClass(tone: MatrixCellTone): string {
		if (tone === 'assigned') return 'bg-success-muted text-success-foreground';
		if (tone === 'warning') return 'bg-warning-muted text-warning-foreground';
		if (tone === 'danger') return 'bg-danger-muted text-danger-foreground';
		return 'text-muted-foreground';
	}

	function matrixCellTitle(cell: MatrixCell, column: MatrixColumn): string {
		const parts = [
			cell.assigned ? 'Assigned duty' : cell.reason,
			cell.sequenceNumber === null ? null : `DA6 number ${cell.sequenceNumber}`,
			cell.queuePosition === null ? null : `queue position ${cell.queuePosition}`,
			cell.chargeable ? 'chargeable' : 'not chargeable',
			`${column.sequenceKind === 'weekend-holiday' ? 'Weekend/holiday' : 'Weekday'} sequence`
		].filter((part): part is string => Boolean(part));

		return parts.join('. ');
	}
</script>

<svelte:head>
	<title>Duty Roster Showroom | TroopToTask</title>
</svelte:head>

<Tooltip.Provider>
	<main class="flex flex-1 flex-col gap-6 p-4 md:p-6">
		<header class="grid gap-4">
			<div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
				<div class="grid gap-2">
					<div class="flex flex-wrap items-center gap-2">
						<h1 class="text-2xl font-semibold tracking-tight">Duty Roster Composition Showroom</h1>
						<Badge variant="info">Static UI examples</Badge>
					</div>
					<p class="max-w-3xl text-sm text-muted-foreground">
						Shared shadcn-svelte composition examples for the duty-roster reskin. These examples intentionally avoid
						touching the production duty-roster route.
					</p>
				</div>
				<div class="flex flex-wrap gap-2">
					<Button variant="outline" href="/plans/duty-roster-reskin/01-showroom-duty-roster-compositions.md">
						<FileTextIcon />
						View Plan
					</Button>
					<Button>
						<Plus />
						New Template
					</Button>
				</div>
			</div>

			<Alert.Root variant="info">
				<Info />
				<Alert.Title>Showroom boundary</Alert.Title>
				<Alert.Description>
					This route proves shared component composition before production migration. Any missing reusable pattern
					should be recorded as a design-system gap.
				</Alert.Description>
			</Alert.Root>
		</header>

		<Tabs.Root bind:value={routeTab} class="grid gap-4">
			<Tabs.List variant="line" class="w-full justify-start">
				<Tabs.Trigger value="generate">Generate</Tabs.Trigger>
				<Tabs.Trigger value="history">History</Tabs.Trigger>
				<Tabs.Trigger value="settings">Settings</Tabs.Trigger>
			</Tabs.List>
			<p class="sr-only">Current route tab: {routeTabLabel}</p>

			<Tabs.Content value="generate" class="grid gap-6">
				<section class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]" aria-labelledby="register-heading">
					<div class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground">
						<div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
							<div class="grid gap-1">
								<h2 id="register-heading" class="text-xl font-semibold tracking-tight">Template register</h2>
								<p class="text-sm text-muted-foreground">
									Selectable rows, quick actions, pagination, and summary rail.
								</p>
							</div>
							<Button size="sm">
								<Plus />
								New Template
							</Button>
						</div>
						<DataTable.DataTable
							data={templates}
							columns={templateColumns}
							ariaLabel="Duty roster template register showroom"
							pageSize={5}
							density="dense"
							stickyHeader
							onRowClick={(row) => (activeTemplateId = row.id)}
							rowActionLabel={(row) => `Select ${row.name}`}
							cell={templateCell}
						/>
					</div>

					<aside
						class="grid content-start gap-4 rounded-lg border bg-card p-4 text-card-foreground"
						aria-label="Selected template summary"
					>
						<div class="flex items-start justify-between gap-3">
							<div class="grid gap-1">
								<h3 class="text-lg font-semibold">{selectedTemplate.name}</h3>
								<p class="font-mono text-xs text-muted-foreground">{selectedTemplate.slug}</p>
							</div>
							<Badge variant={statusVariant(selectedTemplate.status)}>{statusLabel(selectedTemplate.status)}</Badge>
						</div>
						<Separator />
						<div class="grid gap-3">
							<FactRow label="Total Eligible" value={String(selectedTemplate.poolSize)} />
							<FactRow label="Assigned Next 14 Days" value="6" />
							<FactRow label="Remaining Available" value={String(selectedTemplate.poolSize - 6)} />
							<FactRow label="Exemptions" value={String(selectedTemplate.exemptions)} />
						</div>
						<Separator />
						<div class="grid gap-2">
							<Button>
								<Play />
								Generate Roster
							</Button>
							<Button variant="outline">
								<Clock3 />
								View History
							</Button>
							<Button variant="outline">
								<Settings />
								Edit Settings
							</Button>
						</div>
						<Alert.Root variant="info">
							<CalendarDays />
							<Alert.Title>Create a one-duty template</Alert.Title>
							<Alert.Description>Use one template per duty position so counts stay separate.</Alert.Description>
						</Alert.Root>
					</aside>
				</section>

				<section class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]" aria-labelledby="wizard-heading">
					<div class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground">
						<h2 id="wizard-heading" class="text-xl font-semibold tracking-tight">New template wizard, pool step</h2>
						<Stepper.Root steps={stepperSteps} value={wizardStep} onValueChange={(value) => (wizardStep = value)}>
							<Stepper.List aria-label="New Duty Roster Template steps" class="border-b pb-4">
								{#each stepperSteps as step (step.value)}
									<Stepper.Item value={step.value} />
								{/each}
							</Stepper.List>
							<Stepper.Content value="pool" forceMount>
								<div class="grid gap-4">
									<section class="grid gap-3 rounded-lg border p-4">
										<h3 class="text-base font-semibold">Template Identity</h3>
										<div class="grid gap-3 md:grid-cols-3">
											<FactRow label="Template Name" value="Staff Duty NCO" />
											<FactRow label="URL Slug" value="staff-duty-nco" />
											<FactRow label="Short Code" value="SDNCO" />
										</div>
									</section>
									<section class="grid gap-4 rounded-lg border p-4">
										<div class="grid gap-1">
											<h3 class="text-base font-semibold">Build the Eligible Pool</h3>
											<p class="text-sm text-muted-foreground">OR within a category. AND across categories.</p>
										</div>
										<div class="grid gap-3 lg:grid-cols-4">
											<MultiSelectField label="Rank" items={rankItems} bind:value={selectedRanks} />
											<MultiSelectField label="Group" items={groupItems} bind:value={selectedGroups} />
											<MultiSelectField label="MOS" items={mosItems} bind:value={selectedMos} />
											<MultiSelectField label="Duty Role" items={roleItems} bind:value={selectedDutyRoles} />
										</div>
										<div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
											<div class="overflow-hidden rounded-lg border">
												<Table.Table>
													<Table.Header>
														<Table.Row>
															<Table.Head>Soldier</Table.Head>
															<Table.Head>Rank</Table.Head>
															<Table.Head>MOS</Table.Head>
															<Table.Head>Group</Table.Head>
															<Table.Head>Duty Role</Table.Head>
															<Table.Head>Eligible</Table.Head>
														</Table.Row>
													</Table.Header>
													<Table.Body>
														{#each poolRows as row (row.name)}
															<Table.Row>
																<Table.Cell>{row.name}</Table.Cell>
																<Table.Cell>{row.rank}</Table.Cell>
																<Table.Cell>{row.mos}</Table.Cell>
																<Table.Cell>{row.group}</Table.Cell>
																<Table.Cell>{row.role}</Table.Cell>
																<Table.Cell><Badge variant="success">Yes</Badge></Table.Cell>
															</Table.Row>
														{/each}
													</Table.Body>
												</Table.Table>
											</div>
											<div class="grid content-start gap-3 rounded-lg border p-4">
												<h4 class="font-semibold">Exemptions (2)</h4>
												<p class="text-sm text-muted-foreground">Select from the resolved pool only.</p>
												<div class="grid gap-2">
													<ExemptionPill name="SSG Michael Johnson" detail="11C, Team Leader" />
													<ExemptionPill name="SFC Daniel Martinez" detail="11B, NCO" />
												</div>
												<Combobox.Root items={soldiers} value="">
													<Combobox.Trigger placeholder="Select an exemption..." />
													<Combobox.Content>
														<Combobox.List />
													</Combobox.Content>
												</Combobox.Root>
											</div>
										</div>
										<Alert.Root variant="warning">
											<AlertTriangle />
											<Alert.Title>No eligible pool</Alert.Title>
											<Alert.Description>
												Adjust filters above. When no Soldiers match the selected criteria, the pool will be empty.
											</Alert.Description>
										</Alert.Root>
									</section>
								</div>
							</Stepper.Content>
						</Stepper.Root>
					</div>

					<SummaryRail title="Pool Summary">
						<FactRow label="Pool Count" value="8" />
						<FactRow label="Exemptions Count" value="2" />
						<Separator />
						<h4 class="font-semibold">Matching Rules Summary</h4>
						<BadgeRow label="Rank (OR)" values={['SGT', 'SSG', 'SFC']} />
						<BadgeRow label="Group (OR)" values={['Enlisted']} />
						<BadgeRow label="MOS (OR)" values={['11B', '11C', '68W']} />
						<BadgeRow label="Duty Role (OR)" values={['NCO', 'Team Leader']} />
						<Alert.Root variant="info">
							<Info />
							<Alert.Description>Exemptions can only be selected from the resolved pool.</Alert.Description>
						</Alert.Root>
					</SummaryRail>
				</section>

				<section class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]" aria-labelledby="generate-heading">
					<div class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground">
						<h2 id="generate-heading" class="text-xl font-semibold tracking-tight">
							Generate setup and preview review
						</h2>
						<div class="grid gap-4 rounded-lg border p-4">
							<div class="grid gap-1">
								<h3 class="text-base font-semibold">Generate Draft Preview</h3>
								<p class="text-sm text-muted-foreground">
									Select a date range to build a draft preview of this template.
								</p>
							</div>
							<div class="grid gap-3 md:grid-cols-2">
								<Field.Root>
									<Field.Label>Start Date</Field.Label>
									<DatePicker
										value={startDate}
										onValueChange={(value) => (startDate = value)}
										aria-label="Start Date"
									/>
									<Field.Description>Start date must be today or later.</Field.Description>
								</Field.Root>
								<Field.Root>
									<Field.Label>End Date</Field.Label>
									<DatePicker value={endDate} onValueChange={(value) => (endDate = value)} aria-label="End Date" />
									<Field.Description>End date must be on or after start date.</Field.Description>
								</Field.Root>
							</div>
							<FactRow label="Date Range (14 days)" value="Tue, May 20, 2026 - Mon, Jun 2, 2026" />
						</div>

						<div class="grid gap-4 rounded-lg border p-4">
							<h3 class="text-base font-semibold">Pool Snapshot</h3>
							<div class="grid gap-3 md:grid-cols-5">
								<Metric label="Eligible Pool" value="22" />
								<Metric label="Exemptions" value="4" />
								<Metric label="Accepted Runs" value="48" />
								<Metric label="Corrections" value="3" />
								<Metric label="Baseline Source" value="Current Roster" />
							</div>
						</div>

						<div class="grid gap-4 rounded-lg border p-4">
							<div class="flex items-center justify-between gap-3">
								<h3 class="text-base font-semibold">Draft Commit Readiness</h3>
								<Badge variant="warning">Review needed</Badge>
							</div>
							<div class="grid gap-3 md:grid-cols-5">
								<Metric label="Duty Dates" value="14" detail="May 12 - May 25" />
								<Metric label="Automatic" value="10" detail="71%" />
								<Metric label="Manual" value="2" detail="14%" />
								<Metric label="Unresolved" value="1" detail="7%" tone="warning" />
								<Metric label="Warnings" value="1" detail="Requires review" tone="warning" />
							</div>
						</div>

						<Tabs.Root bind:value={previewMode}>
							<Tabs.List>
								<Tabs.Trigger value="list">List View</Tabs.Trigger>
								<Tabs.Trigger value="matrix">DA6 Matrix</Tabs.Trigger>
							</Tabs.List>
							<Tabs.Content value="list" class="grid gap-4">
								<div class="overflow-hidden rounded-lg border">
									<Table.Table>
										<Table.Header>
											<Table.Row>
												<Table.Head>Date</Table.Head>
												<Table.Head>Original Generated Selection</Table.Head>
												<Table.Head>Current Final Selection</Table.Head>
												<Table.Head>Warnings</Table.Head>
												<Table.Head>Status</Table.Head>
												<Table.Head>Action</Table.Head>
											</Table.Row>
										</Table.Header>
										<Table.Body>
											{#each previewRows as row (row.date)}
												<Table.Row>
													<Table.Cell>
														<span class="block font-medium">{row.date}</span>
														<span class="text-xs text-muted-foreground">{row.weekday}</span>
													</Table.Cell>
													<Table.Cell>{row.generated}</Table.Cell>
													<Table.Cell>{row.final}</Table.Cell>
													<Table.Cell>{row.warnings}</Table.Cell>
													<Table.Cell>
														<Badge variant={statusVariant(row.status)}>{statusLabel(row.status)}</Badge>
													</Table.Cell>
													<Table.Cell>
														<Sheet.Root>
															<Sheet.Trigger>
																{#snippet child({ props })}
																	<Button variant="outline" size="sm" {...props}>{row.action}</Button>
																{/snippet}
															</Sheet.Trigger>
															{@render ManualChangeSheet()}
														</Sheet.Root>
													</Table.Cell>
												</Table.Row>
											{/each}
										</Table.Body>
									</Table.Table>
								</div>
								{@render ActionBar()}
							</Tabs.Content>
							<Tabs.Content value="matrix" class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
								{@render Da6Matrix()}
								<SummaryRail title="Print Options">
									<FactRow label="Layout" value="DA Form 6 (Landscape)" />
									<FactRow label="Include Signatures" value="Yes" />
									<FactRow label="Include Legend" value="Yes" />
									<Button variant="outline">
										<Settings />
										Edit Print Options
									</Button>
									<Separator />
									<h4 class="font-semibold">Official Actions</h4>
									<Button>
										<Printer />
										Print Draft
									</Button>
									<Button variant="outline">Accept</Button>
									<Button variant="outline">Accept + Print</Button>
									<Button variant="outline">
										<CalendarDays />
										Accept + Apply to Calendar
									</Button>
									<Alert.Root variant="info">
										<Info />
										<Alert.Description>
											You are printing the draft matrix. Official history is written only upon acceptance.
										</Alert.Description>
									</Alert.Root>
								</SummaryRail>
							</Tabs.Content>
						</Tabs.Root>
					</div>

					<SummaryRail title="Generate Summary">
						<FactRow label="Date Range" value="May 20, 2026 - Jun 2, 2026" />
						<FactRow label="Total Days" value="14" />
						<FactRow label="Estimated Duty Days" value="28" />
						<FactRow label="Projected Fills" value="28 / 28" />
						<FactRow label="Warnings" value="2" tone="warning" />
						<Button>
							<Play />
							Generate Preview
						</Button>
						<Alert.Root variant="warning">
							<AlertTriangle />
							<Alert.Title>Warnings (2)</Alert.Title>
							<Alert.Description
								>2 upcoming unavailability periods overlap. 1 Soldier has high duty day count.</Alert.Description
							>
						</Alert.Root>
						<Alert.Root variant="destructive">
							<CircleAlert />
							<Alert.Title>Errors (1)</Alert.Title>
							<Alert.Description>Date range is too far in the past.</Alert.Description>
						</Alert.Root>
						<div class="grid gap-2">
							<Skeleton class="h-4 w-3/4" />
							<Skeleton class="h-4 w-1/2" />
							<Skeleton class="h-8 w-full" />
						</div>
					</SummaryRail>
				</section>
			</Tabs.Content>

			<Tabs.Content value="history" class="grid gap-6">
				<section class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]" aria-labelledby="history-heading">
					<div class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground">
						<div class="grid gap-1">
							<h2 id="history-heading" class="text-xl font-semibold tracking-tight">Staff Duty NCO, History</h2>
							<p class="text-sm text-muted-foreground">Accepted run history for this duty roster template.</p>
						</div>
						<div class="grid gap-3 rounded-lg border p-4 md:grid-cols-6">
							<FactRow label="Template" value="Staff Duty NCO" />
							<FactRow label="Slug" value="staff-duty-nco" />
							<FactRow label="Status" value="Active" />
							<FactRow label="Accepted Runs" value="48" />
							<FactRow label="Correction Count" value="3" />
							<FactRow label="Latest Run" value="May 12 - May 25, 2026" />
						</div>
						<div class="grid gap-3 rounded-lg border p-4">
							<div class="grid gap-3 lg:grid-cols-[minmax(12rem,1fr)_12rem_12rem_12rem_auto_auto]">
								<div class="relative">
									<Search class="absolute left-2 top-2 size-4 text-muted-foreground" />
									<Input class="pl-8" placeholder="Search date range or accepted by..." />
								</div>
								<Select.Root type="single" value="all">
									<Select.Trigger>All states</Select.Trigger>
									<Select.Content>
										<Select.Item value="all" label="All states" />
										<Select.Item value="official" label="Official" />
										<Select.Item value="invalidated" label="Invalidated" />
									</Select.Content>
								</Select.Root>
								<Select.Root type="single" value="all-calendar">
									<Select.Trigger>Calendar: All</Select.Trigger>
									<Select.Content>
										<Select.Item value="all-calendar" label="Calendar: All" />
										<Select.Item value="published" label="Published" />
										<Select.Item value="needs-sync" label="Needs Sync" />
									</Select.Content>
								</Select.Root>
								<Button variant="outline">
									<CalendarDays />
									Any date
								</Button>
								<Button variant="outline">Reset</Button>
								<Button>
									<Filter />
									Filter
								</Button>
							</div>
						</div>
						<DataTable.DataTable
							data={historyRuns}
							columns={historyColumns}
							ariaLabel="Duty roster history showroom"
							pageSize={4}
							density="dense"
							stickyHeader
							cell={historyCell}
						/>
						<Empty.Root class="rounded-lg border">
							<Empty.Media>
								<Clock3 />
							</Empty.Media>
							<Empty.Header>
								<Empty.Title>No history yet?</Empty.Title>
								<Empty.Description>
									Once you accept a roster, it will appear here. Each accepted run is preserved for audit and reporting.
								</Empty.Description>
							</Empty.Header>
							<Empty.Content>
								<Button variant="outline">Go to Generate</Button>
							</Empty.Content>
						</Empty.Root>
					</div>

					<SummaryRail title="About Accepted Runs">
						<p class="text-sm text-muted-foreground">
							Each accepted run is an immutable snapshot of a duty roster. Use this history to review, print, or open a
							previously accepted roster.
						</p>
						<Separator />
						<h4 class="font-semibold">State Legend</h4>
						<BadgeRow label="Official" values={['Accepted and marked official']} />
						<BadgeRow label="Applied" values={['Applied to calendar']} />
						<BadgeRow label="Needs Sync" values={['Applied but calendar out of sync']} />
						<BadgeRow label="Invalidated" values={['Run has been invalidated']} />
					</SummaryRail>
				</section>

				<section class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]" aria-labelledby="history-detail-heading">
					<div class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground">
						<div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
							<div class="grid gap-1">
								<h2 id="history-detail-heading" class="text-xl font-semibold tracking-tight">History Detail</h2>
								<p class="text-sm text-muted-foreground">Immutable history snapshot of an accepted duty roster run.</p>
							</div>
							<Button variant="outline">
								<Printer />
								Print
							</Button>
						</div>
						<div class="grid gap-3 rounded-lg border p-4 md:grid-cols-4">
							<FactRow label="Run" value="Staff Duty NCO" />
							<FactRow label="Date Range" value="May 12 - May 25, 2026" />
							<FactRow label="Accepted" value="May 12, 2026 09:15" />
							<FactRow label="Accepted By" value="SFC James Miller" />
							<FactRow label="State" value="Official" />
							<FactRow label="Calendar State" value="Applied" />
							<FactRow label="Latest" value="Yes" />
						</div>
						<Alert.Root>
							<Info />
							<Alert.Title>This is official history.</Alert.Title>
							<Alert.Description>
								This roster run has been accepted and saved as official history. Corrections can be submitted to update
								records and future counts.
							</Alert.Description>
						</Alert.Root>
						<Tabs.Root value="list">
							<Tabs.List>
								<Tabs.Trigger value="list">List Mode</Tabs.Trigger>
								<Tabs.Trigger value="matrix">DA6 Matrix</Tabs.Trigger>
							</Tabs.List>
							<Tabs.Content value="list">
								<div class="overflow-hidden rounded-lg border">
									<Table.Table>
										<Table.Header>
											<Table.Row>
												<Table.Head>Date</Table.Head>
												<Table.Head>Accepted Soldier</Table.Head>
												<Table.Head>Actual Served Soldier</Table.Head>
												<Table.Head>Correction State</Table.Head>
												<Table.Head>Reason</Table.Head>
												<Table.Head>Calendar State</Table.Head>
												<Table.Head>Audit Action</Table.Head>
											</Table.Row>
										</Table.Header>
										<Table.Body>
											{#each previewRows.slice(0, 4) as row (row.date)}
												<Table.Row>
													<Table.Cell>{row.date}</Table.Cell>
													<Table.Cell>{row.generated}</Table.Cell>
													<Table.Cell>{row.status === 'review' ? 'SGT Alex Johnson' : row.final}</Table.Cell>
													<Table.Cell>
														<Badge variant={row.status === 'review' ? 'warning' : 'success'}>
															{row.status === 'review' ? 'Correction Pending' : 'Accepted'}
														</Badge>
													</Table.Cell>
													<Table.Cell>{row.status === 'review' ? 'Unexpected absence' : '-'}</Table.Cell>
													<Table.Cell><Badge variant="success">Applied</Badge></Table.Cell>
													<Table.Cell>
														<Sheet.Root>
															<Sheet.Trigger>
																{#snippet child({ props })}
																	<Button
																		variant="outline"
																		size="icon-sm"
																		aria-label={`Open correction for ${row.date}`}
																		{...props}
																	>
																		<Wrench />
																	</Button>
																{/snippet}
															</Sheet.Trigger>
															{@render CorrectionSheet()}
														</Sheet.Root>
													</Table.Cell>
												</Table.Row>
											{/each}
										</Table.Body>
									</Table.Table>
								</div>
							</Tabs.Content>
						</Tabs.Root>
					</div>
					{@render AuditRail()}
				</section>
			</Tabs.Content>

			<Tabs.Content value="settings" class="grid gap-6">
				<section class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]" aria-labelledby="settings-heading">
					<div class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground">
						<div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
							<div class="grid gap-1">
								<div class="flex flex-wrap items-center gap-2">
									<h2 id="settings-heading" class="text-xl font-semibold tracking-tight">Staff Duty NCO</h2>
									<Badge variant="success">Active</Badge>
								</div>
								<p class="text-sm text-muted-foreground">
									Configure rules and defaults for this template. Changes apply to future runs only.
								</p>
							</div>
							<div class="flex gap-2">
								<Button variant="outline">
									View Template
									<ExternalLink />
								</Button>
								<DropdownMenu.Root>
									<DropdownMenu.Trigger>
										{#snippet child({ props })}
											<Button variant="outline" size="icon" aria-label="Open template actions" {...props}>
												<MoreHorizontal />
											</Button>
										{/snippet}
									</DropdownMenu.Trigger>
									<DropdownMenu.Content align="end">
										<DropdownMenu.Item>Duplicate</DropdownMenu.Item>
										<DropdownMenu.Item variant="destructive">Archive</DropdownMenu.Item>
									</DropdownMenu.Content>
								</DropdownMenu.Root>
							</div>
						</div>
						<Alert.Root variant="warning">
							<AlertTriangle />
							<Alert.Title>Settings affect future runs only.</Alert.Title>
							<Alert.Description
								>Changes you make here will be used when you generate the next roster.</Alert.Description
							>
						</Alert.Root>
						<SettingsSection number="1" title="Identity">
							<div class="grid gap-3 md:grid-cols-4">
								<Field.Root>
									<Field.Label>Template Name</Field.Label>
									<Input value="Staff Duty NCO" />
								</Field.Root>
								<Field.Root>
									<Field.Label>Slug</Field.Label>
									<Input value="staff-duty-nco" />
								</Field.Root>
								<Field.Root>
									<Field.Label>Short Code</Field.Label>
									<Input value="SDNCO" />
								</Field.Root>
								<Field.Root>
									<Field.Label>State</Field.Label>
									<div class="flex gap-2">
										<Button size="sm">Active</Button>
										<Button size="sm" variant="outline">Archived</Button>
									</div>
								</Field.Root>
							</div>
						</SettingsSection>
						<SettingsSection number="2" title="Eligibility Rules">
							<div class="grid gap-3 md:grid-cols-4">
								<MultiSelectField label="Rank" items={rankItems} bind:value={selectedRanks} />
								<MultiSelectField label="Group" items={groupItems} bind:value={selectedGroups} />
								<MultiSelectField label="MOS" items={mosItems} bind:value={selectedMos} />
								<MultiSelectField label="Duty Role" items={roleItems} bind:value={selectedDutyRoles} />
							</div>
							<Button variant="outline" class="justify-between">
								Additional Rules
								<span class="text-muted-foreground">2 rules configured</span>
							</Button>
						</SettingsSection>
						<SettingsSection number="3" title="Individual Exclusions (3)">
							<div class="flex flex-wrap items-center justify-between gap-2">
								<div class="relative">
									<Search class="absolute left-2 top-2 size-4 text-muted-foreground" />
									<Input class="w-64 pl-8" placeholder="Search by name or rank..." />
								</div>
								<div class="flex gap-2">
									<Button variant="outline">
										<Plus />
										Add Individual
									</Button>
									<Button variant="outline" disabled>
										<Trash2 />
										Remove
									</Button>
								</div>
							</div>
							<div class="overflow-hidden rounded-lg border">
								<Table.Table>
									<Table.Header>
										<Table.Row>
											<Table.Head><Checkbox aria-label="Select all exclusions" /></Table.Head>
											<Table.Head>Name</Table.Head>
											<Table.Head>Rank</Table.Head>
											<Table.Head>MOS</Table.Head>
											<Table.Head>Unit</Table.Head>
											<Table.Head>Reason</Table.Head>
										</Table.Row>
									</Table.Header>
									<Table.Body>
										{#each ['Sgt. Jacob Miller', 'SSG Marcus Reed', 'SFC Daniel Kim'] as person, index (person)}
											<Table.Row>
												<Table.Cell><Checkbox aria-label={`Select ${person}`} /></Table.Cell>
												<Table.Cell>{person}</Table.Cell>
												<Table.Cell>{index === 0 ? 'SGT' : index === 1 ? 'SSG' : 'SFC'}</Table.Cell>
												<Table.Cell>{index === 1 ? '11C' : '11B'}</Table.Cell>
												<Table.Cell
													>{index === 2
														? 'HQ Co, 1-22 IN'
														: index === 1
															? 'Bravo Co, 1-22 IN'
															: 'Alpha Co, 1-22 IN'}</Table.Cell
												>
												<Table.Cell
													>{index === 0
														? 'Medical profile'
														: index === 1
															? 'Permanent staff'
															: 'School attendance'}</Table.Cell
												>
											</Table.Row>
										{/each}
									</Table.Body>
								</Table.Table>
							</div>
						</SettingsSection>
						<SettingsSection number="4" title="DA6 Continuity / Baseline">
							<Alert.Root>
								<LockKeyhole />
								<Alert.Title>Baseline is locked once accepted history exists.</Alert.Title>
								<Alert.Description
									>To adjust baseline counts, accepted history would need a separate governance workflow.</Alert.Description
								>
								<Alert.Action>
									<Button variant="outline" size="sm">View History</Button>
								</Alert.Action>
							</Alert.Root>
							<div class="overflow-hidden rounded-lg border">
								<Table.Table>
									<Table.Header>
										<Table.Row>
											<Table.Head>Rank</Table.Head>
											<Table.Head>Baseline Count</Table.Head>
											<Table.Head>Last Updated</Table.Head>
										</Table.Row>
									</Table.Header>
									<Table.Body>
										<Table.Row>
											<Table.Cell>SGT</Table.Cell>
											<Table.Cell>8</Table.Cell>
											<Table.Cell>May 12, 2026 08:41</Table.Cell>
										</Table.Row>
										<Table.Row>
											<Table.Cell>SSG</Table.Cell>
											<Table.Cell>7</Table.Cell>
											<Table.Cell>May 12, 2026 08:41</Table.Cell>
										</Table.Row>
										<Table.Row>
											<Table.Cell>SFC</Table.Cell>
											<Table.Cell>7</Table.Cell>
											<Table.Cell>May 12, 2026 08:41</Table.Cell>
										</Table.Row>
									</Table.Body>
								</Table.Table>
							</div>
						</SettingsSection>
						<div
							class="sticky bottom-0 z-10 -mx-4 -mb-4 flex flex-col gap-3 border-t bg-background p-4 md:flex-row md:items-center md:justify-between"
						>
							<div class="grid gap-1">
								<strong class="text-sm">Unsaved changes</strong>
								<span class="text-sm text-muted-foreground">You have unsaved changes to your settings.</span>
							</div>
							<div class="flex gap-2">
								<Button variant="outline">Discard Changes</Button>
								<Button>
									<Save />
									Save Changes
								</Button>
							</div>
						</div>
					</div>

					<SummaryRail title="Template Summary">
						<h4 class="font-semibold">Pool & Exemptions</h4>
						<FactRow label="Total Eligible" value="22" />
						<FactRow label="Exemptions" value="6" />
						<FactRow label="Effective Pool" value="16" />
						<Separator />
						<h4 class="font-semibold">History Status</h4>
						<FactRow label="Accepted History" value="Exists" />
						<FactRow label="Latest Accepted Range" value="May 12 - May 25, 2026" />
						<Separator />
						<h4 class="font-semibold">Rule Summary</h4>
						<FactRow label="Rank" value="SGT, SSG, SFC" />
						<FactRow label="Group" value="Enlisted" />
						<FactRow label="MOS" value="11B, 11C, 11Z, +2" />
						<FactRow label="Duty Roles" value="NCO, Team Leader, Squad Leader" />
						<FactRow label="Baseline Status" value="Locked" />
						<Alert.Root variant="warning">
							<AlertTriangle />
							<Alert.Description
								>Archiving this template will prevent future rosters from being generated.</Alert.Description
							>
							<Alert.Action>
								<Button variant="outline" size="sm">Archive Template</Button>
							</Alert.Action>
						</Alert.Root>
					</SummaryRail>
				</section>
			</Tabs.Content>
		</Tabs.Root>
	</main>
</Tooltip.Provider>

{#snippet templateCell(row: TemplateRow, column: ColumnDef<TemplateRow>)}
	{#if column.key === 'name'}
		<button
			type="button"
			class="grid text-left"
			aria-pressed={activeTemplateId === row.id}
			onclick={() => (activeTemplateId = row.id)}
		>
			<span class="font-medium">{row.name}</span>
			<span class="text-xs text-muted-foreground">{row.status}</span>
		</button>
	{:else if column.key === 'actions'}
		<div class="flex justify-end gap-1">
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<Button variant="outline" size="icon-sm" aria-label={`Generate ${row.name}`} {...props}><Play /></Button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content>Generate</Tooltip.Content>
			</Tooltip.Root>
			<Button variant="outline" size="icon-sm" aria-label={`View history for ${row.name}`}><Clock3 /></Button>
			<Button variant="outline" size="icon-sm" aria-label={`Open settings for ${row.name}`}><Settings /></Button>
		</div>
	{:else}
		{String(column.value(row) ?? '')}
	{/if}
{/snippet}

{#snippet historyCell(row: HistoryRun, column: ColumnDef<HistoryRun>)}
	{#if column.key === 'calendar'}
		<Badge variant={row.calendar === 'published' ? 'success' : 'danger'}>
			{row.calendar === 'published' ? 'Published' : 'Invalidated'}
		</Badge>
	{:else if column.key === 'state'}
		<Badge variant={statusVariant(row.state)}>{statusLabel(row.state)}</Badge>
	{:else if column.key === 'latest'}
		{#if row.latest}
			<Badge>Latest</Badge>
		{:else}
			<span class="text-muted-foreground">-</span>
		{/if}
	{:else if column.key === 'actions'}
		<div class="flex justify-end gap-1">
			<Button variant="outline" size="icon-sm" aria-label={`Print ${row.range}`} disabled={row.state === 'invalidated'}
				><Printer /></Button
			>
			<Button variant="outline" size="icon-sm" aria-label={`Open ${row.range}`}><ExternalLink /></Button>
		</div>
	{:else}
		{String(column.value(row) ?? '')}
	{/if}
{/snippet}

{#snippet ActionBar()}
	<div class="grid gap-3 rounded-lg border p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
		<div class="grid gap-1">
			<strong class="text-sm"
				>Draft Actions <span class="font-normal text-muted-foreground">(do not write history)</span></strong
			>
			<span class="text-sm text-muted-foreground">Review and share draft before committing.</span>
			<Button variant="outline" class="w-fit">
				<Printer />
				Print Draft
			</Button>
		</div>
		<div class="grid gap-1 border-t pt-3 md:border-l md:border-t-0 md:pl-4 md:pt-0">
			<strong class="text-sm"
				>Official Actions <span class="font-normal text-muted-foreground">(write history)</span></strong
			>
			<span class="text-sm text-muted-foreground">Accepting writes to history. Applying will affect Calendar.</span>
			<div class="flex flex-wrap gap-2">
				<Button>Accept</Button>
				<Button>Accept + Print</Button>
				<Button>
					<CalendarDays />
					Accept + Apply to Calendar
				</Button>
			</div>
		</div>
	</div>
{/snippet}

{#snippet Da6Matrix()}
	<section class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground" aria-labelledby="da6-matrix-heading">
		<div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
			<div>
				<h3 id="da6-matrix-heading" class="text-lg font-semibold">Preview Review, DA6 Matrix (Draft)</h3>
				<p class="text-sm text-muted-foreground">
					Production-shaped DA6 output: `X` marks assigned duty, numbers are visible DA6 counts, and A/D/U codes follow
					current availability rules.
				</p>
			</div>
			<Badge variant="info">Draft Preview</Badge>
		</div>
		<Alert.Root variant="warning">
			<AlertTriangle />
			<Alert.Description>
				Authorized absence pauses a Soldier's visible count. D and U cells remain chargeable, so the DA6 number
				continues to move.
			</Alert.Description>
			<Alert.Action>
				<Button variant="outline" size="sm">Review Rules</Button>
			</Alert.Action>
		</Alert.Root>
		<OperationalMatrix.Root rows={matrixRows} columns={matrixColumns} readOnly>
			<OperationalMatrix.Viewport ariaLabel="Draft DA6 matrix viewport" class="rounded-lg border bg-card">
				<OperationalMatrix.Table
					ariaLabel="Draft DA6 matrix"
					class="min-w-max table-fixed text-sm [&_[data-matrix-cell]]:h-10 [&_[data-matrix-cell]]:w-12 [&_[data-matrix-cell]]:border [&_[data-matrix-cell]]:border-border [&_[data-matrix-cell]]:p-0 [&_[data-matrix-column-header]]:border [&_[data-matrix-column-header]]:border-border [&_[data-matrix-column-header]]:bg-muted/70 [&_[data-slot=operational-matrix-cell-content]]:grid [&_[data-slot=operational-matrix-cell-content]]:h-10 [&_[data-slot=operational-matrix-cell-content]]:place-items-center"
				>
					<OperationalMatrix.Header>
						<OperationalMatrix.HeaderRow>
							<OperationalMatrix.CornerCell sticky class="sticky left-0 top-0 z-30 min-w-40 bg-muted px-3 text-left">
								Rank / Name
							</OperationalMatrix.CornerCell>
							{#each matrixColumns as column (column.id)}
								<OperationalMatrix.ColumnHeader
									{column}
									orientation="vertical"
									sticky
									class="sticky top-0 z-20 bg-muted"
								>
									<span class="grid min-w-10 place-items-center gap-0.5 text-center text-[0.65rem] leading-tight">
										<span class="font-semibold">{column.weekday}</span>
										<span class="font-normal text-muted-foreground">{column.date}</span>
										{#if column.specialLabel}
											<span class="rounded-sm bg-muted px-1 text-[0.55rem] text-muted-foreground">
												{column.specialLabel}
											</span>
										{/if}
									</span>
								</OperationalMatrix.ColumnHeader>
							{/each}
						</OperationalMatrix.HeaderRow>
					</OperationalMatrix.Header>
					<OperationalMatrix.Body>
						{#each matrixRows as row (row.id)}
							<OperationalMatrix.Row {row} class="bg-card hover:bg-muted/20">
								<OperationalMatrix.RowHeader
									{row}
									sticky
									class="sticky left-0 z-10 min-w-40 border bg-card px-3 py-2 text-left"
								>
									<span class="grid">
										<span class="font-medium">{row.label}</span>
										<span class="text-xs text-muted-foreground">{row.group}</span>
									</span>
								</OperationalMatrix.RowHeader>
								{#each matrixColumns as column (column.id)}
									{@const cell = matrixCell(row, column)}
									<OperationalMatrix.Cell
										{row}
										{column}
										readOnly
										ariaLabel={`${row.label} ${column.label} ${matrixCellTitle(cell, column)}`}
										class={matrixCellClass(cell.tone)}
									>
										<span class="font-mono text-xs font-semibold">{cell.display}</span>
									</OperationalMatrix.Cell>
								{/each}
							</OperationalMatrix.Row>
						{/each}
					</OperationalMatrix.Body>
				</OperationalMatrix.Table>
			</OperationalMatrix.Viewport>
		</OperationalMatrix.Root>
		<div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
			<div class="flex flex-wrap gap-3 text-sm">
				{@render LegendItem('X', 'Assigned duty; next visible count resets to 1.', 'assigned')}
				{@render LegendItem('1-30', 'Available and not selected; visible DA6 count.', 'default')}
				{@render LegendItem('A', 'Authorized absence; not chargeable, count pauses.', 'warning')}
				{@render LegendItem('D', 'Other duty or cooldown; chargeable, count advances.', 'danger')}
				{@render LegendItem('U', 'Misconduct/unavailable; chargeable, count advances.', 'danger')}
			</div>
			<div class="rounded-md border bg-muted/20 p-3 text-sm">
				<h4 class="font-semibold">Sequence details</h4>
				<p class="mt-1 text-muted-foreground">
					Single-sequence templates use one running DA6 count. Separate weekend/holiday mode starts a distinct
					weekend-holiday sequence, shown here on Jun 6-7.
				</p>
			</div>
		</div>
	</section>
{/snippet}

{#snippet LegendItem(mark: string, label: string, tone: MatrixCellTone)}
	<span class="inline-flex items-center gap-2">
		<span
			class={`inline-flex min-w-7 items-center justify-center rounded-sm border px-1.5 py-1 font-mono text-[10px] font-semibold ${matrixCellClass(tone)}`}
		>
			{mark}
		</span>
		<span class="text-sm text-muted-foreground">{label}</span>
	</span>
{/snippet}

{#snippet ManualChangeSheet()}
	<Sheet.Content class="sm:max-w-md">
		<Sheet.Header>
			<Sheet.Title>Manual Preview Change</Sheet.Title>
			<Sheet.Description>Resolve or review a draft roster assignment before acceptance.</Sheet.Description>
		</Sheet.Header>
		<div class="grid gap-4 px-4 pb-4">
			<section class="grid gap-2">
				<h3 class="font-semibold">Selected Date</h3>
				<p class="flex items-center gap-2 text-sm">
					<CalendarDays class="size-4" />
					May 14, 2026 (Wednesday)
				</p>
			</section>
			<div class="overflow-hidden rounded-lg border">
				<div class="grid gap-1 border-b p-4">
					<span class="text-sm font-medium">Current Final Selection</span>
					<strong>SSG David Wilson</strong>
					<span class="text-sm text-muted-foreground">Squad Leader</span>
				</div>
				<div class="grid gap-1 p-4">
					<span class="text-sm font-medium">Original Generated Selection</span>
					<strong>SGT Michael Brown</strong>
					<span class="text-sm text-muted-foreground">Team Leader</span>
				</div>
			</div>
			<Alert.Root variant="warning">
				<AlertTriangle />
				<Alert.Title>Why this replacement is considered risky</Alert.Title>
				<Alert.Description>
					Higher rank than original recommendation. Would exceed SSG recommended coverage.
				</Alert.Description>
			</Alert.Root>
			<Field.Root>
				<Field.Label>Replacement Soldier</Field.Label>
				<Combobox.Root items={soldiers} bind:value={replacementSoldier}>
					<Combobox.Trigger placeholder="Search personnel..." />
					<Combobox.Content>
						<Combobox.List />
					</Combobox.Content>
				</Combobox.Root>
			</Field.Root>
			<Field.Root>
				<Field.Label>Reason for Change</Field.Label>
				<Textarea placeholder="Provide a clear reason for this manual change..." />
				<Field.Description>0 / 300</Field.Description>
			</Field.Root>
			<Alert.Root variant="warning">
				<AlertTriangle />
				<Alert.Title>Archived or missing personnel are blocked.</Alert.Title>
				<Alert.Description>Only active, eligible personnel can be selected.</Alert.Description>
			</Alert.Root>
		</div>
		<Sheet.Footer>
			<Button variant="outline">Cancel</Button>
			<Button>Save Change</Button>
		</Sheet.Footer>
	</Sheet.Content>
{/snippet}

{#snippet CorrectionSheet()}
	<Sheet.Content class="sm:max-w-md">
		<Sheet.Header>
			<Sheet.Title>Duty Roster Correction</Sheet.Title>
			<Sheet.Description>Submit a correction for this roster entry.</Sheet.Description>
		</Sheet.Header>
		<div class="grid gap-4 px-4 pb-4">
			<div class="grid gap-3 rounded-lg border p-4 md:grid-cols-2">
				<FactRow label="Date" value="May 14, 2026 (Wed)" />
				<FactRow label="Originally Assigned Soldier" value="SSG Daniel Warren" />
			</div>
			<Field.Root>
				<Field.Label>Soldier Who Actually Served</Field.Label>
				<Combobox.Root items={soldiers} bind:value={correctionSoldier}>
					<Combobox.Trigger placeholder="Search by name or rank..." />
					<Combobox.Content>
						<Combobox.List />
					</Combobox.Content>
				</Combobox.Root>
			</Field.Root>
			<Field.Root>
				<Field.Label>Reason</Field.Label>
				<Select.Root type="single" bind:value={correctionReason}>
					<Select.Trigger>{correctionReason || 'Select a reason...'}</Select.Trigger>
					<Select.Content>
						<Select.Item value="unexpected-absence" label="Unexpected absence" />
						<Select.Item value="sd-detail" label="SD/Detail" />
						<Select.Item value="leader-directed" label="Leader directed" />
					</Select.Content>
				</Select.Root>
			</Field.Root>
			<Field.Root>
				<Field.Label>Additional details (optional)</Field.Label>
				<Textarea />
				<Field.Description>0 / 250</Field.Description>
			</Field.Root>
			<Alert.Root variant="warning">
				<AlertTriangle />
				<Alert.Title>Outside Pool Warning</Alert.Title>
				<Alert.Description>
					The selected Soldier is not in the original duty pool for this slot. Continue only if this is accurate.
				</Alert.Description>
			</Alert.Root>
			<Alert.Root variant="info">
				<Info />
				<Alert.Description>
					Corrections affect future counts and will update the Calendar since this run was applied.
				</Alert.Description>
			</Alert.Root>
		</div>
		<Sheet.Footer>
			<Button>Save Correction</Button>
			<Button variant="outline">Cancel</Button>
		</Sheet.Footer>
	</Sheet.Content>
{/snippet}

{#snippet AuditRail()}
	<SummaryRail title="Audit Trail">
		<div class="grid gap-4">
			{@render AuditEvent('May 12, 2026 09:15', 'Run accepted', 'SFC James Miller')}
			{@render AuditEvent('May 14, 2026 10:22', 'Correction initiated', 'SSG Laura Bennett')}
			{@render AuditEvent('May 14, 2026 10:22', 'Pending approval', 'System')}
		</div>
		<p class="text-xs text-muted-foreground">All times are in local time (UTC -04:00).</p>
	</SummaryRail>
{/snippet}

{#snippet AuditEvent(time: string, title: string, detail: string)}
	<div class="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
		<span class="mt-1 size-2 rounded-full bg-foreground" aria-hidden="true"></span>
		<div class="grid gap-1">
			<span class="text-xs text-muted-foreground">{time}</span>
			<strong class="text-sm">{title}</strong>
			<span class="text-sm text-muted-foreground">{detail}</span>
		</div>
	</div>
{/snippet}
