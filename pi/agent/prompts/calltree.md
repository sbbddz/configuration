---
description: Trace execution flow and render code paths as an ASCII call tree
argument-hint: "<flow or feature>"
---
Analyze and trace the execution flow and code paths for: ${@:-the requested flow}.

Structure the breakdown clearly and concisely using this format:

1. Separate into distinct scenarios or sub-flows if multiple cases exist (e.g., sync vs async, payin vs payout, provider-specific branches).
2. For each flow, detail:
   - **Entry Points / Triggers**: Controllers, API routes, ActiveAdmin actions, webhooks, or background jobs.
   - **Call Tree & Code Path**: A structured ASCII tree (`├──`, `└──`) showing the exact execution path:
     - Exact class and method names (`Class#method`, `Service.call`)
     - Branching logic (`if` / `else`)
     - External HTTP API calls (method and endpoint path)
     - Database record creation and state transitions
     - Ledger entries, job enqueues, and webhook notifications
   - **Key Mechanics**: Bulleted technical highlights of non-obvious details:
     - Concurrency control and locking (e.g. advisory locks)
     - Idempotency checks
     - Async lifecycle and webhook callbacks
     - Secondary side effects (sweeps, reconciliation, ledger settlements)

Keep the prose direct, technical, and concise with zero fluff or emojis.
