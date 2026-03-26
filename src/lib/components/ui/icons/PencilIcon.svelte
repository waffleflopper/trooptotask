<script lang="ts">
	interface Props {
		size?: number | string;
		strokeWidth?: number | string;
		className?: string;
	}

	let { size = 16, strokeWidth = 2, className = '' }: Props = $props();
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width={strokeWidth}
	stroke-linecap="round"
	stroke-linejoin="round"
	class={className}
	aria-hidden="true"
>
	<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
	<path d="m15 5 4 4" />
</svg>
