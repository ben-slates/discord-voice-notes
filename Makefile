.PHONY: all build test package install uninstall doctor clean restore

SHELL := /bin/bash

all: build test

build:
	@bash scripts/build.sh

test:
	@npm test

package: build test
	@bash scripts/package.sh

doctor:
	@bash scripts/doctor.sh

install:
	@bash scripts/install.sh --userplugin

restore:
	@bash scripts/restore-discord.sh

clean:
	@rm -rf dist/
	@echo "Clean completed."
