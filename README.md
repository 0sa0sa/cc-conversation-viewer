# Claude Code Conversation Viewer

A TypeScript-based parser and viewer for Claude Code conversation history in JSONL format. This tool helps you analyze and visualize your interactions with Claude Code in a readable format, making it easier to learn from others' usage patterns and improve your own workflow.

## Features

- 📖 **JSONL Parser**: Robust parsing of Claude Code conversation logs
- 🖥️ **Console Viewer**: Clean, readable terminal output with emojis and formatting
- 🌐 **HTML Export**: Beautiful web-based viewer with syntax highlighting
- 🔧 **Tool Analysis**: Detailed display of tool usage and results
- 📊 **Token Tracking**: Display input/output token usage statistics
- 🎨 **Rich Formatting**: Proper handling of text, code, images, and tool interactions
- 📱 **Responsive Design**: HTML output works on desktop and mobile devices

## Installation

```bash
# Clone the repository
git clone https://github.com/0sa0sa/cc-conversation-viewer.git
cd cc-conversation-viewer

# Install dependencies
npm install

# Build the project
npm run build
```

## Usage

### Command Line Interface

```bash
# Display conversation in terminal
npx ts-node src/index.ts path/to/conversation.jsonl

# Export to HTML
npx ts-node src/index.ts path/to/conversation.jsonl --html output.html

# Using built version
npm run build
node dist/index.js path/to/conversation.jsonl --html output.html
```

### As a Library

```typescript
import { JsonlParser, ConversationViewer } from './src/index';

// Parse a JSONL file
const conversationData = JsonlParser.parseFile('conversation.jsonl');

// Display in console
ConversationViewer.displayConversation(conversationData);

// Generate HTML
const html = ConversationViewer.generateHtml(conversationData);
```

## Sample Data Format

The tool expects JSONL files where each line contains a conversation entry:

```jsonl
{"role": "user", "content": [{"type": "text", "text": "Hello!"}], "timestamp": "2024-01-15T10:00:00Z"}
{"role": "assistant", "content": [{"type": "text", "text": "Hi there!"}, {"type": "tool_use", "id": "tool_123", "name": "Read", "input": {"file_path": "/path/to/file.js"}}], "timestamp": "2024-01-15T10:00:05Z", "usage": {"input_tokens": 15, "output_tokens": 42}}
```

## Supported Content Types

- **Text**: Plain text messages
- **Tool Use**: Function calls with parameters
- **Tool Results**: Function execution results
- **Images**: Base64 encoded images with metadata
- **Usage Statistics**: Token consumption data

## Project Structure

```
cc-conversation-viewer/
├── src/
│   ├── index.ts          # CLI entry point and exports
│   ├── parser.ts         # JSONL parsing logic
│   ├── types.ts          # TypeScript type definitions
│   └── viewer.ts         # Console and HTML rendering
├── dist/                 # Compiled JavaScript output
├── sample.jsonl          # Sample conversation data
├── package.json          # Project configuration
├── tsconfig.json         # TypeScript configuration
└── README.md             # This file
```

## Type Definitions

### Core Types

```typescript
interface ConversationEntry {
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
}

interface Message {
  role: 'user' | 'assistant';
  content: MessageContent[];
  timestamp?: string;
}

type MessageContent = TextContent | ImageContent | ToolUse | ToolResult;
```

## Console Output Features

- 👤 **User messages**: Clearly marked with user icon
- 🤖 **Assistant messages**: Marked with robot icon
- 🔧 **Tool usage**: Highlighted tool calls with parameters
- 📥 **Tool results**: Formatted execution results
- 📊 **Token statistics**: Input/output token counts
- 🕐 **Timestamps**: Human-readable date/time formatting

## HTML Output Features

- **Responsive design**: Works on all screen sizes
- **Syntax highlighting**: Color-coded message types
- **Clean typography**: Easy-to-read font and spacing
- **Message threading**: Visual distinction between user and assistant
- **Tool visualization**: Special formatting for tool interactions
- **Print-friendly**: Optimized for printing conversations

## Development

### Scripts

```bash
# Development with auto-reload
npm run dev path/to/conversation.jsonl

# Build TypeScript
npm run build

# Run built version
npm run start path/to/conversation.jsonl
```

### Adding New Features

1. **New Content Types**: Add to `types.ts` and update parsers
2. **New Output Formats**: Extend `ConversationViewer` class
3. **Enhanced Parsing**: Modify `JsonlParser` for new formats

## Common Use Cases

### Learning from Others

```bash
# View a shared conversation
npx ts-node src/index.ts shared-conversation.jsonl --html analysis.html
```

### Analyzing Your Own Usage

```bash
# Export your Claude Code history
npx ts-node src/index.ts ~/.claude-code/conversations/*.jsonl --html my-usage.html
```

### Debugging Tool Usage

```bash
# Focus on tool interactions
npx ts-node src/index.ts debug-session.jsonl
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Make your changes and add tests
4. Build and test: `npm run build && npm test`
5. Commit your changes: `git commit -m 'Add new feature'`
6. Push to the branch: `git push origin feature/new-feature`
7. Submit a pull request

## Requirements

- Node.js 16.0 or higher
- TypeScript 5.0 or higher
- npm or yarn package manager

## License

MIT License - see LICENSE file for details

## Acknowledgments

- Built for analyzing [Claude Code](https://claude.ai/code) conversation logs
- Inspired by the need to learn from community usage patterns
- TypeScript for type safety and better development experience

---

**Note**: This tool is designed to help developers learn from each other's Claude Code usage patterns. Always respect privacy and only share conversations with appropriate permissions.