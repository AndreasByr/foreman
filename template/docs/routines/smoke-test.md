# Smoke test of the autopilot chain

Send this text as the payload when a routine is new or changed. It changes nothing.

```
Foreman task: functional-test | unit: -
Read package.json (or the main build file), name the project and its framework version. Run one worker task with role research through tools/delegate/run_task.py that answers the same question. Report the role and model the wrapper used. Change nothing, commit nothing.
```

Success: the run answers, names the role and the model from `tools/delegate/config.toml`, and leaves no commit. The work run answers a bare `functional-test` with "Function test ok".

Check the dispatcher before enabling it: `dispatcher/dispatch.sh --dry-run` prints what it would start without calling any fire URL.
