# Fiona Mobile Operations PWA

Mobile-first εφαρμογή PWA για την καθημερινή διαχείριση εισιτηρίων Fiona. Περιλαμβάνει React/Vite frontend και backend Node.js/Express που κάνει polling στα δεδομένα της Fiona.

## Οδηγός χρήσης

Η εφαρμογή εμφανίζει τα ανοιχτά εισιτήρια, την κατάστασή τους, τα στοιχεία εργασίας, τις προθεσμίες και τα στοιχεία επικοινωνίας. Από τον επιλογέα καταστήματος μπορείς να δεις ένα κατάστημα ή την ενιαία λίστα όλων των ρυθμισμένων καταστημάτων.

1. Άνοιξε τη διεύθυνση της εφαρμογής και συνδέσου με τον κωδικό εφαρμογής που σου έχει δοθεί. Δεν χρειάζεσαι τον κωδικό Fiona.
2. Χρησιμοποίησε τα φίλτρα κατάστασης (Όλα, Ανοιχτά, Κλήση αργότερα, Ραντεβού), την αναζήτηση και, στα ραντεβού, το φίλτρο συνεργείου. Όταν η αναζήτηση είναι κρυμμένη αλλά ενεργή, εμφανίζεται ετικέτα «Αναζήτηση: …» που την καθαρίζει με ένα πάτημα.
3. Τα εισιτήρια που χρειάζονται άμεση ενέργεια (εκτός ορίου ολοκλήρωσης, ληγμένη προθεσμία κλήσης ή κλήση που λήγει σε λιγότερο από μία ώρα) εμφανίζονται πρώτα. Η κόκκινη μπάρα «Χρειάζονται άμεση ενέργεια» τα μετρά και με «Μόνο αυτά» κρύβει τα υπόλοιπα.
4. Κάθε κάρτα δείχνει σε μία γραμμή την «Επόμενη ενέργεια» (κλήση, ραντεβού ή ενέργεια Fiona) με αντίστροφη μέτρηση· τα δευτερόλεπτα εμφανίζονται μόνο στην τελευταία ώρα. Από την κάρτα καλείς τον πελάτη, ανοίγεις τον χάρτη ή την τεχνική υποστήριξη 153. Οι ετικέτες «Νέο» και «Άλλαξε» σημαδεύουν για 30 λεπτά εισιτήρια που εμφανίστηκαν ή άλλαξαν κατάσταση από τον προηγούμενο συγχρονισμό στη συσκευή.
5. Για ανανέωση πάτησε το κουμπί συγχρονισμού ή τράβηξε τη λίστα προς τα κάτω από την κορυφή. Η λίστα ανανεώνεται αυτόματα κάθε λεπτό.
6. Η κάτω μπάρα αλλάζει ανάμεσα σε «Ανοιχτά», «Ολοκληρωμένα» (λίστα και στατιστικά ανά μήνα) και «Πόντοι» (το tracker). Το κουμπί ήλιου/φεγγαριού αλλάζει θέμα· χωρίς επιλογή ακολουθείται το θέμα της συσκευής.

Η ένδειξη «Ενημερωμένο» σημαίνει ότι ο server έχει πρόσφατα δεδομένα από τη Fiona. Η ένδειξη «Παλιά δεδομένα» σημαίνει ότι μπορεί να βλέπεις παλαιότερα δεδομένα. Όταν ο server ή η Fiona δεν απαντούν ή δεν υπάρχει internet, εμφανίζεται μήνυμα με την ώρα των δεδομένων που βλέπεις και κουμπί «Δοκίμασε ξανά». Η offline cache εισιτηρίων αποθηκεύεται τοπικά στη συσκευή για έως 24 ώρες από τον τελευταίο επιτυχημένο συγχρονισμό και διαγράφεται στην αποσύνδεση ή όταν δεν είναι έγκυρη η συνεδρία. Όταν τα δεδομένα είναι παλαιότερα από δύο λεπτά, δίπλα στην ώρα εμφανίζεται η ηλικία τους (π.χ. «πριν 5 λεπ.»). Αν ο server δεν κάνει επιτυχημένο polling για δύο διαστήματα στη σειρά, το «Ενημερωμένο» γίνεται «Παλιά δεδομένα». Όταν κυκλοφορεί νέα έκδοση, εμφανίζεται μήνυμα «Υπάρχει νέα έκδοση» με κουμπί ανανέωσης. Αν ένα κατάστημα φτάσει το `FIONA_FILTER_LIMIT`, εμφανίζεται προειδοποίηση ότι μπορεί να λείπουν εισιτήρια. Περίμενε επιτυχημένο συγχρονισμό ή επιβεβαίωσε την κατάσταση στη Fiona πριν ενεργήσεις.

## Fiona Team Points

Το ξεχωριστό tracker στο `/tracker/` δημιουργεί προφίλ ανά συνεργείο και κατάστημα Fiona και εμφανίζει τις ολοκληρωμένες εργασίες σε μηνιαίο ημερολόγιο (η εβδομάδα ξεκινά Δευτέρα). Οι πόντοι αποδίδονται από τον κατάλογο κατηγοριών του tracker. Δεν προστίθενται χειροκίνητες εργασίες.

