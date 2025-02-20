import random
import time
import os

def generate_network_csv(num_nodes=1000, num_edges=3000, filename='test.csv', show_progress=True):
    """
    Generate a large network dataset in CSV format.
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
        if source != target:
            edge = (source, target)
            edges.add(edge)
        if show_progress and len(edges) % 1000 == 0:
            print(f"Generated {len(edges)}/{num_edges} edges...", end='\r')
    
    print("\nWriting to CSV file...")
    with open(filename, 'w') as f:
        # Write header
        f.write('source,target\n')
        for edge in edges:
            f.write(f'{edge[0]},{edge[1]}\n')
    
    end_time = time.time()
    file_size = os.path.getsize(filename) / (1024 * 1024)  # Size in MB
    print(f"\nNetwork generation completed!")
    print(f"Time taken: {end_time - start_time:.2f} seconds")
    print(f"File size: {file_size:.2f} MB")
    print(f"Output saved to: {filename}")

def generate_test_files():
    """Generate different sizes of test files."""
    generate_network_csv(num_nodes=100, num_edges=300, filename='test_small.csv')
    generate_network_csv(num_nodes=1000, num_edges=3000, filename='test_medium.csv')
    generate_network_csv(num_nodes=10000, num_edges=30000, filename='test_large.csv')
    generate_network_csv(num_nodes=100000, num_edges=300000, filename='test_xlarge.csv')

if __name__ == '__main__':
    generate_test_files()
