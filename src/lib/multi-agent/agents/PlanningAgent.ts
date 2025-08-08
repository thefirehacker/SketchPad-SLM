/**
 * Planning Agent
 * 
 * Creates intelligent execution strategies based on DataInspector's document analysis.
 * Decides optimal approach: regex patterns, web search expansion, or direct synthesis.
 */

import { BaseAgent } from '../interfaces/Agent';
import { ResearchContext } from '../interfaces/Context';
import { LLMFunction } from '../core/Orchestrator';
import { parseJsonWithResilience } from '../../../components/DeepResearch/hooks/responseCompletion';

export interface ExecutionPlan {
  strategy: string;
  steps: PlanStep[];
  fallbackOptions: string[];
  expectedDataSources: string[];
  confidenceLevel: number;
}

export interface PlanStep {
  agent: string;
  action: string;
  reasoning: string;
  expectedOutput: string;
  priority: 'high' | 'medium' | 'low';
}

export interface ExtractionStrategy {
  documentType: string;
  queryIntent: string;
  contentAreas: string[];
  patternCategories: {
    people: string[];
    roles: string[];
    designations: string[];
    concepts: string[];
    methods: string[];
    data: string[];
  };
  extractionTargets: string[];
}

export class PlanningAgent extends BaseAgent {
  readonly name = 'PlanningAgent';
  readonly description = 'Creates intelligent execution strategies based on document analysis and query requirements';
  
  private llm: LLMFunction;
  private availableAgents: string[];
  private progressCallback?: import('../interfaces/AgentProgress').AgentProgressCallback;
  
  constructor(llm: LLMFunction, availableAgents?: string[], progressCallback?: import('../interfaces/AgentProgress').AgentProgressCallback) {
    super();
    this.llm = llm;
    this.availableAgents = availableAgents || ['DataInspector', 'PatternGenerator', 'Extractor', 'Synthesizer'];
    this.progressCallback = progressCallback;
  }
  
  async process(context: ResearchContext): Promise<ResearchContext> {
    console.log(`🎯 PlanningAgent: Creating intelligent execution strategy for "${context.query}"`);
    
    // Report progress: Starting analysis
    this.progressCallback?.onAgentProgress(this.name, 10, 'Analyzing research context');
    
    // Analyze current situation
    const situationAnalysis = this.analyzeSituation(context);
    console.log(`📊 Situation Analysis:`, situationAnalysis);
    
    // 🎯 CRITICAL: Create extraction strategy after DataInspector runs
    if (context.sharedKnowledge.documentInsights) {
      this.progressCallback?.onAgentProgress(this.name, 25, 'Creating extraction strategy from DataInspector analysis');
      const extractionStrategy = this.createExtractionStrategy(context);
      console.log(`✅ Created extraction strategy with ${Object.keys(extractionStrategy.patternCategories).length} pattern categories`);
    }
    
    // Report progress: Situation analyzed
    this.progressCallback?.onAgentProgress(this.name, 40, 'Creating execution plan');
    
    // Create execution plan using LLM intelligence
    const executionPlan = await this.createExecutionPlan(context, situationAnalysis);
    
    // Report progress: Plan created
    this.progressCallback?.onAgentProgress(this.name, 80, 'Storing execution plan');
    
    // Store plan in shared knowledge for other agents
    context.sharedKnowledge.executionPlan = executionPlan;
    context.sharedKnowledge.agentFindings.PlanningAgent = {
      plan: executionPlan,
      situationAnalysis: situationAnalysis,
      timestamp: Date.now()
    };
    
    this.setReasoning(`Created execution strategy: ${executionPlan.strategy} with ${executionPlan.steps.length} steps and ${executionPlan.fallbackOptions.length} fallback options`);
    
    // Report progress: Completed
    this.progressCallback?.onAgentProgress(this.name, 100, 'Execution plan completed');
    
    console.log(`✅ Execution plan created: ${executionPlan.strategy}`);
    return context;
  }
  
