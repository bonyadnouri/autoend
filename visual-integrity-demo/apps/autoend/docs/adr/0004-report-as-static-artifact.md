# Report is a static artifact rendered by a thin viewer

A Run's Report is a self-contained folder of files (findings data + WebM Evidence); the dashboard is a thin local viewer that reads it, and every resolution action (Dismiss / Reject / Suppress) is a plain file edit against the repo. There is no database.

This buys CI mode for free later — a CI Run uploads the folder as a build artifact and anyone views it read-only — and keeps the report server dumb: no LLM access, no agent execution, no schema migrations. Accepted constraint: cross-Run analytics (trends, full-text search over history) are limited to what reading files allows; a live app over SQLite was considered and rejected for v1 because it makes the Run output non-portable and turns the "small web app" into a second product. Revisit only if history analytics become a validated user need.
