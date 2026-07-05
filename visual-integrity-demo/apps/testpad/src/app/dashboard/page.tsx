"use client";

// BUG_NEXT_INERT: button intentionally does nothing
export default function DashboardPage() {
  return (
    <div className="card" data-route="/dashboard" data-bug="BUG_NEXT_INERT">
      <h1>Dashboard</h1>
      <p className="muted">Finish onboarding to reach your projects.</p>
      <button
        type="button"
        data-testid="continue-setup"
        onClick={() => {
          // Intentionally inert — should navigate to /projects but does not.
          console.info("[BUG_NEXT_INERT] Continue setup clicked; no navigation");
        }}
      >
        Continue setup
      </button>
    </div>
  );
}
