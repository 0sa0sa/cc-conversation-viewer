import { ConversationData, ConversationEntry, MessageContent } from './types';
import { JsonlParser } from './parser';

interface ProcessingWorkflowGroup {
  type: 'processing_workflow';
  assistantMessages: ConversationEntry[];
  internalProcessing: MessageContent[];
  finalResponse: MessageContent[];
  toolResults: ConversationEntry[];
  summary: string;
  timestamp: string;
}

interface BashWorkflowGroup {
  type: 'bash_workflow';
  bashInput: MessageContent;
  bashOutput: ConversationEntry;
  userComment?: ConversationEntry;
  timestamp: string;
}

interface RegularMessage {
  type: 'regular';
  entry: ConversationEntry;
}

type ProcessedMessage = ProcessingWorkflowGroup | BashWorkflowGroup | RegularMessage;

export class ConversationViewer {
  // Helper function to check if a message contains only tool results (not actual user input)
  private static isToolResultMessage(entry: ConversationEntry): boolean {
    return entry.message.role === 'user' && 
           entry.message.content.every(content => content.type === 'tool_result');
  }

  // Helper function to check if an assistant message contains tool usage
  private static hasToolUsage(entry: ConversationEntry): boolean {
    return entry.message.role === 'assistant' && 
           entry.message.content.some(content => content.type === 'tool_use');
  }

  // Helper function to check if a message content is a Bash tool use
  private static isBashToolUse(content: MessageContent): boolean {
    return content.type === 'tool_use' && content.name === 'Bash';
  }

  // Helper function to check if a tool result is from Bash
  private static isBashToolResult(entry: ConversationEntry): boolean {
    return this.isToolResultMessage(entry) && 
           entry.message.content.some(content => 
             content.type === 'tool_result' && content.tool_use_id
           );
  }

  // Helper function to separate internal processing from final response in assistant messages
  private static separateInternalProcessing(entry: ConversationEntry): {
    internalProcessing: MessageContent[],
    finalResponse: MessageContent[]
  } {
    const internalProcessing: MessageContent[] = [];
    const finalResponse: MessageContent[] = [];
    
    // Find the last text content as the final response
    const textContents = entry.message.content.filter(content => content.type === 'text');
    const lastTextContent = textContents.length > 0 ? textContents[textContents.length - 1] : null;
    
    entry.message.content.forEach(content => {
      if (content.type === 'tool_use' || 
          content.type === 'thinking' || 
          (content.type === 'text' && content !== lastTextContent)) {
        internalProcessing.push(content);
      } else if (content === lastTextContent) {
        finalResponse.push(content);
      } else {
        // Other content types (image, etc.) go to final response
        finalResponse.push(content);
      }
    });
    
    return { internalProcessing, finalResponse };
  }

  // Generate processing workflow summary
  private static generateProcessingSummary(internalProcessing: MessageContent[], subsequentToolResults: ConversationEntry[], assistantMessageCount: number = 1): string {
    const toolCount = internalProcessing.filter(content => content.type === 'tool_use').length;
    const thinkingCount = internalProcessing.filter(content => content.type === 'thinking').length;
    const textCount = internalProcessing.filter(content => content.type === 'text').length;
    
    const parts: string[] = [];
    
    // Add message count if multiple assistant messages
    if (assistantMessageCount > 1) {
      parts.push(`📝 ${assistantMessageCount} assistant messages`);
    }
    
    if (thinkingCount > 0) {
      parts.push(`🤔 ${thinkingCount} thinking step${thinkingCount > 1 ? 's' : ''}`);
    }
    
    if (toolCount > 0) {
      const toolNames = internalProcessing
        .filter(content => content.type === 'tool_use')
        .map(content => content.name || 'Unknown');
      
      // Get unique tool names and their counts
      const toolCountMap = new Map<string, number>();
      toolNames.forEach(name => {
        toolCountMap.set(name, (toolCountMap.get(name) || 0) + 1);
      });
      
      const uniqueTools = Array.from(toolCountMap.entries())
        .map(([name, count]) => count > 1 ? `${name}(${count})` : name)
        .slice(0, 3); // Show first 3 unique tools
      
      let toolPart = `🔧 ${toolCount} tool${toolCount > 1 ? 's' : ''}: ${uniqueTools.join(', ')}`;
      if (uniqueTools.length < toolCountMap.size) {
        toolPart += ` +${toolCountMap.size - uniqueTools.length} more`;
      }
      parts.push(toolPart);
    }
    
    if (textCount > 0) {
      parts.push(`💭 ${textCount} intermediate response${textCount > 1 ? 's' : ''}`);
    }
    
    const toolResultCount = subsequentToolResults.length;
    if (toolResultCount > 0) {
      parts.push(`📥 ${toolResultCount} result${toolResultCount > 1 ? 's' : ''}`);
    }
    
    return parts.length > 0 ? parts.join(', ') : 'Processing steps';
  }

