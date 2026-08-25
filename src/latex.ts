/** Remove Markdown blockquote markers from a display formula body. */
export function normalizeQuotedLatex(formula: string): string {
    return formula.replace(/^[ \t]*(?:>[ \t]?)+/gm, '');
}
