/**
 * Data Analysis Agent
 * 
 * Cleans, deduplicates, and categorizes extracted data.
 * First step in the multi-synthesis pipeline.
 * Optimized to stay under 800 tokens.
 */

import { BaseAgent } from '../interfaces/Agent';
import { ResearchContext, ExtractedItem } from '../interfaces/Context';
import { LLMFunction } from '../core/Orchestrator';

interface GroupedItem {
  bestItem: ExtractedItem;
  similarItems: ExtractedItem[];
  confidence: number;
  category?: string;
  classification?: 'current' | 'historical' | 'other';
  isCurrent?: boolean;
  isHistorical?: boolean;
}

interface AnalyzedData {
  cleaned: ExtractedItem[];
  categorized: GroupedItem[];
  insights: string;
}

export class DataAnalysisAgent extends BaseAgent {
  readonly name = 'DataAnalyzer';
  readonly description = 'Cleans, deduplicates, and categorizes extracted data';
  
  private llm: LLMFunction;
  
  constructor(llm: LLMFunction) {
    super();
    this.llm = llm;
  }
  
  async process(context: ResearchContext): Promise<ResearchContext> {
    // Initialize if needed
    if (!context.extractedData) {
      context.extractedData = { raw: [], structured: [] };
    }
    
    const initialCount = context.extractedData.raw?.length || 0;
    
    if (initialCount === 0) {
      this.setReasoning('No data to analyze - skipping data analysis');
      return context;
    }
    
    console.log(`🔍 DataAnalyzer: Processing ${initialCount} extracted items`);
    
    // Step 1: Clean and deduplicate
    const cleaned = this.cleanAndDeduplicateItems(context.extractedData.raw);
    console.log(`🧹 After cleaning: ${cleaned.length} items remain`);
    
    // Step 2: Group and categorize
    const categorized = await this.groupAndCategorize(cleaned, context.query);
    
    // Step 3: Generate insights
    const insights = this.generateInsights(cleaned, categorized);
    
    // Store results in new context property
    if (!context.analyzedData) {
      context.analyzedData = { cleaned: [], categorized: [], insights: '' };
    }
    
    context.analyzedData.cleaned = cleaned;
    context.analyzedData.categorized = categorized;
    context.analyzedData.insights = insights;
    
    // Also update extractedData for backward compatibility
    context.extractedData.raw = cleaned;
    context.extractedData.structured = categorized;
    
    this.setReasoning(`📊 Data Analysis Complete:
- Initial items: ${initialCount}
- After cleaning: ${cleaned.length}
- Categories found: ${categorized.length}
- Duplicates removed: ${initialCount - cleaned.length}
${insights}`);
    
    return context;
  }
  
  private cleanAndDeduplicateItems(items: ExtractedItem[]): ExtractedItem[] {
    const cleaned = items.map(item => {
      let content = (item.content || '').toString();
      
      // Remove formatting artifacts
      content = content
        .replace(/\*\*+/g, '')
        .replace(/^\[|\]$/g, '')
        .replace(/^\s*[-•*]\s*/, '')
        .replace(/\s*:\s*$/, '')
        .replace(/\s+/g, ' ')
        .trim();
      
      return {
        ...item,
        content,
        originalContent: item.content
      };
    }).filter(item => item.content.length > 3);
    
    // Deduplicate by similarity
    const deduped: ExtractedItem[] = [];
    const seen = new Set<string>();
    
    for (const item of cleaned) {
      const key = this.getNormalizedKey(item);
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(item);
      }
    }
    
    return deduped;
  }
  
  private getNormalizedKey(item: ExtractedItem): string {
    const content = item.content.toLowerCase().replace(/[^\w\s]/g, '');
    const value = item.value ? String(item.value) : '';
    return `${content.substring(0, 50)}_${value}`;
  }
  
  private async groupAndCategorize(items: ExtractedItem[], query: string): Promise<GroupedItem[]> {
    if (items.length === 0) return [];
    
    // Group similar items
    const groups = new Map<string, GroupedItem>();
    
    for (const item of items) {
      const key = this.getGroupKey(item);
      
      if (!groups.has(key)) {
        groups.set(key, {
          bestItem: item,
          similarItems: [],
          confidence: item.confidence || 0.8
        });
      } else {
        const group = groups.get(key)!;
        group.similarItems.push(item);
        group.confidence = Math.max(group.confidence, item.confidence || 0.8);
      }
    }
    
    // Convert to array and categorize
    const categorized = Array.from(groups.values());
    
    // Use simple LLM prompt for classification (keeping it under token limit)
    if (categorized.length > 0 && categorized.length <= 15) {
      const prompt = `Classify these items as 'current', 'historical', or 'other':
${categorized.slice(0, 10).map((g, i) => 
  `${i+1}. ${g.bestItem.content} - ${g.bestItem.value || 'N/A'}`
).join('\n')}

Reply with just the classifications in order.`;
      
      try {
        const response = await this.llm(prompt);
        const classifications = response.toLowerCase().split('\n');
        
        categorized.forEach((group, i) => {
          const classification = classifications[i] || '';
          group.classification = classification.includes('current') ? 'current' :
                                classification.includes('historical') ? 'historical' : 'other';
          group.isCurrent = group.classification === 'current';
          group.isHistorical = group.classification === 'historical';
        });
      } catch (error) {
        console.warn('Classification failed, using defaults');
      }
    }
    
    return categorized;
  }
  
  private getGroupKey(item: ExtractedItem): string {
    // Group by value and unit for ranking data
    if (item.value && item.unit) {
      return `${item.unit}_${Math.floor(Number(item.value) / 10) * 10}`;
    }
    // Group by content similarity for text data
    return item.content.substring(0, 30).toLowerCase();
  }
  
  private generateInsights(cleaned: ExtractedItem[], categorized: GroupedItem[]): string {
    const tableItems = cleaned.filter(item => 
      item.metadata?.type?.includes('table') || 
      item.metadata?.method === 'table'
    ).length;
    
    const currentItems = categorized.filter(g => g.isCurrent).length;
    const historicalItems = categorized.filter(g => g.isHistorical).length;
    
    return `
- Table data: ${tableItems} items
- Current records: ${currentItems}
- Historical data: ${historicalItems}`;
  }
}