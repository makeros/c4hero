---
name: model-from-codebase
description: Builds or updates a C4 architecture model from an existing codebase. Use when someone asks to model, diagram or document the architecture of a repository, to "reverse-engineer" services and data stores into a Structurizr/c4hero workspace, or to sync an existing model with what the code now contains.
---

# Model from codebase

Discover what the system is made of, show the user a proposal, and only then write it
through `c4hero apply --plan`. The c4hero CLI is run as described in the `c4hero-modeling`
skill (the plugin ships it as `node "${CLAUDE_PLUGIN_ROOT}/bin/c4hero.mjs"`); `<c4hero>` below
stands for that command.

## Rules

- NEVER write to the model before the user has confirmed the proposed element list.
- NEVER delete or rename existing elements without asking. Update mode proposes additions
  and changes; deletions are listed separately as questions.
- Write only through `<c4hero> apply --plan <file.json>`, then `check`. No hand-written DSL.
- Do not invent. Every element and relationship in the proposal cites the file it came from;
  mark guesses as "unverified".

## Step 1: Discover

Read, in this order, whatever exists (Glob/Grep, do not read whole trees):

| Source | Yields |
| --- | --- |
| `README*`, `docs/`, ADRs (`docs/adr*`, `docs/decisions`) | Product name, purpose, actors, existing markdown to link |
| `package.json` (and `workspaces`), `go.mod`, `pom.xml`, `build.gradle*`, `pyproject.toml`, `Cargo.toml`, `*.csproj` | Deployable units, frameworks (technology), client libraries for data stores and queues |
| `docker-compose*.yml`, `Dockerfile*` | Runnable services, databases, brokers, caches, ports, `depends_on` links |
| `k8s/`, `helm/`, `charts/`, `kustomization.yaml` | Deployments, StatefulSets, ingress, service-to-service env vars |
| `*.tf`, `serverless.yml`, `template.yaml`, `cdk` | Managed databases, queues, buckets, functions |
| `openapi*.{yml,json}`, `asyncapi*`, `*.proto`, GraphQL schemas | Service interfaces, topics, consumers and producers |
| `.env.example`, config files | External endpoints and third-party APIs (Stripe, SendGrid, Auth0, ...) |

Existing model: if a workspace exists (`<c4hero> list`, `<c4hero> graph`, `<c4hero> views`), this is
update mode (Step 5). If none exists, run `<c4hero> init --template blank --name "<Product>"`
after confirmation.

## Step 2: Map to C4

- One software system per product being modelled (not per repository).
- Containers: each deployable or runnable unit (API, web app, worker, function group) and
  each data store or queue the system owns (database, cache, broker, bucket).
- External software systems (`external: true`): third-party or other teams' systems the code
  calls (payment, email, identity, partner APIs). They get no containers.
- People: human actors named in docs, auth roles or UI entry points.
- Technology on every container and relationship (`Node.js, Express`, `PostgreSQL`, `HTTPS`,
  `AMQP`). Description is a short role, not a restatement of the name.
- Relationship labels are verb phrases: "Reads orders from", "Publishes events to".
- Do not model libraries or internal packages as containers. Add components only if the
  user asks for that level.

## Step 3: Propose and confirm

Present, before any write:

1. Elements: id (camelCase), type, name, technology, description, source file.
2. Relationships: source -> destination, label, technology, source file.
3. Views to create (system context, and a container view; adding the first containers auto-creates
   a container view keyed `<systemId>-container`, so do not add another).
4. Existing markdown to link, with the element each file belongs to.
5. Uncertainties and anything skipped.

Then ask for confirmation or changes and STOP. Proceed only on an explicit yes.

## Step 4: Write

Write the plan to a temporary JSON file outside the repo (or in the scratchpad), preview, apply:

1. `<c4hero> apply --plan plan.json --dry-run` and show a summary of the diff.
2. `<c4hero> apply --plan plan.json`. Read `data.refs`: it maps each plan `ref` to the real
   element id (derived from the name, e.g. `Orders API` -> `ordersApi`). Use those ids from here on.
3. `<c4hero> link-doc <id> --path <repo-relative.md> --title "<title>"` for each confirmed doc.
4. `<c4hero> check`. Fix errors; report warnings (missing descriptions, orphans) to the user.

Plan format (an `EditPlan`; max 300 operations; validated on read, bad ops are listed in
`data.rejected`):

```json
{
  "operations": [
    { "op": "addPerson", "ref": "customer", "name": "Customer", "description": "Buys goods" },
    { "op": "addSoftwareSystem", "ref": "shop", "name": "Shop", "description": "Online shop" },
    { "op": "addSoftwareSystem", "ref": "stripe", "name": "Stripe", "description": "Card payments", "external": true },
    { "op": "addContainer", "ref": "web", "parent": "shop", "name": "Web App", "description": "Storefront SPA", "technology": "React" },
    { "op": "addContainer", "ref": "api", "parent": "shop", "name": "Orders API", "description": "Checkout logic", "technology": "Node.js, Express" },
    { "op": "addContainer", "ref": "db", "parent": "shop", "name": "Orders Database", "description": "Stores orders", "technology": "PostgreSQL", "tags": ["Database"] },
    { "op": "addRelationship", "source": "customer", "destination": "web", "description": "Browses and orders", "technology": "HTTPS" },
    { "op": "addRelationship", "source": "web", "destination": "api", "description": "Calls", "technology": "JSON/HTTPS" },
    { "op": "addRelationship", "source": "api", "destination": "db", "description": "Reads and writes orders", "technology": "SQL" },
    { "op": "addRelationship", "source": "api", "destination": "stripe", "description": "Charges cards", "technology": "HTTPS" },
    { "op": "addView", "viewType": "systemContext", "scope": "shop", "title": "Shop context" }
  ]
}
```

Ops: `addPerson`, `addSoftwareSystem` (`external`), `addContainer`/`addComponent` (`parent`,
`technology`), `addRelationship` (`source`, `destination`), `updateElement` (`id`, plus `name`,
`description`, `technology`, `location`, `tags` (added), `status`, `owner`), `updateRelationship`,
`deleteElement`, `addView` (`viewType`, `scope`, `title`). Order is free within dependencies: a `ref`
may be used by operations that follow its definition. Existing elements are addressed by real id.

## Step 5: Update mode

1. Read the current model: `list`, `graph`, `views`, `show <id>` for anything near a change.
2. Match discovered units to existing elements by name and technology, not by position.
3. Propose: new elements and relationships (`add*`), changed technology or description
   (`updateElement`), and, as questions, elements that no longer appear in the code
   (candidates for `status: "Deprecated"` or removal).
4. After confirmation, apply as in Step 4 using existing ids as `parent`/`source`/`destination`.
   Run `check` at the end.

If the CLI refuses with `LOSSY_FILE`, stop and use the `structurizr-dsl` skill; do not pass
`--force` without the user's answer.