  private analyzeSituation(context: ResearchContext): any {
    const analysis = {
      // Document availability
      hasDocuments: context.ragResults.chunks.length > 0,
      documentCount: context.ragResults.chunks.length,
      
      // DataInspector insights
      hasDocumentAnalysis: !!context.documentAnalysis,
      relevantDocuments: context.documentAnalysis?.documents?.length || 0,
      documentTypes: context.documentAnalysis?.documents?.map(d => d.documentType) || [],
      
      // Query characteristics
      queryType: this.analyzeQueryType(context.query),
      requiresRanking: this.requiresRanking(context.query),
      requiresComparison: this.requiresComparison(context.query),
      requiresSpecificPerson: this.requiresSpecificPerson(context.query),
      
      // Data quality assessment
      dataQuality: this.assessDataQuality(context),
      needsWebExpansion: this.needsWebExpansion(context)
    };
    
    return analysis;
  }
  
  private async createExecutionPlan(context: ResearchContext, analysis: any): Promise<ExecutionPlan> {
    const prompt = `Create an intelligent execution plan for this research task:

QUERY: "${context.query}"

SITUATION ANALYSIS:
- Documents Available: ${analysis.hasDocuments ? `${analysis.documentCount} chunks` : 'None'}
- Document Types: ${analysis.documentTypes.join(', ') || 'Unknown'}
- Relevant Documents: ${analysis.relevantDocuments}
- Query Type: ${analysis.queryType}
- Requires Ranking: ${analysis.requiresRanking}
- Requires Specific Person: ${analysis.requiresSpecificPerson}
- Data Quality: ${analysis.dataQuality}
- Needs Web Expansion: ${analysis.needsWebExpansion}

DOCUMENT ANALYSIS RESULTS:
${context.documentAnalysis ? `
Document Strategy: ${context.documentAnalysis.extractionStrategy}
Expected Format: ${context.documentAnalysis.expectedOutputFormat}
Content Areas: ${context.documentAnalysis.contentAreas?.join(', ')}
` : 'No document analysis available'}

Based on this analysis, create an intelligent execution plan:

1. **STRATEGY**: What's the best approach? (regex-extraction, web-expansion, direct-synthesis)

2. **EXECUTION STEPS**: What agents should be called and in what order?
   AVAILABLE AGENTS: ${this.availableAgents.join(', ')}
   
   CRITICAL DATA DEPENDENCIES - Follow these rules:
   - "PatternGenerator": Creates regex patterns (MUST run BEFORE Extractor for efficient extraction)
   ${this.availableAgents.includes('WebSearchAgent') ? 
     '- "WebSearchAgent": Expands knowledge when local data insufficient (SHOULD run BEFORE Extractor for comprehensive data extraction)' : ''}
   - "Extractor": Uses patterns to extract data (REQUIRES patterns from PatternGenerator${this.availableAgents.includes('WebSearchAgent') ? ', BENEFITS from WebSearchAgent results' : ''})
   - "Synthesizer": Creates final answer (REQUIRES extracted data from Extractor)
   
   OPTIMAL DEPENDENCY CHAIN: PatternGenerator${this.availableAgents.includes('WebSearchAgent') ? ' → WebSearchAgent' : ''} → Extractor → Synthesizer
   ${this.availableAgents.includes('WebSearchAgent') ? '(WebSearchAgent is optional but when used should run before Extractor)' : ''}

3. **FALLBACK OPTIONS**: What to do if primary approach fails?

4. **EXPECTED DATA SOURCES**: Where should the final answer data come from?

5. **CONFIDENCE LEVEL**: How confident are you this plan will succeed? (0.1-1.0)

Return as JSON:
{
  "strategy": "brief strategy description",
  "steps": [
    {"agent": "AgentName", "action": "what to do", "reasoning": "why needed", "expectedOutput": "what we get", "priority": "high|medium|low"}
  ],
  "fallbackOptions": ["option1", "option2"],
  "expectedDataSources": ["local documents", "web search", "general knowledge"],
  "confidenceLevel": 0.8
}`;

    try {
      // Report progress: Calling LLM for plan generation
      this.progressCallback?.onAgentProgress(this.name, 50, 'Generating strategic plan with LLM');
      
      const response = await this.llm(prompt);
      
      // Report progress: Parsing plan
      this.progressCallback?.onAgentProgress(this.name, 60, 'Parsing execution strategy');
      
      const plan = this.parseExecutionPlan(response);
      
      console.log(`🎯 Generated execution plan:`, {
        strategy: plan.strategy,
        stepCount: plan.steps.length,
        confidence: plan.confidenceLevel
      });
      
      return plan;
      
    } catch (error) {
      console.error('❌ Failed to create execution plan:', error);
      
      // Fallback to simple plan following optimal dependency chain
      const fallbackSteps: PlanStep[] = [
        {
          agent: 'PatternGenerator',
          action: 'create basic patterns',
          reasoning: 'extract structured data',
          expectedOutput: 'regex patterns',
          priority: 'high' as const
        }
      ];

      // Add WebSearchAgent before Extractor for optimal data gathering (only if available and data quality suggests it's needed)
      const dataQuality = this.assessDataQuality(context);
      if (this.availableAgents.includes('WebSearchAgent') && (dataQuality === 'no-data' || dataQuality === 'limited')) {
        fallbackSteps.push({
          agent: 'WebSearchAgent',
          action: 'expand knowledge base',
          reasoning: 'supplement insufficient local data before extraction',
          expectedOutput: 'additional relevant information',
          priority: 'medium' as const
        });
      }

      fallbackSteps.push(
        {
          agent: 'Extractor', 
          action: 'extract using patterns',
          reasoning: 'get structured data from all available sources',
          expectedOutput: 'extracted information',
          priority: 'high' as const
        },
        {
          agent: 'Synthesizer',
          action: 'create final answer',
          reasoning: 'combine extracted data',
          expectedOutput: 'user answer',
          priority: 'high' as const
        }
      );

      return {
        strategy: 'fallback-simple-extraction',
        steps: fallbackSteps,
        fallbackOptions: ['web-search-expansion'],
        expectedDataSources: ['local documents'],
        confidenceLevel: 0.6
      };
    }
  }
  
