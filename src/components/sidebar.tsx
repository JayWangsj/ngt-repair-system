"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Wrench,
  Package,
  ShoppingBag,
  Users,
  Tags,
  Smartphone,
  Settings,
} from "lucide-react";
import { useMessages } from "./language";
export function Sidebar() {
  const it = useMessages();
  const path = usePathname();
  const links = [
    { href: "/", label: it.nav.dashboard, icon: LayoutDashboard },
    { href: "/orders", label: it.nav.orders, icon: Wrench },
    { href: "/retail", label: it.nav.retail, icon: ShoppingBag },
    { href: "/inventory", label: it.nav.inventory, icon: Package },
    { href: "/customers", label: it.nav.customers, icon: Users },
    { href: "/prices", label: it.nav.prices, icon: Tags },
    { href: "/settings", label: it.nav.settings, icon: Settings },
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
