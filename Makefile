# Tempu dev stack. `make help` lists everything.
#
# Compose-level variables come from .env.docker when present (copy the sample);
# without it, every service falls back to the defaults in docker-compose.yml.

ENV_FILE := $(wildcard .env.docker)
COMPOSE  := docker compose $(if $(ENV_FILE),--env-file $(ENV_FILE),)
ALL      := --profile web --profile rag --profile prod --profile tools

.DEFAULT_GOAL := help
.PHONY: help check up up-web up-all down stop restart build rebuild \
        logs logs-web logs-rag logs-mongo logs-redis ps health \
        shell mongosh redis-cli seed test lint \
        tools prod prod-logs reset clean prune

help: ## Show this help
	@awk 'BEGIN{FS=":.*?## "} \
	  /^# ==/ {printf "\n\033[1m%s\033[0m\n", substr($$0,5); next} \
	  /^[a-z][a-z-]*:.*?## / {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# == Starting and stopping
check: ## Verify prerequisites and warn about port clashes
	@command -v docker >/dev/null || { echo "docker not installed: sudo apt install docker.io docker-compose-v2"; exit 1; }
	@docker compose version >/dev/null 2>&1 || { echo "docker compose v2 missing: sudo apt install docker-compose-v2"; exit 1; }
	@docker info >/dev/null 2>&1 || { echo "cannot reach the docker socket. Either 'newgrp docker' in this shell, or log out and back in."; exit 1; }
	@test -f backend/.env || { echo "backend/.env missing — cp backend/.env.sample backend/.env"; exit 1; }
	@for p in 27017 6379 8002; do \
	  ss -ltn 2>/dev/null | grep -q ":$$p " \
	    && echo "WARNING: port $$p already in use on the host — stop that service or override the port in .env.docker" || true; \
	done
	@echo "prerequisites OK"

up: check ## Start mongo + redis + backend
	$(COMPOSE) up -d --build
	@echo "backend -> http://localhost:$${BACKEND_PORT:-8002}/health/ready"

up-web: check ## ... plus the vite dev server
	$(COMPOSE) --profile web up -d --build
	@echo "web     -> http://localhost:$${WEB_PORT:-5173}"

up-all: check ## ... plus the python RAG service
	$(COMPOSE) --profile web --profile rag up -d --build
	@echo "rag     -> http://localhost:$${RAG_PORT:-8100}/health"

down: ## Stop everything, keep data
	$(COMPOSE) $(ALL) down --remove-orphans

stop: ## Pause containers without removing them
	$(COMPOSE) $(ALL) stop

restart: ## Restart the backend only
	$(COMPOSE) restart backend

# == Building
build: ## Build all images (layer cache)
	$(COMPOSE) $(ALL) build

rebuild: ## Build all images from scratch
	$(COMPOSE) $(ALL) build --no-cache

# == Inspecting
ps: ## Container status and health
	@$(COMPOSE) $(ALL) ps --format 'table {{.Service}}\t{{.Status}}\t{{.Ports}}'

health: ## Probe every running service
	@$(COMPOSE) $(ALL) ps --format 'table {{.Service}}\t{{.Status}}'
	@echo
	@printf 'backend  ' && (curl -fsS http://localhost:$${BACKEND_PORT:-8002}/health/ready || echo 'not answering') && echo
	@printf 'redis    ' && ($(COMPOSE) exec -T redis redis-cli ping 2>/dev/null || echo 'not running')
	@printf 'mongo    ' && ($(COMPOSE) exec -T mongo mongosh --quiet --eval 'db.runCommand({ping:1}).ok' 2>/dev/null || echo 'not running')

logs: ## Follow backend logs
	$(COMPOSE) logs -f backend
logs-web: ## Follow web logs
	$(COMPOSE) --profile web logs -f web
logs-rag: ## Follow RAG logs
	$(COMPOSE) --profile rag logs -f rag
logs-mongo: ## Follow mongo logs
	$(COMPOSE) logs -f mongo
logs-redis: ## Follow redis logs
	$(COMPOSE) logs -f redis

# == Shells and scripts
shell: ## Shell in the backend container
	$(COMPOSE) exec backend bash
mongosh: ## Mongo shell on the shakti database
	$(COMPOSE) exec mongo mongosh shakti
redis-cli: ## Redis CLI
	$(COMPOSE) exec redis redis-cli
seed: ## Run the seed script in the container
	$(COMPOSE) exec backend npm run seed
test: ## Run backend tests in the container
	$(COMPOSE) exec backend npm test
lint: ## Lint the frontend in its container
	$(COMPOSE) --profile web exec web npm run lint

# == Extras
tools: ## mongo-express :8081 and redis-insight :8001
	$(COMPOSE) --profile tools up -d
	@echo "mongo-express -> http://localhost:$${MONGO_EXPRESS_PORT:-8081}  (admin/admin)"
	@echo "redis-insight -> http://localhost:$${REDIS_INSIGHT_PORT:-8001}"

prod: check ## Build and run the production images
	$(COMPOSE) --profile prod up -d --build
	@echo "backend -> http://localhost:$${BACKEND_PROD_PORT:-8003}/health/ready"
	@echo "web     -> http://localhost:$${WEB_PROD_PORT:-8080}"

prod-logs: ## Follow production logs
	$(COMPOSE) --profile prod logs -f backend-prod web-prod

# == Cleanup
reset: ## Stop and DELETE all data volumes
	@printf 'This wipes the mongo, redis, and RAG data. Type yes to continue: ' && read a && [ "$$a" = yes ]
	$(COMPOSE) $(ALL) down -v --remove-orphans
	@echo 'volumes removed'

clean: ## Remove containers, volumes, and locally built images
	$(COMPOSE) $(ALL) down -v --remove-orphans --rmi local

prune: ## Reclaim disk from dangling docker layers (safe)
	docker builder prune -f