  private normalizeAgentName(name: string): string {
    // Normalize common variations to correct agent names
    const normalizations: Record<string, string> = {
      'patternextractor': 'Extractor',
      'pattern-extractor': 'Extractor',
      'pattern_extractor': 'Extractor',
      'extractionagent': 'Extractor',
      'extraction': 'Extractor',
      'patterngenerator': 'PatternGenerator',
      'pattern-generator': 'PatternGenerator',
      'pattern_generator': 'PatternGenerator',
      'websearch': 'WebSearchAgent',
      'web-search': 'WebSearchAgent',
      'web_search': 'WebSearchAgent',
      'synthesis': 'Synthesizer',
      'synthesize': 'Synthesizer',
      'datainspector': 'DataInspector',
      'data-inspector': 'DataInspector',
      'data_inspector': 'DataInspector',
      'planningagent': 'PlanningAgent',
      'planning': 'PlanningAgent',
      'planner': 'PlanningAgent',
      // Fix LLM typo: DataAnalzyzer -> DataAnalyzer
      'dataanalzyzer': 'DataAnalyzer',
      'data-analzyzer': 'DataAnalyzer',
      'data_analzyzer': 'DataAnalyzer',
      'dataanalyzer': 'DataAnalyzer',
      'data-analyzer': 'DataAnalyzer',
      'data_analyzer': 'DataAnalyzer',
      'synthesiscoordinator': 'SynthesisCoordinator',
      'synthesis-coordinator': 'SynthesisCoordinator',
      'synthesis_coordinator': 'SynthesisCoordinator'
    };
    
    const normalized = normalizations[name.toLowerCase()] || name;
    return normalized;
  }

