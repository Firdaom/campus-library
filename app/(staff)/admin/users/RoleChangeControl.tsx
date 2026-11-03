"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const ROLES = ["student", "staff", "admin"] as const;

// Calls PATCH /api/admin/users/{id}/role — enforced admin-only both there
// (requireRole) and by the users_admin_update_any RLS policy (db/schema.sql),
// so this control is convenience UI, not the actual authorization boundary.
export function RoleChangeControl({ userId, currentRole }: { userId: string; currentRole: string }) {
  const router = useRouter();
  const [role, setRole] = useState(currentRole);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(next: string) {
    if (next === role) return;
    if (!window.confirm(`Change this user's role to "${next}"?`)) return;

    setPending(true);
    setError(null);

    const res = await fetch(`/api/admin/users/${userId}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: next }),
    });

    setPending(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not change role.");
      return;
    }

    setRole(next);
    router.refresh();
  }

  return (
    <div>
      <select
        className="role-select"
        value={role}
        disabled={pending}
        onChange={(e) => handleChange(e.target.value)}
        aria-label="Change role"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      {error && (
        <p className="error small" style={{ marginTop: "0.3rem" }}>
          {error}
        </p>
      )}
    </div>
  );
}
