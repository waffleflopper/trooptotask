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
	<path
		d="M12.22 2h-.44a2 2 0 0 0-1.93 1.46l-.34 1.26a2 2 0 0 1-1.3 1.37l-1.22.42a2 2 0 0 1-1.84-.26l-1.1-.74a2 2 0 0 0-2.57.25l-.31.31a2 2 0 0 0-.25 2.57l.74 1.1a2 2 0 0 1 .26 1.84l-.42 1.22a2 2 0 0 1-1.37 1.3l-1.26.34A2 2 0 0 0 2 11.78v.44a2 2 0 0 0 1.46 1.93l1.26.34a2 2 0 0 1 1.37 1.3l.42 1.22a2 2 0 0 1-.26 1.84l-.74 1.1a2 2 0 0 0 .25 2.57l.31.31a2 2 0 0 0 2.57.25l1.1-.74a2 2 0 0 1 1.84-.26l1.22.42a2 2 0 0 1 1.3 1.37l.34 1.26A2 2 0 0 0 11.78 22h.44a2 2 0 0 0 1.93-1.46l.34-1.26a2 2 0 0 1 1.3-1.37l1.22-.42a2 2 0 0 1 1.84.26l1.1.74a2 2 0 0 0 2.57-.25l.31-.31a2 2 0 0 0 .25-2.57l-.74-1.1a2 2 0 0 1-.26-1.84l.42-1.22a2 2 0 0 1 1.37-1.3l1.26-.34A2 2 0 0 0 22 12.22v-.44a2 2 0 0 0-1.46-1.93l-1.26-.34a2 2 0 0 1-1.37-1.3l-.42-1.22a2 2 0 0 1 .26-1.84l.74-1.1a2 2 0 0 0-.25-2.57l-.31-.31a2 2 0 0 0-2.57-.25l-1.1.74a2 2 0 0 1-1.84.26l-1.22-.42a2 2 0 0 1-1.3-1.37l-.34-1.26A2 2 0 0 0 12.22 2z"
	/>
	<circle cx="12" cy="12" r="3" />
</svg>