  private parseExecutionPlan(response: string): ExecutionPlan {
    // Multiple parsing attempts with increasing resilience
    const parsingAttempts = [
      // Attempt 1: Standard JSON parsing
      () => parseJsonWithResilience(response),
      
      // Attempt 2: Extract JSON block if wrapped in markdown
      () => {
        const jsonMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
        if (jsonMatch) {
          return parseJsonWithResilience(jsonMatch[1]);
        }
        throw new Error('No JSON block found');
      },
      
      // Attempt 3: Find first complete JSON object
      () => {
        const jsonStart = response.indexOf('{');
        const jsonEnd = response.lastIndexOf('}') + 1;
        if (jsonStart >= 0 && jsonEnd > jsonStart) {
          return parseJsonWithResilience(response.substring(jsonStart, jsonEnd));
        }
        throw new Error('No JSON object found');
      },
      
      // Attempt 4: Manual extraction from text
      () => this.extractPlanFromText(response)
    ];
    
    for (let i = 0; i < parsingAttempts.length; i++) {
      try {
        console.log(`🔄 PlanningAgent parsing attempt ${i + 1}/${parsingAttempts.length}`);
        const parsed = parsingAttempts[i]();
        
        // Normalize agent names in steps
        if (Array.isArray(parsed.steps)) {
          parsed.steps = parsed.steps.map((step: any) => ({
            ...step,
            agent: this.normalizeAgentName(step.agent || '')
          }));
        }
        
        // Validate and provide defaults
        const plan = {
          strategy: parsed.strategy || 'regex-extraction',
          steps: Array.isArray(parsed.steps) ? parsed.steps : [],
          fallbackOptions: Array.isArray(parsed.fallbackOptions) ? parsed.fallbackOptions : ['web-search'],
          expectedDataSources: Array.isArray(parsed.expectedDataSources) ? parsed.expectedDataSources : ['local documents'],
          confidenceLevel: typeof parsed.confidenceLevel === 'number' ? parsed.confidenceLevel : 0.7
        };
        
        console.log(`✅ Successfully parsed execution plan on attempt ${i + 1}`);
        return plan;
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`⚠️ Parsing attempt ${i + 1} failed:`, errorMessage);
        if (i === parsingAttempts.length - 1) {
          console.error('❌ All parsing attempts failed, using intelligent fallback');
          return this.createIntelligentFallback(response);
        }
      }
    }
    
