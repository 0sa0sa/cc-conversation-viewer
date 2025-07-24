export interface ToolUse {
  type: 'tool_use';
  id: string;
  name: string;
  input: any;
}

export interface ToolResult {
  type: 'tool_result';
  tool_use_id: string;
  content: string | any;
  is_error?: boolean;
}

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ThinkingContent {
  type: 'thinking';
  thinking: string;
}

export interface ImageContent {
  type: 'image';
  source: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

export type MessageContent = TextContent | ThinkingContent | ImageContent | ToolUse | ToolResult;

export interface Message {
  role: 'user' | 'assistant';
  content: MessageContent[];
}

// Claude Code specific types
export interface ClaudeCodeMessageEntry {
  parentUuid: string | null;
  isSidechain: boolean;
  userType: string;
  cwd: string;
  sessionId: string;
  version: string;
  type: 'user' | 'assistant';
  message: Message;
  uuid: string;
  timestamp: string;
}

export interface ClaudeCodeSummaryEntry {
  type: 'summary';
  summary: string;
  leafUuid: string;
}

export type ClaudeCodeEntry = ClaudeCodeMessageEntry | ClaudeCodeSummaryEntry;

// Legacy format support
export interface ConversationEntry {
  id?: string;
  timestamp?: string;
  message: Message;
  model?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  isSidechain?: boolean;
  parentUuid?: string;
}

export interface ConversationData {
  entries: ConversationEntry[];
  metadata?: {
    title?: string;
    created_at?: string;
    updated_at?: string;
    model?: string;
    sessionId?: string;
    version?: string;
    cwd?: string;
  };
}