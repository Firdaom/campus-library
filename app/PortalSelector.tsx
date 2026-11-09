
"use client";

import { useState } from "react";
import { SignInButton } from "./SignInButton";

type Portal = "student" | "staff";

export function PortalSelector() {
  const [portal, setPortal] = useState<Portal | null>(null);

  return (
    <>
      <div className="portal-options">
        <button
          type="button"
          className={`portal-option ${portal === "student" ? "selected" : ""}`}
          aria-pressed={portal === "student"}
          onClick={() => setPortal("student")}
        >
          <span className="portal-option-title">Student Portal</span>
          <span className="portal-option-description">
            Browse books, manage loans, and reservations.
          </span>
        </button>

        <button
          type="button"
          className={`portal-option ${portal === "staff" ? "selected" : ""}`}
          aria-pressed={portal === "staff"}
          onClick={() => setPortal("staff")}
        >
          <span className="portal-option-title">Staff Portal</span>
          <span className="portal-option-description">
            Manage circulation and library operations.
          </span>
        </button>
      </div>

      {portal && <SignInButton portal={portal} />}
    </>
  );
}
