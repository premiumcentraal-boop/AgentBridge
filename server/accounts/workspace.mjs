import { validateNumberConnection, validateNumberOrder } from '../../shared/numbers.mjs';
import { validateCallPlan, validateCapture } from '../../shared/call-plans.mjs';
import { accountSnapshot, addEvent, deny, mutateWorkspace } from './model.mjs';

const now = () => new Date().toISOString();
const fields = (value, allowed) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) deny(422, 'INVALID_FIELDS', 'The request contains unsupported fields.');
};
const validated = (check, input) => { const result = check(input); if (result.error) deny(422, 'INVALID_INPUT', result.error); return result.value; };
const availableConnection = (document, id) => {
  const connection = document.connections.find(item => item.id === id && item.status === 'saved');
  const number = document.routing_numbers.find(item => item.id === connection?.routing_number_id && item.status === 'owned' && item.ownership_source === 'demo');
  if (!connection || !number) deny(404, 'NOT_FOUND', 'Choose one of your saved demo connections.');
  return { connection, number };
};
export async function workspaceRequest({ database, account, path, method, readBody }) {
  const flags = { sandbox: true, charged: false, purchase_enabled: false, calling_enabled: false, routing_enabled: false, recording_enabled: false, joining_enabled: false };
  const read = async () => {
    const row = await database.first('SELECT document FROM ab_workspaces WHERE account_id=?', [account.id]);
    if (!row) deny(404, 'WORKSPACE_NOT_FOUND', 'Your workspace was not found.');
    return JSON.parse(row.document);
  };
  const update = fn => mutateWorkspace(database, account.id, fn);
  const reply = (status, body) => ({ status, body: { ...body, ...flags } });
  if (method === 'GET' && ['overview', 'export'].includes(path)) return reply(200, accountSnapshot(await read(), account));
  if (method === 'GET' && path === 'numbers') { const data = await read(); return reply(200, { numbers: data.routing_numbers, orders: data.number_orders }); }
  if (method === 'GET' && path === 'connections') return reply(200, { connections: (await read()).connections });
  if (method === 'GET' && path === 'integration') return reply(200, { status: 'demo', message: 'Demo account. Numbers and calls are simulated; no provider is charged.' });
  if (path === 'number-orders' && method === 'POST') {
    const input = await readBody(); fields(input, ['request_id', 'provider', 'country', 'area_code', 'label', 'candidate']);
    const { candidate, ...orderInput } = input;
    const value = validated(validateNumberOrder, orderInput);
    if (typeof candidate !== 'string' || !/^\+1[2-9][0-9]{2}55501[0-9]{2}$/.test(candidate) || !candidate.startsWith('+1' + value.area_code)) deny(422, 'INVALID_INVENTORY', 'Choose an available fictional demo number.');
    const result = await update(document => {
      const fingerprint = JSON.stringify({ ...value, candidate });
      const previous = document.number_orders.find(order => order.request_id === value.request_id);
      if (previous) {
        if (previous.fingerprint !== fingerprint) deny(409, 'REQUEST_CONFLICT', 'This number request has already been used.');
        return { unchanged: true, value: { number: document.routing_numbers.find(number => number.id === previous.number_id), order: previous } };
      }
      if (document.routing_numbers.length >= 100) deny(409, 'NUMBER_LIMIT', 'Your demo can hold up to 100 numbers.');
      if (document.routing_numbers.some(number => number.e164 === candidate)) deny(409, 'NUMBER_UNAVAILABLE', 'That demo number has already been selected.');
      const stamp = now(), id = crypto.randomUUID();
      const number = { id, e164: candidate, provider: value.provider, provider_number_id: 'demo-' + id, country: value.country, label: value.label, status: 'owned', ownership_source: 'demo', created_at: stamp, updated_at: stamp };
      const order = { id: crypto.randomUUID(), ...value, fingerprint, number_id: id, status: 'demo_allocated', created_at: stamp };
      document.routing_numbers.unshift(number); document.number_orders.unshift(order);
      addEvent(document, 'demo.number_added', 'Demo routing number added. No purchase or charge.');
      return { number, order };
    });
    return reply(201, result);
  }
  const connectionId = path.match(/^connections\/([a-f0-9-]{36})$/)?.[1];
  if ((path === 'connections' && method === 'POST') || (connectionId && method === 'PATCH')) {
    const value = validated(validateNumberConnection, await readBody());
    const result = await update(document => {
      const existing = connectionId && document.connections.find(item => item.id === connectionId && item.status === 'saved');
      if (connectionId && !existing) deny(404, 'NOT_FOUND', 'Connection not found.');
      const owned = document.routing_numbers.filter(number => number.status === 'owned');
      if (!owned.some(number => number.id === value.routing_number_id && number.ownership_source === 'demo')) deny(422, 'NUMBER_NOT_OWNED', 'Choose one of your demo routing numbers.');
      if (owned.some(number => number.e164 === value.destination)) deny(422, 'OWN_NUMBER_DESTINATION', 'Choose an outside destination.');
      if (document.connections.some(item => item.status === 'saved' && item.id !== connectionId && item.routing_number_id === value.routing_number_id)) deny(409, 'NUMBER_ALREADY_LINKED', 'This routing number already has a destination.');
      if (!existing && document.connections.length >= 200) deny(409, 'CONNECTION_LIMIT', 'Your demo can hold up to 200 connections.');
      const stamp = now(), connection = { ...(existing || { id: crypto.randomUUID(), created_at: stamp }), ...value, status: 'saved', updated_at: stamp };
      if (existing) Object.assign(existing, connection); else document.connections.unshift(connection);
      addEvent(document, existing ? 'connection.updated' : 'connection.created', 'Connection saved.');
      return { connection };
    });
    return reply(connectionId ? 200 : 201, result);
  }
  if (connectionId && method === 'DELETE') {
    await update(document => { const connection = document.connections.find(item => item.id === connectionId && item.status === 'saved'); if (!connection) deny(404, 'NOT_FOUND', 'Connection not found.'); connection.status = 'archived'; connection.updated_at = now(); addEvent(document, 'connection.archived', 'Connection removed.'); return { ok: true }; });
    return reply(200, { ok: true });
  }
  const planId = path.match(/^call-plans\/([a-f0-9-]{36})$/)?.[1];
  if ((path === 'call-plans' && method === 'POST') || (planId && method === 'PATCH')) {
    const value = validated(validateCallPlan, await readBody());
    const result = await update(document => {
      const previous = planId && document.call_plans.find(plan => plan.id === planId && plan.status === 'draft');
      if (planId && !previous) deny(404, 'NOT_FOUND', 'Call not found or already archived.');
      if (!previous && document.call_plans.length >= 200) deny(409, 'PLAN_LIMIT', 'Your demo can hold up to 200 saved calls.');
      const stamp = now(), plan = { ...(previous || { id: crypto.randomUUID(), created_at: stamp }), ...value, status: 'draft', updated_at: stamp };
      if (previous) Object.assign(previous, plan); else document.call_plans.unshift(plan);
      addEvent(document, previous ? 'call_plan.updated' : 'call_plan.created', 'Call details saved.');
      return { plan };
    });
    return reply(planId ? 200 : 201, result);
  }
  const archivePlanId = path.match(/^call-plans\/([a-f0-9-]{36})\/archive$/)?.[1];
  if (archivePlanId && method === 'POST') {
    fields(await readBody(), []);
    await update(document => { const plan = document.call_plans.find(plan => plan.id === archivePlanId && plan.status === 'draft'); if (!plan) deny(404, 'NOT_FOUND', 'Call not found.'); plan.status = 'archived'; plan.updated_at = now(); addEvent(document, 'call_plan.archived', 'Saved call archived.'); return { ok: true }; });
    return reply(200, { ok: true });
  }
  if (path === 'capture-preferences' && method === 'PATCH') {
    const preferences = validated(validateCapture, await readBody());
    await update(document => { document.capture_preferences = preferences; addEvent(document, 'capture.preferences_updated', 'Capture and join preferences saved.'); return { ok: true }; });
    return reply(200, { preferences });
  }
  if (path === 'settings' && method === 'PATCH') {
    const input = await readBody(); fields(input, ['experience']);
    if (!['simple', 'guided', 'advanced'].includes(input.experience)) deny(422, 'INVALID_EXPERIENCE', 'Choose Simple, Guided or Advanced.');
    await update(document => { document.settings.experience = input.experience; addEvent(document, 'settings.updated', 'Workspace preferences saved.'); return { ok: true }; });
    return reply(200, { ok: true });
  }
  if (path === 'demo-call/start' && method === 'POST') {
    const input = await readBody(); fields(input, ['connection_id']);
    const result = await update(document => {
      if (document.demo_call?.active) deny(409, 'CALL_ACTIVE', 'End the current demo call before starting another.');
      const { connection, number } = availableConnection(document, input.connection_id);
      const call = { id: crypto.randomUUID(), connection_id: connection.id, active: true, muted: false, elapsed: 0, joined: false, userMuted: true, recording: false, transcription: false, recordingPaused: false, capturePermission: false, label: connection.label, routing_number: number.e164, destination: connection.destination, started_at: now() };
      document.demo_call = call; addEvent(document, 'demo.call_started', 'Demo call started with ' + connection.label + '.'); return { call };
    });
    return reply(201, result);
  }
  if (path === 'demo-call' && method === 'PATCH') {
    const input = await readBody();
    const booleans = ['active', 'muted', 'joined', 'userMuted', 'recording', 'transcription', 'recordingPaused', 'capturePermission'];
    fields(input, ['call_id', ...booleans, 'proposed_route_id']);
    for (const key of booleans) if (input[key] !== undefined && typeof input[key] !== 'boolean') deny(422, 'INVALID_CALL_STATE', 'Call switches must be on or off.');
    const result = await update(document => {
      const call = document.demo_call;
      if (!call?.id || call.id !== input.call_id) deny(409, 'STALE_CALL', 'That demo call is no longer current.');
      if (!call.active && input.active) deny(409, 'CALL_ENDED', 'Start a new demo call instead of reopening an ended call.');
      const next = { ...call };
      for (const key of booleans) if (input[key] !== undefined) next[key] = input[key];
      if ((next.recording || next.transcription) && !next.capturePermission) deny(422, 'PERMISSION_REQUIRED', 'Confirm capture permission before enabling it.');
      if (input.proposed_route_id !== undefined) { const { connection, number } = availableConnection(document, input.proposed_route_id); next.proposedRoute = { id: connection.id, label: connection.label, destination: connection.destination, routing_number_id: number.id }; }
      if (call.active && !next.active) { next.ended_at = now(); next.elapsed = Math.max(0, Math.floor((Date.now() - Date.parse(call.started_at)) / 1000)); next.joined = false; next.recording = false; next.transcription = false; next.recordingPaused = false; document.call_history = [{ ...call, ended_at: next.ended_at, elapsed: next.elapsed }, ...(document.call_history || [])].slice(0, 50); addEvent(document, 'demo.call_ended', 'Demo call ended.'); }
      if (!next.active && (next.joined || next.recording || next.transcription)) deny(409, 'CALL_ENDED', 'This demo call has ended.');
      document.demo_call = next; return { call: next };
    });
    return reply(200, result);
  }
  deny(404, 'NOT_FOUND', 'Endpoint not found.');
}
