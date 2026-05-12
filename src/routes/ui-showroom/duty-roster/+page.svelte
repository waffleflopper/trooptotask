<script lang="ts">
	import {
		Archive,
		CalendarDays,
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
		Wrench
	} from '@lucide/svelte';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import * as Combobox from '$lib/components/ui/combobox/index.js';
	import * as DataTable from '$lib/components/ui/data-table/index.js';
	import type { ColumnDef } from '$lib/components/ui/data-table/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import * as Stepper from '$lib/components/ui/stepper/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import BadgeRow from './BadgeRow.svelte';
	import ExemptionPill from './ExemptionPill.svelte';
	import * as PageShell from '$lib/components/ui/page-shell/index.js';
	import MultiSelectField from './MultiSelectField.svelte';
	import SettingsSection from './SettingsSection.svelte';
	import * as DutyRoster from '$features/duty-roster/components/shared/index.js';
	import type {
		AuditTimelineEvent,
		DA6MatrixCell,
		DA6MatrixColumn,
		DA6MatrixFooterRow,
		DA6MatrixMetadataItem,
		DA6MatrixRow
	} from '$features/duty-roster/components/shared/index.js';

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

	type MatrixCellCode =
		| 'assigned'
		| 'available-not-selected'
		| 'authorized-absence'
		| 'blocked-by-duty'
		| 'misconduct-unavailable';

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
	let archiveTemplateName = $state<string | null>(null);

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

	const matrixRows: DA6MatrixRow[] = [
		{ id: 'able', label: 'SGT Able', subtitle: 'Alpha' },
		{ id: 'baker', label: 'SGT Baker', subtitle: 'Bravo' },
		{ id: 'cross', label: 'SPC Cross', subtitle: 'Charlie' },
		{ id: 'davis', label: 'SSG Davis', subtitle: 'Alpha' },
		{ id: 'evans', label: 'PFC Evans', subtitle: 'Bravo' }
	];

	const matrixColumns: DA6MatrixColumn[] = [
		{
			id: 'jun-01',
			label: 'Jun 1',
			weekday: 'Mon',
			date: '1-Jun',
			sequenceKind: 'weekday'
		},
		{
			id: 'jun-02',
			label: 'Jun 2',
			weekday: 'Tue',
			date: '2-Jun',
			sequenceKind: 'weekday'
		},
		{
			id: 'jun-03',
			label: 'Jun 3',
			weekday: 'Wed',
			date: '3-Jun',
			sequenceKind: 'weekday'
		},
		{
			id: 'jun-04',
			label: 'Jun 4',
			weekday: 'Thu',
			date: '4-Jun',
			sequenceKind: 'weekday'
		},
		{
			id: 'jun-05',
			label: 'Jun 5',
			weekday: 'Fri',
			date: '5-Jun',
			sequenceKind: 'weekday'
		},
		{
			id: 'jun-06',
			label: 'Jun 6',
			weekday: 'Sat',
			date: '6-Jun',
			sequenceKind: 'weekend-holiday'
		},
		{
			id: 'jun-07',
			label: 'Jun 7',
			weekday: 'Sun',
			date: '7-Jun',
			sequenceKind: 'weekend-holiday'
		}
	];

	const matrixCells: Record<string, Record<string, DA6MatrixCell>> = {
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
		{ value: 'GEN', label: 'GEN' },
		{ value: 'LTG', label: 'LTG' },
		{ value: 'MG', label: 'MG' },
		{ value: 'BG', label: 'BG' },
		{ value: 'COL', label: 'COL' },
		{ value: 'LTC', label: 'LTC' },
		{ value: 'MAJ', label: 'MAJ' },
		{ value: 'CPT', label: 'CPT' },
		{ value: '1LT', label: '1LT' },
		{ value: '2LT', label: '2LT' },
		{ value: 'CW5', label: 'CW5' },
		{ value: 'CW4', label: 'CW4' },
		{ value: 'CW3', label: 'CW3' },
		{ value: 'CW2', label: 'CW2' },
		{ value: 'WO1', label: 'WO1' },
		{ value: 'CSM', label: 'CSM' },
		{ value: 'SGM', label: 'SGM' },
		{ value: '1SG', label: '1SG' },
		{ value: 'MSG', label: 'MSG' },
		{ value: 'SGT', label: 'SGT' },
		{ value: 'SSG', label: 'SSG' },
		{ value: 'SFC', label: 'SFC' },
		{ value: 'CPL', label: 'CPL' },
		{ value: 'SPC', label: 'SPC' },
		{ value: 'PFC', label: 'PFC' },
		{ value: 'PV2', label: 'PV2' },
		{ value: 'PV1', label: 'PV1' },
		{ value: 'CIV', label: 'CIV' }
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
	const routeTabItems = $derived([
		{ label: 'Generate', value: 'generate', active: routeTab === 'generate' },
		{ label: 'History', value: 'history', active: routeTab === 'history' },
		{ label: 'Settings', value: 'settings', active: routeTab === 'settings' }
	]);

	const matrixMetadata: DA6MatrixMetadataItem[] = [
		{ label: 'Duty Position', value: 'Staff Duty NCO' },
		{ label: 'Date Range', value: 'Jun 1 - Jun 7, 2026' },
		{ label: 'Roster Type', value: 'Single sequence' },
		{ label: 'Mode', value: 'Draft preview' }
	];

	const matrixFooterRows: DA6MatrixFooterRow[] = [
		{
			label: 'Assigned Count',
			values: { 'jun-01': 1, 'jun-02': 1, 'jun-03': 1, 'jun-04': 1, 'jun-05': 0, 'jun-06': 0, 'jun-07': 1 }
		},
		{
			label: 'Required Count',
			values: { 'jun-01': 1, 'jun-02': 1, 'jun-03': 1, 'jun-04': 1, 'jun-05': 1, 'jun-06': 1, 'jun-07': 1 }
		}
	];

	const correctionReasons = [
		{ value: 'unexpected-absence', label: 'Unexpected absence' },
		{ value: 'sd-detail', label: 'SD/Detail' },
		{ value: 'leader-directed', label: 'Leader directed' }
	];

	const auditEvents: AuditTimelineEvent[] = [
		{ id: 'accepted', timestamp: 'May 12, 2026 09:15', title: 'Run accepted', actor: 'SFC James Miller' },
		{
			id: 'correction',
			timestamp: 'May 14, 2026 10:22',
			title: 'Correction initiated',
			actor: 'SSG Laura Bennett'
		},
		{ id: 'pending', timestamp: 'May 14, 2026 10:22', title: 'Pending approval', actor: 'System' }
	];

	function da6Cell(
		display: string,
		_tone: string,
		code: MatrixCellCode,
		sequenceNumber: number | null,
		queuePosition: number | null,
		reason: string | null
	): DA6MatrixCell {
		const kind =
			code === 'assigned'
				? 'assigned'
				: code === 'authorized-absence'
					? 'exempt'
					: code === 'blocked-by-duty' || code === 'misconduct-unavailable'
						? 'blocked'
						: 'not-assigned';

		const countText = sequenceNumber === null ? 'no DA6 count' : `DA6 count ${sequenceNumber}`;
		const queueText = queuePosition === null ? null : `queue position ${queuePosition}`;
		return {
			display,
			kind,
			chargeable: code !== 'authorized-absence',
			count: sequenceNumber,
			reason,
			ariaLabel: [code.replaceAll('-', ' '), countText, queueText, reason].filter(Boolean).join('. ')
		};
	}
</script>

<svelte:head>
	<title>Duty Roster Showroom | TroopToTask</title>
</svelte:head>

<Tooltip.Provider>
	<PageShell.Root>
		<PageShell.Header
			title="Duty Roster Composition Showroom"
			subtitle="Shared shadcn-svelte composition examples for the duty-roster reskin. These examples intentionally avoid touching the production duty-roster route."
		>
			{#snippet meta()}
				<Badge variant="info">Static UI examples</Badge>
			{/snippet}
			{#snippet actions()}
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
			{/snippet}
		</PageShell.Header>

		<Alert.Root variant="info">
			<Info />
			<Alert.Title>Showroom boundary</Alert.Title>
			<Alert.Description>
				This route proves shared component composition before production migration. Any missing reusable pattern should
				be recorded as a design-system gap.
			</Alert.Description>
		</Alert.Root>

		<Tabs.Root bind:value={routeTab} class="grid gap-4">
			<PageShell.Tabs items={routeTabItems} value={routeTab} onValueChange={(value) => (routeTab = value)} />
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
							<DutyRoster.DutyRosterStatusBadge status={selectedTemplate.status} />
						</div>
						<Separator />
						<div class="grid gap-3">
							<PageShell.FactRow label="Total Eligible" value={String(selectedTemplate.poolSize)} />
							<PageShell.FactRow label="Assigned Next 14 Days" value="6" />
							<PageShell.FactRow label="Remaining Available" value={String(selectedTemplate.poolSize - 6)} />
							<PageShell.FactRow label="Exemptions" value={String(selectedTemplate.exemptions)} />
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
											<PageShell.FactRow label="Template Name" value="Staff Duty NCO" />
											<PageShell.FactRow label="URL Slug" value="staff-duty-nco" />
											<PageShell.FactRow label="Short Code" value="SDNCO" />
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
										<DutyRoster.WarningSummary
											tone="warning"
											title="No eligible pool"
											description="Adjust filters above. When no Soldiers match the selected criteria, the pool will be empty."
										/>
									</section>
								</div>
							</Stepper.Content>
						</Stepper.Root>
					</div>

					<PageShell.SummaryRail title="Pool Summary">
						<PageShell.FactRow label="Pool Count" value="8" />
						<PageShell.FactRow label="Exemptions Count" value="2" />
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
					</PageShell.SummaryRail>
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
							<DutyRoster.DateRangeControls
								{startDate}
								{endDate}
								rangeLabel="Tue, May 20, 2026 - Mon, Jun 2, 2026 (14 days)"
								onStartDateChange={(value) => (startDate = value)}
								onEndDateChange={(value) => (endDate = value)}
							/>
						</div>

						<div class="grid gap-4 rounded-lg border p-4">
							<h3 class="text-base font-semibold">Pool Snapshot</h3>
							<div class="grid gap-3 md:grid-cols-5">
								<PageShell.Metric label="Eligible Pool" value="22" />
								<PageShell.Metric label="Exemptions" value="4" />
								<PageShell.Metric label="Accepted Runs" value="48" />
								<PageShell.Metric label="Corrections" value="3" />
								<PageShell.Metric label="Baseline Source" value="Current Roster" />
							</div>
						</div>

						<div class="grid gap-4 rounded-lg border p-4">
							<div class="flex items-center justify-between gap-3">
								<h3 class="text-base font-semibold">Draft Commit Readiness</h3>
								<DutyRoster.DutyRosterStatusBadge status="review" label="Review needed" />
							</div>
							<div class="grid gap-3 md:grid-cols-5">
								<PageShell.Metric label="Duty Dates" value="14" detail="May 12 - May 25" />
								<PageShell.Metric label="Automatic" value="10" detail="71%" />
								<PageShell.Metric label="Manual" value="2" detail="14%" />
								<PageShell.Metric label="Unresolved" value="1" detail="7%" tone="warning" />
								<PageShell.Metric label="Warnings" value="1" detail="Requires review" tone="warning" />
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
														<DutyRoster.DutyRosterStatusBadge status={row.status} />
													</Table.Cell>
													<Table.Cell>
														<Sheet.Root>
															<Sheet.Trigger>
																{#snippet child({ props })}
																	<Button variant="outline" size="sm" {...props}>{row.action}</Button>
																{/snippet}
															</Sheet.Trigger>
															<DutyRoster.ManualChangePanel
																dateLabel="May 14, 2026 (Wednesday)"
																currentSoldier="SSG David Wilson"
																currentRole="Squad Leader"
																originalSoldier="SGT Michael Brown"
																originalRole="Team Leader"
																riskItems={[
																	'Higher rank than original recommendation',
																	'Only 1 eligible Soldier available',
																	'Would exceed SSG recommended coverage'
																]}
																{soldiers}
																replacementValue={replacementSoldier}
																replacementSummary="Only 1 eligible Soldier available for this date."
																reasonRequired
															/>
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
								<DutyRoster.DA6Matrix
									title="Preview Review, DA6 Matrix (Draft)"
									description="Production-shaped DA6 output: X marks assigned duty, numbers are visible DA6 counts, and A/D/U codes follow current availability rules."
									mode="draft"
									rows={matrixRows}
									columns={matrixColumns}
									cells={matrixCells}
									footerRows={matrixFooterRows}
									metadata={matrixMetadata}
									warning="Authorized absence pauses a Soldier's visible count. D and U cells remain chargeable, so the DA6 number continues to move."
								/>
								<PageShell.SummaryRail title="Print Options">
									<PageShell.FactRow label="Layout" value="DA Form 6 (Landscape)" />
									<PageShell.FactRow label="Include Signatures" value="Yes" />
									<PageShell.FactRow label="Include Legend" value="Yes" />
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
								</PageShell.SummaryRail>
							</Tabs.Content>
						</Tabs.Root>
					</div>

					<PageShell.SummaryRail title="Generate Summary">
						<PageShell.FactRow label="Date Range" value="May 20, 2026 - Jun 2, 2026" />
						<PageShell.FactRow label="Total Days" value="14" />
						<PageShell.FactRow label="Estimated Duty Days" value="28" />
						<PageShell.FactRow label="Projected Fills" value="28 / 28" />
						<PageShell.FactRow label="Warnings" value="2" tone="warning" />
						<Button>
							<Play />
							Generate Preview
						</Button>
						<DutyRoster.WarningSummary
							tone="warning"
							title="Warnings (2)"
							items={['2 upcoming unavailability periods overlap', '1 Soldier has high duty day count.']}
						/>
						<DutyRoster.WarningSummary
							tone="destructive"
							title="Errors (1)"
							description="Date range is too far in the past."
						/>
						<div class="grid gap-2">
							<Skeleton class="h-4 w-3/4" />
							<Skeleton class="h-4 w-1/2" />
							<Skeleton class="h-8 w-full" />
						</div>
					</PageShell.SummaryRail>
				</section>
			</Tabs.Content>

			<Tabs.Content value="history" class="grid gap-6">
				<section class="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]" aria-labelledby="history-heading">
					<div class="grid min-w-0 gap-4 rounded-lg border bg-card p-4 text-card-foreground">
						<div class="grid gap-1">
							<h2 id="history-heading" class="text-xl font-semibold tracking-tight">Staff Duty NCO, History</h2>
							<p class="text-sm text-muted-foreground">Accepted run history for this duty roster template.</p>
						</div>
						<div class="grid gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
							<PageShell.FactRow layout="stack" label="Template" value="Staff Duty NCO" />
							<PageShell.FactRow layout="stack" label="Slug" value="staff-duty-nco" />
							<PageShell.FactRow layout="stack" label="Status" value="Active" />
							<PageShell.FactRow layout="stack" label="Accepted Runs" value="48" />
							<PageShell.FactRow layout="stack" label="Correction Count" value="3" />
							<PageShell.FactRow layout="stack" label="Latest Run" value="May 12 - May 25, 2026" />
						</div>
						<div class="min-w-0 rounded-lg border p-4">
							<div class="flex min-w-0 flex-wrap items-center gap-3">
								<div class="relative min-w-48 flex-1">
									<Search class="absolute left-2 top-2 size-4 text-muted-foreground" />
									<Input class="pl-8" placeholder="Search date range or accepted by..." />
								</div>
								<div class="w-32 shrink-0">
									<Select.Root type="single" value="all">
										<Select.Trigger>All states</Select.Trigger>
										<Select.Content>
											<Select.Item value="all" label="All states" />
											<Select.Item value="official" label="Official" />
											<Select.Item value="invalidated" label="Invalidated" />
										</Select.Content>
									</Select.Root>
								</div>
								<div class="w-40 shrink-0">
									<Select.Root type="single" value="all-calendar">
										<Select.Trigger>Calendar: All</Select.Trigger>
										<Select.Content>
											<Select.Item value="all-calendar" label="Calendar: All" />
											<Select.Item value="published" label="Published" />
											<Select.Item value="needs-sync" label="Needs Sync" />
										</Select.Content>
									</Select.Root>
								</div>
								<Button variant="outline" class="w-40 shrink-0">
									<CalendarDays />
									Any date
								</Button>
								<Button variant="outline" class="shrink-0">Reset</Button>
								<Button class="shrink-0">
									<Filter />
									Filter
								</Button>
							</div>
						</div>
						<div class="min-w-0 overflow-hidden">
							<DataTable.DataTable
								data={historyRuns}
								columns={historyColumns}
								ariaLabel="Duty roster history showroom"
								pageSize={4}
								density="dense"
								stickyHeader
								cell={historyCell}
							/>
						</div>
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

					<PageShell.SummaryRail title="About Accepted Runs" class="min-w-0">
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
					</PageShell.SummaryRail>
				</section>

				<section class="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]" aria-labelledby="history-detail-heading">
					<div class="grid min-w-0 gap-4 rounded-lg border bg-card p-4 text-card-foreground">
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
						<div class="grid gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4">
							<PageShell.FactRow layout="stack" label="Run" value="Staff Duty NCO" />
							<PageShell.FactRow layout="stack" label="Date Range" value="May 12 - May 25, 2026" />
							<PageShell.FactRow layout="stack" label="Accepted" value="May 12, 2026 09:15" />
							<PageShell.FactRow layout="stack" label="Accepted By" value="SFC James Miller" />
							<PageShell.FactRow layout="stack" label="State" value="Official" />
							<PageShell.FactRow layout="stack" label="Calendar State" value="Applied" />
							<PageShell.FactRow layout="stack" label="Latest" value="Yes" />
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
								<div class="min-w-0 overflow-auto rounded-lg border">
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
														<DutyRoster.DutyRosterStatusBadge
															status={row.status === 'review' ? 'correction-pending' : 'accepted'}
														/>
													</Table.Cell>
													<Table.Cell>{row.status === 'review' ? 'Unexpected absence' : '-'}</Table.Cell>
													<Table.Cell><DutyRoster.DutyRosterStatusBadge status="applied" /></Table.Cell>
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
															<DutyRoster.CorrectionSheet
																dateLabel="May 14, 2026 (Wed)"
																originalSoldier="SSG Daniel Warren"
																{soldiers}
																reasons={correctionReasons}
																soldierValue={correctionSoldier}
																reasonValue={correctionReason}
															/>
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
					<PageShell.SummaryRail title="Audit Trail">
						<DutyRoster.AuditTimeline events={auditEvents} timezoneLabel="All times are in local time (UTC -04:00)." />
					</PageShell.SummaryRail>
				</section>
			</Tabs.Content>

			<Tabs.Content value="settings" class="grid gap-6">
				<section class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]" aria-labelledby="settings-heading">
					<div class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground">
						<div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
							<div class="grid gap-1">
								<div class="flex flex-wrap items-center gap-2">
									<h2 id="settings-heading" class="text-xl font-semibold tracking-tight">Staff Duty NCO</h2>
									<DutyRoster.DutyRosterStatusBadge status="active" />
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
						<DutyRoster.WarningSummary
							tone="warning"
							title="Settings affect future runs only."
							description="Changes you make here will be used when you generate the next roster."
						/>
						<SettingsSection number="01" title="Template Identity">
							<p class="max-w-2xl text-xs text-muted-foreground">
								These labels identify the template in links, compact tables, and exports.
							</p>
							<div class="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(12rem,0.7fr)]">
								<Field.Root>
									<Field.Label>Template name</Field.Label>
									<Input value="Staff Duty NCO" />
								</Field.Root>
								<Field.Root>
									<Field.Label>Template slug</Field.Label>
									<Input value="staff-duty-nco" />
									<Field.Description>Used in the template URL. Keep it short and readable.</Field.Description>
								</Field.Root>
								<Field.Root>
									<Field.Label>Short code</Field.Label>
									<Input value="SDNCO" />
									<Field.Description>Shown in compact tables and exports.</Field.Description>
								</Field.Root>
							</div>
						</SettingsSection>
						<SettingsSection number="02" title="Eligibility Rules">
							<div class="grid gap-3 md:grid-cols-4">
								<DutyRoster.SearchableRuleMultiSelect
									label="Rank filters"
									options={rankItems}
									bind:value={selectedRanks}
									placeholder="Search ranks..."
								/>
								<DutyRoster.SearchableRuleMultiSelect
									label="Group filters"
									options={groupItems}
									bind:value={selectedGroups}
									placeholder="Search groups..."
								/>
								<DutyRoster.SearchableRuleMultiSelect
									label="MOS filters"
									options={mosItems}
									bind:value={selectedMos}
									placeholder="Search MOS..."
								/>
								<DutyRoster.SearchableRuleMultiSelect
									label="Duty role filters"
									options={roleItems}
									bind:value={selectedDutyRoles}
									placeholder="Search duty roles..."
								/>
							</div>
							<Button variant="outline" class="justify-between">
								Additional Rules
								<span class="text-muted-foreground">2 rules configured</span>
							</Button>
						</SettingsSection>
						<SettingsSection number="03" title="Individual Exclusions (3)">
							<div class="grid gap-3">
								<Field.Root>
									<Field.Label>Add exclusion</Field.Label>
									<Combobox.Root items={soldiers} value="">
										<Combobox.Trigger placeholder="Search by name, rank, MOS, group..." />
										<Combobox.Content>
											<Combobox.List />
										</Combobox.Content>
									</Combobox.Root>
									<Field.Description>Only Soldiers in the resolved pool can be excluded.</Field.Description>
								</Field.Root>
								<div class="grid gap-2 rounded-lg border bg-muted/20 p-3">
									<ExemptionPill name="SSG Michael Johnson" detail="11C, Team Leader" />
									<ExemptionPill name="SFC Daniel Martinez" detail="11B, NCO" />
									<ExemptionPill name="SGT James Wilson" detail="11B, Team Leader" />
								</div>
							</div>
						</SettingsSection>
						<SettingsSection number="04" title="DA6 Continuity / Baseline">
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
						<PageShell.StickyActionBar
							class="-mx-4 -mb-4"
							title="Unsaved changes"
							description="You have unsaved changes to your settings."
						>
							{#snippet primary()}
								<Button variant="outline">Discard Changes</Button>
								<Button>
									<Save />
									Save Changes
								</Button>
							{/snippet}
						</PageShell.StickyActionBar>
					</div>

					<PageShell.SummaryRail title="Template Summary">
						<h4 class="font-semibold">Pool & Exemptions</h4>
						<PageShell.FactRow label="Total Eligible" value="22" />
						<PageShell.FactRow label="Exemptions" value="6" />
						<PageShell.FactRow label="Effective Pool" value="16" />
						<Separator />
						<h4 class="font-semibold">History Status</h4>
						<PageShell.FactRow label="Accepted History" value="Exists" />
						<PageShell.FactRow label="Latest Accepted Range" value="May 12 - May 25, 2026" />
						<Separator />
						<h4 class="font-semibold">Rule Summary</h4>
						<PageShell.FactRow label="Rank" value="SGT, SSG, SFC" />
						<PageShell.FactRow label="Group" value="Enlisted" />
						<PageShell.FactRow label="MOS" value="11B, 11C, 11Z, +2" />
						<PageShell.FactRow label="Duty Roles" value="NCO, Team Leader, Squad Leader" />
						<PageShell.FactRow label="Baseline Status" value="Locked" />
						<DutyRoster.WarningSummary
							tone="warning"
							title="Archive warning"
							description="Archiving this template will prevent future rosters from being generated."
							actionLabel="Archive Template"
						/>
					</PageShell.SummaryRail>
				</section>
			</Tabs.Content>
		</Tabs.Root>
	</PageShell.Root>
	{#if archiveTemplateName}
		<ConfirmDialog
			title="Archive template"
			message={`Archive ${archiveTemplateName}? Future rosters cannot be generated from this template.`}
			confirmLabel="Archive Template"
			cancelLabel="Cancel"
			variant="destructive"
			onConfirm={() => {
				archiveTemplateName = null;
			}}
			onCancel={() => {
				archiveTemplateName = null;
			}}
		/>
	{/if}
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
		<div class="flex justify-end gap-0.5">
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<Button class="size-6" variant="outline" size="icon-sm" aria-label={`Generate ${row.name}`} {...props}
							><Play class="size-3.5" /></Button
						>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content>Generate</Tooltip.Content>
			</Tooltip.Root>
			<Button class="size-6" variant="outline" size="icon-sm" aria-label={`View history for ${row.name}`}
				><Clock3 class="size-3.5" /></Button
			>
			<Button
				class="size-6"
				variant="outline"
				size="icon-sm"
				aria-label={`Archive ${row.name}`}
				disabled={row.status === 'archived'}
				onclick={() => (archiveTemplateName = row.name)}
			>
				<Archive class="size-3.5" />
			</Button>
		</div>
	{:else}
		{String(column.value(row) ?? '')}
	{/if}
{/snippet}

{#snippet historyCell(row: HistoryRun, column: ColumnDef<HistoryRun>)}
	{#if column.key === 'calendar'}
		<DutyRoster.DutyRosterStatusBadge
			status={row.calendar === 'published' ? 'applied' : 'invalidated'}
			label={row.calendar === 'published' ? 'Published' : 'Invalidated'}
		/>
	{:else if column.key === 'state'}
		<DutyRoster.DutyRosterStatusBadge status={row.state} />
	{:else if column.key === 'latest'}
		{#if row.latest}
			<DutyRoster.DutyRosterStatusBadge status="latest" />
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
