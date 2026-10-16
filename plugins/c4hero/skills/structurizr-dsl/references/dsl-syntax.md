# Structurizr DSL syntax reference

Syntax checked against https://docs.structurizr.com/dsl/language and against the c4hero
parser. Fence convention: a block tagged `dsl` is a complete workspace and is parsed in
CI by `scripts/check-skill-dsl-examples.mjs`; a block tagged `dsl fragment` is an
excerpt and is not checked.

Parameters in `[brackets]` are optional. Strings are double-quoted. Order of positional
arguments matters: skipping one means writing `""`.

## Workspace skeleton

```dsl
workspace "Shop" "Online shop" {
  model {
    customer = person "Customer" "Buys goods"
    shop = softwareSystem "Shop" "Sells goods" {
      web = container "Web App" "Storefront" "React"
      api = container "API" "Business logic" "Node.js"
      db = container "Database" "Orders" "PostgreSQL" "Database"
    }
    payments = softwareSystem "Payments" "Card processing" "External"

    customer -> web "Browses" "HTTPS"
    web -> api "Calls" "JSON/HTTPS"
    api -> db "Reads and writes" "SQL"
    api -> payments "Charges cards" "HTTPS"
  }
  views {
    systemContext shop "Context" {
      include *
      autoLayout
    }
    container shop "Containers" {
      include *
      autoLayout lr
    }
  }
}
```

## Elements

```dsl fragment
person <name> [description] [tags]
softwareSystem <name> [description] [tags]
container <name> [description] [technology] [tags]    # inside a softwareSystem
component <name> [description] [technology] [tags]    # inside a container
```

`id = element ...` assigns an identifier. Identifiers are case-insensitive and may not
contain spaces. Define an element before anything that references it: forward references
fail with `Unresolved reference`.

Inside an element block: `tags "A,B"` (or `tags "A" "B"`), `url <url>`,
`properties { "key" "value" }`, `perspectives { "Security" "Description" }`, and nested
children.

```dsl
workspace "Metadata" {
  model {
    team = person "Team" "d" {
      tags "Internal,Staff"
      url "https://example.com/team"
      properties {
        "owner" "platform"
      }
    }
    sys = softwareSystem "Sys" "d" {
      app = container "App" "d" "Go" {
        parser = component "Parser" "d" "Go package"
      }
    }
    team -> app "Operates"
    app -> parser "Delegates to"
  }
  views {
    component app "Components" {
      include *
    }
  }
}
```

## Relationships

```dsl fragment
<source> -> <destination> [description] [technology] [tags]
```

Write relationships at the `model` level (or after both ends exist). Inside an element
block, `this -> x` and the shorthand `-> x` are valid Structurizr but c4hero does not
model them (see "What c4hero does not round-trip"). Relationship blocks may hold `tags`,
`url`, `properties` and `perspectives`.

## Groups

```dsl
workspace "Groups" {
  model {
    group "Platform" {
      a = softwareSystem "A" "d"
      b = softwareSystem "B" "d"
    }
    a -> b "Calls"
  }
  views {
    systemLandscape "Landscape" {
      include *
    }
  }
}
```

## Hierarchical identifiers

`!identifiers hierarchical` makes child identifiers dotted (`shop.api`). Without it,
identifiers are flat and every one must be unique. c4hero reads dotted references but
drops the directive on save, so prefer flat identifiers when a file will be edited by
the CLI.

```dsl
workspace "Hierarchical" {
  !identifiers hierarchical
  model {
    shop = softwareSystem "Shop" "d" {
      api = container "API" "d" "Node.js"
      db = container "DB" "d" "PostgreSQL"
    }
    shop.api -> shop.db "Reads" "SQL"
  }
  views {
    container shop "Containers" {
      include *
    }
  }
}
```

## Deployment

```dsl fragment
deploymentEnvironment <name> { ... }
deploymentNode <name> [description] [technology] [tags] [instances] { ... }   # nestable
infrastructureNode <name> [description] [technology] [tags]
containerInstance <containerId> [deploymentGroups] [tags]
softwareSystemInstance <systemId> [deploymentGroups] [tags]
```

```dsl
workspace "Deployment" {
  model {
    shop = softwareSystem "Shop" "d" {
      api = container "API" "d" "Node.js"
      db = container "DB" "d" "PostgreSQL"
    }
    api -> db "Reads" "SQL"
    live = deploymentEnvironment "Live" {
      cloud = deploymentNode "AWS" "d" "Amazon Web Services" {
        lb = infrastructureNode "Load balancer" "d" "ALB"
        host = deploymentNode "ECS" "d" "Fargate" {
          apiInstance = containerInstance api
        }
        rds = deploymentNode "RDS" "d" "PostgreSQL 16" {
          dbInstance = containerInstance db
        }
      }
    }
  }
  views {
    deployment shop live "LiveDeployment" {
      include *
      autoLayout
    }
  }
}
```

Use flat identifiers in `containerInstance` / `softwareSystemInstance`: a dotted
reference there is not modelled by c4hero.

## Views

```dsl fragment
systemLandscape [key] [description] { ... }
systemContext <systemId> [key] [description] { ... }
container <systemId> [key] [description] { ... }
component <containerId> [key] [description] { ... }
dynamic <*|systemId|containerId> [key] [description] { ... }
deployment <*|systemId> <environment> [key] [description] { ... }
```

