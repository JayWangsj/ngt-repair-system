import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { PageHeader } from "@/components/common";
import { UserForm, UserToggle } from "@/components/forms";
import { it } from "@/messages/it";
export default async function Team() {
  const actor = await requireActor();
  if (actor.role !== "OWNER")
    return <p className="message error">{it.restricted}</p>;
  const users = await db.user.findMany({
    select: { id: true, name: true, email: true, role: true, enabled: true },
    orderBy: { createdAt: "asc" },
  });
  return (
    <>
      <PageHeader title={it.nav.team} description={it.teamDescription} />
      <section className="panel padded">
        <h2>{it.newUser}</h2>
        <UserForm />
      </section>
      <section className="panel table-panel spaced">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{it.name}</th>
                <th>{it.email}</th>
                <th>{it.role}</th>
                <th>{it.statusLabel}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>{u.role === "OWNER" ? it.owner : it.staff}</td>
                  <td>{u.enabled ? it.enabled : it.disabled}</td>
                  <td>
                    {u.id !== actor.id && (
                      <UserToggle id={u.id} enabled={u.enabled} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
