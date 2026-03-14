<script lang="ts">
	// Server-side guard ensures only suspended users see this
</script>

<div class="suspended-container">
	<div class="suspended-card">
		<h1>Account Suspended</h1>
		<p>Your account has been suspended. If you believe this is an error, please contact support.</p>
		<p class="contact">support@trooptotask.com</p>
		<a href="/auth/login" class="btn btn-secondary">Back to Login</a>
	</div>
</div>

<style>
	.suspended-container {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		background: var(--color-bg);
		padding: var(--spacing-lg);
	}

	.suspended-card {
		text-align: center;
		max-width: 440px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-xl);
	}

	h1 {
		color: var(--color-error);
		margin-bottom: var(--spacing-md);
	}

	p {
		color: var(--color-text-secondary);
		margin-bottom: var(--spacing-md);
	}

	.contact {
		font-weight: 600;
		color: var(--color-text);
	}
</style>
