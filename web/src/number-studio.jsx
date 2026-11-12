import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { A } from "./context.jsx";
import { Btn, Icon, IconBtn } from "./ui.jsx";
import { flagDefinitions } from "./flags.js";
import { ActiveCallCard } from "./studio-navigation.jsx";
import { CALL_COUNTRIES } from "../../shared/call-plans.mjs";
import {
  validateNumberConnection,
  validateNumberOrder,
  NUMBER_PROVIDERS,
} from "../../shared/numbers.mjs";

export const COUNTRY_FLAGS = {
  US: "🇺🇸",
  GB: "🇬🇧",
  NL: "🇳🇱",
  DE: "🇩🇪",
  FR: "🇫🇷",
  ES: "🇪🇸",
  IT: "🇮🇹",
  AU: "🇦🇺",
  JP: "🇯🇵",
  IN: "🇮🇳",
  BR: "🇧🇷",
  SG: "🇸🇬",
  AE: "🇦🇪",
  ZA: "🇿🇦",
};
const providerName = (id) =>
  NUMBER_PROVIDERS.find((provider) => provider.id === id)?.name || id;
const countryName = (code) =>
  CALL_COUNTRIES.find((item) => item.code === code)?.name || code;
const requestId = () =>
  globalThis.crypto?.randomUUID?.() ||
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const n = Math.floor(Math.random() * 16);
    return (c === "x" ? n : (n & 3) | 8).toString(16);
  });

function CountryArtwork({ code }) {
  const id = useId().replaceAll(":", "");
  const vector = useMemo(
    () => flagDefinitions("country-" + id).find((flag) => flag.code === code),
    [code, id],
  );
  return vector ? (
    <svg
      aria-hidden="true"
      className="country-card-flag"
      viewBox={vector.viewBox}
      preserveAspectRatio="xMidYMid slice"
      dangerouslySetInnerHTML={{ __html: vector.body }}
    />
  ) : (
    <span className="country-card-emoji" aria-hidden="true">
      {COUNTRY_FLAGS[code] || "🌐"}
    </span>
  );
}