  // Group messages to identify processing workflows
  private static groupMessages(entries: ConversationEntry[]): ProcessedMessage[] {
    const processedMessages: ProcessedMessage[] = [];
    let i = 0;
    
    while (i < entries.length) {
      const entry = entries[i];
      
      // Check if this is an assistant message with a Bash tool use
      if (entry.message.role === 'assistant') {
        const bashToolUse = entry.message.content.find(content => this.isBashToolUse(content));
        
        if (bashToolUse) {
          // Look for the bash tool result in the next message
          if (i + 1 < entries.length && this.isBashToolResult(entries[i + 1])) {
            const bashOutput = entries[i + 1];
            let userComment: ConversationEntry | undefined;
            let nextIndex = i + 2;
            
            // Check if the next message is a user comment about the bash output
            if (nextIndex < entries.length && 
                entries[nextIndex].message.role === 'user' && 
                !this.isToolResultMessage(entries[nextIndex]) &&
                !entries[nextIndex].isSidechain) {
              userComment = entries[nextIndex];
              nextIndex = i + 3;
            }
            
            // Create bash workflow group
            processedMessages.push({
              type: 'bash_workflow',
              bashInput: bashToolUse,
              bashOutput: bashOutput,
              userComment: userComment,
              timestamp: entry.timestamp || ''
            });
            
            i = nextIndex;
            continue;
          }
        }
        
        // Regular assistant message processing (existing logic)
        // Collect all consecutive assistant/tool-result messages until next user/sub-agent message
        const assistantMessages: ConversationEntry[] = [];
        const toolResults: ConversationEntry[] = [];
        let j = i;
        
        // Collect the sequence of assistant and tool result messages
        while (j < entries.length) {
          const currentEntry = entries[j];
          
          if (currentEntry.message.role === 'assistant') {
            assistantMessages.push(currentEntry);
            j++;
          } else if (this.isToolResultMessage(currentEntry)) {
            toolResults.push(currentEntry);
            j++;
          } else {
            // Hit a real user message or sub-agent, stop collecting
            break;
          }
        }
        
        // Process all collected assistant messages
        const allInternalProcessing: MessageContent[] = [];
        let finalResponse: MessageContent[] = [];
        
        // Extract internal processing from all assistant messages
        assistantMessages.forEach((assistantMsg, index) => {
          const { internalProcessing, finalResponse: msgFinalResponse } = this.separateInternalProcessing(assistantMsg);
          
          // Add all internal processing
          allInternalProcessing.push(...internalProcessing);
          
          // Only keep the final response from the last assistant message
          if (index === assistantMessages.length - 1) {
            finalResponse = msgFinalResponse;
          } else {
            // Treat previous assistant messages' text content as internal processing
            msgFinalResponse.forEach(content => {
              if (content.type === 'text') {
                allInternalProcessing.push(content);
              } else {
                // Keep non-text content (like images) in final response
                finalResponse.push(content);
              }
            });
          }
        });
        
        // Check if there's any internal processing or multiple assistant messages
        if (allInternalProcessing.length > 0 || assistantMessages.length > 1) {
          // Create processing workflow group
          const summary = this.generateProcessingSummary(allInternalProcessing, toolResults, assistantMessages.length);
          const timestamp = assistantMessages[0].timestamp || '';
          
          processedMessages.push({
            type: 'processing_workflow',
            assistantMessages,
            internalProcessing: allInternalProcessing,
            finalResponse,
            toolResults,
            summary,
            timestamp
          });
        } else {
          // Simple assistant message with no internal processing
          processedMessages.push({
            type: 'regular',
            entry: assistantMessages[0]
          });
        }
        
        // Move to the next unprocessed message
        i = j;
      } else {
        // Non-assistant message
        processedMessages.push({
          type: 'regular',
          entry
        });
        i++;
      }
    }
    
    return processedMessages;
  }

  // Helper function to extract summary from a message for table of contents
  private static extractMessageSummary(entry: ConversationEntry, maxLength: number = 100): string {
    const textContent = entry.message.content.find(content => content.type === 'text');
    if (textContent && 'text' in textContent) {
      const text = textContent.text || '';
      if (text.length <= maxLength) {
        return text;
      }
      return text.substring(0, maxLength) + '...';
    }
    
    // If no text content, look for other content types
    const otherContent = entry.message.content[0];
    if (otherContent) {
      switch (otherContent.type) {
        case 'tool_use':
          return `🔧 Tool: ${otherContent.name || 'Unknown'}`;
        case 'tool_result':
          return '📥 Tool Result';
        case 'thinking':
          return '🤔 Thinking...';
        case 'image':
          return '🖼️ Image';
        default:
          return 'Message';
      }
    }
    
    return 'Empty message';
  }

