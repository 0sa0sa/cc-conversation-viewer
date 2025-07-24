import { readFileSync } from 'fs';
import { ConversationEntry, ConversationData, Message, ClaudeCodeEntry, ClaudeCodeMessageEntry } from './types';

export class JsonlParser {
  static parseFile(filePath: string): ConversationData {
    const content = readFileSync(filePath, 'utf-8');
    return this.parseString(content);
  }

  static parseString(content: string): ConversationData {
    const lines = content.split('\n').filter(line => line.trim() !== '');
    const entries: ConversationEntry[] = [];
    let sessionId: string | undefined;
    let version: string | undefined;
    let cwd: string | undefined;
    let firstTimestamp: string | undefined;

    for (const line of lines) {
      try {
        const parsed: ClaudeCodeEntry = JSON.parse(line);
        const entry = this.parseClaudeCodeEntry(parsed);
        if (entry) {
          entries.push(entry);
          
          // Extract metadata from first message entry
          if (!sessionId && 'sessionId' in parsed) {
            sessionId = parsed.sessionId;
            version = parsed.version;
            cwd = parsed.cwd;
            firstTimestamp = parsed.timestamp;
          }
        }
      } catch (error) {
        // Try legacy format as fallback
        try {
          const parsed = JSON.parse(line);
          const entry = this.parseLegacyEntry(parsed);
          if (entry) {
            entries.push(entry);
          }
        } catch (legacyError) {
          console.warn(`Failed to parse line: ${line.substring(0, 100)}...`, error);
        }
      }
    }

    return {
      entries,
      metadata: {
        sessionId,
        version,
        cwd,
        created_at: firstTimestamp || new Date().toISOString(),
        title: `Claude Code Conversation (${entries.length} entries)`
      }
    };
  }

  private static parseClaudeCodeEntry(data: ClaudeCodeEntry): ConversationEntry | null {
    if (data.type === 'summary') {
      // Summary entries are informational, convert to a text entry
      return {
        id: data.leafUuid,
        timestamp: new Date().toISOString(),
        message: {
          role: 'assistant',
          content: [{ 
            type: 'text', 
            text: `📋 Conversation Summary: ${data.summary}` 
          }]
        }
      };
    }

    if (data.type === 'user' || data.type === 'assistant') {
      // Ensure content is always an array
      let content = data.message.content;
      if (typeof content === 'string') {
        content = [{ type: 'text', text: content }];
      } else if (!Array.isArray(content)) {
        content = [{ type: 'text', text: String(content) }];
      }

      return {
        id: data.uuid,
        timestamp: data.timestamp,
        message: {
          role: data.message.role,
          content: content
        },
        model: data.version,
        isSidechain: data.isSidechain,
        parentUuid: data.parentUuid || undefined
      };
    }

    return null;
  }

  private static parseLegacyEntry(data: any): ConversationEntry | null {
    // Handle different possible formats
    if (data.message) {
      // Format: { message: { role, content }, timestamp, usage, etc. }
      return {
        id: data.id,
        timestamp: data.timestamp,
        message: data.message,
        model: data.model,
        usage: data.usage
      };
    } else if (data.role && data.content) {
      // Format: { role, content, timestamp, etc. }
      return {
        id: data.id,
        timestamp: data.timestamp,
        message: {
          role: data.role,
          content: Array.isArray(data.content) ? data.content : [{ type: 'text', text: data.content }]
        },
        model: data.model,
        usage: data.usage
      };
    }

    return null;
  }

  static formatToolUse(toolUse: any): string {
    const name = toolUse.name || 'unknown';
    const input = toolUse.input || {};
    
    let formattedInput = '';
    if (typeof input === 'string') {
      formattedInput = input;
    } else if (typeof input === 'object') {
      // Use pretty-printed JSON for better readability
      try {
        formattedInput = JSON.stringify(input, null, 2);
      } catch (error) {
        // Fallback to simple key-value pairs if JSON.stringify fails
        formattedInput = Object.keys(input).map(key => `${key}: ${input[key]}`).join(', ');
      }
    }

    return `Tool: ${name}${formattedInput ? `\n${formattedInput}` : ''}`;
  }

  static formatToolResult(toolResult: any): string {
    const content = toolResult.content || '';
    const isError = toolResult.is_error || false;
    
    let formattedContent = content;
    
    // If content is an object or can be parsed as JSON, format it nicely
    if (typeof content === 'object') {
      try {
        formattedContent = JSON.stringify(content, null, 2);
      } catch (error) {
        formattedContent = String(content);
      }
    } else if (typeof content === 'string' && content.trim().startsWith('{') && content.trim().endsWith('}')) {
      try {
        const parsed = JSON.parse(content);
        formattedContent = JSON.stringify(parsed, null, 2);
      } catch (error) {
        // If parsing fails, keep original content
        formattedContent = content;
      }
    }
    
    return `${isError ? 'Error: ' : 'Result: '}${formattedContent}`;
  }
}