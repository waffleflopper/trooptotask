<script lang="ts">
	import type { DutyRosterTemplate } from '$features/duty-roster/templates/dutyRosterTemplates';

	let { basePath, templates }: { basePath: string; templates: DutyRosterTemplate[] } = $props();
</script>

<section class="template-register" aria-labelledby="template-register-heading">
	<div class="template-register__header">
		<div>
			<p class="eyebrow">Duty Roster Templates</p>
			<h2 id="template-register-heading">Duty Rosters</h2>
			<p class="summary">
				One-duty DA6 roster generator per position. Open a template to generate, review history, or change settings.
			</p>
		</div>
		<a class="btn btn-primary" href={`${basePath}/new`}>New Template</a>
	</div>

	{#if templates.length === 0}
		<div class="admin-empty">
			<p>No templates yet</p>
			<p>Create a one-duty template for CQ, Staff Duty, or another DA Form 6 roster.</p>
		</div>
	{:else}
		<div class="template-grid" aria-label="Duty Roster Template list">
			{#each templates as template (template.id)}
				<article class="template-card card card-flat">
					<a class="template-card__main" href={`${basePath}/${template.slug}/generate`}>
						<div class="template-card__header">
							<div>
								<h3>{template.name}</h3>
								<span>/{template.slug}</span>
							</div>
							<span class="chip chip-primary">{template.shortCode ?? 'No code'}</span>
						</div>
						<div class="template-card__meta">
							<span><strong>{template.poolCriteria.rankValues.length || 'Any'}</strong> ranks</span>
							<span><strong>{template.exemptPersonnelIds.length}</strong> exempt</span>
							<span><strong>{Object.keys(template.manualBaselineCounts).length}</strong> baselines</span>
						</div>
					</a>
					<div class="template-card__actions" aria-label={`${template.name} quick actions`}>
						<a href={`${basePath}/${template.slug}/history`}>History</a>
						<a href={`${basePath}/${template.slug}/settings`}>Settings</a>
					</div>
				</article>
			{/each}
		</div>
	{/if}
</section>
