import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { Icon } from "./ui.jsx";
import { studioSearchEntries, searchStudio } from "./studio-search.js";

export function StudioSearch({ snapshot, call, onSelect }) {
  const id = useId(),
    root = useRef(null),
    input = useRef(null);
  const [query, setQuery] = useState(""),
    [open, setOpen] = useState(false),
    [active, setActive] = useState(-1);
  const entries = useMemo(
    () => studioSearchEntries(snapshot, call),
    [snapshot, call.active, call.label, call.destination],
  );
  const results = useMemo(() => searchStudio(entries, query), [entries, query]);
  const groups = [...new Set(results.map((result) => result.group))];
  const ordered = groups.flatMap((group) =>
    results.filter((result) => result.group === group),
  );
  const selected = active >= 0 ? ordered[active] : null;
  const choose = (entry) => {
    if (!entry) return;
    setOpen(false);
    setQuery("");
    setActive(-1);
    onSelect(entry);
  };
  useEffect(() => {
    const outside = (event) => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    const shortcut = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        input.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", shortcut);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", shortcut);
    };
  }, []);
  useEffect(() => {
    if (open && selected)
      document
        .getElementById(id + selected.id)
        ?.scrollIntoView({ block: "nearest" });
  }, [active]);
  return (
    <div
      className="studio-search"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <div className="studio-search-field">
        <Icon name="search" size={18} />
        <input
          ref={input}
          type="search"
          role="combobox"
          aria-label="Search studio"
          placeholder="Search studio…"
          autoComplete="off"
          aria-expanded={open}
          aria-controls={open ? id + "results" : undefined}
          aria-autocomplete="list"
          aria-activedescendant={
            open && selected ? id + selected.id : undefined
          }
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
              setActive(-1);
            } else if (["ArrowDown", "ArrowUp"].includes(event.key)) {
              event.preventDefault();
              setOpen(true);
              if (ordered.length)
                setActive((current) =>
                  event.key === "ArrowDown"
                    ? (current + 1) % ordered.length
                    : current <= 0
                      ? ordered.length - 1
                      : current - 1,
                );
            } else if (event.key === "Enter" && open) {
              event.preventDefault();
              choose(selected || ordered[0]);
            }
          }}
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear studio search"
            onClick={() => {
              setQuery("");
              setActive(-1);
              input.current?.focus();
            }}
          >
            <Icon name="close" size={15} />
          </button>
        ) : (
          <kbd>⌘ K</kbd>
        )}
      </div>
      {open && (
        <div className="studio-search-results">
          <div className="studio-search-caption">
            {query ? `${results.length} results` : "Go to"}
            <span>↑ ↓ to move · Enter to open</span>
          </div>
          <div
            role="listbox"
            id={id + "results"}
            aria-label="Studio search results"
          >
            {groups.map((group) => (
              <div role="group" aria-label={group} key={group}>
                <h3 role="presentation">{group}</h3>
                {ordered
                  .filter((result) => result.group === group)
                  .map((entry) => (
                    <button
                      key={entry.id}
                      id={id + entry.id}
                      type="button"
                      role="option"
                      aria-selected={selected?.id === entry.id}
                      tabIndex={-1}
                      onPointerDown={(event) => event.preventDefault()}
                      onClick={() => choose(entry)}
                    >
                      <span className="studio-search-result-icon">
                        <Icon name={entry.icon} size={18} />
                      </span>
                      <span>
                        <strong>{entry.title}</strong>
                        <small>{entry.detail}</small>
                      </span>
                      <Icon name="arrow" size={15} />
                    </button>
                  ))}
              </div>
            ))}
          </div>
          {!results.length && (
            <p className="studio-search-empty">
              No matches. Try a name, number, country or setting.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
