<script lang="ts">
	import { AlertTriangle, ClipboardList, FileUp, Filter, MoreHorizontal, Search, Trash2 } from '@lucide/svelte';
	import DateCell from '$lib/components/ui/DateCell.svelte';
	import InlineNotes from '$lib/components/ui/InlineNotes.svelte';
	import LegacyBadge from '$lib/components/ui/Badge.svelte';
	import LegacyEmptyState from '$lib/components/ui/EmptyState.svelte';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import LegacySkeletonBlock from '$lib/components/ui/SkeletonBlock.svelte';
	import LegacySkeletonGrid from '$lib/components/ui/SkeletonGrid.svelte';
	import LegacySkeletonLine from '$lib/components/ui/SkeletonLine.svelte';
	import LegacySpinner from '$lib/components/ui/Spinner.svelte';
	import Stepper from '$lib/components/ui/Stepper.svelte';
	import * as DateCellPrimitive from '$lib/components/ui/date-cell/index.js';
	import * as InlineNotesPrimitive from '$lib/components/ui/inline-notes/index.js';
	import * as OperationalMatrix from '$lib/components/ui/operational-matrix/index.js';
	import type { OperationalMatrixColumn, OperationalMatrixRow } from '$lib/components/ui/operational-matrix/index.js';
	import { ReportBarChart, ReportLineChart } from '$lib/components/ui/report-chart/index.js';
	import * as StepperPrimitive from '$lib/components/ui/stepper/index.js';
	import type { StepperStep } from '$lib/components/ui/stepper/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { CalendarStatusBadge } from '$lib/components/ui/calendar-status-badge/index.js';
	import * as ButtonGroup from '$lib/components/ui/button-group/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { NativeSelect } from '$lib/components/ui/native-select/index.js';
	import { Progress } from '$lib/components/ui/progress/index.js';
	import * as RadioGroup from '$lib/components/ui/radio-group/index.js';
	import * as ReadinessBand from '$lib/components/ui/readiness-band/index.js';
	import {
		CriticalTaskStatusBadge,
		TrainingStatusBadge,
		type CriticalTaskRequirementStatus,
		type TrainingRequirementStatus
	} from '$lib/components/ui/requirement-status-badge/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Toggle } from '$lib/components/ui/toggle/index.js';
	import * as WorkflowPanel from '$lib/components/ui/workflow-panel/index.js';
	import type { AssignmentType, AvailabilityEntry, DailyAssignment, StatusType } from '$lib/types';
	import type { DutyEventBadge } from '$features/calendar/utils/dutyEventBadges';

	type ComponentMapItem = {
		id: string;
		group: string;
		current: string;
		target: string | null;
		status: 'direct' | 'compose' | 'needs-decision' | 'no-target';
		notes: string;
	};

	const mapItems: ComponentMapItem[] = [
		{
			id: 'buttons',
			group: 'Commands',
			current: '.btn, .btn-primary, .btn-secondary, .btn-danger, .btn-sm',
			target: 'ui/button',
			status: 'direct',
			notes: 'Map old button classes to shadcn button variants and sizes.'
		},
		{
			id: 'icon-buttons',
			group: 'Commands',
			current: '.btn-icon, .btn-icon-danger',
			target: 'ui/button size="icon"',
			status: 'direct',
			notes: 'Use lucide icons inside shadcn buttons with an accessible label.'
		},
		{
			id: 'segmented-controls',
			group: 'Commands',
			current: 'SegmentedControl.svelte',
			target: 'ui/button-group plus ui/button',
			status: 'compose',
			notes: 'View-mode controls should become grouped shadcn buttons or a shared toolbar view toggle.'
		},
		{
			id: 'toggle',
			group: 'Commands',
			current: 'Route-local pressed buttons and boolean toolbar filters',
			target: 'ui/toggle',
			status: 'compose',
			notes: 'Use for independent on/off toolbar states, not row selection.'
		},
		{
			id: 'inputs',
			group: 'Forms',
			current: '.input',
			target: 'ui/input',
			status: 'direct',
			notes: 'Keep width and layout outside the primitive.'
		},
		{
			id: 'textarea',
			group: 'Forms',
			current: 'textarea.input',
			target: 'ui/textarea',
			status: 'direct',
			notes: 'Use for notes, reasons, and paste/import fields.'
		},
		{
			id: 'selects',
			group: 'Forms',
			current: '.select',
			target: 'ui/select',
			status: 'direct',
			notes: 'Use shadcn select for consistent visuals across Windows, macOS, Linux, and browser engines.'
		},
		{
			id: 'checkboxes',
			group: 'Forms',
			current: 'input[type="checkbox"], .checkbox-label',
			target: 'ui/checkbox plus ui/field',
			status: 'direct',
			notes: 'Use checkbox for multi-select and batch selection.'
		},
		{
			id: 'radio',
			group: 'Forms',
			current: 'Native radio groups',
			target: 'ui/radio-group plus ui/field',
			status: 'direct',
			notes: 'Use when the user must choose exactly one option.'
		},
		{
			id: 'switch',
			group: 'Forms',
			current: 'Route-local boolean setting rows',
			target: 'ui/switch plus ui/field',
			status: 'direct',
			notes: 'Use switch only for immediate on/off settings.'
		},
		{
			id: 'badges',
			group: 'Status',
			current: 'Badge.svelte, .chip, status dots',
			target: 'ui/badge',
			status: 'direct',
			notes: 'Base Badge should stay semantic. Calendar custom colors belong behind CalendarStatusBadge.'
		},
		{
			id: 'legends',
			group: 'Status',
			current: 'Training and Critical Tasks legend strips',
			target: 'Requirement status badge wrappers plus ui/readiness-band',
			status: 'compose',
			notes:
				'Use TrainingStatusBadge and CriticalTaskStatusBadge for requirement status keys. Use ui/readiness-band for report readiness tiers.'
		},
		{
			id: 'skeletons',
			group: 'Feedback',
			current: 'SkeletonLine, SkeletonBlock, SkeletonGrid, .skeleton-pulse',
			target: 'ui/skeleton',
			status: 'compose',
			notes: 'Keep project grid/line helpers as wrappers over shadcn skeleton.'
		},
		{
			id: 'loading',
			group: 'Feedback',
			current: 'Spinner.svelte, .spinner',
			target: 'ui/spinner and ui/progress',
			status: 'direct',
			notes: 'Spinner for indeterminate work. Progress for known completion.'
		},
		{
			id: 'empty-alert',
			group: 'Feedback',
			current: 'EmptyState.svelte and route-local notice boxes',
			target: 'ui/empty and ui/alert',
			status: 'compose',
			notes: 'Empty and alert copy stays route-owned. Shape and spacing stay shared.'
		},
		{
			id: 'page-toolbar',
			group: 'Workspace structure',
			current: 'PageToolbar, ToolbarSearch, ToolbarSelect, OverflowMenu',
			target: 'ui/workspace-toolbar, ui/input, ui/select, ui/dropdown-menu',
			status: 'compose',
			notes: 'Toolbar behavior remains route-owned. Visual structure should stay in the shared toolbar.'
		},
		{
			id: 'modal-dialogs',
			group: 'Overlays',
			current: 'Modal.svelte',
			target: 'ui/app-dialog or ui/dialog',
			status: 'compose',
			notes: 'Standard form and review dialogs should use the shared app dialog foundation.'
		},
		{
			id: 'confirm-dialogs',
			group: 'Overlays',
			current: 'ConfirmDialog.svelte',
			target: 'ui/alert-dialog',
			status: 'direct',
			notes: 'Destructive and warning confirmations already have a shadcn-backed shared wrapper.'
		},
		{
			id: 'date-cell',
			group: 'Data display',
			current: 'DateCell.svelte',
			target: 'ui/date-cell',
			status: 'direct',
			notes: 'Project-specific primitive using the same tokenized calendar cell treatment as ui-showroom/calendar.'
		},
		{
			id: 'inline-notes',
			group: 'Data display',
			current: 'InlineNotes.svelte',
			target: 'ui/inline-notes',
			status: 'direct',
			notes: 'Project note thread wrapper composed from shadcn button, badge, and textarea primitives.'
		},
		{
			id: 'stepper',
			group: 'Workflow structure',
			current: 'Stepper.svelte',
			target: 'ui/stepper',
			status: 'direct',
			notes: 'Ported as a shadcn-style compound Svelte primitive. The legacy wrapper now delegates to it.'
		},
		{
			id: 'type-manager',
			group: 'Workflow structure',
			current: 'TypeManager.svelte and status/type manager patterns',
			target: 'ui/type-manager',
			status: 'compose',
			notes: 'Compound management dialog composed from app-dialog, button, empty, and alert-dialog primitives.'
		},
		{
			id: 'training-matrix-surfaces',
			group: 'Data display',
			current: 'TrainingMatrix.svelte and Critical Tasks IctMatrix.svelte',
			target: 'ui/operational-matrix plus requirement status badges',
			status: 'compose',
			notes:
				'IctMatrix should retire into the training-matrix parity path. Use OperationalMatrix.ColumnHeader orientation="vertical" for narrow task-code columns.'
		},
		{
			id: 'training-report-surfaces',
			group: 'Workspace structure',
			current: 'Training matrix/report panels and Critical Tasks matrix report surfaces',
			target: 'ui/report-workspace plus ui/operational-matrix',
			status: 'compose',
			notes:
				'Report shells, filters, export surfaces, matrix overflow, and empty/loading/error states should map to shared report workspace and matrix primitives.'
		},
		{
			id: 'report-charts',
			group: 'Data display',
			current: 'Critical Tasks LayerChart report charts',
			target: 'ui/report-chart line and bar components',
			status: 'compose',
			notes:
				'Current reports need shadcn chart container plus LayerChart line, stacked bar, and grouped/overlap bar compositions. No area chart need is present yet.'
		},
		{
			id: 'workflow-panels',
			group: 'Workflow structure',
			current: 'Onboarding, training type, and workflow manager panels',
			target: 'ui/workflow-panel plus ui/alert',
			status: 'compose',
			notes:
				'Route code owns data and actions. Shared components own two-panel manager shape, notice banners, selected rows, spacing, borders, and density.'
		},
		{
			id: 'file-upload',
			group: 'Import structure',
			current: 'FileUpload.svelte',
			target: 'ui/input type="file"',
			status: 'compose',
			notes: 'Simple file inputs map directly. Upload workflows may still need app-specific wrappers.'
		},
		{
			id: 'bulk-import-table',
			group: 'Import structure',
			current: 'BulkImportTable.svelte',
			target: 'ui/data-table or ui/bulk-import-workspace',
			status: 'compose',
			notes: 'Preview tables should use the shared data-table foundation inside import workspace patterns.'
		},
		{
			id: 'help-affordances',
			group: 'Support',
			current: 'HelpButton.svelte and HelpPanel.svelte',
			target: 'ui/popover',
			status: 'direct',
			notes:
				'Help opens as an anchored popover from the toolbar trigger. The legacy HelpPanel stays as a no-op wrapper.'
		},
		{
			id: 'banners',
			group: 'Feedback',
			current: 'AnnouncementBanner, BannerStack, DemoBanner, SubscriptionBanner',
			target: 'ui/alert',
			status: 'compose',
			notes: 'Alert covers the primitive. Persistent banner stacking remains project-specific behavior.'
		}
	];

	const trainingLegend = [
		{ label: 'Current', color: '#345b22' },
		{ label: 'Expiring Soon', color: '#c47f00' },
		{ label: 'Expiring', color: '#8a5800' },
		{ label: 'Expired', color: '#8a2d25' },
		{ label: 'Not Done', color: '#6f716d' },
		{ label: 'N/A', color: '#d6d5d0' }
	];

	const criticalTaskLegend = [
		{ label: 'Current', mark: 'OK', tone: 'good' },
		{ label: 'Expiring Soon', mark: '!', tone: 'warn' },
		{ label: 'Expired', mark: 'X', tone: 'danger' },
		{ label: 'Not Recorded', mark: '-', tone: 'empty' },
		{ label: 'Not Required', mark: '', tone: 'na' }
	];

	const readinessLegend = [
		{ label: '<60%', tier: 'danger' },
		{ label: '60-69%', tier: 'warn' },
		{ label: '70-79%', tier: 'caution' },
		{ label: '80-89%', tier: 'okay' },
		{ label: '90%+', tier: 'good' },
		{ label: 'N/A', tier: 'na' }
	];

	const requirementStatusLegend = [
		{
			label: 'Current',
			source: 'Training current / Critical Tasks current',
			token: 'green-500',
			trainingStatus: 'current',
			criticalTaskStatus: 'current'
		},
		{
			label: 'Expiring Soon',
			source: 'Training warning-yellow / Critical Tasks expiring-soon',
			token: 'yellow-400',
			trainingStatus: 'warning-yellow',
			criticalTaskStatus: 'expiring-soon'
		},
		{
			label: 'Expiring',
			source: 'Training warning-orange',
			token: 'orange-500',
			trainingStatus: 'warning-orange'
		},
		{
			label: 'Expired',
			source: 'Training expired / Critical Tasks expired',
			token: 'red-600',
			trainingStatus: 'expired',
			criticalTaskStatus: 'expired'
		},
		{
			label: 'Missing',
			source: 'Training not-completed / Critical Tasks not-recorded',
			token: 'muted',
			trainingStatus: 'not-completed',
			criticalTaskStatus: 'not-recorded'
		},
		{
			label: 'Not Required',
			source: 'Training not-required / MOS not applicable',
			token: 'diagonal hatch',
			trainingStatus: 'not-required',
			criticalTaskStatus: 'not-required'
		},
		{
			label: 'Exempt',
			source: 'Training exempt',
			token: 'info',
			trainingStatus: 'exempt'
		}
	] satisfies {
		label: string;
		source: string;
		token: string;
		trainingStatus?: TrainingRequirementStatus;
		criticalTaskStatus?: CriticalTaskRequirementStatus;
	}[];

	const dateCellStatusTypes = new Map<string, StatusType>([
		[
			'leave',
			{
				id: 'leave',
				name: 'Leave',
				color: '#345b22',
				textColor: '#f7f8f4',
				da6AvailabilityTreatment: 'authorized-absence',
				da6TreatmentReviewed: true
			}
		],
		[
			'training',
			{
				id: 'training',
				name: 'Training',
				color: '#c47f00',
				textColor: '#0e0e0d',
				da6AvailabilityTreatment: 'other-duty',
				da6TreatmentReviewed: true
			}
		]
	]);

	const dateCellEntries: AvailabilityEntry[] = [
		{
			id: 'availability-1',
			personnelId: 'personnel-1',
			statusTypeId: 'leave',
			startDate: '2026-05-09',
			endDate: '2026-05-10',
			note: 'Approved pass'
		},
		{
			id: 'availability-2',
			personnelId: 'personnel-1',
			statusTypeId: 'training',
			startDate: '2026-05-09',
			endDate: '2026-05-09',
			note: 'Range support'
		}
	];

	const dateCellAssignments: { type: AssignmentType; assignment: DailyAssignment }[] = [
		{
			type: {
				id: 'staff-duty',
				name: 'Staff Duty',
				shortName: 'SD',
				assignTo: 'personnel',
				color: '#263f75',
				exemptPersonnelIds: [],
				showInDateHeader: true
			},
			assignment: {
				id: 'assignment-1',
				date: '2026-05-09',
				assignmentTypeId: 'staff-duty',
				assigneeId: 'personnel-1'
			}
		}
	];

	const dateCellDutyBadges: DutyEventBadge[] = [
		{
			shortName: 'CQ',
			color: '#6f3f7d',
			textColor: '#ffffff',
			title: 'Charge of Quarters',
			eventId: 'duty-event-1',
			slotId: 'slot-1'
		}
	];

	const dateCellTargetStatuses = [
		{ id: 'leave', name: 'Leave', color: '#345b22', textColor: '#f7f8f4', note: 'Approved pass' },
		{ id: 'training', name: 'Training', color: '#c47f00', textColor: '#0e0e0d', note: 'Range support' }
	];

	const dateCellTargetMarkers = [
		{ id: 'staff-duty', name: 'Staff Duty', shortName: 'SD', color: '#263f75', textColor: '#ffffff' },
		{ id: 'cq', name: 'Charge of Quarters', shortName: 'CQ', color: '#6f3f7d', textColor: '#ffffff' }
	];

	const inlineNotes = [
		{
			text: 'Commander wants this reviewed before the Friday sync.',
			timestamp: '2026-05-09T14:30:00.000Z',
			userId: 'user-1'
		},
		{
			text: 'Follow-up owner changed after the morning update.',
			timestamp: '2026-05-09T16:15:00.000Z',
			userId: 'user-2'
		}
	];

	const typeManagerItems = [
		{ name: 'Leave', color: '#345b22', description: 'Approved absence from normal duty.' },
		{ name: 'School', color: '#263f75', description: 'External training or course attendance.' },
		{ name: 'Profile', color: '#8a2d25', description: 'Medical limitation or duty restriction.' }
	];

	type MatrixPreviewRow = OperationalMatrixRow & {
		meta: {
			role: string;
		};
	};

	type MatrixPreviewColumn = OperationalMatrixColumn & {
		meta: {
			code: string;
		};
	};

	const matrixPreviewRows: MatrixPreviewRow[] = [
		{ id: 'morgan', label: 'Morgan Lee', meta: { role: 'Squad leader' } },
		{ id: 'casey', label: 'Casey Nguyen', meta: { role: 'Team leader' } },
		{ id: 'avery', label: 'Avery Brooks', meta: { role: 'Rifleman' } }
	];

	const matrixPreviewColumns: MatrixPreviewColumn[] = [
		{ id: 'weapons', label: 'Weapons qualification', meta: { code: 'IWQ' } },
		{ id: 'medical', label: 'Combat lifesaver', meta: { code: 'CLS' } },
		{ id: 'driver', label: 'Driver training', meta: { code: 'DRV' } }
	];

	const matrixPreviewStatuses: Record<string, Record<string, TrainingRequirementStatus>> = {
		morgan: { weapons: 'current', medical: 'warning-yellow', driver: 'current' },
		casey: { weapons: 'expired', medical: 'current', driver: 'not-required' },
		avery: { weapons: 'not-completed', medical: 'warning-orange', driver: 'exempt' }
	};

	const reportChartRows = [
		{ label: 'Jan', unit: 91, infantry: 88, maintenance: 82, expiring: 4, medical: 2 },
		{ label: 'Feb', unit: 89, infantry: 85, maintenance: 80, expiring: 7, medical: 3 },
		{ label: 'Mar', unit: 86, infantry: 82, maintenance: 78, expiring: 10, medical: 4 },
		{ label: 'Apr', unit: 84, infantry: 80, maintenance: 75, expiring: 12, medical: 5 }
	];

	const reportLineSeries = [
		{ key: 'unit', label: 'Unit', color: 'var(--chart-1)', strokeWidth: 2.5 },
		{ key: 'infantry', label: '11B', color: 'var(--chart-2)' },
		{ key: 'maintenance', label: '91B', color: 'var(--chart-3)' }
	];

	const reportBarSeries = [
		{ key: 'expiring', label: 'Weapons', color: 'var(--chart-4)' },
		{ key: 'medical', label: 'Medical', color: 'var(--chart-5)' }
	];

	function matrixPreviewStatus(rowId: string, columnId: string): TrainingRequirementStatus {
		return matrixPreviewStatuses[rowId]?.[columnId] ?? 'not-completed';
	}

	let selectedMode = $state('matrix');
	let shadcnSelectValue = $state('ready');
	let nativeSelectValue = $state('all');
	let nativeCheckbox = $state(true);
	let shadcnCheckbox = $state(true);
	let nativeRadio = $state('organization');
	let shadcnRadio = $state('organization');
	let switchChecked = $state(true);
	let togglePressed = $state(true);
	let stepperPreviewValue = $state('review');

	const stepperPreviewSteps: StepperStep[] = [
		{ value: 'draft', label: 'Draft', completed: true },
		{ value: 'review', label: 'Review', description: 'Current approval stage' },
		{ value: 'approve', label: 'Approve' },
		{ value: 'publish', label: 'Publish', disabled: true }
	];
