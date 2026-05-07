<script lang="ts">
	import { FileArchive, MailPlus, ShieldCheck, UserPlus } from '@lucide/svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Progress } from '$lib/components/ui/progress/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';

	const summaryRows = [
		{ label: 'Members', value: '38', detail: '1 owner, 4 admins, 33 members' },
		{ label: 'Pending approvals', value: '3', detail: 'Oldest request 2 days ago' },
		{ label: 'Archived personnel', value: '7', detail: 'Next purge May 29' },
		{ label: 'Audit entries', value: '142', detail: 'Last 30 days' }
	];

	const members = [
		{
			name: 'CPT Avery Brooks',
			email: 'avery.brooks@example.mil',
			role: 'Owner',
			access: 'All lanes',
			status: 'Active'
		},
		{ name: '1SG Maya Chen', email: 'maya.chen@example.mil', role: 'Admin', access: 'All lanes', status: 'Active' },
		{
			name: 'SFC Jon Bell',
			email: 'jon.bell@example.mil',
			role: 'Operator',
			access: 'Calendar, Personnel',
			status: 'Active'
		},
		{
			name: 'SSG Nora Patel',
			email: 'nora.patel@example.mil',
			role: 'Viewer',
			access: 'Training, ICTLs',
			status: 'Invited'
		}
	];

	const exports = [
		{ name: 'Organization JSON', detail: 'Complete backup package', cadence: 'Manual' },
		{ name: 'Personnel workbook', detail: 'Roster, groups, and contact fields', cadence: 'Monthly' },
		{ name: 'Audit log', detail: 'Governance activity trail', cadence: 'Weekly' }
	];

	let activeTab = $state('organization');
	let accessPreset = $state('operator');
	let inviteScope = $state('organization');
	let retentionMonths = $state('24');
	let lossWarningDays = $state('180');
	let ictExpirationMonths = $state('12');
	let ictWarningDays = $state('45');
	let requireApproval = $state(true);
	let allowExports = $state(true);
	let notifyOwners = $state(true);

	const accessPresetLabel = $derived(
		accessPreset === 'admin'
			? 'Admin'
			: accessPreset === 'operator'
				? 'Operator'
				: accessPreset === 'viewer'
					? 'Viewer'
					: 'Editor'
	);
	const inviteScopeLabel = $derived(inviteScope === 'organization' ? 'Entire organization' : 'Assigned groups');
</script>

<svelte:head>
	<title>Organization Settings Showroom | TroopToTask</title>
</svelte:head>