- Το συνεργείο επιλέγεται από λίστα ομαδοποιημένη ανά κατάστημα, με τον αριθμό εργασιών που περιμένουν κατηγορία. Οι ημέρες με εκκρεμότητα έχουν πορτοκαλί σήμανση και η γραμμή «Χωρίς αντιστοίχιση» της μηνιαίας σύνοψης μεταφέρει στην πρώτη τέτοια ημέρα.
- Το «Σύνδεση» είναι για τον κωδικό του συνεργείου και το «Διαχειριστής» για τον διαχειριστή. Τα παράθυρα κλείνουν με Esc.
- Στη διόρθωση, το «Ακύρωση» επαναφέρει την αποθηκευμένη κατηγορία και η αποθήκευση επιβεβαιώνεται με μήνυμα. Αν κλείσεις τη σελίδα με μη αποθηκευμένες αλλαγές, ο browser ζητά επιβεβαίωση.
- Ο διαχειριστής βλέπει πίνακα με όλα τα συνεργεία του μήνα (εργασίες, πόντοι, εκκρεμή, κατάσταση πληρωμής) και κατεβάζει CSV για Excel. Η έγκριση και το ξεκλείδωμα μήνα ζητούν επιβεβαίωση με τους πόντους του μήνα.
- Το «Πώς υπολογίζονται οι πόντοι» εξηγεί τους κανόνες και τον πίνακα κατηγοριών. Κάτω από το ημερολόγιο φαίνεται η ώρα του τελευταίου συγχρονισμού με τη Fiona.

Η εισαγωγή ξεκινά αυτόματα στην πρώτη εκκίνηση του backend και δεν εισάγει παλιότερο Fiona ιστορικό. Σαρώνει τις πρόσφατες ημερομηνίες εργασιών, αλλά εισάγει μόνο orders με `orderStatus=COMPLETED`, έγκυρο `workOrderFinishedOnPremiseTime`, συνεργείο και ώρα ολοκλήρωσης ίση ή μεταγενέστερη από το cutover. Οι επαναλαμβανόμενες σαρώσεις δεν διπλομετρούν ένα order· η ταυτότητα είναι `(store_id, order_id)`. Οι ήδη αποθηκευμένες εργασίες FTTH επαναξιολογούνται μία φορά με τα τρέχοντα στοιχεία της Fiona, χωρίς να αλλάζει η χειροκίνητα διορθωμένη κατηγορία τους.

Η αντιστοίχιση των πεδίων κατηγορίας της Fiona γίνεται με ακριβείς τιμές. Οι τύποι εργασίας της Fiona (π.χ. `FTTH Activation`, `On-Site Support NGA`) αντιστοιχίζονται αυτόματα στις κατηγορίες του tracker από τον ενσωματωμένο κατάλογο. Το προαιρετικό `PROJECT_TRACKER_CATEGORY_MAP` υπερισχύει του καταλόγου· αφήστε το κενό εκτός αν χρειάζεται εξαίρεση, π.χ. `{"Fiber install":"ftth_installation"}`. Εργασίες που δεν αντιστοιχίζονται εμφανίζονται ως εκκρεμείς χωρίς πόντους. Για FTTH, το `5.10 Visit OK, Delivery OK` αποδίδει 50 πόντους. Κάθε άλλο κλείσιμο (π.χ. `5.8.5`, `5.3`, `5.5`) αποδίδει 50 μόνο όταν το τελευταίο σχόλιο περιέχει «όδευση έγινε» ή «έγινε όδευση» (αγνοούνται τόνοι και κεφαλαία/πεζά), διαφορετικά αποδίδει 15. Η καλωδίωση ξεκινά από 15 πόντους και αποδίδει 50 μόνο όταν το τελευταίο σχόλιο περιέχει τη φράση «έγινε εγκατάσταση» ή «έγινε όδευση»· η μεμονωμένη αναφορά στις λέξεις «εγκατάσταση» ή «όδευση» δεν αρκεί. Αγνοούνται τόνοι και κεφαλαία/πεζά. Το «Διπλό Συνεργείο» αποδίδεται μόνο χειροκίνητα και δεν αντιστοιχίζεται αυτόματα από τη Fiona. Το συνεργείο μπορεί να διορθώσει την κατηγορία με τον κωδικό του· οι διορθώσεις κρατούνται σε audit log. Ο διαχειριστής συνδέεται με ξεχωριστό κωδικό, μπορεί να διορθώνει όλες τις ομάδες και εγκρίνει/κλειδώνει τον επιλεγμένο μήνα για πληρωμή. Μετά το κλείδωμα, οι τεχνικοί δεν μπορούν να αλλάξουν τις διορθώσεις· ο διαχειριστής μπορεί να συνεχίσει να επεξεργάζεται ή να ξεκλειδώσει τον μήνα. Τα tracker API responses δεν περιλαμβάνουν ονόματα, τηλέφωνα, διευθύνσεις ή Α.Φ.Μ. πελατών.

## Ανάπτυξη

### Ροή εργασίας Git

Το `main` είναι η σταθερή branch. Όλες οι αλλαγές περνούν από Pull Request· μην κάνεις απευθείας commit ή force push στο `main`.

1. Ξεκίνα από ενημερωμένο `main` και δημιούργησε branch για μία συγκεκριμένη εργασία:

   ```powershell
   git switch main
   git pull
   git switch -c feature/42-ticket-search
   ```

2. Χρησιμοποίησε ονόματα όπως `feature/<issue>-<περιγραφή>`, `fix/<issue>-<περιγραφή>` ή `hotfix/<περιγραφή>`. Αν δεν υπάρχει issue, παράλειψε τον αριθμό.
3. Κράτησε κάθε commit μικρό και σχετικό. Προτεινόμενα μηνύματα: `feat: add ticket search`, `fix: correct SLA calculation`, `docs: explain Git workflow`.
4. Στείλε το branch και άνοιξε Pull Request προς `main`:

   ```powershell
   git push -u origin feature/42-ticket-search
   ```

5. Περίμενε να περάσουν οι έλεγχοι CI, έλεγξε το diff και κάνε merge από το GitHub. Διέγραψε το προσωρινό branch μετά το merge.

Το CI εκτελεί ESLint, τα backend και frontend tests, τα builds του frontend και του tracker, τα MariaDB integration tests και τα tracker e2e tests σε Pull Requests προς `main`. Το `development` δεν χρειάζεται ως μόνιμο branch για την τρέχουσα ροή· πρόσθεσέ το μόνο αν χρειάζεσαι ξεχωριστή staging έκδοση ή ομαδοποιημένες releases.

