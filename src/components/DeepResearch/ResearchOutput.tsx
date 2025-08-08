"use client";

import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PromptBox, ResearchType } from "@/components/ui/prompt-input";
import { ResearchConfig } from "./hooks/useResearch";
import { ResearchResult } from "@/lib/ResearchOrchestrator";
import { ResearchSteps, ResearchStep } from "./components/ResearchSteps";
import { PerplexityStyleResearch } from "./components/PerplexityStyleResearch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  FileText,
  Download,
  Copy,
  CheckCircle2,
  Sparkle,
  Loader2,
  Edit3,
  Save,
  X,
  User,
  Bot,
  ChevronDown,
  ChevronRight,
  Database,
  Globe,
  Link,
  TableProperties,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

interface ChatMessage {
  id: string;
  type: "user" | "ai";
  content: string;
  timestamp: Date;
  thinkingOutput?: string;
  thinkTokens?: string;
  ragContext?: any;
  webSearchContext?: any;
  researchSteps?: ResearchStep[]; // Store research steps per message
}

interface ResearchOutputProps {
  researchResults: string;
  thinkingOutput: string;
  isStreaming?: boolean;
  onClearOutput: () => void;
  onExportResults: () => void;
  onUpdateResults: (newContent: string) => void;
  prompt: string;
  onPromptChange: (prompt: string) => void;
  researchConfig: ResearchConfig;
  onResearchConfigChange: (config: ResearchConfig) => void;
  onGenerateResearchStream: () => void;
  onGenerateResearchWithContext?: (ragContext?: any, webContext?: any) => void;
  isGenerating: boolean;
  connectionState: {
    connected: boolean;
    connecting: boolean;
    error: string | null;
    baseURL: string;
    availableModels: string[];
    selectedModel: string;
    lastConnected: Date | null;
    isAutoReconnecting?: boolean;
  };
  onConnectAI?: () => void;

  // RAG Integration
  enableRAG?: boolean;
  onRAGSearch?: (query: string) => Promise<any>;
  onRAGToggle?: (enabled: boolean) => void;

  // Web Search Integration
  webSearchEnabled?: boolean;
  onWebSearch?: (query: string) => Promise<any>;
  onWebSearchToggle?: (enabled: boolean) => void;
  webSearchStatus?: {
    configured: boolean;
    lastSearch?: Date | null;
    searchCount?: number;
  };
  onWebSearchConfigure?: (apiKey: string) => void;

  // Intelligent Research Integration
  onPerformIntelligentResearch?: (query: string) => Promise<void>;
  isIntelligentResearching?: boolean;
  researchResult?: ResearchResult | null;

  // Research Steps Integration
  researchSteps?: ResearchStep[];
  expandedSteps?: Set<string>;
  onStepClick?: (step: ResearchStep) => void;
}

// Thinking output component
function ThinkingOutput({
  content,
  isStreaming = false,
}: {
  content: string;
  isStreaming?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="mb-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full text-left p-3 bg-gradient-to-r from-secondary/40 to-secondary/60 border border-border/60 rounded-lg hover:from-secondary/60 hover:to-secondary/80 transition-all duration-200 shadow-sm"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Sparkle
              className={`w-4 h-4 text-primary ${isStreaming ? "animate-pulse" : ""}`}
            />
            <span className="text-sm font-medium text-foreground">
              AI Thinking Process
            </span>
            {isStreaming && (
              <div className="flex space-x-1">
                <div
                  className="w-1 h-1 bg-primary rounded-full animate-bounce"
                  style={{ animationDelay: "0ms" }}
                ></div>
                <div
                  className="w-1 h-1 bg-primary rounded-full animate-bounce"
                  style={{ animationDelay: "150ms" }}
                ></div>
                <div
                  className="w-1 h-1 bg-primary rounded-full animate-bounce"
                  style={{ animationDelay: "300ms" }}
                ></div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-muted-foreground bg-secondary/60 px-2 py-1 rounded-full">
              {content.length.toLocaleString()} chars
            </span>
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-primary transition-transform duration-200" />
            ) : (
              <ChevronRight className="w-4 h-4 text-primary transition-transform duration-200" />
            )}
          </div>
        </div>
      </button>
      {isExpanded && (
        <div className="mt-2 p-4 bg-secondary/20 border border-border/40 rounded-lg backdrop-blur-sm">
          <div className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed font-mono tracking-tight">
            {content}
          </div>
        </div>
      )}
    </div>
  );
}

