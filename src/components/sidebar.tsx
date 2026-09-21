"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Wrench,
  Users,
  Tags,
  ChartNoAxesCombined,
  Smartphone,
} from "lucide-react";
import { useMessages, LanguageSwitch } from "./language";
export function Sidebar() {
  const it = useMessages();
  const path = usePathname();
  const links = [
    { href: "/", label: it.nav.dashboard, icon: LayoutDashboard },
    { href: "/orders", label: it.nav.orders, icon: Wrench },
    { href: "/customers", label: it.nav.customers, icon: Users },
    { href: "/prices", label: it.nav.prices, icon: Tags },
    { href: "/reports", label: it.nav.reports, icon: ChartNoAxesCombined },
  ];
  return (
    <aside className="sidebar">
      <Link href="/" className="brand">
        <span className="brand-mark">
          <Smartphone size={24} />
        </span>
        <span>
          NGT<small>{it.subtitle}</small>
        </span>
      </Link>
      <LanguageSwitch />
      <div className="nav-label">{it.navigation}</div>
      <nav aria-label={it.navigation}>
        {links.map(({ href, label, icon: Icon }) => (
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
    </aside>
  );
}
