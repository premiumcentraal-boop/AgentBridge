import React, { useState } from "react";
import { Icon } from "./ui.jsx";

export function ConnectorAddress() {
  const endpoint = "https://agentbridge.victor.ceo/mcp";
  const address = React.useRef(null);
  const [state, setState] = useState("");
  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(endpoint);
      setState("Copied");
    } catch {
      const range = document.createRange();
      range.selectNodeContents(address.current);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      setState("Address selected. Use your device’s copy command.");
    }
  }
  return (
    <>
      <code ref={address}>{endpoint}</code>
      <button type="button" className="copy-endpoint" onClick={copyAddress}>
        <Icon name="copy" size={16} />
        Copy address
      </button>
      <span className="copy-status" role="status">
        {state}
      </span>
    </>
  );
}
