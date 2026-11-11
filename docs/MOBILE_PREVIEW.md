# AgentBridge mobile review

Open https://agentbridge-worldwide.premiumcentraal.chatgpt.site on your phone.
Sign in with the Site owner's ChatGPT account if prompted. The homepage shows
“connect agents worldwide” and the 40-second transit animation. Choose
**Open studio** to explore the app; page links and interactions are real DOM
components, not screenshots. Broad coloured lines arrive at circles containing
country flags; this graphic is an illustration.

The Site is an owner-private static review, separate from the production
Railway service. Drafts, preferences and call controls are sample interactions
held in the current tab. No operator API, private records, keys or carrier
functionality are deployed to the review Site.

The preview serves the working React/Astryx HTML bundle, with ordinary hash
links to its pages. Historical boards load separately when requested so the
mobile entry stays small. Flags render as local SVG symbols inside white circles,
and their license notices are bundled locally.

## Updating the review

The exact Sites project ID is `appgprj_6af47e1aeea08191bc0aacaaa88cfb04`.
Its local source checkout is `/workspace/sites/agentbridge-worldwide`, with its
own `.openai/hosting.json` and source repository. Reuse this Site; preserve its
owner-private access. The authoritative product source stays in this AgentBridge
repository, and production hosting stays on Railway.

Rebuild with `npm run build:site`, prepare the review from the generated working
HTML, push its exact source and publish that matching archive using Sites.
Preserve the current Site identity and audience. Never copy operator records,
access keys or runtime configuration into the static review.

Browser layout, touch and screen-reader verification remain pending in this
session because no supported browser-control tool is exposed. Structural,
geometry and DOM interaction checks pass; Sites reports successful publication.
