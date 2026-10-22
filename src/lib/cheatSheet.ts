// Content for the standalone /cheat-sheet page (see src/components/views/CheatSheet.tsx).
// This module is pure data: every element kind, every view type, the element x view
// matrix, and the "what is it?" decision guide. Keeping it separate from the page
// component means the content can be unit-tested for internal consistency (every
// kind a view references actually exists in the catalog, the matrix can't disagree
// with the view definitions, every example is real) without rendering anything.
//
// Source of truth for the modeling rules below:
// plugins/c4hero/skills/c4hero-modeling/references/c4-modeling-rules.md

export type CheatElementKind =
  | 'person'
  | 'softwareSystem'
  | 'container'
  | 'component'
  | 'deploymentNode'
  | 'infrastructureNode'
  | 'softwareSystemInstance'
  | 'containerInstance'
  | 'element' // custom element (custom views only)
  | 'group'
  | 'relationship'

export interface CheatExample {
  name: string // "Mobile Banking App"
  note: string // "iOS/Android app customers use"
}

export interface CheatElement {
  kind: CheatElementKind
  label: string // "Container"
  dslKeyword: string // "container"
  level: 'static' | 'deployment' | 'other'
  parent?: string // "Software System" — what it lives inside
  definition: string
  useFor: string[]
  notFor: string[]
  examples: CheatExample[] // >= 6 per kind
}

export interface CheatViewScope {
  scope: string
  allowed: CheatElementKind[]
}

export interface CheatDiagramSpec {
  boundary?: string // e.g. "Internet Banking System" (dashed box)
  nodes: {
    id: string
    label: string
    kind: CheatElementKind
    external?: boolean
    inBoundary?: boolean
    parent?: string
  }[]
  edges: { from: string; to: string; label?: string; order?: number }[]
}

export interface CheatView {
  key:
    | 'systemLandscape'
    | 'systemContext'
    | 'container'
    | 'component'
    | 'dynamic'
    | 'deployment'
    | 'filtered'
    | 'custom'
    | 'image'
  label: string
  dslKeyword: string
  scope: string // "One software system"
  purpose: string
  audience: string
  allowed: CheatElementKind[] // union across scopes
  scopes?: CheatViewScope[] // dynamic: *, softwareSystem, container; deployment: *, softwareSystem
  supportedInC4hero: boolean // false for filtered, custom and image
  example: { title: string; description: string; diagram: CheatDiagramSpec }
  tips: string[]
}

export interface CheatDecision {
  thing: string
  answer: CheatElementKind | 'not-modeled'
  reason: string
}

// ─── Elements ────────────────────────────────────────────────────────

