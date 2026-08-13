# Melodio Canonical Source

This repository is the single source of truth for Melodio.

## Repository layout

- `/`: Next.js web application deployed to Vercel
- `/worker`: long-running Mac mini workers for audio processing and YouTube automation
- `/src/app/(app)/pioneer` and related Pioneer files: temporary experiment, not part of the core Melodio product

## Machine roles

- MacBook Air: development client
- Mac mini: worker and runtime host
- GitHub `main`: canonical source history
- Vercel: web production runtime

Neither machine-local folder is authoritative by itself. Both machines must clone or pull this repository.

## Required workflow

1. Start work from an up-to-date branch based on `origin/main`.
2. Never synchronize source by overwriting one machine folder with `rsync`.
3. Do not commit `.env*`, `.vercel`, `.next`, `node_modules`, worker logs, or temporary worker files.
4. Before merging or deploying, run:

   ```bash
   npm ci
   npx tsc --noEmit
   npm run build
   cd worker
   npm ci
   node --check index.js
   ```

5. Deploy Vercel production only from a clean commit.
6. Update the Mac mini worker by pulling the same commit, installing with `npm ci`, and restarting PM2.

## Recovery sources used for the initial unification

- Git history: `https://github.com/yoonmanro-stack/melodio-web.git`
- Production-matching web snapshot: MacBook Air `Melodio_Ops/melodio-web` (deployed 2026-08-10)
- Production worker snapshot: MacBook Air `Melodio_Ops/melodio-worker`

The former machine-local folders should be retained only as recovery snapshots until both machines have been migrated to this repository.
