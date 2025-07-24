import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { JsonlParser } from './parser';
import { ConversationViewer } from './viewer';

export class JsonlCombiner {
  static combineJsonlFiles(directoryPath: string, outputPath: string): void {
    const files = [
      '274bd400-8038-4831-857e-17fb352b6e47.jsonl',
      '4adabc28-290e-42b7-98b0-b1eef3bd432a.jsonl',
      '4b2aebeb-8c40-4d08-abbc-65dd3709d4b6.jsonl',
      '500b8dc2-c0de-442e-99b2-e82baafeaf27.jsonl',
      '5d81d330-0820-46f7-9f4b-ba73f9d19430.jsonl',
      '701bbd8a-5789-48d8-a5ea-510b14434d1f.jsonl',
      '72d76679-843b-4350-9935-6a5252a6b6dd.jsonl',
      '85819350-a1e9-42ce-8408-cba55ecb51f4.jsonl',
      '87a0e125-33e8-4c39-b8db-864a171381a9.jsonl',
      '99bba365-9022-4b41-bc17-a6b53e23ea38.jsonl',
      'b0527203-3489-4eb4-8871-514530dc34d2.jsonl',
      'b6a18d09-a9e1-4c37-9314-19fb4d403f23.jsonl',
      'd57c5530-f55f-4614-abd7-44aa43a1915c.jsonl',
      'da3bde57-610b-4a64-908a-79958ea4f69d.jsonl',
      'f190e297-5cb3-4901-99e1-62ff54cccc8a.jsonl'
    ];

    const combinedContent: string[] = [];
    
    console.log(`📁 Reading ${files.length} JSONL files...`);
    
    for (const file of files) {
      const filePath = join(directoryPath, file);
      try {
        console.log(`📄 Reading ${file}...`);
        const content = readFileSync(filePath, 'utf-8');
        
        // Add each line from the file to the combined content
        const lines = content.split('\n').filter(line => line.trim() !== '');
        combinedContent.push(...lines);
        
        console.log(`✅ Added ${lines.length} lines from ${file}`);
      } catch (error) {
        console.error(`❌ Failed to read ${file}:`, error);
      }
    }

    // Join all lines with newlines to create one large JSONL string
    const combinedJsonl = combinedContent.join('\n');
    
    console.log(`\n📊 Combined ${combinedContent.length} total lines`);
    console.log(`📝 Parsing as single conversation...`);

    // Parse the combined JSONL as a single conversation
    const conversationData = JsonlParser.parseString(combinedJsonl);
    
    console.log(`✅ Parsed ${conversationData.entries.length} entries`);

    // Update metadata
    conversationData.metadata = {
      ...conversationData.metadata,
      title: `Combined Claude Code Conversations (${conversationData.entries.length} entries)`
    };

    // Generate HTML
    const html = ConversationViewer.generateHtml(conversationData);
    
    // Write to file
    writeFileSync(outputPath, html, 'utf-8');
    console.log(`\n💾 Combined conversation saved to: ${outputPath}`);
  }
}

// Execute the combination if called directly
if (require.main === module) {
  const directoryPath = '/Users/osa/.claude/projects/-Users-osa-project-web-chat';
  const outputPath = '/Users/osa/project/cc-conversation-viewer/combined-conversations.html';
  
  JsonlCombiner.combineJsonlFiles(directoryPath, outputPath);
}