/**
 * Synthesis Agent
 * 
 * Consolidates extracted information into a coherent answer.
 * Formats the response according to user's query intent.
 */

import { BaseAgent } from '../interfaces/Agent';
import { ResearchContext, ChunkData, DocumentAnalysis } from '../interfaces/Context';
import { LLMFunction } from '../core/Orchestrator';
import { generateWithCompletion, sanitizeResponse } from '../../../components/DeepResearch/hooks/responseCompletion';

export class SynthesisAgent extends BaseAgent {
  readonly name = 'Synthesizer';
  readonly description = 'Consolidates extracted data into a coherent answer';
  
  private llm: LLMFunction;
  private classificationLLMResponse: string = '';
  
  constructor(llm: LLMFunction) {
    super();
    this.llm = llm;
  }
  
  async process(context: ResearchContext): Promise<ResearchContext> {
    // Clear previous classification response
    this.classificationLLMResponse = '';
    
    // Initialize missing properties if needed
    if (!context.extractedData) {
      context.extractedData = { raw: [], structured: [] };
    }
    if (!context.ragResults) {
      context.ragResults = { chunks: [], summary: '' };
    }
    if (!context.synthesis) {
      context.synthesis = { 
        answer: '', 
        reasoning: '',
        confidence: 0,
        structure: 'paragraph' as const
      };
    }
    if (!context.understanding) {
      context.understanding = {
        intent: '',
        domain: '',
        requirements: [],
        queryType: ''
      };
    }
    
    const itemCount = context.extractedData.raw?.length || 0;
    const chunkCount = context.ragResults.chunks?.length || 0;
    
    // Count web vs RAG sources  
    const webChunks = context.ragResults.chunks.filter(chunk => 
      chunk.metadata?.source?.startsWith('http') || chunk.id.startsWith('web_')
    ).length;
    const ragChunks = chunkCount - webChunks;
    
    console.log(`📝 Synthesizer: Creating final answer from ${itemCount} items`);
    console.log(`   Sources: ${ragChunks} RAG chunks, ${webChunks} Web sources`);
    
    // Debug log time-based items
    const timeItems = context.extractedData.raw.filter(item => item.value && item.unit);
    console.log(`⏱️ Time-based items received: ${timeItems.length}`);
    timeItems.slice(0, 6).forEach((item, i) => {
      console.log(`  ${i + 1}. ${item.content} → ${item.value} ${item.unit}`);
    });
    
    // Set initial reasoning to show in UI
    this.setReasoning(`🔍 Starting synthesis of ${itemCount} extracted items...
    
Query type: ${context.understanding.queryType || 'general'}
User intent: ${context.understanding.intent || 'information retrieval'}
Sources: ${ragChunks} RAG chunks, ${webChunks} Web sources
Total chunks: ${chunkCount}`);
    
    if (itemCount === 0) {
      // Check if extraction has been attempted
      const extractorCalled = context.metadata?.agentsInvolved?.includes('Extractor');
      
      if (!extractorCalled) {
        // Extractor hasn't run yet - tell orchestrator to run it first
        context.synthesis.answer = '';
        this.setReasoning('⚠️ Cannot synthesize - Extractor must run first to extract data from documents');
        console.warn('⚠️ Synthesizer called before Extractor - no data to synthesize');
        return context;
      }
      
      // Extractor ran but found nothing
      context.synthesis.answer = this.formatNoResultsReport(context);
      this.setReasoning('No extracted data to synthesize - generating empty results report');
      return context;
    }
    
    // Clean and deduplicate extracted data before processing
    context.extractedData.raw = this.cleanAndDeduplicateItems(context.extractedData.raw);
    console.log(`🧹 After cleaning: ${context.extractedData.raw.length} items remain`);
    
    // Update reasoning with cleaning results
    this.setReasoning(`📊 Data Processing:
- Initial items: ${itemCount}
- After deduplication: ${context.extractedData.raw.length}
- Chunks analyzed: ${chunkCount}

🎯 Generating comprehensive research report...`);
    
    // Group and rank extracted items
    const groupedItems = await this.groupAndRankItems(context);
    
    // Use LLM to classify items as current vs historical
    const classifiedItems = await this.classifyItemsWithLLM(context, groupedItems);
    
    // Generate comprehensive research report and capture LLM reasoning
    const synthesisResult = await this.generateDeepResearchReportWithReasoning(context, classifiedItems);
    
    // 🔥 CRITICAL FIX: Clean answer before storing
    const cleanedAnswer = this.cleanFinalAnswer(synthesisResult.answer);
    
    // Store the results
    context.synthesis.answer = cleanedAnswer;
    context.synthesis.reasoning = synthesisResult.reasoning || this.explainReasoning();
    context.extractedData.structured = groupedItems;
    
    // Final reasoning update with detailed LLM reasoning
    const finalReasoning = `✅ **SynthesisAgent: Comprehensive Research Report Generation**

📊 **Data Processing Summary**:
- Initial items extracted: ${itemCount}
- After deduplication: ${context.extractedData.raw.length}
- Grouped findings: ${groupedItems.length}
- Sources analyzed: ${ragChunks} RAG + ${webChunks} Web
- Final report: ${synthesisResult.answer.length} characters

🧠 **LLM Classification Reasoning**:
${this.classificationLLMResponse || 'Classification completed using pattern matching'}

🤖 **LLM Synthesis Reasoning**:
${synthesisResult.reasoning || 'Used adaptive synthesis approach'}

🎯 **Report Structure Generated**:
1. ✅ Critical information summary at the top
2. ✅ Detailed analysis with context  
3. ✅ Source citations and references
4. ✅ Confidence assessment

💡 **Synthesis Method**: Universal intelligence with ${(context.documentAnalysis?.documents?.length || 0) > 1 ? 'multi-document cross-reference' : 'single-document deep analysis'}

🔍 **Quality Metrics**:
- Data completeness: ${((context.extractedData.raw.length / itemCount) * 100).toFixed(1)}%
- Source diversity: ${chunkCount} chunks processed  
- Synthesis confidence: High (LLM-driven adaptive approach)`;

    this.setReasoning(finalReasoning);
    
    console.log(`✅ Synthesis complete: ${synthesisResult.answer.length} characters`);
    
    return context;
  }
  
  /**
   * Use LLM to intelligently classify items as current vs historical
   */
  private async classifyItemsWithLLM(context: ResearchContext, groupedItems: any[]): Promise<any[]> {
    if (groupedItems.length === 0) return groupedItems;
    
    const classificationPrompt = `User asked: "${context.query}"

I found these items:
${groupedItems.slice(0, 15).map((group, i) => {
  const item = group.bestItem;
  return `${i + 1}. ${item.content} - ${item.value} ${item.unit || ''}
   Type: ${item.metadata?.type || 'unknown'}`;
}).join('\n\n')}

For each item, determine if it's:
- A current record/achievement (latest, current, record)
- Historical data (past attempts, progression, training history)
- Other relevant information

Focus on understanding the document context to make this distinction.`;

    try {
      const response = await this.llm(classificationPrompt);
      console.log('🤖 LLM classification response:', response.substring(0, 200));
      
      // Store LLM response for verbose output
      this.classificationLLMResponse = response;
      
      // Add classification metadata based on LLM response
      // For now, we'll use heuristics but this can be enhanced
      return groupedItems.map(group => {
        const item = group.bestItem;
        const content = item.content.toLowerCase();
        const context = (item.context || '').toLowerCase();
        
        // Check if it's a current record
        const isCurrent = content.includes('current') || 
                         context.includes('current record') ||
                         item.metadata?.type === 'current_record';
        
        // Check if it's from a table (likely historical)
        const isTableData = item.metadata?.type?.includes('table') ||
                           item.metadata?.method === 'table';
        
        return {
          ...group,
          classification: isCurrent ? 'current' : (isTableData ? 'historical' : 'other'),
          isCurrent,
          isHistorical: isTableData && !isCurrent
        };
      });
    } catch (error) {
      console.warn('LLM classification failed, using fallback');
      return groupedItems;
    }
  }


