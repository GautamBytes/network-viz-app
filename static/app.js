let cy;
let fullNetwork = { nodes: [], edges: [] };
let currentSubgraph = null; // to store the last queried subgraph

// Calculate network statistics
function calculateNetworkStats(nodes, edges) {
  const nodeCount = nodes.length;
  const edgeCount = edges.length;
  let avgDegree = nodeCount > 0 ? (2 * edgeCount) / nodeCount : 0;
  avgDegree = avgDegree.toFixed(2);

  const adjacency = new Map();
  nodes.forEach(n => adjacency.set(n.data.id, []));
  edges.forEach(e => {
    const { source, target } = e.data;
    adjacency.get(source).push(target);
    adjacency.get(target).push(source);
  });

  let components = 0;
  const visited = new Set();
  function bfs(startId) {
    const queue = [startId];
    visited.add(startId);
    while (queue.length) {
      const current = queue.shift();
      const neighbors = adjacency.get(current) || [];
      neighbors.forEach(nbr => {
        if (!visited.has(nbr)) {
          visited.add(nbr);
          queue.push(nbr);
        }
      });
    }
  }
  nodes.forEach(node => {
    if (!visited.has(node.data.id)) {
      components++;
      bfs(node.data.id);
    }
  });

  return { nodeCount, edgeCount, avgDegree, components };
}

// File upload with chunked processing
function handleFileUpload() {
  const fileInput = document.getElementById('fileInput');
  const file = fileInput.files[0];
  if (!file) {
    showError('Please select a file first');
    return;
  }

  const progressContainer = document.getElementById('progressContainer');
  const progressBar = document.getElementById('progressBar');
  progressContainer.style.display = 'block';
  progressBar.style.width = '0%';

  const CHUNK_SIZE = 1024 * 1024;
  let offset = 0, partialLine = '';
  const nodes = new Set();
  const edges = [];
  let headerProcessed = false, delimiter, sourceIdx, targetIdx;

  function processChunk(chunk) {
    const content = partialLine + chunk;
    const lines = content.split('\n');
    partialLine = lines.pop() || '';
    const format = file.name.split('.').pop().toLowerCase();
    try {
      switch (format) {
        case 'sif':
          processChunkSIF(lines, nodes, edges);
          break;
        case 'tsv':
        case 'txt':
        case 'csv':
          if (!headerProcessed) {
            const headerInfo = processHeader(lines[0], format);
            delimiter = headerInfo.delimiter;
            sourceIdx = headerInfo.sourceIdx;
            targetIdx = headerInfo.targetIdx;
            headerProcessed = true;
            lines.shift();
          }
          processChunkTSV(lines, nodes, edges, delimiter, sourceIdx, targetIdx);
          break;
        default:
          throw new Error('Unsupported file format. Use .csv, .tsv, .txt, or .sif');
      }
    } catch (error) {
      showError(error.message);
      progressContainer.style.display = 'none';
      return;
    }
  }

  function readNextChunk() {
    if (offset >= file.size) {
      if (partialLine.trim()) processChunk(partialLine);
      const nodeArray = Array.from(nodes).map(id => ({ data: { id } }));
      fullNetwork = { nodes: nodeArray, edges };
      clearError();
      progressContainer.style.display = 'none';
      if (nodeArray.length > 5000 || edges.length > 10000) {
        showError("Large network loaded (" + nodeArray.length + " nodes, " + edges.length + " edges). Please query a subgraph.");
      } else {
        showNetwork(nodeArray, edges);
      }
      return;
    }
    const reader = new FileReader();
    const blob = file.slice(offset, offset + CHUNK_SIZE);
    reader.onload = function(e) {
      processChunk(e.target.result);
      offset += CHUNK_SIZE;
      const progressPercent = Math.min((offset / file.size) * 100, 100);
      progressBar.style.width = progressPercent + '%';
      readNextChunk();
    };
    reader.onerror = function() {
      showError('Error reading file chunk');
      progressContainer.style.display = 'none';
    };
    reader.readAsText(blob);
  }
  readNextChunk();
}

function processHeader(headerLine, format) {
  const delimiter = format === 'csv' ? ',' : '\t';
  const header = headerLine.toLowerCase().split(delimiter).map(h => h.trim());
  const sourceIdx = header.indexOf('source');
  const targetIdx = header.indexOf('target');
  if (sourceIdx === -1 || targetIdx === -1) {
    throw new Error('Invalid format: header must contain "source" and "target" columns.');
  }
  return { delimiter, sourceIdx, targetIdx };
}