Για προστασία του `main`, ενεργοποίησε στο GitHub ruleset ή branch protection: απαίτηση Pull Request, απαίτηση επιτυχίας των `Backend tests`, `Frontend build` και `Tracker build`, απαγόρευση force push και διαγραφής branch. Αυτές οι ρυθμίσεις γίνονται χειροκίνητα στο GitHub και δεν ενεργοποιούνται από το workflow.

### Δομή κώδικα

Το backend οργανώνεται σε επίπεδα με σαφή ευθύνη. Οι εξαρτήσεις πηγαίνουν προς μία κατεύθυνση: `routes` → `controllers` → `services` → `repositories`.

```text
backend/src/
  server.js        εκκίνηση: listen, polling και tracker sync
  app.js           σύνθεση Express app, middleware και routes
  config.js        ρυθμίσεις από το περιβάλλον
  routes/          ορισμός endpoints (/api/tickets, /api/closed-tickets, /api/tracker, στατικά apps)
  controllers/     χειρισμός request/response, επικύρωση παραμέτρων
  middleware/      auth και session έλεγχοι
  services/        επιχειρησιακή λογική (Fiona client, polling, SLA, στατιστικά, sync)
  repositories/    ασύγχρονη πρόσβαση σε SQLite ή MySQL/MariaDB
  cli/             συγχρονισμός και μεταφορά βάσης
```

```text
frontend/src/
  main.jsx, App.jsx, styles.css
  components/      κοινά UI στοιχεία (Icon)
  shared/          βοηθητικές συναρτήσεις χωρίς εξάρτηση από feature
  features/
    auth/            AuthGate
    tickets/         κάρτα εισιτηρίου, μοντέλο/SLA, formatters, τοπική αποθήκευση, demo δεδομένα (μόνο σε development)
    closed-tickets/  CompleteView (σύνθεση), ClosedTicketList, ClosedTicketStats, closedTicketFormat
```

```text
project-tracker/src/
  main.jsx, App.jsx, styles.css
  categories.js        κατάλογος κατηγοριών και πόντων της διεπαφής
  trackerModel.js      ημερομηνίες Αθήνας, drafts διορθώσεων, ετικέτες και API helper
  components/          CategoryPicker
```

Νέο endpoint: πρόσθεσε controller στο `controllers/`, route στο `routes/` και σύνδεσέ το στο `app.js`. Νέα λειτουργία διεπαφής: δημιούργησε φάκελο στο `frontend/src/features/`.

### Αρχιτεκτονική

- `frontend/`: React 18, Vite και PWA service worker στο `/app/`. Η ρίζα `/` ανακατευθύνει στο `/app/`, ενώ η διεπαφή ζητά δεδομένα από το ίδιο origin μέσω `/api/*`. Το production build βρίσκεται στο `frontend/dist`.
- `project-tracker/`: ξεχωριστό React/Vite PWA στο `/tracker/`, με δικό του manifest και service worker scope. Χρησιμοποιεί μόνο τα περιορισμένα `/api/tracker/*` endpoints. Το `/api/tracker/profiles` επιστρέφει και την ώρα του τελευταίου ολοκληρωμένου συγχρονισμού (`lastSyncAt`), το `/api/tracker/month` τις εκκρεμότητες ανά ημέρα (`pendingCount`) και το `/api/tracker/admin/overview?month=YYYY-MM`, μόνο για διαχειριστή, τα σύνολα όλων των συνεργείων με την κατάσταση πληρωμής.
- `backend/`: Node.js ES modules και Express. Κάθε ρυθμισμένο κατάστημα έχει ξεχωριστό Fiona client, session token και polling snapshot. Ο normalizer μετατρέπει κάθε απάντηση στο contract της διεπαφής και προσθέτει την ταυτότητα καταστήματος.
- Οι πίνακες `project_tracker_*` αποθηκεύουν order ID, κατάστημα, συνεργείο, κατηγορία, ώρα ολοκλήρωσης, πόντους/overrides, audit log και κλειδώματα πληρωμής ανά μήνα/συνεργείο. Χρησιμοποιούν την ίδια βάση με τα closed tickets.
- Ο Express server σερβίρει το frontend και το API από την ίδια θύρα. Η προεπιλεγμένη θύρα είναι `4000` και αλλάζει με το `PORT`. Επειδή όλα είναι στο ίδιο origin, δεν στέλνονται CORS headers. Το `helmet` προσθέτει security headers και Content-Security-Policy, που επιτρέπει μόνο πόρους του ίδιου origin και τα Google Fonts του tracker.
- Σε `SIGTERM`/`SIGINT` ο server σταματά το polling και το tracker sync, κλείνει τις συνδέσεις HTTP, περιμένει έως 10 δευτερόλεπτα να ολοκληρωθούν οι τρέχουσες εργασίες και κλείνει τη βάση.
- Το `/api/health` είναι δημόσιο και επιστρέφει την κατάσταση κάθε καταστήματος και του τελευταίου tracker sync. Επιστρέφει HTTP 503 όταν κάποιο κατάστημα είναι σε κατάσταση `error`, ώστε να μπορεί να χρησιμοποιηθεί από εξωτερικό monitoring.
- Το backend κρατά το πιο πρόσφατο snapshot στη μνήμη, χωριστά ανά κατάστημα. Το `POLL_INTERVAL_MS` ρυθμίζει το διάστημα polling: το `.env.example` ορίζει `300000` ms, ενώ ο fallback του κώδικα είναι `120000` ms. Η διεπαφή ζητά νέο snapshot περίπου κάθε 60 δευτερόλεπτα. Το `/api/tickets` περιμένει μόνο το πρώτο poll μετά την εκκίνηση και για έως 10 δευτερόλεπτα· στη συνέχεια επιστρέφει αμέσως το τελευταίο snapshot, ενώ η ανανέωση συνεχίζεται στο παρασκήνιο. Όταν η Fiona απορρίψει ληγμένο session με 401 ή 403, ο client συνδέεται ξανά μία φορά.
- Το tracker sync θυμάται στη μνήμη τα orders που παρέλειψε, ώστε να μην τα ζητά ξανά σε κάθε κύκλο: τα μη ολοκληρωμένα για 1 ώρα, όσα ανήκουν σε άλλο κατάστημα για 24 ώρες και όσα έκλεισαν πριν από το cutover για 14 ημέρες.
- Η SQLite βάση βρίσκεται από προεπιλογή στο `backend/data/closed-tickets.sqlite`. Οι πίνακες ολοκληρωμένων, εκκρεμών και παρατηρήσεων περιλαμβάνουν `store_id`, ώστε όμοια Fiona order IDs από διαφορετικά καταστήματα να μην συγκρούονται. Πριν από την πρώτη migration δημιουργείται δίπλα στη βάση το `closed-tickets.sqlite.pre-store-migration.bak` και οι παλιές εγγραφές μεταφέρονται στο `alexandroupoli`.
- Το `DB_CLIENT=sqlite` είναι η προεπιλογή. Με `DB_CLIENT=mysql` χρησιμοποιείται MySQL/MariaDB μέσω `mysql2`, χωρίς native compilation. Η SQLite εξάρτηση `better-sqlite3` είναι προαιρετική για την εγκατάσταση, αλλά απαιτείται για SQLite λειτουργία, tests και τοπικό export. Αποτυχία σύνδεσης MySQL δεν προκαλεί fallback σε SQLite. Όλα τα repository factories και οι λειτουργίες τους επιστρέφουν promises και πρέπει να γίνονται `await`.
- Σε εντελώς κενό snapshot απαιτούνται δύο διαδοχικά επιτυχημένα polls, ώστε να αποκλειστεί προσωρινά κενή απάντηση. Το CLI `sync:closed` προορίζεται για ιστορική αναπλήρωση tickets που δεν είχαν καταγραφεί ως ανοιχτά πριν από shutdown.
- Για SLA ολοκλήρωσης συγκρίνεται το `workOrderFinishedOnPremiseTime` με το `workOrderSlaDate`. Το `deadline` είναι προθεσμία πρώτης κλήσης και συγκρίνεται με την πρώτη παρατήρηση `CALL LATER` ή `APPOINTMENT`, όχι με την ώρα ολοκλήρωσης.

