import random
import time
import os

def generate_network_csv(num_nodes=1000, num_edges=3000, filename='test.csv', show_progress=True):
    """
    Generate a large network dataset in CSV format.
    
    Parameters:
    - num_nodes: Number of nodes to generate
    - num_edges: Number of edges to generate
    - filename: Output filename
    - show_progress: Whether to show progress bar
    """
    
    print(f"Generating network with {num_nodes} nodes and {num_edges} edges...")
    start_time = time.time()
    
    # Generate node IDs
    nodes = [f"Node_{i}" for i in range(num_nodes)]
    
    # Create edges ensuring no duplicates and no self-loops
    edges = set()
    while len(edges) < num_edges:
        source = random.choice(nodes)
        target = random.choice(nodes)
        
        # Avoid self-loops
        if source != target:
            # Store edges as tuples to maintain order
            edge = (source, target)
            edges.add(edge)
        
        # Show progress
        if show_progress and len(edges) % 1000 == 0:
            print(f"Generated {len(edges)}/{num_edges} edges...", end='\r')
    
    # Write to CSV file
    print("\nWriting to CSV file...")
    with open(filename, 'w') as f:
        # Write header
        f.write('source,target\n')
        
        # Write edges
        for edge in edges:
            f.write(f'{edge[0]},{edge[1]}\n')
    
    end_time = time.time()
    file_size = os.path.getsize(filename) / (1024 * 1024)  # Size in MB
    
    print(f"\nNetwork generation completed!")
    print(f"Time taken: {end_time - start_time:.2f} seconds")
    print(f"File size: {file_size:.2f} MB")
    print(f"Output saved to: {filename}")

def generate_test_files():
    """Generate different sizes of test files"""
    
    # Small test file (good for initial testing)
    generate_network_csv(
        num_nodes=100,
        num_edges=300,
        filename='test_small.csv'
    )
    
    # Medium test file
    generate_network_csv(
        num_nodes=1000,
        num_edges=3000,
        filename='test_medium.csv'
    )
    
    # Large test file (good for testing chunked processing)
    generate_network_csv(
        num_nodes=10000,
        num_edges=30000,
        filename='test_large.csv'
    )
    
    # Extra large test file (good for testing performance)
    generate_network_csv(
        num_nodes=100000,
        num_edges=300000,
        filename='test_xlarge.csv'
    )

if __name__ == '__main__':
    # You can either generate all test files
    generate_test_files()
    
    # Or generate a custom size network by uncommenting and modifying below:
    """
    generate_network_csv(
        num_nodes=50000,    # Number of nodes
        num_edges=150000,   # Number of edges
        filename='custom_test.csv'  # Output filename
    )
    """