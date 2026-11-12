import React, { useId, useState } from "react";
import { A } from "./context.jsx";
import { BotFace } from "./grok-ui.jsx";
import { Btn, Icon } from "./ui.jsx";

// Signup destination for the product review. Details stay in component state:
// no registration service, mailing list or customer account is provisioned.
export function Signup() {
  const id = useId();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  return (
    <main id="main" tabIndex={-1} className="signup-page frame">
      <div className="signup-intro">
        <BotFace size={94} tone="teal" state="working" />
        <h1>
          Your agent.
          <br />
          <span>Connected.</span>
        </h1>
        <p>
          Get started with AgentBridge. International connections, conversations
          you can follow and a way to jump in.
        </p>
        <div className="signup-benefits">
          <span>
            <Icon name="phone" /> Agentic calling
          </span>
          <span>
            <Icon name="transcript" /> Transcripts & recordings
          </span>
          <span>
            <Icon name="headphones" /> Listen in & join
          </span>
        </div>
        <A to="/studio/" className="gb-secondary-link">
          Already have access? Open studio <Icon name="arrow" size={16} />
        </A>
      </div>
      <section className="signup-card" aria-label="Early-access signup">
        {submitted ? (
          <div className="signup-confirmation" role="status">
            <Icon name="check" size={29} />
            <h2>Your details are ready.</h2>
            <p>
              This is the signup design preview. No request has been sent and no
              account has been created.
            </p>
            <Btn
              label="Edit signup details"
              end={null}
              onClick={() => setSubmitted(false)}
            />
            <A to="/studio/demo/" className="gb-secondary-link">
              Explore the sample studio <Icon name="arrow" size={16} />
            </A>
          </div>
        ) : (
          <>
            <span className="hub-kicker">EARLY ACCESS</span>
            <h2>Sign me up.</h2>
            <p>Start with your name and email.</p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setSubmitted(true);
              }}
            >
              <label htmlFor={id + "-name"}>
                Your name
                <input
                  id={id + "-name"}
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={80}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label htmlFor={id + "-email"}>
                Email address
                <input
                  id={id + "-email"}
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              <p id={id + "-notice"} className="signup-form-note">
                Signup design preview. Your details stay in this tab and are not
                submitted.
              </p>
              <Btn
                label="Continue"
                primary
                type="submit"
                aria-describedby={id + "-notice"}
              />
            </form>
          </>
        )}
      </section>
    </main>
  );
}
