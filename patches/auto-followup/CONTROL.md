# Does the responder help? Nobody has measured it

Every change in this folder so far was argued from a transcript: a question was
asked three times, a demand was never followed up, an axis was worked below its
ceiling. All of that is real and all of it is about the loop's *behaviour*. None
of it says the loop produces a better outcome than not running it.

That distinction has a name in the literature this design borrows from. Huang et
al. (`arXiv:2310.01798`, ICLR 2024) make it their second recommendation to
anyone proposing a self-correction method:

> Evaluating self-correction against baselines with comparable inference costs.
> By design, self-correction requires additional LLM calls, thereby increasing
> the costs [...] we encourage future work proposing new self-correction methods
> to always include an in-depth inference cost analysis to substantiate claims of
> performance improvement.

The responder costs an extra Opus call at max effort on every turn, and it also
costs the turns themselves - a night of forty exchanges with it is not a night of
forty exchanges without it. So the honest comparison is not "with the responder
against nothing", it is **with the responder against the same number of turns and
the same money spent without it**.

## The arms

Both arms start from the same place and are given the same budget.

- **A, the responder.** Armed, autosend on, N turns.
- **B, the control.** Not armed. The same N turns, each one a plain "keep going"
  from the person, no follow-up written by a second model.

Held fixed across the pair:

- the starting worktree and commit, recorded by hash
- the responder file, byte for byte, and the model and effort it names
- the starting measurement, from the rig and not from a memory of it
- N, decided before either arm runs and not adjusted after
- the machine is idle otherwise - one GPU job at a time on SOFI, and an orphan
  holding memory has invalidated measurements here before

## What is recorded

One number, and it is the one the goal names: **prefill seconds on the standard
input, from the rig**, before and after. Not turns taken, not claims recorded,
not axes priced - those are the things that look like progress and were the
things this loop produced while the seconds did not move.

Alongside it, so the cost side of Huang's recommendation is answerable:

- wall-clock hours from the first message to the last
- number of exchanges
- number of rig runs, and machine minutes inside them

## The rule that makes it worth doing

Decide before the arms run what result would change the responder, and write it
down. Something like: if B removes as many seconds as A, the responder is not
paying for itself and the next change to it is deletion, not tuning. If that
sentence is written afterwards it is a description, not a decision - three
ablation ladders on this project collapsed for exactly that reason.

## Running it

`tools/control-arm.mjs` records an arm and prints the pair when both exist. It
does not run anything: it holds the numbers so the comparison exists at all,
which is more than there was.

    node tools/control-arm.mjs start A --base 53.8 --turns 20 --note "perf-skeptic acb6be4"
    node tools/control-arm.mjs end   A --after 51.9 --exchanges 20 --rig-runs 6 --machine-min 42
    node tools/control-arm.mjs start B --base 53.8 --turns 20 --note "no responder"
    node tools/control-arm.mjs end   B --after 52.4 --exchanges 20 --rig-runs 4 --machine-min 31
    node tools/control-arm.mjs show

Arms live in `<config>/responders/_control.json`, beside the responders, because
that folder is already the one thing about this loop that survives a reload.
