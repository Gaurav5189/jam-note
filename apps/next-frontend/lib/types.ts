// Shared types mirroring the FastAPI Pydantic models in
// apps/fastapi-backend/src/fastapi_backend/notes/models.py and auth/models.py.

export interface User {
  id: string;
  email: string;
  username: string;
  profile: {
    display_name?: string;
    avatar_url?: string;
  };
  settings: {
    theme: string;
    editor_preferences: {
      default_layout: string;
      font_family: string;
      font_size: number;
    };
  };
  created_at: string;
}

export type LayoutType = "document" | "canvas";

export interface BlockProperties {
  text?: string | null;
  language?: string | null;
  checked?: boolean | null;
  src?: string | null;
  // Mirrors BlockProperties' `extra="allow"` on the backend — future block
  // types may carry additional keys.
  [key: string]: unknown;
}

export interface CanvasMetadata {
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string | null;
}

export interface Block {
  id: string;
  type: string;
  properties: BlockProperties;
  canvas_metadata?: CanvasMetadata | null;
}

export interface BlockConnection {
  from_id: string;
  to_id: string;
  color?: string | null;
}

export interface NoteListItem {
  id: string;
  folder_id: string | null;
  title: string;
  layout_type: LayoutType;
  emoji_icon: string | null;
  /** Sidebar accent (Phase 6 color coding) — palette key or null. */
  color: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface Note extends NoteListItem {
  blocks: Block[];
  block_connections?: BlockConnection[];
}

/** Folder shape mirroring the backend's FolderOut — pure containers. */
export interface Folder {
  id: string;
  parent_folder_id: string | null;
  name: string;
  order: number;
  /** Sidebar accent (Phase 6 color coding) — palette key or null. */
  color: string | null;
  created_at: string;
  updated_at: string;
}
/** A folder plus its nested folders and notes (folders before notes). */
export interface FolderTreeItem extends Folder {
  folders: FolderTreeItem[];
  notes: NoteListItem[];
}

/** Root-level tree returned by GET /api/workspace. */
export interface WorkspaceTree {
  folders: FolderTreeItem[];
  notes: NoteListItem[];
}

export interface NoteCreateInput {
  title: string;
  folder_id?: string | null;
  layout_type?: LayoutType;
  emoji_icon?: string | null;
  color?: string | null;
  blocks?: Block[];
  block_connections?: BlockConnection[];
}

export interface NoteUpdateInput {
  title?: string;
  folder_id?: string | null;
  layout_type?: LayoutType;
  emoji_icon?: string | null;
  color?: string | null;
  blocks?: Block[];
  block_connections?: BlockConnection[];
}

export interface FolderCreateInput {
  name: string;
  parent_folder_id?: string | null;
  color?: string | null;
}

export interface FolderUpdateInput {
  name?: string;
  parent_folder_id?: string | null;
  color?: string | null;
}

/** A soft-deleted note as listed by the Profile trash view
 *  (GET /api/notes/trash) — the 30-day purge clock reads deleted_at. */
export interface TrashItem extends NoteListItem {
  deleted_at: string;
}

/** POST /api/import/preview response — counts, nothing committed. */
export interface ImportPreview {
  folders: number;
  notes: number;
  size_bytes: number;
  message: string;
}

/** POST /api/import/commit response. */
export interface ImportCommit {
  folders: number;
  notes: number;
  message: string;
}