export function NumberWorkspace({
  page,
  snapshot,
  call,
  navTo,
  onOpenCall,
  onBuy,
  onAdd,
  onEdit,
  onArchive,
  onLegacy,
  onLegacyRemove,
  transcript = [],
  recentConnections = {},
  initialSearch = "",
  initialCountry = "all",
}) {
  const [country, setCountry] = useState(initialCountry),
    [query, setQuery] = useState(initialSearch);
  const [expanded, setExpanded] = useState(page !== "overview");
  const search = useRef(null),
    listId = useId();
  const callStarted = useRef(Date.now() - (call.elapsed || 0) * 1000);
  useEffect(() => {
    setQuery(initialSearch);
    if (initialSearch) setExpanded(true);
  }, [initialSearch]);
  useEffect(() => {
    setCountry(initialCountry);
  }, [initialCountry]);
  const numbers = (snapshot.routing_numbers || []).filter(
    (item) => item.status === "owned",
  );
  const links = (snapshot.connections || []).filter(
    (item) => item.status === "saved",
  );
  const numberPage = page === "numbers";
  const unassigned = (snapshot.routes || []).filter(
    (route) =>
      route.status === "draft" &&
      !(snapshot.connections || []).some(
        (connection) =>
          connection.destination === route.destination &&
          connection.label === route.label,
      ),
  );
  const countries = [
    ...new Set([
      ...(numberPage ? numbers : links).map((item) => item.country),
      ...(country !== "all" ? [country] : []),
    ]),
  ];
  const needle = query.trim().toLowerCase();
  const lastUse = (item) =>
    Math.max(
      recentConnections[item.id] || 0,
      Date.parse(item.last_used_at || item.updated_at || item.created_at) || 0,
      item.destination === call.destination ? callStarted.current : 0,
    );
  const filtered = links
    .filter(
      (item) =>
        (country === "all" || item.country === country) &&
        `${item.label} ${item.destination} ${countryName(item.country)} ${numbers.find((number) => number.id === item.routing_number_id)?.e164 || ""}`
          .toLowerCase()
          .includes(needle),
    )
    .sort((a, b) => lastUse(b) - lastUse(a));
  const owned = numbers.filter(
    (number) =>
      (country === "all" || number.country === country) &&
      `${number.e164} ${number.label} ${countryName(number.country)}`
        .toLowerCase()
        .includes(needle),
  );
  const changeLayout = () => {
    if (expanded) setQuery("");
    else requestAnimationFrame(() => search.current?.focus());
    setExpanded((value) => !value);
  };
  return (
    <div className="number-workspace">
      <h1 className={page === "overview" ? "sr-only" : "number-page-title"}>
        {page === "overview"
          ? "Studio"
          : numberPage
            ? "Your numbers"
            : page === "routes"
              ? "Routing"
              : "Connections"}
      </h1>
      {page === "overview" && call.active && (
        <ActiveCallCard
          call={call}
          onOpen={onOpenCall}
          expandable
          transcript={transcript}
        />
      )}
      <div
        className="workspace-primary-actions"
        aria-label="Manage numbers and destinations"
      >
        <button
          type="button"
          className="workspace-primary-action buy-action"
          aria-label="Buy a number"
          onClick={onBuy}
        >
          <span className="workspace-action-icon">
            <Icon name="phone" size={26} />
            <i>
              <Icon name="plus" size={11} />
            </i>
          </span>
          <span>
            <strong>Buy a number</strong>
            <small>A dedicated AgentBridge line</small>
          </span>
          <Icon name="diagonal" size={20} />
        </button>
        <button
          type="button"
          className="workspace-primary-action"
          aria-label="Connect a destination"
          onClick={() => onAdd("", country === "all" ? "GB" : country)}
        >
          <span className="workspace-action-icon">
            <Icon name="connection" size={29} />
          </span>
          <span>
            <strong>Connect a destination</strong>
            <small>Link an outside phone number</small>
          </span>
          <Icon name="arrow" size={20} />
        </button>
      </div>
      <div
        className="number-country-rail"
        role="group"
        aria-label="Filter by country"
      >
        <button
          type="button"
          className="country-filter-card all-countries-card"
          aria-pressed={country === "all"}
          onClick={() => setCountry("all")}
        >
          <span className="country-card-all">
            <Icon name="globe" size={32} />
          </span>
          <span className="country-card-copy">
            <strong>All countries</strong>
            <small>
              {numberPage ? numbers.length : links.length}{" "}
              {numberPage ? "numbers" : "connections"}
            </small>
          </span>
        </button>
        {countries.map((code) => (
          <button
            key={code}
            type="button"
            className="country-filter-card"
            aria-label={countryName(code)}
            aria-pressed={country === code}
            onClick={() => setCountry(code)}
          >
            <span className="country-card-art">
              <CountryArtwork code={code} />
            </span>
            <span className="country-card-copy">
              <strong>{countryName(code)}</strong>
              <small>
                {
                  (numberPage ? numbers : links).filter(
                    (item) => item.country === code,
                  ).length
                }{" "}
                {numberPage ? "numbers" : "connections"}
              </small>
            </span>
          </button>
        ))}
      </div>
      <div className="connections-section-heading">
        <div>
          <h2>{numberPage ? "Routing numbers" : "Connections"}</h2>
          <span>
            {numberPage ? `${numbers.length} owned` : "Most recently used"}
          </span>
        </div>
        {!numberPage && (
          <button
            type="button"
            className="connections-layout-toggle"
            aria-label={
              expanded ? "Collapse connections" : "Expand connections"
            }
            aria-expanded={expanded}
            aria-controls={listId}
            onClick={changeLayout}
            title={
              expanded
                ? "Show recent connections in a row"
                : "Expand and search connections"
            }
          >
            <Icon name="arrow" size={18} />
            <Icon name="arrow-down" size={18} />
          </button>
        )}
      </div>
      {(numberPage || expanded) && (
        <label className="number-search">
          <Icon name="search" size={18} />
          <input
            ref={search}
            type="search"
            aria-label={
              numberPage ? "Search your numbers" : "Search connections"
            }
            placeholder={
              numberPage
                ? "Search numbers"
                : "Search names, countries or numbers"
            }
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      )}
      {numberPage ? (
        <div className="owned-number-list" id={listId}>
          {owned.map((number) => {
            const connection = links.find(
              (link) => link.routing_number_id === number.id,
            );
            return (
              <article className="owned-number-card" key={number.id}>
                <span className="number-country-icon">
                  {COUNTRY_FLAGS[number.country]}
                </span>
                <div>
                  <strong>{number.e164}</strong>
                  <span>
                    {number.label} · {providerName(number.provider)}
                  </span>
                  <small>
                    {connection
                      ? `→ ${connection.label} · ${connection.destination}`
                      : "No destination connected"}
                  </small>
                </div>
                <Btn
                  label={connection ? "Edit connection" : "Connect destination"}
                  end={null}
                  onClick={() =>
                    connection ? onEdit(connection) : onAdd(number.id)
                  }
                />
              </article>
            );
          })}
        </div>
      ) : (
        <div
          className={
            "number-connection-list " +
            (expanded ? "is-expanded" : "is-horizontal")
          }
          id={listId}
          role="region"
          aria-label={expanded ? "All connections" : "Recent connections"}
          tabIndex={expanded ? undefined : 0}
        >
          {filtered.map((link) => {
            const number = numbers.find(
              (item) => item.id === link.routing_number_id,
            );
            return (
              <article className="number-connection-card" key={link.id}>
                <div className="connection-record-heading">
                  <span className="number-country-icon">
                    {COUNTRY_FLAGS[link.country] || "🌐"}
                  </span>
                  <div>
                    <h3>{link.label}</h3>
                    <span>{countryName(link.country)}</span>
                  </div>
                  {call.active && call.destination === link.destination ? (
                    <span className="connection-live-state">In call</span>
                  ) : (
                    <span className="number-saved-state">Saved</span>
                  )}
                </div>
                <div className="connection-number-pair">
                  <div>
                    <small>Routing number</small>
                    <strong>{number?.e164 || "Number unavailable"}</strong>
                    <span>{providerName(number?.provider)}</span>
                  </div>
                  <Icon name="arrow" size={18} />
                  <div>
                    <small>Destination number</small>
                    <strong>{link.destination}</strong>
                    <span>{countryName(link.country)}</span>
                  </div>
                </div>
                <div className="connection-record-actions">
                  <Btn
                    label="Open connection"
                    aria-label={"Edit " + link.label}
                    icon="connection"
                    end="arrow"
                    onClick={() => onEdit(link)}
                  />
                  {expanded && (
                    <button
                      type="button"
                      className="number-text-action"
                      onClick={() => onArchive(link)}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {((!numberPage && !filtered.length) || (numberPage && !owned.length)) && (
        <div className="number-empty">
          <Icon name={numbers.length ? "connection" : "phone"} size={28} />
          <h2>
            {!numbers.length
              ? "Get your first routing number"
              : query
                ? "No matches"
                : country !== "all"
                  ? `No connections in ${countryName(country)}`
                  : "Add a destination"}
          </h2>
          <p>
            {!numbers.length
              ? "Buy a dedicated number, then connect an outside destination."
              : "Choose a country, enter the number and select your routing number."}
          </p>
          <Btn
            label={numbers.length ? "Connect a destination" : "Buy a number"}
            primary
            icon="plus"
            onClick={
              numbers.length
                ? () => onAdd("", country === "all" ? "GB" : country)
                : onBuy
            }
          />
        </div>
      )}
      {(snapshot.number_orders || []).filter(
        (item) => item.status === "requested",
      ).length > 0 && (
        <section className="number-pending-orders">
          <h2>Number requests</h2>
          {snapshot.number_orders
            .filter((item) => item.status === "requested")
            .map((order) => (
              <div key={order.id}>
                <span>
                  {COUNTRY_FLAGS[order.country]} +1 ({order.area_code}) ·{" "}
                  {order.label}
                </span>
                <span>Purchase pending</span>
              </div>
            ))}
        </section>
      )}
      {!numberPage && unassigned.length > 0 && (
        <section className="unassigned-destinations">
          <h2>Unassigned destinations</h2>
          {unassigned.map((route) => (
            <div key={route.id}>
              <span>
                <strong>{route.label}</strong>
                <small>{route.destination}</small>
              </span>
              <Btn
                label="Assign number"
                end={null}
                onClick={() => onLegacy(route)}
              />
              <button
                type="button"
                className="number-text-action"
                onClick={() => onLegacyRemove(route)}
              >
                Archive
              </button>
            </div>
          ))}
        </section>
      )}
      {page === "overview" && (
        <nav className="studio-quick-links" aria-label="Call tools">
          <A to={navTo("calls")}>
            <Icon name="calls" />
            Calls
            <Icon name="chevron" size={15} />
          </A>
          <A to={navTo("memory")}>
            <Icon name="transcript" />
            Transcripts
            <Icon name="chevron" size={15} />
          </A>
          <A to={navTo("numbers")}>
            <Icon name="phone" />
            Your numbers
            <Icon name="chevron" size={15} />
          </A>
        </nav>
      )}
    </div>
  );
}

export function ConnectionEditor({
  open,
  initial,
  selectedNumber,
  snapshot,
  onClose,
  onSave,
  onBuy,
}) {
  const id = useId();
  const [value, setValue] = useState({
      label: "",
      country: "GB",
      destination: "+44",
      routing_number_id: "",
    }),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const numbers = (snapshot.routing_numbers || []).filter(
    (item) => item.status === "owned",
  );
  const links = (snapshot.connections || []).filter(
    (item) => item.status === "saved" && item.id !== initial?.id,
  );
  const availableNumbers = numbers.filter(
    (number) => !links.some((link) => link.routing_number_id === number.id),
  );
  useEffect(() => {
    if (open) {
      const free = numbers.find(
        (number) => !links.some((link) => link.routing_number_id === number.id),
      );
      setValue(
        initial
          ? {
              label: initial.label,
              country: initial.country,
              destination: initial.destination,
              routing_number_id: initial.routing_number_id,
            }
          : {
              label: "",
              country: "GB",
              destination: "+44",
              routing_number_id: availableNumbers.some(
                (number) => number.id === selectedNumber,
              )
                ? selectedNumber
                : free?.id || "",
            },
      );
      setQuery("");
      setError("");
    }
  }, [open, initial?.id, selectedNumber]);
  const countries = CALL_COUNTRIES.filter((item) =>
    `${item.name} ${item.code} +${item.prefix}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const set = (key, v) => setValue((current) => ({ ...current, [key]: v }));
  return (
    <Dialog
      isOpen={open}
      onOpenChange={(v) => !v && onClose()}
      width={590}
      className="tools-dialog number-editor"
      aria-label={initial?.id ? "Edit connection" : "Add connection"}
    >
      <DialogHeader
        className="tools-dialog-heading"
        title={initial?.id ? "Edit connection" : "Add connection"}
        onOpenChange={onClose}
      />
      <form
        className="tools-dialog-body"
        onSubmit={async (event) => {
          event.preventDefault();
          const result = validateNumberConnection(value);
          if (result.error) {
            setError(result.error);
            return;
          }
          setSaving(true);
          setError("");
          try {
            await onSave(result.value, initial?.id);
            onClose();
          } catch (e) {
            setError(e.message);
          } finally {
            setSaving(false);
          }
        }}
      >
        <label htmlFor={id + "-name"}>
          Name
          <input
            id={id + "-name"}
            value={value.label}
            maxLength={80}
            placeholder="London studio"
            required
            onChange={(event) => set("label", event.target.value)}
          />
        </label>
        <label htmlFor={id + "-country-search"}>
          Destination country
          <input
            id={id + "-country-search"}
            type="search"
            value={query}
            placeholder="Search country or calling code"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div
          className="destination-country-picker"
          role="group"
          aria-label="Destination countries"
        >
          {countries.map((country) => (
            <button
              key={country.code}
              type="button"
              aria-pressed={country.code === value.country}
              onClick={() =>
                setValue((v) => ({
                  ...v,
                  country: country.code,
                  destination: "+" + country.prefix,
                }))
              }
            >
              <span>{COUNTRY_FLAGS[country.code]}</span>
              <span>
                {country.name}
                <small>+{country.prefix}</small>
              </span>
              {country.code === value.country && (
                <Icon name="check" size={15} />
              )}
            </button>
          ))}
          {!countries.length && <p>No countries found</p>}
        </div>
        <label htmlFor={id + "-destination"}>
          Destination number
          <input
            id={id + "-destination"}
            type="tel"
            value={value.destination}
            placeholder={
              "+" +
              (CALL_COUNTRIES.find((country) => country.code === value.country)
                ?.prefix || "")
            }
            maxLength={24}
            required
            onChange={(event) => set("destination", event.target.value)}
          />
        </label>
        <label htmlFor={id + "-routing"}>
          Routing number
          <select
            id={id + "-routing"}
            required
            value={value.routing_number_id}
            onChange={(event) => set("routing_number_id", event.target.value)}
          >
            <option value="">Select an owned number</option>
            {numbers.map((number) => (
              <option
                key={number.id}
                value={number.id}
                disabled={links.some(
                  (link) => link.routing_number_id === number.id,
                )}
              >
                {number.e164} · {number.label}
                {links.some((link) => link.routing_number_id === number.id)
                  ? " · Already connected"
                  : ""}
              </option>
            ))}
          </select>
        </label>
        {!availableNumbers.length && (
          <p className="number-checkout-note" role="status">
            No unassigned routing numbers. Buy another number to connect this
            destination.
          </p>
        )}
        <button
          type="button"
          className="number-text-action"
          onClick={() => {
            onClose();
            onBuy();
          }}
        >
          <Icon name="plus" size={15} />
          Get another routing number
        </button>
        {error && (
          <p className="tools-error" role="alert">
            {error}
          </p>
        )}
        <div className="tools-dialog-actions">
          <Btn label="Cancel" end={null} onClick={onClose} />
          <Btn
            label={saving ? "Saving…" : "Save connection"}
            primary
            type="submit"
            disabled={
              saving ||
              !availableNumbers.some(
                (number) => number.id === value.routing_number_id,
              )
            }
          />
        </div>
      </form>
    </Dialog>
  );
}

export function BuyNumberDialog({
  open,
  isDemo,
  onClose,
  onSave,
  numbers = [],
}) {
  const id = useId();
  const [value, setValue] = useState({
      provider: "signalwire",
      country: "US",
      area_code: "202",
      label: "Main line",
      request_id: requestId(),
    }),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [candidate, setCandidate] = useState("+12025550130");
  const candidates =
    /^[2-9][0-9]{2}$/.test(value.area_code) && numbers.length < 100
      ? Array.from(
          { length: 100 },
          (_, index) =>
            `+1${value.area_code}555${String(100 + ((index + 30) % 100)).padStart(4, "0")}`,
        )
          .filter(
            (candidate) => !numbers.some((number) => number.e164 === candidate),
          )
          .slice(0, 3)
      : [];
  const effectiveCandidate = candidates.includes(candidate)
    ? candidate
    : candidates[0] || "";
  const validCandidate = candidates.includes(effectiveCandidate);
  useEffect(() => {
    if (open)
      setCandidate((current) =>
        candidates.includes(current) ? current : candidates[0] || "",
      );
  }, [open, value.area_code, numbers]);
  useEffect(() => {
    if (open) {
      setCandidate(candidates[0] || "");
      setValue({
        provider: "signalwire",
        country: "US",
        area_code: "202",
        label: "Main line",
        request_id: requestId(),
      });
      setError("");
    }
  }, [open]);
  return (
    <Dialog
      isOpen={open}
      onOpenChange={(v) => !v && onClose()}
      width={520}
      className="tools-dialog buy-number-dialog"
      aria-label="Add routing number"
    >
      <DialogHeader
        className="tools-dialog-heading"
        title="Get a routing number"
        onOpenChange={onClose}
      />
      <form
        className="tools-dialog-body"
        onSubmit={async (event) => {
          event.preventDefault();
          if (isDemo && !validCandidate) {
            setError("Choose an available number before continuing.");
            return;
          }
          const result = validateNumberOrder(value);
          if (result.error) {
            setError(result.error);
            return;
          }
          setSaving(true);
          try {
            await onSave(result.value, isDemo ? effectiveCandidate : null);
            onClose();
          } catch (e) {
            setError(e.message);
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="number-provider">
          <Icon name="phone" />
          <strong>SignalWire</strong>
          <span>Dedicated voice number</span>
        </div>
        <label htmlFor={id + "-country"}>
          Country
          <select
            id={id + "-country"}
            value={value.country}
            onChange={(event) =>
              setValue((v) => ({ ...v, country: event.target.value }))
            }
          >
            <option value="US">🇺🇸 United States · +1</option>
          </select>
        </label>
        <label htmlFor={id + "-area"}>
          Area code
          <input
            id={id + "-area"}
            value={value.area_code}
            inputMode="numeric"
            pattern="[2-9][0-9]{2}"
            maxLength={3}
            required
            onChange={(event) =>
              setValue((v) => ({ ...v, area_code: event.target.value }))
            }
          />
        </label>
        <label htmlFor={id + "-label"}>
          Name
          <input
            id={id + "-label"}
            value={value.label}
            maxLength={80}
            required
            onChange={(event) =>
              setValue((v) => ({ ...v, label: event.target.value }))
            }
          />
        </label>
        {isDemo ? (
          <>
            {candidates.length ? (
              <fieldset className="number-candidates">
                <legend>Choose a number</legend>
                {candidates.map((number) => (
                  <label
                    key={number}
                    htmlFor={id + "-candidate-" + number.slice(-4)}
                  >
                    <input
                      id={id + "-candidate-" + number.slice(-4)}
                      type="radio"
                      name={id + "-candidate"}
                      value={number}
                      checked={effectiveCandidate === number}
                      onChange={() => setCandidate(number)}
                    />
                    <span>{number}</span>
                    <span>Voice</span>
                  </label>
                ))}
              </fieldset>
            ) : (
              <div className="number-inventory-empty" role="status">
                <Icon name="phone" size={27} />
                <h3>
                  {numbers.length >= 100
                    ? "Number limit reached"
                    : "No numbers available"}
                </h3>
                <p>
                  {numbers.length >= 100
                    ? "Use one of your existing numbers, or close this window."
                    : "Try a different area code to see available numbers."}
                </p>
                {numbers.length < 100 && (
                  <button
                    type="button"
                    className="number-text-action"
                    onClick={() =>
                      setValue((current) => ({
                        ...current,
                        area_code: current.area_code === "415" ? "212" : "415",
                      }))
                    }
                  >
                    Try another area code <Icon name="arrow" size={15} />
                  </button>
                )}
              </div>
            )}
            <p className="number-checkout-note">
              Example inventory · No charge
            </p>
          </>
        ) : (
          <p className="number-checkout-note">
            Purchase is confirmed after provider pricing and ownership checks.
            No charge is made by this request.
          </p>
        )}
        {error && (
          <p className="tools-error" role="alert">
            {error}
          </p>
        )}
        <div className="tools-dialog-actions">
          <Btn label="Cancel" onClick={onClose} end={null} />
          <Btn
            label={
              saving
                ? "Saving…"
                : isDemo
                  ? "Add example number"
                  : "Request number"
            }
            primary
            type="submit"
            disabled={saving || (isDemo && !validCandidate)}
          />
        </div>
      </form>
    </Dialog>
  );
}