  // Generate table of contents for the conversation
  private static generateTableOfContents(data: ConversationData): string {
    let tocItems: string[] = [];
    const processedMessages = this.groupMessages(data.entries);
    
    processedMessages.forEach((processedMessage, index) => {
      let roleIcon: string;
      let displayRole: string;
      let summary: string;
      let timestamp: string;
      
      if (processedMessage.type === 'processing_workflow') {
        roleIcon = '🤖';
        displayRole = 'ASSISTANT';
        
        // Extract summary from final response
        const finalResponseText = processedMessage.finalResponse
          .filter(content => content.type === 'text')
          .map(content => content.text || '')
          .join(' ');
        
        if (finalResponseText) {
          summary = this.extractMessageSummary({ 
            message: { role: 'assistant', content: [{ type: 'text', text: finalResponseText }] } 
          } as ConversationEntry);
        } else {
          summary = processedMessage.summary;
        }
        
        timestamp = processedMessage.timestamp ? 
          new Date(processedMessage.timestamp).toLocaleTimeString() : '';
      } else if (processedMessage.type === 'bash_workflow') {
        roleIcon = '💻';
        displayRole = 'BASH WORKFLOW';
        
        // Create summary from bash input
        if (processedMessage.bashInput.type === 'tool_use' && processedMessage.bashInput.input && typeof processedMessage.bashInput.input === 'object' && 'command' in processedMessage.bashInput.input) {
          const command = (processedMessage.bashInput.input as any).command || '';
          summary = `$ ${command.length > 60 ? command.substring(0, 60) + '...' : command}`;
        } else {
          summary = '$ bash command';
        }
        
        if (processedMessage.userComment) {
          const textContent = processedMessage.userComment.message.content
            .find(content => content.type === 'text');
          const userText = textContent && textContent.type === 'text' ? textContent.text || '' : '';
          if (userText) {
            summary += ` → ${userText.length > 40 ? userText.substring(0, 40) + '...' : userText}`;
          }
        }
        
        timestamp = processedMessage.timestamp ? 
          new Date(processedMessage.timestamp).toLocaleTimeString() : '';
      } else {
        const entry = processedMessage.entry;
        const role = entry.message.role;
        
        if (this.isToolResultMessage(entry)) {
          roleIcon = '⚙️';
          displayRole = 'TOOL RESULT';
        } else if (entry.isSidechain && role === 'user') {
          roleIcon = '🤖';
          displayRole = 'SUB-AGENT';
        } else if (role === 'user') {
          roleIcon = '👤';
          displayRole = 'USER';
        } else {
          roleIcon = '🤖';
          displayRole = 'ASSISTANT';
        }
        
        summary = this.extractMessageSummary(entry);
        timestamp = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : '';
      }
      
      tocItems.push(`
        <div class="toc-item">
          <a href="#message-${index}" class="toc-link">
            <span class="toc-role">${roleIcon} ${displayRole}</span>
            <span class="toc-summary">${this.escapeHtml(summary)}</span>
            <span class="toc-time">${timestamp}</span>
          </a>
        </div>
      `);
    });
    
    return `
      <div class="table-of-contents">
        <h2>📋 Table of Contents</h2>
        <div class="toc-items">
          ${tocItems.join('')}
        </div>
      </div>
    `;
  }

  static displayConversation(data: ConversationData): void {
    console.log('='.repeat(80));
    console.log(`📋 ${data.metadata?.title || 'Conversation'}`);
    console.log(`📅 ${data.metadata?.created_at || 'Unknown date'}`);
    console.log(`📊 ${data.entries.length} entries`);
    console.log('='.repeat(80));
    console.log();

    const processedMessages = this.groupMessages(data.entries);
    
    for (let i = 0; i < processedMessages.length; i++) {
      const processedMessage = processedMessages[i];
      this.displayProcessedMessage(processedMessage, i + 1);
    }
  }

