export const STATUTES = [
  { code: 'HTA', name: 'Highway Traffic Act (R.S.O. 1990, c. H.8)', short: 'Traffic' },
  { code: 'CAIA', name: 'Compulsory Automobile Insurance Act (R.S.O. 1990, c. C.25)', short: 'Insurance' },
  { code: 'LLCA', name: 'Liquor Licence and Control Act, 2019 (S.O. 2019, c. 15, Sched. 22)', short: 'Liquor' },
  { code: 'TTPA', name: 'Trespass to Property Act (R.S.O. 1990, c. T.21)', short: 'Trespass' },
  { code: 'CCA', name: 'Cannabis Control Act, 2017 (S.O. 2017, c. 26, Sched. 1)', short: 'Cannabis' },
  { code: 'SFOA', name: 'Smoke-Free Ontario Act, 2017 (S.O. 2017, c. 26, Sched. 3)', short: 'Smoke-Free' }
];

export const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'moving', label: 'Moving' },
  { id: 'speeding', label: 'Speeding' },
  { id: 'equipment', label: 'Equipment & Docs' },
  { id: 'insurance', label: 'Insurance' },
  { id: 'liquor', label: 'Liquor' },
  { id: 'trespass', label: 'Trespass' },
  { id: 'cannabis', label: 'Cannabis' }
];

export const POA_GENERAL_CHECKLIST = [
  { id: 'poa-1', label: 'Jurisdiction & Authority', note: 'Offence occurred within Ontario territorial limits; officer is designated provincial offences officer under POA s. 1(1).' },
  { id: 'poa-2', label: 'Part I vs. Part III Determination', note: 'If proceeding by Part I Certificate of Offence, total set fine must not exceed statutory limit ($1,000 for Part I). If exceeding or demanding court appearance/summons, proceed under Part III.' },
  { id: 'poa-3', label: 'Service Timeline (Part I)', note: 'Offence Notice (or Summons) must be served within 30 days after the offence is alleged to have occurred (POA s. 3(3)).' },
  { id: 'poa-4', label: 'Filing Timeline (Court Office)', note: 'Certificate of Offence must be filed in court office as soon as possible, and not later than 7 days after service (POA s. 4).' },
  { id: 'poa-5', label: 'Officer Signature & Declaration', note: 'Officer certifies having reasonable grounds to believe the defendant committed the named offence, signed and dated with badge/ID.' },
  { id: 'poa-6', label: 'Proper Short-Form Wording Used', note: 'Use exact regulation short-form wording from Ontario Regulation 950 under the Provincial Offences Act.' }
];

