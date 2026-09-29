# Collaborative Agent Hackathon – Stanford, CA, 2026

> Source: Flower forum post by dimitris (copied 2026-09-29). Hyperlinks from the original post were not preserved; see `docs/research.md` for resolved links.

It is great to have you taking part in our Collaborative Agent Hackathon in Stanford! As participants, you will be among the first to get limited access to Flower Agent and explore what becomes possible when collaborative AI runs on SuperGrid.

This post is the main reference point for the day, with information about the schedule, tracks, technical resources, demos, and support.

You do not need to arrive with a team or a finished idea. We will help you form teams, choose a direction and turn your ideas into working projects during the day.

## At a glance

- **Date:** Tuesday, 29 September 2026
- **Time:** 9:30 am to 7:30 pm
- **Venue:** 389 Jane Stanford Way, Stanford

Registration and a light breakfast start at 9:30 am. Lunch, refreshments and snacks will be provided. Project demos begin at 5:15 pm, and prizes are awarded at 6:45 pm.

## Before you arrive

1. **Create or verify your Flower Account.** If you do not already have one, create your Flower Account. Have the username registered to your account ready on the day.
2. **Install a Python package and project manager.** `uv` is recommended; any other Python package/project manager works too.
3. **Read the Flower Agent documentation.** You do not need to build a complete project in advance, but the tutorials will help you get started quickly (see Warmup below).
4. **Join the Flower Slack workspace**, then join `#hackathon_stanford_2026`. Used for announcements, support and questions.
5. **Bring your laptop and cables.** Extension cords will be provided but supplies may be limited — bring a power strip if you have one.

To use Flower Agent on SuperGrid, the Flower team will help with access and allow-listing at the start of the day. Your registered Flower Account username will help them get you set up quickly.

## Warmup

Familiarize yourself with the Flower Agent workflow before you arrive:

- Use SuperGrid to interact with Flower Agents
- Use Flower Chat to run agents in the terminal
- Build a custom AgentApp
- Run your AgentApp on SuperGrid
- Run your AgentApp with a local SuperLink
- Use connectors on SuperGrid

You do not need to complete every tutorial. A quick look at the relevant sections will make it easier to choose a direction and start building on the day.

## Schedule

| Time  | Item |
|-------|------|
| 9:30  | Opening, check-in and breakfast — meet other participants and share interests and experience |
| 10:00 | Welcome — introduction to the event, the challenge, and practical arrangements |
| 10:15 | Flower Agent technical demo — collaborative agent architectures, safe coordination, self-improvement loops, available Flower resources |
| 10:30 | Team formation, hacking starts — teams of 2–4; define the project, design agent interactions, start implementing |
| 12:30 | Lunch |
| 13:00 | Build session — develop and test, refine the collaboration or self-improvement loop, prepare the demo. Mentors available throughout |
| 16:30 | Demo prep — submission reminder, refine final demos |
| 17:15 | Demos begin — teams present, followed by brief questions |
| 18:00 | Dinner |
| 18:45 | Awards and closing remarks |
| 19:30 | Finish |

## The challenge: Flower Agent Harness

Showcase the collaborative aspect of Flower Agents running on SuperGrid. Use the existing SuperGrid infrastructure and show how multiple Flower Agents can work together to solve problems, coordinate tasks, and achieve more than a single agent could on its own. You might build an agent chain in which multiple agents contribute to a result, or use multiple `AgentApp`s that share context and hand work between agents.

**Bonus points if you use the recently released Endeavor model.**

## Support during the day

Mentors will be available throughout the day to help with setup, ideas, and technical questions. Updates are posted regularly in `#hackathon_stanford_2026`. Ask questions in Slack or speak directly to any member of the Flower Labs team.

## Flower AgentApp templates

The **Flower AgentApp** and **Flower Collaborative AgentApp** are good starting points.

- **Flower AgentApp** receives the current prompt together with the conversation's previous user and assistant messages.
- **Collaborative AgentApp** comes with Grid tools enabled, allowing agents to sample other agents in a federation, send messages to them, and retrieve their responses. Details on running it across Flower SuperNodes are in the associated GitHub repo.

## Configuring a SuperNode's model endpoint

For a SuperNode to access a model provider, configure these environment variables.

**Models served via Flower AI:**

```bash
export FLWR_MODEL_API_KEY="<YOUR-FLOWER-API-KEY>"
```

Generate the key on flower.ai via **Profile → Settings → API Keys**. Model names follow the OpenRouter format, e.g. `openai/gpt-5.6-sol`.

**Models served via Nebius Token Factory:**

```bash
export FLWR_MODEL_API_ENDPOINT="https://api.tokenfactory.tf-ca1.nebius.com/v1/responses"
export FLWR_MODEL_API_KEY="<NEBIUS-API-KEY>"
```

The `<NEBIUS-API-KEY>` is shared during the hackathon in the Slack channel.

Related guides:
- Spinning up a Flower SuperNode on a Nebius Serverless AI endpoint
- Nebius Token Factory available endpoints

## Submission and demos

Before the demos, each team submits:

- Team details: team name, members, and email addresses (via the registration form)
- Published Flower Hub app (publish your AgentApp per the Flower Hub instructions)
- Short project description
- GitHub repository link

Each team has **3–5 minutes** to present, followed by judges' questions. Focus the demo on:

- How Flower Agent and SuperGrid enable your solution
- The problem you are solving
- The working result

## Prize evaluation criteria

Agent performance may inform the assessment but is not the sole or decisive factor. Projects are assessed around the primary theme of **Collaborative Agents**:

- **Use of Flower** — how much the project uses Flower Agents and SuperGrid
- **Impact & Originality** — the unique value the project creates
- **Demo & Delivery** — how clearly the approach and results are presented

## Partners and prizes

Partners: **Nebius, ARM, AMD**.

Prizes go to the top three projects, with a total prize pool worth up to **$5,000**.

## FAQ (questions listed in the post; answers were collapsed)

- How many people should be on a team?
- Can I ask questions to the Flower team?
- Is there a credit limit for running agents on SuperGrid?
- Is there a time limit for running AgentApps on SuperGrid?
- I have some feedback! Where/who can I share it with?
