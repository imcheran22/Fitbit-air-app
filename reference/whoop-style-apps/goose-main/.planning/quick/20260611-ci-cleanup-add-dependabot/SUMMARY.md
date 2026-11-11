---
task: ci-cleanup-add-dependabot
date: 2026-06-11
status: complete
commit: f629dd7
---

# Summary

Removed `rust-core-ci.yml` (duplicate of `rust-core.yml`). Added `dependabot.yml` (cargo + github-actions + pip, weekly). Added `swift-build.yml` (iOS simulator build check on PRs touching Swift/Xcode files; macos-15 + Xcode 26.3 + aarch64-apple-ios-sim).