  private static displayProcessedMessage(processedMessage: ProcessedMessage, index: number): void {
    if (processedMessage.type === 'bash_workflow') {
      // Display bash workflow as a single grouped item
      const timestamp = processedMessage.timestamp ? new Date(processedMessage.timestamp).toLocaleString() : '';
      
      console.log(`💻 BASH WORKFLOW ${timestamp ? `(${timestamp})` : ''}`);
      console.log('-'.repeat(40));
      
      // Show bash command
      if (processedMessage.bashInput.type === 'tool_use' && processedMessage.bashInput.input && 'command' in processedMessage.bashInput.input) {
        const command = (processedMessage.bashInput.input as any).command || '';
        console.log(`$ ${command}`);
      }
      
      // Show bash output (collapsed by default in console)
      const bashOutputContent = processedMessage.bashOutput.message.content
        .filter(content => content.type === 'tool_result')
        .map(content => JsonlParser.formatToolResult(content))
        .join('\n');
      console.log(`📤 Output: ${bashOutputContent.split('\n')[0]}...`);
      
      // Show user comment if exists
      if (processedMessage.userComment) {
        const textContent = processedMessage.userComment.message.content
          .find(content => content.type === 'text');
        const userText = textContent && textContent.type === 'text' ? textContent.text || '' : '';
        if (userText) {
          console.log(`👤 User: ${userText}`);
        }
      }
      
      console.log();
    } else if (processedMessage.type === 'processing_workflow') {
      // Display processing workflow
      const timestamp = processedMessage.timestamp ? new Date(processedMessage.timestamp).toLocaleString() : '';
      
      console.log(`🤖 ASSISTANT ${timestamp ? `(${timestamp})` : ''}`);
      console.log('-'.repeat(40));
      
      // Show workflow summary
      console.log(`📊 ${processedMessage.summary}`);
      
      // Show final response
      const finalResponseText = processedMessage.finalResponse
        .filter(content => content.type === 'text')
        .map(content => content.type === 'text' ? content.text || '' : '')
        .join('\n');
      
      if (finalResponseText) {
        console.log(finalResponseText);
      }
      
      const firstAssistantMessage = processedMessage.assistantMessages[0];
      if (firstAssistantMessage.usage) {
        console.log(`📊 Tokens: ${firstAssistantMessage.usage.input_tokens} in, ${firstAssistantMessage.usage.output_tokens} out`);
      }
      
      console.log();
    } else {
      // Regular message
      this.displayEntry(processedMessage.entry, index);
    }
  }

  private static displayEntry(entry: ConversationEntry, index: number): void {
    const role = entry.message.role;
    let roleIcon: string;
    let displayRole: string;
    
    if (this.isToolResultMessage(entry)) {
      roleIcon = '⚙️';
      displayRole = 'TOOL RESULT';
    } else if (entry.isSidechain && role === 'user') {
      roleIcon = '🤖';
      displayRole = 'SUB-AGENT';
    } else if (role === 'user') {
      roleIcon = '👤';
      displayRole = 'USER';
    } else {
      roleIcon = '🤖';
      displayRole = 'ASSISTANT';
    }
    
    const timestamp = entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '';
    
    console.log(`${roleIcon} ${displayRole} ${timestamp ? `(${timestamp})` : ''}`);
    console.log('-'.repeat(40));

    for (const content of entry.message.content) {
      this.displayContent(content);
    }

    if (entry.usage) {
      console.log(`📊 Tokens: ${entry.usage.input_tokens} in, ${entry.usage.output_tokens} out`);
    }

    console.log();
  }

  private static displayContent(content: MessageContent): void {
    switch (content.type) {
      case 'text':
        console.log(content.text);
        break;
      case 'thinking':
        console.log(`🤔 Thinking: ${content.thinking}`);
        break;
      case 'tool_use':
        console.log(`🔧 ${JsonlParser.formatToolUse(content)}`);
        break;
      case 'tool_result':
        console.log(`📥 ${JsonlParser.formatToolResult(content)}`);
        break;
      case 'image':
        console.log(`🖼️ Image (${content.source.media_type})`);
        break;
      default:
        console.log(`❓ Unknown content type: ${JSON.stringify(content)}`);
    }
  }

  // Helper function to check if content is long and needs collapsing
  private static isLongContent(content: string): boolean {
    const lines = content.split('\n').length;
    const chars = content.length;
    return lines > 10 || chars > 500;
  }

  // Generate collapsible content HTML
  private static generateCollapsibleContent(content: string, contentHtml: string): string {
    if (!this.isLongContent(content)) {
      return contentHtml;
    }
    
    const lines = content.split('\n');
    const preview = lines.slice(0, 3).join('\n');
    const previewHtml = this.escapeHtml(preview);
    
    return `
      <div class="collapsible-content">
        <div class="content-preview">
          ${previewHtml}
          ${lines.length > 3 ? '<span class="content-fade">...</span>' : ''}
        </div>
        <div class="content-full" style="display: none;">
          ${contentHtml}
        </div>
        <button class="toggle-content" onclick="toggleContent(this)">Show more</button>
      </div>
    `;
  }

