.PHONY: *

pretty:
	npx prettier --ignore-path ../.prettierignore --write .

css:
	npx @tailwindcss/cli -i ./input.css -o ./output.css --watch

create-version:
	@if [ -z "$(v)" ]; then \
		echo "Error: Version 'v' is not defined. Usage: make create-version v=x.x.x"; \
		exit 1; \
	fi
	mkdir -p v/$(v)
	cp index.html v/$(v)/
	cp Code.js v/$(v)/
	cp output.css v/$(v)/
	cp script.js v/$(v)/
	cp google-api.js v/$(v)/
	cp test-utils.js v/$(v)/
	cp tools.js v/$(v)/
