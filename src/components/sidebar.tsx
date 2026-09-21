"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Wrench,
  Users,
  Tags,
  ChartNoAxesCombined,
  UserRoundCog,
  LogOut,
  Smartphone,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { it } from "@/messages/it";
const links = [
  { href: "/", label: it.nav.dashboard, icon: LayoutDashboard },
  { href: "/orders", label: it.nav.orders, icon: Wrench },
  { href: "/customers", label: it.nav.customers, icon: Users },
  { href: "/prices", label: it.nav.prices, icon: Tags, owner: true },
  {
    href: "/reports",
    label: it.nav.reports,
    icon: ChartNoAxesCombined,
    owner: true,
  },
  { href: "/team", label: it.nav.team, icon: UserRoundCog, owner: true },
];
export function Sidebar({ name, role }: { name: string; role: string }) {
  const path = usePathname();
  return (
    <aside className="sidebar">
      <Link href="/" className="brand">
        <span className="brand-mark">
          <Smartphone size={24} />
        </span>
        <span>
          {it.app}
          <small>{it.subtitle}</small>
        </span>
      </Link>
      <div className="nav-label">{it.navigation}</div>
      <nav aria-label={it.navigation}>
        {links
          .filter((l) => !l.owner || role === "OWNER")
          .map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              className={
                (href === "/" ? path === href : path.startsWith(href))
                  ? "nav-item active"
                  : "nav-item"
              }
            >
              <Icon size={19} />
              {label}
            </Link>
          ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="profile">
          <span className="avatar">{name.slice(0, 1).toUpperCase()}</span>
          <span>
            <strong>{name}</strong>
            <small>{role === "OWNER" ? it.owner : it.staff}</small>
          </span>
          <button
            className="icon-button"
            aria-label={it.logout}
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </aside>
  );
}
