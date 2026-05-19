import { afterEach, beforeEach, vi } from 'vitest';

export function useChartLayoutSize(width = 640, height = 260): void {
	beforeEach(() => {
		vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(width);
		vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(height);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});
}
