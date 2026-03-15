<script lang="ts">
	interface Props {
		size?: number;
		color?: string;
	}

	let { size = 14, color = 'white' }: Props = $props();
</script>

<span
	class="spinner"
	style:--spin-color={color}
	style:width="{size}px"
	style:height="{size}px"
	aria-hidden="true"
></span>

<style>
	.spinner {
		display: inline-block;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-color: color-mix(in srgb, var(--spin-color, white) 30%, transparent);
		border-top-color: var(--spin-color, white);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
		flex-shrink: 0;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
