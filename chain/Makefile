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
	-@docker compose down -v
	-@docker rm -f $(CONTAINER)
	@echo ">> Removing old data"
	@python cleanup.py

# ===== INIT =====
.PHONY: init
init: accounts genesis compose init-chain

.PHONY: accounts
accounts:
	@python init_chain.py accounts

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
	@python init_chain.py init-chain

# ===== RUN =====
.PHONY: up
up:
	@echo ">> Starting geth"
	@docker compose up -d
	@echo ">> Configuring IPFS CORS"
	@sleep 5
	@docker exec carbon-ipfs ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin "[\""*\""]" || echo "IPFS config warning"
	@docker exec carbon-ipfs ipfs config --json API.HTTPHeaders.Access-Control-Allow-Methods "[\""PUT\"", \""POST\""]" || echo "IPFS config warning"
	@docker restart carbon-ipfs
	@echo ">> Done"
	@echo "Validator: $$(cat .validator)"
	@echo "Relayer  : $$(cat .relayer)"

.PHONY: down
down:
	@docker compose down