export const CHEAT_ELEMENTS: CheatElement[] = [
  {
    kind: 'person',
    label: 'Person',
    dslKeyword: 'person',
    level: 'static',
    definition:
      "A human role that interacts with the modeled systems — an end user, operator, or any other actor who is a person rather than software.",
    useFor: [
      'A human role interacting with the system(s) being modeled',
      'End users, operators, administrators, support staff',
      'External actors such as auditors or a partner company’s users',
    ],
    notFor: [
      'A team or organizational unit — model that with an owner property/tag, or a custom element on a Custom view (a team isn’t modeled as its own element)',
      'A system-to-system actor such as a cron job or a bot calling an API — that’s a Software System or Container',
      'A specific named individual — model the role, not the person (though a Person can represent a role played by a group of people, e.g. "Support Team")',
    ],
    examples: [
      { name: 'Retail Banking Customer', note: 'Logs in to check balances and pay bills (banking)' },
      { name: 'Store Shopper', note: 'Browses and buys products on the storefront (e-commerce)' },
      { name: 'Attending Physician', note: 'Reviews patient charts and orders labs (healthcare)' },
      { name: 'SaaS Workspace Admin', note: 'Configures workspace settings and billing (SaaS)' },
      { name: 'Field Technician', note: 'Views live sensor readings on a tablet (IoT)' },
      { name: 'On-call SRE', note: 'Triages alerts and runs the internal deploy tool (internal tooling)' },
      { name: 'Claims Adjuster', note: 'Assesses and approves insurance claims (insurance)' },
    ],
  },
  {
    kind: 'softwareSystem',
    label: 'Software System',
    dslKeyword: 'softwareSystem',
    level: 'static',
    definition:
      "The largest building block in C4: something that delivers value to its users as a whole, whether you own it (and might model its containers) or it's third-party and external.",
    useFor: [
      'The biggest thing that delivers value to users as a whole product',
      'Third-party / external systems you depend on but don’t own the internals of (Stripe, Auth0, SendGrid)',
      'A system you own but haven’t modeled the containers of yet',
    ],
    notFor: [
      'A single deployable process — that’s a Container',
      'A library or internal module — that’s a Component',
      'A purely visual grouping with no independent value delivery — use a Group',
    ],
    examples: [
      { name: 'Internet Banking System', note: 'The whole online/mobile banking product (banking)' },
      { name: 'Stripe', note: 'External payment processor the checkout calls (e-commerce)' },
      { name: 'Electronic Health Record System', note: "The hospital's EHR platform (healthcare)" },
      { name: 'Billing Platform', note: "A SaaS product's subscription/billing system (SaaS)" },
      { name: 'Fleet Telemetry Platform', note: 'End-to-end system collecting vehicle sensor data (IoT)' },
      { name: 'Internal Deploy Portal', note: "The company's self-service deployment tool (internal tooling)" },
      { name: 'Auth0', note: 'External identity provider treated as a black box (any domain)' },
    ],
  },
  {
    kind: 'container',
    label: 'Container',
    dslKeyword: 'container',
    level: 'static',
    parent: 'Software System',
    definition:
      'A separately runnable or deployable unit that must be running for the software system to work — an application, service, database, or data store.',
    useFor: [
      'Anything separately runnable/deployable that must run for the system to work: APIs, SPAs, mobile apps, workers, databases, queues, file stores',
      "The right granularity for a container diagram's boxes",
    ],
    notFor: [
      "A Docker container specifically — this is architectural, not literal; the application or process running inside a VM, pod or serverless function is still a Container even without Docker",
      'The VM, pod or serverless function itself — that’s infrastructure that hosts the Container, modeled as a deployment node',
      'A code-level grouping inside one deployable — that’s a Component',
      'A whole product made of several deployables — that’s a Software System',
    ],
    examples: [
      { name: 'Online Banking Web App', note: 'React SPA customers use in the browser (banking)' },
      { name: 'Checkout API', note: 'Spring Boot REST service handling checkout requests (e-commerce)' },
      { name: 'Patient Records Database', note: 'PostgreSQL storing patient data (healthcare)' },
      { name: 'Billing Service', note: 'Node.js microservice issuing invoices (SaaS)' },
      { name: 'Telemetry Ingest Queue', note: 'Kafka cluster buffering device readings (IoT)' },
      { name: 'Deploy CLI', note: 'Go command-line tool engineers run locally (internal tooling)' },
      { name: 'Mobile Banking App', note: 'iOS/Android app customers install (banking)' },
    ],
  },
  {
    kind: 'component',
    label: 'Component',
    dslKeyword: 'component',
    level: 'static',
    parent: 'Container',
    definition:
      'A grouping of related functionality behind a well-defined interface, living inside one container, but not separately deployable on its own.',
    useFor: [
      'A grouping of related code/classes behind one interface, inside one Container',
      'Controllers, services, repositories, client wrappers, internal modules',
    ],
    notFor: [
      'Anything independently deployable — that’s a Container',
      'Individual classes or functions — too fine-grained for C4; stop at Component',
      'A third-party library used only as an implementation detail with no architectural significance',
    ],
    examples: [
      { name: 'TransferController', note: 'REST controller handling fund-transfer requests, inside the Banking API (banking)' },
      { name: 'PricingEngine', note: 'Module computing discounts, inside the Checkout API (e-commerce)' },
      { name: 'HL7MessageParser', note: 'Translates HL7 feeds, inside the EHR integration service (healthcare)' },
      { name: 'SubscriptionRenewalJob', note: 'Scheduled renewal logic, inside the Billing Service (SaaS)' },
      { name: 'DeviceAuthModule', note: 'Validates device certificates, inside the Telemetry Ingest service (IoT)' },
      { name: 'AuditLogWriter', note: 'Writes change history, inside the Deploy CLI (internal tooling)' },
      { name: 'PaymentGatewayClient', note: 'Wraps the Stripe SDK, inside the Checkout API (e-commerce)' },
    ],
  },
  {
    kind: 'deploymentNode',
    label: 'Deployment Node',
    dslKeyword: 'deploymentNode',
    level: 'deployment',
    parent: 'Deployment Environment (or a parent Deployment Node)',
    definition:
      'A piece of infrastructure that hosts software — physical or virtual: a data center, region, cluster, server, or end-user device — nestable to show topology.',
    useFor: [
      'Infrastructure that hosts things: regions, data centers, Kubernetes clusters/namespaces, VMs, bare-metal servers, PaaS environments, end-user devices (browsers, phones)',
      'Nesting to show topology: Region ⊃ Cluster ⊃ Node ⊃ Pod',
    ],
    notFor: [
      'The software running on the infrastructure — use a Container/Software System Instance inside it',
      'Supporting infrastructure that isn’t itself a host for your containers — that’s usually an Infrastructure Node (e.g. a managed load balancer)',
    ],
    examples: [
      { name: 'AWS eu-west-1', note: 'A region hosting the banking production environment (banking)' },
      { name: 'EKS Cluster', note: 'Kubernetes cluster running the checkout microservices (e-commerce)' },
      { name: 'Hospital Data Center Rack', note: 'On-prem rack hosting the EHR database (healthcare)' },
      { name: 'EC2 Instance', note: 'A single VM running a SaaS API worker (SaaS)' },
      { name: 'Edge Gateway Device', note: 'On-site industrial gateway running ingestion software (IoT)' },
      { name: 'Developer Laptop', note: 'Local dev environment for an internal tool (internal tooling)' },
      { name: "Customer's Browser", note: 'The end-user’s device running a single-page web app (any domain)' },
    ],
  },
  {
    kind: 'infrastructureNode',
    label: 'Infrastructure Node',
    dslKeyword: 'infrastructureNode',
    level: 'deployment',
    parent: 'Deployment Node',
    definition:
      "Supporting infrastructure shown on a deployment view that isn't itself a container instance or a host you nest things inside — load balancers, firewalls, CDNs, gateways.",
    useFor: [
      'Supporting infrastructure on a deployment view that isn’t a container instance or a nested deployment node: load balancers, firewalls, CDNs, DNS, API gateways, broker appliances treated as infra',
      'Things you depend on at deploy time but don’t model as part of your software systems',
    ],
    notFor: [
      'Infrastructure you also host your own containers on — model that as a nested Deployment Node instead',
      'An application container — use Container / Container Instance',
    ],
    examples: [
      { name: 'Application Load Balancer', note: 'Routes traffic to banking API instances (banking)' },
      { name: 'CloudFront CDN', note: 'Serves static storefront assets at the edge (e-commerce)' },
      { name: 'Hospital VPN Gateway', note: 'Secures the network link to the cloud (healthcare)' },
      { name: 'Kong API Gateway', note: "Fronts the SaaS platform's public APIs (SaaS)" },
      { name: 'MQTT Broker Appliance', note: 'Routes device messages as supporting infra (IoT)' },
      { name: 'Internal DNS', note: 'Resolves service names inside the tooling network (internal tooling)' },
      { name: 'Perimeter Firewall', note: 'Network ACL appliance in front of a deployment node (any domain)' },
    ],
  },
  {
    kind: 'softwareSystemInstance',
    label: 'Software System Instance',
    dslKeyword: 'softwareSystemInstance',
    level: 'deployment',
    parent: 'Deployment Node',
    definition:
      'A deployed instance of an entire software system on a deployment node, used when you track where a whole system runs without modeling its containers individually.',
    useFor: [
      "Showing where a whole external or legacy software system is deployed, when you don't model its containers",
      'Multi-region/DR deployments of a system treated as a monolith for your purposes',
    ],
    notFor: [
      'A system whose containers you do model — use Container Instances for each one instead',
      "The system's static definition — that's the Software System element itself",
    ],
    examples: [
      {
        name: 'Core Banking System (DR site)',
        note: 'Instance of the legacy core system replicated to the disaster-recovery data center (banking)',
      },
      { name: 'Inventory Management System (EU region)', note: 'Instance of the whole inventory system deployed regionally (e-commerce)' },
      { name: 'Pharmacy System (on-prem instance)', note: 'External pharmacy system instance deployed at one hospital site (healthcare)' },
      { name: 'Partner CRM (customer tenant)', note: "Instance of a partner's whole CRM system in their own deployment (SaaS)" },
      { name: 'Fleet Control System (factory site)', note: 'Instance of a monolithic control system deployed at one plant (IoT)' },
      { name: 'Internal ERP (backup site)', note: 'Instance of the whole internal ERP running at a secondary data center (internal tooling)' },
      { name: 'Legacy Claims System (regional office)', note: 'Instance of an unmodeled legacy system deployed per region (insurance)' },
    ],
  },
  {
    kind: 'containerInstance',
    label: 'Container Instance',
    dslKeyword: 'containerInstance',
    level: 'deployment',
    parent: 'Deployment Node',
    definition:
      'A deployed, running instance of a specific container on a deployment node — the thing that actually exists when something breaks.',
    useFor: [
      'Showing where a specific container actually runs: which pod, node, replica, region',
      'Multiple instances of the same container across environments or for scale',
    ],
    notFor: [
      "The container's static definition, reused across all its instances — that's the Container element",
      'A conceptually different deployable — create a different Container, then instance it',
    ],
    examples: [
      { name: 'Banking API (Pod 1)', note: 'Running instance of the API container in the Kubernetes cluster (banking)' },
      { name: 'Checkout API (us-east-1a)', note: 'Instance of the checkout container in one availability zone (e-commerce)' },
      { name: 'Patient Records Database (Primary)', note: 'Running instance of the PostgreSQL container on the primary node (healthcare)' },
      { name: 'Billing Service (Replica 2)', note: 'One running replica of the billing container (SaaS)' },
      { name: 'Telemetry Ingest Worker (Edge Node 7)', note: 'Instance of the ingest container on a specific edge gateway (IoT)' },
      { name: 'Deploy API (Staging)', note: 'Instance of the internal deploy API container running in staging (internal tooling)' },
      { name: 'Online Banking Web App (CDN edge)', note: 'Instance of the SPA container served from an edge location (banking)' },
    ],
  },
  {
    kind: 'element',
    label: 'Custom Element',
    dslKeyword: 'element',
    level: 'other',
    definition:
      "A free-form custom element used only on Custom views, for concepts C4's built-in levels don't model — teams, capabilities, data flows, domains.",
    useFor: [
      "Anything a Custom View needs that the other kinds don't fit: teams, capabilities, data flows, domains, risks, initiatives",
      'Free-form boxes for stakeholder-specific diagrams (capability maps, org charts, data-flow diagrams)',
    ],
    notFor: [
      'Anything that is actually a Person, Software System, Container, Component or deployment element — use the specific kind on a view that supports it',
      'Static, Dynamic or Deployment views — custom elements only exist on Custom views',
    ],
    examples: [
      { name: 'Risk & Compliance Team', note: 'A team box on a custom org-aligned view (banking)' },
      { name: 'Fulfillment Capability', note: 'A business capability box on a custom capability map (e-commerce)' },
      { name: 'Patient Data Flow', note: 'A cross-system data flow, not a deployable thing (healthcare)' },
      { name: 'Pricing Domain', note: 'A bounded-context box on a custom domain view (SaaS)' },
      { name: 'Sensor Fleet', note: 'A grouping concept for all deployed devices (IoT)' },
      { name: 'Platform Team', note: 'A team-ownership box on a custom team-ownership view (internal tooling)' },
      { name: 'Regulatory Requirement', note: 'A compliance-obligation box on a custom risk map (insurance)' },
    ],
  },
  {
    kind: 'group',
    label: 'Group',
    dslKeyword: 'group',
    level: 'other',
    definition:
      'A named, purely visual boundary defined in the model around related elements, drawn on every view that shows their members, to improve readability — it carries no architectural meaning of its own.',
    useFor: [
      "A visual boundary around related elements, for readability wherever their members appear: a team's systems, a layer, a bounded context",
      'Nested group blocks to show a grouping hierarchy',
    ],
    notFor: [
      'A real architectural element with its own identity, relationships or technology — groups have none',
      'Changing how elements behave — grouping is purely presentational',
    ],
    examples: [
      { name: 'Core Banking Systems', note: 'Groups the ledger, payments and card systems on a landscape view (banking)' },
      { name: 'Customer-Facing Containers', note: 'Groups the web app and mobile app on a container view (e-commerce)' },
      { name: 'Clinical Systems', note: 'Groups EHR, lab and pharmacy systems on a landscape view (healthcare)' },
      { name: 'Data Platform', note: 'Groups the warehouse, ETL jobs and BI tool containers (SaaS)' },
      { name: 'Edge Devices', note: 'Groups gateway and sensor containers on a container view (IoT)' },
      { name: 'Shared Tooling', note: 'Groups CI, artifact registry and deploy tool systems on a landscape view (internal tooling)' },
      { name: 'Underwriting Systems', note: 'Groups the rating engine and policy systems (insurance)' },
    ],
  },
  {
    kind: 'relationship',
    label: 'Relationship',
    dslKeyword: '->',
    level: 'other',
    definition:
      'A directed dependency between two elements, described with a verb phrase and, ideally, a technology/protocol, shown automatically on any view where both ends appear.',
    useFor: [
      'Every meaningful dependency between two elements, described as a verb phrase with technology/protocol',
      'The only way elements connect across views — it is shown automatically when both ends are on the view',
    ],
    notFor: [
      'Data flow direction when it differs from dependency direction — model the caller → callee direction, not which way bytes move',
      'Vague labels like "uses" or "calls" alone',
      'A relationship between elements at mismatched levels when a more specific one is known — declare it at the most specific level you know',
    ],
    examples: [
      { name: 'Places orders using', note: 'Customer → Web App, HTTPS/JSON (e-commerce)' },
      { name: 'Reads from and writes to', note: 'API → Database, SQL (banking)' },
      { name: 'Publishes lab results to', note: 'LIS → EHR, HL7/MLLP, async (healthcare)' },
      { name: 'Sends invoices via', note: 'Billing Service → SendGrid, HTTPS (SaaS)' },
      { name: 'Publishes readings to', note: 'Device → Telemetry Ingest Queue, MQTT, async (IoT)' },
      { name: 'Triggers deployment in', note: 'Deploy CLI → CI Pipeline, HTTPS (internal tooling)' },
      { name: 'Authenticates using', note: 'Web App → Auth0, OAuth2/HTTPS (any domain)' },
    ],
  },
]

