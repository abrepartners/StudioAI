const EXPORT_HISTORY_BREAKS = new Set(['commit', 'reset']);
const DIRECT_EXPORT_TOOLS = new Set(['cleanup', 'furniture-removal']);

export function shouldPreserveOriginalPixelsOnExport(editHistory: string[]): boolean {
  const lastBreak = Math.max(
    editHistory.lastIndexOf('commit'),
    editHistory.lastIndexOf('reset')
  );
  const recentHistory = lastBreak >= 0 ? editHistory.slice(lastBreak + 1) : editHistory;

  return !recentHistory.some((entry) => DIRECT_EXPORT_TOOLS.has(entry));
}