export const CHARGES = [
  // --- Speeding ---
  {
    id: 'HTA:128-15',
    statute: 'HTA',
    category: 'speeding',
    section: '128',
    subSection: '15 km/h over',
    name: 'Speeding (1–15 km/h over limit)',
    shortWording: 'Speeding — 1 to 15 km/h over lawful rate',
    part: 'Part I',
    setFine: 37.50,
    totalPayable: 52.50,
    points: 0,
    summary: 'Driving a motor vehicle at a rate of speed greater than the lawful rate posted on highway or municipal roadway.',
    elements: [
      { id: 'e1', text: 'Defendant was driving/operating a motor vehicle on a highway as defined in HTA s. 1.' },
      { id: 'e2', text: 'A lawful maximum speed limit was established and in effect (or statutory default unposted limit 50/80 km/h).' },
      { id: 'e3', text: 'Defendant travelled at a measured speed exceeding the limit by 1 to 15 km/h.' },
      { id: 'e4', text: 'Speed measurement device (radar/laser/pace) tested before and after tour of duty and operating properly.' }
    ],
    procedureNotes: 'Schedule 43 Part I set fine: $2.50 per km/h over limit up to 19 km/h. Plus court cost ($5.00) and Victim Fine Surcharge ($10.00). 0 Demerit Points.',
    statuteUrl: 'https://www.ontario.ca/laws/statute/90h08#BK220'
  },
  {
    id: 'HTA:128-25',
    statute: 'HTA',
    category: 'speeding',
    section: '128',
    subSection: '20–29 km/h over',
    name: 'Speeding (20–29 km/h over limit)',
    shortWording: 'Speeding — 20 to 29 km/h over lawful rate',
    part: 'Part I',
    setFine: 95.00,
    totalPayable: 115.00,
    points: 3,
    summary: 'Speeding 20 to 29 km/h over the posted limit carries 3 demerit points and set fine calculated at $3.75 per km/h over.',
    elements: [
      { id: 'e1', text: 'Defendant was driving a motor vehicle on a highway.' },
      { id: 'e2', text: 'Speed exceeded lawful limit by 20 to 29 km/h.' },
      { id: 'e3', text: 'Speed measurement instrument verified accurate; calibration/tuning logs documented.' }
    ],
    procedureNotes: '3 Demerit Points assigned by Ministry of Transportation upon conviction. Ensure exact km/h clocked and location logged in duty notebook.',
    statuteUrl: 'https://www.ontario.ca/laws/statute/90h08#BK220'
  },
  {
    id: 'HTA:128-40',
    statute: 'HTA',
    category: 'speeding',
    section: '128',
    subSection: '30–49 km/h over',
    name: 'Speeding (30–49 km/h over limit)',
    shortWording: 'Speeding — 30 to 49 km/h over lawful rate',
    part: 'Part I or III',
    setFine: 220.00,
    totalPayable: 260.00,
    points: 4,
    summary: 'Speeding 30 to 49 km/h over posted limit carries 4 demerit points. Set fine calculated at $6.00 per km/h over.',
    elements: [
      { id: 'e1', text: 'Defendant drove motor vehicle on a highway.' },
      { id: 'e2', text: 'Speed exceeded lawful limit by 30 to 49 km/h.' },
      { id: 'e3', text: 'Radar/LiDAR sight line clear, no vehicle shadowing or multi-path interference.' }
    ],
    procedureNotes: '4 Demerit Points. Note: 40 km/h or more in an under-80 km/h zone, or 50 km/h or more anywhere, triggers Stunt Driving (HTA s. 172) with immediate 30-day licence suspension and 14-day vehicle impoundment.',
    statuteUrl: 'https://www.ontario.ca/laws/statute/90h08#BK220'
  },
  {
    id: 'HTA:172',
    statute: 'HTA',
    category: 'moving',
    section: '172(1)',
    subSection: 'Stunt driving',
    name: 'Stunt Driving / Street Racing',
    shortWording: 'Drive motor vehicle — perform stunt',
    part: 'Part III (Summons Mandatory)',
    setFine: null,
    totalPayable: 'Court Summons (Min fine $2,000)',
    points: 6,
    summary: 'Operating a motor vehicle on a highway while performing a stunt, contest, or exceeding speed limit by 40+ km/h (where limit < 80) or 50+ km/h.',
    elements: [
      { id: 'e1', text: 'Defendant drove a motor vehicle on a highway.' },
      { id: 'e2', text: 'Conduct fits O. Reg. 455/07 definition (excessive speed 40+/50+ over, burnouts, drifting, chasing, cutting off, person in trunk).' },
      { id: 'e3', text: 'Issued administrative roadside 30-day licence suspension (ADLS) under s. 172.' },
      { id: 'e4', text: 'Issued 14-day mandatory vehicle impoundment notice to towing operator and driver.' }
    ],
    procedureNotes: 'Part III POA Summons required. No set fine; minimum fine on conviction $2,000 up to $10,000, imprisonment up to 6 months, and 1 to 3 year driving prohibition on first conviction.',
    statuteUrl: 'https://www.ontario.ca/laws/statute/90h08#BK278'
  },

  // --- Moving Violations ---
  {
    id: 'HTA:130',
    statute: 'HTA',
    category: 'moving',
    section: '130(1)',
    subSection: 'Careless driving',
    name: 'Careless Driving',
    shortWording: 'Careless driving',
    part: 'Part I or III',
    setFine: 400.00,
    totalPayable: 490.00,
    points: 6,
    summary: 'Driving a vehicle or street car on a highway without due care and attention or without reasonable consideration for other persons using the highway.',
    elements: [
      { id: 'e1', text: 'Defendant was driving a vehicle or street car on a highway.' },
      { id: 'e2', text: 'Driving lacked the standard of care that an ordinary prudent driver would exercise in the circumstances (without due care & attention).' },
      { id: 'e3', text: 'Alternatively, defendant drove without reasonable consideration for other road users.' },
      { id: 'e4', text: 'Documented road condition, weather, lighting, traffic density, and witness/victim statements.' }
    ],
    procedureNotes: '6 Demerit Points. If bodily harm or death resulted, officer MUST charge under s. 130(3) Part III with mandatory court appearance, fines $2,000–$50,000, and possible jail.',
    statuteUrl: 'https://www.ontario.ca/laws/statute/90h08#BK223'
  },
  {
    id: 'HTA:144-18',
    statute: 'HTA',
    category: 'moving',
    section: '144(18)',
    subSection: 'Red light',
    name: 'Red Light — Fail to Stop',
    shortWording: 'Red light — fail to stop',
    part: 'Part I',
    setFine: 260.00,
    totalPayable: 325.00,
    points: 3,
    summary: 'Driver facing an amber signal light failed to stop if stop could be made safely, or driver facing a red signal light failed to stop at marked stop line or crosswalk.',
    elements: [
      { id: 'e1', text: 'Defendant was driving a vehicle approaching an intersection controlled by traffic control signal system.' },
      { id: 'e2', text: 'Traffic signal displayed red light.' },
      { id: 'e3', text: 'Defendant failed to bring vehicle to a complete stop before the stop line, crosswalk, or intersection entry.' },
      { id: 'e4', text: 'Signal operation verified in normal working sequence.' }
    ],
    procedureNotes: 'Part I set fine $260.00. Total payable $325.00 (includes $60.00 victim surcharge and $5.00 court cost). 3 Demerit Points.',
    statuteUrl: 'https://www.ontario.ca/laws/statute/90h08#BK243'
  },
  {
    id: 'HTA:136-1-a',
    statute: 'HTA',
    category: 'moving',
    section: '136(1)(a)',
    subSection: 'Stop sign',
    name: 'Disobey Stop Sign — Fail to Stop',
    shortWording: 'Disobey stop sign — fail to stop',
    part: 'Part I',
    setFine: 85.00,
    totalPayable: 110.00,
    points: 3,
    summary: 'Driver approaching a stop sign at an intersection failed to stop at marked stop line, crosswalk, or before entering the intersection.',
    elements: [
      { id: 'e1', text: 'Intersection governed by an authorized stop sign clearly displayed.' },
      { id: 'e2', text: 'Defendant operated vehicle approaching said intersection.' },
      { id: 'e3', text: 'Defendant failed to come to a full and complete stop before entering intersection/crosswalk/line.' }
    ],
    procedureNotes: 'Part I set fine $85.00. Total payable $110.00. 3 Demerit Points. Note: If in a Community Safety Zone, set fine is doubled ($150.00, total $180.00).',
    statuteUrl: 'https://www.ontario.ca/laws/statute/90h08#BK231'
  },
  {
    id: 'HTA:78.1-1',
    statute: 'HTA',
    category: 'moving',
    section: '78.1(1)',
    subSection: 'Distracted driving',
    name: 'Drive Motor Vehicle — Handheld Communication Device',
    shortWording: 'Drive motor vehicle — perform hand-held communication device',
    part: 'Part I or III',
    setFine: 500.00,
    totalPayable: 615.00,
    points: 3,
    summary: 'Holding or using a handheld wireless communication device or other electronic entertainment/display device while operating a motor vehicle on a highway.',
    elements: [
      { id: 'e1', text: 'Defendant was driving/operating a motor vehicle on a highway (including stopped at a red light/traffic queue).' },
      { id: 'e2', text: 'Defendant was holding or using a hand-held wireless communication device capable of receiving or transmitting telephone or data.' },
      { id: 'e3', text: 'No statutory exemption applied (e.g. hands-free voice activated mode, calling 911 emergency services, or vehicle lawfully off travelled portion).' }
    ],
    procedureNotes: 'Part I set fine $500.00, total payable $615.00. 3 Demerit Points. Conviction carries statutory 3-day driver licence suspension for first offence (7-day for second, 30-day for third).',
    statuteUrl: 'https://www.ontario.ca/laws/statute/90h08#BK149'
  },
  {
    id: 'HTA:106-2',
    statute: 'HTA',
    category: 'equipment',
    section: '106(2)',
    subSection: 'Seatbelt',
    name: 'Driver — Fail to Properly Wear Seatbelt Assembly',
    shortWording: 'Driver — fail to properly wear seat belt assembly',
    part: 'Part I',
    setFine: 200.00,
    totalPayable: 240.00,
    points: 2,
    summary: 'Operating a motor vehicle on a highway while not wearing the complete seatbelt assembly properly adjusted and securely fastened.',
    elements: [
      { id: 'e1', text: 'Defendant was driving a motor vehicle on a highway.' },
      { id: 'e2', text: 'Vehicle was equipped with an approved seat belt assembly for the driver seat.' },
      { id: 'e3', text: 'Driver was not wearing the assembly, or was wearing it improperly (e.g. shoulder strap tucked behind back or under arm).' },
      { id: 'e4', text: 'No medical exemption certificate or reverse-driving exemption.' }
    ],
    procedureNotes: 'Part I set fine $200.00, total $240.00. 2 Demerit Points. Note: Driver is also responsible for passengers under 16 years of age (HTA s. 106(4)).',
    statuteUrl: 'https://www.ontario.ca/laws/statute/90h08#BK192'
  },

  // --- Documentation & Suspended ---
  {
    id: 'HTA:33-1',
    statute: 'HTA',
    category: 'equipment',
    section: '33(1)',
    subSection: 'Surrender licence',
    name: 'Fail to Surrender Licence',
    shortWording: 'Fail to surrender licence',
    part: 'Part I',
    setFine: 85.00,
    totalPayable: 110.00,
    points: 0,
    summary: 'Driver failed or refused to surrender driver licence upon the demand of a police officer.',
    elements: [
      { id: 'e1', text: 'Lawful traffic stop / officer in lawful execution of duty under HTA.' },
      { id: 'e2', text: 'Clear demand made to person having care, charge or control of motor vehicle to surrender driver licence.' },
      { id: 'e3', text: 'Defendant failed or refused to produce/surrender valid physical licence (or valid digital permit if applicable).' }
    ],
    procedureNotes: 'Part I set fine $85.00, total $110.00. 0 Demerit Points. Verify driver identity via police database (CPIC/MTO PARIS) before release.',
    statuteUrl: 'https://www.ontario.ca/laws/statute/90h08#BK66'
  },
  {
    id: 'HTA:7-5-a',
    statute: 'HTA',
    category: 'equipment',
    section: '7(5)(a)',
    subSection: 'Surrender permit',
    name: 'Fail to Surrender Permit for Motor Vehicle',
    shortWording: 'Fail to surrender permit for motor vehicle',
    part: 'Part I',
    setFine: 85.00,
    totalPayable: 110.00,
    points: 0,
    summary: 'Driver failed to surrender the motor vehicle permit (or true copy) on demand of a police officer.',
    elements: [
      { id: 'e1', text: 'Motor vehicle driven on a highway.' },
      { id: 'e2', text: 'Officer requested motor vehicle permit (ownership).' },
      { id: 'e3', text: 'Defendant failed or refused to surrender permit or true copy.' }
    ],
    procedureNotes: 'Part I set fine $85.00, total $110.00. 0 Demerit Points.',
    statuteUrl: 'https://www.ontario.ca/laws/statute/90h08#BK18'
  },
  {
    id: 'HTA:53-1',
    statute: 'HTA',
    category: 'equipment',
    section: '53(1)',
    subSection: 'Driving while suspended',
    name: 'Drive Motor Vehicle While Licence Suspended',
    shortWording: 'Drive motor vehicle — while licence suspended',
    part: 'Part III (Summons Mandatory)',
    setFine: null,
    totalPayable: 'Court Summons (Min fine $1,000)',
    points: 6,
    summary: 'Driving a motor vehicle on a highway while driver licence is suspended under Ontario statute or regulation.',
    elements: [
      { id: 'e1', text: 'Defendant drove a motor vehicle on a highway.' },
      { id: 'e2', text: 'Defendant’s driver licence was suspended under Ontario law (e.g. unpaid fines, demerits, medical, family responsibility).' },
      { id: 'e3', text: 'Confirmed active suspension on MTO PARIS / CPIC with effective date.' },
      { id: 'e4', text: 'Vehicle impoundment notice issued if suspension reason triggers mandatory impoundment under HTA s. 55.1.' }
    ],
    procedureNotes: 'Part III POA Summons. Minimum fine $1,000 up to $5,000 for first offence, plus 25% victim fine surcharge. Subsequent offences carry fines $2,000–$5,000 and possible jail up to 6 months. Additional 6-month licence suspension on conviction.',
    statuteUrl: 'https://www.ontario.ca/laws/statute/90h08#BK107'
  },

  // --- Compulsory Automobile Insurance Act (CAIA) ---
  {
    id: 'CAIA:2-1-a',
    statute: 'CAIA',
    category: 'insurance',
    section: '2(1)(a)',
    subSection: 'Operate without insurance',
    name: 'Operate Motor Vehicle Without Insurance',
    shortWording: 'Operate motor vehicle on highway with no insurance',
    part: 'Part III (Summons Mandatory)',
    setFine: null,
    totalPayable: 'Court Summons (Min fine $5,000)',
    points: 0,
    summary: 'Operating a motor vehicle on a highway without motor vehicle liability insurance policy in force.',
    elements: [
      { id: 'e1', text: 'Defendant operated a motor vehicle on a highway in Ontario.' },
      { id: 'e2', text: 'No contract of automobile insurance was in force for the vehicle at the time of operation.' },
      { id: 'e3', text: 'Confirmed policy cancellation / non-existence with listed insurer or IBC (Insurance Bureau of Canada) database.' },
      { id: 'e4', text: 'Officer cautioned defendant and verified owner details.' }
    ],
    procedureNotes: 'Part III POA Summons mandatory. Heavy statutory penalties: Minimum fine $5,000 up to $25,000 on first conviction; $10,000 to $50,000 on subsequent conviction. PLUS 25% victim fine surcharge ($1,250 min surcharge). Possible driver licence suspension up to 1 year.',
    statuteUrl: 'https://www.ontario.ca/laws/statute/90c25#BK2'
  },
  {
    id: 'CAIA:3-1',
    statute: 'CAIA',
    category: 'insurance',
    section: '3(1)',
    subSection: 'Fail to surrender insurance',
    name: 'Fail to Surrender Insurance Card',
    shortWording: 'Operate motor vehicle — fail to surrender insurance card',
    part: 'Part I',
    setFine: 50.00,
    totalPayable: 65.00,
    points: 0,
    summary: 'Driver failed to surrender an insurance card for the motor vehicle upon demand of a police officer.',
    elements: [
      { id: 'e1', text: 'Defendant was driving / operating motor vehicle on a highway.' },
      { id: 'e2', text: 'Officer requested evidence of insurance (physical card or approved electronic pink slip).' },
      { id: 'e3', text: 'Defendant failed to produce/surrender valid card upon demand.' }
    ],
    procedureNotes: 'Part I set fine $50.00, total payable $65.00. 0 Demerit Points. Note: If insurance is valid but card was missing, defendant can often present proof at prosecutor’s office for withdrawal; ensure notes reflect whether card was simply missing or policy nonexistent.',
    statuteUrl: 'https://www.ontario.ca/laws/statute/90c25#BK3'
  },

  // --- Liquor Licence and Control Act, 2019 (LLCA) ---
  {
    id: 'LLCA:42-1',
    statute: 'LLCA',
    category: 'liquor',
    section: '42(1)',
    subSection: 'Open liquor in vehicle',
    name: 'Have Open Container of Liquor in Motor Vehicle',
    shortWording: 'Have liquor in open container in unauthorized place (motor vehicle)',
    part: 'Part I',
    setFine: 175.00,
    totalPayable: 215.00,
    points: 0,
    summary: 'Driving or having the care or control of a motor vehicle or boat that is not packed in baggage and is readily available to any person in the vehicle.',
    elements: [
      { id: 'e1', text: 'Defendant drove or had care or control of a motor vehicle or boat.' },
      { id: 'e2', text: 'Vehicle was on a highway, road, or water.' },
      { id: 'e3', text: 'Liquor container had seal broken or was open, OR liquor was in an unsealed cup/can/bottle.' },
      { id: 'e4', text: 'Liquor was not in trunk or behind last upright seat in a vehicle without trunk.' },
      { id: 'e5', text: 'Seized open liquor item logged into evidence/destruction.' }
    ],
    procedureNotes: 'Part I set fine $175.00, total $215.00. Officer has statutory search authority without warrant under LLCA s. 42(3) if reasonable grounds exist to believe liquor is unlawfully kept in vehicle.',
    statuteUrl: 'https://www.ontario.ca/laws/statute/19l15#BK50'
  },
  {
    id: 'LLCA:31-4',
    statute: 'LLCA',
    category: 'liquor',
    section: '31(4)',
    subSection: 'Public intoxication',
    name: 'Intoxicated in Public Place',
    shortWording: 'Be intoxicated in a public place',
    part: 'Part I',
    setFine: 50.00,
    totalPayable: 65.00,
    points: 0,
    summary: 'Being in an intoxicated condition in a place to which the general public is invited or permitted access.',
    elements: [
      { id: 'e1', text: 'Defendant was present in a public place or common area of multiple-dwelling building.' },
      { id: 'e2', text: 'Defendant was intoxicated by alcohol.' },
      { id: 'e3', text: 'Defendant was in a condition posing a danger to themselves or others, or causing disturbance.' },
      { id: 'e4', text: 'Officer arrested under LLCA s. 31(5) authority if necessary for safety of person or public.' }
    ],
    procedureNotes: 'Part I set fine $50.00, total $65.00. Officer may arrest without warrant if in officer’s opinion it is necessary for safety of any person. Defendant held until sober or released to responsible adult.',
    statuteUrl: 'https://www.ontario.ca/laws/statute/19l15#BK38'
  },
  {
    id: 'LLCA:34-1',
    statute: 'LLCA',
    category: 'liquor',
    section: '34(1)',
    subSection: 'Underage possession',
    name: 'Person Under 19 — Possess / Consume Liquor',
    shortWording: 'Person under 19 years — possess / consume liquor',
    part: 'Part I',
    setFine: 100.00,
    totalPayable: 125.00,
    points: 0,
    summary: 'A person under nineteen years of age possessing, consuming, attempting to purchase, or having liquor in their possession.',
    elements: [
      { id: 'e1', text: 'Defendant is under the age of nineteen years (confirmed DOB).' },
      { id: 'e2', text: 'Defendant possessed or consumed liquor.' },
      { id: 'e3', text: 'No exemption applied (e.g. residence under parent/guardian supervision).' }
    ],
    procedureNotes: 'Part I set fine $100.00, total $125.00. Liquor seized. If youth under 16, POA notice served with copy to parent/guardian as required under POA Part VI (Young Persons).',
    statuteUrl: 'https://www.ontario.ca/laws/statute/19l15#BK41'
  },

  // --- Trespass to Property Act (TTPA) ---
  {
    id: 'TTPA:2-1-a',
    statute: 'TTPA',
    category: 'trespass',
    section: '2(1)(a)',
    subSection: 'Entry prohibited',
    name: 'Enter Premises When Entry Prohibited',
    shortWording: 'Enter premises when entry prohibited',
    part: 'Part I',
    setFine: 55.00,
    totalPayable: 65.00,
    points: 0,
    summary: 'Entering onto premises when entry is prohibited under the Trespass to Property Act without the express permission of the occupier.',
    elements: [
      { id: 'e1', text: 'Defendant entered on premises (land, water, building, or structure).' },
      { id: 'e2', text: 'Entry was prohibited by notice (oral warning, written notice, or signs posted at access points).' },
      { id: 'e3', text: 'Defendant lacked color of right or permission of occupier/authorized agent.' }
    ],
    procedureNotes: 'Part I set fine $55.00, total $65.00. Officer may arrest without warrant under TTPA s. 9 if defendant found on premises and refuses to give name and address or officer believes name/address false.',
    statuteUrl: 'https://www.ontario.ca/laws/statute/90t21#BK2'
  },
  {
    id: 'TTPA:2-1-b',
    statute: 'TTPA',
    category: 'trespass',
    section: '2(1)(b)',
    subSection: 'Fail to leave',
    name: 'Fail to Leave Premises When Directed',
    shortWording: 'Fail to leave premises when directed',
    part: 'Part I',
    setFine: 55.00,
    totalPayable: 65.00,
    points: 0,
    summary: 'Failing to leave premises immediately after being directed to do so by the occupier of the premises or a person authorized by the occupier.',
    elements: [
      { id: 'e1', text: 'Defendant was present on premises with initial permission or otherwise.' },
      { id: 'e2', text: 'Occupier or authorized person clearly directed defendant to leave the premises.' },
      { id: 'e3', text: 'Defendant failed to leave immediately after being directed.' }
    ],
    procedureNotes: 'Part I set fine $55.00, total $65.00. Occupier statement and security video / body worn camera footage noted.',
    statuteUrl: 'https://www.ontario.ca/laws/statute/90t21#BK2'
  },

  // --- Cannabis Control Act, 2017 (CCA) ---
  {
    id: 'CCA:12-1',
    statute: 'CCA',
    category: 'cannabis',
    section: '12(1)',
    subSection: 'Cannabis in vehicle',
    name: 'Drive Vehicle with Cannabis Readily Available',
    shortWording: 'Drive vehicle with cannabis in open container / readily available',
    part: 'Part I',
    setFine: 175.00,
    totalPayable: 215.00,
    points: 0,
    summary: 'Driving or having care or control of a vehicle or boat on a highway or water while cannabis is in an open package or readily available to any person in the vehicle.',
    elements: [
      { id: 'e1', text: 'Defendant drove or had care or control of vehicle on a highway or water.' },
      { id: 'e2', text: 'Cannabis was present in vehicle.' },
      { id: 'e3', text: 'Cannabis package was open or seal broken, OR cannabis was readily available to driver or passengers (not fastened in luggage or inaccessible).' }
    ],
    procedureNotes: 'Part I set fine $175.00, total $215.00. Search authority without warrant under CCA s. 12(3) on reasonable grounds that cannabis is kept contrary to law.',
    statuteUrl: 'https://www.ontario.ca/laws/statute/17c26#BK14'
  },
  {
    id: 'CCA:10-1',
    statute: 'CCA',
    category: 'cannabis',
    section: '10(1)',
    subSection: 'Underage cannabis',
    name: 'Person Under 19 — Possess / Consume Cannabis',
    shortWording: 'Person under 19 years — possess / consume cannabis',
    part: 'Part I',
    setFine: 100.00,
    totalPayable: 125.00,
    points: 0,
    summary: 'No person under nineteen years of age shall purchase, attempt to purchase, consume, attempt to consume, possess or distribute cannabis.',
    elements: [
      { id: 'e1', text: 'Defendant is under 19 years of age.' },
      { id: 'e2', text: 'Defendant possessed, consumed, purchased or distributed cannabis.' },
      { id: 'e3', text: 'Cannabis seized and submitted for disposal or exhibit.' }
    ],
    procedureNotes: 'Part I set fine $100.00, total $125.00. Note: Diversion/referral options may apply under youth justice protocols.',
    statuteUrl: 'https://www.ontario.ca/laws/statute/17c26#BK12'
  }
];