function processChunkTSV(lines, nodes, edges, delimiter, sourceIdx, targetIdx) {
  lines.forEach((line, lineNum) => {
    if (!line.trim()) return;
    const parts = line.split(delimiter).map(part => part.trim());
    if (parts.length < Math.max(sourceIdx, targetIdx) + 1) {
      console.warn(`Skipping incomplete line ${lineNum + 1}`);
      return;
    }
    const source = parts[sourceIdx], target = parts[targetIdx];
    if (source && target) {
      nodes.add(source);
      nodes.add(target);
      edges.push({ data: { id: `e${edges.length}`, source, target } });
    }
  });
}

function processChunkSIF(lines, nodes, edges) {
  lines.forEach((line, lineNum) => {
    if (!line.trim()) return;
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) {
      console.warn(`Skipping invalid SIF line ${lineNum + 1}`);
      return;
    }
    const source = parts[0], interaction = parts[1], targets = parts.slice(2);
    if (!source || targets.some(target => !target)) {
      console.warn(`Skipping line ${lineNum + 1} with empty node identifier`);
      return;
    }
    nodes.add(source);
    targets.forEach(target => {
      nodes.add(target);
      edges.push({ data: { id: `e${edges.length}`, source, target, interaction } });
    });
  });
}

// Display network using Cytoscape.js
function showNetwork(nodes, edges, highlightColor = null) {
  if (cy) { cy.destroy(); }
  
  // Build the style rules dynamically
  const style = getComputedStyle(document.body);
  const nodeColor = style.getPropertyValue('--node-color').trim();
  const edgeColor = style.getPropertyValue('--edge-color').trim();
  const selectedColor = style.getPropertyValue('--selected-color').trim();
  
  let styleRules = [
    {
      selector: 'node',
      style: {
        'label': 'data(id)',
        'background-color': nodeColor,
        'color': '#fff',
        'text-outline-color': nodeColor,
        'text-outline-width': 2,
        'font-size': '12px',
        'text-valign': 'center',
        'text-halign': 'center'
      }
    },
    {
      selector: 'edge',
      style: {
        'width': 2,
        'line-color': edgeColor,
        'curve-style': 'bezier',
        'target-arrow-shape': 'triangle',
        'target-arrow-color': edgeColor,
        'arrow-scale': 1
      }
    },
    {
      selector: 'node:selected',
      style: {
        'background-color': selectedColor,
        'text-outline-color': selectedColor
      }
    },
    {
      selector: 'edge:selected',
      style: {
        'line-color': selectedColor,
        'target-arrow-color': selectedColor
      }
    }
  ];

  // Only add the subgraph rule if a valid highlightColor is provided.
  if (highlightColor && highlightColor !== '') {
    styleRules.splice(2, 0, {
      selector: '[subgraph = "true"]',
      style: {
        'background-color': highlightColor,
        'line-color': highlightColor,
        'target-arrow-color': highlightColor,
        'text-outline-color': highlightColor
      }
    });
  }

  // If a highlight color is provided, mark these elements.
  if (highlightColor) {
    nodes.forEach(n => n.data.subgraph = "true");
    edges.forEach(e => e.data.subgraph = "true");
  }

  // Update statistics
  const stats = calculateNetworkStats(nodes, edges);
  document.getElementById('nodeCount').textContent = stats.nodeCount;
  document.getElementById('edgeCount').textContent = stats.edgeCount;
  document.getElementById('avgDegree').textContent = stats.avgDegree;
  document.getElementById('components').textContent = stats.components;

  cy = cytoscape({
    container: document.getElementById('cy'),
    elements: { nodes, edges },
    style: styleRules,
    layout: { name: 'grid' },
    wheelSensitivity: 0.2
  });

  // Show node details on double-tap
  cy.on('dbltap', 'node', function(evt) {
    const node = evt.target;
    handleNodeSelection(node.id());
  });

  applyLayout(document.getElementById('layoutSelect').value);
}

