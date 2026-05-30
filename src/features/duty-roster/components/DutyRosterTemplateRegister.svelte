<script lang="ts">
	import { Archive, History, Play, Settings, UsersRound } from '@lucide/svelte';
	import type { DutyRosterTemplate } from '$features/duty-roster/templates/dutyRosterTemplates';
	import type { DutyRosterTemplateSetupOptions } from '$features/duty-roster/templates/dutyRosterTemplates';
	import { resolveDutyRosterPool } from '$features/duty-roster/templates/dutyRosterPool';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as ButtonGroup from '$lib/components/ui/button-group';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as PageShell from '$lib/components/ui/page-shell';
	import { DutyRosterStatusBadge } from '$features/duty-roster/components/shared';

	type TemplateRegisterView = 'active' | 'archived';

	let {
		basePath,
		templates,
		setupOptions = null
	}: {
		basePath: string;
		templates: DutyRosterTemplate[];
		setupOptions?: DutyRosterTemplateSetupOptions | null;
	} = $props();

	let selectedTemplateId = $state<string | null>(null);
	let registerView = $state<TemplateRegisterView>('active');
	let archiveTemplate = $state<DutyRosterTemplate | null>(null);
	let archiveAssignmentType = $state(false);
	let archiveFormRef = $state<HTMLFormElement | null>(null);

	const templateRows = $derived(
		templates.map((template) => {
			const resolvedPool = setupOptions
				? resolveDutyRosterPool({ criteria: template.poolCriteria, personnel: setupOptions.personnel })
				: [];
			const exemptIds = new Set(template.exemptPersonnelIds);
			const eligiblePoolCount = setupOptions ? resolvedPool.filter((person) => !exemptIds.has(person.id)).length : null;

			return {
				template,
				poolCount: eligiblePoolCount,
				resolvedPoolCount: setupOptions ? resolvedPool.length : null,
				exemptCount: template.exemptPersonnelIds.length
			};
		})
	);
	const activeTemplateRows = $derived(templateRows.filter((row) => row.template.status === 'active'));
	const archivedTemplateRows = $derived(templateRows.filter((row) => row.template.status === 'archived'));
	const visibleTemplateRows = $derived(registerView === 'active' ? activeTemplateRows : archivedTemplateRows);

	const selectedRow = $derived(
		visibleTemplateRows.find((row) => row.template.id === selectedTemplateId) ?? visibleTemplateRows[0] ?? null
	);

	$effect(() => {
		if (visibleTemplateRows.length === 0) {
			selectedTemplateId = null;
			return;
		}

		if (!selectedTemplateId || !visibleTemplateRows.some((row) => row.template.id === selectedTemplateId)) {
			selectedTemplateId = visibleTemplateRows[0].template.id;
		}
	});

	function viewLabel(view: TemplateRegisterView): string {
		return view === 'active' ? 'Active templates' : 'Archived templates';
	}

	function formatUpdatedAt(value: string): string {
		if (!value) return 'Not recorded';

		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'Not recorded';

		const day = date.toLocaleDateString('en-US', {
			day: '2-digit',
			month: 'short',
			year: 'numeric'
		});
		const time = date.toLocaleTimeString('en-US', {
			hour: '2-digit',
			minute: '2-digit',
			hour12: false
		});

		return `${day.toUpperCase()} ${time}`;
	}

	function describePool(template: DutyRosterTemplate): string {
		const activeFilters = [
			template.poolCriteria.rankValues.length ? `${template.poolCriteria.rankValues.length} rank filters` : null,
			template.poolCriteria.groupIds.length ? `${template.poolCriteria.groupIds.length} group filters` : null,
			template.poolCriteria.mosValues.length ? `${template.poolCriteria.mosValues.length} MOS filters` : null,
			template.poolCriteria.dutyRoleValues.length
				? `${template.poolCriteria.dutyRoleValues.length} duty role filters`
				: null
		].filter(Boolean);

		return activeFilters.length ? activeFilters.join(', ') : 'All active personnel';
	}

	function requestArchive(template: DutyRosterTemplate): void {
		archiveTemplate = template;
		archiveAssignmentType = false;
	}

	function submitArchiveTemplate(): void {
		archiveFormRef?.requestSubmit();
	}
</script>

