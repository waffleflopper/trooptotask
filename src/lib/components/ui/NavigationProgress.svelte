<script lang="ts">
	import { navigating } from '$app/stores';
</script>

{#if $navigating}
	<div class="nav-progress" aria-hidden="true">
		<div class="nav-progress-bar"></div>
	</div>
{/if}

<style>
	.nav-progress {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		height: 3px;
		z-index: 9999;
		overflow: hidden;
		background: transparent;
	}

	.nav-progress-bar {
		height: 100%;
		width: 40%;
		background: #b8943e;
		border-radius: 0 2px 2px 0;
		animation: slide 1.2s ease-in-out infinite;
	}

	@keyframes slide {
		0% {
			transform: translateX(-100%);
		}
		50% {
			transform: translateX(200%);
		}
		100% {
			transform: translateX(-100%);
		}
	}
</style>
