# UConnect

Free food and tutoring, run by students at Union High School (Camas, WA).

Live site: https://claude.ai/artifact/1VnmgLKAj8n1q5z7gHtS4A

## Pages

| Page | What it does |
|---|---|
| Home | Everything on the shelf today (A to Z), four "What do you need?" buttons, places to get food, how it works, and impact numbers (bags given out, volunteer hours...) |
| Get food | Add items from the school pantry (A to Z; once added, a − 1 + stepper shows on the item), filter by allergies and diets, pick a 15-minute pickup time, send. You can use a pickup code instead of your name. After sending, a "Request sent!" box shows the code, time and what happens next |
| Locations | Map and list of 8 real pantries near Union High (hours, phone, website, directions), sorted by distance once you pick where you are. Only the school pantry takes requests through UConnect |
| Tutoring | Ask for a free student tutor: subject, grade, lunch or after school, days, in person or online |
| Recipes | AI recipe ideas made from what's in stock, aimed at a child's age |
| Help out | Donate food, or volunteer: pick Lunch and/or After school, that time's jobs show up, then pick days. Volunteers log their service hours here |
| My requests | Where your food requests, donations and tutoring requests are at, plus restock alerts. The bell shows new updates |
| Student dashboard | Tiles at the top open their tab. Food cards show the pickup time and have one "next step" button (Start packing → Mark ready → Mark picked up), plus printable packing slips. Stock is A to Z with fixed columns, so nothing moves while you change amounts; Bulk update reads a pasted delivery list or count sheet. Volunteers tab: approve service hours and copy an hours report. Locations tab: pickup days, hours and families per time |

The public pages work in English, Español, 中文 and Русский, with a larger-text button. The dashboard is English only.

## Files

```
uconnect/
├── index.html                 all the page markup
├── css/styles.css             all the styles (colors are variables at the top, dark mode right after)
├── js/
│   ├── translations.js        every phrase in 4 languages, plus unit names
│   ├── helpers.js             small shared helpers: t() for translations, formatting, messages
│   ├── data.js                lists (jobs, subjects...), the app's state, reading and saving data
│   ├── pages.js               switching pages, the header, the larger-text button
│   ├── pickup-times.js        15-minute pickup times, and claiming one safely
│   ├── impact.js              the home page numbers (counted on the dashboard)
│   ├── home.js                Home page
│   ├── food.js                Get food page and the bag
│   ├── map.js                 draws the map
│   ├── locations.js           Locations page
│   ├── tutoring.js            Tutoring request form
│   ├── recipes.js             AI recipes
│   ├── help-out.js            the Donate / Volunteer tabs
│   ├── donate.js              Donate form
│   ├── volunteer.js           Volunteer form
│   ├── hours.js               "Your service hours" log for volunteers
│   ├── my-requests.js         My requests page, restock alerts, the bell badge
│   ├── dashboard.js           student login, dashboard tabs, things the tabs share
│   ├── dashboard-food.js      Food tab
│   ├── dashboard-tutoring.js  Tutoring tab
│   ├── dashboard-stock.js     Stock tab
│   ├── dashboard-bulk.js      Stock tab: Bulk update from a pasted list
│   ├── dashboard-volunteers.js Volunteers tab, service hours approval
│   ├── dashboard-locations.js Locations tab, pickup time settings
│   ├── packing-slips.js       printable packing slips
│   ├── main.js                starts everything
│   ├── sample-data.js         the real pantries and sample stock (local demo only)
│   └── local-demo.js          pretend database so index.html runs on your computer
├── dist/uconnect.html         everything in one file, which is what's published on Claude
├── build.py                   rebuilds dist/uconnect.html
└── tests/browser-test.js      clicks through the whole site in a real browser
```

The scripts aren't modules. They load in order and share one global scope, so a file
can use anything from a file loaded before it. `main.js` loads last and calls every
`setup...()` function, then connects to the database.

## Run it on your computer

Open `index.html` in a browser. Because there's no Claude there, `local-demo.js` makes a
pretend database that saves in your browser, signs you in as the team lead (so the dashboard
works), and the AI parts show a notice instead.

To start over with fresh sample data, run `localStorage.removeItem('uconnect_demo_db_v2')` in
the browser console and reload.

## Change things

- **Text**: `js/translations.js`. Add the same key to all four languages.
- **Volunteer jobs, tutoring subjects, grades**: `JOBS`, `SUBJECTS` and `GRADES` at the top of
  `js/data.js`, plus a `job_...` or `subj_...` label in each language.
- **Colors**: the variables at the top of `css/styles.css`. The look is white pages, a black header
  and footer (`--bar`), and red for buttons and highlights (`--accent`). Dark mode swaps the values
  right below them.
- **Real locations and stock**: easiest from the dashboard's Locations and Stock tabs.

After changing files, run `python3 build.py`. That updates `dist/uconnect.html`, which is the
file to publish.

## Database

| Collection | Holds | Who can read | Who can write |
|---|---|---|---|
| `pantries/<id>` | pickup spots | everyone | students (Editors) |
| `stock/<id>` | items on the shelf | everyone | students |
| `orders/<userId>` | one person's food requests and donations | that person + students | that person (students update the status) |
| `tutoring/<userId>` | one person's tutoring requests | that person + students | that person (students set the tutor and status) |
| `volunteers/<userId>` | one person's sign-up | that person + students | that person |
| `alerts/<userId>` | items that person wants to hear about | that person + students | that person |
| `slots/<place>_<date>` | which pickup times are taken | signed-in families + students | signed-in families (claimed with a short lease) |
| `hours/<userId>` | one volunteer's logged service hours | that person + students | that person |
| `hourChecks/<userId>` | students' approvals of those hours | that person + students | students only, so nobody approves their own hours |
| `stats/impact` | the home page numbers | everyone | students (their dashboard keeps it current) |

`orders` and `tutoring` documents hold an `entries` map with one entry per request, so each
family only ever has one document.

## Test

```
npm install playwright
npx playwright install chromium
node tests/browser-test.js
```

The test opens the site in Chromium with a pretend `window.claude` and goes through every page
in all four languages, on desktop and phone sizes, in light and dark mode, plus the student
dashboard and what happens when the database or AI isn't available.
