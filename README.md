# Stick the Ticket

A fast, lightweight reference and compliance checklist application for Ontario Provincial Offences Act (POA) charges, designed specifically for frontline law enforcement officers.

Stick the Ticket allows police officers to quickly find and identify POA charges (Highway Traffic Act, Compulsory Automobile Insurance Act, Liquor Licence and Control Act, Trespass to Property Act, Smoke-Free Ontario Act, Cannabis Control Act, etc.), review set fines, total payable amounts, demerit points, short-form ticket wording, and run through an interactive **Elements of the Offence & Ticket Requirements Checklist** before issuing or sticking the charge/ticket.

## Design

Stick the Ticket shares the clean, high-contrast, distraction-free phone-app aesthetic of *Stick the Charge*, reimagined with an Ontario provincial green aesthetic:
- **Paper & Slate Palette**: Subtle sage/moss green tint across light paper surfaces (`#e8efe9`) and deep dark slate (`#070c08`).
- **Forest & Emerald Accents**: `#1b7a42` and `#22c55e` replacing the federal crimson, symbolizing provincial law enforcement & traffic compliance.
- **Trillium Emblem**: Hand-drawn vector geometry of Ontario's official floral emblem (the white trillium), crisp at any display density.
- **Interactive Checklists**: 
  - Essential offence elements checklist (actions, intent, conditions required to prove the charge).
  - Part I / Part III statutory requirement verification (Certificate of Offence vs. Offence Notice, set fine vs. court summons, 30-day service window, mandatory officer declaration, proper short-form wording).
  - Interactive status persistence directly in local storage.
- **Saved / Stuck Board**: Pin frequently issued tickets for instant recall on patrol.
- **Local Photo Notes**: Capture or import photographic evidence locally (speed radar reading, license plate, vehicle condition, liquor container) with private on-device IndexedDB storage.

## Statutes Covered

1. **Highway Traffic Act (HTA)** – Speeding, careless driving, red light, stop sign, seatbelt, distracted driving / handheld device, driving while suspended, fail to surrender permit/licence.
2. **Compulsory Automobile Insurance Act (CAIA)** – Operate motor vehicle without insurance, fail to surrender insurance card.
3. **Liquor Licence and Control Act, 2019 (LLCA)** – Open liquor in motor vehicle, intoxicated in public place, consume liquor under 19, supply liquor to person under 19.
4. **Trespass to Property Act (TTPA)** – Enter premises when entry prohibited, fail to leave premises when directed.
5. **Cannabis Control Act, 2017 (CCA)** – Unlawful consumption in vehicle, open cannabis in vehicle, consume cannabis under 19.
6. **Smoke-Free Ontario Act, 2017 (SFOA)** – Smoke/vape in prohibited place or vehicle with youth under 16.

## Running the Web App

The mobile directory contains the progressive web app (PWA) ready for local preview or mobile deployment:

```sh
cd mobile
python3 -m http.server 8766
```

Open `http://localhost:8766/` in your browser or test with mobile viewport emulation.
