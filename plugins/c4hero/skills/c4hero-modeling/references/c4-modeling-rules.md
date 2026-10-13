# C4 modeling rules

Concise rules for models authored through c4hero. The four levels, from outermost in: context, containers, components, code (c4hero models the first three plus dynamic and deployment views).

## Levels and what belongs where

| Level | Element | Is | Examples |
| --- | --- | --- | --- |
| 1 | Person | A human role that uses the system | Customer, Back-office Clerk |
| 1 | Software system | Something that delivers value as a whole; owned by a team | E-Commerce Platform; external: Stripe, SendGrid |
| 2 | Container | A separately runnable or deployable unit that must run for the system to work, including data stores | Web SPA, API, Order Service, PostgreSQL, RabbitMQ |
| 3 | Component | A grouping of related code behind one interface inside a container, not separately deployable | OrderController, PaymentGateway client, Auth module |

Container, in C4, is not a Docker container. Decide by deployability: if it has its own process or datastore and is deployed on its own, it is a container. A library, package or class cluster in the same process is a component. A queue or database is a container, never a component.

## Rules

1. **Start at the top.** Create persons and systems, then containers of the system in focus, then components only for containers that are complex enough to need them. Do not skip a level: no components without their container, no containers without their system. Do not model code-level classes.
2. **One view per scope.** One system landscape, one system-context view per system of interest, one container view per system, one component view per container, dynamic views per scenario. Do not mix levels in a view; a container view shows containers plus the persons and external systems around them.
3. **Name for the domain, not the tool.** "Order Service" over "Spring App"; the technology goes in `--technology`. Use singular, title-case names, unique across the model (c4hero suffixes duplicates with `2`, which is never what you want). The same thing has the same name everywhere.
4. **Every element gets a description** (one sentence of responsibility, not the name restated) and every container and component a technology ("Java, Spring Boot", "PostgreSQL 15"). `check` flags both.
5. **Relationships are verb phrases that read left to right**: "Places orders using", "Reads from and writes to", "Publishes order events to". Never "uses" alone or "calls". Add the technology and protocol on each relationship ("HTTPS/JSON", "gRPC", "AMQP", "SQL"). Use `--interaction-style Asynchronous` for events and queues.
6. **Model the direction of the dependency**, not the data flow: an API reading from a database is `api -> database`. Show one relationship per meaningful interaction; avoid duplicates between the same pair unless they differ in purpose, and avoid an all-to-all mesh.
7. **External systems are black boxes.** Model third-party and out-of-scope systems as software systems with `--external` (Stripe, an identity provider, a partner API) and never decompose them. Internal systems that your team owns are internal even if the model does not drill into them yet.
8. **Declare relationships at the most specific level you know** (container to container, not system to system), so context and container views show real dependencies.
9. **Mark lifecycle and ownership**: `--status Planned|Live|Deprecated|Removed`, `--owner <team>` for anything with an owner; tag cross-cutting categories (`Database`, `Queue`, `Legacy`) with `--tags` and style them with `c4hero style element --tag`.
10. **Avoid orphans.** Every element should have at least one relationship; `check` reports orphans. Remove or connect them.
11. **Keep views readable**: roughly 5 to 12 elements per view. Split by concern or use a dynamic view for a scenario rather than a bigger diagram.

## Quick checklist before finishing

- Right level and parent for each new element, no skipped levels.
- Description and technology present, names unique and domain-based.
- Relationships have a verb phrase, a technology, and the right direction.
- External systems flagged external; no internals modeled for them.
- Docs linked for non-trivial elements (`link-doc`), `c4hero check` clean.
