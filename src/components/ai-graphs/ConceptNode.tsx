import React from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConceptNodeData } from "./types";
import { Brain, Lightbulb } from "lucide-react";

export default function ConceptNode({ data, selected }: NodeProps & { data: ConceptNodeData }) {
  return (
    <div className="concept-node">
      <Handle 
        type="target" 
        position={Position.Left} 
        style={{
          width: '24px',
          height: '24px',
          backgroundColor: '#f97316',
          border: '2px solid white',
          borderRadius: '50%',
          boxShadow: '0 2px 8px rgba(249, 115, 22, 0.3)',
          zIndex: 5
        }}
      />
      
      <Card className={`w-48 ${selected ? 'ring-2 ring-yellow-500' : ''} bg-yellow-50 border-yellow-200`}>
        <CardContent className="p-3">
          <div className="flex items-start gap-2">
            <div className="p-1 bg-yellow-100 rounded">
              <Brain className="h-3 w-3 text-yellow-600" />
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-medium text-yellow-800 mb-1">
                {data.concept}
              </h4>
              {data.description && (
                <p className="text-xs text-yellow-700 opacity-80 line-clamp-2">
                  {data.description}
                </p>
              )}
              <Badge variant="outline" className="mt-2 text-xs bg-yellow-100 text-yellow-700 border-yellow-300">
                <Lightbulb className="h-2 w-2 mr-1" />
                Concept
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 