  // Generate HTML for bash workflow group
  private static generateBashWorkflowHtml(group: BashWorkflowGroup, index: number): string {
    const timestamp = group.timestamp ? new Date(group.timestamp).toLocaleString() : '';
    
    // Format bash input command
    let command = '';
    if (group.bashInput.type === 'tool_use' && group.bashInput.input && typeof group.bashInput.input === 'object' && 'command' in group.bashInput.input) {
      command = (group.bashInput.input as any).command || '';
    }
    
    // Format bash output
    const bashOutputContent = group.bashOutput.message.content
      .filter(content => content.type === 'tool_result')
      .map(content => JsonlParser.formatToolResult(content))
      .join('\n');
    
    // Format user comment if exists
    const userCommentHtml = group.userComment ? 
      group.userComment.message.content
        .filter(content => content.type === 'text')
        .map(content => content.type === 'text' ? `<div class="text-content">${this.escapeHtml(content.text || '')}</div>` : '')
        .join('') : '';
    
    return `
      <div id="message-${index}" class="message bash-workflow-message">
        <div class="message-header">
          <span class="role">💻 BASH WORKFLOW</span>
          ${timestamp ? `<span class="timestamp">${timestamp}</span>` : ''}
        </div>
        
        <!-- Bash Command Section -->
        <div class="bash-command-section">
          <div class="bash-command">
            <span class="command-prompt">$</span>
            <span class="command-text">${this.escapeHtml(command)}</span>
          </div>
        </div>
        
        <!-- Bash Output Section (Collapsible) -->
        <div class="bash-output-section">
          <div class="bash-output-summary" onclick="toggleBashOutput(this)">
            <span class="output-summary-text">📤 Command Output</span>
            <span class="output-toggle">▼</span>
          </div>
          <div class="bash-output-details" style="display: none;">
            <div class="tool-result">${this.escapeHtml(bashOutputContent)}</div>
          </div>
        </div>
        
        <!-- User Comment Section -->
        ${group.userComment ? `
          <div class="user-comment-section">
            <div class="user-comment-header">
              <span class="role">👤 USER COMMENT</span>
            </div>
            <div class="user-comment-content">
              ${userCommentHtml}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  // Generate HTML for processing workflow group
  private static generateProcessingWorkflowHtml(group: ProcessingWorkflowGroup, index: number): string {
    const timestamp = group.timestamp ? new Date(group.timestamp).toLocaleString() : '';
    const firstAssistantMessage = group.assistantMessages[0];
    
    // Generate internal processing content HTML
    const internalProcessingHtml = group.internalProcessing.map(content => {
      switch (content.type) {
        case 'thinking':
          const thinkingContent = content.thinking || '';
          const thinkingHtml = `<div class="thinking-content">🤔 Thinking: ${this.escapeHtml(thinkingContent)}</div>`;
          return this.generateCollapsibleContent(thinkingContent, thinkingHtml);
        case 'tool_use':
          const toolUseFormatted = JsonlParser.formatToolUse(content);
          const toolUseHtml = `<div class="tool-use">🔧 ${this.escapeHtml(toolUseFormatted)}</div>`;
          return this.generateCollapsibleContent(toolUseFormatted, toolUseHtml);
        case 'text':
          const textContent = content.text || '';
          const textHtml = `<div class="intermediate-text">💭 Intermediate: ${this.escapeHtml(textContent)}</div>`;
          return this.generateCollapsibleContent(textContent, textHtml);
        default:
          return `<div class="unknown-content">❓ Unknown content type</div>`;
      }
    }).join('');

    // Generate tool results HTML
    const toolResultsHtml = group.toolResults.map(toolResultEntry => {
      return toolResultEntry.message.content.map(content => {
        if (content.type === 'tool_result') {
          const toolResultFormatted = JsonlParser.formatToolResult(content);
          const toolResultHtml = `<div class="tool-result">📥 ${this.escapeHtml(toolResultFormatted)}</div>`;
          return this.generateCollapsibleContent(toolResultFormatted, toolResultHtml);
        }
        return '';
      }).join('');
    }).join('');

    // Generate final response HTML (only the last text content)
    const finalResponseHtml = group.finalResponse.map(content => {
      switch (content.type) {
        case 'text':
          const textContent = content.text || '';
          const basicHtml = `<div class="text-content">${this.escapeHtml(textContent)}</div>`;
          return this.generateCollapsibleContent(textContent, basicHtml);
        case 'image':
          return `<div class="image-content">🖼️ Image (${content.source.media_type})</div>`;
        default:
          return `<div class="unknown-content">❓ Unknown content type</div>`;
      }
    }).join('');

    return `
      <div id="message-${index}" class="message assistant processing-workflow-message">
        <div class="message-header">
          <span class="role">🤖 ASSISTANT</span>
          ${timestamp ? `<span class="timestamp">${timestamp}</span>` : ''}
        </div>
        
        <!-- Processing Workflow Section (Collapsible) -->
        <div class="processing-workflow-section">
          <div class="processing-workflow-summary" onclick="toggleProcessingWorkflow(this)">
            <span class="workflow-summary-text">${this.escapeHtml(group.summary)}</span>
            <span class="workflow-toggle">▼</span>
          </div>
          <div class="processing-workflow-details" style="display: none;">
            ${internalProcessingHtml}
            ${toolResultsHtml}
          </div>
        </div>
        
        <!-- Final Response Section -->
        <div class="message-content final-response">
          ${finalResponseHtml}
        </div>
        
        ${firstAssistantMessage.usage ? `<div class="usage">📊 Tokens: ${firstAssistantMessage.usage.input_tokens} in, ${firstAssistantMessage.usage.output_tokens} out</div>` : ''}
      </div>
    `;
  }

  static generateHtml(data: ConversationData): string {
    const tableOfContents = this.generateTableOfContents(data);
    const processedMessages = this.groupMessages(data.entries);
    
    const entries = processedMessages.map((processedMessage, index) => {
      if (processedMessage.type === 'processing_workflow') {
        return this.generateProcessingWorkflowHtml(processedMessage, index);
      } else if (processedMessage.type === 'bash_workflow') {
        return this.generateBashWorkflowHtml(processedMessage, index);
      } else {
        const entry = processedMessage.entry;
        const role = entry.message.role;
        let roleClass: string;
        let roleIcon: string;
        let displayRole: string;
        
        if (this.isToolResultMessage(entry)) {
          roleClass = 'tool-result-message';
          roleIcon = '⚙️';
          displayRole = 'TOOL RESULT';
        } else if (entry.isSidechain && role === 'user') {
          roleClass = 'sub-agent';
          roleIcon = '🤖';
          displayRole = 'SUB-AGENT';
        } else if (role === 'user') {
          roleClass = 'user';
          roleIcon = '👤';
          displayRole = 'USER';
        } else {
          roleClass = 'assistant';
          roleIcon = '🤖';
          displayRole = 'ASSISTANT';
        }
        
        const timestamp = entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '';
        
        const contentHtml = entry.message.content.map(content => {
          switch (content.type) {
            case 'text':
              const textContent = content.text || '';
              const basicHtml = `<div class="text-content">${this.escapeHtml(textContent)}</div>`;
              return this.generateCollapsibleContent(textContent, basicHtml);
            case 'thinking':
              const thinkingContent = content.thinking || '';
              const thinkingHtml = `<div class="thinking-content">🤔 Thinking: ${this.escapeHtml(thinkingContent)}</div>`;
              return this.generateCollapsibleContent(thinkingContent, thinkingHtml);
            case 'tool_use':
              const toolUseFormatted = JsonlParser.formatToolUse(content);
              const toolUseHtml = `<div class="tool-use">🔧 ${this.escapeHtml(toolUseFormatted)}</div>`;
              return this.generateCollapsibleContent(toolUseFormatted, toolUseHtml);
            case 'tool_result':
              const toolResultFormatted = JsonlParser.formatToolResult(content);
              const toolResultHtml = `<div class="tool-result">📥 ${this.escapeHtml(toolResultFormatted)}</div>`;
              return this.generateCollapsibleContent(toolResultFormatted, toolResultHtml);
            case 'image':
              return `<div class="image-content">🖼️ Image (${content.source.media_type})</div>`;
            default:
              return `<div class="unknown-content">❓ Unknown content type</div>`;
          }
        }).join('');

        return `
          <div id="message-${index}" class="message ${roleClass}">
            <div class="message-header">
              <span class="role">${roleIcon} ${displayRole}</span>
              ${timestamp ? `<span class="timestamp">${timestamp}</span>` : ''}
            </div>
            <div class="message-content">
              ${contentHtml}
            </div>
            ${entry.usage ? `<div class="usage">📊 Tokens: ${entry.usage.input_tokens} in, ${entry.usage.output_tokens} out</div>` : ''}
          </div>
        `;
      }
    }).join('');

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${data.metadata?.title || 'Conversation'}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .header {
            background: white;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .message {
            background: white;
            margin-bottom: 25px;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .message.user {
            margin-left: 80px;
            margin-right: 20px;
            background-color: #e3f2fd;
        }
        .message.assistant {
            margin-left: 20px;
            margin-right: 80px;
            background-color: #f3e5f5;
        }
        .message.sub-agent {
            margin-left: 50px;
            margin-right: 50px;
            background-color: #fff3e0;
            border-left: 4px solid #ff9800;
        }
        .message.tool-result-message {
            margin-left: 10px;
            margin-right: 10px;
            background-color: #f5f5f5;
            border-left: 4px solid #9e9e9e;
            font-size: 14px;
        }
        .message-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
            font-weight: bold;
        }
        .role {
            font-size: 14px;
        }
        .timestamp {
            font-size: 12px;
            color: #666;
            font-weight: normal;
        }
        .text-content {
            white-space: pre-wrap;
            line-height: 1.4;
        }
        .thinking-content {
            background: #fff8e1;
            padding: 8px;
            border-radius: 4px;
            margin: 5px 0;
            font-style: italic;
            border-left: 3px solid #ffc107;
            font-size: 14px;
            color: #8a6914;
        }
        .tool-use, .tool-result {
            background: #f0f0f0;
            padding: 8px;
            border-radius: 4px;
            margin: 5px 0;
            font-family: monospace;
            font-size: 12px;
            white-space: pre-wrap;
            overflow-x: auto;
        }
        .tool-use {
            border-left: 3px solid #2196F3;
        }
        .tool-result {
            border-left: 3px solid #4CAF50;
        }
        .image-content {
            background: #fff3e0;
            padding: 8px;
            border-radius: 4px;
            margin: 5px 0;
            border-left: 3px solid #ff9800;
        }
        .usage {
            font-size: 12px;
            color: #666;
            margin-top: 10px;
            padding-top: 10px;
            border-top: 1px solid #eee;
        }
        .unknown-content {
            background: #ffebee;
            padding: 8px;
            border-radius: 4px;
            margin: 5px 0;
            border-left: 3px solid #f44336;
        }
        
        /* Table of Contents Styles */
        .table-of-contents {
            background: white;
            margin-bottom: 20px;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            max-height: 400px;
            overflow-y: auto;
        }
        
        .table-of-contents h2 {
            margin: 0 0 15px 0;
            color: #333;
            font-size: 18px;
        }
        
        .toc-items {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        
        .toc-item {
            border: 1px solid #e0e0e0;
            border-radius: 4px;
            overflow: hidden;
        }
        
        .toc-link {
            display: flex;
            align-items: center;
            padding: 8px 12px;
            text-decoration: none;
            color: #333;
            transition: background-color 0.2s;
        }
        
        .toc-link:hover {
            background-color: #f5f5f5;
        }
        
        .toc-role {
            font-weight: bold;
            font-size: 12px;
            min-width: 100px;
            color: #666;
        }
        
        .toc-summary {
            flex: 1;
            margin: 0 10px;
            font-size: 14px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        
        .toc-time {
            font-size: 11px;
            color: #999;
            min-width: 80px;
            text-align: right;
        }
        
        /* Collapsible Content Styles */
        .collapsible-content {
            position: relative;
        }
        
        .content-preview {
            position: relative;
        }
        
        .content-fade {
            color: #999;
            font-style: italic;
        }
        
        .toggle-content {
            background: #007bff;
            color: white;
            border: none;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            margin-top: 8px;
            transition: background-color 0.2s;
        }
        
        .toggle-content:hover {
            background: #0056b3;
        }
        
        /* Highlight animation for jumped-to messages */
        .message.highlight {
            background-color: #fff3cd !important;
            border-left: 4px solid #ffc107 !important;
            transition: all 0.3s ease;
        }
        
        /* Conversation content container */
        .conversation-content {
            margin-top: 20px;
        }
        
        /* Processing Workflow Styles */
        .processing-workflow-message {
            position: relative;
        }
        
        .processing-workflow-section {
            margin-bottom: 15px;
            border: 1px solid #e0e0e0;
            border-radius: 6px;
            overflow: hidden;
        }
        
        .processing-workflow-summary {
            background: #f8f9fa;
            padding: 12px 15px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 1px solid #e0e0e0;
            transition: background-color 0.2s;
        }
        
        .processing-workflow-summary:hover {
            background: #e9ecef;
        }
        
        .workflow-summary-text {
            flex: 1;
            font-size: 14px;
            color: #495057;
            font-weight: 500;
        }
        
        .workflow-toggle {
            font-size: 12px;
            color: #6c757d;
            transition: transform 0.2s;
            margin-left: 10px;
        }
        
        .workflow-toggle.expanded {
            transform: rotate(180deg);
        }
        
        .processing-workflow-details {
            background: #fdfdfd;
            padding: 15px;
            border-top: 1px solid #f0f0f0;
        }
        
        .processing-workflow-details .thinking-content,
        .processing-workflow-details .tool-use,
        .processing-workflow-details .tool-result,
        .processing-workflow-details .intermediate-text {
            margin-bottom: 10px;
            opacity: 0.9;
        }
        
        .intermediate-text {
            background: #fff8dc;
            padding: 8px;
            border-radius: 4px;
            margin: 5px 0;
            border-left: 3px solid #daa520;
            font-size: 14px;
            color: #8b7355;
        }
        
        .final-response {
            background: white;
            border-top: 2px solid #28a745;
            padding-top: 15px;
        }
        
        .final-response .text-content {
            font-weight: normal;
            line-height: 1.5;
        }
        
        /* Bash Workflow Styles */
        .bash-workflow-message {
            background-color: #f8f9fa;
            border-left: 4px solid #007bff;
        }
        
        .bash-command-section {
            background: #1e1e1e;
            color: #ffffff;
            padding: 12px 15px;
            border-radius: 6px;
            margin-bottom: 10px;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
        }
        
        .bash-command {
            display: flex;
            align-items: center;
        }
        
        .command-prompt {
            color: #00ff00;
            margin-right: 8px;
            font-weight: bold;
        }
        
        .command-text {
            color: #ffffff;
            word-break: break-all;
        }
        
        .bash-output-section {
            margin-bottom: 15px;
            border: 1px solid #e0e0e0;
            border-radius: 6px;
            overflow: hidden;
        }
        
        .bash-output-summary {
            background: #f8f9fa;
            padding: 12px 15px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 1px solid #e0e0e0;
            transition: background-color 0.2s;
        }
        
        .bash-output-summary:hover {
            background: #e9ecef;
        }
        
        .output-summary-text {
            flex: 1;
            font-size: 14px;
            color: #495057;
            font-weight: 500;
        }
        
        .output-toggle {
            font-size: 12px;
            color: #6c757d;
            transition: transform 0.2s;
            margin-left: 10px;
        }
        
        .output-toggle.expanded {
            transform: rotate(180deg);
        }
        
        .bash-output-details {
            background: #fdfdfd;
            padding: 15px;
            border-top: 1px solid #f0f0f0;
        }
        
        .bash-output-details .tool-result {
            margin: 0;
            background: #1e1e1e;
            color: #ffffff;
            border-left: 3px solid #007bff;
        }
        
        .user-comment-section {
            background: #e3f2fd;
            border-radius: 6px;
            padding: 15px;
            margin-top: 10px;
        }
        
        .user-comment-header {
            margin-bottom: 10px;
            font-weight: bold;
            font-size: 14px;
            color: #1976d2;
        }
        
        .user-comment-content {
            line-height: 1.4;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>📋 ${data.metadata?.title || 'Conversation'}</h1>
        <p>📅 ${data.metadata?.created_at || 'Unknown date'}</p>
        <p>📊 ${data.entries.length} entries</p>
    </div>
    
    ${tableOfContents}
    
    <div class="conversation-content">
        ${entries}
    </div>
    
    <script>
        function toggleContent(button) {
            const collapsibleContent = button.parentElement;
            const preview = collapsibleContent.querySelector('.content-preview');
            const full = collapsibleContent.querySelector('.content-full');
            
            if (full.style.display === 'none') {
                preview.style.display = 'none';
                full.style.display = 'block';
                button.textContent = 'Show less';
            } else {
                preview.style.display = 'block';
                full.style.display = 'none';
                button.textContent = 'Show more';
            }
        }
        
        function toggleProcessingWorkflow(summaryElement) {
            const workflowSection = summaryElement.parentElement;
            const details = workflowSection.querySelector('.processing-workflow-details');
            const toggle = summaryElement.querySelector('.workflow-toggle');
            
            if (details.style.display === 'none') {
                details.style.display = 'block';
                toggle.classList.add('expanded');
            } else {
                details.style.display = 'none';
                toggle.classList.remove('expanded');
            }
        }
        
        function toggleBashOutput(summaryElement) {
            const outputSection = summaryElement.parentElement;
            const details = outputSection.querySelector('.bash-output-details');
            const toggle = summaryElement.querySelector('.output-toggle');
            
            if (details.style.display === 'none') {
                details.style.display = 'block';
                toggle.classList.add('expanded');
            } else {
                details.style.display = 'none';
                toggle.classList.remove('expanded');
            }
        }
        
        // Smooth scrolling for table of contents links
        document.addEventListener('DOMContentLoaded', function() {
            const tocLinks = document.querySelectorAll('.toc-link');
            tocLinks.forEach(link => {
                link.addEventListener('click', function(e) {
                    e.preventDefault();
                    const targetId = this.getAttribute('href').substring(1);
                    const targetElement = document.getElementById(targetId);
                    if (targetElement) {
                        targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        // Add highlight effect
                        targetElement.classList.add('highlight');
                        setTimeout(() => {
                            targetElement.classList.remove('highlight');
                        }, 2000);
                    }
                });
            });
        });
    </script>
</body>
</html>
    `;
  }

  private static escapeHtml(text: string | undefined): string {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}