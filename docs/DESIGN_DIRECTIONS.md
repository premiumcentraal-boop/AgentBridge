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

## 2026-11-11: implemented website foundation

The latest direction is implemented in `web/src/` as actual React 19 pages using
Meta's [Astryx components](https://astryx.atmeta.com/components), pinned to
`@astryxdesign/core` and `@astryxdesign/theme-neutral` 0.7.13. It is one coherent
interface, using the supplied silver connection loops, quiet widget surfaces
and floating glass navigation as references. The three earlier generated boards
remain an archive; they are not screenshots of the implemented pages.

Original inline SVG connection art, silver pill buttons, subtle charcoal/sage
surfaces and generous spacing connect the marketing site with the studio.
Astryx supplies actual SideNav, Card, Button, SegmentedControl, Dialog and
TextInput behavior. Responsive layouts, dark/light appearance, active-call
preview, route-draft forms and page navigation are built in DOM components.

`npm run build:site` renders 20 direct HTML routes plus the retained gallery.
The portable `web/.cache/AgentBridge-Working-Website.html` contains the real
interface, styles and historical boards in one file. It runs the sample studio
with in-tab data and no API requests. The normal hosted studio retains the
existing protected SQLite API. Neither version enables a real call.

Astryx and StyleX licenses are preserved in this directory. The build collects
runtime dependency notices into `dist/assets/foundation/THIRD_PARTY_NOTICES.txt`
and the portable artifact. No Meta assets, trademarks or reference screenshots
are used as AgentBridge page images.

Validation separates DOM interaction tests and structural HTML audits from
browser visual testing. This environment offers no browser-control tool, so
actual browser layout, animation, touch and screen-reader QA remain pending.

## 2026-11-11: connect agents worldwide

The main tagline is now exactly “connect agents worldwide”. The homepage hero
replaces its silver tube with a transit network: eight smooth paths, 16 country
flag stations, and two oppositely travelling flag capsules per route. The loop
is 40 seconds; every motion and illumination period divides that score.

The geometry uses continuous cubic tangents. Arc-length measurements distribute
travel time by distance, with a short dwell at each actual flag station. Long
curves, staggered departures, muted base tracks, bright trailing segments and
clear over/under crossings give the movement a rhythm. Flags remain upright
through bends. The map is an illustration, not actual carrier activity.

Native SVG motion avoids a JavaScript animation frame loop. The scene pauses
off screen and when the tab is hidden, respects reduced-motion preferences and
has an explicit pause/play button. Country vectors come from
[flag-icons](https://github.com/lipis/flag-icons), with its MIT notice included
in the build. Public pages and the sample studio can be reviewed on the private
Sites preview; the production Railway setup remains separate.

## 2026-11-11: approved bold bands and flag circles

The selected visual reference is the broad, flat path graphic in
[Humu, illustrated by Kenzi Quigg](https://www.kenziquigg.com/work/humu), with
[Uned's Travel Lines](https://uned.studio/projects/transport-for-wales/) as a
motion reference. The user approved this direction and requested country flags
inside the circles. The composition and animation are original AgentBridge code;
no artwork from those projects is embedded in the product.

This iteration used four thick colour bands in pink, orange, cyan and yellow.
Every leg is a straight run or a single circular 90-degree elbow. Flags reveal
inside large white endpoint circles only after arrival. Outgoing legs start at
those circles while the incoming bands trim away, creating an unbroken handoff.
Four offset streams cover 16 countries over a seamless 40-second score.

SVG symbols keep flags crisp and avoid nested image decoding. Arrival, flag
reveal, continuation and tail trimming share one timeline. The scene pauses off
screen and in hidden tabs; reduced-motion users receive a composed still with
three flag circles and can explicitly choose to play. This still is available
through CSS before JavaScript loads.

## 2026-11-11: one connected minute-long relay

The current hero replaces separate streams and stationary endpoint circles with
one closed circuit and one moving flag circle. Sixteen straight or single-turn
legs share exact endpoints and continuous tangents, including the last-to-first
join. A coloured trail follows the circle; its trailing edge retraces the same
timing 18 seconds later so no isolated pieces are left behind.

The circle rides at the advancing end of the line, briefly holds at a handoff,
crossfades to the next country's flag and continues in the next colour. Movement,
stroke growth, trimming and flag exchange use the same 60-second score. Native
SVG motion follows the combined circuit; no independently positioned flags or
invisible jumps are used. The flag stays upright through each rounded corner.

Pause/play, off-screen and hidden-tab suspension, theme switching and the
reduced-motion still remain available. The still samples this same connected
relay rather than displaying a separate arrangement.