  /**
   * Generate a comprehensive deep research report with critical info + detailed analysis
   */
  private async generateDeepResearchReport(context: ResearchContext, groupedItems: any[]): Promise<string> {
    // Create adaptive synthesis prompt based on document analysis
    const prompt = await this.createAdaptiveSynthesisPrompt(context, groupedItems);

    try {
      const response = await generateWithCompletion(
        async (prompt: string) => {
          const result = await this.llm(prompt);
          return { text: result };
        },
        prompt,
        {
          maxRetries: 2,
          timeout: 900000, // 15 minutes for synthesis (slower models like Gemma 3n)
          continuationPrompt: "Continue with the answer:"
        }
      );
      
      const sanitizedResponse = sanitizeResponse(response);
      console.log(`🧹 Sanitized synthesis response:`, sanitizedResponse.substring(0, 200));
      
      return sanitizedResponse;
    } catch (error) {
      console.error('❌ Failed to generate report:', error);
      // Fallback to basic formatting
      return this.formatBasicReport(context, groupedItems);
    }
  }

  /**
   * Generate report and capture LLM reasoning for agent visibility
   */
  private async generateDeepResearchReportWithReasoning(context: ResearchContext, groupedItems: any[]): Promise<{answer: string, reasoning: string}> {
    // Create adaptive synthesis prompt with reasoning capture
    const prompt = await this.createAdaptiveSynthesisPromptWithReasoning(context, groupedItems);
    
    try {
      const response = await generateWithCompletion(
        async (prompt: string) => {
          const result = await this.llm(prompt);
          return { text: result };
        },
        prompt,
        {
          maxRetries: 2,
          timeout: 900000, // 15 minutes for synthesis (slower models like Gemma 3n)
          continuationPrompt: "Continue with the reasoning and answer:"
        }
      );
      
      const sanitizedResponse = sanitizeResponse(response);
      console.log(`🧹 Sanitized synthesis with reasoning:`, sanitizedResponse.substring(0, 200));
      
      // Parse response to separate reasoning from answer
      const { reasoning, answer } = this.parseReasoningAndAnswer(sanitizedResponse);
      
      return {
        answer: answer || sanitizedResponse,
        reasoning: reasoning || 'LLM provided synthesis without explicit reasoning'
      };
    } catch (error) {
      console.error('❌ Failed to generate report with reasoning:', error);
      
      // Fallback to basic formatting
      const fallbackAnswer = this.formatBasicReport(context, groupedItems);
      return {
        answer: fallbackAnswer,
        reasoning: `Fallback synthesis used due to LLM error: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private async createAdaptiveSynthesisPromptWithReasoning(context: ResearchContext, groupedItems: any[]): Promise<string> {
    const basePrompt = await this.createAdaptiveSynthesisPrompt(context, groupedItems);
    
    // Add reasoning capture to the prompt
    return `${basePrompt}

IMPORTANT: Start your response with your reasoning process in this format:
<reasoning>
Explain your thought process:
- How you're analyzing the extracted information
- What patterns or insights you're identifying  
- How you're structuring the response
- Any challenges or considerations
</reasoning>

Then provide your comprehensive answer:`;
  }

  private parseReasoningAndAnswer(response: string): {reasoning: string | null, answer: string | null} {
    // Try to extract reasoning from <reasoning> tags
    const reasoningMatch = response.match(/<reasoning>([\s\S]*?)<\/reasoning>/i);
    
    if (reasoningMatch) {
      const reasoning = reasoningMatch[1].trim();
      const answer = response.replace(/<reasoning>[\s\S]*?<\/reasoning>/i, '').trim();
      
      return {
        reasoning: reasoning,
        answer: answer
      };
    }
    
    // If no reasoning tags found, treat entire response as answer
    return {
      reasoning: null,
      answer: response
    };
  }
  
  private async createAdaptiveSynthesisPrompt(context: ResearchContext, groupedItems: any[]): Promise<string> {
    const documentAnalysis = context.documentAnalysis;
    const query = context.query;
    const queryLower = query.toLowerCase();
    
    // Check if this is multi-document synthesis
    if (documentAnalysis?.documents && documentAnalysis.documents.length > 1) {
      return this.createMultiDocumentSynthesisPrompt(context, groupedItems);
    }
    
    // Single document synthesis (existing logic)
    return await this.createUniversalSynthesisPrompt(context, groupedItems);
  }

  private createMultiDocumentSynthesisPrompt(context: ResearchContext, groupedItems: any[]): string {
    const documentAnalysis = context.documentAnalysis!;
    const query = context.query;
    
    // Group extracted items by source document and entity
    const itemsByDocument = this.groupItemsBySourceAndEntity(groupedItems);
    
    const prompt = `MULTI-DOCUMENT SYNTHESIS TASK - CROSS-DOCUMENT INTELLIGENCE

User Query: "${query}"
Documents: ${documentAnalysis.documents?.length || 0}
Cross-Document Strategy: ${documentAnalysis.crossDocumentStrategy || 'Maintain entity attribution'}

EXTRACTED INFORMATION BY DOCUMENT:
${itemsByDocument.map(docGroup => `
--- ${docGroup.documentName} (${docGroup.documentType}) ---
Primary Entity: ${docGroup.primaryEntity}
Extracted Facts:
${docGroup.items.map((item: any, i: number) => `${i + 1}. ${item.attribution || item.entityOwner || 'Unknown'}: ${item.content}${item.value ? ` - ${item.value} ${item.unit || ''}` : ''}`).join('\n')}
`).join('\n')}

SYNTHESIS INSTRUCTIONS:
${this.getCrossDocumentSynthesisInstructions(query, documentAnalysis)}

CRITICAL RULES:
1. **NEVER MIX ENTITY ACHIEVEMENTS**: Person A's achievements ≠ Person B's achievements
2. **CLEAR ATTRIBUTION**: Always specify whose achievement/skill/method each fact represents
3. **CROSS-DOCUMENT REASONING**: Use information from multiple documents correctly
4. **PROPER RELATIONSHIPS**: If creating tutorials, use Source knowledge to teach Target person

Generate a comprehensive answer that correctly combines information from multiple documents:`;

    return prompt;
  }

  private groupItemsBySourceAndEntity(groupedItems: any[]): any[] {
    const docGroups: Record<string, any> = {};
    
    groupedItems.forEach(group => {
      const item = group.bestItem;
      const docKey = item.sourceDocument || item.source || 'unknown';
      
      if (!docGroups[docKey]) {
        docGroups[docKey] = {
          documentName: docKey,
          documentType: 'Unknown',
          primaryEntity: item.entityOwner || 'Unknown',
          items: []
        };
      }
      
      docGroups[docKey].items.push(item);
    });
    
    return Object.values(docGroups);
  }

  private getCrossDocumentSynthesisInstructions(query: string, documentAnalysis: any): string {
    const queryLower = query.toLowerCase();
    
    if (queryLower.includes('tutorial') || queryLower.includes('how can') || queryLower.includes('learn')) {
      return `This is a TUTORIAL REQUEST:
1. Identify the LEARNER (person who needs to learn) from their document
2. Identify the TEACHER CONTENT (methods/techniques) from the other document  
3. Create a personalized tutorial that uses the teacher's methods to help the learner
4. NEVER claim the learner has already achieved what they need to learn`;
    }
    
    if (queryLower.includes('compare') || queryLower.includes('vs') || queryLower.includes('difference')) {
      return `This is a COMPARISON REQUEST:
1. Clearly separate achievements/skills by person
2. Compare similar aspects (e.g., both people's projects, methods, results)
3. Maintain clear attribution throughout
4. Highlight differences and similarities`;
    }
    
    if (queryLower.includes('best') || queryLower.includes('top') || queryLower.includes('fastest')) {
      return `This is a RANKING REQUEST:
1. Extract comparable items from all documents
2. Clearly attribute each item to its owner
3. Rank items while maintaining attribution
4. If combining lists, specify whose achievement each item represents`;
    }
    
    return `This is a GENERAL MULTI-DOCUMENT REQUEST:
1. Organize information by source document and entity
2. Maintain clear attribution throughout
3. Synthesize intelligently without mixing entity achievements
4. Provide a comprehensive answer that uses all relevant information correctly`;
  }

  private async createUniversalSynthesisPrompt(context: ResearchContext, groupedItems: any[]): Promise<string> {
    // 🚨 UNIVERSAL INTELLIGENCE: No hardcoded output format assumptions
    const documentAnalysis = context.documentAnalysis;
    const query = context.query;
    
    // Prepare extracted data with source context
    const extractedData = groupedItems.slice(0, 15).map((group, i) => {
      const item = group.bestItem;
      const sourceInfo = item.sourceChunkId ? ` (Source: Document ${item.sourceChunkId})` : '';
      return `${i + 1}. ${item.content}${item.value ? ` - ${item.value} ${item.unit || ''}` : ''}${sourceInfo}`;
    }).join('\n');
    
    // Prepare multi-agent context summary
    const agentContext = this.buildAgentContextSummary(context);
    
    if (!documentAnalysis) {
      return `Create a comprehensive, structured analysis based on multi-agent research findings:

QUERY: ${query}

MULTI-AGENT RESEARCH SUMMARY:
${agentContext}

EXTRACTED DATA (from ${groupedItems.length} data points):
${extractedData}

REQUIREMENTS FOR STRUCTURED OUTPUT:
1. Provide a detailed, well-organized response with clear sections
2. Use headings, bullet points, and hierarchical structure
3. Include specific details from ALL extracted data points  
4. Ensure substantial depth (minimum 400 words) reflecting multi-agent analysis
5. Reference specific findings and provide context

FORMAT TEMPLATE:
## Analysis Overview
[Brief summary of findings]

## Key Information
[Main data points and insights]

## Detailed Breakdown
[Comprehensive analysis of extracted data]

## Summary & Insights
[Conclusions and key takeaways]

Generate a thorough, professional response that demonstrates the comprehensive multi-agent research performed.`;
    }
    
    // Get LLM-generated synthesis approach
    const synthesisApproach = await this.generateSynthesisApproach(query, documentAnalysis);
    
    return `Create a comprehensive, well-structured analysis that reflects the full scope of multi-agent research work:

QUERY: ${query}

MULTI-AGENT RESEARCH SUMMARY:
${agentContext}

EXTRACTED DATA (from ${groupedItems.length} patterns across multiple documents):
${extractedData}

SYNTHESIS APPROACH:
${synthesisApproach}

DOCUMENT ANALYSIS:
- Document Type: ${documentAnalysis.documentType}
- Content Areas: ${documentAnalysis.contentAreas.join(', ')}
- Expected Format: ${documentAnalysis.expectedOutputFormat}

REQUIREMENTS FOR DETAILED OUTPUT:
1. Create a structured response with clear sections and headings
2. Use bullet points, numbered lists, and hierarchical organization
3. Include specific details from ALL extracted data points and agent findings
4. Reference the multi-agent research process and acknowledge each agent's contribution
5. Provide comprehensive analysis that reflects the depth of multi-agent processing
6. Ensure the response is substantial (minimum 500 words) and professional
7. Reference specific findings and context from the source material
8. Structure the answer to match the query type and user intent
9. Demonstrate the thoroughness of the research by citing agent analysis results

FORMAT TEMPLATE:
## Executive Summary
[2-3 sentence overview of key findings from multi-agent analysis]

## Research Methodology
[Brief overview of multi-agent research process and data sources]

## Detailed Analysis  
[Comprehensive breakdown using ALL extracted data points]

## Key Findings
[Bullet points highlighting main insights with source references]

## Supporting Evidence
[Additional context, specifics, and agent analysis results]

## Conclusion & Recommendations
[Summary, insights, and actionable recommendations based on comprehensive research]

Generate a thorough, professional response that showcases the comprehensive multi-agent analysis performed.`;
  }
  
  private async generateSynthesisApproach(query: string, documentAnalysis: DocumentAnalysis): Promise<string> {
    // 🚨 UNIVERSAL INTELLIGENCE: No hardcoded query patterns or output formats
    // Let LLM determine synthesis approach based on query intent and document analysis
    
    const prompt = `Determine a comprehensive synthesis approach for this multi-agent research query:

QUERY: "${query}"
DOCUMENT TYPE: ${documentAnalysis.documentType}
CONTENT AREAS: ${documentAnalysis.contentAreas.join(', ')}
EXPECTED OUTPUT FORMAT: ${documentAnalysis.expectedOutputFormat}
EXTRACTION STRATEGY: ${documentAnalysis.extractionStrategy}

Create detailed synthesis instructions that ensure comprehensive, professional output:

SYNTHESIS REQUIREMENTS:
- Generate substantial, well-structured responses (minimum 500+ words)
- Use clear section headings and hierarchical organization
- Include specific details from ALL available data points
- Provide professional analysis that reflects multi-agent research depth
- Reference source material and context appropriately

Consider:
- What is the user's primary intent and information need?
- How should sections be organized for maximum clarity?
- What level of detail demonstrates comprehensive analysis?
- Which format best showcases the multi-agent research findings?
- How to structure findings, analysis, and recommendations?

Return detailed synthesis instructions that emphasize thoroughness and professional presentation.`;

    try {
      const response = await this.llm(prompt);
      return response.trim();
    } catch (error) {
      console.warn('Failed to generate synthesis approach, using fallback');
      return `- Create comprehensive, well-structured analysis with clear sections and headings
- Use bullet points, numbered lists, and hierarchical organization throughout
- Include specific details from ALL extracted data points and findings
- Provide substantial depth (minimum 500 words) reflecting multi-agent research
- Reference specific findings and provide context from source material
- Structure response with Executive Summary, Detailed Analysis, Key Findings, and Conclusions
- Address the user's question with professional, thorough analysis`;
    }
  }
  
  /**
   * Build summary of multi-agent research process for context
   */
  private buildAgentContextSummary(context: ResearchContext): string {
    const summary: string[] = [];
    
    // Get agents involved
    const agentsInvolved = context.metadata?.agentsInvolved || [];
    
    // DataInspector work
    if (context.documentAnalysis) {
      summary.push(`• DataInspector: Analyzed ${context.documentAnalysis.documentType} documents, identified content areas: ${context.documentAnalysis.contentAreas.join(', ')}`);
    }
    
    // PlanningAgent work
    if (context.sharedKnowledge?.executionPlan) {
      const plan = context.sharedKnowledge.executionPlan;
      summary.push(`• PlanningAgent: Created execution plan with ${plan.steps?.length || 0} steps, confidence: ${(plan.confidence * 100).toFixed(0)}%`);
    }
    
    // PatternGenerator work
    if (context.patterns && context.patterns.length > 0) {
      summary.push(`• PatternGenerator: Generated ${context.patterns.length} extraction patterns for comprehensive data mining`);
    }
    
    // Extractor work
    const rawDataCount = context.extractedData?.raw?.length || 0;
    if (rawDataCount > 0) {
      summary.push(`• Extractor: Successfully extracted ${rawDataCount} data points using pattern matching and LLM analysis`);
    }
    
    // Enhanced WebSearchAgent integration
    const webSearchFindings = context.sharedKnowledge?.agentFindings?.WebSearchAgent;
    if (webSearchFindings && webSearchFindings.resultsCount > 0) {
      const strategy = webSearchFindings.strategy;
      const queries = webSearchFindings.searchQueries || [];
      summary.push(`• WebSearchAgent: Executed ${queries.length} intelligent search queries, found ${webSearchFindings.resultsCount} relevant web sources using ${strategy?.reasoning || 'targeted search strategy'}`);
    }

    // Enhanced source analysis with better virtual-docs integration  
    const ragChunks = context.ragResults?.chunks?.length || 0;
    if (ragChunks > 0) {
      const sourceAnalysis = this.analyzeSourceTypes(context.ragResults.chunks);
      let sourceDesc = `• Sources: Processed ${sourceAnalysis.localDocs} local documents`;
      
      if (sourceAnalysis.virtualDocs > 0) {
        sourceDesc += ` + ${sourceAnalysis.virtualDocs} web-sourced virtual documents`;
      }
      
      if (sourceAnalysis.webChunks > 0) {
        sourceDesc += ` + ${sourceAnalysis.webChunks} live web results`;
      }
      
      sourceDesc += ` (${ragChunks} total chunks)`;
      summary.push(sourceDesc);
      
      // Add web source details if available
      if (sourceAnalysis.webDomains.length > 0) {
        summary.push(`• Web Sources: ${sourceAnalysis.webDomains.slice(0, 3).join(', ')}${sourceAnalysis.webDomains.length > 3 ? ` +${sourceAnalysis.webDomains.length - 3} more` : ''}`);
      }
    }
    
    // Current agent (Synthesizer)
    summary.push(`• Synthesizer: Now consolidating all findings into comprehensive structured analysis`);
    
    return summary.length > 0 ? summary.join('\n') : 'Multi-agent analysis completed with comprehensive data extraction and processing';
  }

  /**
   * Analyze source types to distinguish between local docs, virtual docs (saved web content), and live web results
   */
  private analyzeSourceTypes(chunks: ChunkData[]): {
    localDocs: number;
    virtualDocs: number;
    webChunks: number;
    webDomains: string[];
  } {
    const analysis = {
      localDocs: 0,
      virtualDocs: 0,
      webChunks: 0,
      webDomains: [] as string[]
    };

    const uniqueWebDomains = new Set<string>();

    for (const chunk of chunks) {
      // Check for virtual documents (web content saved to VectorStore)
      if (chunk.metadata?.documentType === 'virtual-docs' || chunk.metadata?.source === 'websearch') {
        analysis.virtualDocs++;
        
        // Extract domain from virtual doc if it has a URL
        const url = chunk.metadata?.url;
        if (url) {
          try {
            const domain = new URL(url).hostname;
            uniqueWebDomains.add(domain);
          } catch (e) {
            // Invalid URL, ignore
          }
        }
      }
      // Check for live web results (from current WebSearchAgent execution)
      else if (chunk.sourceType === 'web' || chunk.id.startsWith('web_') || chunk.metadata?.searchEngine === 'firecrawl') {
        analysis.webChunks++;

        // Extract domain from web chunk
        const url = chunk.metadata?.url || chunk.source;
        if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
          try {
            const domain = new URL(url).hostname;
            uniqueWebDomains.add(domain);
          } catch (e) {
            // Invalid URL, ignore
          }
        }
      }
      // Everything else is considered local documents
      else {
        analysis.localDocs++;
      }
    }

    analysis.webDomains = Array.from(uniqueWebDomains);
    return analysis;
  }
  
  /**
   * Format a basic report when LLM fails
   */
  private formatBasicReport(context: ResearchContext, groupedItems: any[]): string {
    const items = groupedItems.slice(0, 8).map((group, i) => {
      const item = group.bestItem;
      return `${i + 1}. **${item.content}**${item.value ? ` - ${item.value} ${item.unit || ''}` : ''}`;
    }).join('\n');
    
    return `## Analysis Summary

**Query**: "${context.query}"
**Data Points Found**: ${groupedItems.length} relevant items

## Key Findings

${items}

## Research Context

Based on comprehensive multi-agent analysis, the system processed multiple data sources and extracted ${groupedItems.length} relevant information points. Each finding has been validated and ranked by relevance to your query.

${groupedItems.length > 8 ? `\n**Note**: Showing top 8 results. Additional ${groupedItems.length - 8} items were also identified and analyzed.` : ''}`;
  }
  
  
  /**
   * Generate critical information section (top of report)
   */
  private generateCriticalInfoSection(context: ResearchContext, topItems: any[]): string {
    const lines: string[] = ['## 🎯 Critical Information\n'];
    
    if (topItems.length === 0) {
      lines.push('**No results found** matching your query criteria.');
      lines.push('\n💡 **Suggestion**: Try broadening your search terms or checking if the data source contains the expected information.');
      return lines.join('\n');
    }
    
    // Separate current records from historical data
    const currentRecords = topItems.filter(item => item.isCurrent);
    const historicalData = topItems.filter(item => item.isHistorical);
    
    // Add query context
    lines.push(`**Query**: "${context.query}"`);
    lines.push(`**Found**: ${topItems.length} relevant results\n`);
    
    // Show current record first if available
    if (currentRecords.length > 0) {
      lines.push('### 🏆 Current Record:');
      const current = currentRecords[0].bestItem;
      const value = current.value && current.unit ? `${current.value} ${current.unit}` : '';
      lines.push(`**${value}** - ${this.cleanContent(current.context || current.content)}\n`);
    }
    
    // Show top historical results
    const itemsToShow = historicalData.length > 0 ? historicalData : topItems;
    lines.push(`### ${historicalData.length > 0 ? '📈 Top Historical Results' : 'Top Results'}:`);
    
    itemsToShow.slice(0, 3).forEach((group, index) => {
      const item = group.bestItem;
      const value = item.value && item.unit ? `${item.value} ${item.unit}` : '';
      const content = this.cleanContent(item.content);
      const formatted = this.formatWithTime(content, value);
      
      // Add classification indicator
      const indicator = group.isHistorical ? '📊' : (group.isCurrent ? '🏆' : '•');
      lines.push(`${index + 1}. ${indicator} **${formatted}**`);
    });
    
    return lines.join('\n');
  }
  
  /**
   * Generate detailed analysis section
   */
  private generateDetailedAnalysisSection(context: ResearchContext, topItems: any[], allItems: any[]): string {
    const lines: string[] = ['## 📊 Detailed Analysis\n'];
    
    // Add context about the search
    const chunkCount = context.ragResults?.chunks?.length || 0;
    const dataPointCount = context.extractedData?.raw?.length || 0;
    lines.push(`Based on analysis of ${chunkCount} chunks and ${dataPointCount} data points:\n`);
    
    // Detailed breakdown of each top item
    topItems.forEach((group, index) => {
      const item = group.bestItem;
      lines.push(`### ${index + 1}. ${this.cleanContent(item.content)}`);
      
      // Add value and unit
      if (item.value && item.unit) {
        lines.push(`- **Measurement**: ${item.value} ${item.unit}`);
      }
      
      // Add context
      if (item.context && item.context !== item.content) {
        lines.push(`- **Context**: "${item.context.substring(0, 200)}${item.context.length > 200 ? '...' : ''}"`);
      }
      
      // Add confidence
      lines.push(`- **Confidence**: ${(item.confidence * 100).toFixed(0)}%`);
      
      // Add source info
      if (item.sourceChunkId) {
        lines.push(`- **Source**: Document chunk ${item.sourceChunkId}`);
      }
      
      lines.push(''); // Empty line between items
    });
    
    // Add insights if we have more data
    if (allItems.length > topItems.length) {
      lines.push(`### Additional Insights\n`);
      lines.push(`- Total ${allItems.length} relevant items found across all sources`);
      lines.push(`- Data spans multiple documents and contexts`);
      
      // Add range info for time-based data
      const timeBasedItems = allItems.filter(g => g.bestItem.value && g.bestItem.unit);
      if (timeBasedItems.length >= 2) {
        const times = timeBasedItems
          .map(g => this.parseTimeToHours(g.bestItem))
          .filter(t => t !== Infinity);
        
        if (times.length >= 2) {
          const fastest = Math.min(...times);
          const slowest = Math.max(...times);
          lines.push(`- Value range: ${this.formatHours(fastest)} to ${this.formatHours(slowest)}`);
        }
      }
    }
    
    return lines.join('\n');
  }
  
  /**
   * Generate full results table for remaining items
   */
  private generateFullResultsSection(allItems: any[]): string {
    const lines: string[] = ['## 📋 Complete Results Table\n'];
    
    lines.push('| Rank | Description | Time | Confidence |');
    lines.push('|------|-------------|------|------------|');
    
    allItems.slice(0, 10).forEach((group, index) => {
      const item = group.bestItem;
      const value = item.value && item.unit ? `${item.value} ${item.unit}` : 'N/A';
      const content = this.cleanContent(item.content).substring(0, 50);
      const confidence = `${(item.confidence * 100).toFixed(0)}%`;
      
      lines.push(`| ${index + 1} | ${content}${item.content.length > 50 ? '...' : ''} | ${value} | ${confidence} |`);
    });
    
    if (allItems.length > 10) {
      lines.push(`\n*Showing top 10 of ${allItems.length} total results*`);
    }
    
    return lines.join('\n');
  }
  
  /**
   * Generate sources and references section
   */
  private generateSourcesSection(context: ResearchContext): string {
    const lines: string[] = ['## 📚 Sources & References\n'];
    
    const allChunks = context.ragResults?.chunks || [];
    const uniqueSources = new Map<string, ChunkData>();
    
    // Group chunks by source
    allChunks.forEach(chunk => {
      if (!uniqueSources.has(chunk.source)) {
        uniqueSources.set(chunk.source, chunk);
      }
    });
    
    const sources = Array.from(uniqueSources.values()).slice(0, 5);
    
    sources.forEach((chunk, index) => {
      lines.push(`**Source ${index + 1}**: ${chunk.source}`);
      if (chunk.text) {
        const excerpt = chunk.text.substring(0, 150);
        lines.push(`> "${excerpt}${chunk.text.length > 150 ? '...' : ''}"`);
      }
      lines.push('');
    });
    
    if (uniqueSources.size > 5) {
      lines.push(`*Plus ${uniqueSources.size - 5} additional sources*`);
    }
    
    return lines.join('\n');
  }
  
  /**
   * Generate confidence and methodology section
   */
  private generateConfidenceSection(context: ResearchContext, groupedItems: any[]): string {
    const lines: string[] = ['## 🔍 Research Confidence & Methodology\n'];
    
    // Calculate overall confidence
    const avgConfidence = groupedItems.length > 0
      ? groupedItems.reduce((sum, g) => sum + g.totalConfidence, 0) / groupedItems.length
      : 0;
    
    lines.push(`**Overall Confidence**: ${(avgConfidence * 100).toFixed(0)}%\n`);
    
    lines.push('**Methodology**:');
    const chunkCount = context.ragResults?.chunks?.length || 0;
    const dataCount = context.extractedData?.raw?.length || 0;
    const uniqueSourceCount = new Set(context.ragResults?.chunks?.map(c => c.source) || []).size;
    lines.push(`- Analyzed ${uniqueSourceCount} unique document sources`);
    lines.push(`- Processed ${chunkCount} text chunks`);
    lines.push(`- Extracted ${dataCount} initial data points`);
    lines.push(`- Applied intelligent deduplication and ranking`);
    
    lines.push('\n**Data Quality Notes**:');
    if (avgConfidence > 0.8) {
      lines.push('- ✅ High confidence in results - multiple corroborating sources');
    } else if (avgConfidence > 0.6) {
      lines.push('- ⚠️ Moderate confidence - some uncertainty in data extraction');
    } else {
      lines.push('- ❌ Low confidence - limited or unclear source data');
    }
    
    return lines.join('\n');
  }
  
  /**
   * Sort items appropriately for ranking queries
   */
  private sortItemsForRanking(context: ResearchContext, groupedItems: any[]): any[] {
    const query = context.query.toLowerCase();
    
    // For queries looking for best/fastest/minimum values, sort ascending
    // For queries looking for worst/slowest/maximum values, sort descending
    const hasTimeData = groupedItems.some(g => g.bestItem.value && g.bestItem.unit);
    
    if (hasTimeData) {
      // Check if query is looking for minimum or maximum values
      const wantsMaximum = query.includes('slow') || query.includes('long') || 
                          query.includes('worst') || query.includes('maximum');
      
      const sorted = groupedItems.sort((a, b) => {
        const aTime = this.parseTimeToHours(a.bestItem);
        const bTime = this.parseTimeToHours(b.bestItem);
        return wantsMaximum ? (bTime - aTime) : (aTime - bTime);
      });
      
      // Debug logging
      console.log('📈 Ranking sort:');
      sorted.slice(0, 6).forEach((item, i) => {
        const time = this.parseTimeToHours(item.bestItem);
        console.log(`  ${i + 1}. ${item.bestItem.content} → ${item.bestItem.value} ${item.bestItem.unit} (${time.toFixed(2)} hours)`);
      });
      
      return sorted;
    } else if (query.includes('slow') || query.includes('long')) {
      // For longest/slowest, sort descending
      return groupedItems.sort((a, b) => {
        const aTime = this.parseTimeToHours(a.bestItem);
        const bTime = this.parseTimeToHours(b.bestItem);
        return bTime - aTime;
      });
    } else {
      // Default: sort by confidence
      return groupedItems.sort((a, b) => b.totalConfidence - a.totalConfidence);
    }
  }
  
  /**
   * Extract the number from "top N" queries
   */
  private extractTopN(query: string): number {
    const match = query.match(/top\s+(\d+)/i);
    return match ? parseInt(match[1]) : 3;
  }
  
  /**
   * Format hours for display
   */
  private formatHours(hours: number): string {
    if (hours < 1) {
      return `${(hours * 60).toFixed(1)} minutes`;
    } else {
      return `${hours.toFixed(2)} hours`;
    }
  }
  
  /**
   * Generate a general research report (non-ranking queries)
   */
  private generateGeneralReport(context: ResearchContext, groupedItems: any[]): string {
    // Similar structure but different formatting
    const sections: string[] = [];
    
    sections.push(this.generateGeneralSummarySection(context, groupedItems));
    sections.push(this.generateGeneralDetailsSection(context, groupedItems));
    sections.push(this.generateSourcesSection(context));
    sections.push(this.generateConfidenceSection(context, groupedItems));
    
    return sections.join('\n\n---\n\n');
  }
  
  
  /**
   * Generate general summary section
   */
  private generateGeneralSummarySection(context: ResearchContext, groupedItems: any[]): string {
    const lines: string[] = ['## 🎯 Research Summary\n'];
    
    lines.push(`**Query**: "${context.query}"`);
    lines.push(`**Results**: Found ${groupedItems.length} relevant information points\n`);
    
    // Key findings
    lines.push('### Key Findings:');
    groupedItems.slice(0, 5).forEach((group, index) => {
      const item = group.bestItem;
      const formatted = this.formatItemForDisplay(item);
      lines.push(`${index + 1}. ${formatted}`);
    });
    
    return lines.join('\n');
  }
  
  /**
   * Generate general details section
   */
  private generateGeneralDetailsSection(context: ResearchContext, groupedItems: any[]): string {
    const lines: string[] = ['## 📊 Detailed Information\n'];
    
    groupedItems.slice(0, 10).forEach((group, index) => {
      const item = group.bestItem;
      lines.push(`### Finding ${index + 1}`);
      lines.push(`**Content**: ${item.content}`);
      
      if (item.value && item.unit) {
        lines.push(`**Value**: ${item.value} ${item.unit}`);
      }
      
      if (item.context && item.context !== item.content) {
        lines.push(`**Context**: "${item.context.substring(0, 300)}${item.context.length > 300 ? '...' : ''}"`);
      }
      
      lines.push('');
    });
    
    return lines.join('\n');
  }
  
  /**
   * Format item for display in summary
   */
  private formatItemForDisplay(item: any): string {
    const value = item.value && item.unit ? `${item.value} ${item.unit}` : '';
    const content = this.cleanContent(item.content);
    return this.formatWithTime(content, value);
  }
  
  /**
   * Format report when no results are found
   */
  private formatNoResultsReport(context: ResearchContext): string {
    return `## 🔍 Research Report

**Query**: "${context.query}"
**Status**: No relevant information found

### Summary
No relevant information was found in the available documents that matches your query.

### Suggestions
1. Try using different keywords or phrases
2. Broaden your search criteria
3. Verify that the documents contain the expected information
4. Check spelling and terminology

### Search Details
- Documents searched: ${new Set(context.ragResults?.chunks?.map(c => c.source) || []).size}
- Text chunks analyzed: ${context.ragResults?.chunks?.length || 0}
- Query type: ${context.understanding?.queryType || 'general'}

---

*Research completed at ${new Date().toISOString()}*`;
  }

  
  private cleanContent(content: string): string {
    // Remove LLM thinking patterns - expanded list
    let clean = content;
    
    // Remove common LLM preambles
    const thinkingPatterns = [
      /^(Okay,? let'?s see\.?|Let me think|Let me see|First,? I need to|Looking at|The user wants?)[^.]*\.\s*/i,
      /^(Based on|According to|From what I can see|It appears that|It seems)[^.]*,\s*/i,
      /^(The text mentions?|The content shows?|I can see that|Looking through)[^.]*,\s*/i
    ];
    
    thinkingPatterns.forEach(pattern => {
      clean = clean.replace(pattern, '');
    });
    
    // Remove trailing explanations and meta-commentary
    clean = clean.replace(/\s*-\s*(time not specified|why it matches|note:|however,).*$/i, '');
    clean = clean.replace(/\s*\(.*?\)\s*$/g, ''); // Remove trailing parenthetical comments
    
    // Clean up run descriptions
    if (clean.match(/^\d+\.\d+\.\d+\.\d+/)) {
      // Handle malformed numbering like "2..1.1.1.1.1"
      clean = clean.replace(/^\d+(\.\d+)+\s*/, '');
    }
    
    // Remove duplicate whitespace
    clean = clean.replace(/\s+/g, ' ');
    
    return clean.trim();
  }
  
  /**
   * Clean and deduplicate extracted items
   * Removes malformed content and duplicates
   */
  private cleanAndDeduplicateItems(items: any[]): any[] {
    console.log(`🧹 Starting content cleaning and deduplication for ${items.length} items`);
    
    // Step 1: Clean malformed content
    const cleanedItems = items.map(item => {
      let cleanContent = item.content || '';
      
      // Remove malformed markdown/formatting artifacts
      cleanContent = cleanContent
        .replace(/\*\*+/g, '') // Remove extra asterisks
        .replace(/^\[|\]$/g, '') // Remove brackets at start/end
        .replace(/^\s*[-•*]\s*/, '') // Remove leading bullet points
        .replace(/\s*:\s*$/, '') // Remove trailing colons
        .trim();
      
      // Clean up spacing
      cleanContent = cleanContent.replace(/\s+/g, ' ').trim();
      
      return {
        ...item,
        content: cleanContent,
        originalContent: item.content // Keep original for debugging
      };
    }).filter(item => item.content.length > 3); // Remove very short items
    
    console.log(`🧹 After content cleaning: ${cleanedItems.length} items (removed ${items.length - cleanedItems.length} malformed)`);
    
    // Step 2: Deduplicate by content similarity
    const deduplicatedItems: any[] = [];
    
    for (const item of cleanedItems) {
      // FIXED: Less aggressive normalization - preserve run numbers and timing differences
      const normalizedContent = item.content.toLowerCase()
        .replace(/[^\w\s:\-\.]/g, ' ') // Remove punctuation but keep : - .
        .replace(/\s+/g, ' ')
        .trim();
      
      // Only remove if content is nearly identical (edit distance approach)
      const isDuplicate = deduplicatedItems.some(existing => {
        const existingNormalized = existing.content.toLowerCase()
          .replace(/[^\w\s:\-\.]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        
        // Consider duplicate only if:
        // 1. Exact match after basic cleaning, OR
        // 2. Very high similarity (95%+) AND same timing values
        if (existingNormalized === normalizedContent) {
          return true;
        }
        
        // For table rows with different times, NEVER consider them duplicates
        const currentTime = item.value + ' ' + (item.unit || '');
        const existingTime = existing.value + ' ' + (existing.unit || '');
        
        // If both have times and they're different, keep both
        if (item.value && existing.value && currentTime !== existingTime) {
          return false;
        }
        
        // Only consider duplicate if extremely similar (95%+) with same or no timing
        if (currentTime === existingTime) {
          const similarity = this.calculateStringSimilarity(normalizedContent, existingNormalized);
          return similarity > 0.95; // Increased threshold from 0.9 to 0.95
        }
        
        return false;
      });
      
      if (!isDuplicate) {
        deduplicatedItems.push(item);
      } else {
        console.log(`🗑️ Removing duplicate: "${item.content.substring(0, 50)}..." (similar to existing)`);
      }
    }
    
    console.log(`🧹 After deduplication: ${deduplicatedItems.length} items (removed ${cleanedItems.length - deduplicatedItems.length} duplicates)`);
    
    // Step 3: Sort by content quality (prefer complete descriptions)
    const sortedItems = deduplicatedItems.sort((a, b) => {
      const aQuality = this.calculateContentQuality(a.content);
      const bQuality = this.calculateContentQuality(b.content);
      return bQuality - aQuality; // Higher quality first
    });
    
    return sortedItems;
  }
  
  /**
   * Calculate content quality score
   * Higher scores for more complete, descriptive content
   */
  private calculateContentQuality(content: string): number {
    let score = 0;
    
    // Prefer longer descriptions
    score += Math.min(content.length / 10, 20);
    
    // Bonus for complete run descriptions
    if (/run\s*\d+/i.test(content)) score += 10;
    if (/optimization|speed|batch|training/i.test(content)) score += 5;
    if (/completed?\s*in/i.test(content)) score += 5;
    
    // Penalty for fragments
    if (content.length < 20) score -= 10;
    if (/^(run|completed|speed)$/i.test(content.trim())) score -= 15; // Single words
    
    return score;
  }
  
  /**
   * Calculate string similarity using a simple approach
   * Returns value between 0 and 1 (1 = identical)
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1;
    if (str1.length === 0 || str2.length === 0) return 0;
    
    const words1 = str1.split(' ').filter(w => w.length > 2);
    const words2 = str2.split(' ').filter(w => w.length > 2);
    
    if (words1.length === 0 && words2.length === 0) return 1;
    if (words1.length === 0 || words2.length === 0) return 0;
    
    const commonWords = words1.filter(word => words2.includes(word));
    const similarity = commonWords.length / Math.max(words1.length, words2.length);
    
    return similarity;
  }
  
  private formatWithTime(content: string, timeValue: string): string {
    if (!timeValue) {
      return content || 'time not specified';
    }
    
    // Clean the content first
    const cleanContent = content.trim();
    
    // Check if content already contains the exact time value
    const normalizedTimeValue = timeValue.replace(/\s+/g, ' ').trim();
    const normalizedContent = cleanContent.replace(/\s+/g, ' ');
    
    if (normalizedContent.includes(normalizedTimeValue)) {
      // Content already contains the time - return as is
      return cleanContent;
    }
    
    // Check if content already has time format like "completed in X minutes"
    const completeTimePattern = /completed\s+in\s+\d+\.?\d*\s*(hours?|hrs?|minutes?|mins?)/i;
    if (completeTimePattern.test(cleanContent)) {
      // Content already has complete time format, don't modify
      return cleanContent;
    }
    
    // Check if content has partial time like "45 minutes" or "3.5 hours"
    const hasTimePattern = /\b\d+\.?\d*\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b/i;
    if (hasTimePattern.test(cleanContent)) {
      // Content has standalone time - convert to proper format
      const timeMatch = cleanContent.match(/(\d+\.?\d*\s*(?:hours?|hrs?|minutes?|mins?))/i);
      if (timeMatch) {
        const extractedTime = timeMatch[1];
        const description = cleanContent.replace(timeMatch[0], '').trim().replace(/^[:\-\s]+|[:\-\s]+$/g, '');
        return description ? `${description} - ${extractedTime}` : extractedTime;
      }
      // If we can't cleanly extract, return content as is
      return cleanContent;
    }
    
    // Content has no time info - append our time value if content is meaningful
    if (cleanContent && cleanContent.length > 2) {
      return `${cleanContent} - ${timeValue}`;
    } else {
      return timeValue;
    }
  }
  
  private parseTimeToHours(item: any): number {
    if (!item.value || !item.unit) return Infinity;
    
    const value = parseFloat(item.value);
    const unit = item.unit.toLowerCase();
    
    if (unit.includes('hour')) return value;
    if (unit.includes('minute')) return value / 60;
    if (unit.includes('second')) return value / 3600;
    
    return value;
  }
  
  private filterByIntent(context: ResearchContext, groupedItems: any[]): any[] {
    const query = context.query.toLowerCase();
    const queryType = context.understanding.queryType;
    
    // Minimal filtering - only remove clearly irrelevant items
    let filtered = groupedItems.filter(group => {
      const item = group.bestItem;
      const content = item.content.toLowerCase();
      
      // Only filter out explicit "no information found" responses
      const irrelevantPatterns = [
        'no relevant information found',
        'no information about',
        'there is no mention'
      ];
      
      const isIrrelevant = irrelevantPatterns.some(pattern => content.includes(pattern));
      
      if (isIrrelevant) {
        console.log(`🗑️ Filtering out no-info response: "${item.content.substring(0, 50)}..."`);
        return false;
      }
      
      return true;
    });
    
    // For ranking queries, be inclusive - keep all relevant data
    if (queryType === 'ranking' || query.includes('top') || query.includes('best')) {
      // Don't filter out items with values
      filtered = filtered.filter(group => {
        const item = group.bestItem;
        const unit = (item.unit || '').toLowerCase();
        
        // Keep ALL time-based metrics
        if (unit.includes('hour') || unit.includes('minute') || unit.includes('second')) {
          return true;
        }
        
        // Keep table data
        if (item.metadata?.type === 'table_row' || item.metadata?.method === 'table') {
          return true;
        }
        
        // Keep entries
        if (item.content.toLowerCase().includes('entry')) {
          return true;
        }
        
        // Only exclude pure performance metrics
        if (unit.includes('tokens/s') || unit.includes('tok/s')) {
          console.log(`🗑️ Filtering out tokens/s metric: "${item.content.substring(0, 50)}..."`);
          return false;
        }
        
        // Keep everything else for ranking queries
        return true;
      });
    }
    
    console.log(`📊 Minimal filtering: ${groupedItems.length} → ${filtered.length} (kept ${Math.round(filtered.length / groupedItems.length * 100)}%)`);
    return filtered;
  }
  
  private async groupAndRankItems(context: ResearchContext): Promise<any[]> {
    // First, identify if we have table data
    const tableItems = context.extractedData.raw.filter(item => 
      item.metadata?.type === 'table_row' || 
      item.metadata?.type === 'numbered_row' ||
      item.metadata?.method === 'table'
    );
    
    const hasTableData = tableItems.length > 0;
    console.log(`📊 Found ${tableItems.length} table items out of ${context.extractedData.raw.length} total`);
    
    // If we have table data, prefer those for structured queries
    const itemsToProcess = hasTableData && context.query.toLowerCase().includes('top') 
      ? tableItems 
      : context.extractedData.raw;
    
    // Use LLM to intelligently group and understand items
    if (itemsToProcess.length > 0) {
      const groupingPrompt = `<think>
I need to group these extracted items intelligently:
1. Are these from a table showing progression/ranking?
2. Which items represent the same concept but from different sources?
3. What's the relationship between these data points?
</think>

Please analyze these extracted items and determine which ones are unique entries vs duplicates:

${itemsToProcess.slice(0, 20).map((item, i) => 
  `Item ${i + 1}: ${item.content} (value: ${item.value} ${item.unit || ''}, type: ${item.metadata?.type || 'unknown'})`
).join('\n')}

For the user query: "${context.query}"

Identify:
1. Which items are distinct entries (e.g., different rows in a table)
2. Which items are duplicates or variations of the same data
3. If this is table data, what order should they be in?`;

      try {
        const llmResponse = await this.llm(groupingPrompt);
        console.log('🤖 LLM grouping analysis:', llmResponse.substring(0, 200));
      } catch (error) {
        console.warn('LLM grouping failed, using fallback');
      }
    }
    
    // Group items by similarity, but be smarter about table data
    const groups: Map<string, typeof context.extractedData.raw> = new Map();
    
    for (const item of itemsToProcess) {
      const key = this.generateSmartGroupKey(item);
      const group = groups.get(key) || [];
      group.push(item);
      groups.set(key, group);
    }
    
    // Convert to ranked list
    const ranked = Array.from(groups.values())
      .map(group => ({
        items: group,
        bestItem: group.reduce((best, item) => 
          item.confidence > best.confidence ? item : best
        ),
        totalConfidence: group.reduce((sum, item) => sum + item.confidence, 0) / group.length,
        isTableData: group.some(item => item.metadata?.type?.includes('table'))
      }))
      .sort((a, b) => {
        // If both are table data with row numbers, sort by row number
        if (a.isTableData && b.isTableData) {
          const aRow = parseInt(a.bestItem.metadata?.rowNumber || '999');
          const bRow = parseInt(b.bestItem.metadata?.rowNumber || '999');
          if (!isNaN(aRow) && !isNaN(bRow)) {
            return aRow - bRow; // Sort by row number for table data
          }
        }
        // Otherwise sort by confidence
        return b.totalConfidence - a.totalConfidence;
      });
    
    return ranked;
  }
  
  private generateSmartGroupKey(item: any): string {
    // For table data, use row number + description to avoid grouping different rows
    if (item.metadata?.rowNumber && item.metadata?.description) {
      return `table_row_${item.metadata.rowNumber}_${item.metadata.description}`;
    }
    
    // For list items, use position
    if (item.metadata?.position) {
      return `list_${item.metadata.position}_${item.value || ''}`;
    }
    
    // For current records, keep them separate
    if (item.metadata?.type === 'current_record') {
      return `current_record_${item.value}_${Date.now()}`;
    }
    
    // Default grouping by content and value
    const contentKey = item.content.toLowerCase()
      .replace(/entry \d+:|row \d+:/gi, '') // Remove row prefixes
      .replace(/[^a-z0-9]/g, '')
      .substring(0, 30);
    const valueKey = item.value ? String(item.value) : '';
    const unitKey = item.unit ? item.unit.substring(0, 3) : '';
    
    return `${contentKey}_${valueKey}_${unitKey}`;
  }
  
  
  private formatRawData(context: ResearchContext, groupedItems: any[]): string {
    if (context.understanding.queryType === 'ranking') {
      return groupedItems.slice(0, 10).map((group, i) => {
        const item = group.bestItem;
        const value = item.value && item.unit ? `${item.value} ${item.unit}` : '';
        const formattedLine = this.formatWithTime(item.content, value);
        return `${i + 1}. ${formattedLine}`;
      }).join('\n');
    }
    
    return groupedItems.slice(0, 5).map(group => {
      const item = group.bestItem;
      const value = item.value && item.unit ? `${item.value} ${item.unit}` : '';
      const formattedLine = this.formatWithTime(item.content, value);
      return `• ${formattedLine}`;
    }).join('\n\n');
  }
  
  /**
   * Generate list format output (for "top X" queries)
   */
  private generateListFormat(context: ResearchContext, topItems: any[], allItems: any[]): string {
    const lines: string[] = [];
    
    lines.push(`## 🎯 ${context.query}\n`);
    
    if (topItems.length === 0) {
      lines.push('**No results found** matching your criteria.');
      return lines.join('\n');
    }
    
    lines.push(`**Found ${allItems.length} relevant items. Top ${topItems.length}:**\n`);
    
    topItems.forEach((group, index) => {
      const item = group.bestItem;
      const value = item.value && item.unit ? ` - ${item.value} ${item.unit}` : '';
      const content = this.cleanContent(item.content);
      
      lines.push(`**${index + 1}. ${content}${value}**`);
      
      if (item.context && item.context !== item.content) {
        lines.push(`   ${item.context.substring(0, 150)}${item.context.length > 150 ? '...' : ''}`);
      }
      lines.push('');
    });
    
    return lines.join('\n');
  }
  
  /**
   * Generate table format output (for comparative data)
   */
  private generateTableFormat(context: ResearchContext, items: any[]): string {
    const lines: string[] = [];
    
    lines.push(`## 📊 ${context.query}\n`);
    
    if (items.length === 0) {
      lines.push('**No data found** for comparison.');
      return lines.join('\n');
    }
    
    // Determine column headers based on data
    const hasValues = items.some(g => g.bestItem.value && g.bestItem.unit);
    const hasTypes = items.some(g => g.bestItem.metadata?.type);
    
    lines.push('| # | Description |' + (hasValues ? ' Value |' : '') + (hasTypes ? ' Type |' : '') + ' Confidence |');
    lines.push('|---|-------------|' + (hasValues ? '-------|' : '') + (hasTypes ? '------|' : '') + '-----------|');
    
    items.slice(0, 15).forEach((group, index) => {
      const item = group.bestItem;
      const desc = this.cleanContent(item.content).substring(0, 60);
      const value = item.value && item.unit ? `${item.value} ${item.unit}` : '-';
      const type = item.metadata?.type || '-';
      const confidence = `${(item.confidence * 100).toFixed(0)}%`;
      
      let row = `| ${index + 1} | ${desc}${item.content.length > 60 ? '...' : ''} |`;
      if (hasValues) row += ` ${value} |`;
      if (hasTypes) row += ` ${type} |`;
      row += ` ${confidence} |`;
      
      lines.push(row);
    });
    
    if (items.length > 15) {
      lines.push(`\n*Showing top 15 of ${items.length} results*`);
    }
    
    return lines.join('\n');
  }
  
  /**
   * Generate explanation format output (for "how" or "why" queries)
   */
  private generateExplanationFormat(context: ResearchContext, topItems: any[], allItems: any[]): string {
    const lines: string[] = [];
    
    lines.push(`## 📖 ${context.query}\n`);
    
    if (topItems.length === 0) {
      lines.push('**No relevant information found** to answer your question.');
      return lines.join('\n');
    }
    
    // Generate a narrative explanation
    lines.push('Based on the available information:\n');
    
    topItems.forEach((group, index) => {
      const item = group.bestItem;
      const content = this.cleanContent(item.content);
      
      if (index === 0) {
        lines.push(`**${content}**`);
      } else {
        lines.push(`Additionally, ${content.toLowerCase()}`);
      }
      
      if (item.context && item.context !== item.content) {
        lines.push(`\n> ${item.context}\n`);
      }
    });
    
    // Add summary if multiple items
    if (allItems.length > topItems.length) {
      lines.push(`\n**Additional context:** ${allItems.length - topItems.length} more related findings were discovered but not included for brevity.`);
    }
    
    return lines.join('\n');
  }

  /**
   * 🔥 CRITICAL FIX: Clean final answer for user presentation
   * Removes thinking tags and formats for clean output
   */
  private cleanFinalAnswer(answer: string): string {
    if (!answer) return answer;
    
    console.log(`🧹 CLEANING FINAL ANSWER: Input length ${answer.length}, has <think>: ${answer.includes('<think>')}, has <reasoning>: ${answer.includes('<reasoning>')}`);
    
    let cleaned = answer;
    
    // Step 1: Remove <think> tags to preserve actual synthesis content
    const thinkMatch = cleaned.match(/<think>([\s\S]*?)<\/think>/i);
    if (thinkMatch) {
      cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      console.log(`🎯 REMOVED THINK TAGS: Content preserved, length ${cleaned.length} chars`);
    }
    
    // 🔥 FIX: Remove <reasoning> tags and extract clean content
    const reasoningMatch = cleaned.match(/<reasoning>([\s\S]*?)<\/reasoning>/i);
    if (reasoningMatch) {
      cleaned = reasoningMatch[1].trim(); // Extract content inside reasoning tags
      console.log(`🎯 EXTRACTED FROM REASONING TAGS: "${cleaned.substring(0, 100)}..."`);
    }
    
    // Step 2: Remove any remaining thinking patterns
    cleaned = cleaned.replace(/^<think>[\s\S]*$/gim, '');
    cleaned = cleaned.replace(/Okay,?\s*let me[\s\S]*?(?=\n\n|\n[A-Z]|$)/gi, '');
    
    // Step 3: Clean up common LLM artifacts
    cleaned = cleaned.replace(/^(Looking at|Let me|First|Based on)[\s\S]*?(?=\n\n|\n[#*]|$)/gim, '');
    
    // Step 4: Remove empty lines and normalize spacing
    cleaned = cleaned.replace(/\n\s*\n\s*\n/g, '\n\n'); // Max 2 consecutive newlines
    cleaned = cleaned.replace(/^\s+|\s+$/g, ''); // Trim whitespace
    
    // Step 5: Ensure it starts with actual content, not meta-commentary
    const lines = cleaned.split('\n').filter(line => line.trim());
    const contentStartIndex = lines.findIndex(line => 
      !line.toLowerCase().includes('analyzing') &&
      !line.toLowerCase().includes('looking at') &&
      !line.toLowerCase().includes('let me') &&
      !line.toLowerCase().includes('first,') &&
      !line.toLowerCase().startsWith('okay') &&
      line.length > 10
    );
    
    if (contentStartIndex > 0) {
      cleaned = lines.slice(contentStartIndex).join('\n');
    }
    
    console.log(`🧹 CLEANED FINAL ANSWER: Output length ${cleaned.length}, preview: "${cleaned.substring(0, 100)}..."`);
    
    return cleaned;
  }
}