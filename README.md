# Fiona Mobile Operations PWA

This workspace contains a mobile-first PWA and a polling backend for Fiona ticket data.

## Structure

- `backend/` - Node.js + Express service that authenticates to Fiona, refreshes the token automatically, and polls `/orders/filter`.
- `frontend/` - React + Vite app that renders the mobile workflow, countdowns, priority badges, and installable PWA shell.

## Run locally

Install the dependencies from the project root:

```powershell
npm install --prefix backend
npm install --prefix frontend
## Οδηγός χρήσης

Η εφαρμογή είναι ένας πίνακας εργασιών Fiona για κινητό ή υπολογιστή. Δείχνει τα ανοιχτά εισιτήρια, την κατάστασή τους, τα στοιχεία εργασίας, τις προθεσμίες και τα στοιχεία επικοινωνίας που χρειάζονται στην καθημερινή εργασία.

1. Άνοιξε τη διεύθυνση της εφαρμογής και συνδέσου με τον κωδικό εφαρμογής που σου έχει δοθεί. Δεν χρειάζεσαι τον κωδικό Fiona.
2. Χρησιμοποίησε τα φίλτρα κατάστασης, την αναζήτηση και, στα ραντεβού, το φίλτρο συνεργείου για να βρεις εργασία.
3. Σε κάθε εισιτήριο μπορείς να δεις την προθεσμία, να καλέσεις τον πελάτη από το κουμπί τηλεφώνου ή να ανοίξεις τη διεύθυνση στον χάρτη. Πάτησε «Λεπτομέρειες εισιτηρίου» για πρόσθετες πληροφορίες.
4. Το κουμπί ανανέωσης ζητά άμεσα τα νεότερα δεδομένα. Η εφαρμογή ανανεώνει τη λίστα αυτόματα περίπου κάθε λεπτό.
5. Στο φίλτρο `COMPLETE` άνοιξε τα «Ολοκληρωμένα» ή τα «Στατιστικά». Επίλεξε μήνα, πάτησε μια εργασία για τα πλήρη στοιχεία και χρησιμοποίησε τα κουμπιά αντιγραφής όπου χρειάζεται.

Η ένδειξη `Live` σημαίνει ότι ο server έχει πρόσφατα δεδομένα από το Fiona. Οι ενδείξεις `Stale` ή `Offline / Cached` σημαίνουν ότι μπορείς να βλέπεις παλαιότερα αποθηκευμένα στοιχεία, όχι κατ' ανάγκη την τρέχουσα κατάσταση. Περίμενε επιτυχημένο συγχρονισμό ή επιβεβαίωσε την κατάσταση στο Fiona πριν ενεργήσεις. Τα στοιχεία περιλαμβάνουν προσωπικά δεδομένα· χρησιμοποίησε την εφαρμογή και την αντιγραφή τους μόνο για εγκεκριμένη εργασία.

## Τεχνικός οδηγός για developers

### Αρχιτεκτονική και ροή δεδομένων

- `frontend/`: React 18, Vite και PWA service worker. Η διεπαφή ζητά τα δεδομένα από το ίδιο origin μέσω `/api/*`. Το production build βρίσκεται στο `frontend/dist`.
- `backend/`: Node.js ES modules και Express. Ο Fiona client κάνει login, ανανεώνει το session token, ζητά το snapshot εργασιών και ο normalizer μετατρέπει την απάντηση σε UI contract. Το backend διατηρεί το τρέχον snapshot στη μνήμη και κάνει polling κάθε `POLL_INTERVAL_MS` (προεπιλογή 300000 ms). Η διεπαφή ξαναζητά το snapshot περίπου κάθε 60 δευτερόλεπτα.
- Ο Express server σερβίρει το `frontend/dist` και το API από την ίδια θύρα. Η προεπιλεγμένη θύρα είναι `4000`, αλλά το `PORT` στο `backend/.env` την αλλάζει.
- Η βάση SQLite είναι από προεπιλογή `backend/data/closed-tickets.sqlite`. Το `ticket_status_observations` καταγράφει παρατηρήσεις κατάστασης και το `pending_closures` αποθηκεύει μόνιμα tickets που έχουν παρατηρηθεί ανοιχτά. Αν ένα τέτοιο ticket ολοκληρωθεί ενώ ο backend είναι σταματημένος, ο finalizer το ελέγχει αυτόματα στη Fiona μετά την επανεκκίνηση και το αποθηκεύει με έγκυρη ώρα λήξης στον πίνακα `closed_tickets`. Σε εντελώς κενό snapshot απαιτούνται δύο διαδοχικά επιτυχημένα polls, ώστε να αποκλειστεί προσωρινό κενό response. Το CLI `sync:closed` χρειάζεται μόνο για ιστορική αναπλήρωση tickets που δεν είχαν καταγραφεί ως open πριν το shutdown.
- Για SLA ολοκλήρωσης συγκρίνεται το `workOrderFinishedOnPremiseTime` με το `workOrderSlaDate`. Το `deadline` είναι προθεσμία πρώτης κλήσης και συγκρίνεται με την πρώτη παρατήρηση `CALL LATER` ή `APPOINTMENT`, όχι με την ώρα ολοκλήρωσης.

### Τοπική εκτέλεση

Από το project root, εγκατάστησε τις εξαρτήσεις:

```powershell
npm install --prefix backend
npm install --prefix frontend
```

Αν δεν υπάρχει ήδη, δημιούργησε το `backend/.env` από το `backend/.env.example` και συμπλήρωσε τα Fiona credentials. Όρισε επίσης ένα δυνατό, ξεχωριστό `APP_PASSWORD` για τη σύνδεση στην εφαρμογή. Το `backend/.env` περιέχει μυστικά και δεν πρέπει να κοινοποιείται.

Για production-like τοπική εκτέλεση, κάνε build και ξεκίνα τον backend:

```powershell
npm run build:frontend
npm run start:backend
```

Άνοιξε `http://localhost:<PORT>` και συνδέσου με το `APP_PASSWORD`. Αν παραμείνει κενό, ο κώδικας χρησιμοποιεί το `FIONA_PASSWORD` ως fallback. Για ανάπτυξη, άνοιξε δύο terminals στο project root και τρέξε `npm run dev:backend` και `npm run dev:frontend` αντίστοιχα. Για tests: `npm --prefix backend test`.

### API και ασφάλεια

- `GET /api/tickets`: τρέχον snapshot και κατάσταση polling (`live`, `stale`, `error` ή `polling`).
- `GET /api/closed-tickets/stats?month=YYYY-MM`: μηνιαία λίστα και στατιστικά ολοκληρωμένων.
- `GET /api/closed-tickets/:orderId`: αναλυτικά στοιχεία επιλεγμένου ticket.
- `POST /api/login`, `POST /api/logout`, `GET /api/session`: σύνδεση και έλεγχος session. Τα προστατευμένα API απαιτούν signed `HttpOnly` session cookie.

Τα στοιχεία πελατών στη βάση περιλαμβάνουν τηλέφωνο και Α.Φ.Μ. Χρησιμοποίησε ισχυρό `APP_PASSWORD`, κράτα το SQLite και τα backups ιδιωτικά και βάλε επιπλέον έλεγχο πρόσβασης πριν εκθέσεις την εφαρμογή σε δημόσιο δίκτυο. Μην καταχωρείς πραγματικά secrets σε source control, screenshots ή chat.
```
### Βήματα για προσωρινό link
Create `backend/.env` from `backend/.env.example` if it does not exist, then set `FIONA_USERNAME`, `FIONA_PASSWORD`, and `FIONA_BASIC_AUTH`. Keep this file private. The backend logs in to Fiona and polls for tickets; `POLL_INTERVAL_MS` controls the polling interval (default: 300000 ms).
### Τεχνικές λεπτομέρειες Cloudflare Tunnel
Build the frontend and start the backend from the project root:

```powershell
npm run build:frontend
npm run start:backend
```

    npm run start:backend

## Share remotely with Cloudflare Tunnel (Windows)

This exposes the app running on this PC through an HTTPS link. The PC, backend, and tunnel must remain running, and the PC must not go to sleep. Quick Tunnels are temporary: the URL changes when restarted and is intended for demos, not a permanent service.

    If `winget` is not available, install `cloudflared` using Cloudflare's official Windows instructions, then open a new PowerShell window.
      service: http://localhost:4001
2. Open PowerShell in the project root and build the app:

	```powershell
	npm run build:frontend
	```

3. In that PowerShell window, start the backend:

   ```powershell
   npm run start:backend
   ```

	Leave this window open. Check that `http://localhost:4001` shows the login page if your `backend/.env` uses `PORT=4001`; otherwise use the configured port (default `4000`).
4. Install Cloudflare Tunnel once, using a second PowerShell window:

   ```powershell
   winget install --id Cloudflare.cloudflared --exact
   ```

	If `winget` is not available, install `cloudflared` using Cloudflare's official Windows instructions, then open a new PowerShell window.
5. Start a temporary tunnel, replacing `4001` with the backend port from `backend/.env`:

   ```powershell
   cloudflared tunnel --url http://localhost:4001
   ```

6. Copy the `https://....trycloudflare.com` URL printed in the tunnel window. Open it on your phone using mobile data to test it, then share it and the `APP_PASSWORD` with the intended viewer through a separate, trusted channel.
7. Keep both windows open and the PC awake during the demo. When finished, stop the tunnel with `Ctrl+C`; stop the backend with `Ctrl+C` in its window.

### Technical details

The browser connects over HTTPS to Cloudflare's edge. `cloudflared` makes an outbound tunnel from the PC to Cloudflare and forwards requests to the local Express server. Express serves the built SPA and handles `/api/*` on the same port, so no router port forwarding or separate frontend host is needed. The app's HTTP-only session cookie protects the API after login. `APP_PASSWORD` is the app login; keep it different from `FIONA_PASSWORD`.

From the project root, install dependencies (once), build the SPA, and start the server:

```powershell
npm install --prefix backend
npm install --prefix frontend
npm run build:frontend
npm run start:backend
```

In a second PowerShell window, install `cloudflared` if needed and run the Quick Tunnel. Use the same port as `PORT` in `backend/.env`:

```powershell
winget install --id Cloudflare.cloudflared --exact
cloudflared tunnel --url http://localhost:4001
```

Quick Tunnels do not require a Cloudflare account or configured domain, but issue a random hostname that is not reserved for reuse. Anyone who knows the URL can reach the login page; use a strong, unique `APP_PASSWORD` and share the URL/password only with intended viewers. This is suitable for a short demo, not production availability.

For a stable hostname, you need a domain managed by Cloudflare and a named Tunnel. Authenticate `cloudflared`, create a tunnel, and map a hostname:

```powershell
cloudflared tunnel login
cloudflared tunnel create fiona-demo
cloudflared tunnel route dns fiona-demo fiona.example.com
```

Replace `fiona.example.com` with a hostname in your Cloudflare-managed domain. The create command prints a tunnel UUID and creates a credentials JSON under `%USERPROFILE%\.cloudflared`. Create `%USERPROFILE%\.cloudflared\config.yml` with the UUID and actual credentials-file path:

```yaml
tunnel: YOUR-TUNNEL-UUID
credentials-file: C:/Users/YOUR-WINDOWS-USER/.cloudflared/YOUR-TUNNEL-UUID.json

ingress:
  - hostname: fiona.example.com
   service: http://localhost:4001
  - service: http_status:404
```

Then start the backend and run the named tunnel in another PowerShell window:

```powershell
cloudflared tunnel --config "$env:USERPROFILE\.cloudflared\config.yml" run fiona-demo
```

Use the same `APP_PASSWORD` login. Keep the tunnel credentials JSON and config file private. A named Tunnel keeps the hostname, but the PC and both processes still need to be online; configure `cloudflared` to start with Windows if you need it to run unattended.

The app displays customer contact details, including phone numbers and AFM. Only expose it to authorized people and follow your organization's privacy rules. Cloudflare Tunnel is not a substitute for access control; do not remove the app login.

## Sync closed tickets

Run the backend CLI to fetch Fiona workorders for an inclusive date range and store newly completed tickets in SQLite:

```powershell
cd backend
npm run sync:closed -- --from-date 01.08.2026 --to-date 30.09.2026
```

To re-fetch and correct records that are already in SQLite, pass `--refresh-existing`:

```powershell
npm run sync:closed -- --from-date 01.08.2026 --to-date 30.09.2026 --refresh-existing
```

The range is sent to Fiona one work date at a time. The default service group is `395`; pass `--service-group ID` one or more times to override it. The CLI skips `orderId` values already in the database before requesting their details. It stores only `orderStatus=COMPLETED` records with a valid `workOrderFinishedOnPremiseTime`; the existing JSON export is not imported.

By default, existing records are skipped. With `--refresh-existing`, matching records in the requested Fiona work-date range are re-fetched and updated only if Fiona returns a completed order with a valid completion time and all enrichment requests succeed. Refresh never inserts missing records; incomplete responses or request failures leave the existing row unchanged. The summary reports refreshed records separately from inserts.

The console shows the script path, date range, service groups, database path, progress for each day and each Fiona request stage, and a final count summary. If a request is slow, the last printed line shows which date/order and step is in progress. Customer names, phone numbers, and AFM are not printed.

By default, the database is `backend/data/closed-tickets.sqlite`. Set `CLOSED_TICKETS_DB_PATH` to use another location. The database contains customer data, including AFM, so keep it private and protect its backups. The database directory is ignored by Git. Fiona request delays default to 1-2.5 seconds and can be configured with `FIONA_REQUEST_MIN_DELAY_MS` and `FIONA_REQUEST_MAX_DELAY_MS`.

The work-order SLA (`workOrderSlaDate`) is the completion target and is compared to `workOrderFinishedOnPremiseTime`; a missing date is `unknown`. The order `deadline` is the first-call deadline (a 4-hour call window), so it is stored as `call_deadline` and is not judged against completion. While the backend polls, it records each open ticket's status and status time (table `ticket_status_observations`, one row per status change). The first move to `CALL LATER` or `APPOINTMENT` is compared with the call deadline; tickets never seen open have an `unknown` first-call result. Fiona's `slaSurpassed` is always `N`, so it is not stored. The CLI reports counts and failed stages without printing customer details.

## Notes

- The backend calls the project endpoint `/orders/filter`; its request uses `countryCode`, `limit`, `offset`, `sessionTokenID`, and `statuses`. Browser requests read the latest snapshot and concurrent refreshes share the same Fiona request.
- `GET /api/tickets` returns `{ status, data: { tickets, lastUpdatedAt, lastAttemptAt, totalTickets, error } }`. Status is `live`, `stale`, `error`, or `polling`.
- The normalized ticket contract includes `customer`, `order`, `priority`, `sla`, `communication`, `dispatch`, and `meta`. The dashboard uses these fields for customer/contact details, job status, priority, SLA countdown, call attempts, and urgency.
- `backend/.env` is ignored by Git. Keep credentials and Basic auth there, never in source files, screenshots, or chat. The backend obtains a session token at login and re-logs in once if `/orders/filter` returns `401`.
- If Fiona is temporarily unavailable, the backend keeps the last successful snapshot as `stale`; the frontend shows that data with a stale indicator. Demo data is used only when no live snapshot is available.
- The app is installable as a PWA via the manifest and service worker.
