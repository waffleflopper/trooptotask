export const ARCHIVE_RETENTION_CONSTRAINT = { min: 1, max: 120, unit: 'months' } as const;
export const LOSS_WARNING_CONSTRAINT = { min: 1, max: 365, unit: 'days' } as const;
export const CRITICAL_TASKS_DEFAULT_EXPIRATION_CONSTRAINT = { min: 1, max: 120, unit: 'months' } as const;
export const CRITICAL_TASKS_EXPIRING_SOON_WARNING_CONSTRAINT = { min: 1, max: 365, unit: 'days' } as const;

export const DEFAULT_ARCHIVE_RETENTION_MONTHS = 36;
export const DEFAULT_LOSS_WARNING_WINDOW_DAYS = 180;
