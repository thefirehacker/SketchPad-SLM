/**
 * Multi-Agent System Entry Point
 * 
 * Exports all components and provides factory functions
 */

// Core imports
import { Orchestrator } from './core/Orchestrator';
import { AgentRegistry } from './core/AgentRegistry';
import { MessageBus } from './core/MessageBus';

// Agent imports
import { QueryPlannerAgent } from './agents/QueryPlannerAgent';
import { DataInspectorAgent } from './agents/DataInspectorAgent';
import { PlanningAgent } from './agents/PlanningAgent';
import { PatternGeneratorAgent } from './agents/PatternGeneratorAgent';
import { ExtractionAgent } from './agents/ExtractionAgent';
import { WebSearchAgent } from './agents/WebSearchAgent';
import { SynthesisAgent } from './agents/SynthesisAgent';
import { ResponseFormatterAgent } from './agents/ResponseFormatterAgent';
// New multi-synthesis agents
import { DataAnalysisAgent } from './agents/DataAnalysisAgent';
import { SynthesisCoordinator } from './agents/SynthesisCoordinator';

// Core exports
export { Orchestrator } from './core/Orchestrator';
export { AgentRegistry } from './core/AgentRegistry';
export { MessageBus } from './core/MessageBus';

// Interface exports
export type { Agent } from './interfaces/Agent';
export { BaseAgent } from './interfaces/Agent';
export type { 
  ResearchContext, 
  ChunkData, 
  Understanding, 
  Pattern, 
  ExtractedItem, 
  Synthesis,
  AgentMessage 
} from './interfaces/Context';
export { createInitialContext } from './interfaces/Context';
export { MessageType } from './interfaces/Message';
export type { Message, Priority, MessageContent } from './interfaces/Message';
export { createMessage } from './interfaces/Message';

// Agent exports
export { QueryPlannerAgent } from './agents/QueryPlannerAgent';
export { DataInspectorAgent } from './agents/DataInspectorAgent';
export { PlanningAgent } from './agents/PlanningAgent';
export { PatternGeneratorAgent } from './agents/PatternGeneratorAgent';
export { ExtractionAgent } from './agents/ExtractionAgent';
export { WebSearchAgent } from './agents/WebSearchAgent';
export { SynthesisAgent } from './agents/SynthesisAgent';
export { ResponseFormatterAgent } from './agents/ResponseFormatterAgent';
export { DataAnalysisAgent } from './agents/DataAnalysisAgent';
export { SynthesisCoordinator } from './agents/SynthesisCoordinator';

// Factory function
export function createMultiAgentSystem(
  llm: (prompt: string) => Promise<string>, 
  progressCallback?: import('./interfaces/AgentProgress').AgentProgressCallback,
  vectorStore?: import('../../components/VectorStore/VectorStore').VectorStore,
  config?: { enableWebSearch?: boolean; enableRAGSearch?: boolean }
) {
  // Create core components
  const registry = new AgentRegistry();
  const messageBus = new MessageBus();
  
  // Build list of available agents based on configuration
  const availableAgents = ['QueryPlanner', 'DataInspector', 'PatternGenerator', 'Extractor', 'DataAnalyzer', 'SynthesisCoordinator', 'ResponseFormatter'];
  if (config?.enableWebSearch !== false) {
    availableAgents.splice(4, 0, 'WebSearchAgent'); // Insert WebSearchAgent before DataAnalyzer
  }
  
  // Register all agents in new intelligent architecture order
  registry.register(new QueryPlannerAgent(llm));
  registry.register(new DataInspectorAgent(llm, progressCallback)); // Magic document filtering with progress reporting
  registry.register(new PlanningAgent(llm, availableAgents, progressCallback)); // NEW: Intelligent execution strategy with available agents and progress tracking
  registry.register(new PatternGeneratorAgent(llm, progressCallback));
  registry.register(new ExtractionAgent(llm));
  
  // Only register WebSearchAgent if web search is enabled
  if (config?.enableWebSearch !== false) { // Default to enabled unless explicitly disabled
    registry.register(new WebSearchAgent(llm, vectorStore, config)); // Knowledge base expansion with config
  } else {
    console.log('🌐 WebSearchAgent disabled by configuration');
  }
  
  // Register new multi-synthesis agents
  registry.register(new DataAnalysisAgent(llm)); // Clean and categorize data
  registry.register(new SynthesisCoordinator(llm)); // Coordinate synthesis pipeline
  
  // Keep original SynthesisAgent as fallback for now
  registry.register(new SynthesisAgent(llm));
  registry.register(new ResponseFormatterAgent(llm, progressCallback)); // Ensure direct question answering with good formatting
  
  // Create and return orchestrator with progress callback and config
  return new Orchestrator(registry, messageBus, llm, progressCallback, config);
}