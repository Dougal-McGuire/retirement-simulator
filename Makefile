.DEFAULT_GOAL := help

MSG ?= Update retirement simulator

.PHONY: help dev sync commit push deploy improvement-loop improve-loop improve-review improve-once improve-deploy verify verify-deploy

help: ## List available targets.
	@awk 'BEGIN {FS = ":.*##"; print "Available targets:"} /^[a-zA-Z0-9_-]+:.*##/ {printf "  %-18s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

dev: ## Start the local Next.js dev server.
	pnpm dev

sync: ## Pull the latest upstream changes for the current branch.
	git pull --rebase --autostash

commit: ## Stage and commit all current changes. Override with MSG="...".
	git add -A
	@if git diff --cached --quiet; then \
		echo "No changes to commit."; \
	else \
		git commit -m "$(MSG)"; \
	fi

push: ## Push the current branch to its upstream.
	git push

deploy: ## Sync, commit, and push the current branch.
	$(MAKE) sync
	$(MAKE) commit
	$(MAKE) push

improvement-loop: improve-loop ## Alias for improve-loop.

improve-loop: ## Run the continuous improvement loop with local auto-commits.
	IMPROVEMENT_LOOP_CODEX_MODEL=$${IMPROVEMENT_LOOP_CODEX_MODEL:-gpt-5.5} IMPROVEMENT_LOOP_INTERVAL_SECONDS=600 bash scripts/improvement-loop.sh --auto-commit

improve-review: ## Run the improvement loop and stop after verified changes.
	IMPROVEMENT_LOOP_CODEX_MODEL=$${IMPROVEMENT_LOOP_CODEX_MODEL:-gpt-5.5} IMPROVEMENT_LOOP_INTERVAL_SECONDS=600 bash scripts/improvement-loop.sh --no-auto-commit

improve-once: ## Run one improvement-loop cycle.
	bash scripts/improvement-loop.sh --once

improve-deploy: ## Run the improvement loop with periodic verified deploys.
	IMPROVEMENT_LOOP_CODEX_MODEL=$${IMPROVEMENT_LOOP_CODEX_MODEL:-gpt-5.5} IMPROVEMENT_LOOP_INTERVAL_SECONDS=600 IMPROVEMENT_LOOP_DEPLOY_INTERVAL_SECONDS=7200 bash scripts/improvement-loop.sh --deploy

verify: ## Run lint, typecheck, tests, and build.
	pnpm verify

verify-deploy: ## Run the full deploy verification gate.
	pnpm verify:deploy
