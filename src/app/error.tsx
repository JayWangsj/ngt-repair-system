"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="standalone">
      <h1>Impossibile caricare i dati</h1>
      <p>Verifica la connessione e riprova.</p>
      <button className="button button-primary" onClick={reset}>
        Riprova
      </button>
    </section>
  );
}
