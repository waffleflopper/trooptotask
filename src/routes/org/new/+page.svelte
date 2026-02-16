<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	let loading = $state(false);
</script>

<svelte:head>
	<title>Create Organization - Troop to Task</title>
</svelte:head>

<div class="create-page">
	<div class="create-card">
		<h1>Create an Organization</h1>
		<p class="subtitle">Set up your organization to start scheduling</p>

		{#if !data.canCreateOrganization}
			<div class="limit-reached">
				<div class="limit-icon">
					<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
						<path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
					</svg>
				</div>
				<h2>Organization Limit Reached</h2>
				<p>
					Your {data.planName} plan allows {data.maxOrganizations} organization{data.maxOrganizations !== 1 ? 's' : ''}.
					You currently have {data.currentOrganizations}.
				</p>
				<a href="/billing/upgrade" class="btn btn-primary">Upgrade Your Plan</a>
				<a href="/dashboard" class="btn btn-secondary">Back to Dashboard</a>
			</div>
		{:else}
		<form
			method="POST"
			use:enhance={() => {
				loading = true;
				return async ({ update }) => {
					loading = false;
					await update();
				};
			}}
		>
			{#if form?.error}
				<div class="error-message">{form.error}</div>
			{/if}

			<div class="form-group">
				<label class="label" for="name">Organization Name</label>
				<input
					id="name"
					name="name"
					type="text"
					class="input"
					placeholder="e.g., Ft. Hood TMC"
					required
				/>
			</div>

			<p class="seed-info">
				Your organization will be set up with default units, status types, assignment types, and federal holidays. You can customize these after creation.
			</p>

			<div class="actions">
				<a href="/" class="btn btn-secondary">Cancel</a>
				<button type="submit" class="btn btn-primary" disabled={loading}>
					{loading ? 'Creating...' : 'Create Organization'}
				</button>
			</div>
		</form>
		{/if}
	</div>
</div>

<style>
	.create-page {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-bg);
		padding: var(--spacing-lg);
	}

	.create-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-xl);
		width: 100%;
		max-width: 450px;
	}

	.create-card h1 {
		font-size: var(--font-size-xl);
		font-weight: 700;
		color: var(--color-primary);
		text-align: center;
		margin-bottom: var(--spacing-xs);
	}

	.subtitle {
		text-align: center;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		margin-bottom: var(--spacing-lg);
	}

	.error-message {
		background: #fef2f2;
		border: 1px solid #fecaca;
		color: #dc2626;
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		font-size: var(--font-size-sm);
		margin-bottom: var(--spacing-md);
	}

	.seed-info {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		background: var(--color-bg);
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		margin: var(--spacing-md) 0;
	}

	.actions {
		display: flex;
		gap: var(--spacing-sm);
		justify-content: flex-end;
		margin-top: var(--spacing-md);
	}

	.limit-reached {
		text-align: center;
		padding: var(--spacing-lg);
	}

	.limit-icon {
		width: 64px;
		height: 64px;
		margin: 0 auto var(--spacing-md);
		background: color-mix(in srgb, var(--color-warning) 15%, transparent);
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-warning);
	}

	.limit-reached h2 {
		font-size: var(--font-size-lg);
		font-weight: 600;
		color: var(--color-text);
		margin-bottom: var(--spacing-sm);
	}

	.limit-reached p {
		color: var(--color-text-muted);
		margin-bottom: var(--spacing-lg);
	}

	.limit-reached .btn {
		display: block;
		width: 100%;
		margin-bottom: var(--spacing-sm);
	}
</style>
