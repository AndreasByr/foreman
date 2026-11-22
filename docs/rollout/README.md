# Rollout orders for `foreman-update`

## Purpose

Ready-made orders to update three installed projects with `foreman-update`. Written for the 0.2.x close. The projects are called project A, project B and project C. Real names stay out of this repo.

This repo only prepares the orders. Nothing runs against a project from here.

## Order of rollout

Order: project C, project A, project B.

1. Project C goes first. It is the go/no-go project: its result decides whether A and B follow.
2. Then project A.
3. Then project B.
4. One project is fully done (all boxes in its file checked) before the next one starts.

## How to use

1. [ ] Open the chat for the project.
2. [ ] Say "update foreman".
3. [ ] Paste the project file (`project-C.md`, `project-A.md` or `project-B.md`).
4. [ ] Fill in `Installed version:` and `Target:` before you paste.
5. [ ] Work through "Checklist outside the repo" and "After the update" yourself.

## What the human decides

- Which version or commit is the `Target:`.
- Go or no-go after project C.
- The version number is not touched here. The foreman release is a separate order.
