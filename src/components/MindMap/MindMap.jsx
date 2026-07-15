// src/components/MindMap/MindMap.jsx
import React from 'react';
import ReactFlow, { Background, Controls, MiniMap } from 'reactflow';
import 'reactflow/dist/style.css';

const MindMap = ({ coreAreas, techIcons }) => {
  // Construir nodos: un nodo por categoría y sus tecnologías
  const nodes = [];
  const edges = [];

  // Nodo central
  const centerId = 'center';
  nodes.push({
    id: centerId,
    data: { label: 'Habilidades' },
    position: { x: 400, y: 50 },
    style: { background: 'rgba(0, 255, 204, 0.2)', border: '2px solid #00FFCC', borderRadius: '50%', width: 100, height: 100, textAlign: 'center' }
  });

  // Posicionar categorías en anillo alrededor del centro
  const radius = 250;
  const angleStep = (2 * Math.PI) / coreAreas.length;
  coreAreas.forEach((area, index) => {
    const angle = index * angleStep - Math.PI / 2;
    const x = 400 + radius * Math.cos(angle);
    const y = 250 + radius * Math.sin(angle);
    const nodeId = `cat-${index}`;
    nodes.push({
      id: nodeId,
      data: { label: `${area.icon} ${area.title}` },
      position: { x, y },
      style: { background: 'rgba(255, 255, 255, 0.05)', border: '1px solid #FF79C6', borderRadius: '8px', padding: '10px' }
    });
    // Conectar centro → categoría
    edges.push({
      id: `e-${centerId}-${nodeId}`,
      source: centerId,
      target: nodeId,
      animated: true,
      style: { stroke: '#00FFCC' }
    });

    // Posicionar tecnologías alrededor de su categoría
    const techRadius = 120;
    const techStep = (2 * Math.PI) / (area.items.length || 1);
    area.items.forEach((tech, techIndex) => {
      const techAngle = techIndex * techStep;
      const techX = x + techRadius * Math.cos(techAngle);
      const techY = y + techRadius * Math.sin(techAngle);
      const techId = `tech-${index}-${techIndex}`;
      nodes.push({
        id: techId,
        data: { label: tech },
        position: { x: techX, y: techY },
        style: { background: 'rgba(0, 0, 0, 0.3)', border: '1px solid #50FA7B', borderRadius: '20px', padding: '5px 10px' }
      });
      edges.push({
        id: `e-${nodeId}-${techId}`,
        source: nodeId,
        target: techId,
        style: { stroke: '#50FA7B', strokeDasharray: '5,5' }
      });
    });
  });

  return (
    <div style={{ height: '600px', width: '100%' }}>
      <ReactFlow nodes={nodes} edges={edges} fitView>
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
};

export default MindMap;