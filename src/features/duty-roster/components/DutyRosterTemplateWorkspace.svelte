<script lang="ts">
	import type { DutyRosterTemplate, DutyRosterTemplateView } from '$features/duty-roster/templates/dutyRosterTemplates';

	type ActionForm = {
		error?: string;
		values?: {
			name?: string;
			shortCode?: string;
		};
	};

	interface WorkspaceData {
		orgId: string;
		orgName: string;
		templates: DutyRosterTemplate[];
		selectedTemplate?: DutyRosterTemplate | null;
		view?: DutyRosterTemplateView;
	}

	let { data, form }: { data: WorkspaceData; form?: unknown } = $props();

	const basePath = $derived(`/org/${data.orgId}/duty-rosters`);
	const createAction = $derived(`${basePath}?/createTemplate`);
	const selectedTemplate = $derived(data.selectedTemplate ?? data.templates[0] ?? null);
	const selectedView = $derived(data.view ?? 'generate');
	const actionForm = $derived((form && typeof form === 'object' ? form : null) as ActionForm | null);

	const viewTabs: Array<{ id: DutyRosterTemplateView; label: string; note: string }> = [
		{ id: 'generate', label: 'Generate', note: 'Preview future DA6 runs' },
		{ id: 'history', label: 'History', note: 'Accepted runs will appear here' },
		{ id: 'settings', label: 'Settings', note: 'Template identity and setup' }
	];
</script>

<svelte:head>
	<title>Duty Rosters - Troop to Task</title>
</svelte:head>