<main class="flex flex-1 flex-col gap-6 p-4 md:p-6">
	<header class="grid gap-3">
		<div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
			<div class="grid gap-1">
				<h1 class="text-2xl font-semibold tracking-tight">Organization Settings</h1>
				<p class="max-w-3xl text-sm text-muted-foreground">
					Mocked settings content inside the shadcn-svelte app shell recreation. Data is static for component
					calibration.
				</p>
			</div>
		</div>
	</header>

	<section class="settings-summary-grid" aria-label="Organization settings summary">
		{#each summaryRows as row (row.label)}
			<div class="grid gap-2 rounded-lg border bg-card p-4 text-card-foreground">
				<p class="text-sm font-medium">{row.label}</p>
				<p class="text-2xl font-semibold tracking-tight">{row.value}</p>
				<p class="text-sm text-muted-foreground">{row.detail}</p>
			</div>
		{/each}
	</section>

	<Tabs.Root bind:value={activeTab} class="grid gap-4">
		<Tabs.List class="w-full justify-start">
			<Tabs.Trigger value="organization">Organization</Tabs.Trigger>
			<Tabs.Trigger value="members">Members</Tabs.Trigger>
			<Tabs.Trigger value="policies">Policies</Tabs.Trigger>
			<Tabs.Trigger value="data">Data & Export</Tabs.Trigger>
		</Tabs.List>

		<Tabs.Content value="organization" class="grid gap-4">
			<section class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground" aria-labelledby="profile-heading">
				<div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
					<div class="grid gap-1">
						<h2 id="profile-heading" class="text-lg font-semibold tracking-tight">Organization Profile</h2>
						<p class="text-sm text-muted-foreground">Displayed across briefs, exports, rosters, and page headers.</p>
					</div>
					<Badge variant="outline">Saved</Badge>
				</div>
				<Separator />
				<div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_12rem]">
					<div class="grid gap-2">
						<Label for="org-name">Organization name</Label>
						<Input id="org-name" value="1-23 Infantry" />
					</div>
					<div class="grid gap-2">
						<Label for="org-code">Short code</Label>
						<Input id="org-code" value="123INF" />
					</div>
					<div class="grid gap-2 md:col-span-2">
						<Label for="org-notes">Internal note</Label>
						<Textarea id="org-notes" value="Primary operating organization for battalion readiness workflows." />
					</div>
				</div>
			</section>

			<section class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground" aria-labelledby="billing-heading">
				<div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
					<div class="grid gap-1">
						<h2 id="billing-heading" class="text-lg font-semibold tracking-tight">Subscription & Session</h2>
						<p class="text-sm text-muted-foreground">Plan capacity and active browser actions.</p>
					</div>
					<Badge>Team tier</Badge>
				</div>
				<Separator />
				<div class="grid gap-4 md:grid-cols-3">
					<div class="grid gap-2">
						<p class="text-sm font-medium">Personnel capacity</p>
						<Progress value={64} />
						<p class="text-sm text-muted-foreground">192 of 300 seats used</p>
					</div>
					<div class="grid gap-2">
						<p class="text-sm font-medium">Billing status</p>
						<p class="text-sm text-muted-foreground">Renews June 1, 2026</p>
						<Button variant="outline">Manage billing</Button>
					</div>
					<div class="grid gap-2">
						<p class="text-sm font-medium">Current session</p>
						<p class="text-sm text-muted-foreground">Signed in as commander@example.mil</p>
						<div class="flex flex-wrap gap-2">
							<Button variant="outline">Switch org</Button>
							<Button variant="outline">Sign out</Button>
						</div>
					</div>
				</div>
			</section>
		</Tabs.Content>

		<Tabs.Content value="members" class="grid gap-4">
			<section class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground" aria-labelledby="invite-heading">
				<div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
					<div class="grid gap-1">
						<h2 id="invite-heading" class="text-lg font-semibold tracking-tight">Invite Member</h2>
						<p class="text-sm text-muted-foreground">Mock access setup with preset and scope controls.</p>
					</div>
					<Button>
						<MailPlus />
						Send invite
					</Button>
				</div>
				<Separator />
				<div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_14rem_14rem]">
					<div class="grid gap-2">
						<Label for="invite-email">Email</Label>
						<Input id="invite-email" type="email" value="new.member@example.mil" />
					</div>
					<div class="grid gap-2">
						<Label>Preset</Label>
						<Select.Root type="single" bind:value={accessPreset}>
							<Select.Trigger>{accessPresetLabel}</Select.Trigger>
							<Select.Content>
								<Select.Item value="admin" label="Admin" />
								<Select.Item value="editor" label="Editor" />
								<Select.Item value="operator" label="Operator" />
								<Select.Item value="viewer" label="Viewer" />
							</Select.Content>
						</Select.Root>
					</div>
					<div class="grid gap-2">
						<Label>Scope</Label>
						<Select.Root type="single" bind:value={inviteScope}>
							<Select.Trigger>{inviteScopeLabel}</Select.Trigger>
							<Select.Content>
								<Select.Item value="organization" label="Entire organization" />
								<Select.Item value="groups" label="Assigned groups" />
							</Select.Content>
						</Select.Root>
					</div>
				</div>
				<div class="flex flex-wrap gap-4">
					<div class="flex items-center gap-2">
						<Checkbox id="calendar-lane" checked />
						<Label for="calendar-lane">Calendar</Label>
					</div>
					<div class="flex items-center gap-2">
						<Checkbox id="personnel-lane" checked />
						<Label for="personnel-lane">Personnel</Label>
					</div>
					<div class="flex items-center gap-2">
						<Checkbox id="training-lane" checked />
						<Label for="training-lane">Training</Label>
					</div>
					<div class="flex items-center gap-2">
						<Checkbox id="ict-lane" />
						<Label for="ict-lane">Critical Tasks</Label>
					</div>
				</div>
			</section>

			<section class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground" aria-labelledby="members-heading">
				<div class="flex items-center justify-between gap-3">
					<div class="grid gap-1">
						<h2 id="members-heading" class="text-lg font-semibold tracking-tight">Members</h2>
						<p class="text-sm text-muted-foreground">Current access list with mocked roles and statuses.</p>
					</div>
					<Button variant="outline">
						<UserPlus />
						Add
					</Button>
				</div>
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Name</Table.Head>
							<Table.Head>Role</Table.Head>
							<Table.Head>Access</Table.Head>
							<Table.Head>Status</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each members as member (member.email)}
							<Table.Row>
								<Table.Cell>
									<div class="grid gap-1">
										<span class="font-medium">{member.name}</span>
										<span class="text-sm text-muted-foreground">{member.email}</span>
									</div>
								</Table.Cell>
								<Table.Cell>{member.role}</Table.Cell>
								<Table.Cell>{member.access}</Table.Cell>
								<Table.Cell>
									<Badge variant={member.status === 'Active' ? 'secondary' : 'outline'}>{member.status}</Badge>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</section>
		</Tabs.Content>

		<Tabs.Content value="policies" class="grid gap-4">
			<section class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground" aria-labelledby="policies-heading">
				<div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
					<div class="grid gap-1">
						<h2 id="policies-heading" class="text-lg font-semibold tracking-tight">Operational Defaults</h2>
						<p class="text-sm text-muted-foreground">Mock controls for retention, loss warnings, and critical tasks.</p>
					</div>
					<Badge variant="outline">Unsaved changes</Badge>
				</div>
				<Separator />
				<div class="grid gap-4 md:grid-cols-2">
					<div class="grid gap-2">
						<Label for="retention-months">Archive retention</Label>
						<div class="flex items-center gap-2">
							<Input id="retention-months" type="number" min="1" max="120" bind:value={retentionMonths} />
							<span class="text-sm text-muted-foreground">months</span>
						</div>
					</div>
					<div class="grid gap-2">
						<Label for="loss-warning-days">Loss warning window</Label>
						<div class="flex items-center gap-2">
							<Input id="loss-warning-days" type="number" min="1" max="365" bind:value={lossWarningDays} />
							<span class="text-sm text-muted-foreground">days</span>
						</div>
					</div>
					<div class="grid gap-2">
						<Label for="ict-expiration-months">ICT default expiration</Label>
						<div class="flex items-center gap-2">
							<Input id="ict-expiration-months" type="number" min="1" max="120" bind:value={ictExpirationMonths} />
							<span class="text-sm text-muted-foreground">months</span>
						</div>
					</div>
					<div class="grid gap-2">
						<Label for="ict-warning-days">ICT expiring-soon window</Label>
						<div class="flex items-center gap-2">
							<Input id="ict-warning-days" type="number" min="1" max="365" bind:value={ictWarningDays} />
							<span class="text-sm text-muted-foreground">days</span>
						</div>
					</div>
				</div>
				<Separator />
				<div class="grid gap-4 md:grid-cols-3">
					<div class="flex items-center justify-between gap-3 rounded-md border p-3">
						<Label for="approval-required">Require deletion approval</Label>
						<Switch id="approval-required" bind:checked={requireApproval} />
					</div>
					<div class="flex items-center justify-between gap-3 rounded-md border p-3">
						<Label for="exports-enabled">Allow member exports</Label>
						<Switch id="exports-enabled" bind:checked={allowExports} />
					</div>
					<div class="flex items-center justify-between gap-3 rounded-md border p-3">
						<Label for="owner-notifications">Notify owners</Label>
						<Switch id="owner-notifications" bind:checked={notifyOwners} />
					</div>
				</div>
			</section>
		</Tabs.Content>

		<Tabs.Content value="data" class="grid gap-4">
			<section class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground" aria-labelledby="export-heading">
				<div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
					<div class="grid gap-1">
						<h2 id="export-heading" class="text-lg font-semibold tracking-tight">Data & Export</h2>
						<p class="text-sm text-muted-foreground">Mock export register and retention controls.</p>
					</div>
					<Button>
						<FileArchive />
						Prepare archive
					</Button>
				</div>
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Export</Table.Head>
							<Table.Head>Detail</Table.Head>
							<Table.Head>Cadence</Table.Head>
							<Table.Head class="text-right">Action</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each exports as exportRow (exportRow.name)}
							<Table.Row>
								<Table.Cell class="font-medium">{exportRow.name}</Table.Cell>
								<Table.Cell>{exportRow.detail}</Table.Cell>
								<Table.Cell>{exportRow.cadence}</Table.Cell>
								<Table.Cell class="text-right">
									<Button variant="outline" size="sm">Download</Button>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</section>

			<section class="grid gap-4 rounded-lg border border-destructive/40 bg-card p-4 text-card-foreground">
				<div class="flex items-start gap-3">
					<ShieldCheck class="mt-1 size-5 text-destructive" />
					<div class="grid gap-1">
						<h2 class="text-lg font-semibold tracking-tight">Owner Authority</h2>
						<p class="text-sm text-muted-foreground">
							Mock destructive area for transfer, suspension, and permanent deletion controls.
						</p>
					</div>
				</div>
				<div class="flex flex-wrap gap-2">
					<Button variant="outline">Transfer ownership</Button>
					<Button variant="outline">Suspend organization</Button>
					<Button variant="destructive">Delete organization</Button>
				</div>
			</section>
		</Tabs.Content>
	</Tabs.Root>
</main>

<style>
	.settings-summary-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.75rem;
	}

	@media (max-width: 1024px) {
		.settings-summary-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 640px) {
		.settings-summary-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
