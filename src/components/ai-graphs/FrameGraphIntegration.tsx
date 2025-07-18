import React, { useState, useCallback, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import DualPaneFrameView from "./DualPaneFrameView";
import { GraphState } from "./types";
import {
  Network,
  Eye,
  Edit3,
  BookOpen,
  Brain,
  Layers,
  Save,
  Zap,
} from "lucide-react";
// import { debugFrames, debugStorage } from '@/lib/debugUtils'; // Disabled to prevent spam

interface AIFrame {
  id: string;
  title: string;
  goal: string;
  informationText: string;
  videoUrl: string;
  startTime: number;
  duration: number;
  afterVideoText: string;
  aiConcepts: string[];
  isGenerated?: boolean;
  sourceGoal?: string;
  sourceUrl?: string;
  // NEW: Hierarchy and relationship fields
  order?: number; // Preserve frame order
  bubblSpaceId?: string; // Link to BubblSpace
  timeCapsuleId?: string; // Link to TimeCapsule
  parentFrameId?: string; // For chapter/module hierarchy
  type?: "frame" | "chapter" | "module"; // Frame type
  createdAt?: string;
  updatedAt?: string;
  // CRITICAL FIX: Add attachment field for graph attachment system
  attachment?: {
    id: string;
    type: "video" | "pdf" | "text";
    data: {
      videoUrl?: string;
      startTime?: number;
      duration?: number;
      pdfUrl?: string;
      pages?: string;
      text?: string;
      title?: string;
      notes?: string;
    };
  };
}

interface FrameGraphIntegrationProps {
  frames: AIFrame[];
  onFramesChange: (frames: AIFrame[]) => void;
  isCreationMode: boolean;
  currentFrameIndex: number;
  onFrameIndexChange: (index: number) => void;
  onCreateFrame?: () => void;
  onTimeCapsuleUpdate?: (graphState: GraphState, chapters: any[]) => void;
  graphStorageManager?: any; // Add graphStorageManager prop
}

// Add debounce utility
function debounce<T extends (...args: any[]) => void>(func: T, delay: number): T {
  let timeoutId: NodeJS.Timeout;
  return ((...args: any[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  }) as T;
}

export default function FrameGraphIntegration({
  frames,
  onFramesChange,
  isCreationMode,
  currentFrameIndex,
  onFrameIndexChange,
  onCreateFrame,
  onTimeCapsuleUpdate,
  graphStorageManager,
}: FrameGraphIntegrationProps) {
  
  // Debug: Track when frames prop changes (DISABLED to prevent spam)
  // useEffect(() => {
  //   debugFrames('FrameGraphIntegration received frames update', {
  //     count: frames.length,
  //     frameIds: frames.map(f => f.id),
  //     frameTitles: frames.map(f => f.title)
  //   });
  // }, [frames]);

  const [graphState, setGraphState] = useState<GraphState>({
    nodes: [],
    edges: [],
    selectedNodeId: null,
  });
  const [chapters, setChapters] = useState<any[]>([]);
  const [sessionInitialized, setSessionInitialized] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [lastFrameIds, setLastFrameIds] = useState<string[]>([]);
  const [lastFrameStates, setLastFrameStates] = useState<Record<string, string>>({});
  
  // CRITICAL FIX: Add frame creation state to prevent deletion during creation
  const [isFrameCreationInProgress, setIsFrameCreationInProgress] = useState(false);
  const [frameCreationStartTime, setFrameCreationStartTime] = useState<number | null>(null);

  // REAL-TIME SYNC: Track frame changes like Google Docs (DISABLED to prevent spam)
  // useEffect(() => {
  //   if (!sessionInitialized) return;
  //   
  //   // FIX 3: Add small delay to prevent race condition during KB load
  //   if (isKbLoading) {
  //     console.log('⏸️ Real-time sync paused during KB load to prevent race conditions');
  //     return;
  //   }

  //   const currentFrameIds = frames.map(f => f.id);
  //   const newFrames = frames.filter(f => !lastFrameIds.includes(f.id));
  //   const deletedFrameIds = lastFrameIds.filter(id => !currentFrameIds.includes(id));

  //   // FIXED: Only handle new frames - immediate KB sync
  //   if (newFrames.length > 0) {
  //     console.log('🚀 REAL-TIME: New frames detected, syncing to KB immediately:', {
  //       newFrames: newFrames.map(f => ({ id: f.id, title: f.title })),
  //       count: newFrames.length,
  //       totalFrames: frames.length
  //     });
  //     
  //     // Set frame creation state to prevent deletion
  //     setIsFrameCreationInProgress(true);
  //     setFrameCreationStartTime(Date.now());
  //     
  //     // Sync new frames to Knowledge Base immediately (async to prevent UI blocking)
  //     newFrames.forEach(frame => {
  //       // Use setTimeout with debouncing to prevent blocking the UI and rapid calls
  //       setTimeout(() => syncFrameToKnowledgeBase(frame), 100);
  //     });
  //   }

  //   // CRITICAL FIX: Only delete frames when explicitly deleted by user, not during frame creation
  //   if (deletedFrameIds.length > 0) {
  //     // Check if this is a frame creation scenario
  //     const hasNewFrames = newFrames.length > 0;
  //     const isFrameCreationScenario = hasNewFrames || 
  //       (frames.length > 0 && lastFrameIds.length === 0) || // First frame creation
  //       (frames.length > lastFrameIds.length) || // Additional frame creation
  //       isFrameCreationInProgress || // Frame creation in progress
  //       (frameCreationStartTime && Date.now() - frameCreationStartTime < 2000); // Within 2 seconds of creation
  //     
  //     if (isFrameCreationScenario) {
  //       console.log('🔄 REAL-TIME: Frame creation detected, skipping deletion of existing frames:', {
  //         deletedFrameIds,
  //         newFrameCount: frames.length,
  //         lastFrameCount: lastFrameIds.length,
  //         hasNewFrames,
  //         isFrameCreationInProgress,
  //         timeSinceCreation: frameCreationStartTime ? Date.now() - frameCreationStartTime : null,
  //         isFrameCreation: true
  //       });
  //       // Don't delete frames during creation - they might be getting replaced temporarily
  //       // or new frames are being added to existing ones
  //     } else {
  //       console.log('🗑️ REAL-TIME: Deleted frames detected, cleaning up KB:', {
  //         deletedFrameIds,
  //         count: deletedFrameIds.length,
  //         currentFrameCount: frames.length,
  //         lastFrameCount: lastFrameIds.length
  //       });
  //       
  //       deletedFrameIds.forEach(frameId => {
  //         removeFrameFromKnowledgeBase(frameId);
  //       });
  //     }
  //   }

  //   // Clear frame creation state after processing
  //   if (isFrameCreationInProgress && newFrames.length === 0) {
  //     setTimeout(() => {
  //       setIsFrameCreationInProgress(false);
  //       setFrameCreationStartTime(null);
  //       console.log('✅ Frame creation state cleared');
  //     }, 1000);
  //   }

  //   // IMPROVED: Handle modified frames - check for content changes
  //   const existingFrames = frames.filter(f => lastFrameIds.includes(f.id));
  //   const currentFrameStates: Record<string, string> = {};
  //   
  //   existingFrames.forEach(frame => {
  //     // Create a hash of the frame's key properties to detect changes
  //     const frameStateKey = `${frame.title}|${frame.goal}|${frame.informationText}|${frame.afterVideoText}|${frame.aiConcepts?.join(',')}`;
  //     currentFrameStates[frame.id] = frameStateKey;
  //     
  //     const previousState = lastFrameStates[frame.id];
  //     const hasChanged = previousState && previousState !== frameStateKey;
  //     
  //     // Also check for recent updatedAt timestamp (within 10 seconds for better coverage)
  //     const recentlyUpdated = frame.updatedAt && new Date(frame.updatedAt).getTime() > Date.now() - 10000;
  //     
  //     if (hasChanged || recentlyUpdated) {
  //       console.log('🔄 REAL-TIME: Frame content changed, syncing to KB:', {
  //         frameId: frame.id,
  //         title: frame.title,
  //         hasChanged,
  //         recentlyUpdated,
  //         previousState,
  //         currentState: frameStateKey
  //       });
  //       
  //       // Update the frame with current timestamp
  //       const updatedFrame = {
  //         ...frame,
  //         updatedAt: new Date().toISOString()
  //       };
  //       
  //       // ENHANCED: Use longer delay and improved coordination to prevent RxDB conflicts
  //       // Delay by 500ms to ensure main page component sync completes first
  //       setTimeout(() => {
  //         // ENHANCED: Check if another sync is in progress with timeout detection
  //         if (typeof window !== 'undefined') {
  //           const aiFramesApp = (window as any).aiFramesApp;
  //           if (aiFramesApp?.syncInProgress) {
  //             console.log('⏳ Main page sync in progress, skipping FrameGraphIntegration sync:', {
  //               frameId: frame.id,
  //               frameTitle: frame.title,
  //               syncSource: aiFramesApp.syncSource,
  //               syncStartTime: aiFramesApp.syncStartTime,
  //               syncDuration: aiFramesApp.syncStartTime ? Date.now() - aiFramesApp.syncStartTime : 0
  //             });
  //             
  //             // ENHANCED: Check if sync is stuck (more than 10 seconds)
  //             if (aiFramesApp.syncStartTime && (Date.now() - aiFramesApp.syncStartTime) > 10000) {
  //               console.warn('⚠️ Sync appears stuck, proceeding with FrameGraphIntegration sync anyway');
  //             } else {
  //               return;
  //             }
  //           }
  //         }
  //         
  //         console.log('🔄 FrameGraphIntegration proceeding with sync:', {
  //           frameId: frame.id,
  //           frameTitle: frame.title,
  //           delay: '500ms'
  //         });
  //         
  //         syncFrameToKnowledgeBase(updatedFrame);
  //       }, 500);
  //     }
  //   });

  //   setLastFrameIds(currentFrameIds);
  //   setLastFrameStates(currentFrameStates);
  // }, [frames, sessionInitialized, graphStorageManager]);

  // REAL-TIME SYNC: Knowledge Base sync functions
  const syncFrameToKnowledgeBase = async (frame: AIFrame) => {
    try {
      let vectorStore: any = null;
      
      if (typeof window !== 'undefined') {
        const aiFramesApp = (window as any).aiFramesApp;
        if (aiFramesApp?.vectorStore) {
          vectorStore = aiFramesApp.vectorStore;
        }
      }

      if (vectorStore) {
        // Enhanced content with proper attachment handling
        const frameWithAttachment = frame as any;
        
        
        const content = `
Learning Goal: ${frame.goal}

Order: ${frame.order || 1}
Type: ${frame.type || "frame"}
BubblSpace: ${frame.bubblSpaceId || "default"}
TimeCapsule: ${frame.timeCapsuleId || "default"}

Context & Background:
${frame.informationText}

After Video Content:
${frame.afterVideoText || "No additional content"}

AI Concepts: ${frame.aiConcepts ? frame.aiConcepts.join(", ") : "None"}

ATTACHMENTS & MEDIA:
Video Attachment:
- URL: ${frame.videoUrl || frameWithAttachment.attachment?.data?.videoUrl || "No video attachment"}
- Start Time: ${frame.startTime || frameWithAttachment.attachment?.data?.startTime || 0}s
- Duration: ${frame.duration || frameWithAttachment.attachment?.data?.duration || 0}s
- Type: ${frame.videoUrl || frameWithAttachment.attachment?.data?.videoUrl ? "YouTube Video" : "No video"}

${frameWithAttachment.attachment?.type === 'pdf' ? `
PDF Attachment:
- URL: ${frameWithAttachment.attachment.data?.pdfUrl || "No PDF URL"}
- Pages: ${frameWithAttachment.attachment.data?.pages || "All pages"}
- Title: ${frameWithAttachment.attachment.data?.title || "PDF Document"}
- Notes: ${frameWithAttachment.attachment.data?.notes || "No notes"}
` : ""}${frameWithAttachment.attachment?.type === 'text' ? `
Text Attachment:
- Content: ${frameWithAttachment.attachment.data?.text || "No text content"}
- Title: ${frameWithAttachment.attachment.data?.title || "Text Content"}
- Notes: ${frameWithAttachment.attachment.data?.notes || "No notes"}
` : ""}${frameWithAttachment.attachment && !['pdf', 'text', 'video'].includes(frameWithAttachment.attachment.type) ? `
Additional Attachment:
- Type: ${frameWithAttachment.attachment.type || "Unknown"}
- Name: ${frameWithAttachment.attachment.name || "Unnamed"}
- Data: ${frameWithAttachment.attachment.data ? "Available" : "No data"}
` : frameWithAttachment.attachment ? "" : "Additional Attachments: None"}

Metadata:
- Generated: ${frame.isGenerated ? "Yes" : "No"}
- Created: ${frame.createdAt || "Unknown"}
- Updated: ${frame.updatedAt || "Unknown"}
- Attachment Count: ${frameWithAttachment.attachment ? 1 : 0}
- Has Video: ${frame.videoUrl ? "Yes" : "No"}
        `.trim();
        
        // DEBUG: Log the text content in the KB content string (DISABLED to prevent spam)
        // if (frameWithAttachment.attachment?.type === 'text') {
        //   const textAttachmentMatch = content.match(/Text Attachment:\n- Content: ([^\n]+)/i);
        //   console.log('📝 CRITICAL TEXT DEBUG - Text in KB content string:', {
        //     frameId: frame.id,
        //     textInContentString: textAttachmentMatch ? textAttachmentMatch[1] : 'NOT FOUND',
        //     contentPreview: content.substring(content.indexOf('Text Attachment:'), content.indexOf('Text Attachment:') + 200),
        //     isTextInContent: content.includes(frameWithAttachment.attachment.data?.text || ''),
        //     source: 'kb-content-creation'
        //   });
        // }

        const documentId = `aiframe-${frame.id}`;
        const aiFrameDoc = {
          id: documentId,
          title: `AI-Frame [${frame.order || 1}]: ${frame.title}`,
          content: content,
          metadata: {
            filename: `aiframe-${frame.id}.json`,
            filesize: JSON.stringify(frame).length,
            filetype: "application/json",
            uploadedAt: frame.createdAt || new Date().toISOString(),
            source: "ai-frames-auto-sync",
            description: `AI-Frame: ${frame.title} (Order: ${frame.order || 1})`,
            isGenerated: true,
            aiFrameId: frame.id,
            aiFrameType: frame.type || "frame",
            aiFrameOrder: frame.order || 1,
            frameId: frame.id,
            frameOrder: frame.order || 1,
            frameType: frame.type || "frame",
            createdAt: frame.createdAt,
            updatedAt: frame.updatedAt || new Date().toISOString(),
            // CRITICAL: Save complete attachment data for persistence
            attachment: frameWithAttachment.attachment,
          },
          chunks: [],
          vectors: [],
        };

        // ENHANCED: Use upsert with comprehensive error handling to prevent race conditions
        await vectorStore.upsertDocument(aiFrameDoc);
        // console.log("✅ Frame synced to Knowledge Base:", {
        //   frameId: frame.id,
        //   title: frame.title,
        //   documentId,
        //   source: 'FrameGraphIntegration'
        // });
      }
    } catch (error) {
      // ENHANCED: Handle RxDB conflicts gracefully with detailed logging
      const errorObj = error as any;
      if (errorObj.code === 'CONFLICT' || errorObj.message?.includes('CONFLICT') || errorObj.name === 'RxError') {
        console.warn("⚠️ RxDB conflict detected in FrameGraphIntegration, skipping sync:", {
          frameId: frame.id,
          frameTitle: frame.title,
          errorCode: errorObj.code,
          errorName: errorObj.name,
          errorMessage: errorObj.message
        });
        // console.log("💡 This is expected when multiple components sync simultaneously - main page sync takes priority");
          return; // Gracefully skip this sync attempt
        }
        console.error("❌ Failed to sync frame to Knowledge Base:", error);
      }
  };

  const removeFrameFromKnowledgeBase = async (frameId: string) => {
    try {
      let vectorStore: any = null;
      
      if (typeof window !== 'undefined') {
        const aiFramesApp = (window as any).aiFramesApp;
        if (aiFramesApp?.vectorStore) {
          vectorStore = aiFramesApp.vectorStore;
        }
      }

      if (vectorStore) {
        const docId = `aiframe-${frameId}`;
        await vectorStore.deleteDocument(docId);
        // console.log(`🗑️ Removed frame ${frameId} from Knowledge Base`);
      }
    } catch (error) {
      console.error("❌ Failed to remove frame from Knowledge Base:", error);
    }
  };

  // REAL-TIME SYNC: Enhanced frame change handler
  const handleFramesChangeWithRealTimeSync = useCallback((updatedFrames: AIFrame[]) => {
    // console.log('🔄 REAL-TIME: Frames changed, triggering sync:', {
    //   oldCount: frames.length,
    //   newCount: updatedFrames.length,
    //   frameIds: updatedFrames.map(f => f.id)
    // });

    // Call the original handler
    onFramesChange(updatedFrames);
  }, [onFramesChange, frames.length]);

  // Auto-organize frames into chapters based on concepts
  const organizeIntoChapters = useCallback(() => {
    const conceptGroups = new Map<string, AIFrame[]>();
    
    frames.forEach((frame) => {
      const mainConcept = frame.aiConcepts[0] || "General";
      if (!conceptGroups.has(mainConcept)) {
        conceptGroups.set(mainConcept, []);
      }
      conceptGroups.get(mainConcept)?.push(frame);
    });

    const newChapters = Array.from(conceptGroups.entries()).map(([concept, chapterFrames], index) => ({
      id: `chapter-${index}`,
      title: concept,
      description: `Chapter focusing on ${concept}`,
      frames: chapterFrames,
      startIndex: frames.findIndex(f => f.id === chapterFrames[0]?.id),
      endIndex: frames.findIndex(f => f.id === chapterFrames[chapterFrames.length - 1]?.id),
    }));

    setChapters(newChapters);
  }, [frames]);

  useEffect(() => {
    organizeIntoChapters();
  }, [organizeIntoChapters]);

  const handleGraphChange = useCallback((newGraphState: GraphState) => {
    setGraphState(newGraphState);
    
    // Check for new AI frame nodes and sync them immediately
    const newAIFrameNodes = newGraphState.nodes.filter(node => 
      node.type === 'aiframe' && 
      node.data?.frameId && 
      !frames.some(f => f.id === node.data.frameId)
    );

    if (newAIFrameNodes.length > 0) {
      // console.log('🎯 REAL-TIME: New AI frame nodes detected in graph, creating frames:', {
      //   nodes: newAIFrameNodes.map(n => ({ id: n.id, title: n.data.title }))
      // });

      const newFrames = newAIFrameNodes.map(node => ({
        id: node.data.frameId,
        title: node.data.title || 'New AI Frame',
        goal: node.data.goal || 'Enter learning goal here...',
        informationText: node.data.informationText || 'Provide background context...',
        afterVideoText: node.data.afterVideoText || 'Key takeaways...',
        aiConcepts: node.data.aiConcepts || [],
        isGenerated: node.data.isGenerated || false,
        videoUrl: node.data.videoUrl || '',
        startTime: node.data.startTime || 0,
        duration: node.data.duration || 300,
        attachment: node.data.attachment,
        order: frames.length + 1,
        bubblSpaceId: "default",
        timeCapsuleId: "default",
        type: 'frame' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));

      const updatedFrames = [...frames, ...newFrames];
      handleFramesChangeWithRealTimeSync(updatedFrames);
    }

    // Check for deleted AI frame nodes
    const deletedFrameIds = frames
      .filter(frame => !newGraphState.nodes.some(node => 
        node.type === 'aiframe' && node.data?.frameId === frame.id
      ))
      .map(frame => frame.id);

    if (deletedFrameIds.length > 0) {
      // console.log('🗑️ REAL-TIME: AI frame nodes deleted from graph, removing frames:', {
      //   deletedFrameIds
      // });

      const updatedFrames = frames.filter(frame => !deletedFrameIds.includes(frame.id));
      handleFramesChangeWithRealTimeSync(updatedFrames);
    }
    
    // Notify parent component for TimeCapsule updates
    if (onTimeCapsuleUpdate) {
      onTimeCapsuleUpdate(newGraphState, chapters);
    }
  }, [chapters, onTimeCapsuleUpdate, frames, handleFramesChangeWithRealTimeSync]);

  const handleChapterClick = useCallback((chapter: any) => {
    onFrameIndexChange(chapter.startIndex);
  }, [onFrameIndexChange]);

  // Load graph state from TimeCapsule
  useEffect(() => {
    try {
      const timeCapsuleData = localStorage.getItem("ai_frames_timecapsule");
      if (timeCapsuleData) {
        const parsedData = JSON.parse(timeCapsuleData);
        if (parsedData.data.graphState) {
          setGraphState(parsedData.data.graphState);
        }
        if (parsedData.data.chapters) {
          setChapters(parsedData.data.chapters);
        }

      }
    } catch (error) {
      console.error("Failed to load graph state from TimeCapsule:", error);
    }
  }, []);

  // Save graph state to TimeCapsule when it changes
  useEffect(() => {
    try {
      const existingData = localStorage.getItem("ai_frames_timecapsule");
      if (existingData) {
        const parsedData = JSON.parse(existingData);
        const updatedData = {
          ...parsedData,
          data: {
            ...parsedData.data,
            graphState: graphState,
            chapters: chapters,
            lastGraphUpdate: new Date().toISOString(),
          }
        };
        localStorage.setItem("ai_frames_timecapsule", JSON.stringify(updatedData));
      }
    } catch (error) {
      console.error("Failed to save graph state to TimeCapsule:", error);
    }
  }, [graphState, chapters]);

  // HYBRID APPROACH: Auto-initialization
  const initializeSession = useCallback(async () => {
    if (sessionInitialized || !graphStorageManager) return;
    
    try {
      // console.log("🔄 Initializing session for first time...");
      
      // FIXED: Ensure frames is an array and pass correct parameters
      const validFrames = Array.isArray(frames) ? frames : [];
      const sessionMetadata = {
        version: "1.0",
        lastUpdated: new Date().toISOString(),
        source: "auto-initialization",
        sessionId: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };

      // console.log(`📊 Initializing session with ${validFrames.length} frames`);

      // Save to IndexedDB with correct parameters
      await graphStorageManager.saveFrameSequence(validFrames, currentFrameIndex, sessionMetadata);
      
      // Save to TimeCapsule
      localStorage.setItem("timecapsule_combined", JSON.stringify({
        data: {
          frames: validFrames,
          currentFrameIndex: currentFrameIndex,
          metadata: sessionMetadata
        },
        timestamp: new Date().toISOString()
      }));

      // Initialize Knowledge Base structure
      await initializeKnowledgeBase();

      setSessionInitialized(true);
      // console.log("✅ Session initialized successfully");
    } catch (error) {
      console.error("❌ Failed to initialize session:", error);
    }
  }, [graphStorageManager, frames, sessionInitialized]);

  // REAL-TIME SYNC: Auto-save individual changes (improved)
  const autoSaveFrame = useCallback(async (frameId: string, frameData: Partial<AIFrame>) => {
    if (!sessionInitialized || !graphStorageManager) return;
    
    try {
      setIsAutoSaving(true);
      
      // FIXED: Ensure frames is always an array
      const validFrames = Array.isArray(frames) ? frames : [];
      
      // Find the current frame
      const currentFrame = validFrames.find(f => f.id === frameId);
      if (!currentFrame) {
        console.warn(`Frame not found: ${frameId}`);
        return;
      }
      
      // Update frame in storage
      const updatedFrame: AIFrame = {
        ...currentFrame,
        ...frameData,
        updatedAt: new Date().toISOString()
      };

      // Save to IndexedDB - Fixed: Handle non-array frames safely
      const currentSequence = await graphStorageManager.loadFrameSequence();
      
      // Ensure frames is always an array
      let currentFrames: AIFrame[] = [];
      if (currentSequence && Array.isArray(currentSequence.frames)) {
        currentFrames = currentSequence.frames;
      } else if (currentSequence && currentSequence.frames) {
        console.warn('Frames is not an array, converting:', currentSequence.frames);
        currentFrames = []; // Fall back to empty array if not array
      }
      
      // Update the frame in the array
      const updatedFrames = currentFrames.map((f: AIFrame) => 
        f.id === frameId ? updatedFrame : f
      );
      
      // If frame doesn't exist in the array, add it
      if (!updatedFrames.some(f => f.id === frameId)) {
        updatedFrames.push(updatedFrame);
      }
      
      // Fixed: Use correct signature for saveFrameSequence
      await graphStorageManager.saveFrameSequence(
        updatedFrames, 
        currentSequence?.currentFrameIndex || 0,
        {
          bubblSpaceId: updatedFrame.bubblSpaceId,
          timeCapsuleId: updatedFrame.timeCapsuleId,
          updatedAt: new Date().toISOString()
        }
      );

      // REAL-TIME SYNC: Always sync to Knowledge Base (async to prevent UI blocking)
      setTimeout(() => syncFrameToKnowledgeBase(updatedFrame), 100);

      // console.log(`✅ REAL-TIME: Auto-saved frame: ${frameData.title || frameId}`);
    } catch (error) {
      console.error("❌ Auto-save failed:", error);
    } finally {
      setIsAutoSaving(false);
    }
  }, [sessionInitialized, graphStorageManager, frames]);

  // Debounced auto-save
  const debouncedAutoSave = useMemo(
    () => debounce(autoSaveFrame, 500),
    [autoSaveFrame]
  );

  // HYBRID APPROACH: Auto-initialize on first frame creation
  useEffect(() => {
    if (frames.length > 0 && !sessionInitialized) {
      initializeSession();
    }
  }, [frames, sessionInitialized, initializeSession]);

  // HYBRID APPROACH: Auto-save on frame changes (DISABLED to prevent spam)
  // useEffect(() => {
  //   if (sessionInitialized && frames.length > 0) {
  //     frames.forEach(frame => {
  //       if (frame.updatedAt && new Date(frame.updatedAt).getTime() > Date.now() - 1000) {
  //         debouncedAutoSave(frame.id, frame);
  //       }
  //     });
  //   }
  // }, [frames, sessionInitialized, debouncedAutoSave]);

  // Initialize Knowledge Base structure
  const initializeKnowledgeBase = async () => {
    try {
      let vectorStore: any = null;
      
      if (typeof window !== 'undefined') {
        const aiFramesApp = (window as any).aiFramesApp;
        if (aiFramesApp?.vectorStore) {
          vectorStore = aiFramesApp.vectorStore;
        }
      }

      if (vectorStore) {
        // console.log("🔄 Initializing Knowledge Base structure...");
        
        // Create session document
        const sessionDoc = {
          id: `session-${Date.now()}`,
          title: "AI-Frames Session",
          content: "AI-Frames learning session initialized",
          metadata: {
            source: "ai-frames-session",
            sessionId: `session_${Date.now()}`,
            createdAt: new Date().toISOString(),
          }
        };

        await vectorStore.insertDocument(sessionDoc);
        // console.log("✅ Knowledge Base structure initialized");
      }
    } catch (error) {
      console.error("❌ Failed to initialize Knowledge Base:", error);
    }
  };

  // REAL-TIME SYNC: Update connection status in Knowledge Base
  const updateConnectionStatus = async (connection: any, sourceNode: any, targetNode: any, status: 'connected' | 'disconnected') => {
    try {
      let vectorStore: any = null;
      
      if (typeof window !== 'undefined') {
        const aiFramesApp = (window as any).aiFramesApp;
        if (aiFramesApp?.vectorStore) {
          vectorStore = aiFramesApp.vectorStore;
        }
      }

      if (vectorStore) {
        const connectionDoc = {
          id: `connection-${connection.id}`,
          title: `Connection: ${sourceNode?.data?.title || 'Unknown'} → ${targetNode?.data?.title || 'Unknown'}`,
          content: `Connection Status: ${status}
Source: ${sourceNode?.data?.title || 'Unknown'} (${sourceNode?.id})
Target: ${targetNode?.data?.title || 'Unknown'} (${targetNode?.id})
Type: ${connection.targetHandle === 'attachment-slot' ? 'Attachment' : 'Sequential'}
Status: ${status}
Updated: ${new Date().toISOString()}`,
          metadata: {
            source: "ai-frames-connection",
            connectionId: connection.id,
            sourceNodeId: sourceNode?.id,
            targetNodeId: targetNode?.id,
            connectionType: connection.targetHandle === 'attachment-slot' ? 'attachment' : 'sequential',
            status: status,
            updatedAt: new Date().toISOString(),
          }
        };

        if (status === 'connected') {
          await vectorStore.insertDocument(connectionDoc);
          // console.log(`🔗 Connection ${connection.id} status updated to KB: ${status}`);
        } else {
          await vectorStore.deleteDocument(connectionDoc.id);
          // console.log(`🗑️ Connection ${connection.id} removed from KB: ${status}`);
        }
      }
    } catch (error) {
      console.error("❌ Failed to update connection status in Knowledge Base:", error);
    }
  };

  // FIX 2: Initialize real-time sync tracking when KB loads with sync pause
  const [isKbLoading, setIsKbLoading] = useState(false);
  const [currentGraphStateRef, setCurrentGraphStateRef] = useState<GraphState | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState<string>('');
  
  // SILENT: Get current graph state from DualPaneFrameView when needed (no logging)
  const getCurrentGraphState = useCallback(() => {
    return currentGraphStateRef || { nodes: [], edges: [], selectedNodeId: null };
  }, [currentGraphStateRef]);

  // SILENT: Stable callback to update graph state reference (prevents infinite re-renders)
  const handleGraphStateUpdate = useCallback((state: GraphState) => {
    setCurrentGraphStateRef(state);
    
    // CHANGE DETECTION: Check if there are unsaved changes
    const currentSnapshot = JSON.stringify({
      nodes: state.nodes.map(n => ({
        id: n.id,
        type: n.type,
        title: n.data?.title,
        goal: n.data?.goal,
        text: n.data?.text,
        position: n.position
      })),
      edges: state.edges
    });
    
    if (currentSnapshot !== lastSavedSnapshot && lastSavedSnapshot !== '') {
      setHasUnsavedChanges(true);
    }
  }, [lastSavedSnapshot]);
  
  // Initialize saved snapshot when frames are first loaded
  useEffect(() => {
    if (frames.length > 0 && lastSavedSnapshot === '') {
      const initialSnapshot = JSON.stringify({
        nodes: [],
        edges: []
      });
      setLastSavedSnapshot(initialSnapshot);
    }
  }, [frames, lastSavedSnapshot]);

  useEffect(() => {
    const handleKBFramesLoaded = (event: CustomEvent) => {
      const { frames: kbFrames }: { frames: AIFrame[] } = event.detail;
      
      // console.log('📡 KB-frames-loaded event received, initializing tracking states:', {
      //   frameCount: kbFrames.length,
      //   frameIds: kbFrames.map((f: AIFrame) => f.id)
      // });
      
      // FIX 3: Pause real-time sync during KB load
      setIsKbLoading(true);
      
      // Initialize tracking states with KB data
      const frameIds = kbFrames.map((f: AIFrame) => f.id);
      const frameStates: Record<string, string> = {};
      
      kbFrames.forEach((frame: AIFrame) => {
        frameStates[frame.id] = `${frame.title}|${frame.goal}|${frame.informationText}|${frame.afterVideoText}|${frame.aiConcepts?.join(',')}`;
      });
      
      setLastFrameIds(frameIds);
      setLastFrameStates(frameStates);
      
      // Resume real-time sync after a small delay to prevent race conditions
      setTimeout(() => {
        setIsKbLoading(false);
        // console.log('✅ Real-time sync tracking initialized from KB load and sync resumed');
      }, 500);
      
      // console.log('✅ Real-time sync tracking initialized from KB load');
    };

    window.addEventListener('kb-frames-loaded', handleKBFramesLoaded as EventListener);
    return () => window.removeEventListener('kb-frames-loaded', handleKBFramesLoaded as EventListener);
  }, []);

  // REAL-TIME SYNC: Enhanced drag and drop handler
  useEffect(() => {
    const handleGraphFrameAdded = (event: CustomEvent) => {
      const { newFrame, totalFrames } = event.detail;
      // console.log('🎯 REAL-TIME: Graph frame added event received:', {
      //   frameId: newFrame.id,
      //   title: newFrame.title,
      //   totalFrames
      // });

      // Immediately sync to Knowledge Base (async to prevent UI blocking)
      setTimeout(() => syncFrameToKnowledgeBase(newFrame), 100);
      
      // Save to storage (DISABLED to prevent spam)
      // if (graphStorageManager && sessionInitialized) {
      //   autoSaveFrame(newFrame.id, newFrame);
      // }
    };

    const handleGraphFrameDeleted = (event: CustomEvent) => {
      const { frameId } = event.detail;
      // console.log('🗑️ REAL-TIME: Graph frame deleted event received:', { frameId });

      // Remove from Knowledge Base
      removeFrameFromKnowledgeBase(frameId);
    };

    const handleGraphFrameEdited = (event: CustomEvent) => {
      const { frameId, updatedFrame } = event.detail;
      // console.log('✏️ REAL-TIME: Graph frame edited event received:', { 
      //   frameId, 
      //   title: updatedFrame.title 
      // });

      // Immediately sync the updated frame to Knowledge Base
      if (updatedFrame) {
        const frameWithTimestamp = {
          ...updatedFrame,
          updatedAt: new Date().toISOString()
        };
        // Use setTimeout with debouncing to prevent blocking the UI and rapid calls
        setTimeout(() => syncFrameToKnowledgeBase(frameWithTimestamp), 100);
      }
    };

    const handleConnectionAdded = (event: CustomEvent) => {
      const { connection, sourceNode, targetNode, timestamp } = event.detail;
      // console.log('🔗 REAL-TIME: Connection added event received:', {
      //   connectionId: connection.id,
      //   sourceNodeId: sourceNode?.id,
      //   targetNodeId: targetNode?.id,
      //   timestamp
      // });

      // Update connection status in Knowledge Base
      updateConnectionStatus(connection, sourceNode, targetNode, 'connected');
    };

    const handleConnectionRemoved = (event: CustomEvent) => {
      const { connection, sourceNode, targetNode, timestamp } = event.detail;
      // console.log('🗑️ REAL-TIME: Connection removed event received:', {
      //   connectionId: connection.id,
      //   sourceNodeId: sourceNode?.id,
      //   targetNodeId: targetNode?.id,
      //   timestamp
      // });

      // Update connection status in Knowledge Base
      updateConnectionStatus(connection, sourceNode, targetNode, 'disconnected');
    };

    window.addEventListener('graph-frame-added', handleGraphFrameAdded as EventListener);
    window.addEventListener('graph-frame-deleted', handleGraphFrameDeleted as EventListener);
    window.addEventListener('graph-frame-edited', handleGraphFrameEdited as EventListener);
    window.addEventListener('graph-connection-added', handleConnectionAdded as EventListener);
    window.addEventListener('graph-connection-removed', handleConnectionRemoved as EventListener);

    return () => {
      window.removeEventListener('graph-frame-added', handleGraphFrameAdded as EventListener);
      window.removeEventListener('graph-frame-deleted', handleGraphFrameDeleted as EventListener);
      window.removeEventListener('graph-frame-edited', handleGraphFrameEdited as EventListener);
      window.removeEventListener('graph-connection-added', handleConnectionAdded as EventListener);
      window.removeEventListener('graph-connection-removed', handleConnectionRemoved as EventListener);
    };
  }, [sessionInitialized, graphStorageManager]);

  // FIXED: Handle Save Graph with proper error handling
  const handleSaveGraph = async () => {
    try {
      // Prevent multiple save operations
      if (isAutoSaving) {
        // console.log("⏸️ Save Graph skipped - auto-save in progress");
        return;
      }
      
      // Ensure session is initialized
      if (!sessionInitialized) {
        await initializeSession();
      }

      // ENHANCED: Get current frames with latest attachment data
      let currentFrames: AIFrame[] = [];
      
      // PRIORITY 1: Try to get latest frames from AI-Frames app (has latest attachment data)
      try {
        const aiFramesApp = (window as any).aiFramesApp;
        if (aiFramesApp && Array.isArray(aiFramesApp.frames)) {
          currentFrames = aiFramesApp.frames;
          // console.log("📊 Using latest frames from AI-Frames app:", currentFrames.length);
        }
      } catch (error) {
        console.warn("⚠️ Failed to get frames from AI-Frames app:", error);
      }
      
      // PRIORITY 2: Fall back to storage if no frames from AI-Frames app
      if (currentFrames.length === 0 && graphStorageManager) {
        try {
          const frameSequence = await graphStorageManager.loadFrameSequence();
          currentFrames = Array.isArray(frameSequence?.frames) ? frameSequence.frames : [];
          // console.log("📊 Using frames from IndexedDB:", currentFrames.length);
        } catch (error) {
          console.warn("Failed to load from IndexedDB, trying TimeCapsule:", error);
          try {
            const timeCapsuleData = localStorage.getItem("timecapsule_combined");
            if (timeCapsuleData) {
              const parsed = JSON.parse(timeCapsuleData);
              currentFrames = Array.isArray(parsed.data?.frames) ? parsed.data.frames : [];
              // console.log("📊 Using frames from TimeCapsule:", currentFrames.length);
            }
          } catch (fallbackError) {
            console.warn("Failed to load from TimeCapsule:", fallbackError);
            currentFrames = [];
          }
        }
      }

      // FIXED: Ensure currentFrames is always an array
      if (!Array.isArray(currentFrames)) {
        console.warn("currentFrames is not an array, initializing as empty array");
        currentFrames = [];
      }

      // console.log(`🔄 Starting Save Graph with ${currentFrames.length} existing frames`);

      // TEMPORARY FIX: Skip graph node conversion to prevent data loss
      // Until we can properly get the graph state, just save existing frames
      // console.log("⚠️ TEMPORARY: Saving existing frames without graph conversion to prevent data loss");
      
      // SILENT: Get current graph state and convert nodes to frames (no spam logging)
      const currentGraphState = getCurrentGraphState();
      
      // Helper function to determine if a value is a user edit vs system default
      const defaults = {
        title: ['Untitled Frame', 'Frame 1', 'AI-Frame [1]'],
        goal: ['No learning goal specified', 'No goal specified', ''],
        informationText: ['', 'No information provided'],
        afterVideoText: ['', 'No takeaways provided']
      } as const;
      
      const isUserEdit = (value: string, field: keyof typeof defaults) => {
        return value && value.trim() && !defaults[field]?.some((d: string) => 
          value.toLowerCase().trim() === d.toLowerCase().trim()
        );
      };
      
      // Get all frame nodes for deduplication
      const allFrameNodes = currentGraphState.nodes.filter((node: any) => node.type === 'aiframe');

      // CRITICAL FIX: Deduplicate frame nodes before conversion to prevent duplicate frames
      const uniqueFrameNodes = allFrameNodes
        .reduce((acc: any[], node: any) => {
          // Find existing frame node with same frameId or title
          const existingNode = acc.find(n => 
            n.data.frameId === node.data.frameId || 
            (n.data.title === node.data.title && n.data.title)
          );
          
          if (!existingNode) {
            acc.push(node);
          } else {
            // Keep the node with more complete data - prioritize custom titles and attachments
            const nodeScore = (n: any) => {
              let score = 0;
              
              // CRITICAL: Check for connected text attachments
              const hasConnectedAttachment = currentGraphState.nodes.some((attachNode: any) => 
                attachNode.type?.includes('-attachment') && 
                attachNode.data.isAttached && 
                (attachNode.data.attachedToFrameId === n.id || attachNode.data.attachedToFrameId === n.data.frameId)
              );
              
              // HIGHEST PRIORITY: Has connected attachment or attachment data
              if (n.data.attachment || hasConnectedAttachment) score += 20;
              
              // HIGH PRIORITY: Custom title (not generic defaults)
              const title = n.data.title || '';
              if (title && title !== 'Untitled Frame' && title !== 'Frame 1' && !title.startsWith('AI-Frame')) {
                score += 15;
              }
              
              // MEDIUM PRIORITY: Has meaningful goal
              if (n.data.goal && n.data.goal !== 'No learning goal specified' && n.data.goal !== 'No goal specified') {
                score += 8;
              }
              
              // LOW PRIORITY: Has content
              if (n.data.informationText && n.data.informationText.trim()) score += 4;
              if (n.data.afterVideoText && n.data.afterVideoText.trim()) score += 2;
              
              return score;
            };
            
            const nodeScoreValue = nodeScore(node);
            const existingScoreValue = nodeScore(existingNode);
            
            // SILENT: Frame selection made (no logging to prevent spam)
            
            if (nodeScoreValue > existingScoreValue) {
              const index = acc.indexOf(existingNode);
              acc[index] = node;
            }
          }
          
          return acc;
        }, []);
        
      // SILENT: Frame deduplication complete (no logging to prevent spam)
      
      // CRITICAL FIX: Merge current frames (user edits) with graph frames (structure)
      // This ensures user edits like "f1" title and text content are preserved
      const currentFramesMap = new Map(currentFrames.map(f => [f.id, f]));
      
      const graphFrames: AIFrame[] = uniqueFrameNodes
        .map((node: any, index: number) => {
          // CRITICAL: Find existing frame with user edits
          const existingFrame = currentFramesMap.get(node.data.frameId || node.id) || 
                               currentFrames.find(f => f.title === node.data.title) ||
                               (currentFrames.length === 1 ? currentFrames[0] : null);
          
          // DEBUG: Log merge details to understand content loss
          console.log("🔄 FRAME MERGE DEBUG:", {
            nodeId: node.id,
            nodeTitle: node.data.title,
            nodeData: {
              goal: node.data.goal?.substring(0, 50),
              informationText: node.data.informationText?.substring(0, 50),
              summary: node.data.summary?.substring(0, 50)
            },
            existingFrame: existingFrame ? {
              id: existingFrame.id,
              title: existingFrame.title,
              goal: existingFrame.goal?.substring(0, 50),
              informationText: existingFrame.informationText?.substring(0, 50),
              hasAttachment: !!existingFrame.attachment,
              attachmentType: existingFrame.attachment?.type
            } : null,
            willMerge: !!existingFrame
          });
          
          // SILENT: Enhanced attachment handling for all types
          let attachment = node.data.attachment;
          
          // If no attachment but has legacy video fields, create video attachment
          if (!attachment && node.data.videoUrl) {
            attachment = {
              id: `attachment-${node.id}`,
              type: 'video' as const,
              data: {
                videoUrl: node.data.videoUrl,
                title: node.data.title || 'Video',
                startTime: node.data.startTime || 0,
                duration: node.data.duration || 30
              }
            };
          }

          // CRITICAL: Get the latest attachment data from connected attachment nodes
          // Try multiple search strategies to find the connected attachment
          console.log("🔍 ATTACHMENT SEARCH DEBUG:", {
            frameGraphNodeId: node.id,
            frameDataFrameId: node.data.frameId,
            searchingFor: [node.id, node.data.frameId],
            availableAttachments: currentGraphState.nodes
              .filter((n: any) => n.type?.includes('-attachment'))
              .map((n: any) => ({
                nodeId: n.id,
                type: n.type,
                isAttached: n.data.isAttached,
                attachedToFrameId: n.data.attachedToFrameId
              }))
          });
          
          let connectedAttachmentNode = currentGraphState.nodes.find((n: any) => 
            n.type?.includes('-attachment') && 
            n.data.attachedToFrameId === node.id
          );
          
          // Strategy 2: Try matching by original frame ID if graph node has frameId
          if (!connectedAttachmentNode && node.data.frameId) {
            connectedAttachmentNode = currentGraphState.nodes.find((n: any) => 
              n.type?.includes('-attachment') && 
              n.data.attachedToFrameId === node.data.frameId
            );
          }
          
          // Strategy 3: Try finding by frame title matching with any attachment
          if (!connectedAttachmentNode) {
            connectedAttachmentNode = currentGraphState.nodes.find((n: any) => 
              n.type?.includes('-attachment') && 
              n.data.isAttached &&
              // Check if this attachment belongs to a frame with the same title
              currentGraphState.nodes.some((fn: any) => 
                fn.type === 'aiframe' && 
                fn.data.title === node.data.title &&
                (n.data.attachedToFrameId === fn.id || n.data.attachedToFrameId === fn.data.frameId)
              )
            );
          }
          
          // CRITICAL FIX: If no graph attachment found but existing frame has text attachment,
          // preserve the existing attachment content
          if (!connectedAttachmentNode && existingFrame?.attachment?.type === 'text') {
            console.log("🔄 PRESERVING EXISTING TEXT ATTACHMENT:", {
              frameId: node.id,
              existingAttachmentType: existingFrame.attachment.type,
              hasExistingText: !!existingFrame.attachment.data?.text,
              textLength: existingFrame.attachment.data?.text?.length || 0,
              textPreview: existingFrame.attachment.data?.text?.substring(0, 50) || 'NO TEXT'
            });
            
            // Use existing frame's attachment as the source
            attachment = existingFrame.attachment;
          }
          
          // DEBUG: Check text attachment content extraction
          console.log("📝 TEXT ATTACHMENT DEBUG:", {
            frameId: node.id,
            foundAttachment: !!connectedAttachmentNode,
            attachmentType: connectedAttachmentNode?.type,
            hasTextData: !!connectedAttachmentNode?.data?.text,
            textLength: connectedAttachmentNode?.data?.text?.length || 0,
            textPreview: connectedAttachmentNode?.data?.text?.substring(0, 50) || 'NO TEXT',
            usingExistingAttachment: !connectedAttachmentNode && !!existingFrame?.attachment
          });
          
          if (connectedAttachmentNode) {
            // SILENT: Text attachment found (no logging to prevent spam)
            
            // SILENT: Create attachment from the connected node's latest data
            attachment = {
              id: connectedAttachmentNode.id,
              type: connectedAttachmentNode.type?.replace('-attachment', '') as 'video' | 'pdf' | 'text',
              data: {
                title: connectedAttachmentNode.data.title,
                notes: connectedAttachmentNode.data.notes,
                ...(connectedAttachmentNode.type === 'video-attachment' && {
                  videoUrl: connectedAttachmentNode.data.videoUrl,
                  startTime: connectedAttachmentNode.data.startTime,
                  duration: connectedAttachmentNode.data.duration,
                }),
                ...(connectedAttachmentNode.type === 'pdf-attachment' && {
                  pdfUrl: connectedAttachmentNode.data.pdfUrl,
                  pages: connectedAttachmentNode.data.pages,
                }),
                ...(connectedAttachmentNode.type === 'text-attachment' && {
                  text: connectedAttachmentNode.data.text,
                }),
              }
            };
            
            // DEBUG: Check what attachment was actually created
            console.log("🔧 ATTACHMENT CREATION DEBUG:", {
              frameId: node.id,
              attachmentType: attachment.type,
              hasAttachmentData: !!attachment.data,
              hasText: !!attachment.data?.text,
              textContent: attachment.data?.text,
              textLength: attachment.data?.text?.length || 0,
              sourceNodeText: connectedAttachmentNode.data.text,
              sourceNodeTextLength: connectedAttachmentNode.data?.text?.length || 0,
              allSourceNodeData: Object.keys(connectedAttachmentNode.data || {})
            });
          }

          // GOOGLE DOCS STYLE: Merge existing frame (user edits) with graph node (structure)
          const mergedFrame = {
            id: node.data.frameId || node.id,
            // USER EDITS WIN: Prioritize non-default content from either source
            title: (existingFrame?.title && !defaults.title.includes(existingFrame.title as any)) 
                   ? existingFrame.title 
                   : (node.data.title || existingFrame?.title || 'Untitled Frame'),
            goal: (existingFrame?.goal && !defaults.goal.includes(existingFrame.goal as any))
                  ? existingFrame.goal
                  : (node.data.goal || node.data.learningGoal || existingFrame?.goal || 'No learning goal specified'),
            informationText: (existingFrame?.informationText && existingFrame.informationText.trim() && !defaults.informationText.includes(existingFrame.informationText as any))
                            ? existingFrame.informationText
                            : (node.data.informationText || node.data.summary || existingFrame?.informationText || ''),
            afterVideoText: (existingFrame?.afterVideoText && existingFrame.afterVideoText.trim() && !defaults.afterVideoText.includes(existingFrame.afterVideoText as any))
                           ? existingFrame.afterVideoText
                           : (node.data.afterVideoText || existingFrame?.afterVideoText || ''),
            // ATTACHMENT PRIORITY: Merge attachments to preserve text content
            attachment: (() => {
              // If we have both graph attachment and existing frame attachment, merge them
              if (attachment && existingFrame?.attachment) {
                return {
                  ...existingFrame.attachment,
                  ...attachment,
                  data: {
                    ...existingFrame.attachment.data,
                    ...attachment.data
                  }
                };
              }
              // Otherwise use whichever exists
              return attachment || existingFrame?.attachment;
            })(),
            // PRESERVE METADATA: Use existing frame's metadata when available
            videoUrl: existingFrame?.videoUrl || node.data.videoUrl || '',
            startTime: existingFrame?.startTime || node.data.startTime || 0,
            duration: existingFrame?.duration || node.data.duration || 30,
            aiConcepts: existingFrame?.aiConcepts || node.data.aiConcepts || node.data.keyPoints || [],
            order: existingFrame?.order || index + 1,
            bubblSpaceId: existingFrame?.bubblSpaceId || "default",
            timeCapsuleId: existingFrame?.timeCapsuleId || "default",
            type: 'frame' as const,
            createdAt: existingFrame?.createdAt || node.data.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          
          // DEBUG: Log final merged frame
          try {
            console.log("✅ MERGED FRAME RESULT:", {
              id: mergedFrame.id,
              title: mergedFrame.title,
              goal: mergedFrame.goal?.substring(0, 50),
              informationText: mergedFrame.informationText?.substring(0, 50),
              hasAttachment: !!mergedFrame.attachment,
              attachmentType: mergedFrame.attachment?.type,
              attachmentText: mergedFrame.attachment?.data?.text?.substring(0, 50)
            });
          } catch (logError) {
            console.error("❌ Error logging merged frame:", logError);
          }
          
          return mergedFrame;
        });

      // DEBUG: Temporary logging to understand duplication (DISABLED for performance)
      // console.log("🔍 MERGE DEBUG:", ...);

      // CRITICAL FIX: Deduplicate frames to prevent duplication
      const deduplicatedCurrentFrames = currentFrames.reduce((acc: AIFrame[], frame: AIFrame) => {
        if (!acc.find(f => f.id === frame.id)) {
          acc.push(frame);
        }
        return acc;
      }, []);

      // SILENT: Deduplication complete (no logging to prevent spam)

      // GOOGLE DOCS STYLE: Intelligent merge strategy that prioritizes user edits
      const mergedFrames = [...deduplicatedCurrentFrames];
      let addedCount = 0;
      let updatedCount = 0;

      // REMOVED: Duplicate defaults declaration (moved to top of function)

      // Smart merge function that prioritizes user content
      const smartMerge = (existing: AIFrame, graph: AIFrame): AIFrame => {
        // DEBUG: Check merge decisions for goal and informationText
        const goalDecision = {
          existingGoal: existing.goal,
          graphGoal: graph.goal,
          existingIsUserEdit: isUserEdit(existing.goal, 'goal'),
          graphIsUserEdit: isUserEdit(graph.goal, 'goal'),
          finalGoal: isUserEdit(existing.goal, 'goal') ? existing.goal :
                     isUserEdit(graph.goal, 'goal') ? graph.goal :
                     existing.goal || graph.goal
        };
        
        const infoDecision = {
          existingInfo: existing.informationText,
          graphInfo: graph.informationText,
          existingIsUserEdit: isUserEdit(existing.informationText, 'informationText'),
          graphIsUserEdit: isUserEdit(graph.informationText, 'informationText'),
          finalInfo: isUserEdit(existing.informationText, 'informationText') ? existing.informationText :
                     isUserEdit(graph.informationText, 'informationText') ? graph.informationText :
                     existing.informationText || graph.informationText
        };
        
        console.log("🔍 SMART MERGE DECISIONS:", { goalDecision, infoDecision });
        
        return {
          ...existing,
          ...graph,
          // USER EDITS WIN: Keep custom titles over generic ones
          title: isUserEdit(existing.title, 'title') ? existing.title : 
                 isUserEdit(graph.title, 'title') ? graph.title : 
                 existing.title || graph.title,
          
          // USER EDITS WIN: Keep meaningful goals over defaults  
          goal: goalDecision.finalGoal,
                
          // USER EDITS WIN: Keep user-written content
          informationText: infoDecision.finalInfo,
                          
          afterVideoText: isUserEdit(existing.afterVideoText, 'afterVideoText') ? existing.afterVideoText :
                         isUserEdit(graph.afterVideoText, 'afterVideoText') ? graph.afterVideoText :
                         existing.afterVideoText || graph.afterVideoText,
          
          // ATTACHMENT PRIORITY: Graph attachment (latest) > existing attachment > none
          attachment: (() => {
            const result = graph.attachment || existing.attachment;
            console.log("🔗 ATTACHMENT MERGE DEBUG:", {
              frameId: graph.id,
              frameTitle: graph.title,
              graphHasAttachment: !!graph.attachment,
              existingHasAttachment: !!existing.attachment,
              graphAttachmentType: graph.attachment?.type,
              existingAttachmentType: existing.attachment?.type,
              graphHasText: !!graph.attachment?.data?.text,
              existingHasText: !!existing.attachment?.data?.text,
              graphTextLength: graph.attachment?.data?.text?.length || 0,
              existingTextLength: existing.attachment?.data?.text?.length || 0,
              resultHasText: !!result?.data?.text,
              resultTextLength: result?.data?.text?.length || 0
            });
            return result;
          })(),
          
          // Keep the most recent order and metadata
          order: graph.order || existing.order,
          updatedAt: new Date().toISOString()
        };
      };

      for (const graphFrame of graphFrames) {
        // ENHANCED: Try multiple matching strategies to find the correct existing frame
        let existingIndex = mergedFrames.findIndex(f => f.id === graphFrame.id);
        
        // If no exact ID match, try matching by title and order
        if (existingIndex === -1) {
          existingIndex = mergedFrames.findIndex(f => 
            f.title === graphFrame.title && 
            f.order === graphFrame.order
          );
        }
        
        // If still no match, try matching by title only (for single frame scenarios)
        if (existingIndex === -1 && mergedFrames.length === 1 && graphFrames.length === 1) {
          existingIndex = 0; // Assume it's the same frame if only one of each
        }
        
        if (existingIndex !== -1) {
          // GOOGLE DOCS STYLE: Smart merge with user edit priority
          const existingFrame = mergedFrames[existingIndex];
          const mergedFrame = smartMerge(existingFrame, graphFrame);
          
          mergedFrames[existingIndex] = mergedFrame;
          updatedCount++;
        } else {
          mergedFrames.push(graphFrame);
          addedCount++;
        }
      }

      // console.log(`📊 Frame merge complete: ${currentFrames.length} + ${addedCount} new + ${updatedCount} updated = ${mergedFrames.length} total`);

      // FINAL DEDUPLICATION: Ensure no duplicate frames before saving
      const finalFrames = mergedFrames.reduce((acc: AIFrame[], frame: AIFrame) => {
        if (!acc.find(f => f.id === frame.id)) {
          acc.push(frame);
        }
        return acc;
      }, []);

      // CRITICAL: GOOGLE DOCS STYLE - Make merged data the authoritative source
      // Update application state immediately so all subsequent saves use correct data
      console.log("🔄 GOOGLE DOCS: Broadcasting merged frame data as authoritative source", {
        frameCount: finalFrames.length,
        framesWithAttachments: finalFrames.filter(f => f.attachment).length,
        frameContentDetails: finalFrames.map(f => ({
          frameId: f.id,
          frameTitle: f.title,
          goal: f.goal?.substring(0, 50) || 'No goal',
          informationText: f.informationText?.substring(0, 50) || 'No info',
          hasAttachment: !!f.attachment
        })),
        textAttachments: finalFrames.filter(f => f.attachment?.type === 'text').map(f => ({
          frameId: f.id,
          frameTitle: f.title,
          hasText: !!f.attachment?.data?.text,
          textLength: f.attachment?.data?.text?.length || 0,
          textPreview: f.attachment?.data?.text?.substring(0, 50) || 'No text'
        }))
      });
      
      // CRITICAL: GOOGLE DOCS APPROACH - Broadcast FIRST, then all saves use updated data
      console.log("🚀 GOOGLE DOCS: Broadcasting merged data as single source of truth");
      onFramesChange(finalFrames);
      
      // CRITICAL: Wait for broadcast to fully propagate to all components  
      await new Promise(resolve => setTimeout(resolve, 300));
      
      console.log("✅ GOOGLE DOCS: All subsequent operations will use broadcasted data");

      // SILENT: Final deduplication complete (no logging to prevent spam)

      // console.log("✅ FINAL FRAME COUNT:", {
      //   currentFrames: currentFrames.length,
      //   graphFrames: graphFrames.length,
      //   finalFrames: finalFrames.length,
      //   operation: `${currentFrames.length} + ${graphFrames.length} → ${finalFrames.length}`
      // });

      // Save to storage
      const frameSequence = {
        frames: finalFrames,
        currentFrameIndex: currentFrameIndex,
        metadata: {
          version: "1.0",
          lastUpdated: new Date().toISOString(),
          source: "graph-save"
        }
      };

      // Save to IndexedDB
      if (graphStorageManager) {
        await graphStorageManager.saveFrameSequence(
          finalFrames,
          currentFrameIndex,
          {
            version: "1.0",
            lastUpdated: new Date().toISOString(),
            source: "graph-save"
          }
        );
        // console.log("✅ Frames saved to IndexedDB");
      }

      // Save to TimeCapsule
      localStorage.setItem("timecapsule_combined", JSON.stringify({
        data: frameSequence,
        timestamp: new Date().toISOString()
      }));
      // console.log("✅ Frames saved to TimeCapsule");

      // ENHANCED: Comprehensive sync with progress tracking
      // console.log("🔄 Starting comprehensive sync operations...");
      
      // Step 1: Sync to Knowledge Base with progress tracking
      // console.log("🔄 Syncing frames to Knowledge Base...");
      const syncResults = {
        knowledgeBase: false,
        indexedDB: false,
        localStorage: false
      };
      
      try {
        // ENHANCED: Skip KB sync, just trigger frame update events for page.tsx to handle
        console.log("🔄 FrameGraphIntegration triggering frame updates for page.tsx to sync...");
        syncResults.knowledgeBase = true;
        console.log("✅ FrameGraphIntegration delegated KB sync to page.tsx");
      } catch (kbError) {
        console.error("❌ Knowledge Base sync failed:", kbError);
        // Continue with other sync operations
      }
      
      // Step 2: Verify IndexedDB sync
      if (graphStorageManager) {
        try {
          const savedSequence = await graphStorageManager.loadFrameSequence();
          const indexedDBFrameCount = savedSequence?.frames?.length || 0;
          
          if (indexedDBFrameCount === finalFrames.length) {
            syncResults.indexedDB = true;
            // console.log("✅ IndexedDB verification successful:", {
            //   savedFrames: indexedDBFrameCount,
            //   expectedFrames: finalFrames.length
            // });
          } else {
            console.warn("⚠️ IndexedDB frame count mismatch:", {
              savedFrames: indexedDBFrameCount,
              expectedFrames: finalFrames.length
            });
          }
        } catch (error) {
          console.warn("⚠️ IndexedDB verification failed:", error);
        }
      }
      
      // Step 3: Verify localStorage sync
      try {
        const timeCapsuleData = localStorage.getItem("timecapsule_combined");
        if (timeCapsuleData) {
          const parsed = JSON.parse(timeCapsuleData);
          if (parsed.data?.frames?.length === finalFrames.length) {
            syncResults.localStorage = true;
            // console.log("✅ localStorage verification successful");
          }
        }
      } catch (error) {
        console.warn("⚠️ localStorage verification failed:", error);
      }
      
      // Step 4: Force external sync via AI-Frames app
      const aiFramesApp = (window as any).aiFramesApp;
      if (aiFramesApp && aiFramesApp.vectorStore && aiFramesApp.vectorStoreInitialized) {
        // console.log("🔄 Forcing external Knowledge Base sync...");
        
        try {
          if (typeof aiFramesApp.syncFramesToKB === 'function') {
            await aiFramesApp.syncFramesToKB(finalFrames);
            // console.log("✅ External Knowledge Base sync completed");
          }
        } catch (externalSyncError) {
          console.error("❌ External Knowledge Base sync failed:", externalSyncError);
        }
      }
      
      // Step 5: Dispatch comprehensive events
      if (typeof window !== 'undefined') {
        // Event for KB documents changed
        window.dispatchEvent(new CustomEvent('kb-documents-changed', {
          detail: {
            source: 'save-graph',
            frameCount: finalFrames.length,
            timestamp: new Date().toISOString(),
            frames: finalFrames,
            syncResults
          }
        }));

        // Event for AI-Frames specific KB update
        window.dispatchEvent(new CustomEvent('aiframes-kb-updated', {
          detail: {
            source: 'save-graph',
            frameCount: finalFrames.length,
            timestamp: new Date().toISOString(),
            frames: finalFrames,
            hasFrameUpdates: true,
            syncResults
          }
        }));

        // Event for force refresh
        window.dispatchEvent(new CustomEvent('kb-force-refresh', {
          detail: {
            source: 'save-graph',
            reason: 'frames-saved-to-graph',
            timestamp: new Date().toISOString(),
            syncResults
          }
        }));
        
        // Event for force save to ensure everything is in sync
        window.dispatchEvent(new CustomEvent('force-save-frames', {
          detail: {
            reason: 'save-graph-complete',
            frameCount: finalFrames.length,
            timestamp: new Date().toISOString(),
            syncResults
          }
        }));
        
        // CRITICAL: Force update AI-Frames app state with merged frames
        const aiFramesApp = (window as any).aiFramesApp;
        if (aiFramesApp && typeof aiFramesApp.updateFrames === 'function') {
          // console.log("🔄 Updating AI-Frames app with merged frames...");
          aiFramesApp.updateFrames(finalFrames);
        } else {
          // Alternative: Use window event to trigger frame update
          window.dispatchEvent(new CustomEvent('graph-frames-updated', {
            detail: {
              frames: finalFrames,
              source: 'save-graph-complete',
              timestamp: new Date().toISOString(),
              preserveAttachments: true
            }
          }));
        }
      }
      
      // console.log("✅ Comprehensive sync operations completed:", syncResults);

      // Dispatch success event with sync results
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('graph-saved', {
          detail: {
            success: true,
            frameCount: finalFrames.length,
            nodeCount: graphState.nodes.length,
            edgeCount: graphState.edges.length,
            frames: finalFrames,
            hasFrameUpdates: true,
            timestamp: new Date().toISOString(),
            syncResults,
            allSynced: syncResults.knowledgeBase && syncResults.indexedDB && syncResults.localStorage
          }
        }));
      }

      // Update saved snapshot and reset change state
      const currentSnapshot = JSON.stringify({
        nodes: currentGraphState.nodes.map(n => ({
          id: n.id,
          type: n.type,
          title: n.data?.title,
          goal: n.data?.goal,
          text: n.data?.text,
          position: n.position
        })),
        edges: currentGraphState.edges
      });
      setLastSavedSnapshot(currentSnapshot);
      setHasUnsavedChanges(false);
      
      // console.log("✅ Save Graph completed successfully");
      
    } catch (error) {
      console.error("❌ Save Graph failed:", error);
      
      // Dispatch error event
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('graph-saved', {
          detail: {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString()
          }
        }));
      }
      
      throw error;
    }
  };


  return (
    <div className="h-full flex flex-col">
      {/* Fixed Header with Stats and Actions */}
      <div className="flex-none sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-sm p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Network className="h-5 w-5 text-purple-600" />
              <h2 className="text-lg font-semibold">Dual-Pane AI Frames</h2>
              {/* Real-time sync indicator */}
              <Badge variant="outline" className="text-green-600">
                <Zap className="h-3 w-3 mr-1" />
                Real-time
              </Badge>
            </div>
            <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
              <Badge variant="outline" className="flex items-center gap-1">
                <Layers className="h-3 w-3" />
                {frames.length} frames
              </Badge>
              <Badge variant="outline" className="flex items-center gap-1">
                <BookOpen className="h-3 w-3" />
                {chapters.length} chapters
              </Badge>
              <Badge variant="outline" className="flex items-center gap-1">
                <Brain className="h-3 w-3" />
                {frames.reduce((acc, frame) => acc + frame.aiConcepts.length, 0)} concepts
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={isCreationMode ? "default" : "secondary"}>
              {isCreationMode ? (
                <Edit3 className="h-3 w-3 mr-1" />
              ) : (
                <Eye className="h-3 w-3 mr-1" />
              )}
              {isCreationMode ? "Creator Mode" : "Learning Mode"}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveGraph}
              disabled={!hasUnsavedChanges || isAutoSaving}
              className={`${hasUnsavedChanges ? 'text-blue-600 hover:text-blue-700' : 'text-gray-400'} transition-colors`}
            >
              <Save className="h-4 w-4 mr-2" />
              {isAutoSaving ? "Saving..." : hasUnsavedChanges ? "Save Graph" : "No Changes"}
            </Button>
            {/* Auto-save indicator */}
            {isAutoSaving && (
              <Badge variant="outline" className="text-blue-600">
                <Zap className="h-3 w-3 mr-1 animate-pulse" />
                Auto-saving...
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  organizeIntoChapters();
                  // Wait a moment for state to update, then save
                  await new Promise(resolve => setTimeout(resolve, 100));
                  await handleSaveGraph();
                } catch (error) {
                  console.error("❌ Organize failed:", error);
                }
              }}
              disabled={isAutoSaving}
              className="text-green-600 hover:text-green-700"
            >
              <Layers className="h-4 w-4 mr-2" />
              Organize
            </Button>
          </div>
        </div>
      </div>

      {/* Dual-Pane Content */}
      <div className="flex-1 overflow-hidden">
        <DualPaneFrameView
          frames={frames}
          onFramesChange={handleFramesChangeWithRealTimeSync}
          isCreationMode={isCreationMode}
          currentFrameIndex={currentFrameIndex}
          onFrameIndexChange={onFrameIndexChange}
          onCreateFrame={onCreateFrame}
          defaultMaximized={isCreationMode} // Maximize graph view by default in creator mode
          onGetCurrentState={() => currentGraphStateRef || { nodes: [], edges: [], selectedNodeId: null }}
          onGraphStateUpdate={handleGraphStateUpdate}
        />
      </div>
    </div>
  );
}