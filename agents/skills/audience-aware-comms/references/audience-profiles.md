# Audience Profiles

Reader cards for recurring recipients, read only when one matches the task. One card per
recipient, limited to roles and durable communication preferences — never sensitive
personal data.

## Template

```
### <handle or role>
Reads how: <skims 30s / reads closely / reads on mobile>
Knows: <what they already have context on>
Doesn't: <what must be spelled out>
Cares about: <the axis they judge on — risk, cost, speed, correctness, optics>
Sensitive to: <being rushed, being over-explained to, surprises, scope creep>
Default register: <terse / formal / warm / direct>
Leave unsaid by default: <recurring load-bearing omissions>
```

## Profiles

### code-reviewer (default)

Reads how: skims first, reads diff closely if the summary earns it
Knows: the codebase and conventions
Doesn't: your debugging journey, dead ends you already ruled out
Cares about: is this safe and correct to merge, and how fast can I approve it
Sensitive to: aired uncertainty, walls of text, unscoped changes
Default register: terse, factual
Leave unsaid by default: speculation about causes you've already mitigated

### external-advisor (billed hourly)

Reads how: reads closely; time is literally money
Knows: the engagement's background
Doesn't: internal deliberations unless relevant to their advice
Cares about: a crisp question with a clear decision boundary
Sensitive to: being chased, vague asks that burn billable time
Default register: formal, respectful, brief
Leave unsaid by default: parallel options you're weighing elsewhere
