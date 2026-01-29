.PHONY: *

pretty:
	npx prettier --ignore-path ../.prettierignore --write .

css:
	npx @tailwindcss/cli -i ./input.css -o ./output.css

create-version:
	@if [ -z "$(v)" ]; then \
		echo "Error: Version 'v' is not defined. Usage: make create-version v=x.x.x"; \
		exit 1; \
	fi
	mkdir -p v/$(v)
	cp index.html v/$(v)/
	cp Code.js v/$(v)/
	cp output.css v/$(v)/
	cp utils.js v/$(v)/
	cp access.js v/$(v)/
	cp events.js v/$(v)/
	cp roles.js v/$(v)/
	cp keys.js v/$(v)/
	cp script.js v/$(v)/
