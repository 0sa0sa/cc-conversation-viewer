#!/usr/bin/env node

import { writeFileSync } from 'fs';
import { JsonlParser } from './parser';
import { ConversationViewer } from './viewer';

function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: ts-node src/index.ts <jsonl-file> [--html <output-file>]');
    console.log('');
    console.log('Examples:');
    console.log('  ts-node src/index.ts conversation.jsonl');
    console.log('  ts-node src/index.ts conversation.jsonl --html output.html');
    process.exit(1);
  }

  const jsonlFile = args[0];
  const htmlOutputIndex = args.indexOf('--html');
  const htmlOutput = htmlOutputIndex !== -1 ? args[htmlOutputIndex + 1] : null;

  try {
    console.log(`📖 Parsing ${jsonlFile}...`);
    const conversationData = JsonlParser.parseFile(jsonlFile);
    
    if (htmlOutput) {
      console.log(`📄 Generating HTML output to ${htmlOutput}...`);
      const html = ConversationViewer.generateHtml(conversationData);
      writeFileSync(htmlOutput, html);
      console.log(`✅ HTML file generated: ${htmlOutput}`);
    } else {
      console.log('📺 Displaying conversation:');
      console.log();
      ConversationViewer.displayConversation(conversationData);
    }
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Export for library use
export { JsonlParser, ConversationViewer };
export * from './types';

// Run CLI if this is the main module
if (require.main === module) {
  main();
}