// ─── Views ───────────────────────────────────────────────────────────

export const CHEAT_VIEWS: CheatView[] = [
  {
    key: 'systemLandscape',
    label: 'System Landscape',
    dslKeyword: 'systemLandscape',
    scope: 'The whole organization or domain — every software system and person',
    purpose:
      'Show the big picture: every system and person across the landscape, and how they relate, with no single system singled out.',
    audience: 'Executives, enterprise architects, new hires getting oriented — anyone who needs the 10,000-foot map',
    allowed: ['person', 'softwareSystem', 'group'],
    supportedInC4hero: true,
    example: {
      title: "A bank's whole technology landscape",
      description:
        'Every major system a retail bank runs or depends on, with the people who use them, before zooming into any one of them.',
      diagram: {
        nodes: [
          { id: 'customer', label: 'Retail Customer', kind: 'person' },
          { id: 'clerk', label: 'Back-office Clerk', kind: 'person' },
          { id: 'banking', label: 'Internet Banking System', kind: 'softwareSystem' },
          { id: 'core', label: 'Core Banking Platform', kind: 'softwareSystem' },
          { id: 'fraud', label: 'Fraud Detection System', kind: 'softwareSystem' },
          { id: 'payNetwork', label: 'Payment Network', kind: 'softwareSystem', external: true },
        ],
        edges: [
          { from: 'customer', to: 'banking', label: 'Uses' },
          { from: 'clerk', to: 'core', label: 'Operates' },
          { from: 'banking', to: 'core', label: 'Reads from and writes to' },
          { from: 'banking', to: 'fraud', label: 'Checks transactions with' },
          { from: 'core', to: 'payNetwork', label: 'Settles payments via' },
        ],
      },
    },
    tips: [
      'Use it once per organization/domain, not once per team.',
      'No container-level detail belongs here — only persons and software systems.',
      'Good for spotting duplicated or orphaned systems across the whole estate.',
    ],
  },
  {
    key: 'systemContext',
    label: 'System Context',
    dslKeyword: 'systemContext',
    scope: 'One software system, plus the people and systems directly around it',
    purpose: "Answer 'what is this system, who uses it, and what does it talk to?' without any internal detail.",
    audience: 'Everyone — the one diagram non-technical stakeholders should be able to read',
    allowed: ['person', 'softwareSystem', 'group'],
    supportedInC4hero: true,
    example: {
      title: 'The Internet Banking System in context',
      description: 'The customer, the core banking platform and an email provider around the banking system.',
      diagram: {
        nodes: [
          { id: 'customer', label: 'Retail Customer', kind: 'person' },
          { id: 'banking', label: 'Internet Banking System', kind: 'softwareSystem' },
          { id: 'core', label: 'Core Banking Platform', kind: 'softwareSystem' },
          { id: 'email', label: 'Email Provider', kind: 'softwareSystem', external: true },
        ],
        edges: [
          { from: 'customer', to: 'banking', label: 'Views balances and pays bills using' },
          { from: 'banking', to: 'core', label: 'Reads from and writes to' },
          { from: 'banking', to: 'email', label: 'Sends notifications via' },
        ],
      },
    },
    tips: [
      'One context view per system you need to explain, not one per project.',
      'Keep it to persons and software systems only — no containers.',
      'Usually the first view to draw and the last one stakeholders stop understanding.',
    ],
  },
  {
    key: 'container',
    label: 'Container',
    dslKeyword: 'container',
    scope: "One software system's containers, plus people and external systems",
    purpose: 'Show the shape of the system: which deployable units exist and how they talk to each other.',
    audience: 'Software architects and developers planning or onboarding onto the system',
    allowed: ['person', 'softwareSystem', 'container', 'group'],
    supportedInC4hero: true,
    example: {
      title: 'Inside the Internet Banking System',
      description: 'The web app, mobile app, API and database that make up the banking system.',
      diagram: {
        boundary: 'Internet Banking System',
        nodes: [
          { id: 'customer', label: 'Retail Customer', kind: 'person' },
          { id: 'web', label: 'Online Banking Web App', kind: 'container', inBoundary: true },
          { id: 'mobile', label: 'Mobile Banking App', kind: 'container', inBoundary: true },
          { id: 'api', label: 'Banking API', kind: 'container', inBoundary: true },
          { id: 'db', label: 'Banking Database', kind: 'container', inBoundary: true },
          { id: 'core', label: 'Core Banking Platform', kind: 'softwareSystem' },
        ],
        edges: [
          { from: 'customer', to: 'web', label: 'Uses' },
          { from: 'customer', to: 'mobile', label: 'Uses' },
          { from: 'web', to: 'api', label: 'Makes API calls to, HTTPS/JSON' },
          { from: 'mobile', to: 'api', label: 'Makes API calls to, HTTPS/JSON' },
          { from: 'api', to: 'db', label: 'Reads from and writes to, SQL' },
          { from: 'api', to: 'core', label: 'Posts transactions to, HTTPS' },
        ],
      },
    },
    tips: [
      'One container view per software system.',
      'Databases and queues belong here as containers, not as infrastructure.',
      'More than ~12 boxes? Split by concern instead of cramming it in.',
    ],
  },
  {
    key: 'component',
    label: 'Component',
    dslKeyword: 'component',
    scope: "One container's components, plus people, systems and containers around it",
    purpose: 'Show how a single container is structured internally, for the team that owns it.',
    audience: 'Developers working inside that specific container — rarely needed for every container',
    allowed: ['person', 'softwareSystem', 'container', 'component', 'group'],
    supportedInC4hero: true,
    example: {
      title: 'Inside the Banking API',
      description: 'The controllers and gateway client that make up the API container.',
      diagram: {
        boundary: 'Banking API',
        nodes: [
          { id: 'web', label: 'Online Banking Web App', kind: 'container' },
          { id: 'transfer', label: 'TransferController', kind: 'component', inBoundary: true },
          { id: 'account', label: 'AccountController', kind: 'component', inBoundary: true },
          { id: 'coreClient', label: 'CoreBankingClient', kind: 'component', inBoundary: true },
          { id: 'db', label: 'Banking Database', kind: 'container' },
          { id: 'core', label: 'Core Banking Platform', kind: 'softwareSystem' },
        ],
        edges: [
          { from: 'web', to: 'transfer', label: 'Makes API calls to, HTTPS/JSON' },
          { from: 'web', to: 'account', label: 'Makes API calls to, HTTPS/JSON' },
          { from: 'transfer', to: 'coreClient', label: 'Delegates to' },
          { from: 'account', to: 'db', label: 'Reads from and writes to, SQL' },
          { from: 'coreClient', to: 'core', label: 'Posts transactions to, HTTPS' },
        ],
      },
    },
    tips: [
      "Only draw this for containers complex enough to need it — not every container earns one.",
      "Components are never separately deployable; if it is, it's a Container.",
      'Stop at components — do not model individual classes.',
    ],
  },
  {
    key: 'dynamic',
    label: 'Dynamic',
    dslKeyword: 'dynamic',
    scope: 'One scenario, scoped to the landscape, one system, or one container',
    purpose: 'Show the order of calls for one specific use case, like a simplified sequence diagram.',
    audience: 'Developers and architects explaining or debugging one flow (e.g. "what happens on a transfer?")',
    allowed: ['person', 'softwareSystem', 'container', 'component'],
    scopes: [
      { scope: '*', allowed: ['person', 'softwareSystem'] },
      { scope: 'softwareSystem', allowed: ['person', 'softwareSystem', 'container'] },
      { scope: 'container', allowed: ['person', 'softwareSystem', 'container', 'component'] },
    ],
    supportedInC4hero: true,
    example: {
      title: 'Submitting a funds transfer',
      description: 'Numbered steps showing the call sequence from customer to core platform for one transfer.',
      diagram: {
        nodes: [
          { id: 'customer', label: 'Retail Customer', kind: 'person' },
          { id: 'web', label: 'Online Banking Web App', kind: 'container' },
          { id: 'api', label: 'Banking API', kind: 'container' },
          { id: 'core', label: 'Core Banking Platform', kind: 'softwareSystem' },
        ],
        edges: [
          { from: 'customer', to: 'web', label: 'Submits transfer form', order: 1 },
          { from: 'web', to: 'api', label: 'POST /transfers', order: 2 },
          { from: 'api', to: 'core', label: 'Posts transaction to', order: 3 },
        ],
      },
    },
    tips: [
      'One dynamic view per scenario — do not try to show every possible path at once.',
      "The scope you pick caps the element kinds available: 'container' scope unlocks components too.",
      'Numbers on edges are the whole point — order matters more than layout.',
    ],
  },
  {
    key: 'deployment',
    label: 'Deployment',
    dslKeyword: 'deployment',
    scope: 'One deployment environment, optionally scoped to one software system',
    purpose: 'Show the physical/infrastructure topology: which deployment nodes host which instances.',
    audience: 'Operations, SRE and architects planning or troubleshooting a specific environment',
    allowed: ['deploymentNode', 'infrastructureNode', 'softwareSystemInstance', 'containerInstance', 'group'],
    scopes: [
      {
        scope: '*',
        allowed: ['deploymentNode', 'infrastructureNode', 'softwareSystemInstance', 'containerInstance', 'group'],
      },
      {
        scope: 'softwareSystem',
        allowed: ['deploymentNode', 'infrastructureNode', 'softwareSystemInstance', 'containerInstance', 'group'],
      },
    ],
    supportedInC4hero: true,
    example: {
      title: 'Production deployment of the Banking API',
      description: 'The AWS region, the Kubernetes cluster inside it, and the running API and database instances.',
      diagram: {
        nodes: [
          { id: 'region', label: 'AWS eu-west-1', kind: 'deploymentNode' },
          { id: 'cluster', label: 'Kubernetes Cluster', kind: 'deploymentNode', parent: 'region' },
          { id: 'lb', label: 'Application Load Balancer', kind: 'infrastructureNode', parent: 'region' },
          { id: 'apiPod', label: 'Banking API (instance)', kind: 'containerInstance', parent: 'cluster' },
          { id: 'dbNode', label: 'RDS Instance', kind: 'deploymentNode', parent: 'region' },
          { id: 'dbInstance', label: 'Banking Database (instance)', kind: 'containerInstance', parent: 'dbNode' },
        ],
        edges: [
          { from: 'lb', to: 'apiPod', label: 'Routes HTTPS traffic to' },
          { from: 'apiPod', to: 'dbInstance', label: 'Reads from and writes to, SQL' },
        ],
      },
    },
    tips: [
      'One deployment view per environment (Production, Staging, DR), not one for all time.',
      'Scope it to a software system when the full environment view gets too crowded.',
      "Instances reuse the name/description of the Container or Software System they came from — don't rename them.",
    ],
  },
  {
    key: 'filtered',
    label: 'Filtered',
    dslKeyword: 'filtered',
    scope: 'A tag-based subset of an existing static view',
    purpose: "Reuse one view's layout to produce a focused variant, without redrawing it.",
    audience: 'Anyone who needs a narrower slice of an already-drawn view (compliance, one team, one concern)',
    allowed: ['person', 'softwareSystem', 'container', 'component', 'group'],
    supportedInC4hero: false,
    example: {
      title: 'Only the Database-tagged containers',
      description: "The same container view, filtered down to elements tagged 'Database', for a data-governance review.",
      diagram: {
        boundary: 'Internet Banking System',
        nodes: [
          { id: 'api', label: 'Banking API', kind: 'container', inBoundary: true },
          { id: 'db', label: 'Banking Database', kind: 'container', inBoundary: true },
        ],
        edges: [{ from: 'api', to: 'db', label: 'Reads from and writes to, SQL' }],
      },
    },
    tips: [
      'Not yet supported in c4hero.',
      'Tag elements and relationships deliberately; a filtered view is only as useful as your tagging discipline.',
      'Use include or exclude mode, not both, to keep the rule easy to reason about.',
    ],
  },
  {
    key: 'custom',
    label: 'Custom',
    dslKeyword: 'custom',
    scope: 'Free-form — whatever elements and relationships you define',
    purpose: "Draw diagrams C4's built-in levels don't cover: capability maps, data-flow diagrams, team charts.",
    audience: 'Whoever the custom diagram is made for — often non-architecture stakeholders',
    allowed: ['element'],
    supportedInC4hero: false,
    example: {
      title: 'A capability map',
      description: 'Custom boxes for business capabilities, connected to show dependency.',
      diagram: {
        nodes: [
          { id: 'payments', label: 'Payments Capability', kind: 'element' },
          { id: 'risk', label: 'Risk & Compliance Capability', kind: 'element' },
          { id: 'customer360', label: 'Customer 360 Capability', kind: 'element' },
        ],
        edges: [
          { from: 'payments', to: 'risk', label: 'Reports transactions to' },
          { from: 'customer360', to: 'payments', label: 'Supplies customer profile to' },
        ],
      },
    },
    tips: [
      'Not yet supported in c4hero.',
      "Custom elements have no required relationship to real systems — use them when the other kinds don't fit.",
      'Don’t use a custom view as a workaround for a level C4 already models (person, system, container, component).',
    ],
  },
  {
    key: 'image',
    label: 'Image',
    dslKeyword: 'image',
    scope: 'None — an externally rendered diagram, not modeled elements',
    purpose: 'Bring in a diagram that already exists elsewhere (a legacy diagram, a tool export) without remodeling it.',
    audience: 'Anyone who needs the existing diagram visible alongside the rest of the documentation',
    allowed: [],
    supportedInC4hero: false,
    example: {
      title: 'An imported network diagram',
      description: 'A previously drawn network diagram, rendered by an external tool and embedded as an image.',
      diagram: { nodes: [], edges: [] },
    },
    tips: [
      'Not yet supported in c4hero.',
      "No relationships are modeled either — it's a picture, not a diagram made of elements.",
      "Use sparingly; an image view can't be kept in sync automatically the way modeled views can.",
    ],
  },
]