<section class="duty-roster-workspace" aria-labelledby="duty-roster-title">
	<header class="workspace-header">
		<div>
			<p class="eyebrow">{data.orgName}</p>
			<h1 id="duty-roster-title">Duty Rosters</h1>
			<p class="summary">One-duty DA Form 6 templates with durable workspace links.</p>
		</div>
		<div class="header-status" aria-label="Duty Roster Template count">
			<span>{data.templates.length}</span>
			<p>{data.templates.length === 1 ? 'Template' : 'Templates'}</p>
		</div>
	</header>

	<div class="workspace-grid">
		<aside class="template-rail" aria-label="Duty Roster Templates">
			<div class="rail-heading">
				<div>
					<p class="eyebrow">Template Register</p>
					<h2>One duty per template</h2>
				</div>
			</div>

			{#if actionForm?.error}
				<p class="form-error" role="alert">{actionForm.error}</p>
			{/if}

			<form class="create-form" method="POST" action={createAction}>
				<label>
					<span>Name</span>
					<input
						name="name"
						type="text"
						maxlength="120"
						required
						autocomplete="off"
						value={actionForm?.values?.name ?? ''}
						placeholder="CQ NCO"
					/>
				</label>
				<label>
					<span>Short code</span>
					<input
						name="shortCode"
						type="text"
						maxlength="12"
						autocomplete="off"
						value={actionForm?.values?.shortCode ?? ''}
						placeholder="CQ"
					/>
				</label>
				<button class="btn btn-primary" type="submit">Create template</button>
			</form>

			{#if data.templates.length === 0}
				<div class="empty-register">
					<p class="empty-title">No templates yet</p>
					<p>Create a one-duty template for CQ, Staff Duty, or another DA Form 6 roster.</p>
				</div>
			{:else}
				<nav class="template-list" aria-label="Open Duty Roster Template">
					{#each data.templates as template (template.id)}
						<a
							class:active={selectedTemplate?.id === template.id}
							href={`${basePath}/${template.slug}/generate`}
							aria-current={selectedTemplate?.id === template.id ? 'page' : undefined}
						>
							<span class="template-name">{template.name}</span>
							<span class="template-meta">
								<span>{template.shortCode ?? 'No code'}</span>
								<span>/{template.slug}</span>
							</span>
						</a>
					{/each}
				</nav>
			{/if}
		</aside>

		<main class="template-work-surface">
			{#if selectedTemplate}
				<div class="template-title-row">
					<div>
						<p class="eyebrow">Selected Template</p>
						<h2>{selectedTemplate.name}</h2>
					</div>
					<div class="template-identity">
						<span>{selectedTemplate.shortCode ?? 'No short code'}</span>
						<code>/{selectedTemplate.slug}</code>
					</div>
				</div>

				<nav class="view-tabs" aria-label="Duty Roster Template views">
					{#each viewTabs as tab (tab.id)}
						<a
							class:active={selectedView === tab.id}
							href={`${basePath}/${selectedTemplate.slug}/${tab.id}`}
							aria-current={selectedView === tab.id ? 'page' : undefined}
						>
							<span>{tab.label}</span>
							<small>{tab.note}</small>
						</a>
					{/each}
				</nav>

				<section class="view-panel" aria-labelledby="template-view-heading">
					{#if selectedView === 'generate'}
						<p class="eyebrow">Generate View</p>
						<h3 id="template-view-heading">DA6 preview workspace</h3>
						<p>
							This foundation keeps the Generate URL refresh-safe. Pool setup and DA6 preview controls arrive in the
							next slices.
						</p>
						<div class="state-grid" aria-label="Generate readiness">
							<div>
								<span>Template ID</span>
								<code>{selectedTemplate.id}</code>
							</div>
							<div>
								<span>Route State</span>
								<strong>Refresh-safe</strong>
							</div>
							<div>
								<span>Generation</span>
								<strong>Not started</strong>
							</div>
						</div>
					{:else if selectedView === 'history'}
						<p class="eyebrow">History View</p>
						<h3 id="template-view-heading">Accepted runs</h3>
						<p>
							Accepted Duty Roster Runs will appear here as locked history. No run history exists for this foundation
							slice.
						</p>
						<div class="empty-history">History is empty until a DA6 run is accepted.</div>
					{:else}
						<p class="eyebrow">Settings View</p>
						<h3 id="template-view-heading">Template identity</h3>
						<dl class="settings-list">
							<div>
								<dt>Name</dt>
								<dd>{selectedTemplate.name}</dd>
							</div>
							<div>
								<dt>Slug</dt>
								<dd><code>{selectedTemplate.slug}</code></dd>
							</div>
							<div>
								<dt>Short code</dt>
								<dd>{selectedTemplate.shortCode ?? 'None'}</dd>
							</div>
						</dl>
					{/if}
				</section>
			{:else}
				<section class="no-selection" aria-labelledby="empty-workspace-heading">
					<p class="eyebrow">Workspace Ready</p>
					<h2 id="empty-workspace-heading">Create the first Duty Roster Template</h2>
					<p>
						The workspace is ready for one-duty templates. Create a template to open Generate, History, and Settings
						views with real URLs.
					</p>
				</section>
			{/if}
		</main>
	</div>
</section>

<style>
	.duty-roster-workspace {
		display: flex;
		flex-direction: column;
		gap: var(--sp-5);
		padding: var(--sp-5);
		color: var(--text-primary);
	}

	.workspace-header,
	.template-title-row {
		display: flex;
		gap: var(--sp-4);
		align-items: flex-start;
		justify-content: space-between;
		border-bottom: 1px solid var(--border-default);
		padding-bottom: var(--sp-4);
	}

	.workspace-header h1,
	.template-title-row h2,
	.rail-heading h2,
	.view-panel h3,
	.no-selection h2 {
		margin: 0;
		color: var(--text-primary);
		line-height: 1.05;
	}

	.workspace-header h1 {
		font-size: 2rem;
	}

	.summary,
	.view-panel p,
	.no-selection p,
	.empty-register p {
		margin: var(--sp-1) 0 0;
		max-width: 68ch;
		color: var(--text-secondary);
	}

	.eyebrow {
		margin: 0 0 var(--sp-1);
		color: var(--text-tertiary);
		font-family: var(--font-mono);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.header-status,
	.template-identity {
		display: grid;
		gap: 2px;
		justify-items: end;
		min-width: 8rem;
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: 0.75rem;
		text-transform: uppercase;
	}

	.header-status span {
		color: var(--text-primary);
		font-size: 1.8rem;
		font-weight: 800;
		line-height: 1;
	}

	.header-status p {
		margin: 0;
	}

	.workspace-grid {
		display: grid;
		grid-template-columns: minmax(18rem, 22rem) minmax(0, 1fr);
		gap: var(--sp-5);
		align-items: start;
	}

	.template-rail,
	.template-work-surface,
	.view-panel,
	.no-selection {
		border: 1px solid var(--border-default);
		border-radius: 6px;
		background: var(--surface-panel);
	}

	.template-rail {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
		padding: var(--sp-4);
	}

	.create-form {
		display: grid;
		gap: var(--sp-3);
	}

	.create-form label {
		display: grid;
		gap: var(--sp-1);
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.create-form input {
		width: 100%;
		min-height: 2.6rem;
		border: 1px solid var(--border-default);
		border-radius: 4px;
		background: var(--surface-subtle);
		color: var(--text-primary);
		font: inherit;
		font-family: var(--font-body);
		letter-spacing: 0;
		text-transform: none;
		padding: 0 var(--sp-3);
	}

	.create-form input:focus-visible {
		outline: 2px solid var(--amber);
		outline-offset: 2px;
	}

	.form-error {
		margin: 0;
		border: 1px solid var(--danger);
		border-radius: 4px;
		background: var(--danger-bg);
		color: var(--danger);
		padding: var(--sp-2) var(--sp-3);
	}

	.empty-register,
	.empty-history {
		border: 1px dashed var(--border-default);
		border-radius: 4px;
		background: var(--surface-subtle);
		padding: var(--sp-4);
		color: var(--text-secondary);
	}

	.empty-title {
		margin: 0;
		color: var(--text-primary);
		font-weight: 700;
	}

	.template-list {
		display: grid;
		gap: var(--sp-2);
	}

	.template-list a,
	.view-tabs a {
		display: grid;
		gap: 2px;
		border: 1px solid var(--border-default);
		border-radius: 4px;
		color: inherit;
		text-decoration: none;
		transition:
			background 160ms ease-out,
			border-color 160ms ease-out;
	}

	.template-list a {
		padding: var(--sp-3);
	}

	.template-list a:hover,
	.template-list a.active,
	.view-tabs a:hover,
	.view-tabs a.active {
		border-color: var(--amber);
		background: var(--surface-subtle);
	}

	.template-name {
		font-weight: 800;
	}

	.template-meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		color: var(--text-tertiary);
		font-family: var(--font-mono);
		font-size: 0.72rem;
		text-transform: uppercase;
	}

	.template-work-surface {
		display: grid;
		gap: var(--sp-4);
		padding: var(--sp-4);
	}

	.template-identity code,
	.state-grid code,
	.settings-list code {
		color: var(--text-primary);
		font-family: var(--font-mono);
	}

	.view-tabs {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--sp-2);
	}

	.view-tabs a {
		min-height: 4.5rem;
		padding: var(--sp-3);
	}

	.view-tabs span {
		font-weight: 800;
	}

	.view-tabs small {
		color: var(--text-secondary);
		line-height: 1.35;
	}

	.view-panel,
	.no-selection {
		padding: var(--sp-5);
	}

	.state-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--sp-3);
		margin-top: var(--sp-4);
	}

	.state-grid div,
	.settings-list div {
		display: grid;
		gap: 4px;
		border: 1px solid var(--border-default);
		border-radius: 4px;
		background: var(--surface-subtle);
		padding: var(--sp-3);
	}

	.state-grid span,
	.settings-list dt {
		color: var(--text-tertiary);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
	}

	.state-grid strong,
	.settings-list dd {
		margin: 0;
		color: var(--text-primary);
	}

	.settings-list {
		display: grid;
		gap: var(--sp-3);
		margin: var(--sp-4) 0 0;
	}

	@media (max-width: 900px) {
		.duty-roster-workspace {
			padding: var(--sp-3);
		}

		.workspace-header,
		.template-title-row {
			display: grid;
		}

		.header-status,
		.template-identity {
			justify-items: start;
		}

		.workspace-grid,
		.view-tabs,
		.state-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