// Apply selected layout
function applyLayout(layoutName) {
  if (!cy) return;
  const layoutOptions = {
    name: layoutName,
    animate: true,
    animationDuration: 500,
    randomize: true,
    padding: 30
  };
  if (layoutName === 'cose') {
    layoutOptions.nodeRepulsion = 8000;
    layoutOptions.idealEdgeLength = 100;
    layoutOptions.edgeElasticity = 100;
  } else if (layoutName === 'circle' || layoutName === 'grid') {
    layoutOptions.spacingFactor = 1.5;
  }
  cy.layout(layoutOptions).run();
}

// Handle query: extract subgraph, apply highlight color, and display it.
function handleQuery() {
  showSpinner();
  const queryInput = document.getElementById('queryInput');
  const query = queryInput.value.trim();
  if (!query) {
    showError('Please enter node IDs to query');
    hideSpinner();
    return;
  }
  const queryNodes = query.split(/[\s,]+/).filter(n => n);
  if (queryNodes.length === 0) {
    showError('No valid node IDs entered');
    hideSpinner();
    return;
  }
  const subgraph = extractSubgraph(queryNodes);
  if (subgraph.nodes.length === 0) {
    showError('No matching nodes found in the network');
    hideSpinner();
    return;
  }
  currentSubgraph = subgraph;
  const highlightColor = document.getElementById('highlightColor').value;
  showNetwork(subgraph.nodes, subgraph.edges, highlightColor);
  clearError();
  hideSpinner();
}

// Extract subgraph based on query nodes (first-degree neighbors)
function extractSubgraph(queryNodes) {
  const querySet = new Set(queryNodes);
  const neighborNodes = new Set(queryNodes);
  const neighborEdges = [];
  fullNetwork.edges.forEach(edge => {
    const { source, target } = edge.data;
    if (querySet.has(source) || querySet.has(target)) {
      neighborEdges.push(edge);
      neighborNodes.add(source);
      neighborNodes.add(target);
    }
  });
  const subNodes = fullNetwork.nodes.filter(node => neighborNodes.has(node.data.id));
  return { nodes: subNodes, edges: neighborEdges };
}

// Export current subgraph as CSV
function exportCurrentSubgraph() {
  if (!currentSubgraph) {
    showError("No subgraph to export. Please query first.");
    return;
  }
  exportSubgraph(currentSubgraph.nodes, currentSubgraph.edges);
}

function exportSubgraph(nodes, edges) {
  let csvContent = "source,target\n";
  edges.forEach(e => {
    csvContent += e.data.source + "," + e.data.target + "\n";
  });
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = "subgraph.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Error handling with longer display time
function showError(message) {
  const errorDiv = document.getElementById('errorMessage');
  errorDiv.textContent = message;
  errorDiv.classList.add('show');
  errorDiv.style.display = 'block';
  setTimeout(clearError, 8000);
}

function clearError() {
  const errorDiv = document.getElementById('errorMessage');
  errorDiv.classList.remove('show');
  setTimeout(() => {
    errorDiv.style.display = 'none';
    errorDiv.textContent = '';
  }, 1000);
}

// Spinner functions
function showSpinner() {
  document.getElementById('spinner').style.display = 'block';
}

function hideSpinner() {
  document.getElementById('spinner').style.display = 'none';
}

// Node Details Panel: display node info on double-tap.
function handleNodeSelection(nodeId) {
  const node = cy.getElementById(nodeId);
  if (!node) return;
  const neighbors = node.neighborhood('node');
  const degree = neighbors.size();
  let infoHtml = `<p><strong>ID:</strong> ${nodeId}</p>`;
  infoHtml += `<p><strong>Degree:</strong> ${degree}</p>`;
  if (degree > 0) {
    infoHtml += `<p><strong>Neighbors:</strong></p><ul>`;
    neighbors.forEach(n => {
      infoHtml += `<li>${n.id()}</li>`;
    });
    infoHtml += `</ul>`;
  }
  document.getElementById('nodeInfo').innerHTML = infoHtml;
  document.getElementById('nodeDetails').style.display = 'block';
}

function closeNodeDetails() {
  document.getElementById('nodeDetails').style.display = 'none';
}

// Toggle Dark Mode
function toggleDarkMode() {
  const body = document.getElementById('body');
  body.classList.toggle('dark-mode');
  if (cy) {
    const elements = cy.elements();
    // Reapply style to reflect new CSS variables
    showNetwork(elements.nodes().jsons(), elements.edges().jsons());
  }
}








