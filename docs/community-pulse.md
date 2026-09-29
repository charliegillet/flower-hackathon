# Community Pulse: Flower Agent / SuperGrid (last 30 days)

> Generated 2026-09-29 with `/last30days` v3.3.1 (Reddit, HN, GitHub, Web; X not configured). Raw dump: `~/Documents/Last30Days/flower-agent-supergrid-raw-v3.md`.

## Summary

**Almost no social chatter about Flower Agent yet.** Across 37 Reddit threads, 4 HN stories and GitHub, nothing high-signal is specifically about Flower Agent or SuperGrid. Reddit and HN results were general AI discussion that the engine demoted as off-entity. The product is new and experimental, and the docs say so: "Flower Agent is experimental. Its interfaces and behavior may change between releases." In practice this means the official docs, the GitHub repo and the Flower Slack are the only reliable sources. It also means there is very little prior art to compete with.

**Endeavor 1.0 has the press coverage.** [Flower Labs](https://flower.ai/blog/2026-09-01-introducing-endeavor-1.0) announced Endeavor 1.0 on 2026-09-01. It is a frontier generalist built for long-horizon agent work. Reported scores: GPQA 92.0, HumanEval 98.2, AIME 2026 99.9, IFEval 94.1. [tech.eu](https://tech.eu/2026/09/01/cambridge-university-spinout-launches-ai-model-competitive-with-openai-and-anthropic/) and [BM Magazine](https://bmmagazine.co.uk/ai/flower-labs-endeavor-ai-model-launch/) framed it as a Cambridge spinout competing with GPT-5.6 Sol and Claude Fable 5. It is a preview with access by request, available as a managed service or a private deployment. The hackathon gives bonus points for using it.

**The multi-agent primitive is new in 1.38.** The [Flower 1.38.0 release](https://github.com/flwrlabs/flower/releases/tag/framework-1.38.0) lets AgentApps run on both the SuperLink and the SuperNodes. Grid tools `get_nodes`, `push_messages` and `pull_messages` let a coordinator agent discover nodes and exchange JSON messages with agents running on them. The same release adds:
- SuperNode `--name` / `--location` metadata
- a read-only FileSystem connector
- Endeavor integration guides for Codex and OpenCode

This is the core of the "collaborative agents" challenge.

**A Berlin hackathon already happened this month.** [PreventNet](https://github.com/NishankKS/PreventNet) took 2nd place at the Flower Collaborative Agent Hackathon in Berlin (Sep 2026). It is built as follows:
- GP, Pharmacy and Lab agents each read only their own institution's records.
- A coordinator sees only disclosed facts.
- A deterministic, code-enforced verifier approves or blocks results.
- A vertical federated-learning risk model runs across the three institutions.
- Endeavor acts as the coordinator.

PreventNet did not use SuperNodes or `agent.grid`, so a project that does use the grid has room to stand out on "Use of Flower". [Soteria](https://github.com/kaiser-data/Soteria) is another public AgentApp example.

**Community explainers are starting to appear.** A Chinese-language [GitCode guide](https://blog.gitcode.com/defadff9863fb1272619799312fb43ef.html) (2026-09-16) walks through AgentApp, connectors, run state and SuperGrid. It is the first third-party long-form write-up.

## Key patterns

1. Documentation is the source of truth. Social signal is near zero, so rely on the docs in `docs/flower-agent-docs/` and on the mentors.
2. `agent.grid` across SuperNodes is the differentiator, and the Berlin runner-up did not use it ([release notes](https://github.com/flwrlabs/flower/releases/tag/framework-1.38.0)).
3. Privacy-preserving cross-institution collaboration is the proven winning story ([PreventNet](https://github.com/NishankKS/PreventNet)).
4. Endeavor is the flagship talking point. Use it for the coordinator or the reasoning role ([Flower blog](https://flower.ai/blog/2026-09-01-introducing-endeavor-1.0)).

## Stats

```
✅ All agents reported back!
├─ 🟠 Reddit: 37 threads │ 16,693 upvotes │ 4,726 comments
├─ 🟡 HN: 4 storys │ 420 points │ 236 comments
├─ 🐙 GitHub: 1 item │ 7,150 reactions │ 392 comments
├─ 🌐 Web: 16 pages - bmmagazine.co.uk, blog.gitcode.com, linkedin.com, flower.ai, tech.eu, discuss.flower.ai, arxiv.org
├─ 🗣️ Top voices: r/MachineLearning, r/LocalLLaMA, r/LangChain
└─ 📎 Raw results saved to ~/Documents/Last30Days/flower-agent-supergrid-raw-v3.md
```
