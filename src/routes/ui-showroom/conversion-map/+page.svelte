<script lang="ts">
	import { ClipboardList, FileUp, Filter, MoreHorizontal, Search, Trash2 } from '@lucide/svelte';
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
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as ButtonGroup from '$lib/components/ui/button-group/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Field from '$lib/components/ui/field/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { NativeSelect } from '$lib/components/ui/native-select/index.js';
	import { Progress } from '$lib/components/ui/progress/index.js';
	import * as RadioGroup from '$lib/components/ui/radio-group/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Toggle } from '$lib/components/ui/toggle/index.js';
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
			target: 'ui/native-select or ui/select',
			status: 'needs-decision',
			notes: 'Native select is the dense default. Custom select is for richer menu behavior.'
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
			notes: 'Domain colors can flow through statusType. Semantic variants cover fixed states.'
		},
		{
			id: 'legends',
			group: 'Status',
			current: 'Training and Critical Tasks legend strips',
			target: null,
			status: 'no-target',
			notes: 'No shadcn equivalent is selected yet. This needs a shared legend/key decision.'
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
			id: 'subnav',
			group: 'Navigation',
			current: 'SubNav.svelte',
			target: 'ui/tabs or shared RouteTabs',
			status: 'needs-decision',
			notes: 'The target depends on whether the surface is route navigation, local tabs, or toolbar nav.'
		},
		{
			id: 'date-cell',
			group: 'Data display',
			current: 'DateCell.svelte',
			target: null,
			status: 'no-target',
			notes: 'No direct shadcn equivalent. Decide whether this stays project-specific.'
		},
		{
			id: 'inline-notes',
			group: 'Data display',
			current: 'InlineNotes.svelte',
			target: null,
			status: 'no-target',
			notes: 'No direct shadcn equivalent. Likely needs a project note/annotation primitive.'
		},
		{
			id: 'stepper',
			group: 'Workflow structure',
			current: 'Stepper.svelte',
			target: null,
			status: 'no-target',
			notes: 'No selected shadcn equivalent. Decide whether to keep as a shared workflow primitive.'
		},
		{
			id: 'type-manager',
			group: 'Workflow structure',
			current: 'TypeManager.svelte and status/type manager patterns',
			target: null,
			status: 'no-target',
			notes: 'No direct shadcn equivalent. This is a repeated project workflow structure.'
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
			target: 'ui/tooltip or ui/popover',
			status: 'needs-decision',
			notes: 'Inline help needs a decision between tooltip, popover, or a project help wrapper.'
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

	const unmatchedItems = mapItems.filter((item) => item.status === 'no-target' && item.id !== 'legends');

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

	let selectedMode = $state('matrix');
	let shadcnSelectValue = $state('ready');
	let nativeSelectValue = $state('all');
	let nativeCheckbox = $state(true);
	let shadcnCheckbox = $state(true);
	let nativeRadio = $state('organization');
	let shadcnRadio = $state('organization');
	let switchChecked = $state(true);
	let togglePressed = $state(true);
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
				<span>Production routes changed</span>
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
			<p class="eyebrow">Needs equivalent</p>
			<h2 id="unmatched-heading">Current project patterns without a shadcn target</h2>
			<p class="section-subtitle">
				{unmatchedItems.length} repeated current patterns are intentionally blank on the shadcn-svelte side.
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
					<div class="missing-target-panel" aria-label="No shadcn-svelte target selected for DateCell"></div>
				</div>
			</div>

			<div class="unmatched-card">
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
					<div class="missing-target-panel" aria-label="No shadcn-svelte target selected for InlineNotes"></div>
				</div>
			</div>

			<div class="unmatched-card">
				<div class="unmatched-card__header">
					<span class="map-group">Workflow structure</span>
					<h3>Stepper.svelte</h3>
				</div>
				<div class="unmatched-pair">
					<div class="pattern-preview">
						<p class="legend-label">Current component</p>
						<Stepper
							stages={['Draft', 'Review', 'Approve', 'Publish']}
							currentStage="Review"
							onStageClick={() => undefined}
						/>
					</div>
					<div class="missing-target-panel" aria-label="No shadcn-svelte target selected for Stepper"></div>
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
					<div
						class="missing-target-panel"
						aria-label="No shadcn-svelte target selected for TypeManager and status type manager patterns"
					></div>
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
					<Badge statusType={{ id: 'ready', name: 'Ready', color: '#345b22', textColor: '#f7f8f4' }}>Ready</Badge>
					<Badge variant="warning">Warning</Badge>
					<Badge variant="secondary">Manual</Badge>
					<Badge variant="danger">Due</Badge>
				</div>
			</div>
		</div>

		<div class="comparison-row">
			<div class="comparison-cell">
				<h3>Current legend strips</h3>
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
			</div>
			<div class="comparison-cell">
				<h3>Shared target direction</h3>
				<div class="legend-panel">
					<p class="legend-label">Badge-backed status key</p>
					<div class="target-legend" aria-label="Target status key">
						{#each trainingLegend as item (item.label)}
							<Badge
								statusType={{
									id: item.label,
									name: item.label,
									color: item.color,
									textColor: item.label === 'N/A' ? '#0e0e0d' : '#f7f8f4'
								}}
							>
								{item.label}
							</Badge>
						{/each}
					</div>
				</div>
				<Separator />
				<div class="legend-panel">
					<p class="legend-label">Readiness tier key</p>
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

	.pattern-preview {
		min-width: 0;
		padding: 18px;
	}

	.missing-target-panel {
		min-height: 100%;
		border-left: 1px dashed var(--border);
		background:
			linear-gradient(135deg, color-mix(in srgb, var(--muted) 35%, transparent) 25%, transparent 25%) 0 0 / 14px 14px,
			linear-gradient(135deg, transparent 75%, color-mix(in srgb, var(--muted) 35%, transparent) 75%) 0 0 / 14px 14px,
			color-mix(in srgb, var(--background) 88%, var(--muted));
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
		border-radius: 4px;
		border: 1px solid var(--border);
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
	.target-legend,
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

		.missing-target-panel {
			min-height: 96px;
			border-top: 1px dashed var(--border);
			border-left: 0;
		}

		.type-manager-add-row,
		.type-manager-item {
			align-items: stretch;
			flex-direction: column;
		}
	}
</style>
