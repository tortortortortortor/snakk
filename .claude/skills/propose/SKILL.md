---
name: propose
description: Write up an open design or product question for snakk with 2-3 concrete options and a recommendation, post it to the build log as a proposal, and ask Tor. Use before starting a milestone, when a choice changes what gets built, or when the user says "propose", "what are the options", or "what should we do next".
---

# Propose

1. Frame the question in one sentence from Tor's side (what he will see or do differently).
2. Gather facts first: read the relevant code, run the app or a replay (`/demo`), check docs. A proposal states what was checked.
3. Write 2-3 options. For each: what it looks like on screen, cost in work, risk. Mark one as **Recommended** and say why in one sentence.
4. Add or update the `proposal` entry at the top of `docs/buildlog/entries.json` (one bold lead per question, as in the existing entry), then follow the `/buildlog` steps to rebuild and republish.
5. In the terminal, ask Tor with AskUserQuestion (recommended option first, labelled "(Recommended)") and link the build log. If he is not around, proceed with the recommendation only when it is cheap to reverse, and log that as a decision.
6. When answered: turn the paragraph into a `decision` entry and remove it from the open proposal.