</script>

<svelte:head>
	<title>Conversion Map | UI Showroom</title>
</svelte:head>

<div class="conversion-map">
	<header class="conversion-map__header">
		<div>
			<p class="eyebrow">UI Showroom</p>
			<h1>Primitive Conversion Map</h1>
			<p>
				Side-by-side reference for the current TroopToTask building blocks and the shadcn-svelte targets already present
				in this repo.
			</p>
		</div>
		<a class="conversion-map__back" href="/ui-showroom">Back to showroom</a>
	</header>

	<section class="conversion-map__summary" aria-labelledby="map-summary-heading">
		<div>
			<p class="eyebrow">First pass</p>
			<h2 id="map-summary-heading">Primitive and form-element scope</h2>
		</div>
		<div class="summary-grid">
			<div>
				<strong>{mapItems.length}</strong>
				<span>Mapped primitives</span>
			</div>
			<div>
				<strong>3</strong>
				<span>Legend systems captured</span>
			</div>
			<div>
				<strong>0</strong>
				<span>Route migrations</span>
			</div>
		</div>
	</section>

	<section class="conversion-map__table" aria-labelledby="mapping-table-heading">
		<div class="section-heading">
			<p class="eyebrow">Inventory</p>
			<h2 id="mapping-table-heading">One-to-one target map</h2>
		</div>

		<div class="mapping-table" role="table" aria-label="Primitive conversion map">
			<div class="mapping-table__head" role="row">
				<span role="columnheader">Current</span>
				<span role="columnheader">shadcn-svelte target</span>
				<span role="columnheader">Decision state</span>
				<span role="columnheader">Notes</span>
			</div>
			{#each mapItems as item (item.id)}
				<div class="mapping-row" role="row">
					<div role="cell">
						<span class="map-group">{item.group}</span>
						<strong>{item.current}</strong>
					</div>
					<div role="cell">
						{#if item.target}
							<code>{item.target}</code>
						{:else}
							<span class="blank-target" aria-label="No shadcn-svelte target selected"></span>
						{/if}
					</div>
					<div role="cell">
						<span class="decision-pill" data-status={item.status}>
							{item.status === 'direct'
								? 'Direct'
								: item.status === 'compose'
									? 'Compose'
									: item.status === 'no-target'
										? 'No target'
										: 'Needs decision'}
						</span>
					</div>
					<div role="cell">{item.notes}</div>
				</div>
			{/each}
		</div>
	</section>

	<section class="unmatched-section" aria-labelledby="unmatched-heading">
		<div class="section-heading">
			<p class="eyebrow">New equivalents</p>
			<h2 id="unmatched-heading">Project patterns now mapped to shadcn-aligned primitives</h2>
			<p class="section-subtitle">
				Shared primitive replacements are shown beside legacy wrappers. Open design decisions keep the shadcn side
				blank.
			</p>
		</div>

		<div class="unmatched-grid">
			<div class="unmatched-card unmatched-card--full">
				<div class="unmatched-card__header">
					<span class="map-group">Data display</span>
					<h3>DateCell.svelte</h3>
				</div>
				<div class="unmatched-pair">
					<div class="pattern-preview">
						<p class="legend-label">Current component</p>
						<div class="date-cell-frame" aria-label="Current DateCell preview">
							<DateCell
								date={new Date('2026-05-09T12:00:00')}
								isWeekend={false}
								isToday={true}
								isHoliday={true}
								holidayName="Training Holiday"
								entries={dateCellEntries}
								statusTypeMap={dateCellStatusTypes}
								assignments={dateCellAssignments}
								dutyBadges={dateCellDutyBadges}
								showStatusText={true}
							/>
						</div>
					</div>
					<div class="pattern-preview">
						<p class="legend-label">ui/date-cell</p>
						<div class="date-cell-frame" aria-label="shadcn-aligned DateCell preview">
							<DateCellPrimitive.Root
								today
								holiday
								holidayName="Training Holiday"
								statuses={dateCellTargetStatuses}
								markers={dateCellTargetMarkers}
								showStatusText
							/>
						</div>
					</div>
				</div>
			</div>

			<div class="unmatched-card unmatched-card--full">
				<div class="unmatched-card__header">
					<span class="map-group">Data display</span>
					<h3>InlineNotes.svelte</h3>
				</div>
				<div class="unmatched-pair">
					<div class="pattern-preview">
						<p class="legend-label">Current component</p>
						<InlineNotes
							notes={inlineNotes}
							resolveAuthor={(userId) => (userId === 'user-1' ? 'Morgan Lee' : 'Casey Nguyen')}
							onAddNote={() => undefined}
						/>
					</div>
					<div class="pattern-preview">
						<p class="legend-label">ui/inline-notes</p>
						<InlineNotesPrimitive.Root
							notes={inlineNotes}
							resolveAuthor={(userId) => (userId === 'user-1' ? 'Morgan Lee' : 'Casey Nguyen')}
							onAddNote={() => undefined}
							open
						/>
					</div>
				</div>
			</div>

			<div class="unmatched-card unmatched-card--full">
				<div class="unmatched-card__header">
					<span class="map-group">Workflow structure</span>
					<h3>TypeManager.svelte and status/type manager patterns</h3>
				</div>
				<div class="unmatched-pair">
					<div class="pattern-preview">
						<p class="legend-label">Current repeated structure</p>
						<div class="type-manager-preview" aria-label="Current TypeManager pattern preview">
							<div class="type-manager-add-row">
								<input class="input" value="Temporary Duty" aria-label="Example type name" />
								<input class="input type-color-input" type="color" value="#6f3f7d" aria-label="Example type color" />
								<button class="btn btn-primary btn-sm" type="button">Add type</button>
							</div>
							<div class="type-manager-list">
								{#each typeManagerItems as item (item.name)}
									<div class="type-manager-item">
										<span class="type-swatch" style:background-color={item.color}></span>
										<div>
											<strong>{item.name}</strong>
											<span>{item.description}</span>
										</div>
										<button class="btn btn-secondary btn-sm" type="button">Edit</button>
									</div>
								{/each}
							</div>
						</div>
					</div>
					<div class="pattern-preview" aria-label="ui/type-manager target pattern preview">
						<p class="legend-label">ui/type-manager</p>
						<div class="type-manager-preview type-manager-preview--target">
							<div class="type-manager-add-row">
								<Input value="Temporary Duty" aria-label="Example target type name" />
								<Input class="type-color-input" type="color" value="#6f3f7d" aria-label="Example target type color" />
								<Button size="sm" type="button">Add</Button>
							</div>
							<div class="type-manager-list">
								{#each typeManagerItems as item (item.name)}
									<div class="type-manager-item type-manager-item--target">
										<span class="type-swatch" style:background-color={item.color}></span>
										<div>
											<strong>{item.name}</strong>
											<span>{item.description}</span>
										</div>
										<Button variant="outline" size="sm" type="button">Edit</Button>
									</div>
								{/each}
							</div>
						</div>
					</div>
				</div>
			</div>

			<div class="unmatched-card unmatched-card--full">
				<div class="unmatched-card__header">
					<span class="map-group">Status</span>
					<h3>Training and Critical Tasks legend strips</h3>
				</div>
				<div class="unmatched-pair">
					<div class="pattern-preview">
						<p class="legend-label">Current repeated structure</p>
						<div class="legend-panel">
							<p class="legend-label">Training matrix</p>
							<div class="legacy-color-legend" aria-label="Training status color legend">
								{#each trainingLegend as item (item.label)}
									<span>
										<i style:background-color={item.color}></i>
										{item.label}
									</span>
								{/each}
							</div>
						</div>
						<div class="legend-panel">
							<p class="legend-label">Critical Tasks matrix</p>
							<div class="legacy-mark-legend" aria-label="Critical Tasks status legend">
								{#each criticalTaskLegend as item (item.label)}
									<span data-tone={item.tone}>
										<i>{item.mark}</i>
										{item.label}
									</span>
								{/each}
							</div>
						</div>
						<div class="legend-panel">
							<p class="legend-label">Readiness bands</p>
							<div class="readiness-key" aria-label="Readiness matrix tiers">
								{#each readinessLegend as item (item.label)}
									<span data-tier={item.tier}>
										<i></i>
										{item.label}
									</span>
								{/each}
							</div>
						</div>
					</div>
					<div class="pattern-preview">
						<p class="legend-label">shadcn side</p>
						<div class="requirement-status-board" aria-label="Requirement status badge target mapping">
							<div class="requirement-status-board__header">
								<strong>Domain wrappers</strong>
								<span>Shared requirement status visuals</span>
							</div>
							<div class="requirement-status-list">
								{#each requirementStatusLegend as item (item.label)}
									<div class="requirement-status-row">
										<div class="requirement-status-badges">
											{#if item.trainingStatus}
												<TrainingStatusBadge status={item.trainingStatus} />
											{/if}
											{#if item.criticalTaskStatus}
												<CriticalTaskStatusBadge status={item.criticalTaskStatus} />
											{/if}
										</div>
										<div>
											<strong>{item.token}</strong>
											<span>{item.source}</span>
										</div>
									</div>
								{/each}
							</div>
							<p>
								Calendar remains separate:
								<CalendarStatusBadge
									statusType={{
										id: 'calendar-status-example',
										name: 'Training',
										color: '#345b22',
										textColor: '#f7f8f4'
									}}>CalendarStatusBadge</CalendarStatusBadge
								>
								owns saved status colors instead of the base Badge API.
							</p>
							<div class="readiness-band-board" aria-label="Readiness band target mapping">
								<div class="requirement-status-board__header">
									<strong>Readiness bands</strong>
									<span>Shared report heat-cell tiers</span>
								</div>
								<div class="readiness-band-cells" aria-label="Readiness band cell examples">
									<ReadinessBand.Cell tier="danger" percent={48} aria-label="Example danger readiness" />
									<ReadinessBand.Cell tier="warn" percent={64} aria-label="Example warning readiness" />
									<ReadinessBand.Cell tier="caution" percent={76} aria-label="Example caution readiness" />
									<ReadinessBand.Cell tier="okay" percent={84} aria-label="Example okay readiness" />
									<ReadinessBand.Cell tier="good" percent={96} aria-label="Example good readiness" />
									<ReadinessBand.Cell
										tier="not-applicable"
										percent={null}
										aria-label="Example not applicable readiness"
									/>
								</div>
								<ReadinessBand.Legend />
							</div>
						</div>
					</div>
				</div>
			</div>

			<div class="unmatched-card unmatched-card--full">
				<div class="unmatched-card__header">
					<span class="map-group">Data display</span>
					<h3>Training matrix and report surfaces</h3>
				</div>
				<div class="unmatched-pair unmatched-pair--wide-target">
					<div class="pattern-preview">
						<p class="legend-label">Current route-local decisions</p>
						<div class="legacy-matrix-preview" aria-label="Current training matrix surface decisions">
							<div class="legacy-matrix-toolbar">
								<span>Matrix view</span>
								<span>Legend, sticky cells, and status colors are local.</span>
							</div>
							<div class="legacy-matrix-grid" aria-hidden="true">
								<span></span>
								<span>IWQ</span>
								<span>CLS</span>
								<span>DRV</span>
								<span>Morgan Lee</span>
								<i data-state="current"></i>
								<i data-state="warning"></i>
								<i data-state="current"></i>
								<span>Casey Nguyen</span>
								<i data-state="expired"></i>
								<i data-state="current"></i>
								<i data-state="na"></i>
							</div>
							<p>
								Critical Tasks `IctMatrix` should go away in favor of this training-matrix parity path, with
								matrix/report visuals owned by shared components.
							</p>
						</div>
					</div>
					<div class="pattern-preview">
						<p class="legend-label">ui/operational-matrix target</p>
						<div class="matrix-target-board" aria-label="Training matrix target mapping">
							<Alert.Root variant="info">
								<Alert.Title>IctMatrix retirement path</Alert.Title>
								<Alert.Description>
									Use the same matrix primitive as training, then compose requirement badges and report workspace states
									around it.
								</Alert.Description>
							</Alert.Root>

							<OperationalMatrix.Root rows={matrixPreviewRows} columns={matrixPreviewColumns} readOnly>
								<OperationalMatrix.Viewport ariaLabel="Training matrix preview viewport">
									<OperationalMatrix.Table ariaLabel="Training matrix preview">
										<OperationalMatrix.Header>
											<OperationalMatrix.HeaderRow>
												<OperationalMatrix.CornerCell>Personnel</OperationalMatrix.CornerCell>
												{#each matrixPreviewColumns as column (column.id)}
													<OperationalMatrix.ColumnHeader {column} orientation="vertical">
														{column.meta.code}
													</OperationalMatrix.ColumnHeader>
												{/each}
											</OperationalMatrix.HeaderRow>
										</OperationalMatrix.Header>
										<OperationalMatrix.Body>
											{#each matrixPreviewRows as row (row.id)}
												<OperationalMatrix.Row {row}>
													<OperationalMatrix.RowHeader {row}>
														<span>{row.label}</span>
														<span>{row.meta.role}</span>
													</OperationalMatrix.RowHeader>
													{#each matrixPreviewColumns as column (column.id)}
														<OperationalMatrix.Cell
															{row}
															{column}
															ariaLabel={`${row.label} ${column.label} ${matrixPreviewStatus(row.id, column.id)}`}
														>
															<TrainingStatusBadge status={matrixPreviewStatus(row.id, column.id)} />
														</OperationalMatrix.Cell>
													{/each}
												</OperationalMatrix.Row>
											{/each}
										</OperationalMatrix.Body>
									</OperationalMatrix.Table>
								</OperationalMatrix.Viewport>
							</OperationalMatrix.Root>
						</div>
					</div>
				</div>
			</div>

			<div class="unmatched-card unmatched-card--full">
				<div class="unmatched-card__header">
					<span class="map-group">Data display</span>
					<h3>Critical Tasks report charts</h3>
				</div>
				<div class="unmatched-pair unmatched-pair--wide-target">
					<div class="pattern-preview">
						<p class="legend-label">Current route-local chart decisions</p>
						<div class="legacy-chart-preview" aria-label="Current Critical Tasks report chart mapping">
							<div>
								<strong>Readiness Trend</strong>
								<span>Multi-series LayerChart line chart with report-local axis, legend, and tooltip styling.</span>
							</div>
							<div>
								<strong>Expiration Cliff</strong>
								<span>Stacked LayerChart bar chart by month and MOS.</span>
							</div>
							<div>
								<strong>Readiness Distribution</strong>
								<span>Grouped or overlapped LayerChart bar chart by readiness band and selected MOS.</span>
							</div>
							<p>Area charts are not represented in current report usage.</p>
						</div>
					</div>
					<div class="pattern-preview">
						<p class="legend-label">ui/report-chart target</p>
						<div class="report-chart-target-grid">
							<div>
								<h4>Line chart</h4>
								<ReportLineChart
									data={reportChartRows}
									series={reportLineSeries}
									ariaLabel="Showroom Critical Tasks readiness trend"
									yDomain={[70, 100]}
									yTicks={[70, 80, 90, 100]}
									heightClass="min-h-[180px]"
								/>
							</div>
							<div>
								<h4>Stacked bar chart</h4>
								<ReportBarChart
									data={reportChartRows}
									series={reportBarSeries}
									ariaLabel="Showroom Critical Tasks expiration cliff"
									layout="stack"
									yDomain={[0, 18]}
									yTicks={[0, 6, 12, 18]}
									heightClass="min-h-[180px]"
								/>
							</div>
							<div>
								<h4>Grouped or overlap bar chart</h4>
								<ReportBarChart
									data={reportChartRows}
									series={reportBarSeries}
									ariaLabel="Showroom Critical Tasks readiness distribution"
									layout="overlap"
									yDomain={[0, 18]}
									yTicks={[0, 6, 12, 18]}
									heightClass="min-h-[180px]"
								/>
							</div>
						</div>
					</div>
				</div>
			</div>

			<div class="unmatched-card unmatched-card--full">
				<div class="unmatched-card__header">
					<span class="map-group">Workflow structure</span>
					<h3>Onboarding and workflow panels</h3>
				</div>
				<div class="unmatched-pair unmatched-pair--wide-target">
					<div class="pattern-preview">
						<p class="legend-label">Current repeated structure</p>
						<div class="legacy-workflow-preview" aria-label="Current workflow panel surface decisions">
							<div class="legacy-notice">
								<strong>Configuration warning</strong>
								<span>Route-local warning, spacing, icon, and tone decisions repeat across workflows.</span>
							</div>
							<div class="legacy-workflow-grid">
								<div>
									<strong>Training types</strong>
									<span>Leave</span>
									<span>School</span>
									<span>Profile</span>
								</div>
								<div>
									<strong>Selected type</strong>
									<span>Form rows, helper copy, and empty states are composed locally.</span>
								</div>
							</div>
						</div>
					</div>
					<div class="pattern-preview">
						<p class="legend-label">ui/workflow-panel and ui/alert</p>
						<div class="workflow-target-board" aria-label="Workflow panel target mapping">
							<Alert.Root variant="warning">
								<AlertTriangle class="size-4" aria-hidden="true" />
								<Alert.Title>Review required before publishing</Alert.Title>
								<Alert.Description>
									Shared alert variants own tone and spacing. The route only supplies the message and action.
								</Alert.Description>
							</Alert.Root>

							<WorkflowPanel.Root aria-label="Training type workflow preview">
								<WorkflowPanel.Header>
									<WorkflowPanel.Title>Training type setup</WorkflowPanel.Title>
									<WorkflowPanel.Description>Shared list-detail shell for manager workflows.</WorkflowPanel.Description>
								</WorkflowPanel.Header>
								<WorkflowPanel.Content>
									<WorkflowPanel.Grid>
										<div class="workflow-target-list">
											{#each typeManagerItems as item, index (item.name)}
												<WorkflowPanel.Item selected={index === 0}>
													<span class="type-swatch" style:background-color={item.color}></span>
													<div>
														<strong>{item.name}</strong>
														<span>{item.description}</span>
													</div>
												</WorkflowPanel.Item>
											{/each}
										</div>
										<WorkflowPanel.Root variant="muted" aria-label="Selected training type detail">
											<WorkflowPanel.Header>
												<WorkflowPanel.Title>Leave</WorkflowPanel.Title>
												<WorkflowPanel.Description
													>Route-owned fields inside shared panel chrome.</WorkflowPanel.Description
												>
											</WorkflowPanel.Header>
											<WorkflowPanel.Content>
												<div class="workflow-target-form">
													<Field.Root>
														<Field.Label for="workflow-target-name">Name</Field.Label>
														<Input id="workflow-target-name" value="Leave" />
													</Field.Root>
													<Field.Root>
														<Field.Label for="workflow-target-description">Description</Field.Label>
														<Textarea id="workflow-target-description" value="Approved absence from normal duty." />
													</Field.Root>
													<div class="example-inline">
														<Button size="sm">Save</Button>
														<Button variant="outline" size="sm">Cancel</Button>
													</div>
												</div>
											</WorkflowPanel.Content>
										</WorkflowPanel.Root>
									</WorkflowPanel.Grid>
								</WorkflowPanel.Content>
							</WorkflowPanel.Root>
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<section class="comparison-list" aria-labelledby="examples-heading">
		<div class="section-heading">
			<p class="eyebrow">Examples</p>
			<h2 id="examples-heading">Current left, shadcn target right</h2>
		</div>

		<div class="comparison-row">
			<div class="comparison-cell">
				<h3>Current buttons</h3>
				<div class="example-stack">
					<div class="example-inline">
						<button class="btn btn-primary" type="button">Primary</button>
						<button class="btn btn-secondary" type="button">Secondary</button>
						<button class="btn btn-danger" type="button">Delete</button>
					</div>
					<div class="example-inline">
						<button class="btn btn-primary btn-sm" type="button">Small</button>
						<button class="btn btn-secondary btn-icon" type="button" aria-label="Current filter button">
							<Filter size={16} />
						</button>
						<button class="btn btn-icon btn-icon-danger" type="button" aria-label="Current delete icon button">
							<Trash2 size={16} />
						</button>
					</div>
				</div>
			</div>
			<div class="comparison-cell">
				<h3>shadcn button</h3>
				<div class="example-stack">
					<div class="example-inline">
						<Button>Primary</Button>
						<Button variant="outline">Secondary</Button>
						<Button variant="destructive">Delete</Button>
					</div>
					<div class="example-inline">
						<Button size="sm">Small</Button>
						<Button variant="outline" size="icon" aria-label="Filter">
							<Filter />
						</Button>
						<Button variant="destructive" size="icon" aria-label="Delete">
							<Trash2 />
						</Button>
					</div>
				</div>
			</div>
		</div>

		<div class="comparison-row">
			<div class="comparison-cell">
				<h3>Current grouped controls</h3>
				<SegmentedControl
					ariaLabel="Current view mode"
					options={[
						{ value: 'matrix', label: 'Matrix' },
						{ value: 'list', label: 'List' },
						{ value: 'report', label: 'Report' }
					]}
					bind:value={selectedMode}
				/>
			</div>
			<div class="comparison-cell">
				<h3>shadcn button group and toggle</h3>
				<div class="example-inline">
					<ButtonGroup.Root aria-label="Target view mode">
						<Button
							variant={selectedMode === 'matrix' ? 'secondary' : 'ghost'}
							onclick={() => (selectedMode = 'matrix')}
						>
							Matrix
						</Button>
						<Button variant={selectedMode === 'list' ? 'secondary' : 'ghost'} onclick={() => (selectedMode = 'list')}>
							List
						</Button>
						<Button
							variant={selectedMode === 'report' ? 'secondary' : 'ghost'}
							onclick={() => (selectedMode = 'report')}
						>
							Report
						</Button>
					</ButtonGroup.Root>
					<Toggle bind:pressed={togglePressed} variant="outline" aria-label="Show gaps only">Gaps</Toggle>
				</div>
			</div>
		</div>

		<div class="comparison-row">
			<div class="comparison-cell">
				<h3>Current stepper wrapper</h3>
				<Stepper
					stages={['Draft', 'Review', 'Approve', 'Publish']}
					currentStage="Review"
					onStageClick={() => undefined}
				/>
			</div>
			<div class="comparison-cell">
				<h3>shadcn-style stepper primitive</h3>
				<StepperPrimitive.Root
					steps={stepperPreviewSteps}
					value={stepperPreviewValue}
					onValueChange={(nextValue) => (stepperPreviewValue = nextValue)}
				>
					<StepperPrimitive.List>
						{#each stepperPreviewSteps as step (step.value)}
							<StepperPrimitive.Item value={step.value} label={step.label} description={step.description} />
						{/each}
					</StepperPrimitive.List>
				</StepperPrimitive.Root>
			</div>
		</div>

		<div class="comparison-row">
			<div class="comparison-cell">
				<h3>Current text fields</h3>
				<div class="legacy-form-stack">
					<label>
						<span class="label">Search</span>
						<input class="input" value="Alpha Company" aria-label="Current search" />
					</label>
					<label>
						<span class="label">Notes</span>
						<textarea class="input legacy-textarea" aria-label="Current notes">Follow up before Friday.</textarea>
					</label>
				</div>
			</div>
			<div class="comparison-cell">
				<h3>shadcn field, input, textarea</h3>
				<Field.Root>
					<Field.Label for="target-search">Search</Field.Label>
					<Input id="target-search" value="Alpha Company" />
					<Field.Description>Route layout owns width. The input owns control styling.</Field.Description>
				</Field.Root>
				<Field.Root>
					<Field.Label for="target-notes">Notes</Field.Label>
					<Textarea id="target-notes" value="Follow up before Friday." />
				</Field.Root>
			</div>
		</div>

		<div class="comparison-row">
			<div class="comparison-cell">
				<h3>Current select</h3>
				<label>
					<span class="label">Status</span>
					<select class="select" bind:value={nativeSelectValue} aria-label="Current status">
						<option value="all">All statuses</option>
						<option value="ready">Ready</option>
						<option value="action">Action required</option>
					</select>
				</label>
			</div>
			<div class="comparison-cell">
				<h3>shadcn native select and select</h3>
				<div class="example-inline">
					<NativeSelect bind:value={nativeSelectValue} aria-label="Target native select">
						<option value="all">All statuses</option>
						<option value="ready">Ready</option>
						<option value="action">Action required</option>
					</NativeSelect>
					<Select.Root type="single" bind:value={shadcnSelectValue}>
						<Select.Trigger aria-label="Target custom select">
							{shadcnSelectValue === 'ready' ? 'Ready' : shadcnSelectValue === 'watch' ? 'Watch' : 'Action required'}
						</Select.Trigger>
						<Select.Content>
							<Select.Item value="ready">Ready</Select.Item>
							<Select.Item value="watch">Watch</Select.Item>
							<Select.Item value="action">Action required</Select.Item>
						</Select.Content>
					</Select.Root>
				</div>
			</div>
		</div>

		<div class="comparison-row">
			<div class="comparison-cell">
				<h3>Current checkbox and radio</h3>
				<div class="legacy-form-stack">
					<label class="checkbox-label">
						<input type="checkbox" bind:checked={nativeCheckbox} />
						Include inactive personnel
					</label>
					<label class="checkbox-label">
						<input type="radio" bind:group={nativeRadio} value="organization" />
						Organization scope
					</label>
					<label class="checkbox-label">
						<input type="radio" bind:group={nativeRadio} value="groups" />
						Group scope
					</label>
				</div>
			</div>
			<div class="comparison-cell">
				<h3>shadcn checkbox, radio, switch</h3>
				<div class="shadcn-control-stack">
					<Field.Root orientation="horizontal">
						<Checkbox id="target-checkbox" bind:checked={shadcnCheckbox} />
						<Field.Content>
							<Label for="target-checkbox">Include inactive personnel</Label>
							<Field.Description>Use checkbox for multi-select and batch inclusion.</Field.Description>
						</Field.Content>
					</Field.Root>

					<RadioGroup.Root bind:value={shadcnRadio} aria-label="Target scope">
						<Field.Root orientation="horizontal">
							<RadioGroup.Item id="target-radio-org" value="organization" />
							<Label for="target-radio-org">Organization scope</Label>
						</Field.Root>
						<Field.Root orientation="horizontal">
							<RadioGroup.Item id="target-radio-group" value="groups" />
							<Label for="target-radio-group">Group scope</Label>
						</Field.Root>
					</RadioGroup.Root>

					<Field.Root orientation="horizontal">
						<Switch id="target-switch" bind:checked={switchChecked} />
						<Field.Content>
							<Label for="target-switch">Auto-notify leaders</Label>
							<Field.Description>Use switch for immediate on/off settings.</Field.Description>
						</Field.Content>
					</Field.Root>
				</div>
			</div>
		</div>

		<div class="comparison-row">
			<div class="comparison-cell">
				<h3>Current badges and chips</h3>
				<div class="example-inline">
					<LegacyBadge label="Ready" color="#345b22" textColor="#f7f8f4" />
					<LegacyBadge label="Warning" color="#c47f00" textColor="#0e0e0d" />
					<span class="chip chip-primary">Manual</span>
					<span class="chip chip-warning">Due</span>
				</div>
			</div>
			<div class="comparison-cell">
				<h3>shadcn badge</h3>
				<div class="example-inline">
					<CalendarStatusBadge statusType={{ id: 'ready', name: 'Ready', color: '#345b22', textColor: '#f7f8f4' }}>
						Ready
					</CalendarStatusBadge>
					<Badge variant="warning">Warning</Badge>
					<Badge variant="secondary">Manual</Badge>
					<Badge variant="danger">Due</Badge>
				</div>
			</div>
		</div>

		<div class="comparison-row">
			<div class="comparison-cell">
				<h3>Current skeletons</h3>
				<div class="example-stack">
					<LegacySkeletonLine width="70%" height="12px" />
					<LegacySkeletonBlock height="56px" />
					<LegacySkeletonGrid rows={2} columns={4} cellWidth="56px" cellHeight="28px" />
				</div>
			</div>
			<div class="comparison-cell">
				<h3>shadcn skeleton composition</h3>
				<div class="example-stack">
					<Skeleton class="h-3 w-[70%]" />
					<Skeleton class="h-14 w-full" />
					<div class="target-skeleton-grid">
						{#each Array(8) as _, index (index)}
							<Skeleton class="h-7 w-14" />
						{/each}
					</div>
				</div>
			</div>
		</div>

		<div class="comparison-row">
			<div class="comparison-cell">
				<h3>Current loading feedback</h3>
				<div class="example-inline">
					<button class="btn btn-primary" type="button">
						<LegacySpinner />
						Saving
					</button>
					<span class="spinner" aria-hidden="true"></span>
				</div>
			</div>
			<div class="comparison-cell">
				<h3>shadcn spinner and progress</h3>
				<div class="example-stack">
					<div class="example-inline">
						<Button disabled>
							<Spinner />
							Saving
						</Button>
						<Spinner aria-label="Loading preview" />
					</div>
					<Progress value={64} aria-label="Import progress" />
				</div>
			</div>
		</div>

		<div class="comparison-row">
			<div class="comparison-cell">
				<h3>Current empty and notice</h3>
				<div class="example-stack">
					<LegacyEmptyState
						message="No records match this filter."
						actionLabel="Clear filter"
						onAction={() => undefined}
					/>
					<div class="legacy-notice">
						<strong>Upload required</strong>
						<span>Attach a roster before previewing the import.</span>
					</div>
				</div>
			</div>
			<div class="comparison-cell">
				<h3>shadcn empty and alert</h3>
				<div class="example-stack">
					<Empty.Root>
						<ClipboardList class="size-8 text-muted-foreground" aria-hidden="true" />
						<Empty.Content>
							<Empty.Title>No records match this filter.</Empty.Title>
							<Empty.Description>Clear the filter or adjust the search terms.</Empty.Description>
						</Empty.Content>
						<Button variant="outline" size="sm">Clear filter</Button>
					</Empty.Root>
					<Alert.Root>
						<FileUp class="size-4" aria-hidden="true" />
						<Alert.Title>Upload required</Alert.Title>
						<Alert.Description>Attach a roster before previewing the import.</Alert.Description>
					</Alert.Root>
				</div>
			</div>
		</div>

		<div class="comparison-row">
			<div class="comparison-cell">
				<h3>Current file and search controls</h3>
				<div class="legacy-form-stack">
					<label>
						<span class="label">File upload</span>
						<input class="input" type="file" aria-label="Current file upload" />
					</label>
					<label>
						<span class="label">Toolbar search</span>
						<span class="legacy-search">
							<Search size={16} aria-hidden="true" />
							<input value="Smith" aria-label="Current toolbar search" />
						</span>
					</label>
				</div>
			</div>
			<div class="comparison-cell">
				<h3>shadcn file and search direction</h3>
				<div class="example-stack">
					<Field.Root>
						<Field.Label for="target-file">File upload</Field.Label>
						<Input id="target-file" type="file" />
					</Field.Root>
					<div class="target-search">
						<Search class="size-4 text-muted-foreground" aria-hidden="true" />
						<Input value="Smith" aria-label="Target toolbar search" />
						<Button variant="ghost" size="icon" aria-label="More filters">
							<MoreHorizontal />
						</Button>
					</div>
				</div>
			</div>
		</div>
	</section>
</div>

<style>
	.conversion-map {
		min-height: 100%;
		background: var(--background);
		color: var(--foreground);
		padding: 32px;
	}

	.conversion-map__header,
	.conversion-map__summary,
	.conversion-map__table,
	.unmatched-section,
	.comparison-list {
		width: min(1320px, 100%);
		margin: 0 auto;
	}

	.conversion-map__header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 24px;
		padding-bottom: 24px;
		border-bottom: 1px solid var(--border);
	}

	.conversion-map__header h1,
	.section-heading h2,
	.conversion-map__summary h2 {
		margin: 0;
		font-family: var(--font-display);
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.conversion-map__header h1 {
		font-size: clamp(2rem, 5vw, 4rem);
		line-height: 0.95;
	}

	.conversion-map__header p {
		max-width: 72ch;
		margin: 12px 0 0;
		color: var(--muted-foreground);
	}

	.conversion-map__back {
		flex: 0 0 auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 8px 10px;
		color: var(--foreground);
		font-size: 0.875rem;
		text-decoration: none;
	}

	.eyebrow,
	.map-group,
	.legend-label,
	.mapping-table__head {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	.conversion-map__summary {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr);
		gap: 24px;
		padding: 24px 0;
		border-bottom: 1px solid var(--border);
	}

	.summary-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--card);
		overflow: hidden;
	}

	.summary-grid div {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 16px;
		border-right: 1px solid var(--border);
	}

	.summary-grid div:last-child {
		border-right: 0;
	}

	.summary-grid strong {
		font-size: 1.5rem;
		line-height: 1;
	}

	.summary-grid span {
		color: var(--muted-foreground);
		font-size: 0.875rem;
	}

	.section-heading {
		margin: 32px 0 14px;
	}

	.section-subtitle {
		max-width: 72ch;
		margin: 8px 0 0;
		color: var(--muted-foreground);
		font-size: 0.95rem;
	}

	.mapping-table {
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--card);
		overflow: hidden;
	}

	.mapping-table__head,
	.mapping-row {
		display: grid;
		grid-template-columns: minmax(220px, 1.2fr) minmax(180px, 0.9fr) minmax(128px, 0.5fr) minmax(240px, 1.4fr);
	}

	.mapping-table__head {
		background: var(--muted);
	}

	.mapping-table__head span,
	.mapping-row > div {
		padding: 12px;
		border-right: 1px solid var(--border);
	}

	.mapping-table__head span:last-child,
	.mapping-row > div:last-child {
		border-right: 0;
	}

	.mapping-row {
		border-top: 1px solid var(--border);
		font-size: 0.9rem;
	}

	.mapping-row > div {
		min-width: 0;
	}

	.mapping-row strong,
	.mapping-row code {
		display: block;
		overflow-wrap: anywhere;
	}

	.mapping-row code {
		width: fit-content;
		max-width: 100%;
		border-radius: 4px;
		background: var(--muted);
		padding: 2px 6px;
		color: var(--foreground);
	}

	.decision-pill {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 999px;
		padding: 3px 8px;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.decision-pill[data-status='direct'] {
		background: var(--success-muted);
		color: var(--success-foreground);
	}

	.decision-pill[data-status='compose'] {
		background: var(--info-muted);
		color: var(--info-foreground);
	}

	.decision-pill[data-status='needs-decision'] {
		background: var(--warning-muted);
		color: var(--warning-foreground);
	}

	.decision-pill[data-status='no-target'] {
		border: 1px dashed var(--border);
		background: transparent;
		color: var(--muted-foreground);
	}

	.blank-target {
		display: block;
		width: min(180px, 100%);
		height: 28px;
		border: 1px dashed var(--border);
		border-radius: 4px;
		background: color-mix(in srgb, var(--muted) 35%, transparent);
	}

	.unmatched-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 16px;
	}

	.unmatched-card {
		min-width: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--card);
		overflow: hidden;
	}

	.unmatched-card--full {
		grid-column: 1 / -1;
	}

	.unmatched-card__header {
		display: grid;
		gap: 4px;
		padding: 16px 18px;
		border-bottom: 1px solid var(--border);
		background: color-mix(in srgb, var(--muted) 42%, transparent);
	}

	.unmatched-card__header h3 {
		margin: 0;
		font-size: 1rem;
	}

	.unmatched-pair {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(220px, 0.7fr);
		min-height: 180px;
	}

	.unmatched-pair--wide-target {
		grid-template-columns: minmax(280px, 0.8fr) minmax(0, 1.2fr);
	}

	.pattern-preview {
		min-width: 0;
		padding: 18px;
	}

	.date-cell-frame {
		width: 180px;
		height: 72px;
		margin-top: 10px;
		border-top: 1px solid var(--border);
		border-left: 1px solid var(--border);
		--cell-width: 180px;
	}

	.type-manager-preview {
		display: grid;
		gap: 12px;
	}

	.type-manager-add-row,
	.type-manager-item {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.type-manager-add-row .input:first-child {
		max-width: 260px;
	}

	.type-color-input {
		width: 44px;
		padding: 4px;
	}

	.type-manager-list {
		display: grid;
		gap: 8px;
	}

	.type-manager-item {
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: var(--surface-subtle);
		padding: 10px;
	}

	.type-manager-item--target {
		align-items: flex-start;
		border-color: var(--border);
		background: var(--card);
		padding: 12px;
	}

	.type-manager-item > div {
		display: grid;
		gap: 2px;
		min-width: 0;
		flex: 1;
	}

	.type-manager-item span {
		color: var(--text-secondary);
		font-size: 0.86rem;
	}

	.type-swatch {
		width: 18px;
		height: 18px;
		flex: 0 0 auto;
		border-radius: 4px;
		border: 1px solid var(--border);
	}

	.type-manager-item--target .type-swatch {
		width: 28px;
		height: 28px;
		margin-top: 1px;
		background-clip: padding-box;
		box-shadow: inset 0 0 0 6px var(--card);
	}

	.comparison-list {
		padding-bottom: 56px;
	}

	.comparison-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--card);
		overflow: hidden;
	}

	.comparison-row + .comparison-row {
		margin-top: 16px;
	}

	.comparison-cell {
		min-width: 0;
		padding: 18px;
	}

	.comparison-cell + .comparison-cell {
		border-left: 1px solid var(--border);
	}

	.comparison-cell h3 {
		margin: 0 0 14px;
		font-size: 0.8rem;
		font-family: var(--font-mono);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--muted-foreground);
	}

	.example-stack,
	.legacy-form-stack,
	.shadcn-control-stack {
		display: grid;
		gap: 12px;
	}

	.example-inline {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}

	.legacy-textarea {
		min-height: 78px;
		resize: vertical;
	}

	.legend-panel {
		display: grid;
		gap: 8px;
	}

	.legend-panel + .legend-panel {
		margin-top: 14px;
	}

	.legacy-color-legend,
	.legacy-mark-legend,
	.readiness-key {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.legacy-color-legend span,
	.legacy-mark-legend span,
	.readiness-key span {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 0.82rem;
		color: var(--muted-foreground);
	}

	.legacy-color-legend i,
	.readiness-key i {
		display: inline-block;
		width: 14px;
		height: 14px;
		border-radius: 3px;
		border: 1px solid var(--border);
	}

	.legacy-mark-legend i {
		display: inline-grid;
		place-items: center;
		width: 18px;
		height: 18px;
		border-radius: 4px;
		border: 1px solid var(--border);
		font-style: normal;
		font-size: 0.72rem;
		font-weight: 700;
	}

	.legacy-mark-legend span[data-tone='good'] i,
	.readiness-key span[data-tier='good'] i {
		background: var(--success-muted);
		color: var(--success-foreground);
	}

	.legacy-mark-legend span[data-tone='warn'] i,
	.readiness-key span[data-tier='warn'] i,
	.readiness-key span[data-tier='caution'] i {
		background: var(--warning-muted);
		color: var(--warning-foreground);
	}

	.legacy-mark-legend span[data-tone='danger'] i,
	.readiness-key span[data-tier='danger'] i {
		background: var(--danger-muted);
		color: var(--danger-foreground);
	}

	.legacy-mark-legend span[data-tone='empty'] i,
	.readiness-key span[data-tier='okay'] i {
		background: var(--muted);
		color: var(--muted-foreground);
	}

	.legacy-mark-legend span[data-tone='na'] i,
	.readiness-key span[data-tier='na'] i {
		background: var(--background);
	}

	.requirement-status-board {
		display: grid;
		gap: 12px;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--card);
		padding: 14px;
	}

	.requirement-status-board__header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
	}

	.requirement-status-board__header strong,
	.requirement-status-row strong {
		font-size: 0.86rem;
	}

	.requirement-status-board__header span,
	.requirement-status-row span,
	.requirement-status-board p {
		color: var(--muted-foreground);
		font-size: 0.8rem;
	}

	.requirement-status-list {
		display: grid;
		gap: 8px;
	}

	.requirement-status-row {
		display: grid;
		grid-template-columns: minmax(130px, 0.45fr) minmax(0, 1fr);
		align-items: center;
		gap: 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: 8px;
	}

	.requirement-status-row > div {
		display: grid;
		gap: 2px;
		min-width: 0;
	}

	.requirement-status-badges {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
	}

	.readiness-band-board {
		display: grid;
		gap: 10px;
		border-top: 1px solid var(--border);
		padding-top: 12px;
	}

	.readiness-band-cells {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
	}

	.legacy-matrix-preview,
	.matrix-target-board,
	.legacy-chart-preview,
	.report-chart-target-grid,
	.legacy-workflow-preview,
	.workflow-target-board {
		display: grid;
		gap: 12px;
	}

	.legacy-matrix-preview,
	.legacy-chart-preview,
	.legacy-workflow-preview {
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: var(--surface-subtle);
		padding: 14px;
	}

	.legacy-chart-preview > div {
		display: grid;
		gap: 4px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		background: var(--surface-default);
		padding: 12px;
	}

	.legacy-chart-preview strong,
	.report-chart-target-grid h4 {
		margin: 0;
		color: var(--text-primary);
		font-size: 0.9rem;
	}

	.legacy-chart-preview span,
	.legacy-chart-preview p {
		margin: 0;
		color: var(--text-secondary);
		font-size: 0.84rem;
	}

	.report-chart-target-grid {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}

	.report-chart-target-grid > div {
		min-width: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--card);
		padding: 14px;
	}

	.report-chart-target-grid h4 {
		margin-bottom: 8px;
	}

	.legacy-matrix-preview p {
		margin: 0;
		color: var(--text-secondary);
		font-size: 0.86rem;
	}

	.legacy-matrix-toolbar {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		color: var(--text-secondary);
		font-size: 0.82rem;
	}

	.legacy-matrix-toolbar span:first-child {
		color: var(--text-primary);
		font-weight: 700;
	}

	.legacy-matrix-grid {
		display: grid;
		grid-template-columns: minmax(92px, 1fr) repeat(3, 36px);
		overflow: hidden;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: var(--surface-default);
	}

	.legacy-matrix-grid > * {
		display: grid;
		min-height: 34px;
		place-items: center;
		border-right: 1px solid var(--border-default);
		border-bottom: 1px solid var(--border-default);
		color: var(--text-secondary);
		font-size: 0.75rem;
		font-style: normal;
	}

	.legacy-matrix-grid > :nth-child(4n) {
		border-right: 0;
	}

	.legacy-matrix-grid > :nth-last-child(-n + 4) {
		border-bottom: 0;
	}

	.legacy-matrix-grid span:nth-child(4n + 1) {
		justify-content: start;
		padding-inline: 8px;
	}

	.legacy-matrix-grid i[data-state='current'] {
		background: var(--success-muted);
	}

	.legacy-matrix-grid i[data-state='warning'] {
		background: var(--warning-muted);
	}

	.legacy-matrix-grid i[data-state='expired'] {
		background: var(--danger-muted);
	}

	.legacy-matrix-grid i[data-state='na'] {
		background: var(--muted);
	}

	.matrix-target-board :global([data-slot='operational-matrix']) {
		max-width: 100%;
	}

	.matrix-target-board :global([data-slot='requirement-status-badge']) {
		margin-inline: auto;
	}

	.legacy-workflow-grid {
		display: grid;
		grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
		gap: 10px;
	}

	.legacy-workflow-grid > div {
		display: grid;
		gap: 8px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: var(--surface-default);
		padding: 12px;
	}

	.legacy-workflow-grid span {
		color: var(--text-secondary);
		font-size: 0.86rem;
	}

	.workflow-target-list,
	.workflow-target-form {
		display: grid;
		gap: 10px;
	}

	.workflow-target-list :global([data-slot='workflow-panel-item']) {
		display: flex;
		align-items: flex-start;
		gap: 10px;
	}

	.workflow-target-list :global([data-slot='workflow-panel-item'] > div) {
		display: grid;
		gap: 2px;
	}

	.workflow-target-list :global([data-slot='workflow-panel-item'] span:not(.type-swatch)) {
		color: var(--muted-foreground);
		font-size: 0.82rem;
	}

	.target-skeleton-grid {
		display: grid;
		grid-template-columns: repeat(4, 56px);
		gap: 8px;
	}

	.legacy-notice {
		display: grid;
		gap: 4px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: var(--surface-subtle);
		padding: 14px;
	}

	.legacy-notice span {
		color: var(--text-secondary);
		font-size: 0.9rem;
	}

	.legacy-search,
	.target-search {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.legacy-search {
		border: 1px solid var(--field-border);
		border-radius: var(--radius-md);
		background: var(--field-bg);
		padding: 0 10px;
	}

	.legacy-search input {
		min-width: 0;
		flex: 1;
		border: 0;
		background: transparent;
		padding: 10px 0;
		color: var(--text-primary);
		font: inherit;
		outline: none;
	}

	.target-search {
		max-width: 360px;
	}

	@media (max-width: 900px) {
		.conversion-map {
			padding: 18px;
		}

		.conversion-map__header,
		.conversion-map__summary,
		.unmatched-grid,
		.unmatched-pair,
		.report-chart-target-grid,
		.comparison-row {
			grid-template-columns: 1fr;
		}

		.conversion-map__header {
			display: grid;
		}

		.summary-grid {
			grid-template-columns: 1fr;
		}

		.summary-grid div {
			border-right: 0;
			border-bottom: 1px solid var(--border);
		}

		.summary-grid div:last-child {
			border-bottom: 0;
		}

		.mapping-table {
			display: grid;
			gap: 0;
		}

		.mapping-table__head {
			display: none;
		}

		.mapping-row {
			grid-template-columns: 1fr;
		}

		.mapping-row > div {
			border-right: 0;
			border-bottom: 1px solid var(--border);
		}

		.mapping-row > div:last-child {
			border-bottom: 0;
		}

		.comparison-cell + .comparison-cell {
			border-left: 0;
			border-top: 1px solid var(--border);
		}

		.type-manager-add-row,
		.type-manager-item {
			align-items: stretch;
			flex-direction: column;
		}
	}
</style>
