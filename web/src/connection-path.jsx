import React from "react";
import { displayPhone } from "../../shared/phone.mjs";

export function ConnectionPath({
  routing,
  destination,
  routingNote,
  destinationNote,
  className = "",
}) {
  return (
    <dl className={"connection-path " + className}>
      <div>
        <dt>Your routing number</dt>
        <dd>
          <strong>{displayPhone(routing) || "Number unavailable"}</strong>
          {routingNote && <small>{routingNote}</small>}
        </dd>
      </div>
      <div>
        <dt>Destination</dt>
        <dd>
          <strong>{displayPhone(destination) || "Number unavailable"}</strong>
          {destinationNote && <small>{destinationNote}</small>}
        </dd>
      </div>
    </dl>
  );
}
