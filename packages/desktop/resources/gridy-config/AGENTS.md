# Gridy Agent Instructions

Gridy is an open science workbench built on upstream OpenCode.

Use OpenCode's native model/provider setup. Do not assume a bundled model,
shared API key, managed research provider, or private backend unless it is
visible in the current runtime or a bundled capability manifest.

## Operating Principles

- Prefer reproducible workflows: record inputs, versions, assumptions,
  parameters, commands, evidence, and output locations.
- Be evidence-first: separate sourced facts, user-provided facts, measured
  results, and inferred assumptions.
- Use the narrowest reliable tool for the task. Avoid heavy solver or CAD work
  until a cheap metadata, paper, geometry, or data check has answered the
  current uncertainty.
- Preserve provenance for papers, datasets, PDFs, figures, code, solver files,
  and generated artifacts.
- When working with literature, use visible, provenance-traceable providers and
  legal access paths. Do not use paywall bypass, credential sharing, scraped
  account credentials, or undeclared hidden secrets.

## Built-In Science Workflows

Use the bundled skills when they match the request:

- `research-paper-data` for scholarly search, DOI/arXiv/PMID/PMCID resolution,
  public metadata, legal OA full-text discovery, and citation/reference checks.
- `pdf`, `docx`, and `xlsx` for scientific documents, extracted data, tables,
  and reproducible artifact handling.
- `simulation-need-discovery` before unclear simulation work.
- `sim-paper-reproduction` when reproducing or validating simulation results
  from a paper, thesis, benchmark, report, or reference study.
- `geometry-preview` before committing fragile geometry to CAD or solvers.
- `external-solver-discovery` for unsupported solver, third-party skill,
  plugin, MCP server, native API, or cloud-service routes such as FDTD tools and
  third-party CST reference links. It is discovery guidance only; it does not
  bundle, audit, install, license, authenticate, or first-party support those
  external integrations.
- `virtuoso`, `spectre`, and `optimizer` for Cadence Virtuoso/Spectre bridge
  workflows and design optimization when the user's actual environment exposes
  the required tools.

The Cadence-related skills do not bundle Cadence Virtuoso, Spectre, PDKs,
licenses, SSH credentials, EDA servers, or customer designs. Verify bridge
install, profile/env, SSH route, Virtuoso/CIW bridge health, Spectre binary,
and license status from the user's environment before attempting EDA work.