### Τοπική εκτέλεση

Από το project root εγκατέστησε τις εξαρτήσεις:

```powershell
npm install --prefix backend
npm install --prefix frontend
npm install --prefix project-tracker
```

Δημιούργησε το `backend/.env` από το `backend/.env.example` και συμπλήρωσε το `FIONA_USERNAME` για Αλεξανδρούπολη, τα `FIONA_KOMOTINI_USERNAME` και `FIONA_ORESTIADA_USERNAME` για τα άλλα καταστήματα, καθώς και το κοινό `FIONA_PASSWORD`. Για διαφορετικό Basic Auth ανά λογαριασμό, χρησιμοποίησε τα αντίστοιχα `FIONA_<STORE>_BASIC_AUTH`; αλλιώς χρησιμοποιείται το κοινό `FIONA_BASIC_AUTH`. Επιβεβαίωσε με τη Fiona ποια ρύθμιση ισχύει για τους λογαριασμούς σου. Όρισε ξεχωριστό, ισχυρό `APP_PASSWORD`. Για διορθώσεις στο tracker, όρισε και το `PROJECT_TRACKER_SESSION_SECRET` και το `PROJECT_TRACKER_TEAM_PASSWORDS` ως JSON αντικείμενο με ένα κλειδί ανά συνεργείο, της μορφής `storeId|ακριβές teamName`, π.χ. `{"alexandroupoli|Team A":"…","komotini|Team B":"…"}`. Αν το JSON δεν είναι έγκυρο, ο server γράφει προειδοποίηση και το αγνοεί. Αν λείπει το `PROJECT_TRACKER_SESSION_SECRET`, χρησιμοποιείται το `APP_PASSWORD` και ο server γράφει προειδοποίηση στην εκκίνηση. Για τον διαχειριστή του tracker, όρισε ξεχωριστό, ισχυρό `PROJECT_TRACKER_ADMIN_PASSWORD`. Το `.env` περιέχει μυστικά και δεν πρέπει να κοινοποιείται.

Για production-like εκτέλεση, κάνε build και ξεκίνησε τον backend:

```powershell
npm run build:frontend
npm run build:tracker
npm run start:backend
```

Άνοιξε `http://localhost:<PORT>` για τη Fiona εφαρμογή ή `http://localhost:<PORT>/tracker/` για το tracker. Οι πόντοι αρχίζουν από την πρώτη ενεργοποίηση, όχι από παλαιότερες εργασίες.

Για ανάπτυξη, άνοιξε δύο terminals στο project root και εκτέλεσε:

```powershell
npm run dev:backend
npm run dev:frontend
npm run dev:tracker
```

Το κύριο app είναι στο `http://localhost:5173/app/`. Το tracker development server είναι στο `http://localhost:5174/tracker/` και κάνει proxy τα API requests στο `http://localhost:4000` από προεπιλογή. Και τα δύο development servers κάνουν proxy στο `http://localhost:4000`. Αν ο backend χρησιμοποιεί άλλη θύρα, όρισε `BACKEND_URL` πριν ξεκινήσεις το `dev:frontend` ή το `dev:tracker`. Τα demo εισιτήρια της Αλεξανδρούπολης εμφανίζονται μόνο στο development server όταν ο backend δεν είναι διαθέσιμος· το production build δεν τα περιέχει.

