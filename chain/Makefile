SHELL := /usr/bin/env bash
.SHELLFLAGS := -eu -o pipefail -c

# ===== CONFIG =====
IMAGE=ethereum/client-go:v1.13.15
NETWORK_ID=1515
CHAIN_ID=1515
PERIOD=5
EPOCH=30000
PREFUND_ETH=1000000

DATA_DIR=geth-data
GENESIS=genesis.json
PASSWORD=password.txt
COMPOSE=docker-compose.yml
CONTAINER=poa-geth

PASSWORD_VALUE=password

# ===== DEFAULT =====
.PHONY: all
all: reset init up

# ===== CLEAN =====
.PHONY: reset
reset:
	@echo ">> Stopping containers"
	@if [ -f $(COMPOSE) ]; then docker compose down -v || true; fi
	@docker rm -f $(CONTAINER) >/dev/null 2>&1 || true
	@echo ">> Removing old data"
	@rm -rf $(DATA_DIR) $(GENESIS) $(PASSWORD) .validator .relayer

# ===== INIT =====
.PHONY: init
init: accounts genesis compose init-chain

.PHONY: accounts
accounts:
	@echo ">> Creating password file"
	@printf '%s' "$(PASSWORD_VALUE)" > $(PASSWORD)
	@mkdir -p $(DATA_DIR)
	@echo ">> Creating validator account"
	@VALIDATOR=$$(docker run --rm -v "$(CURDIR)":/data -w //data $(IMAGE) \
		account new --datadir ./$(DATA_DIR) --password ./$(PASSWORD) \
		| sed -n 's/.*Public address of the key:[[:space:]]*//p' | head -n 1); \
	echo $$VALIDATOR > .validator; \
	echo "   Validator = $$VALIDATOR"
	@echo ">> Creating relayer account"
	@RELAYER=$$(docker run --rm -v "$(CURDIR)":/data -w //data $(IMAGE) \
		account new --datadir ./$(DATA_DIR) --password ./$(PASSWORD) \
		| sed -n 's/.*Public address of the key:[[:space:]]*//p' | head -n 1); \
	echo $$RELAYER > .relayer; \
	echo "   Relayer   = $$RELAYER"

.PHONY: genesis
genesis:
	@echo ">> Generating genesis.json (Clique PoA)"
	@python genesis_gen.py

.PHONY: compose
compose:
	@echo ">> Generating docker-compose.yml"
	@python compose_gen.py

.PHONY: init-chain
init-chain:
	@echo ">> Initializing chain"
	@docker run --rm -v "$(CURDIR)":/data -w //data $(IMAGE) \
		--datadir ./$(DATA_DIR) init ./$(GENESIS)

# ===== RUN =====
.PHONY: up
up:
	@echo ">> Starting geth"
	@docker compose up -d
	@echo ">> Done"
	@echo "Validator: $$(cat .validator)"
	@echo "Relayer  : $$(cat .relayer)"

.PHONY: down
down:
	@docker compose down
