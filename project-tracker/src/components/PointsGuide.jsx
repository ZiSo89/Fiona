import { categories, categoryGroups } from '../categories.js';

export default function PointsGuide() {
  return (
    <details className="points-guide">
      <summary>Πώς υπολογίζονται οι πόντοι</summary>
      <ul className="points-rules">
        <li>Κάθε ολοκληρωμένη εργασία παίρνει τους πόντους της κατηγορίας της.</li>
        <li><strong>Εγκατάσταση Οπτικής:</strong> 50 πόντοι με κλείσιμο «5.10 Visit OK, Delivery OK». Με άλλο κλείσιμο 50 μόνο αν το τελευταίο σχόλιο γράφει «έγινε όδευση», αλλιώς 15.</li>
        <li><strong>Καλωδίωση / νέα εγκατάσταση:</strong> 15 πόντοι, ή 50 αν το τελευταίο σχόλιο γράφει «έγινε εγκατάσταση» ή «έγινε όδευση».</li>
        <li><strong>Διπλό Συνεργείο:</strong> επιλέγεται μόνο χειροκίνητα.</li>
        <li>Οι εργασίες «Εκκρεμεί» δεν έχουν κατηγορία ακόμη και δεν μετράνε πόντους μέχρι να διορθωθούν.</li>
        <li>Μετά την έγκριση πληρωμής ο μήνας κλειδώνει και μόνο ο διαχειριστής μπορεί να κάνει αλλαγές.</li>
      </ul>
      {categoryGroups.map((group) => (
        <section className="points-guide-group" key={group.id}>
          <h3>{group.label}</h3>
          <dl>
            {categories.filter((category) => category.group === group.id && category.selectable !== false).map((category) => (
              <div className="points-guide-row" key={category.id}>
                <dt>{category.label}</dt>
                <dd>{category.points} πόντοι</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </details>
  );
}
