/** Map marked's heading depth to the HTML node used by Bilibili. */
export function headingLevel(level: unknown, raw?: unknown): number {
    const numericLevel = Number(level);
    if (Number.isInteger(numericLevel) && numericLevel !== 0) {
        return Math.min(6, Math.max(1, numericLevel));
    }
    const match = String(raw ?? '').match(/^\s*(#{1,6})(?:\s|$)/);
    return match ? match[1].length : 1;
}

export function headingTag(level: unknown, raw?: unknown): string {
    return `h${headingLevel(level, raw)}`;
}