// Think tokens display component
function ThinkTokensDisplay({
  thinkTokens,
  isStreaming = false,
}: {
  thinkTokens: string;
  isStreaming?: boolean;
}) {
  const cleanThinkTokens = thinkTokens
    .replace(/<think>/gi, "")
    .replace(/<\/think>/gi, "")
    .trim();

  if (!cleanThinkTokens) return null;

  return (
    <div className="mb-6">
      <Accordion
        type="single"
        collapsible
        defaultValue={isStreaming ? "think-tokens" : undefined}
        className="w-full"
      >
        <AccordionItem value="think-tokens" className="border-none">
          <AccordionTrigger className="w-full p-4 bg-accent/30 border border-border rounded-xl hover:bg-accent/50 transition-all duration-200 shadow-sm hover:no-underline group">
            <div className="flex items-center gap-3 w-full">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Sparkle className="w-4 h-4 text-primary" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    AI Reasoning Process
                  </span>
                  {isStreaming && (
                    <div className="flex space-x-1">
                      <div
                        className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce"
                        style={{ animationDelay: "0ms" }}
                      ></div>
                      <div
                        className="w-1.5 h-1.5 bg-primary/70 rounded-full animate-bounce"
                        style={{ animationDelay: "150ms" }}
                      ></div>
                      <div
                        className="w-1.5 h-1.5 bg-primary/50 rounded-full animate-bounce"
                        style={{ animationDelay: "300ms" }}
                      ></div>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full font-medium">
                  {cleanThinkTokens.length.toLocaleString()} chars
                </span>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pt-3">
            <div className="p-6 bg-card border border-border rounded-xl shadow-sm">
              <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed font-mono tracking-tight">
                {cleanThinkTokens}
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

// Context sources component
function ContextSources({
  ragContext,
  webSearchContext,
  researchSteps = [],
  expandedSteps = new Set(),
  onStepClick,
}: {
  ragContext?: any;
  webSearchContext?: any;
  researchSteps?: ResearchStep[];
  expandedSteps?: Set<string>;
  onStepClick?: (step: ResearchStep) => void;
}) {
  // Don't show steps tab when research steps are already displayed in left panel
  const showStepsTab = researchSteps.length === 0;

  const [activeTab, setActiveTab] = useState<"overview" | "sources" | "steps">(
    "overview"
  );

  // Reset activeTab if it's "steps" but steps tab is not available
  React.useEffect(() => {
    if (activeTab === "steps" && !showStepsTab) {
      setActiveTab("overview");
    }
  }, [activeTab, showStepsTab]);

  const hasRAG =
    ragContext &&
    ragContext.relevantDocuments &&
    ragContext.relevantDocuments.length > 0;
  const hasWeb =
    webSearchContext &&
    webSearchContext.results &&
    webSearchContext.results.length > 0;

  if (!hasRAG && !hasWeb) return null;

  const tabs = [
    { id: "overview", label: "Overview", icon: Link },
    { id: "sources", label: "Sources", icon: Database },
    // Only show steps tab when research steps panel is NOT active
    ...(showStepsTab
      ? [{ id: "steps", label: "Steps", icon: TableProperties }]
      : []),
  ];

  return (
    <div className="mb-4 bg-card border border-border rounded-lg shadow-sm">
      {/* Tab Navigation */}
      <div className="flex border-b border-border">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-medium transition-all duration-200 ${
                activeTab === tab.id
                  ? "text-primary border-b-2 border-primary bg-accent/50"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/30"
              }`}
            >
              <Icon className="h-3 w-3" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="p-4">
        {activeTab === "overview" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Link className="h-4 w-4 text-primary" />
              <span>Research Summary</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {hasRAG && (
                <div className="flex items-center gap-3 p-3 bg-accent/30 rounded-lg border border-border/50">
                  <div className="flex-shrink-0 w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Database className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      Knowledge Base
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {ragContext?.metadata?.documentCount ||
                        ragContext?.relevantDocuments?.length ||
                        0}{" "}
                      documents
                    </div>
                  </div>
                </div>
              )}
              {hasWeb && (
                <div className="flex items-center gap-3 p-3 bg-accent/30 rounded-lg border border-border/50">
                  <div className="flex-shrink-0 w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Globe className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      Web Search
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {webSearchContext?.metadata?.resultCount ||
                        webSearchContext?.results?.length ||
                        0}{" "}
                      results
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "sources" && (
          <div className="space-y-4">
            {/* RAG Documents */}
            {hasRAG && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Database className="h-4 w-4 text-primary" />
                  <span>Knowledge Base Documents</span>
                </div>
                <div className="space-y-2">
                  {ragContext.relevantDocuments
                    .slice(0, 4)
                    .map((doc: any, index: number) => (
                      <div
                        key={index}
                        className="p-3 bg-accent/20 rounded-lg border border-border/50 hover:bg-accent/30 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 w-2 h-2 bg-primary rounded-full mt-2"></div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-foreground truncate">
                              {doc.title ||
                                doc.source ||
                                `Document ${index + 1}`}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1 line-clamp-1">
                              {doc.chunkContent?.substring(0, 80) ||
                                "Content preview not available"}
                              {doc.chunkContent &&
                                doc.chunkContent.length > 80 &&
                                "..."}
                            </div>
                            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                              <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-full">
                                {(doc.similarity * 100).toFixed(1)}% match
                              </span>
                              <span>•</span>
                              <span>{doc.chunkContent?.length || 0} chars</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Web Search Results */}
            {hasWeb && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Globe className="h-4 w-4 text-primary" />
                  <span>Web Search Results</span>
                </div>
                <div className="space-y-2">
                  {webSearchContext.results
                    .slice(0, 4)
                    .map((result: any, index: number) => (
                      <div
                        key={index}
                        className="p-3 bg-accent/20 rounded-lg border border-border/50 hover:bg-accent/30 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 w-2 h-2 bg-primary rounded-full mt-2"></div>
                          <div className="flex-1 min-w-0">
                            <a
                              href={result.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-medium text-primary hover:text-primary/80 hover:underline truncate block"
                            >
                              {result.title || `Result ${index + 1}`}
                            </a>
                            <div className="text-xs text-muted-foreground mt-1 line-clamp-1">
                              {result.description?.substring(0, 80) ||
                                result.content?.substring(0, 80) ||
                                "Description not available"}
                              {(result.description &&
                                result.description.length > 80) ||
                              (result.content && result.content.length > 80)
                                ? "..."
                                : ""}
                            </div>
                            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                              <span className="truncate font-medium">
                                {new URL(result.url).hostname}
                              </span>
                              {result.relevanceScore && (
                                <>
                                  <span>•</span>
                                  <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-full">
                                    {(result.relevanceScore * 100).toFixed(1)}%
                                    relevant
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "steps" && showStepsTab && (
          <div className="space-y-4">
            {researchSteps && researchSteps.length > 0 ? (
              <ResearchSteps
                steps={researchSteps}
                onStepClick={onStepClick || (() => {})}
                expandedSteps={expandedSteps}
                className="border-0 shadow-none"
              />
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Sparkle className="h-4 w-4 text-primary" />
                  <span>Research Process</span>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-4 p-4 bg-accent/20 rounded-lg border border-border/50">
                    <div className="flex-shrink-0 w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-bold shadow-sm">
                      1
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-foreground">
                        Query Analysis
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Analyzing user query and determining research approach
                      </div>
                    </div>
                    <div className="flex-shrink-0 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs font-bold">✓</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 p-4 bg-accent/20 rounded-lg border border-border/50">
                    <div className="flex-shrink-0 w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-bold shadow-sm">
                      2
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-foreground">
                        Knowledge Base Search
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {hasRAG
                          ? `Found ${ragContext?.metadata?.documentCount || ragContext?.relevantDocuments?.length || 0} relevant documents`
                          : "No relevant documents found"}
                      </div>
                    </div>
                    <div className="flex-shrink-0 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs font-bold">✓</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 p-4 bg-accent/20 rounded-lg border border-border/50">
                    <div className="flex-shrink-0 w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-bold shadow-sm">
                      3
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-foreground">
                        Web Search
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {hasWeb
                          ? `Found ${webSearchContext?.metadata?.resultCount || webSearchContext?.results?.length || 0} web results`
                          : "No web search performed"}
                      </div>
                    </div>
                    <div className="flex-shrink-0 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs font-bold">✓</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 p-4 bg-accent/20 rounded-lg border border-border/50">
                    <div className="flex-shrink-0 w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-bold shadow-sm">
                      4
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-foreground">
                        Context Integration
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Combining knowledge base and web search results
                      </div>
                    </div>
                    <div className="flex-shrink-0 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs font-bold">✓</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 p-4 bg-accent/20 rounded-lg border border-border/50">
                    <div className="flex-shrink-0 w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-bold shadow-sm">
                      5
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-foreground">
                        AI Generation
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Generating comprehensive response using integrated
                        context
                      </div>
                    </div>
                    <div className="flex-shrink-0 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs font-bold">✓</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function ResearchOutput({
  researchResults,
  thinkingOutput,
  isStreaming = false,
  onClearOutput,
  onExportResults,
  onUpdateResults,
  prompt,
  onPromptChange,
  researchConfig,
  onResearchConfigChange,
  onGenerateResearchStream,
  onGenerateResearchWithContext,
  isGenerating,
  connectionState,
  onConnectAI,
  enableRAG = false,
  onRAGSearch,
  onRAGToggle,
  webSearchEnabled = false,
  onWebSearch,
  onWebSearchToggle,
  webSearchStatus,
  onWebSearchConfigure,
  // Intelligent Research Integration
  onPerformIntelligentResearch,
  isIntelligentResearching = false,
  researchResult,

  // Research Steps Integration
  researchSteps = [],
  expandedSteps = new Set(),
  onStepClick,
}: ResearchOutputProps) {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentMessageId, setCurrentMessageId] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");

  // Check if user is near bottom of scroll area
  const isNearBottom = () => {
    if (!scrollRef.current) return false;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    return scrollHeight - scrollTop - clientHeight < 100;
  };

  // Handle user scroll to detect manual scrolling
  const handleScroll = () => {
    if (!scrollRef.current) return;
    const isAtBottom = isNearBottom();
    setAutoScroll(isAtBottom);
    setIsUserScrolling(true);
    setTimeout(() => setIsUserScrolling(false), 150);
  };

  // Auto-scroll to bottom only when user is at bottom and not manually scrolling
  useEffect(() => {
    if (autoScroll && !isUserScrolling && !isStreaming && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, autoScroll, isUserScrolling, isStreaming]);

  // Update edited content when research results change
  useEffect(() => {
    if (!isEditing) {
      setEditedContent(researchResults);
    }
  }, [researchResults, isEditing]);

  // Focus textarea when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(
        textareaRef.current.value.length,
        textareaRef.current.value.length
      );
    }
  }, [isEditing]);

  // Parse think tokens from streaming content
  const parseThinkTokens = (content: string): string => {
    const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/i);
    return thinkMatch ? thinkMatch[1] : "";
  };

  // Update AI message content and think tokens
  useEffect(() => {
    if (currentMessageId && researchResults) {
      const thinkTokens = parseThinkTokens(researchResults);
      const cleanContent = researchResults
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .trim();

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === currentMessageId
            ? {
                ...msg,
                content: cleanContent,
                thinkingOutput,
                thinkTokens: thinkTokens || undefined,
                researchSteps: researchSteps && researchSteps.length > 0 ? [...researchSteps] : undefined, // Store research steps with message
              }
            : msg
        )
      );
    }
  }, [researchResults, thinkingOutput, currentMessageId, researchSteps]);

  // Clear current message when streaming stops
  useEffect(() => {
    if (!isStreaming && currentMessageId) {
      setCurrentMessageId(null);
    }
  }, [isStreaming, currentMessageId]);

  const handleCopy = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
    setEditedContent(researchResults);
  };

  const handleSave = () => {
    if (onUpdateResults) {
      onUpdateResults(editedContent);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedContent(researchResults);
  };

  const handleEditMessage = (messageId: string, content: string) => {
    setEditingMessageId(messageId);
    setEditingContent(content);
  };

  const handleSaveMessage = (messageId: string) => {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId ? { ...msg, content: editingContent } : msg
      )
    );
    setEditingMessageId(null);
    setEditingContent("");
  };

  const handleCancelMessage = () => {
    setEditingMessageId(null);
    setEditingContent("");
  };

  const handleResearchTypeChange = (type: ResearchType) => {
    onResearchConfigChange({
      ...researchConfig,
      type,
    });
  };

  const handleDepthChange = (depth: "quick" | "detailed" | "comprehensive") => {
    onResearchConfigChange({
      ...researchConfig,
      depth,
    });
  };

  const handleSubmit = (
    promptText: string,
    researchType: ResearchType,
    researchDepth: "quick" | "detailed" | "comprehensive",
    ragContext?: any,
    webSearchContext?: any
  ) => {
    // Create messages immediately before the prompt gets cleared
    if (promptText.trim() && !currentMessageId) {
      // Add user message
      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        type: "user",
        content: promptText.trim(),
        timestamp: new Date(),
      };

      // Add AI message placeholder
      const aiMessageId = `ai-${Date.now()}`;
      const aiMessage: ChatMessage = {
        id: aiMessageId,
        type: "ai",
        content: "",
        timestamp: new Date(),
        ragContext,
        webSearchContext,
      };

      setMessages((prev) => [...prev, userMessage, aiMessage]);
      setCurrentMessageId(aiMessageId);
    }

    // Update prompt and trigger research with context
    onPromptChange(promptText);
    handleResearchTypeChange(researchType);
    handleDepthChange(researchDepth);

    // Use intelligent research if available, otherwise fallback to legacy methods
    if (onPerformIntelligentResearch) {
      onPerformIntelligentResearch(promptText);
    } else if (onGenerateResearchWithContext) {
      onGenerateResearchWithContext(ragContext, webSearchContext);
    } else {
      onGenerateResearchStream();
    }
  };

  const renderEmptyState = () => (
    <div className="flex flex-col items-center justify-center h-full text-center space-y-8 p-12">
      <div className="w-32 h-32 bg-gradient-to-br from-primary/10 to-primary/5 rounded-2xl flex items-center justify-center border border-border/50">
        <Sparkle className="w-16 h-16 text-primary" />
      </div>
      <div className="space-y-4 max-w-lg">
        <h3 className="text-3xl font-bold text-foreground">
          Ready to Research
        </h3>
        <p className="text-lg text-muted-foreground leading-relaxed">
          Enter your research question below to get started. I'll analyze your
          query and provide comprehensive insights with AI-powered analysis.
        </p>
      </div>
      {!connectionState.connected && (
        <div className="p-8 bg-card border border-border rounded-xl max-w-md space-y-6 shadow-sm">
          <div className="flex items-center justify-center gap-3 text-destructive">
            <div className="w-10 h-10 bg-destructive/10 rounded-full flex items-center justify-center">
              <Bot className="w-5 h-5" />
            </div>
            <span className="text-lg font-semibold">AI Not Connected</span>
          </div>
          <p className="text-muted-foreground leading-relaxed">
            Connect to Ollama to start researching and unlock the full potential
            of AI-powered analysis.
          </p>
          <Button
            onClick={onConnectAI}
            className="w-full h-12 text-base"
            disabled={
              connectionState.connecting || connectionState.isAutoReconnecting
            }
          >
            {connectionState.isAutoReconnecting ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Auto-reconnecting...
              </>
            ) : connectionState.connecting ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <Bot className="w-5 h-5 mr-2" />
                Connect AI
              </>
            )}
          </Button>
          {connectionState.error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <p className="text-sm text-destructive font-medium">
                Connection Error
              </p>
              <p className="text-xs text-destructive/80 mt-1">
                {connectionState.error}
              </p>
            </div>
          )}
          {connectionState.selectedModel && !connectionState.connected && (
            <div className="p-3 bg-accent/20 border border-border/50 rounded-lg">
              <p className="text-sm text-muted-foreground font-medium">
                Saved Configuration
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Model:{" "}
                <span className="font-mono text-foreground">
                  {connectionState.selectedModel}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                Server:{" "}
                <span className="font-mono text-foreground">
                  {connectionState.baseURL}
                </span>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderMessage = (message: ChatMessage) => {
    const isUser = message.type === "user";
    const isCurrentMessage = message.id === currentMessageId;

    return (
      <div
        key={message.id}
        className={`flex gap-6 p-8 border-b border-border/50 last:border-b-0 ${
          isUser ? "bg-background" : "bg-accent/5"
        }`}
      >
        <Avatar className="w-12 h-12 flex-shrink-0 border-2 border-border/50 shadow-sm">
          <AvatarImage src={isUser ? undefined : undefined} />
          <AvatarFallback className="text-sm font-semibold bg-primary text-primary-foreground">
            {isUser ? (
              <User className="w-6 h-6" />
            ) : (
              <Bot className="w-6 h-6" />
            )}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0 space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-base font-semibold text-foreground">
              {isUser ? "You" : "AI Assistant"}
            </span>
            <span className="text-xs text-muted-foreground bg-accent/50 px-3 py-1 rounded-full font-medium">
              {message.timestamp.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>

          <div className="space-y-4">
            {isUser ? (
              <div className="prose prose-sm max-w-none">
                <div className="bg-accent/20 border border-border/50 rounded-xl p-6">
                  <p className="text-foreground text-base leading-relaxed m-0">
                    {message.content}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Perplexity-style research process display */}
                {((message.researchSteps && message.researchSteps.length > 0) || 
                  (isCurrentMessage && researchSteps && researchSteps.length > 0)) && (
                  <PerplexityStyleResearch
                    steps={message.researchSteps || researchSteps}
                    isActive={isCurrentMessage && isStreaming}
                    className="mb-6"
                  />
                )}

                {/* Display think tokens if available */}
                {message.thinkTokens && (
                  <ThinkTokensDisplay
                    thinkTokens={message.thinkTokens}
                    isStreaming={isCurrentMessage && isStreaming}
                  />
                )}

                {message.content && (
                  <div className="prose prose-lg dark:prose-invert max-w-none bg-card border border-border rounded-xl p-6 shadow-sm">
                    {editingMessageId === message.id ? (
                      <div className="space-y-4">
                        <textarea
                          value={editingContent}
                          onChange={(e) => setEditingContent(e.target.value)}
                          className="w-full min-h-[200px] p-4 bg-background border border-border rounded-lg text-foreground font-mono text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/20"
                          placeholder="Edit the research content..."
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleSaveMessage(message.id)}
                            className="bg-primary text-primary-foreground hover:bg-primary/90"
                          >
                            <Save className="w-4 h-4 mr-2" />
                            Save
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleCancelMessage}
                          >
                            <X className="w-4 h-4 mr-2" />
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          code({ className, children, ...props }: any) {
                            const match = /language-(\w+)/.exec(
                              className || ""
                            );
                            return match ? (
                              <SyntaxHighlighter
                                style={oneDark as any}
                                language={match[1]}
                                PreTag="div"
                                {...props}
                              >
                                {String(children).replace(/\n$/, "")}
                              </SyntaxHighlighter>
                            ) : (
                              <code
                                className="bg-muted px-2 py-1 rounded-md text-sm font-mono border border-border/50"
                                {...props}
                              >
                                {children}
                              </code>
                            );
                          },
                          h1: ({ children }) => (
                            <h1 className="text-2xl font-bold mt-8 mb-6 text-foreground border-b border-border pb-3">
                              {children}
                            </h1>
                          ),
                          h2: ({ children }) => (
                            <h2 className="text-xl font-semibold mt-8 mb-4 text-foreground">
                              {children}
                            </h2>
                          ),
                          h3: ({ children }) => (
                            <h3 className="text-lg font-semibold mt-6 mb-3 text-foreground">
                              {children}
                            </h3>
                          ),
                          p: ({ children }) => (
                            <p className="mb-6 text-foreground leading-relaxed text-base">
                              {children}
                            </p>
                          ),
                          ul: ({ children }) => (
                            <ul className="list-disc list-inside mb-6 space-y-2 ml-6">
                              {children}
                            </ul>
                          ),
                          ol: ({ children }) => (
                            <ol className="list-decimal list-inside mb-6 space-y-2 ml-6">
                              {children}
                            </ol>
                          ),
                          li: ({ children }) => (
                            <li className="text-foreground leading-relaxed text-base">
                              {children}
                            </li>
                          ),
                          blockquote: ({ children }) => (
                            <blockquote className="border-l-4 border-primary pl-6 italic text-muted-foreground mb-6 bg-accent/20 py-4 rounded-r-lg">
                              {children}
                            </blockquote>
                          ),
                          a: ({ href, children }) => (
                            <a
                              href={href}
                              className="text-primary hover:underline font-medium"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {children}
                            </a>
                          ),
                          table: ({ children }) => (
                            <div className="overflow-x-auto mb-6">
                              <table className="min-w-full border border-border rounded-lg shadow-sm">
                                {children}
                              </table>
                            </div>
                          ),
                          th: ({ children }) => (
                            <th className="border border-border bg-accent/30 px-6 py-3 text-left font-semibold text-foreground">
                              {children}
                            </th>
                          ),
                          td: ({ children }) => (
                            <td className="border border-border px-6 py-3 text-foreground">
                              {children}
                            </td>
                          ),
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    )}
                  </div>
                )}

                {/* Action buttons for AI messages */}
                {message.content && !isCurrentMessage && (
                  <div className="flex items-center gap-3 pt-4 border-t border-border/50">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopy(message.content)}
                      className="h-10 px-4 opacity-70 hover:opacity-100 transition-opacity"
                    >
                      {copied ? (
                        <CheckCircle2 className="w-4 h-4 text-green-600 mr-2" />
                      ) : (
                        <Copy className="w-4 h-4 mr-2" />
                      )}
                      {copied ? "Copied!" : "Copy"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        handleEditMessage(message.id, message.content)
                      }
                      className="h-10 px-4 opacity-70 hover:opacity-100 transition-opacity"
                      disabled={isStreaming}
                    >
                      <Edit3 className="w-4 h-4 mr-2" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const blob = new Blob([message.content], {
                          type: "text/markdown",
                        });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `research-${new Date().toISOString().split("T")[0]}.md`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="h-10 px-4 opacity-70 hover:opacity-100 transition-opacity"
                      disabled={isStreaming}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Export
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderContent = () => {
    if (messages.length === 0 && !isStreaming) {
      return renderEmptyState();
    }

    return <div className="space-y-2">{messages.map(renderMessage)}</div>;
  };

  return (
    <div className="h-full flex flex-col relative">
      {/* Chat Messages Area */}
      <div className="flex-1 relative overflow-hidden">
        <div
          className="h-full overflow-y-auto overflow-x-hidden"
          ref={scrollRef}
          onScroll={handleScroll}
        >
          <div className="pb-40 px-8">{renderContent()}</div>
        </div>

        {/* Auto-scroll indicator */}
        {!autoScroll && messages.length > 0 && (
          <div className="absolute bottom-6 right-6 z-10">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                if (scrollRef.current) {
                  scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                  setAutoScroll(true);
                }
              }}
              className="shadow-lg backdrop-blur-sm bg-card/90 border border-border hover:bg-accent/80 h-10 px-4"
            >
              <ChevronDown className="w-4 h-4 mr-2" />
              Scroll to bottom
            </Button>
          </div>
        )}
      </div>

      {/* Fixed Prompt Input at Bottom */}
      <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-background via-background/98 to-transparent pt-12 pb-6 px-8">
        <div className="max-w-5xl mx-auto">
          {/* Connection Status Indicator */}
          {connectionState.isAutoReconnecting && (
            <div className="mb-4 p-3 bg-accent/30 border border-border/50 rounded-lg flex items-center gap-3">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">
                  Auto-reconnecting to Ollama
                </p>
                <p className="text-xs text-muted-foreground">
                  Attempting to reconnect to {connectionState.selectedModel} at{" "}
                  {connectionState.baseURL}
                </p>
              </div>
            </div>
          )}
          <PromptBox
            value={prompt}
            onChange={onPromptChange}
            onSubmit={handleSubmit}
            selectedResearchType={researchConfig.type}
            onResearchTypeChange={handleResearchTypeChange}
            selectedResearchDepth={researchConfig.depth}
            onResearchDepthChange={handleDepthChange}
            isGenerating={isGenerating}
            disabled={!connectionState.connected}
            placeholder={
              connectionState.connected
                ? "What would you like to research? Ask anything..."
                : connectionState.isAutoReconnecting
                  ? "Auto-reconnecting to Ollama..."
                  : connectionState.connecting
                    ? "Connecting to Ollama..."
                    : "Connect to Ollama to start researching..."
            }
            compact={messages.length > 0}
            className="shadow-2xl border-2 border-border/50 backdrop-blur-sm bg-card/98 transition-all duration-300 rounded-2xl"
            // RAG Integration
            enableRAG={enableRAG}
            onRAGSearch={onRAGSearch}
            onRAGToggle={onRAGToggle}
            // Web Search Integration
            webSearchEnabled={webSearchEnabled}
            onWebSearch={onWebSearch}
            onWebSearchToggle={onWebSearchToggle}
            webSearchStatus={webSearchStatus}
            onWebSearchConfigure={onWebSearchConfigure}
          />
        </div>
      </div>
    </div>
  );
}
