---
task: ci-cleanup-add-dependabot
date: 2026-06-11
status: in-progress
---

# CI Cleanup + Dependabot + Swift Build Check

## Goal

1. Eliminar `rust-core-ci.yml` (duplicado de `rust-core.yml`)
2. Adicionar `.github/dependabot.yml` (cargo + github-actions + pip)
3. Adicionar `.github/workflows/swift-build.yml` (build check iOS em PRs)

## Steps

- [ ] Delete `.github/workflows/rust-core-ci.yml`
- [ ] Create `.github/dependabot.yml`
- [ ] Create `.github/workflows/swift-build.yml`
- [ ] Commit atómico
- [ ] Update STATE.md