// ─── Decision guide ──────────────────────────────────────────────────

export const CHEAT_DECISIONS: CheatDecision[] = [
  { thing: 'PostgreSQL database', answer: 'container', reason: "It's a separately running, deployable datastore the system depends on." },
  {
    thing: 'A single table or schema inside that database',
    answer: 'not-modeled',
    reason: 'C4 stops at the container; schema/table detail belongs in a data model, not the architecture diagram.',
  },
  { thing: 'Kafka cluster', answer: 'container', reason: 'A separately deployable message broker your system depends on to run.' },
  {
    thing: 'A Kafka topic',
    answer: 'container',
    reason: 'Model an architecturally significant topic/queue as its own container (C4 guidance allows this); if it isn’t significant, just name it on the relationship to the broker container instead (e.g. "Publishes to orders.created").',
  },
  {
    thing: 'A microservice with its own deploy pipeline and database',
    answer: 'container',
    reason: 'One independently deployable process — exactly what Container means, regardless of the "micro" in the name.',
  },
  {
    thing: 'A microservice platform made of a dozen such services, owned by one team as one product',
    answer: 'softwareSystem',
    reason: 'The product as a whole is the Software System; each service inside it is a Container.',
  },
  {
    thing: 'A shared library/JAR/npm package used inside a service',
    answer: 'component',
    reason: "It's used from within one container's process, not separately deployable — model the role it plays as a component, or omit it if it has no architectural significance.",
  },
  { thing: 'An AWS Lambda function', answer: 'container', reason: "It's a separately deployable, independently runnable unit, even though there's no server to see." },
  { thing: 'Auth0 / Okta (identity provider)', answer: 'softwareSystem', reason: "An external product you depend on but don't own or decompose — mark it external." },
  { thing: 'A Kubernetes cluster', answer: 'deploymentNode', reason: 'Infrastructure that hosts your containers — a deployment-view concept, not a static one.' },
  { thing: 'A Kubernetes namespace', answer: 'deploymentNode', reason: 'A nested boundary inside the cluster — model it as a child deployment node.' },
  {
    thing: 'A Kubernetes pod',
    answer: 'deploymentNode',
    reason: 'The host for a running container instance; nest it under the node/cluster, with a Container Instance inside it.',
  },
  {
    thing: 'A Spring MVC @Controller class',
    answer: 'component',
    reason: 'A grouping of related code behind one interface inside its container — the textbook Component example.',
  },
  {
    thing: 'A single-page React app served to the browser',
    answer: 'container',
    reason: "It's a separately deployable frontend; the user's browser running it is a deployment node, not the container itself.",
  },
  {
    thing: 'The backend API the SPA calls',
    answer: 'container',
    reason: 'A second, separately deployable unit in the same software system — its own container, connected by a relationship.',
  },
  { thing: 'A CDN (CloudFront, Akamai, Fastly)', answer: 'infrastructureNode', reason: "Supporting infrastructure on the deployment view; it doesn't run your application code." },
  { thing: 'A load balancer / ALB', answer: 'infrastructureNode', reason: "Routes traffic to your containers but isn't itself one of your deployable units." },
  {
    thing: 'An API gateway (Kong, AWS API Gateway)',
    answer: 'infrastructureNode',
    reason: 'Infrastructure that fronts your APIs; if your team owns and deploys custom logic in it, model that logic as a Container instead.',
  },
  { thing: 'An S3 bucket / blob storage', answer: 'container', reason: 'A separately running datastore your system reads and writes to, same as a database.' },
  { thing: 'A Redis cache', answer: 'container', reason: 'A separately deployable datastore, even though it only holds transient data.' },
  { thing: 'A nightly batch job', answer: 'container', reason: "A separately deployable/runnable process, even though it isn't always-on." },
  {
    thing: 'A cron schedule that triggers that batch job',
    answer: 'not-modeled',
    reason: "Scheduling is a property of how the container runs, not a separate element; mention it in the container's description if relevant.",
  },
  {
    thing: 'The Payments team',
    answer: 'not-modeled',
    reason: "C4's static/deployment/dynamic views model systems, not org structure; use an owner tag on elements, or a custom view if you need a team map.",
  },
  {
    thing: 'An organizational team box on a capability/org diagram',
    answer: 'element',
    reason: 'On a Custom view, a team is exactly the kind of free-form box a custom element is for.',
  },
  { thing: 'A mobile app (iOS/Android)', answer: 'container', reason: 'A separately deployable client, same status as a web app.' },
  { thing: "The end user's phone running that app", answer: 'deploymentNode', reason: 'The device is infrastructure that hosts a container instance on the deployment view.' },
  { thing: 'A RabbitMQ message broker', answer: 'container', reason: 'Another separately deployable datastore/broker your containers depend on.' },
  {
    thing: "A payment gateway client wrapper class calling Stripe's SDK",
    answer: 'component',
    reason: 'Code inside one container that groups the integration logic behind an interface.',
  },
  { thing: 'Stripe itself', answer: 'softwareSystem', reason: 'An external, third-party system — a black box you integrate with but never decompose.' },
  { thing: 'A GraphQL schema/resolver layer inside an API', answer: 'component', reason: "Part of the API container's internal structure, not separately deployable." },
  {
    thing: 'An NGINX reverse proxy in front of a container',
    answer: 'infrastructureNode',
    reason: 'Supporting infrastructure, unless your team owns custom routing logic in it worth modeling as its own container.',
  },
  {
    thing: 'A data warehouse (Snowflake, BigQuery)',
    answer: 'container',
    reason: "When your system owns it, it's a separately running datastore your system depends on, same as a database — model it as a Container. A third-party platform you don't decompose is instead an external Software System.",
  },
  { thing: 'An ETL pipeline container', answer: 'container', reason: 'A separately deployable/runnable unit, same as any backend service.' },
  { thing: 'A feature flag service (LaunchDarkly)', answer: 'softwareSystem', reason: 'An external SaaS dependency, modeled as a black box.' },
  { thing: 'A DNS record', answer: 'not-modeled', reason: 'Configuration detail with no architectural significance of its own.' },
  { thing: 'A firewall / security group', answer: 'infrastructureNode', reason: 'Deployment-view supporting infrastructure, not an application element.' },
  {
    thing: 'An on-call engineer troubleshooting the system',
    answer: 'person',
    reason: 'A human role interacting with the system(s), even though they are staff rather than an end customer.',
  },
  { thing: 'An IoT edge gateway device', answer: 'deploymentNode', reason: 'Physical/infrastructure host for the software running on it.' },
  {
    thing: 'The firmware/software running on that IoT gateway',
    answer: 'container',
    reason: 'A separately deployable unit; its running copy on the device is a Container Instance on the deployment view.',
  },
  {
    thing: "A relational database's replica in a second region",
    answer: 'containerInstance',
    reason: 'The same Database container, running as a second instance on a different deployment node.',
  },
]

