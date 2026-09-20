# Gridy

Gridy is an open-source engineering workbench built on [OpenCode](https://github.com/anomalyco/opencode).
It combines native model providers, local tools, engineering skills, and PDF,
Word, and Excel workflows.

Gridy is designed for enterprise self-deployment. It starts without a Gridy
account and uses your chosen provider or local model. Connect a provider in
Settings, configure an OpenAI-compatible endpoint, or use the free models
currently offered through OpenCode. Provider availability and terms can change.

## Windows

Download the Windows x64 installer and SHA256 checksum from
[GitHub Releases](https://github.com/svd-ai-lab/gridy/releases).
See the release notes for signing status.

Application and skill bundles do not update automatically. Deploy a reviewed
release to upgrade; the installer supports upgrades within this edition.
Engineering and document skills are pinned and included for offline discovery.
Model services and initial installation of tool dependencies may require a
network connection. Commercial engineering applications and licenses are
supplied separately.

Only one Gridy edition can be installed at a time. To switch from managed Gridy
or OpenScience, uninstall it in Windows Settings first. Its data is retained,
and this edition starts with a separate profile. Conversations and credentials
are not imported.

## Build

Install Git, Node.js 24, and the Bun version declared in `package.json`.
From the repository root on Windows PowerShell:

```powershell
bun install --linker isolated --ignore-scripts
bun run --cwd packages/core fix-node-pty
$env:OPENCODE_CHANNEL = "prod"
Copy-Item packages/ui/src/custom-elements.d.ts packages/app/src/custom-elements.d.ts -Force
try { bun run --cwd packages/desktop build }
finally { git restore packages/app/src/custom-elements.d.ts }
bun run --cwd packages/desktop package:win
bun packages/desktop/scripts/verify-release.ts
```

The temporary copy handles Windows checkouts without Git symlinks. The installer
is written to `packages/desktop/dist`. Skill sources and revisions
are recorded in `packages/desktop/resources/gridy-config/skills.manifest.json`
and `skills.lock.json`. Source repositories are public.

## License

Gridy preserves OpenCode's [MIT license](LICENSE). Bundled skills include their
source provenance and license notices. Dependencies retain their own licenses.
