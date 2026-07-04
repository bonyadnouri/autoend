# Diagnosis is written by the filing agent at finding time

A Finding's Diagnosis (root cause, fault domain, confidence) is written during the Run by the agent that files the Finding; replay-detected Regressions get theirs from a bounded post-replay pass whose depth scales with Effort. At low Effort a Diagnosis may be absent, and the viewer renders nothing rather than a placeholder.

Always-analyzing every failure was rejected because LLM calls would blow the Run < 60s default and quietly redefine Effort (the glossary bounds exploration only). An on-demand "Analyze" button in the viewer was rejected because it gives the viewer LLM and API-key access — superseding ADR-0004's dumb server — and breaks Report portability, since analysis would only work where keys live.
