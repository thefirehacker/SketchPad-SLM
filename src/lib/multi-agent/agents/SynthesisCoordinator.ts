/**
 * Synthesis Coordinator Agent
 * 
 * Orchestrates the multi-synthesis pipeline and combines outputs.
 * Final step that assembles the complete answer.
 * Optimized to stay under 600 tokens.
 */

import { BaseAgent } from '../interfaces/Agent';
import { ResearchContext } from '../interfaces/Context';
import { LLMFunction } from '../core/Orchestrator';

export class SynthesisCoordinator extends BaseAgent {
  readonly name = 'SynthesisCoordinator';
  readonly description = 'Orchestrates synthesis agents and assembles final report';
  
  private llm: LLMFunction;
  
  constructor(llm: LLMFunction) {
    super();
    this.llm = llm;
  }
  
  async process(context: ResearchContext): Promise<ResearchContext> {
    // Check prerequisites
    if (!context.analyzedData?.cleaned || context.analyzedData.cleaned.length === 0) {
      this.setReasoning('⚠️ No analyzed data available - cannot coordinate synthesis');
      context.synthesis.answer = this.generateEmptyReport(context);
      return context;
    }
    
    const itemCount = context.analyzedData.cleaned.length;
    const sectionCount = Object.keys(context.reportSections || {}).length;
    const hasCitations = context.citations?.sources?.length > 0;
    
    console.log(`🎯 SynthesisCoordinator: Assembling final report from ${sectionCount} sections`);
    
    // Combine all components into final report
    const finalReport = await this.assembleReport(context);
    
    // Clean and validate
    const cleanedReport = this.cleanFinalAnswer(finalReport);
    
    // Store final answer
    context.synthesis.answer = cleanedReport;
    context.synthesis.confidence = this.calculateConfidence(context);
    
    // Update reasoning
    this.setReasoning(`✅ Synthesis Coordination Complete:
- Data items processed: ${itemCount}
- Report sections: ${sectionCount}
- Citations included: ${hasCitations ? 'Yes' : 'No'}
- Final report: ${cleanedReport.length} characters
- Confidence: ${(context.synthesis.confidence * 100).toFixed(1)}%`);
    
    return context;
  }
  
  private async assembleReport(context: ResearchContext): Promise<string> {
    const sections = context.reportSections || {};
    const summary = context.summary || {};
    const citations = context.citations || {};
    
    // If we have complete sections, just combine them
    if (sections.executive && sections.findings) {
      return this.combineExistingSections(sections, summary, citations);
    }
    
    // Otherwise, generate a simple report from analyzed data
    const prompt = `Based on this analyzed data, create a comprehensive answer:

Query: "${context.query}"

Key Findings:
${context.analyzedData?.categorized?.slice(0, 10).map((item, i) => 
  `${i+1}. ${item.bestItem.content} - ${item.bestItem.value || 'N/A'}`
).join('\n')}

Insights: ${context.analyzedData?.insights || 'N/A'}

Create a well-structured report that directly answers the query.`;
    
    try {
      const response = await this.llm(prompt);
      return this.formatResponse(response, context);
    } catch (error) {
      console.error('LLM synthesis failed:', error);
      return this.fallbackReport(context);
    }
  }
  
  private combineExistingSections(sections: any, summary: any, citations: any): string {
    const parts: string[] = [];
    
    // Add executive summary if available
    if (summary.executive) {
      parts.push(`## Executive Summary\n\n${summary.executive}\n`);
    }
    
    // Add main sections
    if (sections.executive) {
      parts.push(`## Key Information\n\n${sections.executive}\n`);
    }
    
    if (sections.findings) {
      parts.push(`## Detailed Findings\n\n${sections.findings}\n`);
    }
    
    if (sections.details) {
      parts.push(`## Additional Details\n\n${sections.details}\n`);
    }
    
    // Add citations
    if (citations.sources?.length > 0) {
      parts.push(`## Sources\n\n${citations.sources.map(s => `- ${s}`).join('\n')}`);
    }
    
    return parts.join('\n');
  }
  
  private formatResponse(response: string, context: ResearchContext): string {
    // Clean up LLM response
    let formatted = response
      .replace(/<think>[\s\S]*?<\/think>/g, '')
      .replace(/<bos>|<\/bos>/g, '')
      .trim();
    
    // Add source attribution if needed
    const sourceCount = context.ragResults?.chunks?.length || 0;
    if (sourceCount > 0 && !formatted.includes('Source')) {
      formatted += `\n\n---\n*Based on analysis of ${sourceCount} document chunks*`;
    }
    
    return formatted;
  }
  
  private cleanFinalAnswer(answer: string): string {
    return answer
      .replace(/<think>[\s\S]*?<\/think>/g, '')
      .replace(/<bos>|<\/bos>/g, '')
      .replace(/\*\*\*+/g, '---')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  
  private calculateConfidence(context: ResearchContext): number {
    const hasData = (context.analyzedData?.cleaned?.length || 0) > 0;
    const hasSections = Object.keys(context.reportSections || {}).length > 0;
    const hasCitations = (context.citations?.sources?.length || 0) > 0;
    
    let confidence = 0.5; // Base confidence
    if (hasData) confidence += 0.2;
    if (hasSections) confidence += 0.2;
    if (hasCitations) confidence += 0.1;
    
    return Math.min(confidence, 1.0);
  }
  
  private fallbackReport(context: ResearchContext): string {
    const items = context.analyzedData?.categorized || [];
    
    if (items.length === 0) {
      return this.generateEmptyReport(context);
    }
    
    // Create simple list-based report
    const report = [`Based on the available data:\n`];
    
    items.slice(0, 10).forEach((item, i) => {
      report.push(`${i+1}. ${item.bestItem.content}`);
      if (item.bestItem.value) {
        report.push(`   Value: ${item.bestItem.value} ${item.bestItem.unit || ''}`);
      }
    });
    
    return report.join('\n');
  }
  
  private generateEmptyReport(context: ResearchContext): string {
    return `I couldn't find specific information to answer your query: "${context.query}"

The data extraction and analysis process completed but didn't yield relevant results. This could be because:
- The documents don't contain the requested information
- The query needs to be more specific
- The extraction patterns need adjustment

Please try rephrasing your query or providing additional context.`;
  }
}