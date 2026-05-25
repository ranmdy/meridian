'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { NodePalette } from './NodePalette';
import { ComposerToolbar } from './ComposerToolbar';
import ProtocolNode from './ProtocolNode';
import type { ComposerNodeData, PaletteItem } from './types';
import { KIND_COLORS } from './palette';
import { useStrategyStore } from '@/src/stores/strategy';
import { api } from '@/src/lib/api';
import { useRouter } from 'next/navigation';
import { useLiveApy } from '@/src/hooks/useLiveApy';

const nodeTypes = { protocol: ProtocolNode };

let nodeIdCounter = 1;
function nextId() {
  return `node_${nodeIdCounter++}`;
}

export function StrategyComposer() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { setRoutes } = useStrategyStore();
  const apyMap = useLiveApy();

  // When live APY data arrives, update any lend/stake nodes already on canvas
  useEffect(() => {
    if (Object.keys(apyMap).length === 0) return;
    setNodes((nds) =>
      nds.map((n) => {
        const d = n.data as ComposerNodeData;
        if (d.kind !== 'lend' && d.kind !== 'stake') return n;
        const key = `${d.protocol}:${d.chain}:${d.asset}`;
        const liveApy = apyMap[key];
        if (liveApy === undefined || liveApy === d.apyBps) return n;
        return { ...n, data: { ...d, apyBps: liveApy } };
      }),
    );
  }, [apyMap, setNodes]);

  // ── Drag-from-palette ───────────────────────────────────────────────────────

  const onDragStart = useCallback((event: React.DragEvent, item: PaletteItem) => {
    event.dataTransfer.setData('application/x-meridian-palette', JSON.stringify(item));
    event.dataTransfer.effectAllowed = 'move';
  }, []);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const raw = event.dataTransfer.getData('application/x-meridian-palette');
      if (!raw) return;

      const item: PaletteItem = JSON.parse(raw);

      const bounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!bounds) return;

      // Convert screen coords to flow coords (approximate — no transform access needed)
      const position = {
        x: event.clientX - bounds.left - 80,
        y: event.clientY - bounds.top  - 40,
      };

      // Use live APY if available, falling back to palette default
      const liveApyKey = `${item.protocol}:${item.chain}:${item.asset}`;
      const resolvedApy = apyMap[liveApyKey] ?? item.apyBps;

      const data: ComposerNodeData = {
        label:     item.label,
        kind:      item.kind,
        protocol:  item.protocol,
        chain:     item.chain,
        chainName: item.chainName,
        asset:     item.asset,
        apyBps:    resolvedApy,
      };

      const newNode: Node = {
        id:       nextId(),
        type:     'protocol',
        position,
        data,
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [setNodes, apyMap],
  );

  // ── Edge connections ────────────────────────────────────────────────────────

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            animated: true,
            style: { stroke: '#6366f1', strokeWidth: 2 },
          },
          eds,
        ),
      );
    },
    [setEdges],
  );

  // ── Clear ───────────────────────────────────────────────────────────────────

  const onClear = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setError(null);
  }, [setNodes, setEdges]);

  // ── Run strategy ────────────────────────────────────────────────────────────

  const onRunStrategy = useCallback(async () => {
    setError(null);
    setIsRunning(true);

    try {
      // Derive strategy request from the composed graph
      const walletNode = nodes.find((n) => (n.data as ComposerNodeData).kind === 'wallet');
      const endNode = nodes.find((n) => {
        const d = n.data as ComposerNodeData;
        return d.kind === 'lend' || d.kind === 'stake';
      });

      if (!walletNode || !endNode) {
        setError('Add a wallet source and at least one lend/stake endpoint.');
        return;
      }

      const walletData = walletNode.data as ComposerNodeData;
      const endData = endNode.data as ComposerNodeData;

      const result = await api.strategy.optimize({
        sourceAsset:      walletData.asset,
        sourceChain:      walletData.chain,
        sourceAmountUsd:  10_000,   // default; user can adjust on the main form
        destinationChain: endData.chain,
        riskTolerance:    3,
        timeHorizonDays:  30,
      });

      setRoutes(result.routes, result.quoteExpiresAt);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to optimize strategy.');
    } finally {
      setIsRunning(false);
    }
  }, [nodes, setRoutes, router]);

  return (
    <div className="flex flex-col h-screen bg-gray-950">
      <ComposerToolbar
        nodes={nodes}
        edges={edges}
        onClear={onClear}
        onRunStrategy={onRunStrategy}
        isRunning={isRunning}
      />

      {error && (
        <div className="px-4 py-2 bg-red-900/40 border-b border-red-800 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <NodePalette onDragStart={onDragStart} />

        <div ref={reactFlowWrapper} className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDragOver={onDragOver}
            onDrop={onDrop}
            nodeTypes={nodeTypes}
            fitView
            className="bg-gray-950"
            defaultEdgeOptions={{
              animated: true,
              style: { stroke: '#6366f1', strokeWidth: 2 },
            }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={24}
              size={1}
              color="#374151"
            />
            <Controls className="[&>button]:bg-gray-800 [&>button]:border-gray-700 [&>button]:text-gray-300" />
            <MiniMap
              nodeColor={(n) => {
                const d = n.data as ComposerNodeData;
                return KIND_COLORS[d?.kind ?? 'wallet'] ?? '#6b7280';
              }}
              className="!bg-gray-900 !border-gray-800"
            />
          </ReactFlow>

          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center text-gray-600">
                <p className="text-4xl mb-3">⬡</p>
                <p className="text-sm font-medium">Drag protocols from the palette to start building</p>
                <p className="text-xs mt-1">Connect nodes to define the execution path</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
