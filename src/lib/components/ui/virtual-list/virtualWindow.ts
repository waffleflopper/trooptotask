export interface VirtualWindowInput {
	scrollTop: number;
	viewportHeight: number;
	overscanPx: number;
}

export interface VirtualRange {
	start: number;
	end: number;
	totalHeight: number;
}

export function itemOffsets(heights: readonly number[]): number[] {
	const offsets = new Array<number>(heights.length + 1);
	offsets[0] = 0;
	for (let index = 0; index < heights.length; index++) offsets[index + 1] = offsets[index] + heights[index];
	return offsets;
}

function firstIndex(count: number, test: (index: number) => boolean, from = 0): number {
	let low = from;
	let high = count;
	while (low < high) {
		const middle = (low + high) >>> 1;
		if (test(middle)) high = middle;
		else low = middle + 1;
	}
	return low;
}

export function visibleRange(
	offsets: readonly number[],
	{ scrollTop, viewportHeight, overscanPx }: VirtualWindowInput
): VirtualRange {
	const count = offsets.length - 1;
	const totalHeight = offsets[count] ?? 0;
	if (count <= 0 || totalHeight <= 0) return { start: 0, end: 0, totalHeight: 0 };
	const viewport = Math.max(0, viewportHeight);
	const overscan = Math.max(0, overscanPx);
	const top = Math.min(Math.max(0, scrollTop), Math.max(0, totalHeight - viewport));
	const windowTop = Math.max(0, top - overscan);
	const windowBottom = Math.min(totalHeight, top + viewport + overscan);
	const start = firstIndex(count, (index) => offsets[index + 1] > windowTop);
	const end = firstIndex(count, (index) => offsets[index] >= windowBottom, start);
	return { start, end, totalHeight };
}
