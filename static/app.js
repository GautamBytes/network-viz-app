let cy;
let fullNetwork = { nodes: [], edges: [] };

// Calculate network statistics efficiently
function calculateNetworkStats(nodes, edges) {
    const nodeCount = nodes.length;
    const edgeCount = edges.length;

    // Average degree = (2 * E) / V
    let avgDegree = 0;
    if (nodeCount > 0) {
        avgDegree = (2 * edgeCount) / nodeCount;
    }
    avgDegree = avgDegree.toFixed(2);

    // 1) Build adjacency list
    const adjacency = new Map();
    nodes.forEach(n => {
        adjacency.set(n.data.id, []);
    });
    edges.forEach(e => {
        const src = e.data.source;
        const tgt = e.data.target;
        adjacency.get(src).push(tgt);
        adjacency.get(tgt).push(src);
    });

    // 2) Find connected components with an iterative BFS
    let components = 0;
    const visited = new Set();

    function bfs(startId) {
        const queue = [startId];
        visited.add(startId);

        while (queue.length > 0) {
            const current = queue.shift();
            const neighbors = adjacency.get(current) || [];
            for (const nbr of neighbors) {
                if (!visited.has(nbr)) {
                    visited.add(nbr);
                    queue.push(nbr);
                }
            }
        }
    }

    for (const node of nodes) {
        const nodeId = node.data.id;
        if (!visited.has(nodeId)) {
            components++;
            bfs(nodeId);
        }
    }

    return {
        nodeCount,
        edgeCount,
        avgDegree,
        components
    };
}

// Handle file upload with chunked processing
function handleFileUpload() {
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];
    if (!file) {
        showError('Please select a file first');
        return;
    }

    const CHUNK_SIZE = 1024 * 1024; // 1MB chunks
    let offset = 0;
    let partialLine = '';
    const nodes = new Set();
    const edges = [];
    let headerProcessed = false;
    let delimiter;
    let sourceIdx, targetIdx;

    function processChunk(chunk) {
        const content = partialLine + chunk;
        const lines = content.split('\n');
        partialLine = lines.pop() || ''; // Save the last partial line

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
                        lines.shift(); // remove header from lines
                    }
                    processChunkTSV(lines, nodes, edges, delimiter, sourceIdx, targetIdx);
                    break;
                default:
                    throw new Error('Unsupported file format. Please use .csv, .tsv, .txt, or .sif files');
            }
        } catch (error) {
            showError(error.message);
            return;
        }
    }

    function processHeader(headerLine, format) {
        const delimiter = format === 'csv' ? ',' : '\t';
        const header = headerLine.toLowerCase().split(delimiter).map(h => h.trim());
        
        const sourceIdx = header.indexOf('source');
        const targetIdx = header.indexOf('target');
        
        if (sourceIdx === -1 || targetIdx === -1) {
            throw new Error('Invalid format: missing source or target columns. Header must contain "source" and "target" columns.');
        }

        return { delimiter, sourceIdx, targetIdx };
    }

    function readNextChunk() {
        if (offset >= file.size) {
            // Process the last partial line if any
            if (partialLine.trim()) {
                processChunk(partialLine);
            }
            
            // Convert nodes Set to array of node objects
            const nodeArray = Array.from(nodes).map(id => ({ data: { id } }));
            fullNetwork = { nodes: nodeArray, edges };

            // IMPORTANT: Skip rendering the full network if it's large
            clearError();
            if (nodeArray.length > 5000 || edges.length > 10000) {
                showError(
                    "Large network loaded in memory (" +
                    nodeArray.length + " nodes, " +
                    edges.length + " edges). " +
                    "Please query a subgraph below."
                );
            } else {
                // If it's small enough, show the full network
                showNetwork(nodeArray, edges);
            }
            return;
        }

        const reader = new FileReader();
        const blob = file.slice(offset, offset + CHUNK_SIZE);
        
        reader.onload = function(e) {
            processChunk(e.target.result);
            offset += CHUNK_SIZE;
            readNextChunk();
        };

        reader.onerror = function() {
            showError('Error reading file chunk');
        };

        reader.readAsText(blob);
    }

    readNextChunk();
}