Για τα tests του backend:

```powershell
npm --prefix backend test
```

Για τα frontend tests και τον έλεγχο κώδικα (ESLint):

```powershell
npm --prefix frontend test
npm --prefix backend run lint
npm --prefix frontend run lint
npm --prefix project-tracker run lint
```

### Deployment στο Plesk με MariaDB

Η διαδρομή αυτή προορίζεται για Linux Plesk με Node.js 22 και MariaDB 10.11. Η βάση παραμένει στο hosting, όχι στο PC. Τα ίδια queries υποστηρίζουν MySQL 8, αλλά ο έλεγχος integration γίνεται με MariaDB 10.11.

1. Στο **Databases → Add Database** δημιούργησε άδεια βάση για το subdomain και ξεχωριστό χρήστη με πρόσβαση μόνο σε αυτήν, από τον τοπικό server. Κράτησε τα τελικά ονόματα βάσης/χρήστη που δίνει το Plesk, μαζί με τυχόν prefix. Μην ενεργοποιήσεις δημόσια πρόσβαση στη βάση.
2. Ανέβασε το repository με **Git → Deploy** σε ιδιωτικό application directory, π.χ. `fiona`. Μην ανεβάσεις `node_modules` από Windows.
3. Στο **Node.js** όρισε:
   - **Application Root:** ο φάκελος `fiona` με το κεντρικό `package.json`.
   - **Document Root:** κενός υποφάκελος `fiona/public`, τον οποίο δημιουργείς από File Manager. Όχι ο φάκελος του backend ή η ρίζα του repository.
   - **Application Startup File:** `plesk.cjs`. Ο CommonJS loader εισάγει ασύγχρονα τον ES-module server για Passenger.
   - **Application Mode:** `Production`, **Node.js Version:** 22.
4. Στα **Custom environment variables** βάλε τα υφιστάμενα Fiona/app/tracker secrets και:

   ```dotenv
   DB_CLIENT=mysql
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_NAME=actual_plesk_database_name
   DB_USER=actual_plesk_database_user
   DB_PASSWORD=your_private_database_password
   ```

   Χρησιμοποίησε το host που επιβεβαιώνει ο πάροχος αν διαφέρει. Το `CLOSED_TICKETS_DB_PATH` αγνοείται στη MySQL λειτουργία. Μην ορίσεις χειροκίνητα `PORT` στο Plesk. Για εξωτερικό database server, το `DB_SSL_CA` δείχνει σε ιδιωτικό αρχείο CA ώστε να γίνεται επαλήθευση TLS· μην απενεργοποιείς την επαλήθευση πιστοποιητικού.
5. Στο **Run script** εκτέλεσε `build:plesk`. Το script εγκαθιστά το backend με `--omit=optional`, χωρίς καν να επιχειρεί εγκατάσταση `better-sqlite3`, και χτίζει τα δύο frontends με τα devDependencies τους. Μην χρησιμοποιήσεις `build:render` σε server που δεν μπορεί να εγκαταστήσει native SQLite modules.
6. **Αν μεταφέρεις παλιά δεδομένα, μην εκκινήσεις την εφαρμογή ακόμη:** ολοκλήρωσε πρώτα την επόμενη ενότητα. Ακόμη και η πρώτη εκκίνηση γράφει ρυθμίσεις/cutover και η εισαγωγή απαιτεί άδειους πίνακες.
7. Ενεργοποίησε HTTPS/Let's Encrypt για το subdomain και μετά **Enable Node.js / Restart App**. Έλεγξε `/app/`, `/tracker/` και `/api/health`. Οι πίνακες δημιουργούνται αυτόματα με InnoDB, `utf8mb4_bin` και schema version 1. Ο χρήστης βάσης χρειάζεται DDL δικαιώματα μέσα στη συγκεκριμένη βάση για την αρχική εγκατάσταση και μελλοντικές migrations.

Οι πολυβηματικές εγγραφές χρησιμοποιούν transactions στην ίδια σύνδεση του pool. Ένα κοινό InnoDB lock σειριοποιεί διορθώσεις, κλειδώματα μηνών και εισαγωγές μεταξύ διεργασιών. Οι ταυτότητες καταστήματος/order και τα ακριβή ονόματα συνεργείων παραμένουν διακριτά ως προς πεζά/κεφαλαία. Οι ISO ημερομηνίες παραμένουν strings ώστε να μην αλλάζουν οι κανόνες του ημερολογίου Αθήνας.

Για το polling ζήτησε από τον πάροχο **ένα συνεχώς ενεργό instance**, χωρίς idle shutdown και με αυτόματη εκκίνηση μετά από reboot. Η μεταφορά σε MariaDB δεν καταργεί αυτούς τους περιορισμούς Passenger/shared hosting. Ρύθμισε και έλεγξε ξεχωριστά τα backups της βάσης στο Plesk.

### Μεταφορά υπάρχουσας SQLite σε MariaDB

Η μεταφορά περιλαμβάνει και τους 10 πίνακες: ιστορικό κλειστών tickets, εκκρεμή closures, παρατηρήσεις, monitoring, tracker settings/cutover, εργασίες, χειροκίνητες διορθώσεις/πόντους, κλειδώματα, audit και cached details. Δεν μεταφέρει κωδικούς, sessions ή τα προσωρινά polling snapshots της μνήμης.

