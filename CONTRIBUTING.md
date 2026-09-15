# Contributing

Use pull requests against `main`. Branch names should follow:

- `feature/frontend-*`
- `feature/backend-*`
- `feature/db-*`

Keep feature work separate from scaffold and infrastructure changes.

## Automated Issue Tracking
This repository uses automated GitHub Actions that parse AddressMe.md files located in artifacts/frontend/AddressMe.md and artifacts/api-server/AddressMe.md to automatically generate tracked issues and assignees.

To trigger an issue upon pushing, format your AddressMe.md file using the following structure:

Line 1: The exact GitHub username of the assigned contributor. If left blank or set to none, no issue will be created.

Line 2 onwards: The complete description, bug details, or task breakdown for the issue (written in Markdown).

For frontend issues, add 'niqui' and 'AyannaCL' on line 1 of artifacts\frontend\AddressMe.md; For backend issues, add 'AvrilMatanguihan' and for prisma, database issues, add 'Mashoge' on line 1 on artifacts\api-server\AddressMe.md. 

If there are no issues, do not put any names on line 1.