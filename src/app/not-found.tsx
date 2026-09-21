import Link from "next/link";
export default function NotFound() {
  return (
    <main className="standalone">
      <h1>404</h1>
      <p>La pagina richiesta non è disponibile.</p>
      <Link href="/">Torna alla panoramica</Link>
    </main>
  );
}
