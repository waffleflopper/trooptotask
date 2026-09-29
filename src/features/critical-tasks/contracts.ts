export interface CriticalTasksSettingsWritePort {
	saveDefaults(
		orgId: string,
		defaults: { defaultExpirationMonths: number | null; expiringSoonWarningDays: number | null }
	): Promise<void>;
}
