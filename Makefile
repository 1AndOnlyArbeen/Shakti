# Tempu dev stack. `make help` lists everything.
#
# Compose-level variables come from .env.docker when it exists (copy the sample);
# without it every service falls back to the defaults in docker-compose.yml.

ENV_FILE := $(wildcard .env.docker)
COMPOSE  := docker compose $(if $(ENV_FILE),--env-file $(ENV_FILE),)

.DEFAULT_GOAL := help
.PHONY: help up down stop restart build rebuild logs logs-mongo ps shell mongosh \
        health seed test tools prod prod-logs reset clean check

help: ## Show this help
	@grep -hE '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) \
	  | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

check: ## Verify prerequisites before starting
	@command -v docker >/dev/null || { echo "docker not installed: sudo apt install docker.io docker-compose-v2"; exit 1; }
	@docker compose version >/dev/null 2>&1 || { echo "docker compose v2 missing: sudo apt install docker-compose-v2"; exit 1; }
	@test -f backend/.env || { echo "backend/.env missing — cp backend/.env.sample backend/.env"; exit 1; }
	@ss -ltn 2>/dev/null | grep -q '127.0.0.1:27017' \
	  && echo "WARNING: something already listens on 27017 (host mongod?). Run: sudo systemctl stop mongod" || true
	@echo "prerequisites OK"

up: check ## Start mongo + backend in the background
	$(COMPOSE) up -d --build
	@echo "backend  -> http://localhost:8002/health"

down: ## Stop everything, keep the database
	$(COMPOSE) down --remove-orphans

stop: ## Pause containers without removing them
	$(COMPOSE) stop

restart: ## Restart the backend only
	$(COMPOSE) restart backend

build: ## Build images using the layer cache
	$(COMPOSE) build

rebuild: ## Build images from scratch, no cache
	$(COMPOSE) build --no-cache

logs: ## Follow backend logs
	$(COMPOSE) logs -f backend

logs-mongo: ## Follow mongo logs
	$(COMPOSE) logs -f mongo

ps: ## Show container status and health
	$(COMPOSE) ps

shell: ## Open a shell in the backend container
	$(COMPOSE) exec backend bash

mongosh: ## Open a mongo shell on the shakti database
	$(COMPOSE) exec mongo mongosh shakti

health: ## Print each container's health state
	@$(COMPOSE) ps --format 'table {{.Service}}\t{{.Status}}'
	@curl -fsS http://localhost:8002/health && echo || echo "backend not answering"

seed: ## Run the seed script inside the container
	$(COMPOSE) exec backend npm run seed

test: ## Run the test suite inside the container
	$(COMPOSE) exec backend npm test

tools: ## Start mongo-express at http://localhost:8081 (admin/admin)
	$(COMPOSE) --profile tools up -d mongo-express
	@echo "mongo-express -> http://localhost:8081"

prod: check ## Build and run the production image on :8003
	$(COMPOSE) --profile prod up -d --build backend-prod
	@echo "prod backend -> http://localhost:8003/health"

prod-logs: ## Follow production backend logs
	$(COMPOSE) logs -f backend-prod

reset: ## Stop and DELETE the database volume
	@printf "This wipes the tempu database. Type yes to continue: " && read a && [ "$$a" = yes ]
	$(COMPOSE) --profile prod --profile tools down -v --remove-orphans
	@echo "volumes removed"

clean: ## Remove containers, volumes, and built images
	$(COMPOSE) --profile prod --profile tools down -v --remove-orphans --rmi local
