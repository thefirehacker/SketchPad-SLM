import React, { useState, useCallback } from "react";
import {
  VectorStore,
  SearchResult,
  DocumentType,
} from "@/components/VectorStore/VectorStore";
import { useOllamaConnection } from "./useOllamaConnection";
import {
  getUnifiedWebSearchService,
  UnifiedWebSearchContext as WebSearchContext,
  UnifiedWebSearchOptions as WebSearchOptions,
} from "@/lib/UnifiedWebSearchService";
import { ResearchOrchestrator, ResearchResult, ResearchUtils } from "@/lib/ResearchOrchestrator";
import { queryIntelligenceService } from "@/lib/QueryIntelligenceService";
import { ResearchStep, useResearchSteps } from "@/components/DeepResearch/components/ResearchSteps";

export type ResearchType =
  | "deep-research"
  | "social"
  | "finance"
  | "academic"
  | "technical"
  | "market";

export interface ResearchConfig {
  type: ResearchType;
  depth: "quick" | "detailed" | "comprehensive";
  includeRAG?: boolean;
  includeWebSearch?: boolean;
  webSearchOptions?: WebSearchOptions;
}

// Simplified RAG types (no longer dependent on RAGService)
export interface RAGDocument {
  id: string;
  title: string;
  similarity: number;
  chunkContent: string;
  chunkIndex: number;
  source: string;
  metadata: {
    filename: string;
    filetype: string;
    uploadedAt: string;
    description: string;
  };
  retrievalContext: {
    queryId: string;
    retrievalTime: number;
    processingTime: number;
  };
}

export interface RAGContext {
  query: string;
  relevantDocuments: RAGDocument[];
  searchResults: SearchResult[];
  contextText: string;
  metadata: {
    searchTime: number;
    documentCount: number;
    chunkCount: number;
    averageSimilarity: number;
    searchThreshold: number;
  };
}

export interface RAGSearchOptions {
  threshold?: number;
  limit?: number;
  includeMetadata?: boolean;
  maxContextLength?: number;
  searchType?: "semantic" | "hybrid" | "keyword";
  agentId?: string;
  sessionId?: string;
}

export interface UseResearchReturn {
  prompt: string;
  setPrompt: (prompt: string) => void;
  researchConfig: ResearchConfig;
  setResearchConfig: (config: ResearchConfig) => void;
  isGenerating: boolean;
  results: string;
  thinkingOutput: string;
  isStreaming: boolean;
  connectionState: any;
  connectAI: (baseURL: string, model?: string) => Promise<boolean>;
  disconnectAI: () => void;
  testConnection: (
    baseURL: string
  ) => Promise<{ success: boolean; models: string[] }>;
  isAIReady: boolean;

  // RAG Integration
  ragContext: RAGContext | null;
  isRAGSearching: boolean;
  performRAGSearch: (
    query: string,
    options?: RAGSearchOptions
  ) => Promise<RAGContext | null>;
  clearRAGContext: () => void;

  // Web Search Integration
  webSearchContext: WebSearchContext | null;
  isWebSearching: boolean;
  performWebSearch: (
    query: string,
    options?: WebSearchOptions
  ) => Promise<WebSearchContext | null>;
  clearWebSearchContext: () => void;

  // Actions
  generateResearch: () => Promise<void>;
  generateResearchStream: () => Promise<void>;
  generateResearchWithRAG: (ragContext?: RAGContext) => Promise<void>;
  generateResearchWithContext: (
    ragContext?: RAGContext,
    webContext?: WebSearchContext
  ) => Promise<void>;
  updateResults: (newContent: string) => void;
  clearResults: () => void;

  // Intelligent Research Integration
  researchSteps: ResearchStep[];
  isIntelligentResearching: boolean;
  researchResult: ResearchResult | null;
  expandedSteps: Set<string>;
  performIntelligentResearch: (query: string) => Promise<void>;
  handleStepClick: (step: ResearchStep) => void;
  clearResearchSteps: () => void;
  rerunSynthesis: () => Promise<void>;
}

