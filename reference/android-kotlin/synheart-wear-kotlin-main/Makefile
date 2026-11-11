GARMIN_REPO   := git@github.com:synheart-ai/synheart-wear-garmin-companion.git
GARMIN_SUBDIR := kotlin

# The single tracked OSS file that the companion overlay symlinks on top of.
# `link-garmin` backs it up to `<path>.stub` before linking; `clean-garmin`
# restores it. This way the tracked-in-git stub is never lost, even if
# `.garmin/` disappears unexpectedly.
PROTECTED_STUBS := \
  src/main/kotlin/ai/synheart/wear/adapters/GarminHealth.kt

.PHONY: build build-with-garmin build-without-garmin \
        check-garmin fetch-garmin link-garmin clean-garmin \
        install-hooks verify-clean

# ---------------------------------------------------------------------------
# Top-level build entrypoint
# ---------------------------------------------------------------------------
# Auto-detect: build with Garmin RTS if the developer has companion access,
# otherwise fall back to stub mode. Always installs the safety hooks first.
build: install-hooks
	@if git ls-remote $(GARMIN_REPO) HEAD >/dev/null 2>&1; then \
		echo "✓ Garmin companion repo access detected"; \
		$(MAKE) build-with-garmin; \
	else \
		echo "○ No Garmin companion access — building without RTS"; \
		$(MAKE) build-without-garmin; \
	fi

build-with-garmin: install-hooks fetch-garmin link-garmin
	@echo "Building Kotlin SDK with Garmin RTS support..."

build-without-garmin: install-hooks clean-garmin
	@echo "Building Kotlin SDK without Garmin RTS..."

# ---------------------------------------------------------------------------
# Companion repo plumbing
# ---------------------------------------------------------------------------
check-garmin:
	@git ls-remote $(GARMIN_REPO) HEAD >/dev/null 2>&1 \
		&& echo "✓ Access OK" \
		|| (echo "✗ No access to $(GARMIN_REPO)" && exit 1)

fetch-garmin: check-garmin
	@if [ ! -d ".garmin" ]; then \
		echo "Cloning companion into .garmin/ ..."; \
		git clone --depth 1 $(GARMIN_REPO) .garmin; \
	else \
		echo "Updating .garmin/ ..."; \
		git -C .garmin pull --ff-only; \
	fi

# Overlay the licensed companion files on top of the open-source tree.
#
# IMPORTANT: for each PROTECTED_STUB, we save the tracked OSS file to
# `<path>.stub` BEFORE replacing it with a symlink. `clean-garmin` restores
# from the backup. This way the tracked-in-git stub is never lost, even if
# `.garmin/` disappears unexpectedly.
link-garmin:
	@echo "Linking Garmin RTS files..."
	@# Backup the protected OSS stub.
	@for path in $(PROTECTED_STUBS); do \
		if [ -f "$$path" ] && [ ! -L "$$path" ] && [ ! -f "$$path.stub" ]; then \
			cp "$$path" "$$path.stub"; \
		fi; \
	done
	@# Overlay the protected Kotlin stub from the companion repo.
	@ln -sf $$(pwd)/.garmin/$(GARMIN_SUBDIR)/src/main/kotlin/ai/synheart/wear/adapters/GarminHealth.kt \
		src/main/kotlin/ai/synheart/wear/adapters/GarminHealth.kt
	@echo "✓ Garmin RTS files linked"
	@echo "  (the pre-commit hook will block accidental staging of overlay symlinks)"

# Remove symlinks, the .garmin clone, AND restore the tracked stub from backup.
clean-garmin:
	@rm -rf .garmin
	@# Remove dangling overlay symlinks (cheap-and-correct after .garmin/ removal).
	@for path in $(PROTECTED_STUBS); do \
		if [ -L "$$path" ]; then \
			rm -f "$$path"; \
		fi; \
	done
	@# Restore the protected stub from backup if missing.
	@for path in $(PROTECTED_STUBS); do \
		if [ -f "$$path.stub" ] && [ ! -e "$$path" ]; then \
			mv "$$path.stub" "$$path"; \
			echo "  restored $$path"; \
		elif [ -f "$$path.stub" ]; then \
			rm -f "$$path.stub"; \
		fi; \
	done
	@echo "✓ Garmin RTS files cleaned"

# ---------------------------------------------------------------------------
# Safety hooks
# ---------------------------------------------------------------------------
# Configure git to use the in-repo .githooks/ directory. Idempotent.
install-hooks:
	@current="$$(git config --local --get core.hooksPath || true)"; \
	if [ "$$current" != ".githooks" ]; then \
		git config --local core.hooksPath .githooks; \
		echo "✓ git core.hooksPath → .githooks"; \
	fi

# Fail loudly if the working tree contains overlay symlinks at any
# PROTECTED_STUB path. Intended for CI and pre-publish gates.
verify-clean:
	@fail=0; \
	for path in $(PROTECTED_STUBS); do \
		if [ -L "$$path" ]; then \
			echo "✗ $$path is a symlink (overlay leaked into the working tree)"; \
			fail=1; \
		fi; \
	done; \
	if [ $$fail -ne 0 ]; then \
		echo; \
		echo "Run \`make clean-garmin\` and try again."; \
		exit 1; \
	fi; \
	echo "✓ No Garmin overlay symlinks in protected paths"