function processChunkTSV(lines, nodes, edges, delimiter, sourceIdx, targetIdx) {
    lines.forEach((line, lineNum) => {
        if (!line.trim()) return;
        
        const parts = line.split(delimiter).map(part => part.trim());
        if (parts.length < Math.max(sourceIdx, targetIdx) + 1) {
            console.warn(`Skipping incomplete line ${lineNum + 1}`);
            return;
        }

        const source = parts[sourceIdx];
        const target = parts[targetIdx];

        if (source && target) {
            nodes.add(source);
            nodes.add(target);
            edges.push({
                data: {
                    id: `e${edges.length}`,
                    source,
                    target
                }
            });
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

        const source = parts[0];
        const interaction = parts[1];
        const targets = parts.slice(2);

        if (!source || targets.some(target => !target)) {
            console.warn(`Skipping line ${lineNum + 1} with empty node identifier`);
            return;
        }

        nodes.add(source);
        targets.forEach(target => {
            nodes.add(target);
            edges.push({
                data: {
                    id: `e${edges.length}`,
                    source,
                    target,
                    interaction
                }
            });
        });
    });
}

// Display network using Cytoscape.js
function showNetwork(nodes, edges) {
    if (cy) {
        cy.destroy();
    }

    // Calculate and update statistics
    const stats = calculateNetworkStats(nodes, edges);
    document.getElementById('nodeCount').textContent = stats.nodeCount;
    document.getElementById('edgeCount').textContent = stats.edgeCount;
    document.getElementById('avgDegree').textContent = stats.avgDegree;
    document.getElementById('components').textContent = stats.components;

    cy = cytoscape({
        container: document.getElementById('cy'),
        elements: { nodes, edges },
        style: [
            {
                selector: 'node',
                style: {
                    'label': 'data(id)',
                    'background-color': '#666',
                    'color': '#fff',
                    'text-outline-color': '#666',
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
                    'line-color': '#999',
                    'curve-style': 'bezier',
                    'target-arrow-shape': 'triangle',
                    'target-arrow-color': '#999',
                    'arrow-scale': 1
                }
            },
            {
                selector: 'node:selected',
                style: {
                    'background-color': '#ff0000',
                    'text-outline-color': '#ff0000'
                }
            },
            {
                selector: 'edge:selected',
                style: {
                    'line-color': '#ff0000',
                    'target-arrow-color': '#ff0000'
                }
            }
        ],
        layout: { name: 'grid' },
        wheelSensitivity: 0.2
    });

    // Use 'dbltap' for a double-click gesture in Cytoscape
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

    // Add specific options for different layouts
    switch (layoutName) {
        case 'cose':
            layoutOptions.nodeRepulsion = 8000;
            layoutOptions.idealEdgeLength = 100;
            layoutOptions.edgeElasticity = 100;
            break;
        case 'circle':
        case 'grid':
            layoutOptions.spacingFactor = 1.5;
            break;
    }

    const layout = cy.layout(layoutOptions);
    layout.run();
}

// Handle node query
function handleQuery() {
    const queryInput = document.getElementById('queryInput');
    const query = queryInput.value.trim();
    if (!query) {
        showError('Please enter node IDs to query');
        return;
    }

    const queryNodes = query.split(/[\s,]+/).filter(node => node);
    if (queryNodes.length === 0) {
        showError('No valid node IDs entered');
        return;
    }

    const { nodes: subNodes, edges: subEdges } = extractSubgraph(queryNodes);
    if (subNodes.length === 0) {
        showError('No matching nodes found in the network');
        return;
    }

    showNetwork(subNodes, subEdges);
    clearError();
}

// Extract subgraph based on query nodes (first-degree neighbors)
function extractSubgraph(queryNodes) {
    const querySet = new Set(queryNodes);
    const neighborNodes = new Set(queryNodes);
    const neighborEdges = [];

    // Find all edges connected to query nodes and their neighbors
    fullNetwork.edges.forEach(edge => {
        const source = edge.data.source;
        const target = edge.data.target;
        if (querySet.has(source) || querySet.has(target)) {
            neighborEdges.push(edge);
            neighborNodes.add(source);
            neighborNodes.add(target);
        }
    });

    // Get all nodes in the subgraph
    const subNodes = fullNetwork.nodes.filter(node => neighborNodes.has(node.data.id));
    return { nodes: subNodes, edges: neighborEdges };
}

// Optional: Show entire network on a separate button
function handleShowFullNetwork() {
    if (!fullNetwork.nodes || fullNetwork.nodes.length === 0) {
        showError("No network loaded yet.");
        return;
    }
    showNetwork(fullNetwork.nodes, fullNetwork.edges);
    clearError();
}

// Error handling
function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

function clearError() {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.style.display = 'none';
    errorDiv.textContent = '';
}

// Example: define your custom logic for double-tapped nodes
function handleNodeSelection(nodeId) {
    console.log("Double-tapped node:", nodeId);
    // Insert any custom logic here, e.g., highlight neighbors, open a panel, etc.
}