// ─── Matrix ──────────────────────────────────────────────────────────

const ALL_KINDS: CheatElementKind[] = [
  'person',
  'softwareSystem',
  'container',
  'component',
  'deploymentNode',
  'infrastructureNode',
  'softwareSystemInstance',
  'containerInstance',
  'element',
  'group',
  'relationship',
]

type MatrixCell = 'yes' | 'scoped' | 'no'

/**
 * Derives the element x view matrix from CHEAT_VIEWS, so the two can never
 * disagree. `relationship` is special-cased: a relationship is shown whenever
 * both of its endpoints are on the view, which is true on every view except
 * Image (which has no modeled elements at all). Every other kind is resolved
 * from the view's `allowed` list — or, for views with `scopes` (dynamic,
 * deployment), 'yes' when every scope allows the kind, 'scoped' when only
 * some scopes do, 'no' otherwise.
 */
export function elementViewMatrix(): Record<CheatElementKind, Record<CheatView['key'], MatrixCell>> {
  const matrix = {} as Record<CheatElementKind, Record<CheatView['key'], MatrixCell>>

  for (const kind of ALL_KINDS) {
    const row = {} as Record<CheatView['key'], MatrixCell>

    for (const view of CHEAT_VIEWS) {
      if (kind === 'relationship') {
        row[view.key] = view.key === 'image' ? 'no' : 'yes'
        continue
      }

      if (view.scopes && view.scopes.length > 0) {
        const inAll = view.scopes.every((s) => s.allowed.includes(kind))
        const inSome = view.scopes.some((s) => s.allowed.includes(kind))
        row[view.key] = inAll ? 'yes' : inSome ? 'scoped' : 'no'
      } else {
        row[view.key] = view.allowed.includes(kind) ? 'yes' : 'no'
      }
    }

    matrix[kind] = row
  }

  return matrix
}
