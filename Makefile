.PHONY: improvement-loop improve-loop improve-once verify verify-deploy

improvement-loop:
	IMPROVEMENT_LOOP_CODEX_MODEL=$${IMPROVEMENT_LOOP_CODEX_MODEL:-gpt-5.5} IMPROVEMENT_LOOP_INTERVAL_SECONDS=600 IMPROVEMENT_LOOP_DEPLOY_INTERVAL_SECONDS=7200 bash scripts/improvement-loop.sh --deploy

improve-loop: improvement-loop

improve-once:
	bash scripts/improvement-loop.sh --once

verify:
	pnpm verify

verify-deploy:
	pnpm verify:deploy
