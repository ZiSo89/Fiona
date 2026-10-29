export default function StartupScreen() {
  return (
    <div className="startup-screen" role="status">
      <img
        className="startup-logo"
        src={`${import.meta.env.BASE_URL}alpha-logo.webp`}
        alt="Alpha Πληροφορική"
        width="120"
        height="110"
      />
      <p>Φόρτωση…</p>
    </div>
  );
}