export function useResearch(
  vectorStore: VectorStore | null
): UseResearchReturn {
  const [prompt, setPrompt] = useState("");
  const [researchConfig, setResearchConfig] = useState<ResearchConfig>({
    type: "deep-research",
    depth: "detailed",
    includeRAG: true,
    includeWebSearch: false,
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [results, setResults] = useState("");
  const [thinkingOutput, setThinkingOutput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  // RAG State
  const [ragContext, setRagContext] = useState<RAGContext | null>(null);
  const [isRAGSearching, setIsRAGSearching] = useState(false);

  // Web Search State
  const [webSearchContext, setWebSearchContext] =
    useState<WebSearchContext | null>(null);
  const [isWebSearching, setIsWebSearching] = useState(false);

  // Intelligent Research State
  const [isIntelligentResearching, setIsIntelligentResearching] = useState(false);
  const [researchResult, setResearchResult] = useState<ResearchResult | null>(null);
  const researchStepsState = useResearchSteps();

  // Use the robust Ollama connection hook
  const {
    connectionState,
    connect,
    disconnect,
    testConnection,
    generateContent,
    generateContentStream,
    isReady: isAIReady,
  } = useOllamaConnection();

  // Web Search Service
  const webSearchService = getUnifiedWebSearchService();

  // Research Orchestrator - React to configuration changes
  const researchOrchestrator = React.useMemo(() => {
    const orchestrator = ResearchUtils.createOrchestrator(
      vectorStore,
      webSearchService,
      {
        enableRAGSearch: researchConfig.includeRAG,
        enableWebSearch: researchConfig.includeWebSearch,
        maxSteps: 6,
        adaptiveStrategy: true
      }
    );
    
    // Configure orchestrator with LLM
    if (generateContent) {
      orchestrator.setContentGenerator(generateContent);
    }
    
    return orchestrator;
  }, [vectorStore, webSearchService, researchConfig.includeRAG, researchConfig.includeWebSearch, generateContent]);

  // Configure query intelligence service with LLM
  React.useEffect(() => {
    if (generateContent) {
      queryIntelligenceService.configureLLM(generateContent);
    }
  }, [generateContent]);

  // Helper function to convert SearchResult to RAGDocument
  const convertToRAGDocument = (
    result: SearchResult,
    queryId: string,
    searchTime: number
  ): RAGDocument => ({
    id: result.document.id,
    title: result.document.title,
    similarity: result.similarity,
    chunkContent: result.chunk.content,
    chunkIndex: parseInt(result.chunk.id.split("_").pop() || "0"),
    source: result.document.metadata?.source || "unknown",
    metadata: {
      filename: result.document.metadata?.filename || "unknown",
      filetype: result.document.metadata?.filetype || "unknown",
      uploadedAt:
        result.document.metadata?.uploadedAt || new Date().toISOString(),
      description:
        result.document.metadata?.description || "Document from knowledge base",
    },
    retrievalContext: {
      queryId,
      retrievalTime: searchTime,
      processingTime: searchTime,
    },
  });

  // Helper function to generate context text
  const generateContextText = (
    documents: RAGDocument[],
    maxLength: number
  ): string => {
    const chunks = documents
      .sort((a, b) => b.similarity - a.similarity)
      .map((doc) => doc.chunkContent);

    let contextText = "";
    let currentLength = 0;

    for (const chunk of chunks) {
      if (currentLength + chunk.length > maxLength) {
        break;
      }
      contextText += chunk + "\n\n";
      currentLength += chunk.length + 2;
    }

    return contextText.trim();
  };

  // RAG Search functionality using VectorStore directly
  const performRAGSearch = useCallback(
    async (
      query: string,
      options: RAGSearchOptions = {}
    ): Promise<RAGContext | null> => {
      if (!vectorStore) {
        console.warn("VectorStore not available");
        return null;
      }

      setIsRAGSearching(true);
      const startTime = Date.now();
      const queryId = `rag_${Date.now()}`;

      try {
        const {
          threshold = 0.1,
          limit = 15,
          maxContextLength = 5000,
          agentId,
          sessionId,
        } = options;

        // Perform semantic search using VectorStore directly - ONLY USERDOCS for clean base analysis
        const searchResults = await vectorStore.searchSimilar(
          query,
          threshold,
          limit,
          {
            agentId,
            sessionId,
            queryType: "agent_rag",
            documentTypes: ["userdocs"], // CRITICAL: Only search user uploaded documents to prevent contamination
          }
        );

        const searchTime = Date.now() - startTime;

        // Convert to RAG documents
        const relevantDocuments: RAGDocument[] = searchResults.map((result) =>
          convertToRAGDocument(result, queryId, searchTime)
        );

        // Generate context text
        const contextText = generateContextText(
          relevantDocuments,
          maxContextLength
        );

        // Calculate metadata
        const averageSimilarity =
          relevantDocuments.length > 0
            ? relevantDocuments.reduce((sum, doc) => sum + doc.similarity, 0) /
              relevantDocuments.length
            : 0;

        const context: RAGContext = {
          query,
          relevantDocuments,
          searchResults,
          contextText,
          metadata: {
            searchTime,
            documentCount: new Set(relevantDocuments.map((d) => d.id)).size,
            chunkCount: relevantDocuments.length,
            averageSimilarity,
            searchThreshold: threshold,
          },
        };

        setRagContext(context);
        console.log(
          `🔍 RAG Search completed: ${context.metadata.documentCount} documents found`
        );
        return context;
      } catch (error) {
        console.error("RAG search failed:", error);
        return null;
      } finally {
        setIsRAGSearching(false);
      }
    },
    [vectorStore]
  );

  const clearRAGContext = useCallback(() => {
    setRagContext(null);
  }, []);

  // Web Search functionality
  const performWebSearch = useCallback(
    async (
      query: string,
      options: WebSearchOptions = {}
    ): Promise<WebSearchContext | null> => {
      if (!webSearchService) {
        console.warn("Web search service not available");
        return null;
      }

      setIsWebSearching(true);
      try {
        const context = await webSearchService.searchWeb(query, {
          limit: 5,
          ...options,
        });

        setWebSearchContext(context);
        console.log(
          `🌐 Web Search completed: ${context.metadata.resultCount} results found`
        );
        return context;
      } catch (error) {
        console.error("Web search failed:", error);
        return null;
      } finally {
        setIsWebSearching(false);
      }
    },
    [webSearchService]
  );

  const clearWebSearchContext = useCallback(() => {
    setWebSearchContext(null);
  }, []);

  const generateResearch = useCallback(async () => {
    if (!prompt.trim() || !isAIReady) {
      return;
    }

    setIsGenerating(true);
    setIsStreaming(true);
    setThinkingOutput("");
    setResults("");

    try {
      // Automatically perform RAG search if enabled and vectorStore is available
      let context: RAGContext | undefined = ragContext || undefined;
      if (!context && researchConfig.includeRAG && vectorStore) {
        setThinkingOutput(
          "🔍 Searching knowledge base for relevant context..."
        );
        try {
          const searchResult = await performRAGSearch(prompt, {
            threshold: 0.1,
            limit: 15,
            maxContextLength: 5000,
          });
          context = searchResult || undefined;

          if (context && context.relevantDocuments.length > 0) {
            setThinkingOutput(
              `📚 Found ${context.metadata.documentCount} relevant documents with ${context.metadata.chunkCount} chunks. Generating enhanced research...`
            );
          } else {
            setThinkingOutput(
              "📝 No relevant documents found in knowledge base. Generating general research..."
            );
          }
        } catch (error) {
          console.error(
            "RAG search failed, continuing without context:",
            error
          );
          setThinkingOutput(
            "⚠️ Knowledge base search failed. Generating general research..."
          );
        }
      } else if (!researchConfig.includeRAG) {
        setThinkingOutput(
          "📝 Generating research without knowledge base (disabled)..."
        );
      } else if (!vectorStore) {
        setThinkingOutput("📝 Generating research without knowledge base...");
      }

      // Automatically perform web search if webSearchService is available
      let webContext: WebSearchContext | undefined =
        webSearchContext || undefined;
      if (!webContext && webSearchService && researchConfig.includeWebSearch) {
        const availableProviders = webSearchService.getAvailableProviders();

        console.log(
          "🔍 useResearch: Performing web search (generateResearch)",
          {
            hasWebContext: !!webContext,
            hasWebSearchService: !!webSearchService,
            includeWebSearch: researchConfig.includeWebSearch,
            availableProviders,
          }
        );

        if (availableProviders.duckduckgo || availableProviders.firecrawl) {
          setThinkingOutput("🌐 Searching the web for additional context...");
          try {
            const webSearchResult = await performWebSearch(prompt, {
              limit: 5,
            });
            webContext = webSearchResult || undefined;

            if (webContext && webContext.results.length > 0) {
              const providerText =
                webContext.metadata.providers.length > 1
                  ? `${webContext.metadata.providers.join(" + ")}`
                  : webContext.metadata.providers[0];
              setThinkingOutput(
                `🌐 Found ${webContext.metadata.resultCount} web results from ${webContext.metadata.domains.length} domains (via ${providerText}). Generating enhanced research...`
              );
            }
          } catch (error) {
            console.error(
              "Web search failed, continuing without context:",
              error
            );
            setThinkingOutput(
              "⚠️ Web search failed. Generating general research..."
            );
          }
        } else {
          setThinkingOutput(
            "📝 No web search providers available. Generating research without web context..."
          );
        }
      } else {
        console.log("🔍 useResearch: Web search skipped (generateResearch)", {
          hasWebContext: !!webContext,
          hasWebSearchService: !!webSearchService,
          includeWebSearch: researchConfig.includeWebSearch,
        });
        if (!webSearchService) {
          setThinkingOutput("📝 Generating research without web search...");
        }
      }

      const researchPrompt = buildResearchPrompt(
        prompt,
        researchConfig,
        vectorStore,
        context,
        webContext
      );

      // Simulate thinking process
      setThinkingOutput(
        (context && context.relevantDocuments.length > 0) ||
          (webContext && webContext.results.length > 0)
          ? "🚀 Analyzing your research request with knowledge base and web context..."
          : "🚀 Analyzing your research request..."
      );

      const response = await generateContent(researchPrompt);

      if (response && typeof response === "string") {
        setResults(response);
        setThinkingOutput(
          (context && context.relevantDocuments.length > 0) ||
            (webContext && webContext.results.length > 0)
            ? "✅ Research completed successfully with knowledge base and web context!"
            : "✅ Research completed successfully!"
        );
      }
    } catch (error) {
      console.error("Research generation failed:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      setResults(
        `Failed to generate research: ${errorMessage}\n\nPlease check your Ollama connection and try again.`
      );
      setThinkingOutput("❌ Research generation failed. Please try again.");
    } finally {
      setIsGenerating(false);
      setIsStreaming(false);
    }
  }, [
    prompt,
    researchConfig,
    vectorStore,
    ragContext,
    performRAGSearch,
    webSearchContext,
    webSearchService,
    performWebSearch,
    isAIReady,
    generateContent,
  ]);

  const generateResearchStream = useCallback(async () => {
    if (!prompt.trim() || !isAIReady) {
      return;
    }

    setIsGenerating(true);
    setIsStreaming(true);
    setThinkingOutput("");
    setResults("");

    try {
      // Automatically perform RAG search if enabled and vectorStore is available
      let context: RAGContext | undefined = ragContext || undefined;
      if (!context && researchConfig.includeRAG && vectorStore) {
        setThinkingOutput(
          "🔍 Searching knowledge base for relevant context..."
        );
        try {
          const searchResult = await performRAGSearch(prompt, {
            threshold: 0.1,
            limit: 15,
            maxContextLength: 5000,
          });
          context = searchResult || undefined;

          if (context && context.relevantDocuments.length > 0) {
            setThinkingOutput(
              `📚 Found ${context.metadata.documentCount} relevant documents with ${context.metadata.chunkCount} chunks. Generating enhanced research...`
            );
          } else {
            setThinkingOutput(
              "📝 No relevant documents found in knowledge base. Generating general research..."
            );
          }
        } catch (error) {
          console.error(
            "RAG search failed, continuing without context:",
            error
          );
          setThinkingOutput(
            "⚠️ Knowledge base search failed. Generating general research..."
          );
        }
      } else if (!researchConfig.includeRAG) {
        setThinkingOutput(
          "📝 Generating research without knowledge base (disabled)..."
        );
      } else if (!vectorStore) {
        setThinkingOutput("📝 Generating research without knowledge base...");
      }

      // Automatically perform web search if webSearchService is available
      let webContext: WebSearchContext | undefined =
        webSearchContext || undefined;
      if (!webContext && webSearchService && researchConfig.includeWebSearch) {
        console.log(
          "🔍 useResearch: Performing web search (generateResearchStream)",
          {
            hasWebContext: !!webContext,
            hasWebSearchService: !!webSearchService,
            includeWebSearch: researchConfig.includeWebSearch,
          }
        );
        setThinkingOutput("🌐 Searching the web for additional context...");
        try {
          const webSearchResult = await performWebSearch(prompt, {
            limit: 5,
          });
          webContext = webSearchResult || undefined;
        } catch (error) {
          console.error(
            "Web search failed, continuing without context:",
            error
          );
          setThinkingOutput(
            "⚠️ Web search failed. Generating general research..."
          );
        }
      } else {
        console.log(
          "🔍 useResearch: Web search skipped (generateResearchStream)",
          {
            hasWebContext: !!webContext,
            hasWebSearchService: !!webSearchService,
            includeWebSearch: researchConfig.includeWebSearch,
          }
        );
        if (!webSearchService) {
          setThinkingOutput("📝 Generating research without web search...");
        }
      }

      const researchPrompt = buildResearchPrompt(
        prompt,
        researchConfig,
        vectorStore,
        context,
        webContext
      );

      let accumulatedContent = "";

      // Handle streaming response
      for await (const chunk of generateContentStream(researchPrompt)) {
        if (chunk) {
          accumulatedContent += chunk;
          setResults(accumulatedContent);

          // Update thinking process as content streams
          if (accumulatedContent.length < 100) {
            setThinkingOutput(
              (context && context.relevantDocuments.length > 0) ||
                (webContext && webContext.results.length > 0)
                ? "🚀 Starting research generation with knowledge base and web context..."
                : "🚀 Starting research generation..."
            );
          } else if (accumulatedContent.length < 500) {
            setThinkingOutput(
              (context && context.relevantDocuments.length > 0) ||
                (webContext && webContext.results.length > 0)
                ? "📖 Building comprehensive analysis using knowledge base and web context..."
                : "📖 Building comprehensive analysis..."
            );
          } else {
            setThinkingOutput(
              (context && context.relevantDocuments.length > 0) ||
                (webContext && webContext.results.length > 0)
                ? "✨ Expanding research with detailed insights from documents and web..."
                : "✨ Expanding research with detailed insights..."
            );
          }
        }
      }

      setThinkingOutput(
        (context && context.relevantDocuments.length > 0) ||
          (webContext && webContext.results.length > 0)
          ? "✅ Research completed successfully with knowledge base and web context!"
          : "✅ Research completed successfully!"
      );
    } catch (error) {
      console.error("Streaming research generation failed:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      setResults(
        `Failed to generate research: ${errorMessage}\n\nPlease check your Ollama connection and try again.`
      );
      setThinkingOutput("❌ Research generation failed. Please try again.");
    } finally {
      setIsGenerating(false);
      setIsStreaming(false);
    }
  }, [
    prompt,
    researchConfig,
    vectorStore,
    ragContext,
    performRAGSearch,
    webSearchContext,
    webSearchService,
    performWebSearch,
    isAIReady,
    generateContentStream,
  ]);

  // Enhanced research generation with explicit RAG context
  const generateResearchWithRAG = useCallback(
    async (explicitRAGContext?: RAGContext) => {
      if (!prompt.trim() || !isAIReady) {
        return;
      }

      setIsGenerating(true);
      setIsStreaming(true);
      setThinkingOutput("");
      setResults("");

      try {
        // Use explicit context or perform search if enabled and not provided
        let context: RAGContext | undefined = explicitRAGContext || undefined;
        if (!context && researchConfig.includeRAG && vectorStore) {
          setThinkingOutput("Searching knowledge base for relevant context...");
          const searchResult = await performRAGSearch(prompt);
          context = searchResult || undefined;
        }

        // Automatically perform web search if webSearchService is available
        let webContext: WebSearchContext | undefined =
          webSearchContext || undefined;
        if (
          !webContext &&
          webSearchService &&
          researchConfig.includeWebSearch
        ) {
          setThinkingOutput("Searching the web for additional context...");
          const webSearchResult = await performWebSearch(prompt);
          webContext = webSearchResult || undefined;
        }

        const researchPrompt = buildResearchPrompt(
          prompt,
          researchConfig,
          vectorStore,
          context || undefined,
          webContext || undefined
        );

        setThinkingOutput("Generating research with enhanced context...");

        let accumulatedContent = "";

        // Handle streaming response
        for await (const chunk of generateContentStream(researchPrompt)) {
          if (chunk) {
            accumulatedContent += chunk;
            setResults(accumulatedContent);

            // Update thinking process as content streams
            if (accumulatedContent.length < 100) {
              setThinkingOutput(
                "Starting research generation with RAG context..."
              );
            } else if (accumulatedContent.length < 500) {
              setThinkingOutput(
                "Building comprehensive analysis using knowledge base..."
              );
            } else {
              setThinkingOutput(
                "Expanding research with detailed insights and context..."
              );
            }
          }
        }

        setThinkingOutput(
          "Research completed successfully with enhanced context!"
        );
      } catch (error) {
        console.error("RAG-enhanced research generation failed:", error);
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        setResults(
          `Failed to generate research: ${errorMessage}\n\nPlease check your Ollama connection and try again.`
        );
        setThinkingOutput("Research generation failed. Please try again.");
      } finally {
        setIsGenerating(false);
        setIsStreaming(false);
      }
    },
    [
      prompt,
      researchConfig,
      vectorStore,
      performRAGSearch,
      webSearchContext,
      webSearchService,
      performWebSearch,
      isAIReady,
      generateContentStream,
    ]
  );

  // Enhanced research generation with explicit RAG and web search context
  const generateResearchWithContext = useCallback(
    async (
      explicitRAGContext?: RAGContext,
      explicitWebContext?: WebSearchContext
    ) => {
      if (!prompt.trim() || !isAIReady) {
        return;
      }

      setIsGenerating(true);
      setIsStreaming(true);
      setThinkingOutput("");
      setResults("");

      try {
        // Use explicit contexts or perform search if enabled and not provided
        let context: RAGContext | undefined = explicitRAGContext || undefined;
        if (!context && researchConfig.includeRAG && vectorStore) {
          setThinkingOutput("Searching knowledge base for relevant context...");
          const searchResult = await performRAGSearch(prompt);
          context = searchResult || undefined;
        }

        let webContext: WebSearchContext | undefined =
          explicitWebContext || undefined;
        if (
          !webContext &&
          researchConfig.includeWebSearch &&
          webSearchService
        ) {
          setThinkingOutput("Searching the web for additional context...");
          const webSearchResult = await performWebSearch(prompt);
          webContext = webSearchResult || undefined;
        }

        const researchPrompt = buildResearchPrompt(
          prompt,
          researchConfig,
          vectorStore,
          context || undefined,
          webContext || undefined
        );

        setThinkingOutput("Generating research with enhanced context...");

        let accumulatedContent = "";

        // Handle streaming response
        for await (const chunk of generateContentStream(researchPrompt)) {
          if (chunk) {
            accumulatedContent += chunk;
            setResults(accumulatedContent);

            // Update thinking process as content streams
            if (accumulatedContent.length < 100) {
              setThinkingOutput(
                "Starting research generation with enhanced context..."
              );
            } else if (accumulatedContent.length < 500) {
              setThinkingOutput(
                "Building comprehensive analysis using available context..."
              );
            } else {
              setThinkingOutput(
                "Expanding research with detailed insights and context..."
              );
            }
          }
        }

        setThinkingOutput(
          "Research completed successfully with enhanced context!"
        );
      } catch (error) {
        console.error("Context-enhanced research generation failed:", error);
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        setResults(
          `Failed to generate research: ${errorMessage}\n\nPlease check your Ollama connection and try again.`
        );
        setThinkingOutput("Research generation failed. Please try again.");
      } finally {
        setIsGenerating(false);
        setIsStreaming(false);
      }
    },
    [
      prompt,
      researchConfig,
      vectorStore,
      performRAGSearch,
      webSearchService,
      performWebSearch,
      isAIReady,
      generateContentStream,
    ]
  );

  const updateResults = useCallback((newContent: string) => {
    setResults(newContent);
    setThinkingOutput("Content updated by user");
  }, []);

  const clearResults = useCallback(() => {
    setResults("");
    setPrompt("");
    setThinkingOutput("");
    setIsStreaming(false);
    clearRAGContext();
    clearWebSearchContext();
    researchStepsState.clearSteps();
    setResearchResult(null);
    processedStepIds.current.clear();
  }, [clearRAGContext, clearWebSearchContext, researchStepsState]);

  // Step processing deduplication tracker  
  const processedStepIds = React.useRef(new Set<string>());

  // Intelligent Research Functions
  const performIntelligentResearch = useCallback(async (query: string) => {
    if (!query.trim() || !isAIReady) {
      console.warn('⚠️ Cannot perform intelligent research: query empty or AI not ready');
      return;
    }

    // Clear previous results immediately when starting new research
    setResults("");
    setResearchResult(null);
    setIsIntelligentResearching(true);
    setIsGenerating(true);
    setIsStreaming(true);
    setThinkingOutput("🧠 Initializing intelligent research system...");
    researchStepsState.clearSteps();
    processedStepIds.current.clear();

    try {
      console.log(`🔬 Starting intelligent research for: "${query}"`);

      // Set up step tracking callback with race condition protection
      researchOrchestrator.onStepUpdate = (step: ResearchStep) => {
        console.log(`📋 Step update: ${step.type} - ${step.status} - ID: ${step.id}`);
        
        // Create unique key for step+status combination to prevent duplicate processing
        const stepKey = `${step.id}_${step.status}`;
        
        // Skip if we've already processed this step+status combination
        if (processedStepIds.current.has(stepKey)) {
          console.log(`📋 Skipping duplicate step processing: ${stepKey}`);
          return;
        }
        
        // Mark this step+status as processed
        processedStepIds.current.add(stepKey);
        
        // Safe step management with current state check
        const existingSteps = researchStepsState.steps;
        const existingStepIndex = existingSteps.findIndex(s => s.id === step.id);
        
        if (existingStepIndex >= 0) {
          console.log(`📋 Updating existing step: ${step.id}`);
          researchStepsState.updateStep(step.id, step);
        } else {
          console.log(`📋 Adding new step: ${step.id}`);
          researchStepsState.addStep(step);
        }
        
        // Update thinking output based on current step
        if (step.status === 'in_progress') {
          switch (step.type) {
            case 'analysis':
              setThinkingOutput(`🧠 Analyzing query: "${step.query}"`);
              break;
            case 'rag_search':
              setThinkingOutput(`📚 Searching knowledge base (${step.queries?.length || 1} queries)...`);
              break;
            case 'web_search':
              setThinkingOutput(`🌐 Searching web for additional information...`);
              break;
            case 'synthesis':
              setThinkingOutput(`⚗️ Synthesizing information from ${step.sources?.length || 0} sources...`);
              break;
          }
        }
      };

      // Execute intelligent research
      const result = await researchOrchestrator.executeResearch(query);
      
      setResearchResult(result);
      setResults(result.finalAnswer);
      setThinkingOutput(`✅ Research completed: ${result.steps.length} steps, ${result.sources.length} sources, ${Math.round(result.confidence * 100)}% confidence`);

      console.log(`✅ Intelligent research completed:`, {
        steps: result.steps.length,
        sources: result.sources.length,
        confidence: result.confidence,
        processingTime: result.processingTime
      });

    } catch (error) {
      console.error('❌ Intelligent research failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setResults(`Intelligent research failed: ${errorMessage}\n\nPlease check your AI connection and try again.`);
      setThinkingOutput("❌ Research failed. Please try again.");
    } finally {
      setIsIntelligentResearching(false);
      setIsGenerating(false);
      setIsStreaming(false);
    }
  }, [
    isAIReady,
    researchOrchestrator,
    researchStepsState
  ]);

  const clearResearchSteps = useCallback(() => {
    researchStepsState.clearSteps();
    setResearchResult(null);
    processedStepIds.current.clear();
  }, [researchStepsState]);

  // Rerun synthesis function - restarts the intelligent research process
  const rerunSynthesis = useCallback(async () => {
    if (!prompt.trim() || !isAIReady) {
      console.warn('⚠️ Cannot rerun synthesis: missing query or AI not ready');
      return;
    }

    setIsGenerating(true);
    setIsStreaming(true);
    setThinkingOutput("🔄 Rerunning intelligent research and synthesis...");

    try {
      console.log('🔄 Rerunning synthesis for query:', prompt);
      
      // Clear previous results and restart the research process
      // This will use the fixed DataAnalyzer infinite loop logic
      const result = await researchOrchestrator.executeResearch(prompt);
      
      if (result && result.finalAnswer) {
        setResearchResult(result);
        setResults(result.finalAnswer);
        setThinkingOutput(`✅ Synthesis rerun completed: ${Math.round(result.confidence * 100)}% confidence`);
        
        console.log('✅ Synthesis rerun successful:', {
          confidence: result.confidence,
          answerLength: result.finalAnswer.length
        });
      } else {
        throw new Error('Synthesis rerun returned no result');
      }

    } catch (error) {
      console.error('❌ Synthesis rerun failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setResults(`Synthesis rerun failed: ${errorMessage}\n\nPlease check the logs and try again.`);
      setThinkingOutput("❌ Synthesis rerun failed. Check console for details.");
    } finally {
      setIsGenerating(false);
      setIsStreaming(false);
    }
  }, [prompt, isAIReady, researchOrchestrator]);

  return {
    prompt,
    setPrompt,
    researchConfig,
    setResearchConfig,
    isGenerating,
    results,
    thinkingOutput,
    isStreaming,
    connectionState,
    connectAI: connect,
    disconnectAI: disconnect,
    testConnection,
    isAIReady,
    // RAG Integration
    ragContext,
    isRAGSearching,
    performRAGSearch,
    clearRAGContext,
    // Web Search Integration
    webSearchContext,
    isWebSearching,
    performWebSearch,
    clearWebSearchContext,
    // Actions
    generateResearch,
    generateResearchStream,
    generateResearchWithRAG,
    generateResearchWithContext,
    updateResults,
    clearResults,

    // Intelligent Research Integration
    researchSteps: researchStepsState.steps,
    isIntelligentResearching,
    researchResult,
    expandedSteps: researchStepsState.expandedSteps,
    performIntelligentResearch,
    handleStepClick: researchStepsState.handleStepClick,
    clearResearchSteps,
    rerunSynthesis,
  };
}

function buildResearchPrompt(
  userPrompt: string,
  config: ResearchConfig,
  vectorStore: VectorStore | null,
  ragContext?: RAGContext,
  webContext?: WebSearchContext
): string {
  const typePrompts = {
    "deep-research":
      "Conduct comprehensive research with detailed analysis and insights",
    social:
      "Analyze social trends, cultural impacts, and community perspectives",
    finance:
      "Provide financial analysis, market insights, and economic perspectives",
    academic: "Deliver scholarly research with citations and academic rigor",
    technical:
      "Focus on technical specifications, implementation details, and best practices",
    market:
      "Analyze market trends, competitive landscape, and business opportunities",
  };

  const depthModifiers = {
    quick: "Provide a concise overview with key points",
    detailed: "Provide detailed analysis with supporting evidence",
    comprehensive:
      "Provide exhaustive research with multiple perspectives and thorough analysis",
  };

  let prompt = `${typePrompts[config.type]}. ${depthModifiers[config.depth]}.\n\n`;
  prompt += `Research Query: ${userPrompt}\n\n`;

  // Enhanced RAG context integration
  if (ragContext && ragContext.relevantDocuments.length > 0) {
    prompt += `## RELEVANT CONTEXT FROM KNOWLEDGE BASE\n\n`;
    prompt += `The following information has been retrieved from the knowledge base and is highly relevant to your research query:\n\n`;

    // Add context from relevant documents
    ragContext.relevantDocuments.forEach((doc, index) => {
      prompt += `### Source ${index + 1}: ${doc.title} (${(doc.similarity * 100).toFixed(1)}% relevance)\n`;
      prompt += `${doc.chunkContent}\n\n`;
    });

    prompt += `## RESEARCH INSTRUCTIONS\n\n`;
    prompt += `Please use the above context to enhance your research. Reference specific information from the knowledge base when relevant. If the context provides valuable insights, incorporate them into your analysis. If the context is not directly relevant, focus on your own comprehensive research.\n\n`;
  } else if (vectorStore) {
    prompt += `Please use any relevant information from the knowledge base to enhance your research.\n\n`;
  }

  // Enhanced Web Search context integration
  if (webContext && webContext.results.length > 0) {
    prompt += `## RELEVANT CONTEXT FROM WEB SEARCH\n\n`;
    prompt += `The following information has been retrieved from the web and is highly relevant to your research query:\n\n`;

    // Add context from web search results
    webContext.results.forEach((result, index) => {
      prompt += `### Source ${index + 1}: ${result.title}\n`;
      prompt += `${result.description}\n\n`;
    });

    prompt += `## RESEARCH INSTRUCTIONS\n\n`;
    prompt += `Please use the above context to enhance your research. Reference specific information from the web when relevant. If the context provides valuable insights, incorporate them into your analysis. If the context is not directly relevant, focus on your own comprehensive research.\n\n`;
  } else if (webContext) {
    prompt += `Please use any relevant information from the web to enhance your research.\n\n`;
  }

  prompt += `Format your response with clear headings, bullet points, and structured information for easy reading. Use markdown formatting for better readability.`;

  return prompt;
}
