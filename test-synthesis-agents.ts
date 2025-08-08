/**
 * Test script for the new multi-synthesis agents
 */

import { DataAnalysisAgent } from './src/lib/multi-agent/agents/DataAnalysisAgent';
import { SynthesisCoordinator } from './src/lib/multi-agent/agents/SynthesisCoordinator';
import { createInitialContext } from './src/lib/multi-agent/interfaces/Context';

// Simple mock LLM
const mockLLM = async (prompt: string): Promise<string> => {
  console.log('🤖 LLM called with:', prompt.substring(0, 100) + '...');
  
  if (prompt.includes('Classify these items')) {
    return 'current\nhistorical\ncurrent\nhistorical\nother';
  }
  
  if (prompt.includes('create a comprehensive answer')) {
    return `Based on the analyzed data:
    
Top 3 fastest speed runs:
1. Logit Soft-capping at 30 - 4.01 hours (current record)
2. Dataloading tweaks - 4.26 hours  
3. Muon optimizer - 4.53 hours

These represent the fastest completion times from Tyler's blog progress table.`;
  }
  
  return 'Mock response';
};

async function testNewAgents() {
  console.log('🧪 Testing new synthesis agents...\n');
  
  // Create test context with some extracted data
  const context = createInitialContext('Find the top 3 fastest speed runs', []);
  
  // Simulate extracted data from Extractor
  context.extractedData = {
    raw: [
      {
        content: 'Initial baseline',
        value: 8.13,
        unit: 'hours',
        context: 'Run #1 from progress table',
        confidence: 0.9,
        sourceChunkId: 'chunk-1'
      },
      {
        content: 'Architectural changes',
        value: 7.51,
        unit: 'hours',
        context: 'Run #2 from progress table',
        confidence: 0.9,
        sourceChunkId: 'chunk-2'
      },
      {
        content: 'Muon optimizer',
        value: 4.53,
        unit: 'hours',
        context: 'Run #3 from progress table',
        confidence: 0.9,
        sourceChunkId: 'chunk-3'
      },
      {
        content: 'Dataloading tweaks',
        value: 4.26,
        unit: 'hours',
        context: 'Run #4 from progress table',
        confidence: 0.9,
        sourceChunkId: 'chunk-4'
      },
      {
        content: 'Logit Soft-capping at 30',
        value: 4.01,
        unit: 'hours',
        context: 'Run #5 from progress table - current record',
        confidence: 0.95,
        sourceChunkId: 'chunk-5'
      }
    ],
    structured: []
  };
  
  console.log('📊 Initial data: ', context.extractedData.raw.length, 'items\n');
  
  // Test DataAnalysisAgent
  console.log('=== Testing DataAnalysisAgent ===');
  const dataAnalyzer = new DataAnalysisAgent(mockLLM);
  const analyzedContext = await dataAnalyzer.process(context);
  
  console.log('✅ DataAnalyzer Results:');
  console.log('  - Cleaned items:', analyzedContext.analyzedData?.cleaned.length);
  console.log('  - Categories:', analyzedContext.analyzedData?.categorized.length);
  console.log('  - Insights:', analyzedContext.analyzedData?.insights);
  console.log('  - Reasoning:', dataAnalyzer.explainReasoning());
  console.log('');
  
  // Test SynthesisCoordinator
  console.log('=== Testing SynthesisCoordinator ===');
  const coordinator = new SynthesisCoordinator(mockLLM);
  const finalContext = await coordinator.process(analyzedContext);
  
  console.log('✅ SynthesisCoordinator Results:');
  console.log('  - Final answer length:', finalContext.synthesis.answer.length, 'chars');
  console.log('  - Confidence:', finalContext.synthesis.confidence);
  console.log('  - Reasoning:', coordinator.explainReasoning());
  console.log('');
  
  console.log('📝 Final Answer:');
  console.log(finalContext.synthesis.answer);
  console.log('');
  
  // Check token counts (approximate)
  const dataAnalyzerPromptEstimate = 300; // Simplified prompts
  const coordinatorPromptEstimate = 400; // Assembly logic
  const totalEstimate = dataAnalyzerPromptEstimate + coordinatorPromptEstimate;
  
  console.log('📊 Token Usage Estimate:');
  console.log(`  - DataAnalyzer: ~${dataAnalyzerPromptEstimate} tokens`);
  console.log(`  - SynthesisCoordinator: ~${coordinatorPromptEstimate} tokens`);
  console.log(`  - Total: ~${totalEstimate} tokens (vs 4489 for old SynthesisAgent)`);
  console.log(`  - Reduction: ${Math.round((1 - totalEstimate/4489) * 100)}%`);
}

// Run the test
testNewAgents().catch(console.error);