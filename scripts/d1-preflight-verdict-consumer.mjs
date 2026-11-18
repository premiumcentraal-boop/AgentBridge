/**
 * Fail-closed consumer contract for read-only D1 preflight reports.
 * This is NOT a migration approval API. No possible report authorizes writes.
 * A caller must also check that the preflight subprocess exited successfully.
 */
import {MIGRATION_FILES} from './d1-migration-preflight.mjs';

const allowedMigrations = new Set(MIGRATION_FILES);
function validMigrationList(value) {
  return Array.isArray(value) && value.every(name => typeof name === 'string' && allowedMigrations.has(name)) &&
    new Set(value).size === value.length;
}

export function interpretPreflightObservation(exitCode, stdout) {
  if (exitCode !== 0) return {accepted:false, reason:'PREFLIGHT_PROCESS_FAILED'};
  if (typeof stdout !== 'string' || stdout.length === 0 || stdout.length > 262144)
    return {accepted:false, reason:'MISSING_OR_OVERSIZED_REPORT'};
  let report;
  try { report = JSON.parse(stdout); }
  catch { return {accepted:false, reason:'INVALID_JSON'}; }
  if (!report || typeof report !== 'object' || Array.isArray(report))
    return {accepted:false, reason:'INVALID_REPORT'};
  const v = report.verdict;
  if (!v || typeof v !== 'object' || Array.isArray(v) || v.version !== 1)
    return {accepted:false, reason:'UNSUPPORTED_VERDICT'};
  if (v.status !== 'observational_only' && v.status !== 'blocked')
    return {accepted:false, reason:'INVALID_STATUS'};
  if (v.atomicSnapshot !== false || v.authorizesMigration !== false ||
      v.requiresOperatorApproval !== true ||
      v.requiresExclusiveMaintenanceWindow !== true ||
      v.requiresVerifiedBackup !== true)
    return {accepted:false, reason:'UNSAFE_VERDICT'};
  if (typeof v.reason !== 'string' || ![
    'UNSAFE_SCHEMA_OR_HISTORY','UNRECONCILED_MIGRATION_HISTORY',
    'PENDING_MIGRATIONS','NO_PENDING_MIGRATIONS'
  ].includes(v.reason)) return {accepted:false, reason:'INVALID_REASON'};
  if (typeof report.unsafe !== 'boolean' || !report.plan ||
      typeof report.plan !== 'object' || Array.isArray(report.plan) ||
      typeof report.plan.safe !== 'boolean' ||
      !validMigrationList(report.plan.apply) || !validMigrationList(report.plan.baseline) ||
      report.plan.apply.some(name => report.plan.baseline.includes(name)))
    return {accepted:false, reason:'INVALID_PLAN'};
  const blocked = report.unsafe || !report.plan.safe || report.plan.baseline.length > 0;
  if ((v.status === 'blocked') !== blocked)
    return {accepted:false, reason:'CONTRADICTORY_VERDICT'};
  if ((v.reason === 'UNSAFE_SCHEMA_OR_HISTORY') !== report.unsafe ||
      (v.reason === 'UNRECONCILED_MIGRATION_HISTORY') !==
        (!report.unsafe && report.plan.baseline.length > 0) ||
      (!blocked && (v.reason === 'PENDING_MIGRATIONS') !== (report.plan.apply.length > 0)))
    return {accepted:false, reason:'CONTRADICTORY_REASON'};
  return {accepted:true, status:v.status, authorizesMigration:false,
    requiresManualApproval:true};
}