    // This should never be reached due to fallback
    throw new Error('Failed to create execution plan');
  }
  
  private extractPlanFromText(response: string): any {
    console.log(`🔍 Attempting manual plan extraction from text response`);
    
    // Try to extract key information from text
    const strategy = this.extractStrategy(response);
    const steps = this.extractSteps(response);
    const fallbackOptions = this.extractFallbackOptions(response);
    const expectedDataSources = this.extractDataSources(response);
    const confidenceLevel = this.extractConfidence(response);
    
    return {
      strategy,
      steps,
      fallbackOptions,
      expectedDataSources,
      confidenceLevel
    };
  }
  
  private createIntelligentFallback(response: string): ExecutionPlan {
    console.log(`🤖 Creating intelligent fallback based on response content`);
    
    // Analyze response to create intelligent fallback
    const hasPatternMention = /pattern|regex|extract/i.test(response);
    const hasWebMention = /web|search|expand/i.test(response);
    
    const steps = [];
    
    // Always start with PatternGenerator for structured extraction
    steps.push({
      agent: 'PatternGenerator',
      action: 'create extraction patterns',
      reasoning: 'extract structured data from documents',
      expectedOutput: 'regex patterns for data extraction',
      priority: 'high' as const
    });
    
    // Add WebSearchAgent BEFORE Extractor for optimal data gathering (when needed)
    if (hasWebMention) {
      steps.push({
        agent: 'WebSearchAgent',
        action: 'expand knowledge base',
        reasoning: 'supplement local data with web information before extraction',
        expectedOutput: 'additional relevant information',
        priority: 'medium' as const
      });
    }
    
    // Add Extractor after WebSearchAgent so it can extract from all available data
    steps.push({
      agent: 'Extractor',
      action: 'extract using patterns',
      reasoning: 'get structured information from documents and web results',
      expectedOutput: 'extracted data items',
      priority: 'high' as const
    });
    
    // Always end with Synthesizer
    steps.push({
      agent: 'Synthesizer',
      action: 'create final answer',
      reasoning: 'combine all extracted data into user answer',
      expectedOutput: 'comprehensive final answer',
      priority: 'high' as const
    });
    
    return {
      strategy: hasPatternMention ? 'regex-extraction' : 'llm-analysis',
      steps: steps,
      fallbackOptions: ['web-search-expansion', 'direct-synthesis'],
      expectedDataSources: ['local documents'],
      confidenceLevel: 0.6 // Lower confidence for fallback
    };
  }
  
  private extractStrategy(text: string): string {
    if (/regex|pattern/i.test(text)) return 'regex-extraction';
    if (/web|search/i.test(text)) return 'web-expansion';
    if (/synthesis|direct/i.test(text)) return 'direct-synthesis';
    return 'regex-extraction';
  }
  
  private extractSteps(text: string): any[] {
    const steps = [];
    
    if (/patterngenerator|pattern/i.test(text)) {
      steps.push({
        agent: 'PatternGenerator',
        action: 'create patterns',
        reasoning: 'extract structured data',
        expectedOutput: 'regex patterns',
        priority: 'high' as const
      });
    }
    
    if (/extractor|extract/i.test(text)) {
      steps.push({
        agent: 'Extractor',
        action: 'extract data',
        reasoning: 'get information',
        expectedOutput: 'extracted items',
        priority: 'high' as const
      });
    }
    
    if (/websearch|web/i.test(text)) {
      steps.push({
        agent: 'WebSearchAgent',
        action: 'search web',
        reasoning: 'expand knowledge',
        expectedOutput: 'web results',
        priority: 'medium' as const
      });
    }
    
    if (/synthesizer|synthesis|final/i.test(text)) {
      steps.push({
        agent: 'Synthesizer',
        action: 'create answer',
        reasoning: 'combine data',
        expectedOutput: 'final answer',
        priority: 'high' as const
      });
    }
    
    return steps;
  }
  
  private extractFallbackOptions(text: string): string[] {
    const options = [];
    if (/web|search/i.test(text)) options.push('web-search-expansion');
    if (/synthesis|direct/i.test(text)) options.push('direct-synthesis');
    return options.length > 0 ? options : ['web-search-expansion'];
  }
  
  private extractDataSources(text: string): string[] {
    const sources = [];
    if (/local|document/i.test(text)) sources.push('local documents');
    if (/web|search/i.test(text)) sources.push('web search');
    if (/general|knowledge/i.test(text)) sources.push('general knowledge');
    return sources.length > 0 ? sources : ['local documents'];
  }
  
  private extractConfidence(text: string): number {
    const confMatch = text.match(/confidence[:\s]*(\d*\.?\d+)/i);
    if (confMatch) {
      const conf = parseFloat(confMatch[1]);
      return conf <= 1 ? conf : conf / 100; // Handle 80 vs 0.8
    }
    return 0.7; // Default confidence
  }
  
  private analyzeQueryType(query: string): string {
    const q = query.toLowerCase();
    if (q.includes('best') || q.includes('top') || q.includes('most')) return 'ranking';
    if (q.includes('compare') || q.includes('vs') || q.includes('difference')) return 'comparison';
    if (q.includes('how') || q.includes('what') || q.includes('why')) return 'information';
    if (q.includes('list') || q.includes('all')) return 'enumeration';
    return 'information';
  }
  
  private requiresRanking(query: string): boolean {
    return /\b(best|top|most|highest|lowest|first|greatest)\b/i.test(query);
  }
  
  private requiresComparison(query: string): boolean {
    return /\b(compare|vs|versus|difference|better|worse)\b/i.test(query);
  }
  
  private requiresSpecificPerson(query: string): boolean {
    // Check for possessive forms or names
    return /\b[A-Z][a-z]+'s\b|\b[A-Z][a-z]+\s+(project|work|achievement)\b/i.test(query);
  }
  
  private assessDataQuality(context: ResearchContext): string {
    if (!context.ragResults.chunks.length) return 'no-data';
    if (context.ragResults.chunks.length < 5) return 'limited';
    if (context.documentAnalysis?.documents && context.documentAnalysis.documents.length > 1) return 'multi-document';
    return 'sufficient';
  }
  
  private needsWebExpansion(context: ResearchContext): boolean {
    // Need web expansion if:
    // 1. No local documents
    // 2. Limited relevant documents 
    // 3. Query asks for information likely not in local KB
    if (!context.ragResults.chunks.length) return true;
    if (context.documentAnalysis?.documents && context.documentAnalysis.documents.length === 0) return true;
    
    const query = context.query.toLowerCase();
    const needsWebKeywords = ['latest', 'recent', 'current', 'news', 'trend', 'market'];
    return needsWebKeywords.some(keyword => query.includes(keyword));
  }

  /**
   * 🎯 CRITICAL: Create extraction strategy based on DataInspector analysis
   * This bridges DataInspector's findings with PatternGenerator's pattern creation
   */
  createExtractionStrategy(context: ResearchContext): ExtractionStrategy {
    console.log(`🎯 PlanningAgent: Creating extraction strategy from DataInspector analysis`);
    
    const documentAnalysis = context.sharedKnowledge.documentInsights;
    
    if (!documentAnalysis) {
      console.warn(`⚠️ No DataInspector analysis available, creating basic strategy`);
      return this.createBasicExtractionStrategy(context);
    }

    // Parse query intent from user query
    const queryIntent = this.parseQueryIntent(context.query);
    
    // Extract pattern categories from DataInspector's comprehensive analysis
    const patternCategories = this.extractPatternCategories(documentAnalysis, context);
    
    const strategy: ExtractionStrategy = {
      documentType: documentAnalysis.documentType || 'Generic Document',
      queryIntent: queryIntent,
      contentAreas: documentAnalysis.contentAreas || [],
      patternCategories: patternCategories,
      extractionTargets: this.determineExtractionTargets(documentAnalysis.documentType, queryIntent)
    };

    console.log(`✅ Created extraction strategy:`, {
      documentType: strategy.documentType,
      queryIntent: strategy.queryIntent,
      contentAreas: strategy.contentAreas.length,
      patternCategories: Object.keys(strategy.patternCategories).length,
      extractionTargets: strategy.extractionTargets.length
    });

    // Store strategy in shared knowledge for PatternGenerator to use
    context.sharedKnowledge.extractionStrategy = strategy;
    
    return strategy;
  }

  /**
   * 🔍 Monitor PatternGenerator quality - are patterns aligned with query and document analysis?
   */
  assessPatternQuality(context: ResearchContext): 'excellent' | 'good' | 'insufficient' | 'misaligned' {
    console.log(`🔍 PlanningAgent: Assessing pattern quality`);
    
    const patterns = context.patterns || [];
    const strategy = context.sharedKnowledge.extractionStrategy;
    
    if (patterns.length === 0) {
      console.warn(`❌ Pattern quality: insufficient - no patterns generated`);
      return 'insufficient';
    }

    if (!strategy) {
      console.warn(`⚠️ No extraction strategy available for pattern assessment`);
      return 'good'; // Assume reasonable if no strategy to compare against
    }

    // Check if patterns target the right categories based on extraction strategy
    const patternStrings = patterns.map(p => p.regexPattern || p.description || '').join(' ').toLowerCase();
    
    let categoryMatches = 0;
    let totalCategories = 0;
    
    // Check coverage of pattern categories from extraction strategy
    Object.entries(strategy.patternCategories).forEach(([category, terms]) => {
      if (terms.length > 0) {
        totalCategories++;
        const hasTerms = terms.some(term => 
          patternStrings.includes(term.toLowerCase()) || 
          patternStrings.includes(term.toLowerCase().replace(/\s+/g, ''))
        );
        if (hasTerms) categoryMatches++;
      }
    });

    // Check query alignment
    const queryTerms = context.query.toLowerCase().split(/\s+/);
    const queryAlignment = queryTerms.some(term => 
      term.length > 3 && patternStrings.includes(term)
    );

    console.log(`📊 Pattern quality assessment:`, {
      patternCount: patterns.length,
      categoryMatches: categoryMatches,
      totalCategories: totalCategories,
      categoryAlignment: totalCategories > 0 ? (categoryMatches / totalCategories) : 0,
      queryAlignment: queryAlignment
    });

    if (categoryMatches === 0 && !queryAlignment) {
      console.warn(`❌ Pattern quality: misaligned - patterns don't match document analysis or query`);
      return 'misaligned';
    }

    if (totalCategories > 0) {
      const alignmentRatio = categoryMatches / totalCategories;
      if (alignmentRatio >= 0.7) {
        console.log(`✅ Pattern quality: excellent - ${Math.round(alignmentRatio * 100)}% alignment`);
        return 'excellent';
      } else if (alignmentRatio >= 0.4) {
        console.log(`✅ Pattern quality: good - ${Math.round(alignmentRatio * 100)}% alignment`);
        return 'good';
      }
    }

    console.warn(`❌ Pattern quality: insufficient - low alignment with extraction strategy`);
    return 'insufficient';
  }

  /**
   * 🔍 Monitor Extractor success - did patterns actually extract relevant data?
   */
  assessExtractionSuccess(context: ResearchContext): { success: boolean, quality: 'excellent' | 'good' | 'poor' | 'empty', reason: string } {
    console.log(`🔍 PlanningAgent: Assessing extraction success`);
    
    const extractedData = context.extractedData?.raw || [];
    const strategy = context.sharedKnowledge.extractionStrategy;
    
    if (extractedData.length === 0) {
      console.warn(`❌ Extraction failed: no data extracted`);
      return { success: false, quality: 'empty', reason: 'No data extracted from documents' };
    }

    // Check if extracted data contains query-relevant information
    const queryTerms = context.query.toLowerCase().split(/\s+/);
    const extractedText = extractedData.map(item => item.text || '').join(' ').toLowerCase();
    
    const queryRelevance = queryTerms.filter(term => 
      term.length > 3 && extractedText.includes(term)
    ).length / Math.max(queryTerms.filter(term => term.length > 3).length, 1);

    // Check if extracted data contains strategy-specific terms
    let strategyRelevance = 0;
    if (strategy) {
      const allStrategyTerms = [
        ...strategy.patternCategories.people,
        ...strategy.patternCategories.methods,
        ...strategy.patternCategories.concepts,
        ...strategy.patternCategories.data
      ].filter(term => term.length > 2);
      
      if (allStrategyTerms.length > 0) {
        strategyRelevance = allStrategyTerms.filter(term => 
          extractedText.includes(term.toLowerCase())
        ).length / allStrategyTerms.length;
      }
    }

    console.log(`📊 Extraction success assessment:`, {
      itemCount: extractedData.length,
      queryRelevance: Math.round(queryRelevance * 100) + '%',
      strategyRelevance: Math.round(strategyRelevance * 100) + '%'
    });

    // Determine quality based on relevance scores
    if (queryRelevance >= 0.6 || strategyRelevance >= 0.4) {
      console.log(`✅ Extraction success: excellent quality`);
      return { success: true, quality: 'excellent', reason: 'High relevance to query and strategy' };
    } else if (queryRelevance >= 0.3 || strategyRelevance >= 0.2) {
      console.log(`✅ Extraction success: good quality`);
      return { success: true, quality: 'good', reason: 'Moderate relevance to query and strategy' };
    } else if (extractedData.length >= 3) {
      console.warn(`⚠️ Extraction success: poor quality - data exists but low relevance`);
      return { success: false, quality: 'poor', reason: 'Extracted data has low relevance to query' };
    } else {
      console.warn(`❌ Extraction success: poor quality - insufficient relevant data`);
      return { success: false, quality: 'poor', reason: 'Insufficient relevant data extracted' };
    }
  }

  /**
   * 🔄 Re-engage PatternGenerator with refined strategy when extraction fails
   */
  async reEngagePatternGenerator(context: ResearchContext, orchestrator: any): Promise<void> {
    console.log(`🔄 PlanningAgent: Re-engaging PatternGenerator with refined strategy`);
    
    // Create refined extraction strategy
    const currentStrategy = context.sharedKnowledge.extractionStrategy;
    const refinedStrategy = this.refineExtractionStrategy(currentStrategy, context);
    
    console.log(`🎯 Refined extraction strategy:`, {
      changes: this.getStrategyChanges(currentStrategy, refinedStrategy),
      newPatternCategories: Object.keys(refinedStrategy.patternCategories).length
    });
    
    // Update strategy in shared knowledge
    context.sharedKnowledge.extractionStrategy = refinedStrategy;
    
    // Re-run PatternGenerator with refined strategy
    console.log(`🔄 Re-running PatternGenerator with refined strategy...`);
    try {
      await orchestrator.runSingleAgent('PatternGenerator', context);
      console.log(`✅ PatternGenerator re-engagement completed`);
      
      // Assess new pattern quality
      const newPatternQuality = this.assessPatternQuality(context);
      console.log(`📊 New pattern quality: ${newPatternQuality}`);
      
    } catch (error) {
      console.error(`❌ PatternGenerator re-engagement failed:`, error);
      throw new Error(`Failed to re-engage PatternGenerator: ${error}`);
    }
  }

  // Helper methods for extraction strategy creation and refinement
  
  private createBasicExtractionStrategy(context: ResearchContext): ExtractionStrategy {
    const queryIntent = this.parseQueryIntent(context.query);
    
    return {
      documentType: 'Generic Document',
      queryIntent: queryIntent,
      contentAreas: [],
      patternCategories: {
        people: [],
        roles: [],
        designations: [],
        concepts: this.extractBasicConcepts(context.query),
        methods: [],
        data: queryIntent.includes('performance') ? ['metrics', 'results', 'scores'] : []
      },
      extractionTargets: ['content', 'key_information']
    };
  }

  private parseQueryIntent(query: string): string {
    const q = query.toLowerCase();
    
    if (q.includes('best') || q.includes('top')) return 'performance_ranking';
    if (q.includes('method') || q.includes('approach')) return 'methodology';
    if (q.includes('how') || q.includes('what')) return 'explanation';
    if (q.includes('compare')) return 'comparison';
    if (q.includes('performance') || q.includes('result')) return 'performance';
    
    return 'general_information';
  }

  private extractPatternCategories(documentInsights: any, context: ResearchContext): any {
    // Extract from DataInspector's comprehensive analysis
    const categories = {
      people: documentInsights.people || [],
      roles: [], // Could be extracted from people context
      designations: [], // Could be extracted from people context  
      concepts: documentInsights.concepts || [],
      methods: documentInsights.methods || [],
      data: []
    };

    // Add query-specific terms to relevant categories
    const queryTerms = context.query.toLowerCase().split(/\s+/);
    queryTerms.forEach(term => {
      if (term.length > 3 && !['best', 'method', 'approach', 'what', 'how'].includes(term)) {
        if (!categories.concepts.includes(term)) {
          categories.concepts.push(term);
        }
      }
    });

    return categories;
  }

  private determineExtractionTargets(documentType: string, queryIntent: string): string[] {
    const targets = ['content'];
    
    if (documentType === 'Research Paper') {
      targets.push('abstract', 'methodology', 'results', 'conclusions');
      
      if (queryIntent.includes('performance')) {
        targets.push('performance_metrics', 'benchmarks');
      }
      if (queryIntent.includes('methodology')) {
        targets.push('algorithms', 'approaches');
      }
    } else if (documentType === 'Tutorial') {
      targets.push('steps', 'instructions', 'examples');
    } else if (documentType === 'Resume') {
      targets.push('experience', 'skills', 'projects', 'achievements');
    }
    
    return targets;
  }

  private refineExtractionStrategy(currentStrategy: ExtractionStrategy, context: ResearchContext): ExtractionStrategy {
    if (!currentStrategy) {
      return this.createExtractionStrategy(context);
    }

    // Create a more focused strategy based on what failed
    const refined = { ...currentStrategy };
    
    // Add more specific terms based on document content
    const sampleContent = context.ragResults.chunks.slice(0, 3)
      .map(chunk => chunk.text)
      .join(' ')
      .toLowerCase();
    
    // Extract additional technical terms from actual content
    const technicalTerms = sampleContent.match(/\b[A-Z]{2,}\b|\b\w*(?:algorithm|method|approach|technique)\w*\b/gi) || [];
    refined.patternCategories.methods.push(...technicalTerms.slice(0, 5));
    
    console.log(`🎯 Strategy refinement added ${technicalTerms.length} technical terms`);
    
    return refined;
  }

  private getStrategyChanges(oldStrategy: ExtractionStrategy, newStrategy: ExtractionStrategy): string[] {
    if (!oldStrategy) return ['Created new strategy'];
    
    const changes = [];
    if (oldStrategy.queryIntent !== newStrategy.queryIntent) {
      changes.push(`Query intent: ${oldStrategy.queryIntent} → ${newStrategy.queryIntent}`);
    }
    
    const oldMethodCount = oldStrategy.patternCategories.methods.length;
    const newMethodCount = newStrategy.patternCategories.methods.length;
    if (oldMethodCount !== newMethodCount) {
      changes.push(`Methods: ${oldMethodCount} → ${newMethodCount}`);
    }
    
    return changes.length > 0 ? changes : ['Minor refinements'];
  }

  private extractBasicConcepts(query: string): string[] {
    return query.toLowerCase()
      .split(/\s+/)
      .filter(term => term.length > 3 && !['best', 'method', 'what', 'how', 'give', 'explanation'].includes(term))
      .slice(0, 5);
  }
}