1. Σταμάτησε την παλιά εφαρμογή ώστε να μην προκύψουν νεότερες εγγραφές μετά το export. Κράτησε ασφαλές SQLite backup με εργαλείο SQLite ή αντίγραφο με την εφαρμογή κλειστή και όλες τις συνδέσεις τερματισμένες. Μην αντιγράφεις μόνο το `.sqlite` ενώ τρέχει η εφαρμογή με WAL.
2. Στο PC όπου λειτουργεί η SQLite, με τις backend εξαρτήσεις εγκατεστημένες, εκτέλεσε από το project root:

   ```powershell
   npm run db:export -- --sqlite ".\backend\data\closed-tickets.sqlite" --file "$env:USERPROFILE\fiona-migration.json"
   ```

   Το export είναι read-only, χρησιμοποιεί συνεπές snapshot και δεν αντικαθιστά υπάρχον αρχείο export. Αν ανιχνευτεί παλιό schema, αναβάθμισε πρώτα την τοπική SQLite με τον τρέχοντα κώδικα και επανάλαβε το export.
3. Ανέβασε το JSON μέσω ιδιωτικού καναλιού σε φάκελο **εκτός Document Root** στο hosting. Περιέχει προσωπικά δεδομένα πελατών: ποτέ στο Git, σε δημόσιο URL ή σε screenshot.
4. Με το app του Plesk σταματημένο, εκτέλεσε από το application root με SSH ή μέσω **Run script**, περνώντας τα ίδια `DB_*` environment variables και τη σωστή Node του Plesk:

   ```text
   npm run db:import -- --file /absolute/private/path/fiona-migration.json
   ```

   Στο Plesk Run script επίλεξε `db:import` με τα arguments `-- --file /absolute/private/path/fiona-migration.json`. Αν ο πάροχος δεν επιτρέπει arguments ή δεν περνά τα Custom environment variables στην εντολή, ζήτησε να την εκτελέσει ιδιωτικά· μη γράψεις credentials σε scripts του repository.
5. Η εισαγωγή ελέγχει format/checksum και απαιτεί **όλους τους πίνακες εφαρμογής άδειους**. Διατηρεί IDs, cutover, audit και locks, και ελέγχει κάθε τιμή που διαβάζεται ξανά πριν κάνει commit. Σε αποτυχία γίνεται rollback όλων των εγγραφών. Μια δεύτερη εισαγωγή απορρίπτεται, δεν κάνει merge ή overwrite.
6. Έλεγξε τις μετρήσεις ανά πίνακα, ξεκίνησε το app και επιβεβαίωσε πόντους, κλειδώματα και ιστορικό. Οι κανονικοί κανόνες category/scoring migration συνεχίζουν να εφαρμόζονται στην εκκίνηση/στο sync όπως πριν. Κράτησε το αρχικό SQLite backup, αφαίρεσε το προσωρινό export από το hosting όταν δεν χρειάζεται και μην ξανανοίξεις την παλιά εγκατάσταση για εγγραφές.

Για rollback σταμάτησε πρώτα τη νέα εφαρμογή και επίστρεψε στην παλιά εγκατάσταση/SQLite backup. Δεν υπάρχει αντίστροφο sync MariaDB → SQLite· εγγραφές που έγιναν μετά τη μετάβαση δεν επιστρέφουν αυτόματα.

### Integration tests MariaDB

