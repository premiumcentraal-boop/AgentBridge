// The same account service runs against Node SQLite and the hosted D1 binding.
// Callers supply an adapter; no platform credentials enter the client bundle.
export function d1Database(binding) {
  if (!binding) throw new Error('Account database is not configured.');
  return {
    first: (sql, params = []) => binding.prepare(sql).bind(...params).first(),
    async run(sql, params = []) { const result = await binding.prepare(sql).bind(...params).run(); return { changes: result.meta?.changes || 0 }; },
    batch: statements => binding.batch(statements.map(({ sql, params = [] }) => binding.prepare(sql).bind(...params))),
  };
}
