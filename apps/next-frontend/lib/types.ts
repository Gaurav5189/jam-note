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
  parent_id: string | null;
  title: string;
  layout_type: LayoutType;
  emoji_icon: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface Note extends NoteListItem {
  blocks: Block[];
  block_connections?: BlockConnection[];
}

export interface NoteTreeItem extends NoteListItem {
  children: NoteTreeItem[];
}

export interface NoteCreateInput {
  title: string;
  parent_id?: string | null;
  layout_type?: LayoutType;
  emoji_icon?: string | null;
  blocks?: Block[];
  block_connections?: BlockConnection[];
}

export interface NoteUpdateInput {
  title?: string;
  layout_type?: LayoutType;
  emoji_icon?: string | null;
  blocks?: Block[];
  block_connections?: BlockConnection[];
}
