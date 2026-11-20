# Schedule, dependency overview, summary

## Header and schedule (top of the roadmap)

The header names the version, target branch and `**Tracker:** itsaplan (<link>) | linear (<link>) | none`. Directly after it comes "The schedule", so readers see at once what runs in parallel.

```markdown
## The schedule

Several milestones run in parallel (one batch branch each). The longest strand sets the duration, not the sum.

| Strand | Milestones (coding + testing) | Duration |
|---|---|---|
| **<Strand A>** (critical path) | M001 (2+2) -> M003 (4+3) -> M004 (5+4) | 20 days |
| <Strand B> | M001 -> M005 (3+3) | 10 days |
| <Strand C> | M002 (4+3) -> M006 (3+3) | 13 days |
| Release | M007 (1+3), when all strands are approved | 4 days |

| Measure | Value |
|---|---|
| Coding total | <X> working days |
| Testing total | <Y> working days |
| Critical path (longest strand + release) | <Z> working days |
| **+ 15 percent rework buffer** | **~<Z x 1.15> working days = <W> weeks** |

The bottleneck is UAT: <tester> approves every milestone. Parallel strands mean several milestones wait for approval at the same time. The agent pretest beforehand keeps UAT short.
```

## Dependency overview (after all milestones)

```markdown
## Dependency overview

| Milestone | Strand | Coding | Testing | Depends on | Blocks |
|---|---|---|---|---|---|
| M001: Foundation | A, B | 2-3 d | 2-3 d | - | M003, M005 |
| M002: Core Feature | C | 3-5 d | 3-5 d | - | M006 |
| M003: Integration | A | 2-3 d | 2-4 d | M001 (approved) | M004 |

"approved" = testing approval of that milestone is required before the dependent starts.

**Parallel strands:** start together with <M001, M002, ...>. After M001, <M003, M005> run in parallel. The release starts when all strands are approved.
**Critical path:** M001 -> M003 -> M004 -> M007
**Testing bottleneck:** UAT across parallel strands; most effort in <milestone>, because <reason>.
```

## Summary

```markdown
## Roadmap summary

| # | Milestone | Type | Strand | Coding | Testing | Total | Depends on |
|---|---|---|---|---|---|---|---|
| M001 | <name> | Foundation | A, B | 2-3 d | 2-3 d | ~5 d | - |

**Plan value (critical path with 15 percent rework, milestones in parallel):** ~<X> days
**For comparison, purely sequential:** ~<Y> days
**Testing share of total effort:** ~<Z> percent
**Earliest release date:** <date or "X days after start">

### Open risks
- <external API not production-ready -> integration milestone may block>
- <UAT capacity when several strands finish together>
- <parallel strands change the same files (schema, migrations, translations) -> merge conflicts>

### Agent coding notes
- <which milestones need especially clear briefs or much context>
- <where hallucination risk is high: complex business rules, unclear APIs>
- <which shared files parallel milestones may only extend, not rebuild>
```
