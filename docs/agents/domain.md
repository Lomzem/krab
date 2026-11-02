# Domain docs

This repo uses a single-context layout: `GLOSSARY.md` at the repo root and ADRs in `docs/adr/`.

## Before exploring

Read the root `GLOSSARY.md` and ADRs in `docs/adr/` that touch the area you are about to work in.

If these files do not exist, proceed silently. The domain-modeling skill creates them lazily when terms or decisions get resolved.

## Use the glossary vocabulary

When naming a domain concept in issues, refactor proposals, hypotheses, or tests, use the term defined in `GLOSSARY.md`.

If a concept is missing, reconsider whether it belongs to the domain; record real vocabulary gaps for domain-modeling.

## Flag ADR conflicts

When a proposal contradicts an existing ADR, identify the ADR and explain why the decision should be reopened.
