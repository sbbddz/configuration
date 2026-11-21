---
description: Trace execution flow and render code paths as an ASCII call tree
argument-hint: "<flow or feature>"
---
Analyze and trace the execution flow and code paths for: ${@:-the requested flow}.

Structure the breakdown clearly and concisely using this format:

1. Separate into distinct scenarios or sub-flows if multiple cases exist (e.g., sync vs async, read vs write, authenticated vs anonymous, provider-specific branches).
2. For each flow, detail:
   - **Entry Points / Triggers**: HTTP routes/handlers, CLI commands, event consumers, scheduled jobs, webhooks, UI actions, or callbacks.
   - **Call Tree & Code Path**: A structured ASCII tree (`├──`, `└──`) showing the exact execution path:
     - Exact function/method names (`Class#method`, `module.function`, `handler`, `Service.call`), or the project's native callable terminology
     - Branching logic (`if` / `else`, guards, early returns)
     - External calls (HTTP method/path, RPC, queue/topic, shell command)
     - Persistence reads/writes and state transitions (records, documents, files, caches)
     - Side effects (events, messages, jobs, notifications, audit entries)
   - **Key Mechanics**: Bulleted technical highlights of non-obvious details:
     - Concurrency, transaction, and locking semantics
     - Idempotency and deduplication checks
     - Retries, timeouts, async lifecycle, and callbacks
     - Secondary side effects (sweeps, reconciliation, cache invalidation, settlements)

Use the project's actual terminology and framework. Do not assume a particular language, ORM, job queue, or architecture. Keep the prose direct, technical, and concise with zero fluff or emojis.
