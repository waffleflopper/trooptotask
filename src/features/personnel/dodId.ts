import { z } from 'zod';

export function normalizeDodId(value: string): string {
	return value.trim().replace(/[\s-]/g, '');
}

export const dodIdInputSchema = z
	.string()
	.transform(normalizeDodId)
	.refine((value) => value === '' || /^[0-9]{10}$/.test(value), 'Enter a 10-digit DoD ID');
