/**
 * Response Formatter Agent
 * 
 * Ensures the final response directly answers the user's question with proper formatting
 * and clear structure. Runs after synthesis to enhance response quality.
 */

import { BaseAgent } from '../interfaces/Agent';
import { ResearchContext } from '../interfaces/Context';
import { LLMFunction } from '../core/Orchestrator';

export class ResponseFormatterAgent extends BaseAgent {
  readonly name = 'ResponseFormatter'
  readonly description = 'Ensures responses directly answer questions with clear formatting and structure';
  
  private llm: LLMFunction;
  private progressCallback?: import('../interfaces/AgentProgress').AgentProgressCallback;
  
  constructor(llm: LLMFunction, progressCallback?: import('../interfaces/AgentProgress').AgentProgressCallback) {
    super();
    this.llm = llm;
    this.progressCallback = progressCallback;
  }
  
  async process(context: ResearchContext): Promise<ResearchContext> {
    console.log(`📝 ResponseFormatter: Enhancing response formatting and directness`);
    
    this.progressCallback?.onAgentProgress?.(this.name, 10, 'Analyzing response structure', 0, undefined);
    
    // Check if we have synthesis results to format
    if (!context.synthesis?.answer) {
      console.log(`⚠️ ResponseFormatter: No synthesis results to format`);
      this.setReasoning('No synthesis results available to format');
      return context;
    }

    this.progressCallback?.onAgentProgress?.(this.name, 30, 'Formatting response for clarity', 0, undefined);
    
    // Enhance the response formatting and directness
    const enhancedResponse = await this.formatResponseForClarity(context);
    
    if (enhancedResponse) {
      // Update the synthesis with enhanced formatting
      context.synthesis.answer = enhancedResponse.formattedAnswer;
      
      // Preserve original reasoning and add formatting insights
      context.synthesis.reasoning = `${context.synthesis.reasoning}

📝 **Response Formatting Enhancement**:
${enhancedResponse.formattingReasoning}`;
      
      this.setReasoning(`✅ **Response Enhanced for Clarity**

🎯 **Direct Answer Quality**: ${enhancedResponse.qualityScore}/10
📊 **Formatting Improvements**: ${enhancedResponse.improvements.join(', ')}
🔍 **Response Structure**: ${enhancedResponse.structure}

💡 **Enhancement Details**: Applied formatting best practices to ensure the response directly addresses the user's question with clear structure and actionable information.`);
    }
    
    this.progressCallback?.onAgentProgress?.(this.name, 100, 'Response formatting completed', 0, undefined);
    
    return context;
  }
  
  private async formatResponseForClarity(context: ResearchContext): Promise<{
    formattedAnswer: string;
    formattingReasoning: string;
    qualityScore: number;
    improvements: string[];
    structure: string;
  } | null> {
    try {
      const originalAnswer = context.synthesis?.answer || '';
      const query = context.query;
      
      const formattingPrompt = `You are a response formatting specialist. Your job is to take a good research answer and make it DIRECTLY answer the user's question with excellent formatting.

USER'S ORIGINAL QUESTION: "${query}"

CURRENT RESEARCH ANSWER:
${originalAnswer}

TASK: Reformat this answer to:
1. **DIRECTLY ANSWER** the specific question asked
2. **START** with the most important answer first
3. **USE CLEAR FORMATTING** (headers, bullet points, numbers)
4. **BE SPECIFIC** - include actual data, examples, methods mentioned
5. **MAINTAIN ALL FACTUAL CONTENT** - don't lose any information

FORMATTING REQUIREMENTS:
- Use **bold** for key terms and important points
- Use bullet points (•) or numbers (1., 2., 3.) for lists
- Use clear section headers with ##
- Put the MAIN ANSWER in the first paragraph
- Include specific details, numbers, methods that were extracted

CRITICAL: The user should immediately see the answer to their question, then supporting details.

Provide the enhanced response:`;

      const response = await this.llm(formattingPrompt);
      
      // Analyze the improvements made
      const improvements = this.analyzeImprovements(originalAnswer, response);
      const qualityScore = this.assessResponseQuality(query, response);
      const structure = this.identifyStructure(response);
      
      return {
        formattedAnswer: response,
        formattingReasoning: `Applied formatting enhancements to ensure direct question answering with clear structure and improved readability.`,
        qualityScore,
        improvements,
        structure
      };
    } catch (error) {
      console.error('❌ Response formatting failed:', error);
      return null;
    }
  }
  
  private analyzeImprovements(original: string, formatted: string): string[] {
    const improvements = [];
    
    // Check for formatting improvements
    if (formatted.includes('**') && !original.includes('**')) {
      improvements.push('Added bold formatting for emphasis');
    }
    
    if (formatted.includes('##') && !original.includes('##')) {
      improvements.push('Added section headers');
    }
    
    if ((formatted.includes('•') || formatted.includes('1.')) && 
        !(original.includes('•') || original.includes('1.'))) {
      improvements.push('Added structured lists');
    }
    
    if (formatted.length > original.length * 1.1) {
      improvements.push('Enhanced detail and clarity');
    }
    
    if (improvements.length === 0) {
      improvements.push('Maintained original structure with quality validation');
    }
    
    return improvements;
  }
  
  private assessResponseQuality(query: string, response: string): number {
    let score = 5; // Base score
    
    // Check if response addresses the query
    const queryWords = query.toLowerCase().split(/\s+/).filter(word => word.length > 2);
    const responseWords = response.toLowerCase();
    const matchingWords = queryWords.filter(word => responseWords.includes(word));
    
    // Quality scoring
    if (matchingWords.length / queryWords.length > 0.5) score += 2;
    if (response.includes('**')) score += 1; // Has formatting
    if (response.includes('##') || response.includes('•')) score += 1; // Has structure
    if (response.length > 200) score += 1; // Comprehensive
    
    return Math.min(10, score);
  }
  
  private identifyStructure(response: string): string {
    const structures = [];
    
    if (response.includes('##')) structures.push('headers');
    if (response.includes('**')) structures.push('emphasis');
    if (response.includes('•') || response.includes('-')) structures.push('bullets');
    if (response.match(/\d+\./)) structures.push('numbering');
    
    return structures.length > 0 ? structures.join(', ') : 'paragraph';
  }
}
