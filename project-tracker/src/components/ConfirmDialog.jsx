import { CircleAlert } from 'lucide-react';
import Modal from './Modal.jsx';

export default function ConfirmDialog({ title, message, confirmLabel, busy = false, onConfirm, onCancel }) {
  const cancel = () => { if (!busy) onCancel(); };
  return (
    <Modal labelledBy="confirm-title" className="confirm-modal" onClose={cancel}>
      <div className="modal-heading">
        <span className="modal-icon"><CircleAlert size={19} /></span>
      </div>
      <h2 id="confirm-title">{title}</h2>
      <p>{message}</p>
      <div className="confirm-actions">
        <button type="button" className="secondary-button" onClick={cancel} disabled={busy}>Ακύρωση</button>
        <button type="button" className="login-submit" onClick={onConfirm} disabled={busy}>
          {busy ? 'Περιμένετε…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
