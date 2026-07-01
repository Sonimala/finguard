import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { GraphNode, GraphLink } from "../types";

interface NetworkGraphProps {
  graphData: { nodes: GraphNode[]; links: GraphLink[] };
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  selectedLinkId: { source: string; target: string } | null;
  onSelectLink: (source: string, target: string) => void;
}

export default function NetworkGraph({
  graphData,
  selectedNodeId,
  onSelectNode,
  selectedLinkId,
  onSelectLink,
}: NetworkGraphProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 450 });

  // Handle Container Resizing
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      setDimensions({
        width: Math.max(width, 400),
        height: Math.max(height || 450, 400),
      });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current || !graphData.nodes.length) return;

    const { width, height } = dimensions;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // Clear previous layouts

    // Define defs for arrowheads and gradients
    const defs = svg.append("defs");

    // standard arrow marker
    defs.append("marker")
      .attr("id", "arrow-standard")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 22) // Place marker just before the node boundary
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#475569");

    // suspicious glowing red arrow marker
    defs.append("marker")
      .attr("id", "arrow-suspicious")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 22)
      .attr("refY", 0)
      .attr("markerWidth", 8)
      .attr("markerHeight", 8)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#ef4444");

    // selected highlight marker
    defs.append("marker")
      .attr("id", "arrow-selected")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 22)
      .attr("refY", 0)
      .attr("markerWidth", 8)
      .attr("markerHeight", 8)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#3b82f6");

    // Convert data to d3 model
    const nodes = graphData.nodes.map((d) => ({ ...d }));
    const links = graphData.links.map((d) => ({
      ...d,
      source: d.source,
      target: d.target,
    }));

    // Setup force simulation
    const simulation = d3.forceSimulation<any>(nodes)
      .force("link", d3.forceLink<any, any>(links).id((d) => d.id).distance(120))
      .force("charge", d3.forceManyBody().strength(-250))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(25));

    // Draw lines (links)
    const link = svg.append("g")
      .selectAll("line")
      .data(links)
      .enter()
      .append("line")
      .attr("stroke", (d: any) => {
        const isSel = selectedLinkId && 
          ((typeof d.source === "object" ? d.source.id : d.source) === selectedLinkId.source &&
           (typeof d.target === "object" ? d.target.id : d.target) === selectedLinkId.target);
        if (isSel) return "#3b82f6";
        return d.isSuspicious ? "#ef4444" : "#334155";
      })
      .attr("stroke-width", (d: any) => (d.isSuspicious ? 3 : 1.5))
      .attr("stroke-dasharray", (d: any) => (d.isSuspicious ? "4, 2" : "none"))
      .attr("marker-end", (d: any) => {
        const isSel = selectedLinkId && 
          ((typeof d.source === "object" ? d.source.id : d.source) === selectedLinkId.source &&
           (typeof d.target === "object" ? d.target.id : d.target) === selectedLinkId.target);
        if (isSel) return "url(#arrow-selected)";
        return d.isSuspicious ? "url(#arrow-suspicious)" : "url(#arrow-standard)";
      })
      .style("cursor", "pointer")
      .on("click", (event, d: any) => {
        event.stopPropagation();
        const sId = typeof d.source === "object" ? d.source.id : d.source;
        const tId = typeof d.target === "object" ? d.target.id : d.target;
        onSelectLink(sId, tId);
      });

    // Draw dots (nodes)
    const node = svg.append("g")
      .selectAll("g")
      .data(nodes)
      .enter()
      .append("g")
      .call(d3.drag<any, any>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended))
      .on("click", (event, d) => {
        event.stopPropagation();
        onSelectNode(d.id === selectedNodeId ? null : d.id);
      })
      .style("cursor", "grab");

    // Circle background / glow
    node.append("circle")
      .attr("r", (d: any) => (d.id === selectedNodeId ? 14 : 10))
      .attr("fill", (d: any) => {
        switch (d.type) {
          case "Business": return "#3b82f6"; // Blue
          case "Personal": return "#64748b"; // Slate
          case "Mule Account": return "#f97316"; // Orange
          case "Shell Company": return "#ef4444"; // Red
          case "Offshore": return "#a855f7"; // Purple
          default: return "#94a3b8";
        }
      })
      .attr("stroke", (d: any) => {
        if (d.id === selectedNodeId) return "#ffffff";
        if (d.status === "Frozen") return "#38bdf8"; // Frozen Ice Blue
        if (d.status === "EDD") return "#fbbf24"; // EDD Amber
        return "#0f172a";
      })
      .attr("stroke-width", (d: any) => {
        if (d.id === selectedNodeId) return 3.5;
        if (d.status === "Frozen" || d.status === "EDD") return 3;
        return 1.5;
      })
      .style("filter", (d: any) => {
        if (d.status === "Frozen") return "drop-shadow(0px 0px 8px rgba(56, 189, 248, 0.8))";
        if (d.status === "EDD") return "drop-shadow(0px 0px 8px rgba(251, 191, 36, 0.8))";
        if (d.riskScore > 0.6) return "drop-shadow(0px 0px 6px rgba(239, 68, 68, 0.8))";
        return "none";
      });

    // Quick risk indicators inside circle
    node.append("circle")
      .attr("r", 3)
      .attr("fill", "#0f172a")
      .attr("cx", 0)
      .attr("cy", 0)
      .style("opacity", (d: any) => (d.riskScore > 0.5 ? 1 : 0));

    // Labels for nodes
    node.append("text")
      .attr("dy", 22)
      .attr("text-anchor", "middle")
      .text((d: any) => {
        if (d.status === "Frozen") return `❄️ ${d.name}`;
        if (d.status === "EDD") return `⚠️ ${d.name}`;
        return d.name;
      })
      .attr("fill", (d: any) => {
        if (d.id === selectedNodeId) return "#ffffff";
        if (d.status === "Frozen") return "#38bdf8";
        if (d.status === "EDD") return "#fbbf24";
        return "#94a3b8";
      })
      .style("font-size", "11px")
      .style("font-family", "system-ui, sans-serif")
      .style("font-weight", (d: any) => (d.id === selectedNodeId || d.status === "Frozen" || d.status === "EDD" ? "bold" : "normal"))
      .style("user-select", "none")
      .style("pointer-events", "none");

    // Mini sublabels (Country or Type)
    node.append("text")
      .attr("dy", 33)
      .attr("text-anchor", "middle")
      .text((d) => `${d.id} (${d.country})`)
      .attr("fill", "#475569")
      .style("font-size", "9px")
      .style("font-family", "monospace")
      .style("user-select", "none")
      .style("pointer-events", "none");

    // Dynamic tick updates
    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node.attr("transform", (d: any) => `translate(calc(${d.x}px), calc(${d.y}px))`);
    });

    // Drag-and-drop mechanics
    function dragstarted(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: any, d: any) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    return () => {
      simulation.stop();
    };
  }, [graphData, selectedNodeId, selectedLinkId, dimensions]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full min-h-[400px] bg-slate-950 border border-slate-900 rounded-xl overflow-hidden flex flex-col justify-between"
      style={{ boxShadow: "inset 0px 0px 20px rgba(0,0,0,0.8)" }}
    >
      {/* Top Legend Overlay */}
      <div className="absolute top-4 left-4 z-10 bg-slate-900/90 backdrop-blur-md px-3 py-2.5 rounded-lg border border-slate-800 flex flex-col gap-1.5 text-xs">
        <span className="text-slate-400 font-semibold mb-1">Entity Categories</span>
        <div className="flex items-center gap-2 text-slate-300">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
          <span>Business Account</span>
        </div>
        <div className="flex items-center gap-2 text-slate-300">
          <span className="w-2.5 h-2.5 rounded-full bg-slate-500"></span>
          <span>Personal Account</span>
        </div>
        <div className="flex items-center gap-2 text-slate-300">
          <span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span>
          <span>Mule Account</span>
        </div>
        <div className="flex items-center gap-2 text-slate-300">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
          <span>Shell Company</span>
        </div>
        <div className="flex items-center gap-2 text-slate-300">
          <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
          <span>Offshore Entity</span>
        </div>
      </div>

      {/* Instructions / Help */}
      <div className="absolute bottom-4 left-4 z-10 bg-slate-900/80 backdrop-blur-sm px-2.5 py-1.5 rounded border border-slate-800 text-[10px] text-slate-400">
        🖱️ Drag nodes to organize • Click nodes/links to focus.
      </div>

      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        className="w-full h-full block"
      />
    </div>
  );
}