<section class="grid gap-6" aria-labelledby="template-register-heading">
	<PageShell.Header
		title="Duty Rosters"
		subtitle="Create and manage duty roster templates used to generate DA Form 6 style rosters."
	>
		{#snippet actions()}
			<Button href={`${basePath}/new`}>New Template</Button>
		{/snippet}
	</PageShell.Header>

	{#if templates.length === 0}
		<div
			class="grid place-items-center gap-2 rounded-lg border bg-card px-5 py-12 text-center text-sm text-muted-foreground"
		>
			<p class="font-medium text-foreground">No templates yet</p>
			<p>Create a one-duty template for CQ, Staff Duty, or another DA Form 6 roster.</p>
		</div>
	{:else}
		<div class="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
			<div class="min-w-0 overflow-hidden rounded-lg border bg-card">
				<div class="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
					<ButtonGroup.Root aria-label="Duty Roster Template register view">
						<Button
							variant={registerView === 'active' ? 'secondary' : 'outline'}
							type="button"
							aria-pressed={registerView === 'active'}
							onclick={() => (registerView = 'active')}
						>
							Active ({activeTemplateRows.length})
						</Button>
						<Button
							variant={registerView === 'archived' ? 'secondary' : 'outline'}
							type="button"
							aria-pressed={registerView === 'archived'}
							onclick={() => (registerView = 'archived')}
						>
							Archived ({archivedTemplateRows.length})
						</Button>
					</ButtonGroup.Root>
					<p class="text-sm text-muted-foreground">{viewLabel(registerView)}</p>
				</div>
				<div class="overflow-x-auto">
					<table class="w-full text-sm" aria-label="Duty Roster Template register">
						<thead>
							<tr class="border-b border-border bg-muted/50">
								<th class="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Template</th>
								<th class="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Slug</th>
								<th class="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Pool Size</th>
								<th class="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Exemptions</th>
								<th class="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Last Updated</th>
								<th class="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Quick Actions</th>
							</tr>
						</thead>
						<tbody>
							{#each visibleTemplateRows as row (row.template.id)}
								<tr
									class={[
										'border-b border-border transition-colors',
										selectedRow?.template.id === row.template.id && 'bg-muted/50'
									]}
								>
									<td class="px-4 py-2.5">
										<button
											class="flex cursor-pointer flex-col items-start gap-0.5 bg-transparent text-left"
											type="button"
											aria-pressed={selectedRow?.template.id === row.template.id}
											onclick={() => (selectedTemplateId = row.template.id)}
										>
											<span class="flex items-center gap-2 text-sm font-semibold text-foreground">
												{row.template.name}
												{#if row.template.status === 'archived'}
													<DutyRosterStatusBadge status="archived" />
												{/if}
											</span>
											<span class="text-xs text-muted-foreground">
												{row.template.status === 'archived' ? 'Archived history' : 'Active template'}
											</span>
										</button>
									</td>
									<td class="px-4 py-2.5 font-mono text-xs text-muted-foreground" role="cell">
										{row.template.slug}
									</td>
									<td class="px-4 py-2.5" role="cell">
										<span class="text-sm text-foreground">{row.poolCount === null ? 'Not loaded' : row.poolCount}</span>
										<span class="block text-xs text-muted-foreground">{describePool(row.template)}</span>
									</td>
									<td class="px-4 py-2.5 text-sm text-foreground" role="cell">{row.exemptCount}</td>
									<td class="px-4 py-2.5 text-xs text-muted-foreground" role="cell">
										{formatUpdatedAt(row.template.updatedAt)}
									</td>
									<td class="px-4 py-2.5" role="cell" aria-label={`${row.template.name} quick actions`}>
										<div class="flex items-center justify-end gap-0.5">
											{#if row.template.status !== 'archived'}
												<Button
													class="size-6"
													variant="outline"
													size="icon-sm"
													href={`${basePath}/${row.template.slug}/generate`}
													aria-label={`Generate ${row.template.name}`}
												>
													<Play class="size-3.5" aria-hidden="true" />
												</Button>
											{/if}
											<Button
												class="size-6"
												variant="outline"
												size="icon-sm"
												href={`${basePath}/${row.template.slug}/history`}
												aria-label={`View history for ${row.template.name}`}
											>
												<History class="size-3.5" aria-hidden="true" />
											</Button>
											{#if row.template.status !== 'archived'}
												<Button
													class="size-6"
													variant="outline"
													size="icon-sm"
													href={`${basePath}/${row.template.slug}/settings`}
													aria-label={`View settings for ${row.template.name}`}
												>
													<Settings class="size-3.5" aria-hidden="true" />
												</Button>
											{/if}
											<Button
												class="size-6"
												variant="outline"
												size="icon-sm"
												type="button"
												disabled={row.template.status === 'archived'}
												aria-label={`Archive ${row.template.name}`}
												onclick={() => requestArchive(row.template)}
											>
												<Archive class="size-3.5" aria-hidden="true" />
											</Button>
										</div>
									</td>
								</tr>
							{:else}
								<tr>
									<td colspan="6" class="px-4 py-12 text-center text-sm text-muted-foreground">
										{#if registerView === 'active'}
											No active templates. Create a new template or switch to Archived.
										{:else}
											No archived templates.
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<div class="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground">
					<span>Showing {visibleTemplateRows.length} of {templateRows.length} templates</span>
					<span>Rows per page 10</span>
				</div>
			</div>

			{#if selectedRow}
				<PageShell.SummaryRail
					title={selectedRow.template.name}
					aria-label={`${selectedRow.template.name} template details`}
				>
					<div class="flex items-start justify-between gap-3">
						<div>
							<p class="text-xs text-muted-foreground">{selectedRow.template.shortCode ?? selectedRow.template.slug}</p>
						</div>
						<DutyRosterStatusBadge status={selectedRow.template.status === 'active' ? 'active' : 'archived'} />
					</div>

					<div class="grid gap-2 border-t border-border pt-3">
						<span class="text-xs font-medium text-muted-foreground">Template Slug</span>
						<p class="text-xs font-medium text-foreground" style="overflow-wrap: anywhere;">
							{selectedRow.template.slug}
						</p>
					</div>

					<div class="grid gap-2 border-t border-border pt-3">
						<div class="flex items-center justify-between gap-3">
							<span class="text-xs font-medium text-muted-foreground">Pool Summary</span>
							<UsersRound size={14} class="text-muted-foreground" aria-hidden="true" />
						</div>
						<dl class="grid gap-1.5">
							<div class="flex items-baseline justify-between gap-3">
								<dt class="text-xs text-muted-foreground">Pool</dt>
								<dd class="text-xs font-medium text-foreground">
									{selectedRow.poolCount === null ? 'Not loaded' : selectedRow.poolCount}
								</dd>
							</div>
							{#if selectedRow.resolvedPoolCount !== null}
								<div class="flex items-baseline justify-between gap-3">
									<dt class="text-xs text-muted-foreground">Before Exemptions</dt>
									<dd class="text-xs font-medium text-foreground">{selectedRow.resolvedPoolCount}</dd>
								</div>
							{/if}
							<div class="flex items-baseline justify-between gap-3">
								<dt class="text-xs text-muted-foreground">Exempt</dt>
								<dd class="text-xs font-medium text-foreground">{selectedRow.exemptCount}</dd>
							</div>
							<div class="flex items-baseline justify-between gap-3">
								<dt class="text-xs text-muted-foreground">Updated</dt>
								<dd class="text-xs font-medium text-foreground">{formatUpdatedAt(selectedRow.template.updatedAt)}</dd>
							</div>
						</dl>
					</div>

					<div class="mt-auto grid gap-2">
						{#if selectedRow.template.status !== 'archived'}
							<Button href={`${basePath}/${selectedRow.template.slug}/generate`}>
								<Play size={16} aria-hidden="true" />
								Open Generate
							</Button>
						{/if}
						<Button variant="outline" href={`${basePath}/${selectedRow.template.slug}/history`}>
							<History size={16} aria-hidden="true" />
							Open History
						</Button>
					</div>

					<p class="border-t border-border pt-3 text-xs text-muted-foreground">
						{#if selectedRow.template.status === 'archived'}
							Archived templates are retained for historical review.
						{:else}
							Pool rules are managed in Template Settings.
						{/if}
					</p>
				</PageShell.SummaryRail>
			{/if}
		</div>
	{/if}

	{#if archiveTemplate}
		<form bind:this={archiveFormRef} method="POST" action={`${basePath}?/archiveTemplate`} class="hidden">
			<input type="hidden" name="templateId" value={archiveTemplate.id} />
			<input type="hidden" name="archiveAssignmentType" value={archiveAssignmentType ? 'true' : 'false'} />
		</form>
		<ConfirmDialog
			title="Archive template"
			message={`Archive ${archiveTemplate.name}? Future rosters cannot be generated from this template.`}
			confirmLabel="Archive Template"
			cancelLabel="Cancel"
			variant="destructive"
			onConfirm={submitArchiveTemplate}
			onCancel={() => (archiveTemplate = null)}
		>
			<div class="rounded-md border border-border bg-muted/30 p-3">
				<label class="flex items-start gap-3 text-sm">
					<Checkbox id="archive-assignment-type" bind:checked={archiveAssignmentType} class="mt-0.5" />
					<span class="grid gap-1">
						<span class="font-medium text-foreground">Also archive the Calendar assignment type</span>
						<span class="text-muted-foreground">
							Removes this duty from future Calendar assignment choices. Existing assignments and Duty Roster history
							stay readable.
						</span>
					</span>
				</label>
			</div>
		</ConfirmDialog>
	{/if}
</section>
