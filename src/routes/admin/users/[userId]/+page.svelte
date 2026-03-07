<script lang="ts">
	import { formatDisplayDate } from '$lib/utils/dates';

	let { data } = $props();
</script>

<svelte:head>
	<title>User Details - Admin - Troop to Task</title>
</svelte:head>

<div class="user-detail-page">
	<header class="page-header">
		<a href="/admin/users" class="back-link">
			<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M19 12H5M12 19l-7-7 7-7"/>
			</svg>
			Back to Users
		</a>
		<h1>User Details</h1>
	</header>

	<div class="content-grid">
		<!-- User Info -->
		<section class="card">
			<h2>User Info</h2>
			<div class="info-grid">
				<div class="info-item">
					<span class="label">User ID</span>
					<code class="value">{data.user.id}</code>
				</div>
				<div class="info-item">
					<span class="label">Email</span>
					<span class="value">{data.user.email}</span>
				</div>
				<div class="info-item">
					<span class="label">Joined</span>
					<span class="value">{formatDisplayDate(data.user.createdAt)}</span>
				</div>
			</div>
		</section>

		<!-- Organizations -->
		<section class="card">
			<h2>Organizations ({data.organizations.length})</h2>
			{#if data.organizations.length > 0}
				<ul class="org-list">
					{#each data.organizations as org (org.id)}
						<li class="org-item">
							<span class="org-name">{org.name}</span>
							<span class="org-role">{org.role}</span>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="empty-state">No organizations</p>
			{/if}
		</section>
	</div>
</div>

<style>
	.user-detail-page {
		max-width: 1000px;
		margin: 0 auto;
	}

	.page-header {
		margin-bottom: var(--spacing-xl);
	}

	.back-link {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-xs);
		color: var(--color-text-muted);
		text-decoration: none;
		font-size: var(--font-size-sm);
		margin-bottom: var(--spacing-md);
	}

	.back-link:hover {
		color: var(--color-primary);
	}

	.page-header h1 {
		font-size: var(--font-size-2xl);
		font-weight: 700;
		color: var(--color-text);
	}

	.content-grid {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-lg);
	}

	.card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-lg);
	}

	.card h2 {
		font-size: var(--font-size-lg);
		font-weight: 600;
		color: var(--color-text);
		margin-bottom: var(--spacing-md);
	}

	/* Info Grid */
	.info-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: var(--spacing-md);
	}

	.info-item {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.info-item .label {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.info-item .value {
		font-weight: 500;
		color: var(--color-text);
	}

	.info-item code {
		font-size: var(--font-size-sm);
		background: var(--color-surface-variant);
		padding: 2px 6px;
		border-radius: var(--radius-sm);
	}

	/* Org List */
	.org-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.org-item {
		display: flex;
		justify-content: space-between;
		padding: var(--spacing-sm);
		border-bottom: 1px solid var(--color-border);
	}

	.org-item:last-child {
		border-bottom: none;
	}

	.org-name {
		font-weight: 500;
	}

	.org-role {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		text-transform: capitalize;
	}

	.empty-state {
		text-align: center;
		color: var(--color-text-muted);
		padding: var(--spacing-lg);
	}
</style>