Τα κανονικά backend tests χρησιμοποιούν SQLite. Για τα integration tests όρισε `RUN_MYSQL_TESTS=1`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` και εκτέλεσε `npm run test:mysql --prefix backend`. Χρησιμοποίησε **μόνο απομονωμένο test server** και test χρήστη με δικαίωμα δημιουργίας/διαγραφής βάσης και triggers: το suite δημιουργεί δική του τυχαία βάση `fiona_test_*` και την αφαιρεί στο τέλος. Μην χρησιμοποιήσεις τα credentials του production hosting. Το CI εκτελεί το suite σε MariaDB 10.11.

### Deployment στο Render

Δημιούργησε Node.js Web Service με κενό **Root Directory** (ρίζα του repository) και τις παρακάτω εντολές:

- **Build Command:** `npm run build:render`
- **Start Command:** `npm run start:backend`

Το `build:render` εγκαθιστά τις κλειδωμένες εξαρτήσεις του backend, του frontend και του tracker με `npm ci` και έπειτα χτίζει και τις δύο διεπαφές. Για τα δύο Vite apps περιλαμβάνει ρητά τα `devDependencies`, ακόμη και με `NODE_ENV=production`. Το σκέτο `npm install` στη ρίζα δεν εγκαθιστά τις εξαρτήσεις των υποφακέλων· αν εγκατασταθεί μόνο το backend, το build αποτυγχάνει με `vite: not found`.

Αντικατάστησε το παλιό Build Command στις ρυθμίσεις του υπάρχοντος Render service και κάνε νέο deploy αφού ανέβουν οι αλλαγές. Ρύθμισε τα μυστικά του backend ως environment variables στο Render, όχι ως αρχεία στο repository. Για μόνιμη αποθήκευση της SQLite, όρισε το `CLOSED_TICKETS_DB_PATH` σε διαδρομή πάνω σε persistent disk.

Δεν χρειάζεται ξεχωριστό Render Static Site: το ίδιο Web Service σερβίρει `/app/`, `/tracker/` και `/api/*`. Έτσι οι διεπαφές και τα session cookies παραμένουν στο ίδιο origin.

### Εγκατάσταση PWA σε Android

1. Άνοιξε στο Chrome τη δημόσια HTTPS διεύθυνση του service με `/app/` στο τέλος.
2. Από το μενού ⋮ επίλεξε «Προσθήκη στην αρχική οθόνη» και, αν εμφανιστεί, «Εγκατάσταση εφαρμογής».
3. Για ξεχωριστή εγκατάσταση του Team Points, επανάλαβε από το `/tracker/`. Τα δύο apps έχουν διαφορετικό manifest και service worker scope.

Το HTTPS domain `onrender.com` αρκεί για εγκατάσταση· δεν απαιτείται αγορά domain. Η εγκατάσταση δεν αντικαθιστά τον server: για νεότερα δεδομένα και συγχρονισμό χρειάζεται σύνδεση στο διαδίκτυο.

### Προαιρετικό custom domain

Αν έχεις δικό σου domain, πρόσθεσε το επιθυμητό subdomain (π.χ. `fiona.example.gr`) στο **Settings → Custom Domains** του ίδιου Render Web Service. Ρύθμισε τα DNS στον πάροχό σου σύμφωνα με τις εγγραφές που εμφανίζει το Render και πάτησε **Verify**. Το Render εκδίδει και ανανεώνει το πιστοποιητικό HTTPS. Δες τις [επίσημες οδηγίες custom domains](https://render.com/docs/custom-domains).

Κάνε την εγκατάσταση PWA από το domain που θα χρησιμοποιείς μόνιμα. Αν αλλάξεις domain αργότερα, χρειάζεται νέα σύνδεση και εγκατάσταση από τη νέα διεύθυνση· τα session cookies και η τοπική cache δεν μεταφέρονται μεταξύ origins.

## Πρόσβαση μέσω Cloudflare Tunnel

Το Tunnel εκθέτει την εφαρμογή του υπολογιστή μέσω HTTPS. Ο υπολογιστής, ο backend και το Tunnel πρέπει να παραμένουν σε λειτουργία και ο υπολογιστής να μην μπει σε αναστολή. Τα Quick Tunnels είναι προσωρινά και η διεύθυνση αλλάζει σε κάθε εκκίνηση· είναι κατάλληλα για demo, όχι για μόνιμη υπηρεσία.

### Προσωρινό Quick Tunnel

1. Ρύθμισε το `backend/.env`, κάνε build και ξεκίνησε τον backend από το project root:

   ```powershell
   npm run build:frontend
   npm run build:tracker
   npm run start:backend
   ```

2. Επιβεβαίωσε ότι το `/` ανακατευθύνει στο κύριο app (`/app/`) και ότι το tracker ανοίγει στο `/tracker/`, για παράδειγμα στο `http://localhost:4001` αν έχεις ορίσει `PORT=4001`.
3. Σε δεύτερο PowerShell, εγκατάστησε το `cloudflared` αν δεν υπάρχει ήδη:

   ```powershell
   winget install --id Cloudflare.cloudflared --exact
   ```

   Αν το `winget` δεν είναι διαθέσιμο, ακολούθησε τις επίσημες οδηγίες εγκατάστασης της Cloudflare για Windows.
4. Ξεκίνα το Tunnel χρησιμοποιώντας τη θύρα του backend:

   ```powershell
   cloudflared tunnel --url http://localhost:4001
   ```

5. Άνοιξε στο κινητό τη διεύθυνση `https://....trycloudflare.com/app/` για το κύριο app ή `https://....trycloudflare.com/tracker/` για το tracker. Το σκέτο domain ανακατευθύνει στο `/app/`. Μοίρασε τη διεύθυνση και το `APP_PASSWORD` μόνο με τους προβλεπόμενους χρήστες και μέσω χωριστού, έμπιστου καναλιού.
6. Άφησε ανοιχτά τα δύο terminals και τον υπολογιστή ενεργό. Όταν τελειώσεις, σταμάτησε το Tunnel και τον backend με `Ctrl+C` στα αντίστοιχα terminals.

## API

- `GET /api/stores`: ονόματα και ρυθμισμένη κατάσταση καταστημάτων.
- `GET /api/tickets?store=STORE_ID`: snapshot καταστήματος. `store=all` επιστρέφει ενιαία λίστα με `storeId` σε κάθε ticket.
- `GET /api/closed-tickets/stats?month=YYYY-MM&store=STORE_ID`: μηνιαία λίστα και στατιστικά· `store=all` συγκεντρώνει όλα τα καταστήματα.
- `GET /api/closed-tickets/:orderId?store=STORE_ID`: αναλυτικά στοιχεία ticket. Το store είναι απαραίτητο για να επιλυθούν πιθανές επικαλύψεις IDs.
- `POST /api/login`, `POST /api/logout`, `GET /api/session`: σύνδεση και έλεγχος session. Τα προστατευμένα API απαιτούν signed `HttpOnly` session cookie.

Το `GET /api/tickets` επιστρέφει `{ status, data: { tickets, lastUpdatedAt, lastAttemptAt, totalTickets, error } }`. Η κανονικοποιημένη εγγραφή ticket περιλαμβάνει `customer`, `order`, `priority`, `sla`, `communication`, `dispatch` και `meta`.

## Συγχρονισμός ολοκληρωμένων tickets

Το backend CLI ανακτά workorders από τη Fiona για συμπεριληπτικό εύρος ημερομηνιών και αποθηκεύει νέα ολοκληρωμένα tickets στη SQLite:

```powershell
cd backend
npm run sync:closed -- --from-date 01.08.2026 --to-date 30.09.2026
```

Πρόσθεσε `--store komotini` ή `--store orestiada` για ιστορικό συγχρονισμό του αντίστοιχου λογαριασμού. Χωρίς `--store`, χρησιμοποιείται η Αλεξανδρούπολη. Η Fiona επιστρέφει τα ίδια workorders σε όλους τους λογαριασμούς (κοινό group `395`), γι' αυτό το CLI κρατά μόνο orders όπου το `serviceGroup` των λεπτομερειών περιέχει τη λέξη του καταστήματος (`ALEXANDROUPOL`, `KOMOTINI`, `ORESTIADA`). Η λέξη αλλάζει με `FIONA_<STORE>_SERVICE_GROUP_MATCH`. Η σύνοψη αναφέρει τα orders άλλων καταστημάτων στο `otherStore`.

Για εξαγωγή των εγγραφών του εύρους σε JSON, πρόσθεσε `--export-json` με τη διαδρομή του αρχείου:

```powershell
npm run sync:closed -- --from-date 01.08.2026 --to-date 30.09.2026 --store komotini --export-json exports/komotini-tickets.json
```

Το αρχείο περιλαμβάνει τα δεδομένα που έχουν αποθηκευτεί στη βάση για το επιλεγμένο κατάστημα και το συμπεριληπτικό εύρος ημερομηνιών, καθώς και μεταδεδομένα καταστήματος, ημερομηνιών και πλήθους εγγραφών. Αν το αρχείο υπάρχει ήδη, αντικαθίσταται. Περιέχει προσωπικά δεδομένα πελατών· φύλαξέ το και κοινοποίησέ το με την ίδια προσοχή όπως τη βάση SQLite.

Για επανάκτηση και διόρθωση υπαρχουσών εγγραφών:

```powershell
npm run sync:closed -- --from-date 01.08.2026 --to-date 30.09.2026 --refresh-existing
```

Το εύρος ζητείται από τη Fiona μία εργάσιμη ημέρα κάθε φορά. Η προεπιλεγμένη ομάδα υπηρεσίας είναι `395`. Για αλλαγή, πρόσθεσε `--service-group ID` μία ή περισσότερες φορές. Το CLI παραλείπει `orderId` που υπάρχουν ήδη στη βάση και αποθηκεύει μόνο εγγραφές με `orderStatus=COMPLETED` και έγκυρο `workOrderFinishedOnPremiseTime`. Δεν εισάγει το υπάρχον JSON export.

Από προεπιλογή, οι υπάρχουσες εγγραφές παραλείπονται. Με `--refresh-existing`, ενημερώνονται μόνο εγγραφές του εύρους για τις οποίες η Fiona επιστρέφει ολοκληρωμένο order, έγκυρη ώρα ολοκλήρωσης και επιτυχημένα όλα τα enrichment requests. Η επιλογή δεν εισάγει εγγραφές που λείπουν· αποτυχημένες ή ελλιπείς απαντήσεις αφήνουν την υπάρχουσα εγγραφή αμετάβλητη. Η σύνοψη αναφέρει χωριστά τις ενημερώσεις και τις εισαγωγές.

Το CLI εμφανίζει τη διαδρομή του script, το εύρος ημερομηνιών, τις ομάδες υπηρεσίας, τη βάση, την πρόοδο ανά ημέρα και στάδιο αιτήματος, καθώς και την τελική σύνοψη. Δεν εμφανίζει ονόματα πελατών, τηλέφωνα ή Α.Φ.Μ. Τα delays των Fiona requests είναι από προεπιλογή 1–2,5 δευτερόλεπτα και ρυθμίζονται με `FIONA_REQUEST_MIN_DELAY_MS` και `FIONA_REQUEST_MAX_DELAY_MS`.

Η βάση βρίσκεται από προεπιλογή στο `backend/data/closed-tickets.sqlite`. Για άλλη τοποθεσία όρισε `CLOSED_TICKETS_DB_PATH`.

## SLA και συμπεριφορά δεδομένων

Για αναλυτικούς κανόνες, τύπους υπολογισμού και συγκεντρωτικά ευρήματα από τα συγχρονισμένα δεδομένα, δες το [SLA.md](./SLA.md).

- Το `workOrderSlaDate` είναι ο στόχος ολοκλήρωσης και συγκρίνεται με το `workOrderFinishedOnPremiseTime`. Αν λείπει ημερομηνία, το αποτέλεσμα είναι `unknown`.
- Το order `deadline` είναι η προθεσμία πρώτης κλήσης (παράθυρο 4 ωρών), αποθηκεύεται ως `call_deadline` και δεν αξιολογείται έναντι της ολοκλήρωσης.
- Κατά το polling, αποθηκεύονται οι καταστάσεις ανοιχτού ticket στον `ticket_status_observations`. Η πρώτη καταγεγραμμένη κατάσταση `CALL LATER` ή `APPOINTMENT` συγκρίνεται με το call deadline. Αν λείπει η κατάσταση ή η προθεσμία, το αποτέλεσμα πρώτης κλήσης είναι `unknown`.
- Η Fiona επιστρέφει πάντα `N` στο `slaSurpassed`, επομένως αυτό το πεδίο δεν αποθηκεύεται.
- Αν η Fiona δεν είναι διαθέσιμη, ο backend διατηρεί το τελευταίο επιτυχημένο snapshot ως `stale`. Demo data χρησιμοποιούνται μόνο όταν δεν υπάρχει διαθέσιμο live snapshot. Ταυτόχρονες αιτήσεις refresh μοιράζονται το ίδιο Fiona request.

## Ασφάλεια και ιδιωτικότητα

Το `backend/.env` αγνοείται από το Git. Μην αποθηκεύεις πραγματικά secrets σε source control, screenshots ή chat. Χρησιμοποίησε ισχυρό, μοναδικό `APP_PASSWORD` και κράτησε ιδιωτικά τη βάση SQLite και τα backups: περιέχουν προσωπικά δεδομένα πελατών, όπως τηλέφωνα και Α.Φ.Μ. Πριν από αλλαγή schema, πάρε backup της βάσης. Αν credentials κοινοποιηθούν κατά λάθος, άλλαξέ τα. Πριν εκθέσεις την εφαρμογή σε δημόσιο δίκτυο, περιόρισε την πρόσβαση στους εξουσιοδοτημένους χρήστες. Το Cloudflare Tunnel δεν αντικαθιστά το login της εφαρμογής.

Η εφαρμογή εγκαθίσταται ως PWA μέσω του manifest και του service worker. Η cache εισιτηρίων αποθηκεύεται χωριστά στο `localStorage` της συσκευής για έως 24 ώρες και καθαρίζεται στην αποσύνδεση ή όταν λήξει/δεν μπορεί να επιβεβαιωθεί η συνεδρία. Χρησιμοποίησε την «Αποσύνδεση» σε κοινόχρηστες συσκευές.