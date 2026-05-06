<script lang="ts">
	import { History, Play, Settings, UsersRound } from '@lucide/svelte';
	import type { DutyRosterTemplate } from '$features/duty-roster/templates/dutyRosterTemplates';
	import type { DutyRosterTemplateSetupOptions } from '$features/duty-roster/templates/dutyRosterTemplates';
	import { resolveDutyRosterPool } from '$features/duty-roster/templates/dutyRosterPool';

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

	const selectedRow = $derived(
		templateRows.find((row) => row.template.id === selectedTemplateId) ?? templateRows[0] ?? null
	);

	$effect(() => {
		if (templates.length === 0) {
			selectedTemplateId = null;
			return;
		}

		if (!selectedTemplateId || !templates.some((template) => template.id === selectedTemplateId)) {
			selectedTemplateId = templates[0].id;
		}
	});

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
</script>

<section class="template-register" aria-labelledby="template-register-heading">
	<div class="template-register__header">
		<h2 id="template-register-heading" class="sr-only">Duty Roster Templates</h2>
		<a class="btn btn-primary" href={`${basePath}/new`}>New Template</a>
	</div>

	{#if templates.length === 0}
		<div class="admin-empty">
			<p>No templates yet</p>
			<p>Create a one-duty template for CQ, Staff Duty, or another DA Form 6 roster.</p>
		</div>
	{:else}
		<div class="template-register-shell">
			<div class="template-ledger" role="table" aria-label="Duty Roster Template register">
				<div class="template-ledger__head" role="row">
					<span role="columnheader">Template</span>
					<span role="columnheader">Pool</span>
					<span role="columnheader">Updated</span>
					<span role="columnheader">Quick Actions</span>
				</div>

				<div class="template-ledger__body">
					{#each templateRows as row (row.template.id)}
						<div
							class="template-ledger__row"
							class:is-selected={selectedRow?.template.id === row.template.id}
							role="row"
						>
							<button
								class="template-ledger__select"
								type="button"
								aria-pressed={selectedRow?.template.id === row.template.id}
								onclick={() => (selectedTemplateId = row.template.id)}
							>
								<span class="template-ledger__title">{row.template.name}</span>
								<span class="template-ledger__description">{row.template.shortCode ?? row.template.slug}</span>
							</button>

							<div class="template-ledger__pool" role="cell">
								<span>{row.poolCount === null ? 'Not loaded' : `${row.poolCount} personnel`}</span>
								<small>{describePool(row.template)}</small>
							</div>

							<div class="template-ledger__updated" role="cell">
								{formatUpdatedAt(row.template.updatedAt)}
							</div>

							<div class="template-ledger__actions" role="cell" aria-label={`${row.template.name} quick actions`}>
								<a href={`${basePath}/${row.template.slug}/generate`}>
									<Play size={16} aria-hidden="true" />
									<span>Generate</span>
								</a>
								<a href={`${basePath}/${row.template.slug}/history`}>
									<History size={16} aria-hidden="true" />
									<span>History</span>
								</a>
								<a href={`${basePath}/${row.template.slug}/settings`}>
									<Settings size={16} aria-hidden="true" />
									<span>Settings</span>
								</a>
							</div>
						</div>
					{/each}
				</div>
			</div>

			{#if selectedRow}
				<aside class="template-register-panel" aria-label={`${selectedRow.template.name} template details`}>
					<div class="template-register-panel__title">
						<div>
							<h3>{selectedRow.template.name}</h3>
							<p>{selectedRow.template.shortCode ?? selectedRow.template.slug}</p>
						</div>
						<span class="chip chip-success">{selectedRow.template.status}</span>
					</div>

					<div class="template-register-panel__section">
						<div class="template-register-panel__label">
							<span>Template Slug</span>
						</div>
						<p class="template-register-panel__mono">{selectedRow.template.slug}</p>
					</div>

					<div class="template-register-panel__section">
						<div class="template-register-panel__label">
							<span>Pool Summary</span>
							<UsersRound size={15} aria-hidden="true" />
						</div>
						<dl class="template-register-panel__facts">
							<div>
								<dt>Pool</dt>
								<dd>{selectedRow.poolCount === null ? 'Not loaded' : selectedRow.poolCount}</dd>
							</div>
							{#if selectedRow.resolvedPoolCount !== null}
								<div>
									<dt>Matched Before Exemptions</dt>
									<dd>{selectedRow.resolvedPoolCount}</dd>
								</div>
							{/if}
							<div>
								<dt>Exempt</dt>
								<dd>{selectedRow.exemptCount}</dd>
							</div>
							<div>
								<dt>Updated</dt>
								<dd>{formatUpdatedAt(selectedRow.template.updatedAt)}</dd>
							</div>
						</dl>
					</div>

					<div class="template-register-panel__actions">
						<a class="btn btn-primary" href={`${basePath}/${selectedRow.template.slug}/generate`}>
							<Play size={16} aria-hidden="true" />
							Open Generate
						</a>
						<a class="btn btn-secondary" href={`${basePath}/${selectedRow.template.slug}/history`}>
							<History size={16} aria-hidden="true" />
							Open History
						</a>
					</div>

					<p class="template-register-panel__note">Pool rules are managed in Template Settings.</p>
				</aside>
			{/if}
		</div>
	{/if}
</section>
