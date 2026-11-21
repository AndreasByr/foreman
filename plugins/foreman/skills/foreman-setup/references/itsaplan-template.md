# itsaplan project template

Import the foreman project template into the itsaplan workspace once. Done by `foreman-setup`, after install.

## When this step runs

Run this step only when the modules include `tracker-itsaplan`. Skip this step only when the human says "quick prototype" or the tracker is not itsaplan. The skip is never inferred from other answers.

## Steps

**a)** Call `list_project_templates` of the itsaplan tool. If a template named `foreman` exists, do nothing. Never import twice: an existing `foreman` template stays as it is.

**b)** Otherwise read `plugins/foreman/skills/foreman-setup/references/itsaplan-project-template.json` (the repo copy next to this file). Call `import_project_template` with its content as `template` and the name `foreman`.

**c)** Call `list_project_templates` again. Tell the human the template is there.

**d)** If the tool is missing or the key lacks permission, report it instead of guessing or working around it, and name the fix for the human.

**e)** Record `foreman template imported` in the summary line for the human. This step writes no file.

## What the template carries

- 8 status columns, 10 labels, the view "UAT ready" and 3 issue templates (Intervention, UAT, Update notice).
- No people.
- The bot account is never added by the agent. The human adds it per project.
- This step never touches existing projects or exports from them.