Inside a view: `include <*|id|expression>`, `exclude <id|expression>`,
`autoLayout [tb|bt|lr|rl] [rankSep] [nodeSep]`, `title "..."`, `description "..."`.
The key is what `c4hero view update <key>` addresses; give every view one.

```dsl
workspace "Views" {
  model {
    u = person "User" "d"
    s = softwareSystem "System" "d" {
      web = container "Web" "d" "React"
      api = container "API" "d" "Node.js"
    }
    audit = softwareSystem "Audit" "d" "External"
    u -> web "Uses"
    web -> api "Calls"
    api -> audit "Reports to"
  }
  views {
    systemLandscape "landscape" "Everything" {
      include *
      autoLayout tb
    }
    systemContext s "context" {
      include *
      exclude audit
      title "System context"
      autoLayout lr 300 100
    }
    container s "containers" {
      include u web api
      description "Without the audit system"
    }
    dynamic s "login" "Login flow" {
      u -> web "Submits credentials"
      web -> api "Authenticates"
      autoLayout
    }
  }
}
```

## Styles and themes

Style by tag. Every element carries implicit tags `Element` and its type (`Person`,
`Software System`, `Container`, `Component`); every relationship carries `Relationship`.

```dsl
workspace "Styles" {
  model {
    u = person "User" "d"
    s = softwareSystem "System" "d" {
      db = container "DB" "d" "PostgreSQL" "Database"
    }
    u -> db "Reads" "SQL"
  }
  views {
    container s "containers" {
      include *
    }
    styles {
      element "Person" {
        shape Person
        background #08427b
        color #ffffff
      }
      element "Database" {
        shape Cylinder
        background #1168bd
      }
      relationship "Relationship" {
        color #707070
        dashed true
        thickness 2
      }
    }
  }
}
```

Element style properties c4hero keeps: `shape`, `icon`, `background`, `color`, `stroke`,
`strokeWidth`, `fontSize`, `border`, `opacity`. Relationship style properties it keeps:
`thickness`, `color`, `dashed`, `fontSize`, `opacity`. Other Structurizr style properties
(`width`, `height`, `metadata`, `description` on elements; `style`, `routing`, `position`,
`width` on relationships) are dropped on save (see below).

Themes: `theme default` or `themes <name|url> ...` inside `views`. c4hero does not model
themes (see below).

## Preprocessor and configuration

```dsl fragment
!include <file|directory|url>
!const NAME "value"           # reference as ${NAME}
!var NAME "value"             # like !const, may be redefined
!docs <path>                  # Markdown docs attached to the workspace or element
!adrs <path>                  # architecture decision records
```

```dsl
workspace "Scoped" {
  configuration {
    scope softwaresystem
  }
  model {
    s = softwareSystem "Only system" "d" {
      api = container "API" "d" "Node.js"
    }
  }
  views {
    container s "containers" {
      include *
    }
  }
}
```

`scope landscape` allows no containers; `scope softwaresystem` allows exactly one system
with containers. c4hero models `scope` and reports violations from `check`.

## c4hero conventions in the file

c4hero stores some data as `properties` and tags in the DSL: `c4hero.*` property keys
(status, owner, document links) and document indexing. Do not rename or remove them by
hand. The full list is in the `c4hero-modeling` skill's `c4hero-conventions.md`.

## What c4hero does not round-trip

c4hero re-serializes the whole file on save. The CLI refuses to write (exit 3,
`LOSSY_FILE`) when the file holds any of these, because a rewrite would drop them.
`check` lists each one as an info finding. Verified against `src/cli/lossyGuard.ts`
and by running `c4hero check`.

| Construct | What happens |
| --- | --- |
| Comments (`//`, `#`, `/* */`) | Discarded by the lexer |
| `!include`, `!const`, `!var`, `!identifiers`, `!docs`, `!adrs`, `!script`, `!element`, `!ref` and every other `!` directive | Dropped. Only `!impliedRelationships true\|false` survives |
| `branding`, `terminology`, `animation { }`, `users`, `visibility`, `theme`, `themes` | Parsed, not modelled, dropped |
| `perspectives { }` | Skipped, dropped |
| Workspace-level `properties { }` | Skipped, dropped |
| `this -> x` inside an element block | Parse error: `Unresolved reference: 'this'` |
| `-> x` shorthand inside an element block | Skipped, the relationship is lost |
| Forward reference (`a -> b` before `b` is defined) | Parse error: `Unresolved reference` |
| Dotted reference in `containerInstance` | Skipped, the instance is lost |
| Element style `width`, `height`, `metadata`, `description` | Skipped, dropped |
| Relationship style `style`, `routing`, `position`, `width` | Skipped, dropped |
| View `exclude "a -> b"` (relationship exclusion) | Skipped, dropped (element exclusions are kept as the resulting element list) |
| View `default` | Skipped, dropped |
| Dynamic-view parallel block `{ ... }` | Steps are kept but flattened into one sequence, so the grouping is dropped |
| Any keyword the parser does not know | Skipped, dropped |

Rule of thumb: if a file needs a construct from this table, hand-edit it and do not run
mutating CLI commands on it; if the construct is incidental (a comment), ask the user
before using `--force` because the construct is lost.
