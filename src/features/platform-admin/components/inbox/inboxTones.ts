/** The color role a kind's eyebrow carries in the queue and the detail. */
export const INBOX_TONES = {
	accent: { text: 'text-accent-text', tint: 'max-sm:bg-warning-muted', bar: 'border-l-accent' },
	info: { text: 'text-info-foreground', tint: 'max-sm:bg-info-muted', bar: 'border-l-info' },
	danger: { text: 'text-danger-foreground', tint: 'max-sm:bg-danger-muted', bar: 'border-l-danger' }
} as const;

export type InboxTone = keyof typeof INBOX_TONES;
