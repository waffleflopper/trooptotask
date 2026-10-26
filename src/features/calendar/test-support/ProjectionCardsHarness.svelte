<script lang="ts" generics="P extends Record<string, unknown>">
	import type { Component } from 'svelte';
	import { setProjectionCards, type ProjectionCards } from '../projection/projectionCards';

	let { open, marker: Marker, props }: { open: ProjectionCards['open']; marker: Component<P>; props: P } = $props();

	setProjectionCards({ open: (request, anchor) => open(request, anchor) });
</script>

<Marker {...props} />
