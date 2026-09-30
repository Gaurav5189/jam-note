# Graph Report - jam-note  (2026-09-30)

## Corpus Check
- 197 files · ~153,588 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 24 file(s) not represented in the graph (top: (none) 10, .css 6, .example 4)

## Summary
- 1725 nodes · 4412 edges · 96 communities (61 shown, 35 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 130 edges (avg confidence: 0.91)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- UI Block Editor
- Import Routes
- Auth Tests
- Security Config
- Note Export
- Export Tests
- Frontend Dependencies
- Note Routes
- Auth Models
- Canvas Components
- Event Outbox
- Mock Stores
- Folder Tree
- Search Service
- Workspace Context
- Reindex Pipeline
- Folder Routes
- UI Navigation
- Note Operations
- Manifest Builder
- Offline UI
- Canvas DnD
- Workspace Tree
- App Layout
- Community 24
- Rate Limits
- OS Client Tests
- Daemon Scripts
- Community 28
- Auth Pages
- Block Types
- Folder API
- Mongo Watchers
- Replay Handler
- Dashboard Events
- Landing Page
- Login Signup
- Export Modal
- Profile Trash
- Kafka Consumer Tests
- Kafka Producers
- TS Config
- Rate Config
- Worker Pool
- Mock Search
- Event Tests
- Event Envelope
- Site Metadata
- Auth Service
- Health Endpoints
- Event Payloads
- Community 52
- Canvas Spec
- Service Worker
- Mongo Reader
- Note Queries
- CSRF
- Community 58
- Community 59
- Community 60
- Doc Types
- Community 62
- Pricing Page
- Community 64
- System Architecture
- Community 66
- Tab Component
- Landing Header
- Cache Handler
- Community 70
- Search Client Tests
- Search Router
- Search Client Config
- Search Schema
- Search Indexer
- Community 92
- Community 93
- Community 94

## God Nodes (most connected - your core abstractions)
1. `react` - 40 edges
2. `signup_and_authenticate()` - 37 edges
3. `BlockEditor()` - 34 edges
4. `next` - 32 edges
5. `_post()` - 29 edges
6. `FolderCreate` - 25 edges
7. `signup_and_authenticate()` - 25 edges
8. `useWorkspace()` - 24 edges
9. `Block` - 23 edges
10. `create_note()` - 22 edges

## Surprising Connections (you probably didn't know these)
- `get_current_user()` --uses--> `UserOut`  [INFERRED]
  apps/fastapi-backend/src/fastapi_backend/auth/dependencies.py → apps/fastapi-backend/src/fastapi_backend/auth/models.py
- `get_me()` --uses--> `UserOut`  [INFERRED]
  apps/fastapi-backend/src/fastapi_backend/auth/router.py → apps/fastapi-backend/src/fastapi_backend/auth/models.py
- `test_decode_invalid_signature()` --calls--> `decode_access_token()`  [INFERRED]
  apps/fastapi-backend/tests/test_auth_service.py → apps/fastapi-backend/src/fastapi_backend/auth/service.py
- `test_config_accepts_strong_secret_in_production()` --uses--> `Settings`  [INFERRED]
  apps/fastapi-backend/tests/test_security.py → apps/fastapi-backend/src/fastapi_backend/config.py
- `test_config_rejects_weak_secret_in_production()` --uses--> `Settings`  [INFERRED]
  apps/fastapi-backend/tests/test_security.py → apps/fastapi-backend/src/fastapi_backend/config.py

## Import Cycles
- None detected.

## Communities (96 total, 35 thin omitted)

### Community 0 - "UI Block Editor"
Cohesion: 0.05
Nodes (80): BlockContent(), BlockList(), CanvasNodeImpl(), BlockEditor(), EditorUndoState, SlashState, CodeBlock(), EditableBlock (+72 more)

### Community 1 - "Import Routes"
Cohesion: 0.10
Nodes (31): import_commit(), import_preview(), _read_body(), _first_error_message(), parse_manifest_body(), _reject_constant(), validate_content(), _create_folder() (+23 more)

### Community 2 - "Auth Tests"
Cohesion: 0.08
Nodes (30): override_opensearch_client(), client(), override_get_db(), mock_db(), reset_rate_limits(), _signup_and_authenticate(), test_get_me_unauthorized(), test_get_me_with_bearer_token() (+22 more)

### Community 3 - "Security Config"
Cohesion: 0.06
Nodes (23): Settings, raw_client(), override_get_db(), raw_mock_db(), _signup_raw(), test_allowed_origin_login_passes_origin_gate(), test_config_accepts_strong_secret_in_production(), test_config_dev_generates_secret_when_missing() (+15 more)

### Community 4 - "Note Export"
Cohesion: 0.08
Nodes (14): _ascii_slug(), content_disposition(), NoteOut, TrashItem, create_note(), delete_note(), export_note(), export_workspace() (+6 more)

### Community 5 - "Export Tests"
Cohesion: 0.12
Nodes (26): _create_folder(), _create_note(), _signup(), test_canvas_note_md_includes_canvas_json_flag(), test_content_disposition_preserves_extension_in_utf8_name(), test_export_foreign_note_is_404(), test_export_rejects_unknown_format(), test_folder_zip_and_json_export() (+18 more)

### Community 6 - "Frontend Dependencies"
Cohesion: 0.04
Nodes (44): eslintConfig, dependencies, clsx, @floating-ui/react, geist, lucide-react, next, react (+36 more)

### Community 7 - "Note Routes"
Cohesion: 0.19
Nodes (38): create_folder(), create_note(), signup_and_authenticate(), test_create_and_update_note_with_block_connections(), test_create_note_folder_not_found(), test_create_note_inside_folder(), test_create_note_malformed_folder_id(), test_create_note_success() (+30 more)

### Community 8 - "Auth Models"
Cohesion: 0.10
Nodes (17): MessageResponse, PasswordUpdate, UserEditorPreferences, UserLogin, UserOut, UserProfile, UserSettings, UserSignUp (+9 more)

### Community 9 - "Canvas Components"
Cohesion: 0.11
Nodes (32): CanvasConnections, CanvasConnectionsImpl(), CanvasConnectionsProps, ConnectionLine, CanvasNode, CanvasNodeProps, CanvasToolbar, CanvasToolbarProps (+24 more)

### Community 10 - "Event Outbox"
Cohesion: 0.16
Nodes (16): _create_note(), _signup(), test_event_type_create(), test_event_type_purge_empty_note(), test_event_type_purge_trashed(), test_event_type_restore(), test_event_type_soft_delete(), test_event_type_update() (+8 more)

### Community 11 - "Mock Stores"
Cohesion: 0.11
Nodes (4): MockStore, MockStore, StreamerStateDoc, MockReconcileStore

### Community 12 - "Folder Tree"
Cohesion: 0.18
Nodes (25): FolderCreate, FolderUpdate, make_folder_doc(), make_note_doc(), test_build_workspace_tree_carries_color(), test_build_workspace_tree_cycle_surfaces_as_root(), test_build_workspace_tree_dangling_references_surface_at_root(), test_build_workspace_tree_shape_and_ordering() (+17 more)

### Community 13 - "Search Service"
Cohesion: 0.10
Nodes (13): search(), SearchResponse, SearchResultItem, build_search_query(), merge_mongo_title_hits(), parse_search_hits(), search(), test_build_search_query() (+5 more)

### Community 14 - "Workspace Context"
Cohesion: 0.18
Nodes (28): WorkspaceContext, WorkspaceContextType, WorkspaceProvider(), CanvasMetadata, FolderCreateInput, FolderUpdateInput, LayoutType, Note (+20 more)

### Community 15 - "Reindex Pipeline"
Cohesion: 0.11
Nodes (14): build_opensearch_client(), ensure_index(), generate_block_docs(), is_text_bearing(), load_index_schema(), main(), reindex(), _capture_client_kwargs() (+6 more)

### Community 16 - "Folder Routes"
Cohesion: 0.24
Nodes (26): create_folder(), create_note(), signup_and_authenticate(), test_create_folder_malformed_parent_id(), test_create_folder_parent_not_found(), test_create_folder_success(), test_create_folder_validation_errors(), test_create_nested_folder() (+18 more)

### Community 17 - "UI Navigation"
Cohesion: 0.16
Nodes (22): Breadcrumb(), Fit, Header(), NoteTitleEditor(), useLiveTitle(), ConstructIcon(), FolderPath(), NoteLayoutView() (+14 more)

### Community 18 - "Note Operations"
Cohesion: 0.13
Nodes (13): transaction_or_fallback(), _canvas_only_blocks_change(), create_note(), is_note_empty(), list_notes(), list_notes_full(), list_trashed_notes(), purge_note() (+5 more)

### Community 19 - "Manifest Builder"
Cohesion: 0.12
Nodes (13): _absolute_name_chain(), block_to_markdown(), build_manifest(), build_note_manifest(), build_zip(), _docs_by_id(), _iso(), iter_zip_chunks() (+5 more)

### Community 20 - "Offline UI"
Cohesion: 0.11
Nodes (19): metadata, OfflinePage(), ReconnectButton(), alt, contentType, size, PendingBar(), ShellFrame() (+11 more)

### Community 21 - "Canvas DnD"
Cohesion: 0.13
Nodes (26): deskFly(), ColorSwatchPop(), DndState, DragItem, FolderDeletePopup(), FolderNode(), IndentCells(), ItemKind (+18 more)

### Community 22 - "Workspace Tree"
Cohesion: 0.13
Nodes (12): FolderTreeItem, WorkspaceOut, build_workspace_tree(), create_folder(), delete_folder(), list_folders(), update_folder(), utc_now() (+4 more)

### Community 23 - "App Layout"
Cohesion: 0.13
Nodes (19): AppLayout(), archivo, metadata, newsreader, spaceMono, viewport, fetchNote(), generateMetadata() (+11 more)

### Community 25 - "Rate Limits"
Cohesion: 0.11
Nodes (13): check_rate_limit(), commit_manifest(), find_receipt(), result(), _compensate(), _insert_all(), _Inserted, _json_depth() (+5 more)

### Community 26 - "OS Client Tests"
Cohesion: 0.11
Nodes (9): NewRunner(), TestHeartbeatExhaustedRetries(), TestHeartbeatPayloadFormat(), TestHeartbeatStartupRetry(), NewOSClient(), NewOSClientWithAPIClient(), BuildIndexSchemaJSON(), TestIndexSchemaStructure() (+1 more)

### Community 27 - "Daemon Scripts"
Cohesion: 0.11
Nodes (16): ensureIndexWithRetry(), main(), printUsage(), runDaemon(), getDurationEnv(), getEnv(), Config, LoadDotEnv() (+8 more)

### Community 28 - "Community 28"
Cohesion: 0.14
Nodes (11): ImportBlock, ImportBlockConnection, ImportBlockProperties, ImportCanvasMetadata, ImportCommitOut, ImportFolder, ImportManifest, ImportNote (+3 more)

### Community 29 - "Auth Pages"
Cohesion: 0.14
Nodes (19): archivo, AuthLayout(), metadata, newsreader, spaceMono, AuthContext, AuthContextType, AuthProvider() (+11 more)

### Community 30 - "Block Types"
Cohesion: 0.14
Nodes (7): Block, BlockConnection, BlockProperties, CanvasMetadata, normalize_color(), NoteCreate, NoteUpdate

### Community 31 - "Folder API"
Cohesion: 0.19
Nodes (8): FolderOut, create_folder(), delete_folder(), export_folder(), get_folder(), get_workspace(), list_folders(), update_folder()

### Community 33 - "Mongo Watchers"
Cohesion: 0.14
Nodes (8): IsError286(), NewWatcher(), TestError286Detection(), NewMongoStoreWithClient(), NewMongoNoteReaderWithClient(), Watcher, MongoNoteReader, MongoStore

### Community 34 - "Replay Handler"
Cohesion: 0.15
Nodes (16): handleReplay(), handleResetToken(), main(), printUsage(), runDaemon(), TestPrintUsage(), getDurationEnv(), getEnv() (+8 more)

### Community 35 - "Dashboard Events"
Cohesion: 0.18
Nodes (17): DashboardPage(), DESK_BURST_EVENT, DESK_FLY_EVENT, DESK_SIGNOUT_EVENT, DESK_TOAST_EVENT, deskBurst(), DeskChrome(), deskToast() (+9 more)

### Community 36 - "Landing Page"
Cohesion: 0.14
Nodes (15): archivo, LandingPage(), metadata, newsreader, spaceMono, structuredData, viewport, FeatureGrid() (+7 more)

### Community 37 - "Login Signup"
Cohesion: 0.15
Nodes (17): LoginPage(), metadata, viewport, metadata, SignupPage(), viewport, AuthSlips(), Field() (+9 more)

### Community 38 - "Export Modal"
Cohesion: 0.18
Nodes (16): DownloadState, ExportModal(), FormatChoice, formatChoices(), Mode, Selection, buildPickerList(), ContainedNote (+8 more)

### Community 39 - "Profile Trash"
Cohesion: 0.17
Nodes (17): countFolders(), daysLeft(), DisplayNameRow(), PasswordForm(), ProfileConsole(), PurgeButton(), Toast, TrashPanel() (+9 more)

### Community 40 - "Kafka Consumer Tests"
Cohesion: 0.26
Nodes (15): NewConsumerWithCommitter(), TestProcessRecord_CommitAfterTransientRetrySuccess(), TestProcessRecord_GracefulSIGTERMDrain(), TestProcessRecord_NoCommitOnFailure(), TestProcessRecord_OffsetCommitOnlyAfterSuccess(), EventHandler, NewEventHandler(), ptrString() (+7 more)

### Community 41 - "Kafka Producers"
Cohesion: 0.18
Nodes (4): NewFranzProducerWithClient(), Committer, Consumer, FranzProducer

### Community 42 - "TS Config"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 43 - "Rate Config"
Cohesion: 0.16
Nodes (6): _consume_slot(), get_client_ip(), rate_limit_login(), rate_limit_password_check(), rate_limit_signup(), RateLimitConfig

### Community 44 - "Worker Pool"
Cohesion: 0.16
Nodes (8): Candidate, NewWorkerPool(), scheduledRetryDelay(), NewPoller(), TestPollerCandidateSelection(), Publisher, WorkerPool, Poller

### Community 45 - "Mock Search"
Cohesion: 0.13
Nodes (5): NoteDoc, MockCommitter, MockSearchForConsumer, MockProducer, MockSearchClient

### Community 46 - "Event Tests"
Cohesion: 0.26
Nodes (12): NewPublisher(), NewMockProducer(), NewMockStore(), TestCrashAfterKafkaAckBeforeMongoStatusUpdate(), TestDuplicateChangeStreamAndReconcileCandidates(), TestFailedEventReplay(), TestKafkaOutageRetryAndPermanentFailure(), TestKafkaOutageSchedulesRetryBackoff() (+4 more)

### Community 47 - "Event Envelope"
Cohesion: 0.15
Nodes (5): Store, Event, EventEnvelope, EventPayload, CleanEnvelope

### Community 48 - "Site Metadata"
Cohesion: 0.24
Nodes (6): AUTHOR_NAME, GITHUB_URL, LANDING_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL

### Community 49 - "Auth Service"
Cohesion: 0.19
Nodes (6): get_current_user(), create_access_token(), decode_access_token(), test_create_and_decode_access_token(), test_decode_expired_access_token(), test_decode_invalid_signature()

### Community 50 - "Health Endpoints"
Cohesion: 0.21
Nodes (5): Database, add_security_headers(), HealthResponse, lifespan(), liveness_check()

### Community 51 - "Event Payloads"
Cohesion: 0.15
Nodes (4): _build_outbox_doc(), utc_now(), NoteEvent, NoteEventPayload

### Community 53 - "Canvas Spec"
Cohesion: 0.21
Nodes (11): CANVAS_WIRES_DEF, CanvasSpecimenView(), DOCUMENT_BLOCKS, DocumentModeView(), ICON_BTN_STYLE, LandingModesSpecimen(), Mode, MODE_COPY (+3 more)

### Community 54 - "Service Worker"
Cohesion: 0.20
Nodes (9): metadata, RootLayout(), verification, viewport, ServiceWorkerRegister(), AUTHOR_URL, BING_VERIFICATION, GSC_VERIFICATION (+1 more)

### Community 55 - "Mongo Reader"
Cohesion: 0.20
Nodes (4): MongoNote, MockMongoForConsumer, MockNoteReader, NoteReader

### Community 56 - "Note Queries"
Cohesion: 0.25
Nodes (3): get_owned_note(), get_trashed_note(), parse_object_id()

### Community 57 - "CSRF"
Cohesion: 0.22
Nodes (4): generate_csrf_token(), set_csrf_cookie(), get_csrf(), get_me()

### Community 61 - "Doc Types"
Cohesion: 0.25
Nodes (5): DocID(), IsTextBearing(), StringFromID(), Block, BlockProperties

### Community 63 - "Pricing Page"
Cohesion: 0.39
Nodes (5): inkBurst(), Barcode(), PricingSection(), Scissors(), terms

### Community 65 - "System Architecture"
Cohesion: 0.40
Nodes (6): FastAPI Server, Apache Kafka, MongoDB Database, Next.js Frontend, OpenSearch Service, Jam Note System Architecture Diagram

### Community 67 - "Tab Component"
Cohesion: 0.50
Nodes (4): FeatureShowcase(), Panel(), Tab, tabs

### Community 68 - "Landing Header"
Cohesion: 0.60
Nodes (3): LandingHeader(), labels, SpreadIndicator()

### Community 69 - "Cache Handler"
Cohesion: 0.60
Nodes (3): handleNavigation(), handleStaticAsset(), trimCache()

## Knowledge Gaps
- **161 isolated node(s):** `api_start.sh script`, `fastapi-backend`, `hybrid_outbox_streamer`, `metadata`, `viewport` (+156 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 483 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **35 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `UI Navigation` to `UI Block Editor`, `Dashboard Events`, `Landing Page`, `Login Signup`, `Tab Component`, `Landing Header`, `Export Modal`, `Canvas Components`, `Profile Trash`, `Frontend Dependencies`, `Workspace Context`, `Offline UI`, `Canvas Spec`, `Canvas DnD`, `Service Worker`, `App Layout`, `Auth Pages`, `Pricing Page`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Why does `next` connect `Offline UI` to `Dashboard Events`, `Landing Page`, `Login Signup`, `Landing Header`, `Profile Trash`, `Frontend Dependencies`, `Site Metadata`, `UI Navigation`, `Canvas DnD`, `Service Worker`, `App Layout`, `Auth Pages`, `Pricing Page`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `FolderCreate` connect `Folder Tree` to `Folder API`, `Workspace Tree`, `Block Types`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **What connects `api_start.sh script`, `fastapi-backend`, `hybrid_outbox_streamer` to the rest of the system?**
  _161 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `UI Block Editor` be split into smaller, more focused modules?**
  _Cohesion score 0.051589567865981345 - nodes in this community are weakly interconnected._
- **Should `Import Routes` be split into smaller, more focused modules?**
  _Cohesion score 0.10275689223057644 - nodes in this community are weakly interconnected._
- **Should `Auth Tests` be split into smaller, more focused modules?**
  _Cohesion score 0.07811447811447811 - nodes in this community are weakly interconnected._