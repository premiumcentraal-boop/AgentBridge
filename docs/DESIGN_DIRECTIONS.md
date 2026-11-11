# AgentBridge — three design directions

Prepared 11 November 2026 from the user's attached design references.
These are original AI-generated art-direction boards for review, not screenshots
of an implemented redesign. Each includes a desktop product page, studio
interior, mobile product/app views, type roles and a four-colour palette.

View in the app at `/studio/?demo=1#design`, or the standalone review at `/design/`.
The images are served from `assets/design-boards/`. A direction is not applied
when a board is opened; all existing studio/backend controls retain their state.

## 01 / Signal

**Clear systems. Quiet confidence.**

- Palette: chalk `#F7F7F2`, ink `#101010`, orange `#FF4D12`, steel `#C6CBC7`.
- Type roles: regular grotesk for display and reading, mono for data and labels.
- Public page: an editorial argument, a large live-type headline, a clear
  agent/bridge/destination relationship, then a dark explanatory chapter.
- Studio: a calm light workspace, aligned draft rows and a focused inspector.
- Mobile: the narrative stacks; destination records become short readable rows.
- Useful reference: the Sanity menu, automation and connected-editor studies.
  The transferred relationship is explanation through inspectable mechanisms.
- Best for: immediate clarity and an approachable first release.

## 02 / Material

**A steady frame. An expressive voice.**

- Palette: ivory `#F2F1E8`, carbon `#151713`, yellow `#E4FF38`, sage `#B7BCAA`.
- Type roles: wide heavy grotesk for display, regular sans for reading, mono for
  operational metadata. Any eventual fonts require their own licence review.
- Public page: the repeatable A↔B specimen embodies the bridge. A bounded yellow
  field carries expression while navigation and explanation stay stable.
- Studio: a restrained utility frame with deliberate yellow selection/guidance.
- Mobile: display type recomposes into a short stack. Draft actions remain clear.
- Useful reference: the Dinamo controlled-variation study and Material laboratory.
  The transferred relationship is a stable interface around expressive material.
- Best for: the most ownable AgentBridge identity. **Recommended direction.**

## 03 / Atlas

**Precision underneath. Possibility above.**

- Palette: midnight `#080F20`, pearl `#EAF0F4`, cyan `#8BE7E1`, lilac `#B8AFF5`.
- Type roles: large regular grotesk for the story, restrained sans/mono for tasks.
- Public page: original engraved connection paths converge into a bridge loop.
- Studio: solid dark surfaces keep route metadata and draft actions legible.
- Mobile: artwork crops inside its own field; operational content retains order.
- Useful reference: RETINAA material/security-print contact sheets and the
  sparse image-field interface. These contribute a relationship between the
  subject's material and its interface, not reusable identity artwork.
- Best for: premium communications positioning and an atmospheric first encounter.

## Shared floating call navigation

The updated boards adapt the user's supplied podcast-navigation reference into
an AgentBridge component. The public advertising compositions keep their own
navigation; the studio receives a detached, rounded glass rail. A persistent
call card sits above all workspace items, where playback appears in the reference.

- Top: **Active call**, recipient, **02:34** sample duration, Grok Bot, waveform,
  mute, return-to-call and end-call controls. Call artwork is labelled **Demo**.
- Workspace: **Overview**, **Route drafts**, **Connection**, **Activity**,
  **Settings**, **Design boards**. These labels share one source with the app's
  real navigation. Route drafts carries a count; selected state is explicit.
- Bottom: dark/light navigation appearance and the Victor workspace owner.
- Expanded: recipient, labels and call controls remain readable.
- Compact: a call tile and duration remain above the matching icon destinations;
  buttons retain accessible names. Return-to-call is available on the call tile.
- Mobile: a persistent call pill and a rounded menu trigger keep call context
  visible while the drawer is closed.

Signal uses smoked neutral glass and an orange accent. Material uses warm
olive/charcoal glass and acid-yellow emphasis. Atlas uses navy glass with cyan.
The rest of each direction's colour/type system remains distinct.

The gallery includes an interactive component preview with direction switching,
expanded/compact modes, dark/light appearance, all six destinations, simulated
mute/end/restart and a return-to-call view. All preview state is in memory; no
microphone permission, carrier request, call or backend mutation occurs. This
is a design prototype, not an operational live-call interface. A future live
version must use authenticated carrier state and existing authorization policy.

The supplied screenshot is a social post showing podcast navigation. It is used
for the floating panel proportions, material and hierarchy. Original component
and image authorship are not independently established. No podcast artwork,
portrait, social-media chrome or architectural background is reused.

## Source and authorship boundary

Inspected all eleven supplied screenshots/contact sheets and the available-space
SVG, plus the supplied `web-design.md`, the combined package's routing notes,
Swiss Futura instructions, Sanity/Dinamo entries, the RETINAA reference section,
and the HEAD CV material-operation method. Source websites were not newly
browsed; observations refer to the attachments and their research records.

References:

- Sanity — https://www.sanity.io/ — software narrative, product navigation and
  connected demonstrations. Sanity's logos, photography and interface assets
  are not reused in AgentBridge.
- Dinamo — https://abcdinamo.com/ — stable controls and expressive typographic
  material. The supplied Material laboratory is a teaching adaptation, not
  Dinamo's production site. No commercial font files are copied.
- RETINAA — https://retinaa.ch/ — supplied passport/wine material studies.
  The attached research credits the RETINAA website to No Plans; that is separate
  from the authorship of each project and photograph. No document, label, QR code,
  official symbol or reference photograph is reproduced in the new boards.
- HEAD CV / Gesture to System — independent method supplied by the user;
  applied as material + operation + invariant, not as a school-wide house style.

All board artwork is newly generated. Generated UI text, addresses, dates and
browser chrome are illustrative and must be reset precisely in production code.
The canonical intended product host remains `agentbridge.victor.ceo`, with studio
at `/studio/`; illustrative browser addresses in a board do not change routing.

These proposals do not establish live calling, new platform interoperability,
carrier permission, quoted prices or a deployment. All depicted routes are
sample drafts. The existing service continues to keep live routing disabled.

## Implementation after a direction is selected

Preserve the current content/task model and backend. Use the selected direction
for page composition, tokens, type roles, artwork and the responsive relationship
between tables, inspectors and mobile actions. Keep all essential text/actions
as semantic DOM; board images are references, not a replacement for a coded UI.
Motion, if useful, is progressive enhancement with a reduced-motion fallback.
