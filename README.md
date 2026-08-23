# When creating changes and pushing new features,
> base the branch name on the user story ID from google sheets. US-# means User Story - Number. Click the badge below and click it again to redirect.

> ![Static Badge](https://img.shields.io/badge/GoToSheets-Go%20to%20Sheets?style=flat&logo=googlesheets&logoColor=%23ededed&labelColor=%2334A853&color=%23262626&link=https%3A%2F%2Fdocs.google.com%2Fspreadsheets%2Fd%2F1ADfgh4PM9Fk8Xh18J7MifoSNttUOsJ6lcGwPBCcKN_0%2Fedit%3Fusp%3Dsharing)

> do this on ur terminal
## 1. Create and switch to your feature branch
git checkout -b BranchNameMo 
> BranchNameMo is the branch name. Branch name should be the user story id sa google sheets.

## 2. Add and commit your changes
git add .
> add . means add all of the changes na ginawa mo

git commit -m "feat: complete US-006 work"

> commit -m means magccommit ka ng message. within the "" ung msg mo

## 3. Push and automatically create a Pull Request from your terminal!
gh pr create --title "US-#: Name ng Feature" --body "Closes US-006"
> gh = github 

>pr create = pull request create

> if hindi mo siya nagawa sa issang push lang, same pa rin na US-# gamitin

> automatic siyang magppush sa branch mo and create a pull request sa main. Pag nangyare un, automatik na siyang qquality check para malaman kung okay na siyang mamerge. ensuring the quality is mah domain yes i

> pull request means iccombine ung code na un sa main
