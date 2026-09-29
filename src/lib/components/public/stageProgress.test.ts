import { describe, expect, it } from 'vitest';
import { nearestRest, stageProgress } from './stageProgress';

describe('stageProgress', () => {
	const runway = 4000;
	const viewport = 1000;

	it('holds at 0 until the runway reaches the top of the viewport', () => {
		expect(stageProgress(600, runway, viewport)).toBe(0);
		expect(stageProgress(0, runway, viewport)).toBe(0);
	});

	it('advances in proportion to how far the runway has scrolled past', () => {
		expect(stageProgress(-1500, runway, viewport)).toBe(0.5);
		expect(stageProgress(-750, runway, viewport)).toBe(0.25);
	});

	it('holds at 1 once the runway bottom reaches the viewport bottom', () => {
		expect(stageProgress(-3000, runway, viewport)).toBe(1);
		expect(stageProgress(-5200, runway, viewport)).toBe(1);
	});

	it('treats a runway no taller than the viewport as an instant switch', () => {
		expect(stageProgress(200, 800, viewport)).toBe(0);
		expect(stageProgress(-1, 800, viewport)).toBe(1);
	});
});

describe('nearestRest', () => {
	it('picks the resting frame closest to the progress', () => {
		expect(nearestRest(0.1, [0, 0.345, 0.9])).toBe(0);
		expect(nearestRest(0.2, [0, 0.345, 0.9])).toBe(0.345);
		expect(nearestRest(0.7, [0, 0.345, 0.9])).toBe(0.9);
	});

	it('keeps the progress when the scene has no resting frames', () => {
		expect(nearestRest(0.42, [])).toBe(0.42);
	});
});
