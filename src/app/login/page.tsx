"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Smartphone, ArrowRight } from "lucide-react";
import { it } from "@/messages/it";
import { Button } from "@/components/ui/button";
export default function Login() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <main className="login-page">
      <section className="login-story">
        <div className="brand">
          <span className="brand-mark">
            <Smartphone />
          </span>
          {it.app}
        </div>
        <div>
          <span className="eyebrow">{it.subtitle}</span>
          <h1>{it.loginDescription}</h1>
          <p>{it.dashboardDescription}</p>
          <div className="login-device">
            <Smartphone size={120} strokeWidth={1} />
            <span>↗</span>
          </div>
        </div>
        <small>NGT · Italia</small>
      </section>
      <section className="login-panel">
        <form
          className="login-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setPending(true);
            setError("");
            const data = new FormData(event.currentTarget);
            try {
              const result = await signIn("credentials", {
                email: data.get("email"),
                password: data.get("password"),
                redirect: false,
              });
              if (result?.error) setError(it.loginError);
              else router.push("/");
            } catch {
              setError(it.loginError);
            } finally {
              setPending(false);
            }
          }}
        >
          <div className="eyebrow">{it.workspace}</div>
          <h2>{it.login}</h2>
          <p>{it.loginDescription}</p>
          <label>
            {it.email}
            <input name="email" type="email" autoComplete="username" required />
          </label>
          <label>
            {it.password}
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
            />
          </label>
          {error && (
            <p className="message error" role="alert">
              {error}
            </p>
          )}
          <Button disabled={pending}>
            {pending ? it.saving : it.login}
            <ArrowRight size={18} />
          </Button>
        </form>
      </section>
    </main>
  );
}
