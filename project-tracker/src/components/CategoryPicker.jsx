import { categoryGroups, categories } from '../categories.js';

export default function CategoryPicker({ value, current, pointsValue, onChange, onPointsChange }) {
  return (
    <div className="category-picker">
      {categoryGroups.map((group) => {
        const options = categories.filter((category) => category.group === group.id
          && (category.selectable !== false || category.id === current));
        if (!options.length) return null;
        return (
          <section className={`category-group group-${group.id}`} key={group.id}>
            <h4>{group.label}</h4>
            <div className="category-options">
              {options.map(({ id, label, source, points, Icon }) => (
                <div className="category-option-wrap" key={id}>
                  <button
                    type="button"
                    className={`category-option${value === id ? ' is-selected' : ''}`}
                    aria-pressed={value === id}
                    onClick={() => onChange(id)}
                  >
                    <Icon size={16} />
                    <span className="category-option-text">
                      <strong>{label}</strong>
                      <small>{source}</small>
                    </span>
                    <span className="category-option-points">{points}</span>
                  </button>
                  {value === id && ['ftth_installation', 'cabling_repair'].includes(id) && (
                    <div className="category-point-choices" role="group" aria-label={`${label}: επιλογή πόντων`}>
                      <span>Πόντοι:</span>
                      {[15, 50].map((choice) => (
                        <button
                          type="button"
                          className={`category-point-choice${pointsValue === choice ? ' is-selected' : ''}`}
                          aria-pressed={pointsValue === choice}
                          key={choice}
                          onClick={() => onPointsChange(choice)}
                        >
                          {choice}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        );
      })}
      <button
        type="button"
        className={`category-clear${value === '' ? ' is-selected' : ''}`}
        aria-pressed={value === ''}
        onClick={() => onChange('')}
      >
        Χωρίς αντιστοίχιση
      </button>
    </div>
  );
}
