# Stick the Ticket

A fast, offline-ready reference and compliance checklist PWA for Ontario Provincial Offences Act (POA) charges, designed for frontline law enforcement officers.

## Online Beta for Testers

- **Live Web App (GitHub Pages)**: <https://jswizzle3737.github.io/Stick-The-Ticket/>
- **Install on Phone (Offline PWA)**: Open the URL in Safari (iOS) or Chrome (Android) and select **Add to Home Screen** / **Install App**. All 1,006 HTA offences, saved tickets, and element checklists are cached locally on-device.

## Features

- **1,006 HTA Offences Indexed**: Highway Traffic Act Schedule 43 (Items 1–558), Schedule 6, Schedule 7 (Reg. 604), Schedule 8 (Reg. 622), and Statutory Part III offences with set fines, Victim Fine Surcharge + court cost totals, demerit points, O. Reg. 950 short-form wording, and verbatim statutory text.
- **Bidirectional Element & Concept Search**:
  - Search by section (`172`, `s. 78.1`, `item 172`), charge name, ticket wording, or **elements to prove** (`electronic data`, `liftable axle`, `slow down tow truck`).
  - Automatic Canadian ↔ US spelling equivalence (`centre↔center`, `licence↔license`, `metre↔meter`, `colour↔color`, `tire↔tyre`), stemming, stopword pruning, everyday concept aliases (`cell phone`, `missing brake light`, `val tag`, `running a red light`), typo tolerance (`Did you mean…`), and one-tap filter escapes.
  - Enforcement facets (`All`, `Part III · Summons`, `Demerit pts`, `Part I`) plus independent **Saved** ticket search.
- **Detail Match Attribution & Jump-to-Match**: Highlights matching query/concept terms across Title, Summary, Prove elements, OR options, Wording, Notes, and Statutory Text with green match markers and a quick `Match in Prove … · Jump ↓` button.
- **Settings, Appearance & Officer Profiles**: High-contrast Light ("Paper") & Dark ("Charcoal") themes, local Officer Profile sign-in (with optional PIN), JSON workspace Export/Import backup, multi-select POA legislation scope, and integrated POA Field Rules checklist.

## Local Development, Build & Verification

```sh
# Run the web app locally
npm start

# Package the static PWA bundle into mobile/dist/
npm run build

# Run all 18 headless Chromium end-to-end tests
npm test
```
